use base64::{
    engine::general_purpose::{STANDARD, STANDARD_NO_PAD, URL_SAFE, URL_SAFE_NO_PAD},
    Engine as _,
};
use chrono::{DateTime, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use rand::{rngs::OsRng, seq::SliceRandom, Rng, RngCore};
use redis::aio::ConnectionManager;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::sync::Arc;
use uuid::Uuid;

use crate::bootstrap::config::AppConfig;
use crate::shared::error::AppError;

use super::apple_app_attest::{
    load_apple_app_attest_verifier_config, verify_apple_app_attest_attestation,
    AppleAppAttestVerificationError,
};
use super::google_play::{
    decode_google_play_integrity_token, load_google_play_integrity_verifier_config,
    verify_google_play_token_payload, GooglePlayVerificationError,
};
use super::models::{DeviceLoginIntent, TrustedDevicePlatform, UserTrustedDevice};
use super::repository::{DeviceLoginRepository, NewDeviceLoginIntent};

pub struct RegisterTrustedDeviceInput {
    pub device_label: String,
    pub platform: String,
    pub device_token: String,
    pub device_public_key: Option<String>,
    pub attestation: Option<RegisterTrustedDeviceAttestationInput>,
}

#[derive(Clone, Debug)]
pub struct RegisterTrustedDeviceAttestationInput {
    pub format: String,
    pub key_id: Option<String>,
    pub app_id: Option<String>,
    pub environment: Option<String>,
    pub challenge_token: Option<String>,
    pub statement: String,
}

pub struct CreateDeviceAttestationChallengeInput {
    pub format: String,
    pub key_id: String,
    pub app_id: String,
    pub environment: String,
    pub device_public_key: String,
}

#[derive(Debug)]
pub struct CreatedDeviceAttestationChallenge {
    pub token: String,
    pub challenge: String,
    pub expires_at: DateTime<Utc>,
    pub record: StoredDeviceAttestationChallenge,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StoredDeviceAttestationChallenge {
    pub user_id: Uuid,
    pub format: String,
    pub key_id: String,
    pub app_id: String,
    pub environment: String,
    pub device_public_key: String,
    pub challenge: String,
    pub expires_at: DateTime<Utc>,
}

pub struct StartDeviceLoginInput {
    pub workspace_id: Option<Uuid>,
    pub oauth_client_id: Option<Uuid>,
    pub redirect_uri: Option<String>,
    pub surface: Option<String>,
    pub requester_ip: Option<String>,
    pub requester_user_agent: Option<String>,
    pub issuer_url: String,
}

pub struct UpdateTrustedDevicePushTokenInput {
    pub push_token: Option<String>,
}

pub struct StartedDeviceLogin {
    pub public_id: Uuid,
    pub browser_nonce: String,
    pub qr_value: String,
    pub display_code: String,
    pub number_choices: Vec<u8>,
    pub expires_at: DateTime<Utc>,
}

pub struct DeviceChallengeNumbers {
    pub match_number: u8,
    pub choices: Vec<u8>,
}

pub struct DeviceLoginService {
    repo: DeviceLoginRepository,
    config: Arc<AppConfig>,
    redis: ConnectionManager,
    http_client: Client,
}

const DEVICE_PUBLIC_KEY_SCHEME: &str = "ed25519";
const DEVICE_ATTESTATION_CHALLENGE_TTL_SECONDS: i64 = 600;
const ATTESTATION_STATUS_MISSING: &str = "missing";
const ATTESTATION_STATUS_PENDING: &str = "pending";
const ATTESTATION_STATUS_VERIFIED: &str = "verified";
const ATTESTATION_STATUS_REJECTED: &str = "rejected";
const INTENT_STATUS_REASON_REJECTED_BY_PHONE: &str = "rejected_by_phone";
const INTENT_STATUS_REASON_CANCELLED_BY_BROWSER: &str = "cancelled_by_browser";

impl DeviceLoginService {
    pub fn new(
        repo: DeviceLoginRepository,
        config: Arc<AppConfig>,
        redis: ConnectionManager,
    ) -> Self {
        Self {
            repo,
            config,
            redis,
            http_client: Client::new(),
        }
    }

    pub async fn register_trusted_device(
        &self,
        user_id: Uuid,
        input: RegisterTrustedDeviceInput,
    ) -> Result<UserTrustedDevice, AppError> {
        let device_label = validate_device_label(&input.device_label)?;
        let platform = validate_platform(&input.platform)?;
        let device_token_hash = hash_device_token(&input.device_token)?;
        let device_public_key = Some(validate_device_public_key(
            input.device_public_key.as_deref().ok_or_else(|| {
                AppError::Validation(
                    "Device public key is required for trusted mobile devices.".into(),
                )
            })?,
        )?);
        let attestation = input
            .attestation
            .as_ref()
            .map(validate_device_attestation)
            .transpose()?;
        let ios_app_attest_verification = match attestation.as_ref() {
            Some(attestation) if attestation.format == "ios-app-attest" => Some(
                self.verify_ios_app_attest_registration(
                    user_id,
                    device_public_key.as_deref().ok_or_else(|| {
                        AppError::Validation(
                            "Device public key is required for trusted mobile devices.".into(),
                        )
                    })?,
                    attestation,
                )
                .await?,
            ),
            _ => None,
        };

        let attestation_status = if ios_app_attest_verification.is_some() {
            ATTESTATION_STATUS_VERIFIED
        } else if attestation.is_some() {
            ATTESTATION_STATUS_PENDING
        } else {
            ATTESTATION_STATUS_MISSING
        };
        let attestation_verified_at = ios_app_attest_verification
            .as_ref()
            .map(|verified| verified.issued_at);

        if self
            .repo
            .get_active_trusted_device_by_token_hash(user_id, &device_token_hash)
            .await?
            .is_some()
        {
            return Err(AppError::Conflict(
                "This trusted device is already registered.".into(),
            ));
        }

        self.repo
            .create_trusted_device(
                user_id,
                &device_label,
                platform.as_str(),
                &device_token_hash,
                device_public_key.as_deref(),
                attestation.as_ref().map(|value| value.format.as_str()),
                ios_app_attest_verification
                    .as_ref()
                    .map(|value| value.key_id.as_str())
                    .or(attestation
                        .as_ref()
                        .and_then(|value| value.key_id.as_deref())),
                ios_app_attest_verification
                    .as_ref()
                    .map(|value| value.app_id.as_str())
                    .or(attestation
                        .as_ref()
                        .and_then(|value| value.app_id.as_deref())),
                ios_app_attest_verification
                    .as_ref()
                    .map(|value| value.environment.as_str())
                    .or(attestation
                        .as_ref()
                        .and_then(|value| value.environment.as_deref())),
                attestation.as_ref().map(|value| value.statement.as_str()),
                attestation_status,
                None,
                attestation.as_ref().map(|_| Utc::now()),
                attestation_verified_at,
            )
            .await
    }

    pub async fn list_trusted_devices(
        &self,
        user_id: Uuid,
    ) -> Result<Vec<UserTrustedDevice>, AppError> {
        self.repo.list_trusted_devices(user_id).await
    }

    pub async fn revoke_trusted_device(
        &self,
        user_id: Uuid,
        device_id: Uuid,
    ) -> Result<bool, AppError> {
        self.repo.revoke_trusted_device(user_id, device_id).await
    }

    pub async fn update_trusted_device_push_token(
        &self,
        user_id: Uuid,
        device_id: Uuid,
        input: UpdateTrustedDevicePushTokenInput,
    ) -> Result<UserTrustedDevice, AppError> {
        let push_token = validate_optional_push_token(input.push_token.as_deref())?;
        self.repo
            .update_trusted_device_push_token(user_id, device_id, push_token.as_deref())
            .await?
            .ok_or_else(|| AppError::NotFound("Trusted device not found.".into()))
    }

    pub async fn start_device_login(
        &self,
        input: StartDeviceLoginInput,
    ) -> Result<StartedDeviceLogin, AppError> {
        let public_id = Uuid::new_v4();
        let browser_nonce = generate_browser_nonce();
        let nonce_hash = hash_browser_nonce(&browser_nonce)?;
        let browser_binding_hash =
            build_browser_binding_hash(&browser_nonce, input.requester_user_agent.as_deref())?;
        let challenge = generate_number_challenge();
        let display_code = generate_display_code();

        let expiry_minutes: i64 = sqlx::query_scalar(
            "SELECT value::bigint FROM system_settings WHERE key = 'device_login_expiry_minutes'",
        )
        .fetch_optional(&self.repo.pool)
        .await
        .ok()
        .flatten()
        .unwrap_or(5);
        let expires_at = Utc::now() + chrono::Duration::minutes(expiry_minutes.max(1));

        self.repo
            .create_device_login_intent(NewDeviceLoginIntent {
                public_id,
                browser_binding_hash: &browser_binding_hash,
                nonce_hash: &nonce_hash,
                workspace_id: input.workspace_id,
                oauth_client_id: input.oauth_client_id,
                redirect_uri: input.redirect_uri.as_deref(),
                surface: input.surface.as_deref(),
                display_code: &display_code,
                match_number: i16::from(challenge.match_number),
                decoy_numbers: &challenge
                    .choices
                    .iter()
                    .copied()
                    .filter(|value| *value != challenge.match_number)
                    .map(i16::from)
                    .collect::<Vec<_>>(),
                requester_ip: input.requester_ip.as_deref(),
                requester_user_agent: input.requester_user_agent.as_deref(),
                expires_at,
            })
            .await?;

        tracing::info!(
            public_id = %public_id,
            workspace_id = ?input.workspace_id,
            oauth_client_id = ?input.oauth_client_id,
            redirect_uri = ?input.redirect_uri,
            surface = ?input.surface,
            "device_login.started"
        );

        Ok(StartedDeviceLogin {
            public_id,
            browser_nonce,
            qr_value: build_qr_value(&input.issuer_url, public_id),
            display_code,
            number_choices: challenge.choices,
            expires_at,
        })
    }

    pub async fn load_browser_intent(
        &self,
        public_id: Uuid,
        browser_nonce: &str,
        user_agent: Option<&str>,
    ) -> Result<DeviceLoginIntent, AppError> {
        let nonce_hash = hash_browser_nonce(browser_nonce)?;
        let intent = self
            .repo
            .get_browser_device_login_intent(public_id, &nonce_hash)
            .await?
            .ok_or_else(|| AppError::NotFound("Device login request not found.".into()))?;

        let expected_binding = build_browser_binding_hash(browser_nonce, user_agent)?;
        if intent.browser_binding_hash != expected_binding {
            return Err(AppError::Forbidden(
                "This device login request belongs to a different browser session.".into(),
            ));
        }

        Ok(intent)
    }

    pub async fn approve_device_login(
        &self,
        user_id: Uuid,
        public_id: Uuid,
        device_token: &str,
        selected_number: u8,
        approval_signature: &str,
    ) -> Result<DeviceLoginIntent, AppError> {
        let device_token_hash = hash_device_token(device_token)?;
        let trusted_device = self
            .repo
            .get_active_trusted_device_by_token_hash(user_id, &device_token_hash)
            .await?
            .ok_or_else(|| {
                AppError::Forbidden(
                    "This phone is not registered as a trusted device for your account.".into(),
                )
            })?;
        let trusted_device = self
            .ensure_trusted_device_attestation_allows_qr_login(trusted_device)
            .await?;
        let device_public_key = trusted_device.device_public_key.as_deref().ok_or_else(|| {
            AppError::Forbidden(
                "This trusted device was registered before device-key verification was required. Re-register the phone to use QR login.".into(),
            )
        })?;

        let intent = self
            .repo
            .get_device_login_intent_by_public_id(public_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Device login request not found.".into()))?;
        ensure_intent_can_be_approved(&intent)?;

        if selected_number != intent.match_number as u8 {
            return Err(AppError::Validation(
                "The selected number does not match the browser challenge.".into(),
            ));
        }

        verify_device_approval_signature(
            device_public_key,
            &build_approval_payload(&intent),
            approval_signature,
        )?;

        let approved = self
            .repo
            .approve_device_login_intent(public_id, user_id, trusted_device.id)
            .await?
            .ok_or_else(|| {
                AppError::Conflict(
                    "This device login request is no longer pending. Refresh and scan again."
                        .into(),
                )
            })?;

        self.repo.touch_trusted_device(trusted_device.id).await?;

        tracing::info!(
            public_id = %approved.public_id,
            user_id = %user_id,
            trusted_device_id = %trusted_device.id,
            "device_login.approved"
        );

        Ok(approved)
    }

    pub async fn reject_device_login(
        &self,
        user_id: Uuid,
        public_id: Uuid,
        device_token: &str,
    ) -> Result<DeviceLoginIntent, AppError> {
        let device_token_hash = hash_device_token(device_token)?;
        let trusted_device = self
            .repo
            .get_active_trusted_device_by_token_hash(user_id, &device_token_hash)
            .await?
            .ok_or_else(|| {
                AppError::Forbidden(
                    "This phone is not registered as a trusted device for your account.".into(),
                )
            })?;
        let trusted_device = self
            .ensure_trusted_device_attestation_allows_qr_login(trusted_device)
            .await?;

        let intent = self
            .repo
            .get_device_login_intent_by_public_id(public_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Device login request not found.".into()))?;
        ensure_intent_can_be_rejected(&intent)?;

        let rejected = self
            .repo
            .reject_device_login_intent(public_id, INTENT_STATUS_REASON_REJECTED_BY_PHONE)
            .await?
            .ok_or_else(|| {
                AppError::Conflict(
                    "This device login request is no longer pending. Refresh and scan again."
                        .into(),
                )
            })?;

        self.repo.touch_trusted_device(trusted_device.id).await?;

        tracing::info!(
            public_id = %rejected.public_id,
            user_id = %user_id,
            trusted_device_id = %trusted_device.id,
            "device_login.rejected"
        );

        Ok(rejected)
    }

    pub async fn consume_approved_browser_intent(
        &self,
        public_id: Uuid,
        browser_nonce: &str,
        user_agent: Option<&str>,
    ) -> Result<DeviceLoginIntent, AppError> {
        let intent = self
            .load_browser_intent(public_id, browser_nonce, user_agent)
            .await?;
        ensure_intent_can_be_completed(&intent)?;

        let nonce_hash = hash_browser_nonce(browser_nonce)?;
        self.repo
            .consume_approved_device_login_intent(public_id, &nonce_hash)
            .await?
            .ok_or_else(|| {
                AppError::Conflict(
                    "This device login request was already completed or expired.".into(),
                )
            })
            .map(|consumed| {
                tracing::info!(
                    public_id = %consumed.public_id,
                    approved_user_id = ?consumed.approved_user_id,
                    approved_device_id = ?consumed.approved_device_id,
                    "device_login.consumed"
                );
                consumed
            })
    }

    pub async fn cancel_browser_intent(
        &self,
        public_id: Uuid,
        browser_nonce: &str,
        user_agent: Option<&str>,
    ) -> Result<DeviceLoginIntent, AppError> {
        let intent = self
            .load_browser_intent(public_id, browser_nonce, user_agent)
            .await?;
        ensure_intent_can_be_cancelled(&intent)?;

        let nonce_hash = hash_browser_nonce(browser_nonce)?;
        self.repo
            .cancel_device_login_intent(
                public_id,
                &nonce_hash,
                INTENT_STATUS_REASON_CANCELLED_BY_BROWSER,
            )
            .await?
            .ok_or_else(|| {
                AppError::Conflict(
                    "This device login request is no longer pending. Refresh and start again."
                        .into(),
                )
            })
            .map(|cancelled| {
                tracing::info!(public_id = %cancelled.public_id, "device_login.cancelled");
                cancelled
            })
    }

    async fn ensure_trusted_device_attestation_allows_qr_login(
        &self,
        trusted_device: UserTrustedDevice,
    ) -> Result<UserTrustedDevice, AppError> {
        let policy = load_device_attestation_policy(&self.repo.pool).await?;
        if !policy.require_verified_for_qr_login {
            return Ok(trusted_device);
        }

        match trusted_device.attestation_status.as_str() {
            ATTESTATION_STATUS_VERIFIED => Ok(trusted_device),
            ATTESTATION_STATUS_MISSING => Err(AppError::Forbidden(
                "This trusted device does not have verified attestation. Re-register the phone with attestation enabled before using QR login.".into(),
            )),
            ATTESTATION_STATUS_REJECTED => Err(AppError::Forbidden(
                trusted_device
                    .attestation_status_reason
                    .clone()
                    .unwrap_or_else(|| {
                        "This trusted device attestation was rejected. Re-register the phone before using QR login.".into()
                    }),
            )),
            ATTESTATION_STATUS_PENDING => {
                let verdict = if policy.require_vendor_verification_for_qr_login {
                    match self
                        .verify_trusted_device_attestation_with_vendor_proof(
                            &trusted_device,
                            &policy,
                        )
                        .await
                    {
                        VendorAttestationDecision::Verified(verdict) => verdict,
                        VendorAttestationDecision::Rejected(verdict) => verdict,
                        VendorAttestationDecision::Unavailable(message) => {
                            return Err(AppError::External(message));
                        }
                    }
                } else {
                    verify_trusted_device_attestation(&trusted_device, &policy)
                };
                let updated = self
                    .repo
                    .update_trusted_device_attestation_verdict(
                        trusted_device.id,
                        verdict.status,
                        verdict.reason.as_deref(),
                        verdict.verified_at,
                    )
                    .await?;

                if verdict.status == ATTESTATION_STATUS_VERIFIED {
                    Ok(updated)
                } else {
                    Err(AppError::Forbidden(
                        updated.attestation_status_reason.unwrap_or_else(|| {
                            "This trusted device attestation was rejected. Re-register the phone before using QR login.".into()
                        }),
                    ))
                }
            }
            other => Err(AppError::Forbidden(format!(
                "This trusted device has an unsupported attestation status '{}'. Re-register the phone before using QR login.",
                other
            ))),
        }
    }

    async fn verify_trusted_device_attestation_with_vendor_proof(
        &self,
        trusted_device: &UserTrustedDevice,
        policy: &DeviceAttestationPolicy,
    ) -> VendorAttestationDecision {
        let Some(attestation_format) = trusted_device.attestation_format.as_deref() else {
            return VendorAttestationDecision::Rejected(rejected_attestation(
                "This trusted device is missing its attestation format. Re-register the phone before using QR login.",
            ));
        };
        let Some(statement_raw) = trusted_device.attestation_statement.as_deref() else {
            return VendorAttestationDecision::Rejected(rejected_attestation(
                "This trusted device did not provide attestation evidence. Re-register the phone before using QR login.",
            ));
        };

        match attestation_format {
            "android-play-integrity" => {
                self.verify_android_play_integrity_vendor_attestation(
                    trusted_device,
                    policy,
                    statement_raw,
                )
                .await
            }
            "ios-app-attest" => VendorAttestationDecision::Rejected(rejected_attestation(
                "This trusted device is still pending iOS App Attest verification. Real Apple App Attest verification is completed at registration time using a one-time challenge, so this device must be re-registered before it can approve QR login.",
            )),
            "android-key-attestation" => VendorAttestationDecision::Rejected(
                rejected_attestation(
                    "This server is configured to require vendor attestation verification for Android key attestation, but certificate-chain verification is not wired yet.",
                ),
            ),
            "ios-devicecheck" => VendorAttestationDecision::Rejected(rejected_attestation(
                "This server is configured to require vendor attestation verification for iOS DeviceCheck, but the Apple verification adapter is not wired yet.",
            )),
            other => VendorAttestationDecision::Rejected(rejected_attestation(&format!(
                "This server is configured to require vendor attestation verification, but attestation format '{}' does not have a verifier.",
                other
            ))),
        }
    }

    async fn verify_android_play_integrity_vendor_attestation(
        &self,
        trusted_device: &UserTrustedDevice,
        policy: &DeviceAttestationPolicy,
        statement_raw: &str,
    ) -> VendorAttestationDecision {
        let Some(package_name) = trusted_device.attestation_app_id.as_deref() else {
            return VendorAttestationDecision::Rejected(rejected_attestation(
                "This trusted device is missing its registered app_id. Re-register the phone before using QR login.",
            ));
        };

        let verifier_config = match load_google_play_integrity_verifier_config(&self.config) {
            Ok(value) => value,
            Err(GooglePlayVerificationError::Unavailable(message)) => {
                return VendorAttestationDecision::Unavailable(message);
            }
            Err(GooglePlayVerificationError::Rejected(message)) => {
                return VendorAttestationDecision::Rejected(rejected_attestation(&message));
            }
        };

        let payload = match decode_google_play_integrity_token(
            &self.http_client,
            &verifier_config,
            package_name,
            statement_raw,
        )
        .await
        {
            Ok(value) => value,
            Err(GooglePlayVerificationError::Rejected(message)) => {
                return VendorAttestationDecision::Rejected(rejected_attestation(&message));
            }
            Err(GooglePlayVerificationError::Unavailable(message)) => {
                return VendorAttestationDecision::Unavailable(message);
            }
        };

        match verify_google_play_token_payload(trusted_device, policy, &payload) {
            Ok(verified) => {
                tracing::debug!(
                    "Google Play Integrity attestation verified for trusted device {} in {} environment.",
                    trusted_device.id,
                    verified.environment
                );
                VendorAttestationDecision::Verified(AttestationVerificationVerdict {
                    status: ATTESTATION_STATUS_VERIFIED,
                    reason: None,
                    verified_at: Some(Utc::now()),
                })
            }
            Err(GooglePlayVerificationError::Rejected(message)) => {
                VendorAttestationDecision::Rejected(rejected_attestation(&message))
            }
            Err(GooglePlayVerificationError::Unavailable(message)) => {
                VendorAttestationDecision::Unavailable(message)
            }
        }
    }

    async fn verify_ios_app_attest_registration(
        &self,
        user_id: Uuid,
        device_public_key: &str,
        attestation: &ValidatedTrustedDeviceAttestation,
    ) -> Result<VerifiedAppleAppAttestRegistration, AppError> {
        let challenge_token = attestation.challenge_token.as_deref().ok_or_else(|| {
            AppError::Validation(
                "iOS App Attest registration requires challenge_token from /v1/identity/me/devices/attestation-challenge.".into(),
            )
        })?;
        let challenge = self
            .consume_device_attestation_challenge(challenge_token)
            .await?;
        validate_ios_app_attest_registration_binding(
            user_id,
            device_public_key,
            attestation,
            &challenge,
        )?;
        let verifier_config = match load_apple_app_attest_verifier_config(&self.config) {
            Ok(value) => value,
            Err(AppleAppAttestVerificationError::Rejected(message)) => {
                return Err(AppError::Validation(message));
            }
            Err(AppleAppAttestVerificationError::Unavailable(message)) => {
                return Err(AppError::External(message));
            }
        };
        let verified = match verify_apple_app_attest_attestation(
            &verifier_config,
            &challenge,
            &attestation.statement,
        ) {
            Ok(value) => value,
            Err(AppleAppAttestVerificationError::Rejected(message)) => {
                return Err(AppError::Validation(message));
            }
            Err(AppleAppAttestVerificationError::Unavailable(message)) => {
                return Err(AppError::External(message));
            }
        };

        Ok(VerifiedAppleAppAttestRegistration {
            issued_at: verified.issued_at,
            key_id: challenge.key_id,
            app_id: challenge.app_id,
            environment: challenge.environment,
        })
    }

    async fn consume_device_attestation_challenge(
        &self,
        challenge_token: &str,
    ) -> Result<StoredDeviceAttestationChallenge, AppError> {
        let redis_key = device_attestation_challenge_redis_key(challenge_token)?;
        let mut redis = self.redis.clone();
        let (payload_raw, _deleted): (Option<String>, i32) = redis::pipe()
            .atomic()
            .cmd("GET")
            .arg(&redis_key)
            .cmd("DEL")
            .arg(&redis_key)
            .query_async(&mut redis)
            .await?;
        let payload_raw = payload_raw.ok_or_else(|| {
            AppError::Validation(
                "This App Attest challenge is missing, expired, or already used. Request a new iOS attestation challenge and try again.".into(),
            )
        })?;
        let payload: StoredDeviceAttestationChallenge = serde_json::from_str(&payload_raw)
            .map_err(|error| {
                AppError::Internal(format!(
                    "Failed to deserialize device attestation challenge payload: {}",
                    error
                ))
            })?;
        if payload.expires_at <= Utc::now() {
            return Err(AppError::Validation(
                "This App Attest challenge expired. Request a new iOS attestation challenge and try again.".into(),
            ));
        }
        Ok(payload)
    }
}

pub(crate) fn validate_ios_app_attest_registration_binding(
    user_id: Uuid,
    device_public_key: &str,
    attestation: &ValidatedTrustedDeviceAttestation,
    challenge: &StoredDeviceAttestationChallenge,
) -> Result<(), AppError> {
    if challenge.user_id != user_id {
        return Err(AppError::Validation(
            "This App Attest challenge was issued for a different user session.".into(),
        ));
    }
    if challenge.format != attestation.format {
        return Err(AppError::Validation(
            "This App Attest challenge format does not match the registration attestation format."
                .into(),
        ));
    }
    if challenge.device_public_key != device_public_key {
        return Err(AppError::Validation(
            "This App Attest challenge does not match the registered device public key.".into(),
        ));
    }
    if let Some(key_id) = attestation.key_id.as_deref() {
        if key_id != challenge.key_id {
            return Err(AppError::Validation(
                "This App Attest challenge key_id does not match the registration payload.".into(),
            ));
        }
    }
    if let Some(app_id) = attestation.app_id.as_deref() {
        if app_id != challenge.app_id {
            return Err(AppError::Validation(
                "This App Attest challenge app_id does not match the registration payload.".into(),
            ));
        }
    }
    if let Some(environment) = attestation.environment.as_deref() {
        if environment != challenge.environment {
            return Err(AppError::Validation(
                "This App Attest challenge environment does not match the registration payload."
                    .into(),
            ));
        }
    }
    Ok(())
}

struct VerifiedAppleAppAttestRegistration {
    issued_at: DateTime<Utc>,
    key_id: String,
    app_id: String,
    environment: String,
}

#[derive(Clone, Debug)]
pub(crate) struct DeviceAttestationPolicy {
    pub require_verified_for_qr_login: bool,
    pub require_vendor_verification_for_qr_login: bool,
    pub allow_development_environments: bool,
    pub allowed_app_ids: Vec<String>,
    pub max_statement_age_hours: i64,
}

#[derive(Clone, Debug)]
pub(crate) struct AttestationVerificationVerdict {
    pub status: &'static str,
    pub reason: Option<String>,
    pub verified_at: Option<DateTime<Utc>>,
}

enum VendorAttestationDecision {
    Verified(AttestationVerificationVerdict),
    Rejected(AttestationVerificationVerdict),
    Unavailable(String),
}

pub fn validate_device_public_key(raw: &str) -> Result<String, AppError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation(
            "Device public key is required for trusted mobile devices.".into(),
        ));
    }

    let encoded = if let Some((scheme, encoded)) = trimmed.split_once(':') {
        if !scheme.eq_ignore_ascii_case(DEVICE_PUBLIC_KEY_SCHEME) {
            return Err(AppError::Validation(
                "Device public key must use the ed25519 format.".into(),
            ));
        }
        encoded.trim()
    } else {
        trimmed
    };

    let key_bytes = decode_base64_bytes(encoded)
        .map_err(|_| AppError::Validation("Device public key must be valid base64.".into()))?;
    let key_bytes: [u8; 32] = key_bytes
        .try_into()
        .map_err(|_| AppError::Validation("Device public key must decode to 32 bytes.".into()))?;

    VerifyingKey::from_bytes(&key_bytes).map_err(|_| {
        AppError::Validation("Device public key is not a valid Ed25519 key.".into())
    })?;

    Ok(format!(
        "{}:{}",
        DEVICE_PUBLIC_KEY_SCHEME,
        URL_SAFE_NO_PAD.encode(key_bytes)
    ))
}

#[derive(Clone, Debug)]
pub(crate) struct ValidatedTrustedDeviceAttestation {
    format: String,
    key_id: Option<String>,
    app_id: Option<String>,
    environment: Option<String>,
    challenge_token: Option<String>,
    statement: String,
}

pub(crate) fn validate_device_attestation(
    input: &RegisterTrustedDeviceAttestationInput,
) -> Result<ValidatedTrustedDeviceAttestation, AppError> {
    let format = validate_attestation_format(&input.format)?;
    let statement = normalize_required_field(
        &input.statement,
        "Device attestation statement is required.",
        32,
        32_768,
    )?;
    let key_id = normalize_optional_field(&input.key_id, 255)?;
    let app_id = normalize_optional_field(&input.app_id, 255)?;
    let environment = normalize_optional_field(&input.environment, 64)?;
    let challenge_token = normalize_optional_field(&input.challenge_token, 255)?;
    if format == "ios-app-attest" && challenge_token.is_none() {
        return Err(AppError::Validation(
            "iOS App Attest registration requires challenge_token from /v1/identity/me/devices/attestation-challenge.".into(),
        ));
    }
    if format != "ios-app-attest" && challenge_token.is_some() {
        return Err(AppError::Validation(
            "challenge_token is only valid for ios-app-attest registrations.".into(),
        ));
    }

    Ok(ValidatedTrustedDeviceAttestation {
        format,
        key_id,
        app_id,
        environment,
        challenge_token,
        statement,
    })
}

pub fn create_device_attestation_challenge(
    user_id: Uuid,
    input: CreateDeviceAttestationChallengeInput,
) -> Result<CreatedDeviceAttestationChallenge, AppError> {
    let format = validate_attestation_format(&input.format)?;
    if format != "ios-app-attest" {
        return Err(AppError::Validation(
            "Attestation challenges are currently only used for ios-app-attest.".into(),
        ));
    }

    let key_id =
        normalize_required_field(&input.key_id, "Attestation key_id is required.", 8, 255)?;
    let app_id =
        normalize_required_field(&input.app_id, "Attestation app_id is required.", 3, 255)?;
    let environment = normalize_required_field(
        &input.environment,
        "Attestation environment is required.",
        3,
        64,
    )?;
    let device_public_key = validate_device_public_key(&input.device_public_key)?;
    let challenge = generate_device_attestation_challenge();
    let token = generate_device_attestation_challenge_token();
    let expires_at =
        Utc::now() + chrono::Duration::seconds(DEVICE_ATTESTATION_CHALLENGE_TTL_SECONDS);
    let record = StoredDeviceAttestationChallenge {
        user_id,
        format,
        key_id,
        app_id,
        environment,
        device_public_key,
        challenge: challenge.clone(),
        expires_at,
    };

    Ok(CreatedDeviceAttestationChallenge {
        token,
        challenge,
        expires_at,
        record,
    })
}

pub fn device_attestation_challenge_ttl_seconds() -> usize {
    DEVICE_ATTESTATION_CHALLENGE_TTL_SECONDS as usize
}

pub fn device_attestation_challenge_redis_key(token: &str) -> Result<String, AppError> {
    let normalized =
        normalize_required_field(token, "Attestation challenge token is required.", 16, 255)?;
    Ok(format!("device_attestation_challenge:{}", normalized))
}

pub fn validate_attestation_format(raw: &str) -> Result<String, AppError> {
    let normalized = raw.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "android-play-integrity"
        | "android-key-attestation"
        | "ios-app-attest"
        | "ios-devicecheck" => Ok(normalized),
        _ => Err(AppError::Validation(
            "Attestation format must be one of: android-play-integrity, android-key-attestation, ios-app-attest, ios-devicecheck.".into(),
        )),
    }
}

