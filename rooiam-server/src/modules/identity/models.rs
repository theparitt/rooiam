use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    #[sqlx(default)]
    pub email: Option<String>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub status: String,
    pub is_platform_owner: bool,
    pub is_superuser: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_login_ip: Option<String>,
    pub last_login_ua_hash: Option<String>,
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct UserEmail {
    pub id: Uuid,
    pub user_id: Uuid,
    pub email: String, 
    pub is_primary: bool,
    pub is_verified: bool,
    pub verified_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct ExternalIdentity {
    pub id: Uuid,
    pub user_id: Uuid,
    pub provider: String,
    pub provider_user_id: String,
    pub email: Option<String>,
    pub profile_json: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LinkedProviderStatus {
    pub provider: String,
    pub linked: bool,
    pub linked_email: Option<String>,
    /// True if this provider is the user's original signup method (cannot unlink safely)
    pub is_signup_provider: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct LinkedAccountsResponse {
    pub primary_email: Option<String>,
    pub magic_link: LinkedMagicLinkStatus,
    pub providers: Vec<LinkedProviderStatus>,
    pub passkeys: usize,
    pub totp_enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct LinkedMagicLinkStatus {
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SecurityCapabilitiesResponse {
    pub current_org_id: Option<Uuid>,
    pub current_org_slug: Option<String>,
    pub passkey_supported: bool,
    pub passkey_allowed: bool,
    pub passkey_required: bool,
    pub mfa_allowed: bool,
    pub mfa_required: bool,
    pub totp_enabled: bool,
    pub backup_codes_remaining: i64,
    pub passkey_count: usize,
    pub linked_providers: Vec<String>,
    pub magic_link_enabled: bool,
    pub can_add_passkey: bool,
    pub can_remove_passkey: bool,
    pub can_enable_totp: bool,
    pub can_disable_totp: bool,
}
