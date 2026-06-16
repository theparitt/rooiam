use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::path::Path;

use crate::bootstrap::config::AppConfig;
use crate::shared::error::AppError;

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum StorageBackend {
    Local,
    Minio,
}

impl StorageBackend {
    pub fn as_str(&self) -> &'static str {
        match self {
            StorageBackend::Local => "local",
            StorageBackend::Minio => "minio",
        }
    }

    fn from_str(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "minio" => StorageBackend::Minio,
            _ => StorageBackend::Local,
        }
    }
}

/// The full platform storage configuration as returned to the API.
/// Secret key is never included in responses — only `minio_secret_key_configured` is set.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformStorageConfig {
    pub backend: StorageBackend,
    pub backend_configured: bool,
    // local
    pub local_path: String,
    // minio
    pub minio_endpoint: String,
    pub minio_bucket: String,
    pub minio_access_key: String,
    pub minio_secret_key: String,
    pub minio_secret_key_configured: bool,
    pub minio_use_ssl: bool,
}

// ── DB helpers ───────────────────────────────────────────────────────────────

async fn get(db: &PgPool, key: &str) -> String {
    sqlx::query_scalar::<_, String>("SELECT value FROM system_settings WHERE key = $1")
        .bind(key)
        .fetch_optional(db)
        .await
        .unwrap_or(None)
        .unwrap_or_default()
}

fn env_value(key: &str) -> String {
    std::env::var(key)
        .unwrap_or_default()
        .trim_end_matches('\r')
        .to_string()
}

async fn set(db: &PgPool, key: &str, value: &str) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()",
    )
    .bind(key)
    .bind(value)
    .execute(db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to save storage setting '{}': {}", key, e)))?;
    Ok(())
}

// ── Load / Save ──────────────────────────────────────────────────────────────

pub async fn load_platform_storage_config(db: &PgPool) -> Result<PlatformStorageConfig, AppError> {
    let backend_setting = get(db, "storage_backend").await;
    let local_path_setting = get(db, "storage_local_path").await;
    let minio_endpoint_setting = get(db, "storage_minio_endpoint").await;
    let minio_bucket_setting = get(db, "storage_minio_bucket").await;
    let minio_access_key_setting = get(db, "storage_minio_access_key").await;
    let minio_secret_setting = get(db, "storage_minio_secret_key").await;
    let minio_use_ssl_setting = get(db, "storage_minio_use_ssl").await;

    let env_local_path = env_value("ROOIAM_STORAGE_ROOT");
    let env_minio_endpoint = env_value("ROOIAM_MINIO_ENDPOINT");
    let env_minio_bucket = env_value("ROOIAM_MINIO_BUCKET");
    let env_minio_access_key = env_value("ROOIAM_MINIO_USER");
    let env_minio_secret = env_value("ROOIAM_MINIO_PASSWORD");

    // Migration 0029 seeds `storage_backend=local` and `storage_minio_use_ssl=true`
    // for every fresh database. That is useful as a schema baseline, but it should
    // not override the Docker stack defaults during first-time setup. Treat that
    // exact seed state as "not configured yet" and fall back to env defaults.
    let legacy_seeded_local = backend_setting.trim() == "local"
        && local_path_setting.trim().is_empty()
        && minio_endpoint_setting.trim().is_empty()
        && minio_bucket_setting.trim().is_empty()
        && minio_access_key_setting.trim().is_empty()
        && minio_secret_setting.trim().is_empty()
        && (minio_use_ssl_setting.trim().is_empty() || minio_use_ssl_setting.trim() == "true");

    let backend_configured = !backend_setting.trim().is_empty() && !legacy_seeded_local;
    let backend = if backend_setting.trim().is_empty() || legacy_seeded_local {
        if !env_minio_endpoint.trim().is_empty()
            && !env_minio_bucket.trim().is_empty()
            && !env_minio_access_key.trim().is_empty()
        {
            StorageBackend::Minio
        } else {
            StorageBackend::Local
        }
    } else {
        StorageBackend::from_str(&backend_setting)
    };

    let local_path = if local_path_setting.trim().is_empty() {
        env_local_path
    } else {
        local_path_setting
    };
    let minio_endpoint = if minio_endpoint_setting.trim().is_empty() {
        env_minio_endpoint
    } else {
        minio_endpoint_setting
    };
    let minio_bucket = if minio_bucket_setting.trim().is_empty() {
        env_minio_bucket
    } else {
        minio_bucket_setting
    };
    let minio_access_key = if minio_access_key_setting.trim().is_empty() {
        env_minio_access_key
    } else {
        minio_access_key_setting
    };
    let minio_secret = if minio_secret_setting.trim().is_empty() {
        env_minio_secret
    } else {
        minio_secret_setting
    };
    let minio_use_ssl = if legacy_seeded_local || minio_use_ssl_setting.trim().is_empty() {
        minio_endpoint.trim().starts_with("https://")
    } else {
        minio_use_ssl_setting.trim() != "false"
    };

    Ok(PlatformStorageConfig {
        backend,
        backend_configured,
        local_path,
        minio_endpoint,
        minio_bucket,
        minio_access_key,
        minio_secret_key: String::new(), // never sent in responses
        minio_secret_key_configured: !minio_secret.trim().is_empty(),
        minio_use_ssl,
    })
}

