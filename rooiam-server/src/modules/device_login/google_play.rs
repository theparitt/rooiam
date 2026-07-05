use chrono::{DateTime, Utc};
use jsonwebtoken::{Algorithm, EncodingKey, Header};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::bootstrap::config::AppConfig;

use super::models::UserTrustedDevice;
use super::service::DeviceAttestationPolicy;

const GOOGLE_PLAY_INTEGRITY_SCOPE: &str = "https://www.googleapis.com/auth/playintegrity";
const GOOGLE_OAUTH_GRANT_TYPE_JWT_BEARER: &str = "urn:ietf:params:oauth:grant-type:jwt-bearer";
const GOOGLE_PLAY_INTEGRITY_API_BASE: &str = "https://playintegrity.googleapis.com";

#[derive(Clone, Debug)]
pub(crate) struct GooglePlayIntegrityVerifierConfig {
    pub service_account_email: String,
    pub private_key_pem: String,
    pub token_uri: String,
}

#[derive(Clone, Debug)]
pub(crate) struct GooglePlayVerifiedAttestation {
    pub environment: String,
}

#[derive(Clone, Debug)]
pub(crate) enum GooglePlayVerificationError {
    Rejected(String),
    Unavailable(String),
}

#[derive(Serialize)]
struct GoogleServiceAccountClaims<'a> {
    iss: &'a str,
    scope: &'a str,
    aud: &'a str,
    exp: usize,
    iat: usize,
}

#[derive(Deserialize)]
struct GoogleAccessTokenResponse {
    access_token: String,
}

#[derive(Serialize)]
struct DecodeIntegrityTokenRequest<'a> {
    #[serde(rename = "integrityToken")]
    integrity_token: &'a str,
}

