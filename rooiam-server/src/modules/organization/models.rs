use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, sqlx::FromRow, Serialize, Deserialize)]
pub struct Organization {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub login_display_name: Option<String>,
    pub login_title: Option<String>,
    pub login_subtitle: Option<String>,
    pub icon_url: Option<String>,
    pub login_logo_url: Option<String>,
    pub brand_color: Option<String>,
    pub show_login_logo: bool,
    pub show_login_title: bool,
    pub show_login_subtitle: bool,
    pub show_powered_by: bool,
    pub widget_radius: String,
    pub widget_shadow: String,
    pub icon_container: String,
    pub login_logo_container: String,
    pub login_logo_size: String,
    pub card_radius: String,
    pub button_style: String,
    pub card_bg_style: String,
    pub card_bg_color2: Option<String>,
    pub card_border_width: String,
    pub card_border_color: Option<String>,
    pub login_method_order: Vec<String>,
    pub allow_magic_link: bool,
    pub allow_google: bool,
    pub allow_microsoft: bool,
    pub allow_passkey: bool,
    pub require_mfa: bool,
    pub allow_client_management: bool,
    pub allow_web_clients: bool,
    pub allow_spa_clients: bool,
    pub allow_native_clients: bool,
    pub allowed_email_domains: String,
    pub max_session_age_hours: Option<i32>,
    pub magic_link_expiry_minutes: Option<i32>,
    pub oidc_access_token_ttl_minutes: Option<i32>,
    pub refresh_token_ttl_days: Option<i32>,
    pub idle_timeout_minutes: Option<i32>,
    pub require_mfa_for_admins: bool,
    pub tenant_portal_require_mfa: bool,
    pub max_concurrent_sessions: Option<i32>,
    pub magic_link_rate_limit_admin_override: Option<i32>,
    pub magic_link_rate_window_admin_override: Option<i32>,
    pub magic_link_rate_limit_staff_override: Option<i32>,
    pub magic_link_rate_window_staff_override: Option<i32>,
    pub status: String,
    pub platform_locked: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct OrganizationMember {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub user_id: Uuid,
    pub role: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct OrganizationMemberView {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub user_id: Uuid,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub email: Option<String>,
    pub role_names: Vec<String>,
    pub role_codes: Vec<String>,
    pub last_seen_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct OrganizationInvite {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub email: String,
    pub token_hash: String,
    pub inviter_user_id: Uuid,
    pub expires_at: DateTime<Utc>,
    pub used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct OrganizationInviteSummary {
    pub id: Uuid,
    pub email: String,
    pub inviter_display_name: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct OrganizationRoleSummary {
    pub code: String,
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
pub struct OrganizationActivityItem {
    pub id: i64,
    pub actor_user_id: Option<Uuid>,
    pub actor_display_name: Option<String>,
    pub actor_email: Option<String>,
    pub action: String,
    pub target_type: String,
    pub target_id: Option<String>,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
}