pub async fn save_platform_storage_config(
    db: &PgPool,
    cfg: &PlatformStorageConfigUpdate,
) -> Result<PlatformStorageConfig, AppError> {
    set(db, "storage_backend", cfg.backend.as_str()).await?;

    // local
    set(db, "storage_local_path", cfg.local_path.trim()).await?;

    // minio
    set(db, "storage_minio_endpoint", cfg.minio_endpoint.trim()).await?;
    set(db, "storage_minio_bucket", cfg.minio_bucket.trim()).await?;
    set(db, "storage_minio_access_key", cfg.minio_access_key.trim()).await?;
    if let Some(ref secret) = cfg.minio_secret_key {
        if !secret.trim().is_empty() {
            set(db, "storage_minio_secret_key", secret).await?;
        }
    }
    set(
        db,
        "storage_minio_use_ssl",
        if cfg.minio_use_ssl { "true" } else { "false" },
    )
    .await?;

    load_platform_storage_config(db).await
}

fn build_public_asset_url(public_media_base: &str, relative_path: &str) -> String {
    format!(
        "{}/{}",
        public_media_base.trim_end_matches('/'),
        relative_path.trim_start_matches('/')
    )
}

async fn load_effective_minio_secret(db: &PgPool) -> String {
    sqlx::query_scalar::<_, String>(
        "SELECT value FROM system_settings WHERE key = 'storage_minio_secret_key'",
    )
    .fetch_optional(db)
    .await
    .unwrap_or(None)
    .filter(|value| !value.trim().is_empty())
    .unwrap_or_else(|| std::env::var("ROOIAM_MINIO_PASSWORD").unwrap_or_default())
}

pub async fn store_public_asset(
    db: &PgPool,
    config: &AppConfig,
    relative_path: &str,
    bytes: &[u8],
    content_type: Option<&str>,
) -> Result<String, AppError> {
    let storage = load_platform_storage_config(db).await?;
    match storage.backend {
        StorageBackend::Local => {
            let absolute_path = format!(
                "{}/{}",
                config.storage.root.trim_end_matches('/'),
                relative_path.trim_start_matches('/')
            );
            if let Some(parent) = Path::new(&absolute_path).parent() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    AppError::Internal(format!("Could not create upload directory: {}", e))
                })?;
            }
            std::fs::write(&absolute_path, bytes)
                .map_err(|e| AppError::Internal(format!("Could not store uploaded file: {}", e)))?;
        }
        StorageBackend::Minio => {
            let secret = load_effective_minio_secret(db).await;
            if storage.minio_endpoint.trim().is_empty()
                || storage.minio_bucket.trim().is_empty()
                || storage.minio_access_key.trim().is_empty()
                || secret.trim().is_empty()
            {
                return Err(AppError::Internal(
                    "MinIO is the selected storage backend, but the effective MinIO configuration is incomplete.".into(),
                ));
            }
            put_minio_object(
                &storage.minio_endpoint,
                &storage.minio_bucket,
                relative_path,
                bytes,
                content_type.unwrap_or("application/octet-stream"),
                &storage.minio_access_key,
                &secret,
                storage.minio_use_ssl,
            )
            .await
            .map_err(AppError::Internal)?;
        }
    }

    Ok(build_public_asset_url(
        &config.storage.public_media_base,
        relative_path,
    ))
}

