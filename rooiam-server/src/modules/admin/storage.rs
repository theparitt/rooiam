use actix_web::{web, HttpRequest, HttpResponse};

use crate::bootstrap::state::AppState;
use crate::modules::admin::access::ensure_platform_staff;
use crate::shared::error::AppError;
use crate::shared::storage_config::{
    load_platform_storage_config, save_platform_storage_config, test_local_storage,
    test_minio_storage, PlatformStorageConfigUpdate,
};

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TestStorageRequest {
    pub backend: String,
    pub local_path: Option<String>,
    pub minio_endpoint: Option<String>,
    pub minio_bucket: Option<String>,
    pub minio_access_key: Option<String>,
    pub minio_secret_key: Option<String>,
    pub minio_use_ssl: Option<bool>,
}

pub async fn get_storage_config(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let cfg = load_platform_storage_config(&state.db).await?;
    Ok(HttpResponse::Ok().json(cfg))
}

pub async fn update_storage_config(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<PlatformStorageConfigUpdate>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let cfg = save_platform_storage_config(&state.db, &body).await?;
    Ok(HttpResponse::Ok().json(cfg))
}

pub async fn test_storage_config(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<TestStorageRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;

    match body.backend.trim().to_lowercase().as_str() {
        "local" => {
            let path = body.local_path.as_deref().unwrap_or("").trim();
            match test_local_storage(path) {
                Ok(msg) => Ok(HttpResponse::Ok().json(serde_json::json!({ "ok": true, "message": msg }))),
                Err(e) => Err(AppError::Validation(e)),
            }
        }
        "minio" => {
            let endpoint = body.minio_endpoint.as_deref().unwrap_or("").trim().to_string();
            let bucket = body.minio_bucket.as_deref().unwrap_or("").trim().to_string();
            let access_key = body.minio_access_key.as_deref().unwrap_or("").trim().to_string();
            let use_ssl = body.minio_use_ssl.unwrap_or(true);

            let secret_key = if let Some(ref sk) = body.minio_secret_key {
                if sk.trim().is_empty() {
                    sqlx::query_scalar::<_, String>(
                        "SELECT value FROM system_settings WHERE key = 'storage_minio_secret_key'",
                    )
                    .fetch_optional(&state.db)
                    .await?
                    .unwrap_or_default()
                } else {
                    sk.trim().to_string()
                }
            } else {
                sqlx::query_scalar::<_, String>(
                    "SELECT value FROM system_settings WHERE key = 'storage_minio_secret_key'",
                )
                .fetch_optional(&state.db)
                .await?
                .unwrap_or_default()
            };

            match test_minio_storage(&endpoint, &bucket, &access_key, &secret_key, use_ssl).await {
                Ok(msg) => Ok(HttpResponse::Ok().json(serde_json::json!({ "ok": true, "message": msg }))),
                Err(e) => Err(AppError::Validation(e)),
            }
        }
        other => Err(AppError::Validation(format!(
            "Unknown storage backend '{}'. Use 'local' or 'minio'.",
            other
        ))),
    }
}