pub(crate) async fn load_device_attestation_policy(
    db: &PgPool,
) -> Result<DeviceAttestationPolicy, AppError> {
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT key, value FROM system_settings WHERE key LIKE 'device_attestation_%'",
    )
    .fetch_all(db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load device attestation policy: {}", e)))?;

    let mut policy = DeviceAttestationPolicy {
        require_verified_for_qr_login: true,
        require_vendor_verification_for_qr_login: false,
        allow_development_environments: false,
        allowed_app_ids: Vec::new(),
        max_statement_age_hours: 24,
    };

    for (key, value) in rows {
        match key.as_str() {
            "device_attestation_required_for_qr_login" => {
                policy.require_verified_for_qr_login = parse_system_bool(&value)
            }
            "device_attestation_require_vendor_verification_for_qr_login" => {
                policy.require_vendor_verification_for_qr_login = parse_system_bool(&value)
            }
            "device_attestation_allow_development_environments" => {
                policy.allow_development_environments = parse_system_bool(&value)
            }
            "device_attestation_allowed_app_ids" => {
                policy.allowed_app_ids = value
                    .split(|ch| ch == ',' || ch == '\n')
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(str::to_string)
                    .collect();
            }
            "device_attestation_max_statement_age_hours" => {
                policy.max_statement_age_hours = value.trim().parse().unwrap_or(24).max(1);
            }
            _ => {}
        }
    }

    Ok(policy)
}