pub async fn delete_public_asset(
    db: &PgPool,
    config: &AppConfig,
    asset_url: &str,
) -> Result<(), AppError> {
    let storage = load_platform_storage_config(db).await?;
    let public_base = config.storage.public_media_base.trim_end_matches('/');
    let relative_path = match asset_url.strip_prefix(public_base) {
        Some(relative) => relative.trim_start_matches('/'),
        None => return Ok(()),
    };

    match storage.backend {
        StorageBackend::Local => {
            let old_path = format!(
                "{}/{}",
                config.storage.root.trim_end_matches('/'),
                relative_path
            );
            let _ = std::fs::remove_file(&old_path);
        }
        StorageBackend::Minio => {
            let secret = load_effective_minio_secret(db).await;
            if storage.minio_endpoint.trim().is_empty()
                || storage.minio_bucket.trim().is_empty()
                || storage.minio_access_key.trim().is_empty()
                || secret.trim().is_empty()
            {
                return Ok(());
            }
            let _ = delete_minio_object(
                &storage.minio_endpoint,
                &storage.minio_bucket,
                relative_path,
                &storage.minio_access_key,
                &secret,
                storage.minio_use_ssl,
            )
            .await;
        }
    }

    Ok(())
}

/// Incoming PATCH/POST body — secret key is optional (omit to keep existing).
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PlatformStorageConfigUpdate {
    pub backend: StorageBackend,
    pub local_path: String,
    pub minio_endpoint: String,
    pub minio_bucket: String,
    pub minio_access_key: String,
    pub minio_secret_key: Option<String>,
    pub minio_use_ssl: bool,
}

// ── Test helpers ─────────────────────────────────────────────────────────────

/// Test a local path by attempting to create a temporary file and read it back.
pub fn test_local_storage(path: &str) -> Result<String, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("Local path is required.".into());
    }

    let dir = Path::new(path);
    if !dir.exists() {
        std::fs::create_dir_all(dir)
            .map_err(|e| format!("Cannot create directory '{}': {}", path, e))?;
    }
    if !dir.is_dir() {
        return Err(format!("'{}' exists but is not a directory.", path));
    }

    let test_file = dir.join(".rooiam_storage_test");
    std::fs::write(&test_file, b"rooiam-storage-test")
        .map_err(|e| format!("Cannot write to '{}': {}", path, e))?;
    std::fs::remove_file(&test_file)
        .map_err(|e| format!("Cannot clean up test file in '{}': {}", path, e))?;

    Ok(format!("Local path '{}' is writable.", path))
}

/// Test a MinIO connection using the reqwest HTTP client (no extra crate needed).
/// Performs a HEAD request on the bucket to verify credentials and connectivity.
pub async fn test_minio_storage(
    endpoint: &str,
    bucket: &str,
    access_key: &str,
    secret_key: &str,
    use_ssl: bool,
) -> Result<String, String> {
    let region = "us-east-1";
    let endpoint = endpoint.trim();
    let bucket = bucket.trim();
    let access_key = access_key.trim();
    let secret_key = secret_key.trim();

    if endpoint.is_empty() {
        return Err("MinIO endpoint is required.".into());
    }
    if bucket.is_empty() {
        return Err("MinIO bucket name is required.".into());
    }
    if access_key.is_empty() {
        return Err("MinIO access key is required.".into());
    }
    if secret_key.is_empty() {
        return Err("MinIO secret key is required.".into());
    }

    // Build the base URL (strip trailing slash, prepend scheme if missing)
    let base = {
        let e = endpoint.trim_end_matches('/');
        if e.starts_with("http://") || e.starts_with("https://") {
            e.to_string()
        } else if use_ssl {
            format!("https://{}", e)
        } else {
            format!("http://{}", e)
        }
    };

    let region_str = region;

    // We use AWS Signature V4 (hand-rolled minimal version) for the HEAD /bucket request.
    // This avoids pulling in an S3 SDK just for health-check purposes.
    let url = format!("{}/{}", base, bucket);
    let host = url::Url::parse(&url)
        .map_err(|e| format!("Invalid MinIO endpoint URL: {}", e))?
        .host_str()
        .unwrap_or(endpoint)
        .to_string();

    let now = chrono::Utc::now();
    let date_stamp = now.format("%Y%m%d").to_string();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();

    // Canonical request for HEAD /<bucket>
    let canonical_uri = format!("/{}", bucket);
    let canonical_querystring = "";
    let canonical_headers = format!("host:{}\nx-amz-date:{}\n", host, amz_date);
    let signed_headers = "host;x-amz-date";
    let payload_hash = hex_sha256(b"");

    let canonical_request = format!(
        "HEAD\n{}\n{}\n{}\n{}\n{}",
        canonical_uri, canonical_querystring, canonical_headers, signed_headers, payload_hash
    );

    // String to sign
    let credential_scope = format!("{}/{}/s3/aws4_request", date_stamp, region_str);
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{}\n{}\n{}",
        amz_date,
        credential_scope,
        hex_sha256(canonical_request.as_bytes())
    );

    // Signing key
    let signing_key = derive_signing_key(secret_key, &date_stamp, region_str, "s3");
    let signature = hex_hmac_sha256(&signing_key, string_to_sign.as_bytes());

    let auth_header = format!(
        "AWS4-HMAC-SHA256 Credential={}/{},SignedHeaders={},Signature={}",
        access_key, credential_scope, signed_headers, signature
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let resp = client
        .head(&url)
        .header("host", &host)
        .header("x-amz-date", &amz_date)
        .header("authorization", auth_header)
        .send()
        .await
        .map_err(|e| format!("Cannot reach MinIO at '{}': {}", base, e))?;

    match resp.status().as_u16() {
        200 | 204 => Ok(format!(
            "MinIO connected. Bucket '{}' on '{}' is accessible.",
            bucket, base
        )),
        301 | 307 | 308 => Err(format!(
            "MinIO returned redirect ({}). Check endpoint URL and region.",
            resp.status()
        )),
        403 => Err("MinIO returned 403 Forbidden. Check access key and secret key.".into()),
        404 => Err(format!(
            "Bucket '{}' not found. Create it in MinIO first.",
            bucket
        )),
        301..=399 => Err(format!("Unexpected redirect from MinIO: {}", resp.status())),
        _ => Err(format!(
            "MinIO returned unexpected status {}.",
            resp.status()
        )),
    }
}

