use sqlx::PgPool;

use crate::shared::demo_seed::demo_seed_enabled;
use crate::shared::error::AppError;

pub struct AdminAccessPolicy {
    pub demo_mode: bool,
    pub google_admin_login_enabled: bool,
    pub microsoft_admin_login_enabled: bool,
    pub admin_passkey_allowed: bool,
    pub admin_require_mfa: bool,
}

pub async fn load_admin_access_policy(db: &PgPool) -> Result<AdminAccessPolicy, AppError> {
    let demo_mode = demo_seed_enabled();
    let google_admin_login_enabled = if demo_mode {
        true
    } else {
        get_bool_setting(db, "google_admin_login_enabled", false).await?
    };
    let microsoft_admin_login_enabled = if demo_mode {
        true
    } else {
        get_bool_setting(db, "microsoft_admin_login_enabled", false).await?
    };

    Ok(AdminAccessPolicy {
        demo_mode,
        google_admin_login_enabled,
        microsoft_admin_login_enabled,
        admin_passkey_allowed: !matches!(
            get_string_setting(db, "admin_passkey_allowed").await?.as_deref(),
            Some("false")
        ),
        admin_require_mfa: matches!(
            get_string_setting(db, "admin_require_mfa").await?.as_deref(),
            Some("true")
        ),
    })
}

async fn get_bool_setting(db: &PgPool, key: &str, default: bool) -> Result<bool, AppError> {
    Ok(get_string_setting(db, key)
        .await?
        .map(|value| value == "true")
        .unwrap_or(default))
}

async fn get_string_setting(db: &PgPool, key: &str) -> Result<Option<String>, AppError> {
    sqlx::query_scalar("SELECT value FROM system_settings WHERE key = $1")
        .bind(key)
        .fetch_optional(db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to load admin access setting '{}': {}", key, e)))
}
