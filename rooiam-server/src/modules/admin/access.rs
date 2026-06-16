use actix_web::{web, HttpRequest};
use uuid::Uuid;

use crate::bootstrap::state::AppState;
use crate::http::middleware::auth::extract_session;
use crate::shared::error::AppError;

pub(super) async fn ensure_platform_staff(
    req: &HttpRequest,
    state: &web::Data<AppState>,
) -> Result<(), AppError> {
    let session = extract_session(req)?;
    ensure_platform_staff_by_user_id(session.user_id, state).await
}

pub(super) async fn ensure_platform_staff_by_user_id(
    user_id: Uuid,
    state: &web::Data<AppState>,
) -> Result<(), AppError> {
    let is_staff: Option<bool> =
        sqlx::query_scalar("SELECT (is_platform_owner OR is_superuser) FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(&state.db)
            .await?;

    match is_staff {
        Some(true) => Ok(()),
        Some(false) => Err(AppError::Forbidden(
            "Requires platform admin privileges".into(),
        )),
        None => Err(AppError::Unauthorized),
    }
}