/// Ensure a MinIO bucket exists, creating it if necessary.
/// Uses the same hand-rolled AWS Signature V4 as `test_minio_storage`.
/// Returns `Ok(())` if the bucket already exists or was created successfully.
pub async fn ensure_minio_bucket_exists(
    endpoint: &str,
    bucket: &str,
    access_key: &str,
    secret_key: &str,
) -> Result<(), String> {
    let endpoint = endpoint.trim();
    let bucket = bucket.trim();
    let access_key = access_key.trim();
    let secret_key = secret_key.trim();
    let region = "us-east-1";

    let base = {
        let e = endpoint.trim_end_matches('/');
        if e.starts_with("http://") || e.starts_with("https://") {
            e.to_string()
        } else {
            format!("http://{}", e)
        }
    };
    let region_str = region;
    let url = format!("{}/{}", base, bucket);
    let host = url::Url::parse(&url)
        .map_err(|e| format!("Invalid MinIO endpoint: {}", e))?
        .host_str()
        .unwrap_or(endpoint)
        .to_string();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    // 1. HEAD: check if bucket already exists.
    {
        let now = chrono::Utc::now();
        let date_stamp = now.format("%Y%m%d").to_string();
        let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
        let canonical_headers = format!("host:{}\nx-amz-date:{}\n", host, amz_date);
        let payload_hash = hex_sha256(b"");
        let canonical_request = format!(
            "HEAD\n/{}\n\n{}\nhost;x-amz-date\n{}",
            bucket, canonical_headers, payload_hash
        );
        let credential_scope = format!("{}/{}/s3/aws4_request", date_stamp, region_str);
        let string_to_sign = format!(
            "AWS4-HMAC-SHA256\n{}\n{}\n{}",
            amz_date,
            credential_scope,
            hex_sha256(canonical_request.as_bytes())
        );
        let signing_key = derive_signing_key(secret_key, &date_stamp, region_str, "s3");
        let signature = hex_hmac_sha256(&signing_key, string_to_sign.as_bytes());
        let auth = format!(
            "AWS4-HMAC-SHA256 Credential={}/{},SignedHeaders=host;x-amz-date,Signature={}",
            access_key, credential_scope, signature
        );
        let resp = client
            .head(&url)
            .header("host", &host)
            .header("x-amz-date", &amz_date)
            .header("authorization", auth)
            .send()
            .await
            .map_err(|e| format!("Cannot reach MinIO: {}", e))?;
        if resp.status().is_success() {
            return Ok(()); // bucket already exists
        }
        if resp.status().as_u16() != 404 {
            return Err(format!("MinIO HEAD bucket returned {}", resp.status()));
        }
    }

    // 2. PUT: create the bucket.
    {
        // For non-default regions, S3 requires a CreateBucketConfiguration body.
        let (body_bytes, content_type): (Vec<u8>, &str) = if region_str == "us-east-1" {
            (Vec::new(), "application/octet-stream")
        } else {
            let xml = format!(
                "<CreateBucketConfiguration><LocationConstraint>{}</LocationConstraint></CreateBucketConfiguration>",
                region_str
            );
            (xml.into_bytes(), "application/xml")
        };
        let payload_hash = hex_sha256(&body_bytes);
        let now = chrono::Utc::now();
        let date_stamp = now.format("%Y%m%d").to_string();
        let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
        let content_length = body_bytes.len().to_string();
        let canonical_headers = format!(
            "content-length:{}\ncontent-type:{}\nhost:{}\nx-amz-date:{}\n",
            content_length, content_type, host, amz_date
        );
        let canonical_request = format!(
            "PUT\n/{}\n\n{}\ncontent-length;content-type;host;x-amz-date\n{}",
            bucket, canonical_headers, payload_hash
        );
        let credential_scope = format!("{}/{}/s3/aws4_request", date_stamp, region_str);
        let string_to_sign = format!(
            "AWS4-HMAC-SHA256\n{}\n{}\n{}",
            amz_date,
            credential_scope,
            hex_sha256(canonical_request.as_bytes())
        );
        let signing_key = derive_signing_key(secret_key, &date_stamp, region_str, "s3");
        let signature = hex_hmac_sha256(&signing_key, string_to_sign.as_bytes());
        let auth = format!(
            "AWS4-HMAC-SHA256 Credential={}/{},SignedHeaders=content-length;content-type;host;x-amz-date,Signature={}",
            access_key, credential_scope, signature
        );
        let resp = client
            .put(&url)
            .header("host", &host)
            .header("x-amz-date", &amz_date)
            .header("content-type", content_type)
            .header("content-length", content_length)
            .header("authorization", auth)
            .body(body_bytes)
            .send()
            .await
            .map_err(|e| format!("Cannot reach MinIO: {}", e))?;
        let status = resp.status().as_u16();
        if status == 200 || status == 204 || status == 409 {
            // 409 = BucketAlreadyOwnedByYou — that's fine
            return Ok(());
        }
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("MinIO PUT bucket returned {}: {}", status, body));
    }
}