pub(crate) fn verify_trusted_device_attestation(
    trusted_device: &UserTrustedDevice,
    policy: &DeviceAttestationPolicy,
) -> AttestationVerificationVerdict {
    let Some(device_public_key) = trusted_device.device_public_key.as_deref() else {
        return rejected_attestation(
            "This trusted device is missing its registered public key. Re-register the phone before using QR login.",
        );
    };
    let Some(attestation_format) = trusted_device.attestation_format.as_deref() else {
        return rejected_attestation(
            "This trusted device is missing its attestation format. Re-register the phone before using QR login.",
        );
    };
    let Some(statement_raw) = trusted_device.attestation_statement.as_deref() else {
        return rejected_attestation(
            "This trusted device did not provide attestation evidence. Re-register the phone before using QR login.",
        );
    };

    let expected_platform = match trusted_device.platform.as_str() {
        "android" => "android",
        "ios" => "ios",
        _ => {
            return rejected_attestation(
                "This trusted device has an unsupported platform for attestation verification.",
            )
        }
    };
    if !attestation_format.starts_with(expected_platform) {
        return rejected_attestation(&format!(
            "Attestation format '{}' does not match the registered {} platform.",
            attestation_format, expected_platform
        ));
    }

    let statement = match parse_attestation_statement(attestation_format, statement_raw) {
        Ok(value) => value,
        Err(reason) => return rejected_attestation(&reason),
    };

    if statement.format.as_deref() != Some(attestation_format) {
        return rejected_attestation(
            "Attestation statement format does not match the trusted device registration.",
        );
    }

    if statement.platform.as_deref() != Some(expected_platform) {
        return rejected_attestation(
            "Attestation statement platform does not match the trusted device platform.",
        );
    }

    if statement.public_key.as_deref() != Some(device_public_key) {
        return rejected_attestation(
            "Attestation statement public key does not match the registered device key.",
        );
    }

    if let Some(expected_key_id) = trusted_device.attestation_key_id.as_deref() {
        if statement.key_id.as_deref() != Some(expected_key_id) {
            return rejected_attestation(
                "Attestation statement key ID does not match the trusted device registration.",
            );
        }
    }

    let effective_app_id = statement
        .app_id
        .as_deref()
        .or(trusted_device.attestation_app_id.as_deref());
    let Some(app_id) = effective_app_id else {
        return rejected_attestation("Attestation statement is missing app_id.");
    };
    if let Some(expected_app_id) = trusted_device.attestation_app_id.as_deref() {
        if expected_app_id != app_id {
            return rejected_attestation(
                "Attestation statement app_id does not match the trusted device registration.",
            );
        }
    }
    if !policy.allowed_app_ids.is_empty()
        && !policy
            .allowed_app_ids
            .iter()
            .any(|allowed| allowed == app_id)
    {
        return rejected_attestation(
            "Attestation statement app_id is not allowed by server policy.",
        );
    }

    let effective_environment = statement
        .environment
        .as_deref()
        .or(trusted_device.attestation_environment.as_deref());
    let Some(environment) = effective_environment else {
        return rejected_attestation("Attestation statement is missing environment.");
    };
    if let Some(expected_environment) = trusted_device.attestation_environment.as_deref() {
        if expected_environment != environment {
            return rejected_attestation(
                "Attestation statement environment does not match the trusted device registration.",
            );
        }
    }
    if !policy.allow_development_environments && is_development_environment(environment) {
        return rejected_attestation(
            "Development attestation environments are not allowed for QR login by server policy.",
        );
    }

    let issued_at = match statement.issued_at {
        Some(value) => value,
        None => return rejected_attestation("Attestation statement is missing issued_at."),
    };
    let now = Utc::now();
    if issued_at > now + chrono::Duration::minutes(5) {
        return rejected_attestation("Attestation statement issued_at is too far in the future.");
    }
    if issued_at < now - chrono::Duration::hours(policy.max_statement_age_hours) {
        return rejected_attestation("Attestation statement is too old for QR login policy.");
    }

    if policy.require_vendor_verification_for_qr_login {
        if let Err(reason) = verify_vendor_attestation_proof(attestation_format, statement_raw) {
            return rejected_attestation(&reason);
        }
    }

    AttestationVerificationVerdict {
        status: ATTESTATION_STATUS_VERIFIED,
        reason: None,
        verified_at: Some(now),
    }
}

