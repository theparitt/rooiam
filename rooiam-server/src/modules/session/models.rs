use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, sqlx::FromRow, Serialize, Deserialize)]
pub struct Session {
    pub id: Uuid,
    pub user_id: Uuid,
    pub current_org_id: Option<Uuid>,
    pub login_surface: Option<String>,
    pub login_app_name: Option<String>,
    pub login_workspace_slug: Option<String>,
    // internal field, never serialized out to client APIs
    #[serde(skip)]
    pub session_secret_hash: String,
    pub user_agent: Option<String>,
    pub ip: Option<std::net::IpAddr>,
    pub last_seen_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    /// Server-side binding fingerprint: sha256(device_class/ip_subnet).
    /// NULL for sessions created before session binding was introduced.
    #[serde(skip)]
    pub session_fingerprint: Option<String>,
}

/// The structure of the extracted active session injected into the request by the SessionMiddleware.
#[derive(Debug, Clone)]
pub struct ActiveSession {
    pub session_id: Uuid,
    pub user_id: Uuid,
    pub current_org_id: Option<Uuid>,
    pub login_surface: Option<String>,
    /// Cached from users.is_superuser at session verification time.
    /// Used to route IP policy: superusers are checked against platform admin policy,
    /// not tenant policy, because their current_org_id changes as they navigate workspaces.
    pub is_superuser: bool,
    /// When the session was originally created — used to enforce max_session_age_hours.
    pub created_at: DateTime<Utc>,
    /// Last activity timestamp — used to enforce idle_timeout_minutes.
    pub last_seen_at: DateTime<Utc>,
    /// Fingerprint stored at session creation time (sha256 of device_class/ip_subnet).
    /// NULL for sessions created before session binding was introduced.
    pub session_fingerprint: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct SessionCreateContext {
    pub user_agent: Option<String>,
    pub ip: Option<std::net::IpAddr>,
    pub current_org_id: Option<Uuid>,
    pub login_surface: Option<String>,
    pub login_app_name: Option<String>,
    pub login_workspace_slug: Option<String>,
}
