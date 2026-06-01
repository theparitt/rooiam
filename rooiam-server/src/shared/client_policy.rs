use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::shared::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformClientGovernance {
    pub tenant_client_management_enabled: bool,
    pub tenant_web_clients_enabled: bool,
    pub tenant_spa_clients_enabled: bool,
    pub tenant_native_clients_enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenantClientPolicy {
    pub allow_client_management: bool,
    pub allow_web_clients: bool,
    pub allow_spa_clients: bool,
    pub allow_native_clients: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EffectiveClientPolicy {
    pub allow_client_management: bool,
    pub allow_web_clients: bool,
    pub allow_spa_clients: bool,
    pub allow_native_clients: bool,
}

pub async fn load_platform_client_governance(db: &PgPool) -> Result<PlatformClientGovernance, AppError> {
    Ok(PlatformClientGovernance {
        tenant_client_management_enabled: get_system_bool(db, "tenant_client_management_enabled", true).await?,
        tenant_web_clients_enabled: get_system_bool(db, "tenant_web_clients_enabled", true).await?,
        tenant_spa_clients_enabled: get_system_bool(db, "tenant_spa_clients_enabled", true).await?,
        tenant_native_clients_enabled: get_system_bool(db, "tenant_native_clients_enabled", true).await?,
    })
}

pub async fn save_platform_client_governance(db: &PgPool, policy: &PlatformClientGovernance) -> Result<(), AppError> {
    set_system_bool(db, "tenant_client_management_enabled", policy.tenant_client_management_enabled).await?;
    set_system_bool(db, "tenant_web_clients_enabled", policy.tenant_web_clients_enabled).await?;
    set_system_bool(db, "tenant_spa_clients_enabled", policy.tenant_spa_clients_enabled).await?;
    set_system_bool(db, "tenant_native_clients_enabled", policy.tenant_native_clients_enabled).await?;
    Ok(())
}

pub async fn load_tenant_client_policy(db: &PgPool, org_id: Uuid) -> Result<TenantClientPolicy, AppError> {
    let row = sqlx::query(
        r#"
        SELECT allow_client_management, allow_web_clients, allow_spa_clients, allow_native_clients
        FROM organizations
        WHERE id = $1
        "#
    )
    .bind(org_id)
    .fetch_optional(db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load tenant client policy: {}", e)))?
    .ok_or_else(|| AppError::NotFound("Organization not found".into()))?;

    Ok(TenantClientPolicy {
        allow_client_management: row.get("allow_client_management"),
        allow_web_clients: row.get("allow_web_clients"),
        allow_spa_clients: row.get("allow_spa_clients"),
        allow_native_clients: row.get("allow_native_clients"),
    })
}

pub fn effective_client_policy(platform: &PlatformClientGovernance, tenant: &TenantClientPolicy) -> EffectiveClientPolicy {
    let allow_client_management =
        platform.tenant_client_management_enabled && tenant.allow_client_management;

    EffectiveClientPolicy {
        allow_client_management,
        allow_web_clients: allow_client_management
            && platform.tenant_web_clients_enabled
            && tenant.allow_web_clients,
        allow_spa_clients: allow_client_management
            && platform.tenant_spa_clients_enabled
            && tenant.allow_spa_clients,
        allow_native_clients: allow_client_management
            && platform.tenant_native_clients_enabled
            && tenant.allow_native_clients,
    }
}

pub fn is_client_type_allowed(policy: &EffectiveClientPolicy, app_type: &str) -> bool {
    match app_type {
        "web" => policy.allow_web_clients,
        "spa" => policy.allow_spa_clients,
        "native" => policy.allow_native_clients,
        _ => false,
    }
}

async fn get_system_bool(db: &PgPool, key: &str, default: bool) -> Result<bool, AppError> {
    let value: Option<String> = sqlx::query_scalar(
        "SELECT value FROM system_settings WHERE key = $1"
    )
    .bind(key)
    .fetch_optional(db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load system setting '{}': {}", key, e)))?;

    Ok(value
        .map(|raw| matches!(raw.trim(), "1" | "true" | "TRUE" | "yes" | "YES" | "on" | "ON"))
        .unwrap_or(default))
}

async fn set_system_bool(db: &PgPool, key: &str, value: bool) -> Result<(), AppError> {
    set_system_string(db, key, if value { "true" } else { "false" }).await
}

async fn set_system_string(db: &PgPool, key: &str, value: &str) -> Result<(), AppError> {
    sqlx::query(
        r#"
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        "#
    )
    .bind(key)
    .bind(value)
    .execute(db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to save system setting '{}': {}", key, e)))?;

    Ok(())
}