async fn put_minio_object(
    endpoint: &str,
    bucket: &str,
    key: &str,
    body: &[u8],
    content_type: &str,
    access_key: &str,
    secret_key: &str,
    use_ssl: bool,
) -> Result<(), String> {
    let endpoint = endpoint.trim();
    let bucket = bucket.trim();
    let key = key.trim_start_matches('/');
    let access_key = access_key.trim();
    let secret_key = secret_key.trim();
    let region = "us-east-1";

    let base = if endpoint.starts_with("http://") || endpoint.starts_with("https://") {
        endpoint.trim_end_matches('/').to_string()
    } else if use_ssl {
        format!("https://{}", endpoint.trim_end_matches('/'))
    } else {
        format!("http://{}", endpoint.trim_end_matches('/'))
    };
    let url = format!("{}/{}/{}", base, bucket, key);
    let host = url::Url::parse(&url)
        .map_err(|e| format!("Invalid MinIO endpoint: {}", e))?
        .host_str()
        .unwrap_or(endpoint)
        .to_string();
    let now = chrono::Utc::now();
    let date_stamp = now.format("%Y%m%d").to_string();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let payload_hash = hex_sha256(body);
    let content_length = body.len().to_string();
    let canonical_headers = format!(
        "content-length:{}\ncontent-type:{}\nhost:{}\nx-amz-content-sha256:{}\nx-amz-date:{}\n",
        content_length, content_type, host, payload_hash, amz_date
    );
    let signed_headers = "content-length;content-type;host;x-amz-content-sha256;x-amz-date";
    let canonical_request = format!(
        "PUT\n/{}/{}\n\n{}\n{}\n{}",
        bucket, key, canonical_headers, signed_headers, payload_hash
    );
    let credential_scope = format!("{}/{}/s3/aws4_request", date_stamp, region);
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{}\n{}\n{}",
        amz_date,
        credential_scope,
        hex_sha256(canonical_request.as_bytes())
    );
    let signing_key = derive_signing_key(secret_key, &date_stamp, region, "s3");
    let signature = hex_hmac_sha256(&signing_key, string_to_sign.as_bytes());
    let auth = format!(
        "AWS4-HMAC-SHA256 Credential={}/{},SignedHeaders={},Signature={}",
        access_key, credential_scope, signed_headers, signature
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;
    let resp = client
        .put(&url)
        .header("host", &host)
        .header("x-amz-date", &amz_date)
        .header("x-amz-content-sha256", payload_hash)
        .header("content-type", content_type)
        .header("content-length", content_length)
        .header("authorization", auth)
        .body(body.to_vec())
        .send()
        .await
        .map_err(|e| format!("cannot reach host {} ({})", host, e))?;
    let status = resp.status().as_u16();
    if status == 200 || status == 201 || status == 204 {
        Ok(())
    } else if status == 403 {
        Err(format!(
            "access denied (HTTP 403) — check the access key / secret key for bucket '{}'",
            bucket
        ))
    } else if status == 404 {
        Err(format!(
            "bucket '{}' not found (HTTP 404) — create it first",
            bucket
        ))
    } else {
        let body = resp.text().await.unwrap_or_default();
        Err(format!("PUT returned HTTP {}: {}", status, body))
    }
}

