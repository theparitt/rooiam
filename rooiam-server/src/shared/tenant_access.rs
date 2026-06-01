use serde::{Deserialize, Serialize};
use sqlx::PgPool;

use crate::shared::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenantAccessPolicy {
    pub allow_magic_link: bool,
    pub allow_google: bool,
    pub allow_microsoft: bool,
    pub allow_passkey: bool,
}

pub async fn load_tenant_access_policy(db: &PgPool) -> Result<TenantAccessPolicy, AppError> {
    Ok(TenantAccessPolicy {
        allow_magic_link: get_system_bool(db, "tenant_login_magic_link_enabled", true).await?,
        allow_google: get_system_bool(db, "tenant_login_google_enabled", true).await?,
        allow_microsoft: get_system_bool(db, "tenant_login_microsoft_enabled", true).await?,
        allow_passkey: get_system_bool(db, "tenant_login_passkey_enabled", true).await?,
    })
}

pub async fn save_tenant_access_policy(db: &PgPool, policy: &TenantAccessPolicy) -> Result<(), AppError> {
    set_system_bool(db, "tenant_login_magic_link_enabled", policy.allow_magic_link).await?;
    set_system_bool(db, "tenant_login_google_enabled", policy.allow_google).await?;
    set_system_bool(db, "tenant_login_microsoft_enabled", policy.allow_microsoft).await?;
    set_system_bool(db, "tenant_login_passkey_enabled", policy.allow_passkey).await?;
    Ok(())
}

async fn get_system_bool(db: &PgPool, key: &str, default: bool) -> Result<bool, AppError> {
    let value: Option<String> = sqlx::query_scalar(
        "SELECT value FROM system_settings WHERE key = $1"
    )
    .bind(key)
    .fetch_optional(db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load tenant access setting '{}': {}", key, e)))?;

    Ok(value
        .map(|raw| matches!(raw.trim(), "1" | "true" | "TRUE" | "yes" | "YES" | "on" | "ON"))
        .unwrap_or(default))
}

async fn set_system_bool(db: &PgPool, key: &str, value: bool) -> Result<(), AppError> {
    sqlx::query(
        r#"
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        "#
    )
    .bind(key)
    .bind(if value { "true" } else { "false" })
    .execute(db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to save tenant access setting '{}': {}", key, e)))?;

    Ok(())
}