pub fn validate_device_label(raw: &str) -> Result<String, AppError> {
    let label = raw.trim();
    if label.is_empty() {
        return Err(AppError::Validation("Device label is required.".into()));
    }
    if label.len() > 100 {
        return Err(AppError::Validation(
            "Device label is too long (max 100 characters).".into(),
        ));
    }
    Ok(label.to_string())
}

pub fn validate_platform(raw: &str) -> Result<TrustedDevicePlatform, AppError> {
    TrustedDevicePlatform::parse(raw)
        .ok_or_else(|| AppError::Validation("Platform must be one of: android, ios.".into()))
}

pub fn hash_device_token(raw: &str) -> Result<String, AppError> {
    let token = raw.trim();
    if token.len() < 16 {
        return Err(AppError::Validation(
            "Device token must be at least 16 characters long.".into(),
        ));
    }
    Ok(sha256_hex(token))
}

pub fn hash_browser_nonce(raw: &str) -> Result<String, AppError> {
    let nonce = raw.trim();
    if nonce.len() < 16 {
        return Err(AppError::Validation(
            "Browser nonce is invalid or expired. Start QR login again.".into(),
        ));
    }
    Ok(sha256_hex(nonce))
}

pub fn build_browser_binding_hash(
    browser_nonce: &str,
    user_agent: Option<&str>,
) -> Result<String, AppError> {
    let nonce = browser_nonce.trim();
    if nonce.len() < 16 {
        return Err(AppError::Validation(
            "Browser nonce is invalid or expired. Start QR login again.".into(),
        ));
    }
    let mut payload = nonce.to_string();
    payload.push('|');
    payload.push_str(user_agent.unwrap_or("").trim());
    Ok(sha256_hex(&payload))
}

