use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct UserTrustedDevice {
    pub id: Uuid,
    pub user_id: Uuid,
    pub device_label: String,
    pub platform: String,
    #[serde(skip)]
    pub device_token_hash: String,
    pub device_public_key: Option<String>,
    pub push_token: Option<String>,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct DeviceLoginIntent {
    pub id: Uuid,
    pub public_id: Uuid,
    pub browser_binding_hash: String,
    pub nonce_hash: String,
    pub workspace_id: Option<Uuid>,
    pub oauth_client_id: Option<Uuid>,
    pub redirect_uri: Option<String>,
    pub surface: Option<String>,
    pub display_code: String,
    pub match_number: i16,
    pub decoy_numbers: Vec<i16>,
    pub approved_user_id: Option<Uuid>,
    pub approved_device_id: Option<Uuid>,
    pub status: String,
    pub status_reason: Option<String>,
    pub requester_ip: Option<String>,
    pub requester_user_agent: Option<String>,
    pub approved_at: Option<DateTime<Utc>>,
    pub consumed_at: Option<DateTime<Utc>>,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrustedDevicePlatform {
    Android,
    Ios,
}

impl TrustedDevicePlatform {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Android => "android",
            Self::Ios => "ios",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "android" => Some(Self::Android),
            "ios" => Some(Self::Ios),
            _ => None,
        }
    }
}
