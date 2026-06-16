use aes_gcm_siv::{
    aead::{Aead, KeyInit},
    Aes256GcmSiv, Nonce,
};
use base32::Alphabet;
use base64::Engine as _;
use chrono::{Duration, Utc};
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};
use totp_rs::{Algorithm, Secret, TOTP};
use uuid::Uuid;

use crate::bootstrap::config::AppConfig;
use crate::modules::identity::repository::IdentityRepository;
use crate::shared::error::AppError;
use crate::shared::redirect::normalize_redirect_uri;

use super::models::MfaChallenge;
use super::repository::MfaRepository;

#[derive(serde::Serialize, serde::Deserialize)]
struct EnrollPayload {
    secret_encrypted: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct LoginPayload {
    redirect_uri: Option<String>,
    primary_method: String,
    provider: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct LoginEnrollmentPayload {
    secret_encrypted: String,
    redirect_uri: Option<String>,
    primary_method: String,
    provider: Option<String>,
}

pub struct TotpEnrollmentStart {
    pub challenge: MfaChallenge,
    pub secret: String,
    pub otpauth_uri: String,
}

pub struct MfaLoginChallenge {
    pub challenge: MfaChallenge,
}

pub struct MfaLoginResult {
    pub user_id: Uuid,
    pub redirect_uri: Option<String>,
    pub used_backup_code: bool,
    pub primary_method: String,
    pub provider: Option<String>,
}

pub struct MfaLoginContext {
    pub user_id: Uuid,
    pub redirect_uri: Option<String>,
    pub primary_method: String,
    pub provider: Option<String>,
}

pub struct MfaLoginEnrollmentStart {
    pub challenge: MfaChallenge,
    pub secret: String,
    pub otpauth_uri: String,
}

pub struct MfaLoginEnrollmentContext {
    pub user_id: Uuid,
    pub redirect_uri: Option<String>,
    pub primary_method: String,
    pub provider: Option<String>,
    pub secret: String,
    pub otpauth_uri: String,
}

pub struct MfaLoginEnrollmentResult {
    pub user_id: Uuid,
    pub redirect_uri: Option<String>,
    pub primary_method: String,
    pub provider: Option<String>,
    pub recovery_codes: Vec<String>,
}

pub struct RecoveryCodeSet {
    pub codes: Vec<String>,
    pub remaining: i64,
}

pub struct MfaService {
    repo: MfaRepository,
    identity_repo: IdentityRepository,
    config: AppConfig,
}

impl MfaService {
    pub fn new(repo: MfaRepository, identity_repo: IdentityRepository, config: AppConfig) -> Self {
        Self {
            repo,
            identity_repo,
            config,
        }
    }

    pub async fn totp_status(&self, user_id: Uuid) -> Result<(bool, i64), AppError> {
        let enabled = self.repo.get_totp_method(user_id).await?.is_some();
        let remaining = self.repo.count_remaining_backup_codes(user_id).await?;
        Ok((enabled, remaining))
    }

    pub async fn start_totp_enrollment(
        &self,
        user_id: Uuid,
    ) -> Result<TotpEnrollmentStart, AppError> {
        let (secret, encrypted, otpauth_uri) = self.build_totp_enrollment(user_id).await?;

        let challenge = self
            .repo
            .create_challenge(
                user_id,
                None,
                "totp",
                "enroll",
                serde_json::to_value(EnrollPayload {
                    secret_encrypted: encrypted,
                })
                .map_err(|e| {
                    AppError::Internal(format!("Failed to serialize MFA enrollment payload: {}", e))
                })?,
                Utc::now() + Duration::minutes(10),
            )
            .await?;

        Ok(TotpEnrollmentStart {
            challenge,
            secret,
            otpauth_uri,
        })
    }

    pub async fn start_login_enrollment(
        &self,
        user_id: Uuid,
        redirect_uri: Option<String>,
        primary_method: &str,
        provider: Option<&str>,
    ) -> Result<MfaLoginEnrollmentStart, AppError> {
        if self.repo.get_totp_method(user_id).await?.is_some() {
            return Err(AppError::Validation(
                "TOTP MFA is already enabled for this account".into(),
            ));
        }

        let (secret, secret_encrypted, otpauth_uri) = self.build_totp_enrollment(user_id).await?;
        let challenge = self
            .repo
            .create_challenge(
                user_id,
                None,
                "totp",
                "login_enroll",
                serde_json::to_value(LoginEnrollmentPayload {
                    secret_encrypted,
                    redirect_uri: normalize_redirect_uri(redirect_uri)?,
                    primary_method: primary_method.to_string(),
                    provider: provider.map(str::to_string),
                })
                .map_err(|e| {
                    AppError::Internal(format!(
                        "Failed to serialize MFA login enrollment payload: {}",
                        e
                    ))
                })?,
                Utc::now() + Duration::minutes(10),
            )
            .await?;

        Ok(MfaLoginEnrollmentStart {
            challenge,
            secret,
            otpauth_uri,
        })
    }

    pub async fn finish_totp_enrollment(
        &self,
        user_id: Uuid,
        challenge_id: Uuid,
        code: &str,
    ) -> Result<RecoveryCodeSet, AppError> {
        let challenge = self
            .repo
            .get_valid_challenge(challenge_id, "enroll")
            .await?;
        if challenge.user_id != user_id {
            return Err(AppError::Forbidden(
                "You do not own this MFA challenge".into(),
            ));
        }

        let payload: EnrollPayload = serde_json::from_value(challenge.payload)
            .map_err(|e| AppError::Internal(format!("Invalid MFA enrollment payload: {}", e)))?;
        let secret = self.decrypt_secret(&payload.secret_encrypted)?;
        self.verify_code_against_secret(&secret, code)?;

        self.repo
            .upsert_totp_method(user_id, &payload.secret_encrypted)
            .await?;
        self.repo.mark_challenge_used(challenge_id).await?;

        // Generate initial backup codes on enrollment
        let codes = generate_backup_codes(10);
        let hashes: Vec<String> = codes.iter().map(|c| hash_backup_code(c)).collect();
        self.repo.replace_backup_codes(user_id, &hashes).await?;

        Ok(RecoveryCodeSet {
            codes,
            remaining: 10,
        })
    }

    pub async fn disable_totp(&self, user_id: Uuid) -> Result<bool, AppError> {
        let deleted = self.repo.delete_totp_method(user_id).await?;
        if deleted {
            self.repo.replace_backup_codes(user_id, &[]).await?;
        }
        Ok(deleted)
    }

    pub async fn regenerate_backup_codes(
        &self,
        user_id: Uuid,
    ) -> Result<RecoveryCodeSet, AppError> {
        if self.repo.get_totp_method(user_id).await?.is_none() {
            return Err(AppError::Validation(
                "Enable TOTP before generating backup codes".into(),
            ));
        }

        let codes = generate_backup_codes(10);
        let hashes: Vec<String> = codes.iter().map(|code| hash_backup_code(code)).collect();
        self.repo.replace_backup_codes(user_id, &hashes).await?;

        Ok(RecoveryCodeSet {
            codes,
            remaining: 10,
        })
    }

    pub async fn start_login_challenge(
        &self,
        user_id: Uuid,
        redirect_uri: Option<String>,
        primary_method: &str,
        provider: Option<&str>,
    ) -> Result<MfaLoginChallenge, AppError> {
        let challenge = self
            .repo
            .create_challenge(
                user_id,
                None,
                "totp",
                "login",
                serde_json::to_value(LoginPayload {
                    redirect_uri: normalize_redirect_uri(redirect_uri)?,
                    primary_method: primary_method.to_string(),
                    provider: provider.map(str::to_string),
                })
                .map_err(|e| {
                    AppError::Internal(format!("Failed to serialize MFA login payload: {}", e))
                })?,
                Utc::now() + Duration::minutes(10),
            )
            .await?;

        Ok(MfaLoginChallenge { challenge })
    }

    pub async fn get_login_context(&self, challenge_id: Uuid) -> Result<MfaLoginContext, AppError> {
        let challenge = self.repo.get_valid_challenge(challenge_id, "login").await?;
        let payload: LoginPayload = serde_json::from_value(challenge.payload)
            .map_err(|e| AppError::Internal(format!("Invalid MFA login payload: {}", e)))?;
        Ok(MfaLoginContext {
            user_id: challenge.user_id,
            redirect_uri: payload.redirect_uri,
            primary_method: payload.primary_method,
            provider: payload.provider,
        })
    }

    pub async fn get_login_enrollment_context(
        &self,
        challenge_id: Uuid,
    ) -> Result<MfaLoginEnrollmentContext, AppError> {
        let challenge = self
            .repo
            .get_valid_challenge(challenge_id, "login_enroll")
            .await?;
        let payload: LoginEnrollmentPayload =
            serde_json::from_value(challenge.payload).map_err(|e| {
                AppError::Internal(format!("Invalid MFA login enrollment payload: {}", e))
            })?;
        let secret = self.decrypt_secret(&payload.secret_encrypted)?;
        let identity = self
            .identity_repo
            .get_webauthn_identity(challenge.user_id)
            .await?;
        let otpauth_uri = self.build_otpauth_uri(&secret, identity.email)?;

        Ok(MfaLoginEnrollmentContext {
            user_id: challenge.user_id,
            redirect_uri: payload.redirect_uri,
            primary_method: payload.primary_method,
            provider: payload.provider,
            secret,
            otpauth_uri,
        })
    }

    pub async fn finish_login_challenge(
        &self,
        challenge_id: Uuid,
        code: &str,
    ) -> Result<MfaLoginResult, AppError> {
        let challenge = self.repo.get_valid_challenge(challenge_id, "login").await?;
        let method = self
            .repo
            .get_totp_method(challenge.user_id)
            .await?
            .ok_or_else(|| AppError::Validation("TOTP is not enabled for this account".into()))?;
        let secret = self.decrypt_secret(&method.secret_encrypted)?;
        let used_backup_code = if self.verify_code_against_secret(&secret, code).is_ok() {
            false
        } else {
            let backup = self
                .repo
                .consume_backup_code(challenge.user_id, &hash_backup_code(code))
                .await?;
            if backup.is_none() {
                return Err(AppError::Validation("Invalid MFA code".into()));
            }
            true
        };
        self.repo.mark_challenge_used(challenge.id).await?;

        let payload: LoginPayload = serde_json::from_value(challenge.payload)
            .map_err(|e| AppError::Internal(format!("Invalid MFA login payload: {}", e)))?;

        Ok(MfaLoginResult {
            user_id: challenge.user_id,
            redirect_uri: payload.redirect_uri,
            used_backup_code,
            primary_method: payload.primary_method,
            provider: payload.provider,
        })
    }

    pub async fn finish_login_enrollment(
        &self,
        challenge_id: Uuid,
        code: &str,
    ) -> Result<MfaLoginEnrollmentResult, AppError> {
        let challenge = self
            .repo
            .get_valid_challenge(challenge_id, "login_enroll")
            .await?;
        let payload: LoginEnrollmentPayload =
            serde_json::from_value(challenge.payload).map_err(|e| {
                AppError::Internal(format!("Invalid MFA login enrollment payload: {}", e))
            })?;
        let secret = self.decrypt_secret(&payload.secret_encrypted)?;
        self.verify_code_against_secret(&secret, code)?;

        self.repo
            .upsert_totp_method(challenge.user_id, &payload.secret_encrypted)
            .await?;
        let recovery_codes = generate_backup_codes(10);
        let hashes: Vec<String> = recovery_codes
            .iter()
            .map(|recovery_code| hash_backup_code(recovery_code))
            .collect();
        self.repo
            .replace_backup_codes(challenge.user_id, &hashes)
            .await?;
        self.repo.mark_challenge_used(challenge.id).await?;

        Ok(MfaLoginEnrollmentResult {
            user_id: challenge.user_id,
            redirect_uri: payload.redirect_uri,
            primary_method: payload.primary_method,
            provider: payload.provider,
            recovery_codes,
        })
    }

    fn verify_code_against_secret(&self, secret: &str, code: &str) -> Result<(), AppError> {
        let totp = TOTP::new(
            Algorithm::SHA1,
            6,
            1,
            30,
            Secret::Encoded(secret.to_string())
                .to_bytes()
                .map_err(|e| AppError::Internal(format!("Invalid stored TOTP secret: {}", e)))?,
            Some(self.config.webauthn.rp_name.clone()),
            "rooiam".to_string(),
        )
        .map_err(|e| AppError::Internal(format!("Failed to create TOTP verifier: {}", e)))?;

        let valid = totp
            .check_current(code)
            .map_err(|e| AppError::Internal(format!("Failed to verify TOTP code: {}", e)))?;
        if !valid {
            return Err(AppError::Validation("Invalid MFA code".into()));
        }

        Ok(())
    }

    async fn build_totp_enrollment(
        &self,
        user_id: Uuid,
    ) -> Result<(String, String, String), AppError> {
        let identity = self.identity_repo.get_webauthn_identity(user_id).await?;
        let secret = generate_base32_secret();
        let encrypted = self.encrypt_secret(&secret)?;
        let otpauth_uri = self.build_otpauth_uri(&secret, identity.email)?;
        Ok((secret, encrypted, otpauth_uri))
    }

    fn build_otpauth_uri(&self, secret: &str, email: String) -> Result<String, AppError> {
        TOTP::new(
            Algorithm::SHA1,
            6,
            1,
            30,
            Secret::Encoded(secret.to_string())
                .to_bytes()
                .map_err(|e| AppError::Internal(format!("Invalid TOTP secret: {}", e)))?,
            Some(self.config.webauthn.rp_name.clone()),
            email,
        )
        .map(|totp| totp.get_url())
        .map_err(|e| AppError::Internal(format!("Failed to create TOTP enrollment: {}", e)))
    }

    fn cipher(&self) -> Result<Aes256GcmSiv, AppError> {
        let key_material = Sha256::digest(self.config.oidc.signing_secret.as_bytes());
        Aes256GcmSiv::new_from_slice(&key_material)
            .map_err(|e| AppError::Internal(format!("Invalid MFA cipher key: {}", e)))
    }

    fn encrypt_secret(&self, secret: &str) -> Result<String, AppError> {
        let cipher = self.cipher()?;
        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher
            .encrypt(nonce, secret.as_bytes())
            .map_err(|e| AppError::Internal(format!("Failed to encrypt MFA secret: {}", e)))?;

        let mut combined = nonce_bytes.to_vec();
        combined.extend(ciphertext);
        Ok(base64::engine::general_purpose::STANDARD.encode(combined))
    }

    fn decrypt_secret(&self, encrypted: &str) -> Result<String, AppError> {
        use base64::Engine as _;

        let data = base64::engine::general_purpose::STANDARD
            .decode(encrypted)
            .map_err(|e| AppError::Internal(format!("Failed to decode MFA secret: {}", e)))?;

        if data.len() < 13 {
            return Err(AppError::Internal("Stored MFA secret is invalid".into()));
        }

        let (nonce_bytes, ciphertext) = data.split_at(12);
        let cipher = self.cipher()?;
        let plaintext = cipher
            .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
            .map_err(|e| AppError::Internal(format!("Failed to decrypt MFA secret: {}", e)))?;

        String::from_utf8(plaintext)
            .map_err(|e| AppError::Internal(format!("Stored MFA secret is invalid UTF-8: {}", e)))
    }
}

fn generate_base32_secret() -> String {
    let mut secret = [0u8; 20];
    OsRng.fill_bytes(&mut secret);
    base32::encode(Alphabet::Rfc4648 { padding: false }, &secret)
}

fn generate_backup_codes(count: usize) -> Vec<String> {
    (0..count)
        .map(|_| {
            let mut bytes = [0u8; 4];
            OsRng.fill_bytes(&mut bytes);
            let raw = hex::encode(bytes).to_uppercase();
            format!("{}-{}", &raw[..4], &raw[4..8])
        })
        .collect()
}

fn hash_backup_code(code: &str) -> String {
    let normalized = code
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect::<String>()
        .to_uppercase();
    hex::encode(Sha256::digest(normalized.as_bytes()))
}