pub fn build_qr_value(issuer_url: &str, public_id: Uuid) -> String {
    let mut value = url::Url::parse("rooiam://device-login").expect("static QR base URL is valid");
    value
        .query_pairs_mut()
        .append_pair("server", issuer_url.trim_end_matches('/'))
        .append_pair("public_id", &public_id.to_string());
    value.to_string()
}

pub fn build_approval_payload(intent: &DeviceLoginIntent) -> String {
    format!(
        "rooiam-device-login/v1\n{}\n{}\n{}\n{}",
        intent.public_id,
        intent.display_code,
        intent.match_number,
        intent.expires_at.to_rfc3339(),
    )
}

pub fn effective_intent_status(intent: &DeviceLoginIntent) -> String {
    if intent.consumed_at.is_some() || intent.status == "consumed" {
        return "consumed".into();
    }
    if intent.expires_at <= Utc::now() {
        return "expired".into();
    }
    intent.status.clone()
}

pub(crate) fn ensure_intent_can_be_approved(intent: &DeviceLoginIntent) -> Result<(), AppError> {
    match effective_intent_status(intent).as_str() {
        "pending" => Ok(()),
        "approved" => Err(AppError::Conflict(
            "This device login request was already approved.".into(),
        )),
        "consumed" => Err(AppError::Conflict(
            "This device login request was already completed.".into(),
        )),
        "expired" => Err(AppError::Conflict(
            "This device login request has expired. Start again in the browser.".into(),
        )),
        "rejected" => Err(AppError::Conflict(
            "This device login request was already rejected on the phone. Start again in the browser.".into(),
        )),
        "cancelled" => Err(AppError::Conflict(
            "This device login request was already cancelled in the browser. Start again in the browser.".into(),
        )),
        other => Err(AppError::Conflict(format!(
            "This device login request cannot be approved (status={}).",
            other
        ))),
    }
}

