use actix_web::{web, HttpRequest, HttpResponse};

use crate::bootstrap::state::AppState;
use crate::modules::admin::access::ensure_platform_staff;
use crate::shared::error::AppError;
use crate::shared::storage_config::{
    load_platform_storage_config, save_platform_storage_config, set_minio_bucket_public_read,
    test_local_storage, test_minio_roundtrip, test_minio_storage, PlatformStorageConfigUpdate,
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

    // When MinIO is the effective backend, make the bucket public-read so the
    // browser can load uploaded branding/avatars. Best-effort: a failure here
    // does not block saving — the operator can still fix the bucket manually.
    if cfg.backend == crate::shared::storage_config::StorageBackend::Minio
        && !cfg.minio_endpoint.trim().is_empty()
        && !cfg.minio_bucket.trim().is_empty()
        && !cfg.minio_access_key.trim().is_empty()
    {
        let secret = sqlx::query_scalar::<_, String>(
            "SELECT value FROM system_settings WHERE key = 'storage_minio_secret_key'",
        )
        .fetch_optional(&state.db)
        .await?
        .unwrap_or_default();
        if !secret.trim().is_empty() {
            if let Err(e) = set_minio_bucket_public_read(
                &cfg.minio_endpoint,
                &cfg.minio_bucket,
                &cfg.minio_access_key,
                &secret,
                cfg.minio_use_ssl,
            )
            .await
            {
                tracing::warn!(
                    "Saved MinIO storage config but could not set bucket public-read: {}",
                    e
                );
            }
        }
    }

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
                Ok(msg) => {
                    Ok(HttpResponse::Ok().json(serde_json::json!({ "ok": true, "message": msg })))
                }
                Err(e) => Err(AppError::Validation(e)),
            }
        }
        "minio" => {
            let endpoint = body
                .minio_endpoint
                .as_deref()
                .unwrap_or("")
                .trim()
                .to_string();
            let bucket = body
                .minio_bucket
                .as_deref()
                .unwrap_or("")
                .trim()
                .to_string();
            let access_key = body
                .minio_access_key
                .as_deref()
                .unwrap_or("")
                .trim()
                .to_string();
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
                Ok(msg) => {
                    // Uploaded branding/avatars must be anonymously readable so a
                    // browser can load them. Ensure the bucket is public-read; a
                    // failure here is non-fatal (the connection itself is OK) — we
                    // just surface it in the message so the operator can fix it.
                    let public = match set_minio_bucket_public_read(
                        &endpoint,
                        &bucket,
                        &access_key,
                        &secret_key,
                        use_ssl,
                    )
                    .await
                    {
                        Ok(_) => "Bucket set to public-read.".to_string(),
                        Err(e) => format!("WARNING: could not set bucket public-read: {}", e),
                    };

                    // Real round-trip: write a probe object and read it back
                    // anonymously (exactly like a browser). This is the test that
                    // actually proves uploaded images will be visible. If it fails,
                    // surface it as a hard error so the operator sees the problem now.
                    match test_minio_roundtrip(
                        &endpoint,
                        &bucket,
                        &access_key,
                        &secret_key,
                        use_ssl,
                    )
                    .await
                    {
                        Ok(rt) => Ok(HttpResponse::Ok().json(serde_json::json!({
                            "ok": true,
                            "message": format!("{} {} {}", msg, public, rt),
                        }))),
                        Err(rt) => Err(AppError::Validation(format!("{} {}", public, rt))),
                    }
                }
                Err(e) => Err(AppError::Validation(e)),
            }
        }
        other => Err(AppError::Validation(format!(
            "Unknown storage backend '{}'. Use 'local' or 'minio'.",
            other
        ))),
    }
}
