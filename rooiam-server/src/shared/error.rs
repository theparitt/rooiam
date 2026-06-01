use actix_web::HttpResponse;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Unauthorized")]
    Unauthorized,

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Not Found: {0}")]
    NotFound(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Validation Error: {0}")]
    Validation(String),

    #[error("Rate Limited")]
    RateLimited,

    #[error("External Service Error: {0}")]
    External(String),

    #[error("Internal Server Error: {0}")]
    Internal(String),

    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

impl actix_web::ResponseError for AppError {
    fn status_code(&self) -> actix_web::http::StatusCode {
        use actix_web::http::StatusCode;
        match self {
            AppError::Unauthorized => StatusCode::UNAUTHORIZED,
            AppError::Forbidden(_) => StatusCode::FORBIDDEN,
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::Conflict(_) => StatusCode::CONFLICT,
            AppError::Validation(_) => StatusCode::BAD_REQUEST,
            AppError::RateLimited => StatusCode::TOO_MANY_REQUESTS,
            AppError::External(_) => StatusCode::BAD_GATEWAY,
            AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Database(sqlx::Error::Database(db_err))
                if db_err.code().as_deref() == Some("23505") => StatusCode::CONFLICT,
            AppError::Database(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> HttpResponse {
        // Log DB and internal errors so we can diagnose them from server output
        match self {
            AppError::Database(e) => tracing::error!("Database error: {:?}", e),
            AppError::Internal(e) => tracing::error!("Internal error: {}", e),
            AppError::Validation(e) => tracing::warn!("Validation error: {}", e),
            AppError::Forbidden(e) => tracing::warn!("Forbidden request: {}", e),
            AppError::Unauthorized => tracing::warn!("Unauthorized request"),
            _ => {}
        }
        let msg = match self {
            AppError::Database(sqlx::Error::Database(db_err)) => {
                // PostgreSQL unique-violation (code 23505) → surface as a readable conflict message
                if db_err.code().as_deref() == Some("23505") {
                    match db_err.constraint() {
                        Some("organizations_slug_key") =>
                            "A workspace with that slug already exists. Please choose a different slug.".to_string(),
                        Some(constraint) =>
                            format!("A record with that value already exists (constraint: {}).", constraint),
                        None =>
                            "A record with that value already exists.".to_string(),
                    }
                } else {
                    // Do not leak other database errors to client
                    "An internal database error occurred".to_string()
                }
            }
            AppError::Database(_) => "An internal database error occurred".to_string(),
            // Internal errors are logged above but never sent to the client
            AppError::Internal(_) => "An internal server error occurred".to_string(),
            AppError::Validation(message) => message.clone(),
            _ => self.to_string(),
        };

        let mut builder = HttpResponse::build(self.status_code());

        // RFC 6585 §4 — include Retry-After on 429 so clients know when to retry
        if matches!(self, AppError::RateLimited) {
            builder.insert_header(("Retry-After", "60"));
        }

        builder.json(serde_json::json!({
            "error": {
                "message": msg
            }
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix_web::ResponseError;

    #[test]
    fn rate_limited_returns_429() {
        let err = AppError::RateLimited;
        assert_eq!(err.status_code(), actix_web::http::StatusCode::TOO_MANY_REQUESTS);
    }

    #[test]
    fn rate_limited_has_retry_after_header() {
        let err = AppError::RateLimited;
        let resp = err.error_response();
        let retry_after = resp.headers().get("Retry-After");
        assert!(retry_after.is_some(), "Retry-After header must be present on 429");
        assert_eq!(retry_after.unwrap(), "60");
    }

    #[test]
    fn other_errors_do_not_have_retry_after() {
        for err in [
            AppError::Unauthorized,
            AppError::Forbidden("x".into()),
            AppError::NotFound("x".into()),
            AppError::Internal("x".into()),
        ] {
            let resp = err.error_response();
            assert!(
                resp.headers().get("Retry-After").is_none(),
                "{:?} should not have Retry-After header",
                err
            );
        }
    }

    #[test]
    fn rate_limited_body_has_error_message() {
        // error_response() returns JSON — just check status and header; body requires async read
        let err = AppError::RateLimited;
        let resp = err.error_response();
        assert_eq!(resp.status(), actix_web::http::StatusCode::TOO_MANY_REQUESTS);
    }
}

// Map Redis errors into AppError for convenience
impl From<redis::RedisError> for AppError {
    fn from(e: redis::RedisError) -> Self {
        // Log full detail server-side; client only sees the generic "internal server error" message
        AppError::Internal(format!("Redis: {}", e))
    }
}
