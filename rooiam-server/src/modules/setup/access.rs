use std::net::IpAddr;

use actix_web::{web, HttpRequest};
use sqlx::PgPool;

use crate::bootstrap::state::AppState;
use crate::modules::session::{
    cookie::ROOIAM_SESSION_COOKIE, repository::SessionRepository, service::SessionService,
};
use crate::shared::error::AppError;
use crate::shared::request_ip::client_ip_from_http_request;

pub async fn is_setup_completed(db: &PgPool) -> Result<bool, AppError> {
    Ok(get_setting(db, "setup_completed")
        .await
        .map(|value| value.as_deref() == Some("true"))
        .unwrap_or(false))
}

pub async fn ensure_platform_owner(
    req: &HttpRequest,
    state: &web::Data<AppState>,
) -> Result<(), AppError> {
    let session = load_authenticated_session(req, state).await?;
    let is_owner: Option<bool> =
        sqlx::query_scalar("SELECT is_platform_owner FROM users WHERE id = $1")
            .bind(session.user_id)
            .fetch_optional(&state.db)
            .await
            .map_err(|e| {
                AppError::Internal(format!("Failed to check platform owner access: {}", e))
            })?;

    match is_owner {
        Some(true) => Ok(()),
        _ => Err(AppError::Forbidden(
            "Requires platform owner privileges".into(),
        )),
    }
}

pub async fn ensure_platform_staff(
    req: &HttpRequest,
    state: &web::Data<AppState>,
) -> Result<(), AppError> {
    let session = load_authenticated_session(req, state).await?;
    let is_staff: Option<bool> =
        sqlx::query_scalar("SELECT (is_platform_owner OR is_superuser) FROM users WHERE id = $1")
            .bind(session.user_id)
            .fetch_optional(&state.db)
            .await
            .map_err(|e| {
                AppError::Internal(format!("Failed to check platform admin access: {}", e))
            })?;

    match is_staff {
        Some(true) => Ok(()),
        _ => Err(AppError::Forbidden(
            "Requires platform admin privileges".into(),
        )),
    }
}

pub async fn ensure_setup_access(
    req: &HttpRequest,
    state: &web::Data<AppState>,
) -> Result<(), AppError> {
    if is_setup_completed(&state.db).await? {
        ensure_platform_owner(req, state).await?;
        return Ok(());
    }

    if setup_request_is_trusted(req, state.config.as_ref()) {
        return Ok(());
    }

    Err(AppError::Forbidden(
        "Initial setup is restricted to loopback requests or callers that present a valid ROOIAM_SETUP_TOKEN.".into()
    ))
}

pub async fn ensure_platform_staff_or_setup_access(
    req: &HttpRequest,
    state: &web::Data<AppState>,
) -> Result<(), AppError> {
    if is_setup_completed(&state.db).await? {
        return ensure_platform_staff(req, state).await;
    }

    ensure_setup_access(req, state).await
}

pub async fn load_authenticated_session(
    req: &HttpRequest,
    state: &web::Data<AppState>,
) -> Result<crate::modules::session::models::ActiveSession, AppError> {
    let token = req
        .cookie(ROOIAM_SESSION_COOKIE)
        .map(|cookie| cookie.value().to_string())
        .ok_or(AppError::Unauthorized)?;

    let session_service =
        SessionService::new(SessionRepository::new(state.db.clone()), state.db.clone());
    session_service.verify_opaque_session(&token).await
}

async fn get_setting(db: &PgPool, key: &str) -> Result<Option<String>, AppError> {
    sqlx::query_scalar("SELECT value FROM system_settings WHERE key = $1")
        .bind(key)
        .fetch_optional(db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to load setup setting '{}': {}", key, e)))
}

fn setup_request_is_trusted(
    req: &HttpRequest,
    config: &crate::bootstrap::config::AppConfig,
) -> bool {
    if setup_request_has_valid_token(req) {
        return true;
    }

    extract_setup_request_ip(req, config).is_some_and(|ip| ip.is_loopback())
}

fn setup_request_has_valid_token(req: &HttpRequest) -> bool {
    let expected = std::env::var("ROOIAM_SETUP_TOKEN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let Some(expected) = expected else {
        return false;
    };

    let provided = req
        .headers()
        .get("x-rooiam-setup-token")
        .and_then(|value| value.to_str().ok())
        .or_else(|| {
            req.query_string().split('&').find_map(|pair| {
                let (key, value) = pair.split_once('=')?;
                if key == "setup_token" {
                    Some(value)
                } else {
                    None
                }
            })
        })
        .map(str::trim)
        .filter(|value| !value.is_empty());

    matches!(provided, Some(value) if value == expected)
}

fn extract_setup_request_ip(
    req: &HttpRequest,
    config: &crate::bootstrap::config::AppConfig,
) -> Option<IpAddr> {
    client_ip_from_http_request(req, config)
}