/// Set an anonymous public-read (download-only) bucket policy so a browser can
/// load uploaded branding/avatar assets directly. Equivalent to
/// `mc anonymous set download <bucket>`. Allows only `s3:GetObject` on
/// `bucket/*` — no anonymous listing, uploads, or deletes.
pub async fn set_minio_bucket_public_read(
    endpoint: &str,
    bucket: &str,
    access_key: &str,
    secret_key: &str,
    use_ssl: bool,
) -> Result<(), String> {
    let endpoint = endpoint.trim();
    let bucket = bucket.trim();
    let access_key = access_key.trim();
    let secret_key = secret_key.trim();
    let region = "us-east-1";

    let policy = format!(
        r#"{{"Version":"2012-10-17","Statement":[{{"Effect":"Allow","Principal":{{"AWS":["*"]}},"Action":["s3:GetObject"],"Resource":["arn:aws:s3:::{}/*"]}}]}}"#,
        bucket
    );
    let body = policy.into_bytes();

    let base = if endpoint.starts_with("http://") || endpoint.starts_with("https://") {
        endpoint.trim_end_matches('/').to_string()
    } else if use_ssl {
        format!("https://{}", endpoint.trim_end_matches('/'))
    } else {
        format!("http://{}", endpoint.trim_end_matches('/'))
    };
    // PUT /{bucket}?policy= — the policy subresource. Note the canonical query
    // string is "policy=" (empty value), which must be signed.
    let url = format!("{}/{}?policy=", base, bucket);
    let host = url::Url::parse(&url)
        .map_err(|e| format!("Invalid MinIO endpoint: {}", e))?
        .host_str()
        .unwrap_or(endpoint)
        .to_string();
    let now = chrono::Utc::now();
    let date_stamp = now.format("%Y%m%d").to_string();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let payload_hash = hex_sha256(&body);
    let content_length = body.len().to_string();
    let canonical_headers = format!(
        "content-length:{}\nhost:{}\nx-amz-content-sha256:{}\nx-amz-date:{}\n",
        content_length, host, payload_hash, amz_date
    );
    let signed_headers = "content-length;host;x-amz-content-sha256;x-amz-date";
    let canonical_request = format!(
        "PUT\n/{}\npolicy=\n{}\n{}\n{}",
        bucket, canonical_headers, signed_headers, payload_hash
    );
    let credential_scope = format!("{}/{}/s3/aws4_request", date_stamp, region);
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{}\n{}\n{}",
        amz_date,
        credential_scope,
        hex_sha256(canonical_request.as_bytes())
    );
    let signing_key = derive_signing_key(secret_key, &date_stamp, region, "s3");
    let signature = hex_hmac_sha256(&signing_key, string_to_sign.as_bytes());
    let auth = format!(
        "AWS4-HMAC-SHA256 Credential={}/{},SignedHeaders={},Signature={}",
        access_key, credential_scope, signed_headers, signature
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;
    let resp = client
        .put(&url)
        .header("host", &host)
        .header("x-amz-date", &amz_date)
        .header("x-amz-content-sha256", payload_hash)
        .header("content-length", content_length)
        .header("authorization", auth)
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Cannot reach MinIO: {}", e))?;
    let status = resp.status().as_u16();
    if status == 200 || status == 204 {
        Ok(())
    } else {
        let body = resp.text().await.unwrap_or_default();
        Err(format!(
            "MinIO set bucket policy returned {}: {}",
            status, body
        ))
    }
}

