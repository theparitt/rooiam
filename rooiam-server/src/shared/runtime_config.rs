use sqlx::PgPool;
use url::Url;

use crate::bootstrap::config::{AppConfig, DeployTarget};
use crate::bootstrap::state::AppState;
use crate::shared::error::AppError;

#[derive(Clone, Debug, serde::Serialize)]
pub struct PublicUrls {
    pub issuer_url: String,
    pub frontend_url: String,
    pub admin_url: String,
}

#[derive(Clone, Debug, serde::Serialize)]
pub struct PublicUrlsDetail {
    pub issuer_url: String,
    pub issuer_url_source: String,
    pub app_url: String,
    pub app_url_source: String,
    pub enduser_url: String,
    pub enduser_url_source: String,
    pub admin_url: String,
    pub admin_url_source: String,
}

pub async fn get_setting(db: &PgPool, key: &str) -> Result<Option<String>, AppError> {
    sqlx::query_scalar("SELECT value FROM system_settings WHERE key = $1")
        .bind(key)
        .fetch_optional(db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to load runtime setting '{}': {}", key, e)))
}

pub async fn effective_public_urls(
    db: &PgPool,
    _config: &AppConfig,
) -> Result<PublicUrls, AppError> {
    Ok(PublicUrls {
        issuer_url: resolve_url(db, "issuer_url", None).await?,
        frontend_url: resolve_url(db, "app_url", None).await?,
        admin_url: resolve_url(db, "admin_url", None).await?,
    })
}

pub async fn effective_public_urls_detail(
    db: &PgPool,
    mode: &str,
) -> Result<PublicUrlsDetail, AppError> {
    let issuer = resolve_url_with_source(db, "issuer_url").await?;
    let app = resolve_url_with_source(db, "app_url").await?;
    let enduser = if mode == "demo" {
        Some(resolve_url_with_source(db, "enduser_url").await?)
    } else {
        None
    };
    let admin = resolve_url_with_source(db, "admin_url").await?;
    Ok(PublicUrlsDetail {
        issuer_url: issuer.value,
        issuer_url_source: issuer.source,
        app_url: app.value,
        app_url_source: app.source,
        enduser_url: enduser
            .as_ref()
            .map(|u| u.value.clone())
            .unwrap_or_default(),
        enduser_url_source: enduser
            .as_ref()
            .map(|u| u.source.clone())
            .unwrap_or_default(),
        admin_url: admin.value,
        admin_url_source: admin.source,
    })
}

pub async fn load_runtime_app_config(state: &AppState) -> Result<AppConfig, AppError> {
    let mut config = state.config.as_ref().clone();
    let public_urls = effective_public_urls(&state.db, &config).await?;

    config.server.issuer_url = public_urls.issuer_url.clone();
    config.server.admin_url = public_urls.admin_url.clone();

    if !config.oauth.google_redirect_uri_explicit {
        config.oauth.google_redirect_uri = format!(
            "{}/api/v1/auth/google/callback",
            config.server.issuer_url.trim_end_matches('/')
        );
    }

    if !config.oauth.microsoft_redirect_uri_explicit {
        config.oauth.microsoft_redirect_uri = format!(
            "{}/api/v1/auth/microsoft/callback",
            config.server.issuer_url.trim_end_matches('/')
        );
    }

    Ok(config)
}

pub async fn effective_enduser_url(db: &PgPool) -> Result<String, AppError> {
    resolve_url(db, "enduser_url", None).await
}

pub async fn effective_issuer_url(db: &PgPool) -> Result<String, AppError> {
    resolve_url(db, "issuer_url", None).await
}

pub async fn effective_app_url(db: &PgPool) -> Result<String, AppError> {
    resolve_url(db, "app_url", None).await
}

pub async fn effective_admin_url(db: &PgPool) -> Result<String, AppError> {
    resolve_url(db, "admin_url", None).await
}

const URL_ENV_MAPPING: &[(&str, &str)] = &[
    ("issuer_url", "ROOIAM_SERVER_URL"),
    ("app_url", "ROOIAM_APP_URL"),
    ("enduser_url", "ROOIAM_ENDUSER_URL"),
    ("admin_url", "ROOIAM_ADMIN_URL"),
];

fn get_env_key(internal_key: &str) -> &'static str {
    URL_ENV_MAPPING
        .iter()
        .find(|(k, _)| *k == internal_key)
        .map_or("ROOIAM_UNKNOWN", |(_, v)| *v)
}

struct UrlValueSource {
    value: String,
    source: String,
}

