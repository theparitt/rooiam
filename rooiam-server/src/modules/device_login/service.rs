use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, Utc};
use rand::{rngs::OsRng, seq::SliceRandom, Rng, RngCore};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::shared::error::AppError;

use super::models::{DeviceLoginIntent, TrustedDevicePlatform, UserTrustedDevice};
use super::repository::{DeviceLoginRepository, NewDeviceLoginIntent};

pub struct RegisterTrustedDeviceInput {
    pub device_label: String,
    pub platform: String,
    pub device_token: String,
    pub device_public_key: Option<String>,
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
}

impl DeviceLoginService {
    pub fn new(repo: DeviceLoginRepository) -> Self {
        Self { repo }
    }

    pub async fn register_trusted_device(
        &self,
        user_id: Uuid,
        input: RegisterTrustedDeviceInput,
    ) -> Result<UserTrustedDevice, AppError> {
        let device_label = validate_device_label(&input.device_label)?;
        let platform = validate_platform(&input.platform)?;
        let device_token_hash = hash_device_token(&input.device_token)?;
        let device_public_key = normalize_optional(&input.device_public_key);

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

        let intent = self
            .repo
            .get_device_login_intent_by_public_id(public_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Device login request not found.".into()))?;

        match effective_intent_status(&intent).as_str() {
            "pending" => {}
            "approved" => {
                return Err(AppError::Conflict(
                    "This device login request was already approved.".into(),
                ));
            }
            "consumed" => {
                return Err(AppError::Conflict(
                    "This device login request was already completed.".into(),
                ));
            }
            "expired" => {
                return Err(AppError::Conflict(
                    "This device login request has expired. Start again in the browser.".into(),
                ));
            }
            other => {
                return Err(AppError::Conflict(format!(
                    "This device login request cannot be approved (status={}).",
                    other
                )));
            }
        }

        if selected_number != intent.match_number as u8 {
            return Err(AppError::Validation(
                "The selected number does not match the browser challenge.".into(),
            ));
        }

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

        Ok(approved)
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

        match effective_intent_status(&intent).as_str() {
            "approved" => {}
            "pending" => {
                return Err(AppError::Conflict(
                    "This device login request is still waiting for phone approval.".into(),
                ));
            }
            "consumed" => {
                return Err(AppError::Conflict(
                    "This device login request was already completed.".into(),
                ));
            }
            "expired" => {
                return Err(AppError::Conflict(
                    "This device login request has expired. Start again in the browser.".into(),
                ));
            }
            other => {
                return Err(AppError::Conflict(format!(
                    "This device login request cannot be completed (status={}).",
                    other
                )));
            }
        }

        let nonce_hash = hash_browser_nonce(browser_nonce)?;
        self.repo
            .consume_approved_device_login_intent(public_id, &nonce_hash)
            .await?
            .ok_or_else(|| {
                AppError::Conflict(
                    "This device login request was already completed or expired.".into(),
                )
            })
    }
}

fn normalize_optional(value: &Option<String>) -> Option<String> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
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

pub fn effective_intent_status(intent: &DeviceLoginIntent) -> String {
    if intent.consumed_at.is_some() || intent.status == "consumed" {
        return "consumed".into();
    }
    if intent.expires_at <= Utc::now() {
        return "expired".into();
    }
    intent.status.clone()
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

fn sha256_hex(raw: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    hex::encode(hasher.finalize())
}