/// Full real-world round-trip: write a small probe object (authenticated), read
/// it back WITHOUT credentials (anonymous, exactly like a browser would), then
/// delete it. This is the test that actually matters for branding/avatars —
/// "the connection works" is not enough; the object must be publicly readable.
///
/// Returns Ok(message) describing what passed, or Err(message) naming the exact
/// step that failed (write / anonymous-read / cleanup).
pub async fn test_minio_roundtrip(
    endpoint: &str,
    bucket: &str,
    access_key: &str,
    secret_key: &str,
    use_ssl: bool,
) -> Result<String, String> {
    let probe_key = format!("uploads/_healthcheck/{}.txt", uuid::Uuid::new_v4());
    let probe_body = b"rooiam-storage-roundtrip";

    let base = if endpoint.starts_with("http://") || endpoint.starts_with("https://") {
        endpoint.trim_end_matches('/').to_string()
    } else if use_ssl {
        format!("https://{}", endpoint.trim_end_matches('/'))
    } else {
        format!("http://{}", endpoint.trim_end_matches('/'))
    };

    // 1. WRITE the probe (authenticated PUT). Names the host on failure so the
    //    operator can see "can't reach 1.2.3.4:9000" vs "access denied".
    if let Err(e) = put_minio_object(
        endpoint,
        bucket,
        &probe_key,
        probe_body,
        "text/plain",
        access_key,
        secret_key,
        use_ssl,
    )
    .await
    {
        return Err(format!(
            "[WRITE FAILED] Could not upload a test object to bucket '{}' at {}: {}",
            bucket, base, e
        ));
    }

    // 2. READ it back ANONYMOUSLY (no auth) — exactly what a browser does.
    let read_url = format!("{}/{}/{}", base, bucket.trim(), probe_key);
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
    {
        Ok(c) => c,
        Err(e) => return Err(format!("[READ FAILED] Could not build HTTP client: {}", e)),
    };
    let read_result = client.get(&read_url).send().await;

    // 3. DELETE the probe (cleanup). Best-effort, but report if it fails so the
    //    operator knows a stray test object was left behind.
    let delete_err = delete_minio_object(
        endpoint, bucket, &probe_key, access_key, secret_key, use_ssl,
    )
    .await
    .err();

    // Evaluate the anonymous read.
    let read_outcome: Result<(), String> = match read_result {
        Ok(resp) => {
            let status = resp.status().as_u16();
            if status == 200 {
                let got = resp.bytes().await.unwrap_or_default();
                if got.as_ref() == probe_body {
                    Ok(())
                } else {
                    Err("[READ FAILED] Anonymous read returned 200 but the content did not match — a proxy/CDN in front of MinIO is rewriting responses.".into())
                }
            } else if status == 403 {
                Err(format!(
                    "[READ FAILED] Upload worked, but anonymous read of {} was DENIED (HTTP 403). The bucket '{}' is not public-read — browsers cannot load uploaded images.",
                    read_url, bucket
                ))
            } else if status == 404 {
                Err(format!(
                    "[READ FAILED] Upload worked, but anonymous read of {} returned 404 (NoSuchKey). Either the bucket is private (MinIO hides existence from anonymous callers) or this endpoint does not serve bucket '{}'.",
                    read_url, bucket
                ))
            } else {
                Err(format!(
                    "[READ FAILED] Upload worked, but anonymous read of {} returned HTTP {}.",
                    read_url, status
                ))
            }
        }
        Err(e) => Err(format!(
            "[READ FAILED] Upload worked, but could not reach {} for the anonymous read: {}",
            read_url, e
        )),
    };

    // Read failure is the important one — surface it (mention cleanup if that also failed).
    if let Err(read_msg) = read_outcome {
        return match delete_err {
            Some(de) => Err(format!(
                "{} (Also: [DELETE FAILED] could not remove the test object: {})",
                read_msg, de
            )),
            None => Err(read_msg),
        };
    }

    // Read passed. If only the cleanup failed, that's a soft warning, not a hard error.
    match delete_err {
        Some(de) => Ok(format!(
            "Round-trip OK: uploaded a test object and read it back anonymously (bucket is public-read). WARNING: [DELETE FAILED] could not remove the test object: {}",
            de
        )),
        None => Ok("Round-trip OK: uploaded a test object, read it back anonymously (bucket is public-read), and cleaned it up.".into()),
    }
}