pub(crate) fn ensure_intent_can_be_rejected(intent: &DeviceLoginIntent) -> Result<(), AppError> {
    match effective_intent_status(intent).as_str() {
        "pending" => Ok(()),
        "approved" => Err(AppError::Conflict(
            "This device login request was already approved and is waiting for the browser to finish signing in.".into(),
        )),
        "consumed" => Err(AppError::Conflict(
            "This device login request was already completed.".into(),
        )),
        "expired" => Err(AppError::Conflict(
            "This device login request has expired. Tell the browser to start again.".into(),
        )),
        "rejected" => Err(AppError::Conflict(
            "This device login request was already rejected.".into(),
        )),
        "cancelled" => Err(AppError::Conflict(
            "This device login request was already cancelled in the browser.".into(),
        )),
        other => Err(AppError::Conflict(format!(
            "This device login request cannot be rejected (status={}).",
            other
        ))),
    }
}

pub(crate) fn ensure_intent_can_be_completed(intent: &DeviceLoginIntent) -> Result<(), AppError> {
    match effective_intent_status(intent).as_str() {
        "approved" => Ok(()),
        "pending" => Err(AppError::Conflict(
            "This device login request is still waiting for phone approval.".into(),
        )),
        "consumed" => Err(AppError::Conflict(
            "This device login request was already completed.".into(),
        )),
        "expired" => Err(AppError::Conflict(
            "This device login request has expired. Start again in the browser.".into(),
        )),
        "rejected" => Err(AppError::Conflict(
            "This device login request was rejected on the phone. Start again in the browser."
                .into(),
        )),
        "cancelled" => Err(AppError::Conflict(
            "This device login request was already cancelled in this browser.".into(),
        )),
        other => Err(AppError::Conflict(format!(
            "This device login request cannot be completed (status={}).",
            other
        ))),
    }
}

pub(crate) fn ensure_intent_can_be_cancelled(intent: &DeviceLoginIntent) -> Result<(), AppError> {
    match effective_intent_status(intent).as_str() {
        "pending" => Ok(()),
        "approved" => Err(AppError::Conflict(
            "This device login request was already approved on the phone. Finish signing in or refresh the browser.".into(),
        )),
        "consumed" => Err(AppError::Conflict(
            "This device login request was already completed.".into(),
        )),
        "expired" => Err(AppError::Conflict(
            "This device login request has already expired.".into(),
        )),
        "rejected" => Err(AppError::Conflict(
            "This device login request was already rejected on the phone.".into(),
        )),
        "cancelled" => Err(AppError::Conflict(
            "This device login request was already cancelled.".into(),
        )),
        other => Err(AppError::Conflict(format!(
            "This device login request cannot be cancelled (status={}).",
            other
        ))),
    }
}