#[derive(Deserialize)]
struct DecodeIntegrityTokenResponse {
    #[serde(rename = "tokenPayloadExternal")]
    token_payload_external: Option<GooglePlayTokenPayloadExternal>,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct GooglePlayTokenPayloadExternal {
    #[serde(rename = "requestDetails")]
    pub request_details: GooglePlayRequestDetails,
    #[serde(rename = "appIntegrity")]
    pub app_integrity: GooglePlayAppIntegrity,
    #[serde(rename = "deviceIntegrity")]
    pub device_integrity: GooglePlayDeviceIntegrity,
    #[serde(rename = "accountDetails")]
    pub account_details: GooglePlayAccountDetails,
    #[serde(rename = "testingDetails")]
    pub testing_details: Option<GooglePlayTestingDetails>,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct GooglePlayRequestDetails {
    #[serde(rename = "requestPackageName")]
    pub request_package_name: String,
    #[serde(rename = "requestHash")]
    pub request_hash: Option<String>,
    #[serde(rename = "timestampMillis")]
    pub timestamp_millis: String,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct GooglePlayAppIntegrity {
    #[serde(rename = "appRecognitionVerdict")]
    pub app_recognition_verdict: String,
    #[serde(rename = "packageName")]
    pub package_name: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct GooglePlayDeviceIntegrity {
    #[serde(rename = "deviceRecognitionVerdict")]
    pub device_recognition_verdict: Option<Vec<String>>,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct GooglePlayAccountDetails {
    #[serde(rename = "appLicensingVerdict")]
    pub app_licensing_verdict: String,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct GooglePlayTestingDetails {
    #[serde(rename = "isTestingResponse")]
    pub is_testing_response: bool,
}

pub(crate) fn load_google_play_integrity_verifier_config(
    config: &AppConfig,
) -> Result<GooglePlayIntegrityVerifierConfig, GooglePlayVerificationError> {
    let service_account_email = config
        .device_attestation
        .google_play_service_account_email
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            GooglePlayVerificationError::Unavailable(
                "Google Play Integrity verification is required, but ROOIAM_GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL is not configured."
                    .into(),
            )
        })?;
    let private_key_pem = config
        .device_attestation
        .google_play_service_account_private_key_pem
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            GooglePlayVerificationError::Unavailable(
                "Google Play Integrity verification is required, but the Google service-account private key is not configured."
                    .into(),
            )
        })?;

    Ok(GooglePlayIntegrityVerifierConfig {
        service_account_email: service_account_email.to_string(),
        private_key_pem: private_key_pem.to_string(),
        token_uri: config
            .device_attestation
            .google_play_token_uri
            .trim()
            .to_string(),
    })
}

pub(crate) async fn decode_google_play_integrity_token(
    http_client: &Client,
    config: &GooglePlayIntegrityVerifierConfig,
    package_name: &str,
    integrity_token: &str,
) -> Result<GooglePlayTokenPayloadExternal, GooglePlayVerificationError> {
    let access_token = fetch_google_access_token(http_client, config).await?;
    let url = format!(
        "{}/v1/{}:decodeIntegrityToken",
        GOOGLE_PLAY_INTEGRITY_API_BASE,
        package_name.trim()
    );
    let response = http_client
        .post(&url)
        .bearer_auth(&access_token)
        .json(&DecodeIntegrityTokenRequest {
            integrity_token: integrity_token.trim(),
        })
        .send()
        .await
        .map_err(|error| {
            GooglePlayVerificationError::Unavailable(format!(
                "Cannot reach Google Play Integrity decode endpoint: {}",
                error
            ))
        })?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let message = format_google_api_error_body(&body);
        return if status.as_u16() == 400 {
            Err(GooglePlayVerificationError::Rejected(format!(
                "Google Play Integrity rejected this token: {}",
                message
            )))
        } else {
            Err(GooglePlayVerificationError::Unavailable(format!(
                "Google Play Integrity decode request failed (status={}): {}",
                status.as_u16(),
                message
            )))
        };
    }

    let payload: DecodeIntegrityTokenResponse = response.json().await.map_err(|error| {
        GooglePlayVerificationError::Unavailable(format!(
            "Google Play Integrity decode response was not valid JSON: {}",
            error
        ))
    })?;

    payload.token_payload_external.ok_or_else(|| {
        GooglePlayVerificationError::Rejected(
            "Google Play Integrity decode response did not include tokenPayloadExternal.".into(),
        )
    })
}

pub(crate) fn verify_google_play_token_payload(
    trusted_device: &UserTrustedDevice,
    policy: &DeviceAttestationPolicy,
    payload: &GooglePlayTokenPayloadExternal,
) -> Result<GooglePlayVerifiedAttestation, GooglePlayVerificationError> {
    let expected_public_key = trusted_device.device_public_key.as_deref().ok_or_else(|| {
        GooglePlayVerificationError::Rejected(
            "This trusted device is missing its registered public key.".into(),
        )
    })?;
    let expected_app_id = trusted_device
        .attestation_app_id
        .as_deref()
        .ok_or_else(|| {
            GooglePlayVerificationError::Rejected(
                "This trusted device is missing its registered app_id.".into(),
            )
        })?;

    if payload.request_details.request_package_name.trim() != expected_app_id {
        return Err(GooglePlayVerificationError::Rejected(
            "Google Play Integrity requestPackageName does not match the trusted device registration."
                .into(),
        ));
    }

    if let Some(package_name) = payload.app_integrity.package_name.as_deref() {
        if package_name.trim() != expected_app_id {
            return Err(GooglePlayVerificationError::Rejected(
                "Google Play Integrity packageName does not match the trusted device registration."
                    .into(),
            ));
        }
    }

    if !policy.allowed_app_ids.is_empty()
        && !policy
            .allowed_app_ids
            .iter()
            .any(|allowed| allowed == expected_app_id)
    {
        return Err(GooglePlayVerificationError::Rejected(
            "Google Play Integrity app_id is not allowed by server policy.".into(),
        ));
    }

    let expected_request_hash = build_google_play_request_hash(
        expected_public_key,
        expected_app_id,
        trusted_device.attestation_key_id.as_deref(),
        trusted_device.attestation_environment.as_deref(),
    );
    let actual_request_hash = payload
        .request_details
        .request_hash
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            GooglePlayVerificationError::Rejected(
                "Google Play Integrity requestHash is missing.".into(),
            )
        })?;
    if actual_request_hash != expected_request_hash {
        return Err(GooglePlayVerificationError::Rejected(
            "Google Play Integrity requestHash does not match the trusted device registration binding."
                .into(),
        ));
    }

    if payload.app_integrity.app_recognition_verdict != "PLAY_RECOGNIZED" {
        return Err(GooglePlayVerificationError::Rejected(format!(
            "Google Play Integrity appRecognitionVerdict '{}' is not accepted.",
            payload.app_integrity.app_recognition_verdict
        )));
    }

    let verdicts = payload
        .device_integrity
        .device_recognition_verdict
        .as_deref()
        .unwrap_or(&[]);
    if !verdicts.iter().any(|value| {
        matches!(
            value.as_str(),
            "MEETS_BASIC_INTEGRITY" | "MEETS_DEVICE_INTEGRITY" | "MEETS_STRONG_INTEGRITY"
        )
    }) {
        return Err(GooglePlayVerificationError::Rejected(
            "Google Play Integrity deviceRecognitionVerdict is not accepted.".into(),
        ));
    }

    if payload.account_details.app_licensing_verdict == "UNLICENSED" {
        return Err(GooglePlayVerificationError::Rejected(
            "Google Play Integrity reports the app as UNLICENSED on this device.".into(),
        ));
    }

    let environment = if payload
        .testing_details
        .as_ref()
        .map(|value| value.is_testing_response)
        .unwrap_or(false)
    {
        "testing"
    } else {
        "production"
    };

    if let Some(expected_environment) = trusted_device.attestation_environment.as_deref() {
        if expected_environment != environment {
            return Err(GooglePlayVerificationError::Rejected(
                "Google Play Integrity environment does not match the trusted device registration."
                    .into(),
            ));
        }
    }
    if !policy.allow_development_environments && is_development_style_environment(environment) {
        return Err(GooglePlayVerificationError::Rejected(
            "Development attestation environments are not allowed for QR login by server policy."
                .into(),
        ));
    }

    let timestamp_millis = payload
        .request_details
        .timestamp_millis
        .trim()
        .parse::<i64>()
        .map_err(|_| {
            GooglePlayVerificationError::Rejected(
                "Google Play Integrity timestampMillis is invalid.".into(),
            )
        })?;
    let issued_at = DateTime::<Utc>::from_timestamp_millis(timestamp_millis).ok_or_else(|| {
        GooglePlayVerificationError::Rejected(
            "Google Play Integrity timestampMillis is invalid.".into(),
        )
    })?;
    let now = Utc::now();
    if issued_at > now + chrono::Duration::minutes(5) {
        return Err(GooglePlayVerificationError::Rejected(
            "Google Play Integrity timestamp is too far in the future.".into(),
        ));
    }
    if issued_at < now - chrono::Duration::hours(policy.max_statement_age_hours) {
        return Err(GooglePlayVerificationError::Rejected(
            "Google Play Integrity token is too old for QR login policy.".into(),
        ));
    }

    Ok(GooglePlayVerifiedAttestation {
        environment: environment.to_string(),
    })
}