async fn delete_minio_object(
    endpoint: &str,
    bucket: &str,
    key: &str,
    access_key: &str,
    secret_key: &str,
    use_ssl: bool,
) -> Result<(), String> {
    let endpoint = endpoint.trim();
    let bucket = bucket.trim();
    let key = key.trim_start_matches('/');
    let access_key = access_key.trim();
    let secret_key = secret_key.trim();
    let region = "us-east-1";

    let base = if endpoint.starts_with("http://") || endpoint.starts_with("https://") {
        endpoint.trim_end_matches('/').to_string()
    } else if use_ssl {
        format!("https://{}", endpoint.trim_end_matches('/'))
    } else {
        format!("http://{}", endpoint.trim_end_matches('/'))
    };
    let url = format!("{}/{}/{}", base, bucket, key);
    let host = url::Url::parse(&url)
        .map_err(|e| format!("Invalid MinIO endpoint: {}", e))?
        .host_str()
        .unwrap_or(endpoint)
        .to_string();
    let now = chrono::Utc::now();
    let date_stamp = now.format("%Y%m%d").to_string();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let payload_hash = hex_sha256(b"");
    let canonical_headers = format!(
        "host:{}\nx-amz-content-sha256:{}\nx-amz-date:{}\n",
        host, payload_hash, amz_date
    );
    let signed_headers = "host;x-amz-content-sha256;x-amz-date";
    let canonical_request = format!(
        "DELETE\n/{}/{}\n\n{}\n{}\n{}",
        bucket, key, canonical_headers, signed_headers, payload_hash
    );
    let credential_scope = format!("{}/{}/s3/aws4_request", date_stamp, region);
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{}\n{}\n{}",
        amz_date,
        credential_scope,
        hex_sha256(canonical_request.as_bytes())
    );
    let signing_key = derive_signing_key(secret_key, &date_stamp, region, "s3");
    let signature = hex_hmac_sha256(&signing_key, string_to_sign.as_bytes());
    let auth = format!(
        "AWS4-HMAC-SHA256 Credential={}/{},SignedHeaders={},Signature={}",
        access_key, credential_scope, signed_headers, signature
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;
    let resp = client
        .delete(&url)
        .header("host", &host)
        .header("x-amz-date", &amz_date)
        .header("x-amz-content-sha256", payload_hash)
        .header("authorization", auth)
        .send()
        .await
        .map_err(|e| format!("Cannot reach MinIO: {}", e))?;
    let status = resp.status().as_u16();
    if status == 200 || status == 204 || status == 404 {
        Ok(())
    } else {
        let body = resp.text().await.unwrap_or_default();
        Err(format!("MinIO DELETE object returned {}: {}", status, body))
    }
}

// ── AWS Signature V4 helpers ─────────────────────────────────────────────────
// Minimal implementation — only used for the health-check HEAD request.

fn hex_sha256(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(data);
    hex::encode(h.finalize())
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    use sha2::Sha256;
    hmac::hmac_sha256_raw(key, data, std::marker::PhantomData::<Sha256>)
}

fn hex_hmac_sha256(key: &[u8], data: &[u8]) -> String {
    hex::encode(hmac_sha256(key, data))
}

fn derive_signing_key(secret: &str, date: &str, region: &str, service: &str) -> Vec<u8> {
    let k_date = hmac_sha256(format!("AWS4{}", secret).as_bytes(), date.as_bytes());
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, service.as_bytes());
    hmac_sha256(&k_service, b"aws4_request")
}

// Minimal HMAC-SHA256 without pulling in the `hmac` crate — use sha2 directly.
mod hmac {
    use sha2::{Digest, Sha256};
    use std::marker::PhantomData;

    const BLOCK_SIZE: usize = 64;

    pub fn hmac_sha256_raw(key: &[u8], data: &[u8], _: PhantomData<Sha256>) -> Vec<u8> {
        let key_block = if key.len() > BLOCK_SIZE {
            let mut h = Sha256::new();
            h.update(key);
            let hash = h.finalize();
            let mut block = [0u8; BLOCK_SIZE];
            block[..hash.len()].copy_from_slice(&hash);
            block.to_vec()
        } else {
            let mut block = vec![0u8; BLOCK_SIZE];
            block[..key.len()].copy_from_slice(key);
            block
        };

        let ipad: Vec<u8> = key_block.iter().map(|b| b ^ 0x36).collect();
        let opad: Vec<u8> = key_block.iter().map(|b| b ^ 0x5c).collect();

        let mut inner = Sha256::new();
        inner.update(&ipad);
        inner.update(data);
        let inner_hash = inner.finalize();

        let mut outer = Sha256::new();
        outer.update(&opad);
        outer.update(inner_hash.as_slice());
        outer.finalize().to_vec()
    }
}
