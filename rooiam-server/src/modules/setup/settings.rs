use sqlx::PgPool;

use crate::shared::error::AppError;

pub async fn get_setting(db: &PgPool, key: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>(
        "SELECT value FROM system_settings WHERE key = $1"
    )
    .bind(key)
    .fetch_optional(db)
    .await
    .unwrap_or(None)
}

pub async fn has_setting_or_env(db: &PgPool, key: &str, env_keys: &[&str]) -> bool {
    let setting_present = get_setting(db, key)
        .await
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);

    if setting_present {
        return true;
    }

    env_keys
        .iter()
        .filter_map(|env_key| std::env::var(env_key).ok())
        .any(|value| !value.trim().is_empty())
}

pub async fn set_setting(db: &PgPool, key: &str, value: &str) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO system_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()"
    )
    .bind(key)
    .bind(value)
    .execute(db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to save setup setting '{}': {}", key, e)))?;
    Ok(())
}

pub async fn platform_owner_exists(db: &PgPool) -> Result<bool, AppError> {
    let user_count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users")
        .fetch_one(db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to count existing users during setup: {}", e)))?;
    Ok(user_count > 0)
}

pub fn setup_access_mode() -> String {
    if std::env::var("ROOIAM_SETUP_TOKEN")
        .ok()
        .is_some_and(|value| !value.trim().is_empty())
    {
        "loopback_or_token".to_string()
    } else {
        "loopback_only".to_string()
    }
}