pub(crate) fn build_google_play_request_hash(
    device_public_key: &str,
    app_id: &str,
    key_id: Option<&str>,
    environment: Option<&str>,
) -> String {
    let payload = format!(
        "rooiam-google-play-attestation/v1\n{}\n{}\n{}\n{}",
        device_public_key.trim(),
        app_id.trim(),
        key_id.unwrap_or("").trim(),
        environment.unwrap_or("").trim(),
    );
    sha256_hex(&payload)
}

async fn fetch_google_access_token(
    http_client: &Client,
    config: &GooglePlayIntegrityVerifierConfig,
) -> Result<String, GooglePlayVerificationError> {
    let now = Utc::now();
    let claims = GoogleServiceAccountClaims {
        iss: &config.service_account_email,
        scope: GOOGLE_PLAY_INTEGRITY_SCOPE,
        aud: &config.token_uri,
        iat: now.timestamp() as usize,
        exp: (now + chrono::Duration::minutes(55)).timestamp() as usize,
    };
    let assertion = jsonwebtoken::encode(
        &Header::new(Algorithm::RS256),
        &claims,
        &EncodingKey::from_rsa_pem(config.private_key_pem.as_bytes()).map_err(|error| {
            GooglePlayVerificationError::Unavailable(format!(
                "Google service-account private key is invalid: {}",
                error
            ))
        })?,
    )
    .map_err(|error| {
        GooglePlayVerificationError::Unavailable(format!(
            "Failed to sign Google service-account JWT assertion: {}",
            error
        ))
    })?;

    let response = http_client
        .post(&config.token_uri)
        .form(&[
            ("grant_type", GOOGLE_OAUTH_GRANT_TYPE_JWT_BEARER),
            ("assertion", assertion.as_str()),
        ])
        .send()
        .await
        .map_err(|error| {
            GooglePlayVerificationError::Unavailable(format!(
                "Cannot reach Google OAuth token endpoint: {}",
                error
            ))
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(GooglePlayVerificationError::Unavailable(format!(
            "Google OAuth token exchange failed (status={}): {}",
            status.as_u16(),
            format_google_api_error_body(&body)
        )));
    }

    let token_response: GoogleAccessTokenResponse = response.json().await.map_err(|error| {
        GooglePlayVerificationError::Unavailable(format!(
            "Google OAuth token response was not valid JSON: {}",
            error
        ))
    })?;
    Ok(token_response.access_token)
}

fn format_google_api_error_body(body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return "empty response body".into();
    }

    serde_json::from_str::<serde_json::Value>(trimmed)
        .ok()
        .and_then(|value| {
            value
                .get("error")
                .and_then(|error| error.get("message").or_else(|| error.get("status")))
                .and_then(|value| value.as_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| trimmed.to_string())
}

fn is_development_style_environment(raw: &str) -> bool {
    matches!(
        raw.trim().to_ascii_lowercase().as_str(),
        "development" | "debug" | "local" | "sandbox" | "staging" | "testing"
    )
}

fn sha256_hex(raw: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    hex::encode(hasher.finalize())
}
