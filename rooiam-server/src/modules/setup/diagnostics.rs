use sqlx::PgPool;
use url::Url;

use crate::shared::error::AppError;

pub fn callback_url(issuer_url: &str, provider: &str) -> String {
    format!("{}/api/v1/auth/{provider}/callback", issuer_url.trim_end_matches('/'))
}

pub fn mask_connection_url(url: &str) -> String {
    if let Ok(mut parsed) = Url::parse(url) {
        if parsed.password().is_some() {
            let _ = parsed.set_password(Some("******"));
        }
        return parsed.to_string();
    }

    url.to_string()
}

#[derive(Default)]
pub struct DatabaseDiagnostics {
    pub url_masked: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub mode_target: String,
    pub ready: bool,
    pub migration_count: i64,
    pub latest_migration: String,
}

pub fn load_database_diagnostics(config: &crate::bootstrap::config::AppConfig) -> DatabaseDiagnostics {
    let mut diagnostics = DatabaseDiagnostics {
        url_masked: mask_connection_url(&config.database.url),
        port: 5432,
        ..DatabaseDiagnostics::default()
    };

    if let Ok(parsed) = Url::parse(&config.database.url) {
        diagnostics.name = parsed.path().trim_start_matches('/').to_string();
        diagnostics.host = parsed.host_str().unwrap_or_default().to_string();
        diagnostics.port = parsed.port().unwrap_or(5432);
        diagnostics.username = parsed.username().to_string();
    }

    diagnostics.mode_target = match config.mode {
        crate::bootstrap::config::ServerMode::Production => "rooiam".to_string(),
        crate::bootstrap::config::ServerMode::Demo => "rooiam_demo".to_string(),
        crate::bootstrap::config::ServerMode::Test => "rooiam_test".to_string(),
    };

    diagnostics
}

pub async fn enrich_database_diagnostics(
    db: &PgPool,
    mut diagnostics: DatabaseDiagnostics,
) -> Result<DatabaseDiagnostics, AppError> {
    let ready: i32 = sqlx::query_scalar("SELECT 1")
        .fetch_one(db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to verify database readiness: {}", e)))?;
    diagnostics.ready = ready == 1;

    diagnostics.migration_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM _sqlx_migrations"
    )
    .fetch_one(db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to count applied database migrations: {}", e)))?;

    diagnostics.latest_migration = sqlx::query_scalar::<_, Option<String>>(
        "SELECT description FROM _sqlx_migrations ORDER BY version DESC LIMIT 1"
    )
    .fetch_one(db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load latest database migration metadata: {}", e)))?
    .unwrap_or_else(|| "No migrations applied".to_string());

    Ok(diagnostics)
}

pub fn normalized_url_or_error(value: &str, label: &str) -> Result<String, AppError> {
    let trimmed = value.trim();
    let parsed = Url::parse(trimmed)
        .map_err(|_| AppError::Validation(format!("Invalid {}. Use a full http(s) URL.", label)))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed.to_string().trim_end_matches('/').to_string()),
        _ => Err(AppError::Validation(format!("Invalid {}. Use http:// or https://.", label))),
    }
}