pub fn generate_display_code() -> String {
    let mut rng = OsRng;
    format!("{:06}", rng.gen_range(0..1_000_000))
}

pub fn generate_number_challenge() -> DeviceChallengeNumbers {
    let mut rng = OsRng;
    let match_number = rng.gen_range(10..=99);
    let choices = build_number_choices(match_number, &mut rng);
    DeviceChallengeNumbers {
        match_number,
        choices,
    }
}

fn build_number_choices<R: Rng + ?Sized>(match_number: u8, rng: &mut R) -> Vec<u8> {
    let mut values = vec![match_number];
    while values.len() < 3 {
        let candidate = rng.gen_range(10..=99);
        if !values.contains(&candidate) {
            values.push(candidate);
        }
    }
    values.shuffle(rng);
    values
}

fn generate_browser_nonce() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn generate_device_attestation_challenge() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn generate_device_attestation_challenge_token() -> String {
    let mut bytes = [0u8; 24];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

fn sha256_hex(raw: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    hex::encode(hasher.finalize())
}

fn parse_device_verifying_key(raw: &str) -> Result<VerifyingKey, AppError> {
    let normalized = validate_device_public_key(raw)
        .map_err(|_| AppError::Forbidden("Trusted device public key is invalid.".into()))?;
    let encoded = normalized
        .split_once(':')
        .map(|(_, encoded)| encoded)
        .unwrap_or(normalized.as_str());
    let key_bytes = decode_base64_bytes(encoded)
        .map_err(|_| AppError::Forbidden("Trusted device public key is unreadable.".into()))?;
    let key_bytes: [u8; 32] = key_bytes
        .try_into()
        .map_err(|_| AppError::Forbidden("Trusted device public key is invalid.".into()))?;
    VerifyingKey::from_bytes(&key_bytes)
        .map_err(|_| AppError::Forbidden("Trusted device public key is invalid.".into()))
}

#[derive(Clone, Debug)]
struct ParsedAttestationStatement {
    format: Option<String>,
    platform: Option<String>,
    key_id: Option<String>,
    app_id: Option<String>,
    environment: Option<String>,
    public_key: Option<String>,
    issued_at: Option<DateTime<Utc>>,
}

pub fn verify_device_approval_signature(
    device_public_key: &str,
    approval_payload: &str,
    approval_signature: &str,
) -> Result<(), AppError> {
    let verifying_key = parse_device_verifying_key(device_public_key)?;
    let signature_bytes = decode_base64_bytes(approval_signature.trim())
        .map_err(|_| AppError::Forbidden("Approval signature must be valid base64.".into()))?;
    let signature_bytes: [u8; 64] = signature_bytes
        .try_into()
        .map_err(|_| AppError::Forbidden("Approval signature must decode to 64 bytes.".into()))?;
    let signature = Signature::from_bytes(&signature_bytes);

    verifying_key
        .verify(approval_payload.as_bytes(), &signature)
        .map_err(|_| {
            AppError::Forbidden("Approval signature is invalid for this trusted device.".into())
        })
}

fn parse_attestation_statement(
    attestation_format: &str,
    raw: &str,
) -> Result<ParsedAttestationStatement, String> {
    let json_payload = extract_attestation_json_payload(raw)
        .map_err(|_| "Attestation statement is not valid JSON or JWS payload.".to_string())?;
    let value: serde_json::Value = serde_json::from_str(&json_payload)
        .map_err(|_| "Attestation statement JSON is invalid.".to_string())?;
    match attestation_format {
        "android-play-integrity" => parse_android_play_integrity_statement(&value),
        "ios-app-attest" => parse_ios_app_attest_statement(&value),
        _ => Ok(parse_generic_attestation_statement(&value)?),
    }
}

fn parse_generic_attestation_statement(
    value: &serde_json::Value,
) -> Result<ParsedAttestationStatement, String> {
    Ok(ParsedAttestationStatement {
        format: extract_optional_string(value, &[&["format"]]),
        platform: extract_optional_string(value, &[&["platform"]]),
        key_id: extract_optional_string(value, &[&["key_id"], &["keyId"]]),
        app_id: extract_optional_string(value, &[&["app_id"], &["appId"]]),
        environment: extract_optional_string(value, &[&["environment"]]),
        public_key: extract_optional_string(value, &[&["public_key"], &["publicKey"]]),
        issued_at: extract_issued_at(value)?,
    })
}

fn parse_android_play_integrity_statement(
    value: &serde_json::Value,
) -> Result<ParsedAttestationStatement, String> {
    let app_verdict = extract_optional_string(value, &[&["appIntegrity", "appRecognitionVerdict"]]);
    if let Some(verdict) = app_verdict.as_deref() {
        if verdict != "PLAY_RECOGNIZED" {
            return Err(format!(
                "Android Play Integrity appRecognitionVerdict '{}' is not accepted.",
                verdict
            ));
        }
    }

    let device_verdicts = value
        .get("deviceIntegrity")
        .and_then(|value| value.get("deviceRecognitionVerdict"))
        .and_then(|value| value.as_array())
        .map(|values| {
            values
                .iter()
                .filter_map(|value| value.as_str())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if !device_verdicts.is_empty()
        && !device_verdicts.iter().any(|value| {
            matches!(
                *value,
                "MEETS_DEVICE_INTEGRITY" | "MEETS_STRONG_INTEGRITY" | "MEETS_BASIC_INTEGRITY"
            )
        })
    {
        return Err("Android Play Integrity deviceRecognitionVerdict is not accepted.".into());
    }

    let package_name = extract_optional_string(
        value,
        &[
            &["requestDetails", "requestPackageName"],
            &["appIntegrity", "packageName"],
            &["app_id"],
            &["appId"],
        ],
    );
    let issued_at = extract_android_timestamp(value)?;
    let environment = extract_optional_string(value, &[&["environment"]]).or_else(|| {
        app_verdict.as_deref().map(|verdict| {
            if verdict == "PLAY_RECOGNIZED" {
                "production".to_string()
            } else {
                "unknown".to_string()
            }
        })
    });

    Ok(ParsedAttestationStatement {
        format: Some("android-play-integrity".into()),
        platform: Some("android".into()),
        key_id: extract_optional_string(value, &[&["key_id"], &["keyId"]]),
        app_id: package_name,
        environment,
        public_key: extract_optional_string(
            value,
            &[
                &["public_key"],
                &["publicKey"],
                &["deviceAttributes", "publicKey"],
            ],
        ),
        issued_at,
    })
}

fn parse_ios_app_attest_statement(
    value: &serde_json::Value,
) -> Result<ParsedAttestationStatement, String> {
    let environment =
        extract_optional_string(value, &[&["environment"], &["appAttest", "environment"]]);
    let app_id = extract_optional_string(
        value,
        &[
            &["bundle_id"],
            &["bundleId"],
            &["app_id"],
            &["appId"],
            &["appAttest", "bundleId"],
        ],
    );
    let key_id =
        extract_optional_string(value, &[&["key_id"], &["keyId"], &["appAttest", "keyId"]]);

    Ok(ParsedAttestationStatement {
        format: Some("ios-app-attest".into()),
        platform: Some("ios".into()),
        key_id,
        app_id,
        environment,
        public_key: extract_optional_string(
            value,
            &[&["public_key"], &["publicKey"], &["appAttest", "publicKey"]],
        ),
        issued_at: extract_ios_timestamp(value)?,
    })
}

fn extract_attestation_json_payload(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.starts_with('{') {
        return Ok(trimmed.to_string());
    }

    if trimmed.matches('.').count() == 2 {
        let mut parts = trimmed.split('.');
        let _header = parts.next();
        let payload = parts
            .next()
            .ok_or_else(|| "Attestation JWS is missing its payload segment.".to_string())?;
        let payload = URL_SAFE_NO_PAD
            .decode(payload)
            .or_else(|_| URL_SAFE.decode(payload))
            .map_err(|_| "Attestation JWS payload is not valid base64url.".to_string())?;
        return String::from_utf8(payload)
            .map_err(|_| "Attestation JWS payload is not valid UTF-8.".to_string());
    }

    let payload = decode_base64_bytes(trimmed)
        .map_err(|_| "Attestation statement is not valid base64.".to_string())?;
    String::from_utf8(payload)
        .map_err(|_| "Attestation statement payload is not valid UTF-8.".to_string())
}

fn verify_vendor_attestation_proof(
    attestation_format: &str,
    raw_statement: &str,
) -> Result<(), String> {
    let trimmed = raw_statement.trim();
    match attestation_format {
        "android-play-integrity" => {
            if trimmed.matches('.').count() == 2 {
                Err("This server is configured to require vendor attestation verification for Android Play Integrity, but the backend Google Play verdict verification flow is not wired yet. Keep compatibility verification enabled only, or add the Google verification adapter before enforcing this policy.".into())
            } else {
                Err("This server is configured to require vendor attestation verification for Android Play Integrity, but the trusted device only provided compatibility JSON instead of a backend-verifiable Play Integrity token.".into())
            }
        }
        "ios-app-attest" => Err("This server is configured to require vendor attestation verification for iOS App Attest, but App Attest attestation-object and certificate-chain verification is not wired yet. Keep compatibility verification enabled only, or add the Apple verification adapter before enforcing this policy.".into()),
        "android-key-attestation" => Err("This server is configured to require vendor attestation verification for Android key attestation, but certificate-chain verification is not wired yet.".into()),
        "ios-devicecheck" => Err("This server is configured to require vendor attestation verification for iOS DeviceCheck, but the Apple verification adapter is not wired yet.".into()),
        other => Err(format!(
            "This server is configured to require vendor attestation verification, but attestation format '{}' does not have a verifier.",
            other
        )),
    }
}

fn extract_optional_string(value: &serde_json::Value, paths: &[&[&str]]) -> Option<String> {
    paths
        .iter()
        .filter_map(|path| extract_path_value(value, path))
        .find_map(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn extract_issued_at(value: &serde_json::Value) -> Result<Option<DateTime<Utc>>, String> {
    if let Some(raw) = extract_optional_string(value, &[&["issued_at"], &["issuedAt"]]) {
        return chrono::DateTime::parse_from_rfc3339(&raw)
            .map(|value| value.with_timezone(&Utc))
            .map(Some)
            .map_err(|_| {
                "Attestation statement issued_at is not a valid RFC3339 timestamp.".to_string()
            });
    }

    if let Some(raw) = value.get("iat").and_then(|value| value.as_i64()) {
        let ts = chrono::DateTime::<Utc>::from_timestamp(raw, 0)
            .ok_or_else(|| "Attestation statement iat is invalid.".to_string())?;
        return Ok(Some(ts));
    }

    Ok(None)
}

fn extract_android_timestamp(value: &serde_json::Value) -> Result<Option<DateTime<Utc>>, String> {
    if let Some(raw) = extract_path_value(value, &["requestDetails", "timestampMillis"])
        .and_then(json_value_to_i64)
    {
        return chrono::DateTime::<Utc>::from_timestamp_millis(raw)
            .ok_or_else(|| "Android Play Integrity timestampMillis is invalid.".to_string())
            .map(Some);
    }

    extract_issued_at(value)
}

fn extract_ios_timestamp(value: &serde_json::Value) -> Result<Option<DateTime<Utc>>, String> {
    if let Some(raw) = extract_optional_string(
        value,
        &[
            &["receipt_creation_date"],
            &["receiptCreationDate"],
            &["appAttest", "receiptCreationDate"],
        ],
    ) {
        return chrono::DateTime::parse_from_rfc3339(&raw)
            .map(|value| value.with_timezone(&Utc))
            .map(Some)
            .map_err(|_| {
                "iOS App Attest receipt creation date is not a valid RFC3339 timestamp.".to_string()
            });
    }

    extract_issued_at(value)
}

fn extract_path_value<'a>(
    value: &'a serde_json::Value,
    path: &[&str],
) -> Option<&'a serde_json::Value> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    Some(current)
}

fn json_value_to_i64(value: &serde_json::Value) -> Option<i64> {
    value.as_i64().or_else(|| {
        value
            .as_str()
            .and_then(|raw| raw.trim().parse::<i64>().ok())
    })
}

pub(crate) fn decode_base64_bytes(raw: &str) -> Result<Vec<u8>, base64::DecodeError> {
    URL_SAFE_NO_PAD
        .decode(raw)
        .or_else(|_| URL_SAFE.decode(raw))
        .or_else(|_| STANDARD_NO_PAD.decode(raw))
        .or_else(|_| STANDARD.decode(raw))
}

fn rejected_attestation(reason: &str) -> AttestationVerificationVerdict {
    AttestationVerificationVerdict {
        status: ATTESTATION_STATUS_REJECTED,
        reason: Some(reason.to_string()),
        verified_at: None,
    }
}

fn parse_system_bool(raw: &str) -> bool {
    matches!(
        raw.trim(),
        "1" | "true" | "TRUE" | "yes" | "YES" | "on" | "ON"
    )
}

pub(crate) fn is_development_environment(raw: &str) -> bool {
    matches!(
        raw.trim().to_ascii_lowercase().as_str(),
        "development" | "debug" | "local" | "sandbox" | "staging"
    )
}

fn normalize_optional_field(
    value: &Option<String>,
    max_len: usize,
) -> Result<Option<String>, AppError> {
    let normalized = value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    if let Some(ref value) = normalized {
        if value.len() > max_len {
            return Err(AppError::Validation(format!(
                "Field is too long (max {} characters).",
                max_len
            )));
        }
    }
    Ok(normalized)
}

fn validate_optional_push_token(raw: Option<&str>) -> Result<Option<String>, AppError> {
    let Some(push_token) = raw.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };

    if push_token.len() < 16 {
        return Err(AppError::Validation(
            "Push token must be at least 16 characters long.".into(),
        ));
    }
    if push_token.len() > 4096 {
        return Err(AppError::Validation(
            "Push token is too long (max 4096 characters).".into(),
        ));
    }

    Ok(Some(push_token.to_string()))
}

fn normalize_required_field(
    raw: &str,
    empty_message: &str,
    min_len: usize,
    max_len: usize,
) -> Result<String, AppError> {
    let normalized = raw.trim();
    if normalized.is_empty() {
        return Err(AppError::Validation(empty_message.into()));
    }
    if normalized.len() < min_len {
        return Err(AppError::Validation(format!(
            "Field is too short (min {} characters).",
            min_len
        )));
    }
    if normalized.len() > max_len {
        return Err(AppError::Validation(format!(
            "Field is too long (max {} characters).",
            max_len
        )));
    }
    Ok(normalized.to_string())
}