async fn resolve_url_with_source(
    db: &PgPool,
    internal_key: &str,
) -> Result<UrlValueSource, AppError> {
    let env_key = get_env_key(internal_key);
    let env_value = std::env::var(env_key).ok();
    let env_normalized = env_value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| normalize_url(value, internal_key))
        .transpose()?;

    if let Some(value) = get_setting(db, internal_key).await? {
        if !value.trim().is_empty() {
            let normalized = normalize_url(&value, internal_key)?;
            if let Some(env_normalized) = env_normalized.as_ref() {
                if should_prefer_env_over_db(env_normalized, &normalized) {
                    tracing::warn!(
                        "{} resolved from env local override: {} preferred over database value {}",
                        internal_key,
                        env_normalized,
                        normalized,
                    );
                    return Ok(UrlValueSource {
                        value: env_normalized.clone(),
                        source: format!(
                            "env ({}) [local override over database (system_settings.{})]",
                            env_key, internal_key,
                        ),
                    });
                }
            }
            tracing::debug!("{} resolved from database: {}", internal_key, normalized);
            return Ok(UrlValueSource {
                value: normalized,
                source: format!("database (system_settings.{})", internal_key),
            });
        }
    }

    let normalized = env_normalized.ok_or_else(|| {
        AppError::Validation(format!(
            "{} is not set. Required env var: {}",
            internal_key, env_key
        ))
    })?;
    tracing::debug!(
        "{} resolved from env: {} = {}",
        internal_key,
        env_key,
        normalized
    );
    Ok(UrlValueSource {
        value: normalized,
        source: format!("env ({})", env_key),
    })
}

async fn resolve_url(
    db: &PgPool,
    internal_key: &str,
    _fallback: Option<&str>,
) -> Result<String, AppError> {
    Ok(resolve_url_with_source(db, internal_key).await?.value)
}

fn normalize_url(value: &str, label: &str) -> Result<String, AppError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation(format!(
            "{} cannot be empty. Set a valid URL like https://example.com",
            label
        )));
    }

    let parsed = Url::parse(trimmed).map_err(|_| {
        AppError::Validation(format!(
            "Invalid {}: '{}'. Use a full URL like https://auth.example.com",
            label, trimmed
        ))
    })?;

    let mut normalized = parsed.to_string();
    while normalized.ends_with('/') {
        normalized.pop();
    }
    Ok(normalized)
}

fn should_prefer_env_over_db(env_url: &str, db_url: &str) -> bool {
    current_deploy_target().prefers_env_urls() && env_url != db_url
}

#[cfg(test)]
fn is_local_url(value: &str) -> bool {
    let Ok(parsed) = Url::parse(value) else {
        return false;
    };
    parsed.host_str().map(is_local_host).unwrap_or(false)
}

#[cfg(test)]
fn is_local_host(host: &str) -> bool {
    let normalized = host.trim().trim_start_matches('[').trim_end_matches(']');
    if normalized.eq_ignore_ascii_case("localhost") {
        return true;
    }
    normalized
        .parse::<std::net::IpAddr>()
        .map(|ip| ip.is_loopback())
        .unwrap_or(false)
}

fn current_deploy_target() -> DeployTarget {
    std::env::var("ROOIAM_DEPLOY_TARGET")
        .ok()
        .map(|value| value.trim().to_ascii_lowercase())
        .and_then(|value| match value.as_str() {
            "local" => Some(DeployTarget::Local),
            "public" => Some(DeployTarget::Public),
            _ => None,
        })
        .unwrap_or(DeployTarget::Local)
}

#[cfg(test)]
mod tests {
    use std::sync::{Mutex, OnceLock};

    use super::{is_local_url, should_prefer_env_over_db};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn with_env_var<T>(key: &str, value: Option<&str>, f: impl FnOnce() -> T) -> T {
        let _guard = env_lock().lock().expect("env lock poisoned");
        let previous = std::env::var(key).ok();
        match value {
            Some(value) => std::env::set_var(key, value),
            None => std::env::remove_var(key),
        }
        let result = f();
        match previous {
            Some(value) => std::env::set_var(key, value),
            None => std::env::remove_var(key),
        }
        result
    }

    #[test]
    fn local_env_overrides_remote_db_url() {
        with_env_var("ROOIAM_DEPLOY_TARGET", Some("local"), || {
            assert!(should_prefer_env_over_db(
                "http://localhost:5170",
                "https://api.rooiam.com"
            ));
        });
    }

    #[test]
    fn remote_env_does_not_override_remote_db_url() {
        with_env_var("ROOIAM_DEPLOY_TARGET", Some("public"), || {
            assert!(!should_prefer_env_over_db(
                "https://api.staging.example.com",
                "https://api.rooiam.com"
            ));
        });
    }

    #[test]
    fn loopback_urls_are_detected_as_local() {
        assert!(is_local_url("http://localhost:5171"));
        assert!(is_local_url("http://127.0.0.1:5171"));
        assert!(is_local_url("http://[::1]:5171"));
        assert!(!is_local_url("https://admin.rooiam.com"));
    }
}
