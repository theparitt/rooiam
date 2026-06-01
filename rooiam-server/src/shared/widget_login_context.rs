use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::bootstrap::state::AppState;
use crate::shared::error::AppError;

const WIDGET_LOGIN_CONTEXT_TTL_SECONDS: usize = 900;
pub const WIDGET_LOGIN_CONTEXT_INVALID_MESSAGE: &str =
    "This hosted login session expired or was already used. Refresh and try again.";

/// Temporary hosted-widget login transaction state.
///
/// This is not the final app callback itself. It is the short-lived server-side context
/// Rooiam uses while the hosted widget starts magic-link, passkey, or provider login safely.
/// The `redirect_uri` inside this payload is the already-validated final app callback that the
/// server will use later when the login transaction completes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetLoginContextPayload {
    /// Final app callback after login. This comes from registered app config, not the widget URL.
    pub redirect_uri: String,
    pub workspace_id: Option<Uuid>,
    pub client_id: String,
    pub app_name: String,
    pub embed_origin: String,
}

/// Mint a new hosted-widget login transaction token.
pub async fn create_widget_login_context(
    state: &AppState,
    payload: WidgetLoginContextPayload,
) -> Result<String, AppError> {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let token = URL_SAFE_NO_PAD.encode(bytes);
    let redis_key = format!("widget_login_context:{}", token);
    let payload_json = serde_json::to_string(&payload)
        .map_err(|e| AppError::Internal(format!("Failed to encode widget login context payload: {}", e)))?;
    let mut redis_conn = state.redis.clone();
    let _: () = redis::cmd("SETEX")
        .arg(&redis_key)
        .arg(WIDGET_LOGIN_CONTEXT_TTL_SECONDS)
        .arg(payload_json)
        .query_async(&mut redis_conn)
        .await
        .map_err(|e| AppError::Internal(format!("Redis widget login context failure: {}", e)))?;
    Ok(token)
}

/// Read a hosted-widget login transaction without consuming it.
pub async fn resolve_widget_login_context(
    state: &AppState,
    token: Option<&str>,
) -> Result<Option<WidgetLoginContextPayload>, AppError> {
    let Some(token) = token.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let redis_key = format!("widget_login_context:{}", token);
    let mut redis_conn = state.redis.clone();
    let payload_raw: String = redis::cmd("GET")
        .arg(&redis_key)
        .query_async(&mut redis_conn)
        .await
        .map_err(|_| AppError::Validation(WIDGET_LOGIN_CONTEXT_INVALID_MESSAGE.into()))?;
    let payload = serde_json::from_str::<WidgetLoginContextPayload>(&payload_raw)
        .map_err(|_| AppError::Validation(WIDGET_LOGIN_CONTEXT_INVALID_MESSAGE.into()))?;
    Ok(Some(payload))
}

/// Consume a hosted-widget login transaction token so it cannot be replayed.
pub async fn consume_widget_login_context(
    state: &AppState,
    token: Option<&str>,
) -> Result<Option<WidgetLoginContextPayload>, AppError> {
    let Some(token) = token.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let redis_key = format!("widget_login_context:{}", token);
    let mut redis_conn = state.redis.clone();
    let (payload_raw, _deleted): (Option<String>, i32) = redis::pipe()
        .atomic()
        .cmd("GET")
        .arg(&redis_key)
        .cmd("DEL")
        .arg(&redis_key)
        .query_async(&mut redis_conn)
        .await
        .map_err(|_| AppError::Validation(WIDGET_LOGIN_CONTEXT_INVALID_MESSAGE.into()))?;
    let payload_raw = payload_raw
        .ok_or_else(|| AppError::Validation(WIDGET_LOGIN_CONTEXT_INVALID_MESSAGE.into()))?;
    let payload = serde_json::from_str::<WidgetLoginContextPayload>(&payload_raw)
        .map_err(|_| AppError::Validation(WIDGET_LOGIN_CONTEXT_INVALID_MESSAGE.into()))?;
    Ok(Some(payload))
}

pub fn is_widget_login_context_invalid_error(message: &str) -> bool {
    message.trim() == WIDGET_LOGIN_CONTEXT_INVALID_MESSAGE
}
