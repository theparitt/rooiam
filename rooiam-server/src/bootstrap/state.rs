use super::config::AppConfig;
use crate::shared::storage_config::{load_platform_storage_config, StorageBackend};
use anyhow::Context;
use sqlx::postgres::PgPoolOptions;
use std::fs;
use std::process::Command;
use std::sync::Arc;
use url::Url;

pub struct AppState {
    pub db: sqlx::PgPool,
    pub redis: redis::aio::ConnectionManager,
    pub config: Arc<AppConfig>,
    /// Process start time — used to report uptime on /metrics.
    pub started_at: std::time::Instant,
    // Here we will eventually inject:
    // pub auth_service: Arc<AuthService>,
}

impl AppState {
    pub async fn new(config: &AppConfig) -> Result<Self, anyhow::Error> {
        println!();
        println!("  Rooiam — startup checks");
        println!("  ─────────────────────────────────────────");

        // ── PostgreSQL ──────────────────────────────────────────────────────
        let pg_label = format!("PostgreSQL   {}", mask_connection_url(&config.database.url));
        let pool_size: u32 = std::env::var("ROOIAM_DB_POOL_SIZE")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(20);
        let db = match PgPoolOptions::new()
            .max_connections(pool_size)
            .acquire_timeout(std::time::Duration::from_secs(5))
            .idle_timeout(std::time::Duration::from_secs(600))
            .connect(&config.database.url)
            .await
        {
            Ok(pool) => {
                ok(&pg_label);
                pool
            }
            Err(e) => {
                fail(&pg_label, &format!("Is the database running? {}", e));
                return Err(anyhow::anyhow!(
                    "Cannot connect to PostgreSQL at {}: {}",
                    mask_connection_url(&config.database.url),
                    e
                ));
            }
        };

        // ── Migrations ──────────────────────────────────────────────────────
        match sqlx::migrate!("./migrations").run(&db).await {
            Ok(_) => ok("Migrations"),
            Err(e) => {
                fail("Migrations", &e.to_string());
                return Err(anyhow::anyhow!("Database migration failed: {}", e));
            }
        }

        // ── Storage backend ────────────────────────────────────────────────
        let effective_storage = load_platform_storage_config(&db)
            .await
            .map_err(|e| anyhow::anyhow!("Cannot load platform storage config: {}", e))?;
        let storage_label = format!("Storage dir  {}", &config.storage.root);
        match effective_storage.backend {
            StorageBackend::Local => match fs::create_dir_all(&config.storage.root)
                .and_then(|_| fs::create_dir_all(format!("{}/uploads", &config.storage.root)))
            {
                Ok(_) => ok(&storage_label),
                Err(e) => {
                    fail(&storage_label, &e.to_string());
                    return Err(anyhow::anyhow!(
                        "Cannot create storage directory '{}': {}",
                        &config.storage.root,
                        e
                    ));
                }
            },
            StorageBackend::Minio => {
                skip(&format!("{} (effective backend is MinIO)", storage_label));
            }
        }

        // ── Redis ───────────────────────────────────────────────────────────
        let redis_label = format!("Redis        {}", mask_connection_url(&config.redis.url));
        let redis_manager = match redis::Client::open(config.redis.url.clone())
            .context("Invalid Redis URL")
            .and_then(|c| Ok(c))
        {
            Ok(client) => match client.get_connection_manager().await {
                Ok(mgr) => {
                    ok(&redis_label);
                    mgr
                }
                Err(e) => {
                    fail(&redis_label, &format!("Is Redis running? {}", e));
                    return Err(anyhow::anyhow!(
                        "Cannot connect to Redis at {}: {}",
                        mask_connection_url(&config.redis.url),
                        e
                    ));
                }
            },
            Err(e) => {
                fail(&redis_label, &e.to_string());
                return Err(e);
            }
        };

        // ── MinIO (effective config, from DB first) ────────────────────────
        {
            let stored_secret = sqlx::query_scalar::<_, String>(
                "SELECT value FROM system_settings WHERE key = 'storage_minio_secret_key'",
            )
            .fetch_optional(&db)
            .await
            .unwrap_or(None)
            .unwrap_or_default();

            let endpoint = effective_storage.minio_endpoint.trim().to_string();
            let bucket = effective_storage.minio_bucket.trim().to_string();
            let access = effective_storage.minio_access_key.trim().to_string();
            let secret = if !stored_secret.trim().is_empty() {
                stored_secret.trim().to_string()
            } else {
                std::env::var("ROOIAM_MINIO_PASSWORD").unwrap_or_default()
            };

            if matches!(effective_storage.backend, StorageBackend::Minio) {
                let label = format!("MinIO        {}/{}", endpoint.trim_end_matches('/'), bucket);
                if endpoint.is_empty()
                    || bucket.is_empty()
                    || access.is_empty()
                    || secret.trim().is_empty()
                {
                    fail(&label, "Effective backend is MinIO, but endpoint, bucket, access key, or secret key is missing.");
                    println!("            Hint: set ROOIAM_MINIO_ENDPOINT, ROOIAM_MINIO_BUCKET, ROOIAM_MINIO_USER, and ROOIAM_MINIO_PASSWORD.");
                    println!("            Local default: http://localhost:9000 bucket=rooiam user=rooiam password=rooiam_secret");
                    return Err(anyhow::anyhow!(
                        "Storage backend is MinIO, but the effective MinIO configuration is incomplete."
                    ));
                }
                match crate::shared::storage_config::test_minio_storage(
                    &endpoint,
                    &bucket,
                    &access,
                    &secret,
                    effective_storage.minio_use_ssl,
                )
                .await
                {
                    Ok(_) => ok(&label),
                    Err(e) => {
                        let mut final_error = e.clone();
                        if should_attempt_local_minio_boot(&endpoint) {
                            if let Some(message) = try_start_local_docker_service(
                                "rooiam-minio",
                                &[
                                    "run",
                                    "-d",
                                    "--name",
                                    "rooiam-minio",
                                    "-p",
                                    "9000:9000",
                                    "-p",
                                    "9001:9001",
                                    "-e",
                                    "MINIO_ROOT_USER=rooiam",
                                    "-e",
                                    "MINIO_ROOT_PASSWORD=rooiam_secret",
                                    "minio/minio",
                                    "server",
                                    "/data",
                                    "--console-address",
                                    ":9001",
                                ],
                            ) {
                                println!("            Auto-start: {}", message);
                                match retry_minio_storage_check(
                                    &endpoint,
                                    &bucket,
                                    &access,
                                    &secret,
                                    effective_storage.minio_use_ssl,
                                )
                                .await
                                {
                                    Ok(_) => {
                                        ok(&label);
                                        final_error.clear();
                                    }
                                    Err(retry_error) if retry_error.contains("not found") => {
                                        match crate::shared::storage_config::ensure_minio_bucket_exists(
                                            &endpoint,
                                            &bucket,
                                            &access,
                                            &secret,
                                        )
                                        .await
                                        {
                                            Ok(_) => match retry_minio_storage_check(
                                                &endpoint,
                                                &bucket,
                                                &access,
                                                &secret,
                                                effective_storage.minio_use_ssl,
                                            )
                                            .await
                                            {
                                                Ok(_) => {
                                                    println!(
                                                        "            Auto-start: created missing MinIO bucket '{}'.",
                                                        bucket
                                                    );
                                                    match crate::shared::storage_config::test_minio_storage(
                                                        &endpoint,
                                                        &bucket,
                                                        &access,
                                                        &secret,
                                                        effective_storage.minio_use_ssl,
                                                    )
                                                    .await
                                                    {
                                                        Ok(_) => {
                                                            ok(&label);
                                                            final_error.clear();
                                                        }
                                                        Err(retest_error) => {
                                                            final_error = retest_error;
                                                        }
                                                    }
                                                }
                                                Err(bucket_error) => {
                                                    final_error = bucket_error;
                                                }
                                            },
                                            Err(bucket_error) => {
                                                final_error = format!(
                                                    "{} (also failed to create bucket '{}': {})",
                                                    retry_error, bucket, bucket_error
                                                );
                                            }
                                        }
                                    }
                                    Err(retry_error) => {
                                        final_error = retry_error;
                                    }
                                }
                            }
                        }

                        if final_error.is_empty() {
                            // Auto-recovery succeeded.
                        } else {
                            fail(&label, &final_error);
                            println!("            Hint: start MinIO with:");
                            println!("            docker run -d --name rooiam-minio -p 9000:9000 -p 9001:9001 -e MINIO_ROOT_USER=rooiam -e MINIO_ROOT_PASSWORD=rooiam_secret minio/minio server /data --console-address ':9001'");
                            println!("            Then create bucket: rooiam");
                            return Err(anyhow::anyhow!(
                                "MinIO storage check failed: {}",
                                final_error
                            ));
                        }
                    }
                }
            } else {
                let env_endpoint = std::env::var("ROOIAM_MINIO_ENDPOINT").unwrap_or_default();
                let env_bucket = std::env::var("ROOIAM_MINIO_BUCKET").unwrap_or_default();
                let env_access = std::env::var("ROOIAM_MINIO_USER").unwrap_or_default();
                let env_secret = std::env::var("ROOIAM_MINIO_PASSWORD").unwrap_or_default();

                if !env_endpoint.is_empty()
                    && !env_bucket.is_empty()
                    && !env_access.is_empty()
                    && !env_secret.is_empty()
                {
                    let label = format!(
                        "MinIO        {}/{}",
                        env_endpoint.trim_end_matches('/'),
                        env_bucket
                    );
                    match crate::shared::storage_config::test_minio_storage(
                        &env_endpoint,
                        &env_bucket,
                        &env_access,
                        &env_secret,
                        env_endpoint.starts_with("https"),
                    )
                    .await
                    {
                        Ok(_) => ok(&label),
                        Err(e) => warn(&label, &e),
                    }
                } else {
                    skip("MinIO        (effective backend is not MinIO)");
                }
            }
        }

        // ── SMTP ────────────────────────────────────────────────────────────
        // Demo/test mode: always use Mailhog at localhost.
        // Production mode: SMTP is configured via the setup wizard (stored in DB) — nothing to probe at startup.
        {
            use crate::bootstrap::config::ServerMode;
            match &config.mode {
                ServerMode::Demo => {
                    let host = std::env::var("ROOIAM_DEMO_SMTP_HOST")
                        .unwrap_or_else(|_| "127.0.0.1".to_string());
                    let port = std::env::var("ROOIAM_DEMO_SMTP_PORT")
                        .unwrap_or_else(|_| "1025".to_string());
                    let label = format!("SMTP         {}:{} (Mailhog)", host, port);
                    match tokio::net::TcpStream::connect(format!("{}:{}", host, port)).await {
                        Ok(_) => ok(&label),
                        Err(e) => {
                            let mut final_error = format!(
                                "Demo mode requires Mailhog, but TCP connect failed: {}",
                                e
                            );
                            if should_attempt_local_mailhog_boot(&host, &port) {
                                if let Some(message) = try_start_local_docker_service(
                                    "mailhog",
                                    &[
                                        "run",
                                        "-d",
                                        "--name",
                                        "mailhog",
                                        "-p",
                                        "1025:1025",
                                        "-p",
                                        "8025:8025",
                                        "mailhog/mailhog",
                                    ],
                                ) {
                                    println!("            Auto-start: {}", message);
                                    match retry_mailhog_connect(&host, &port).await {
                                        Ok(_) => {
                                            ok(&label);
                                            final_error.clear();
                                        }
                                        Err(retry_error) => {
                                            final_error = format!(
                                                "Demo mode requires Mailhog, but TCP connect failed: {}",
                                                retry_error
                                            );
                                        }
                                    }
                                }
                            }
                            if !final_error.is_empty() {
                                fail(&label, &final_error);
                                println!("            Hint: start MailHog with: docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog");
                                return Err(anyhow::anyhow!(
                                    "Demo mode requires Mailhog at {}:{}, but it is not reachable. Start Mailhog or switch out of demo mode.",
                                    host,
                                    port
                                ));
                            }
                        }
                    }
                }
                ServerMode::Test => {
                    let host = std::env::var("ROOIAM_DEMO_SMTP_HOST")
                        .unwrap_or_else(|_| "127.0.0.1".to_string());
                    let port = std::env::var("ROOIAM_DEMO_SMTP_PORT")
                        .unwrap_or_else(|_| "1025".to_string());
                    let label = format!("SMTP         {}:{} (Mailhog)", host, port);
                    match tokio::net::TcpStream::connect(format!("{}:{}", host, port)).await {
                        Ok(_) => ok(&label),
                        Err(e) => {
                            if should_attempt_local_mailhog_boot(&host, &port) {
                                if let Some(message) = try_start_local_docker_service(
                                    "mailhog",
                                    &[
                                        "run",
                                        "-d",
                                        "--name",
                                        "mailhog",
                                        "-p",
                                        "1025:1025",
                                        "-p",
                                        "8025:8025",
                                        "mailhog/mailhog",
                                    ],
                                ) {
                                    println!("            Auto-start: {}", message);
                                    match retry_mailhog_connect(&host, &port).await {
                                        Ok(_) => {
                                            ok(&label);
                                        }
                                        Err(retry_error) => {
                                            warn(
                                                &label,
                                                &format!("TCP connect failed: {}", retry_error),
                                            );
                                        }
                                    }
                                } else {
                                    warn(&label, &format!("TCP connect failed: {}", e));
                                }
                            } else {
                                warn(&label, &format!("TCP connect failed: {}", e));
                            }
                            println!("            Hint: start MailHog with: docker run -d -p 1025:1025 -p 8025:8025 mailhog/mailhog");
                        }
                    }
                }
                ServerMode::Production => {
                    skip("SMTP         (configured via setup wizard — see /v1/setup/*)");
                }
            }
        }

        println!("  ─────────────────────────────────────────");
        println!();

        Ok(Self {
            db,
            redis: redis_manager,
            config: Arc::new(config.clone()),
            started_at: std::time::Instant::now(),
        })
    }
}

fn ok(label: &str) {
    println!("  [ OK   ]  {}", label);
}

fn fail(label: &str, reason: &str) {
    println!("  [ FAIL ]  {}", label);
    println!("            {}", reason);
}

fn warn(label: &str, reason: &str) {
    println!("  [ WARN ]  {}", label);
    println!("            {}", reason);
}

fn skip(label: &str) {
    println!("  [ SKIP ]  {}", label);
}

fn mask_connection_url(url: &str) -> String {
    if let Ok(mut parsed) = Url::parse(url) {
        if parsed.password().is_some() {
            let _ = parsed.set_password(Some("******"));
        }
        return parsed.to_string();
    }

    url.to_string()
}

fn should_attempt_local_minio_boot(endpoint: &str) -> bool {
    let normalized = if endpoint.starts_with("http://") || endpoint.starts_with("https://") {
        endpoint.to_string()
    } else {
        format!("http://{}", endpoint)
    };

    let Ok(url) = Url::parse(&normalized) else {
        return false;
    };

    matches!(url.host_str(), Some("localhost" | "127.0.0.1"))
        && url.port_or_known_default() == Some(9000)
}

fn should_attempt_local_mailhog_boot(host: &str, port: &str) -> bool {
    matches!(host.trim(), "localhost" | "127.0.0.1") && port.trim() == "1025"
}

fn try_start_local_docker_service(container_name: &str, run_args: &[&str]) -> Option<String> {
    let start = Command::new("docker")
        .arg("start")
        .arg(container_name)
        .output()
        .ok()?;

    if start.status.success() {
        return Some(format!(
            "started existing Docker container '{}'.",
            container_name
        ));
    }

    let stderr = String::from_utf8_lossy(&start.stderr);
    if !stderr.contains("No such container") && !stderr.contains("No such object") {
        return Some(format!(
            "could not start Docker container '{}': {}",
            container_name,
            stderr.trim()
        ));
    }

    let created = Command::new("docker").args(run_args).output().ok()?;
    if created.status.success() {
        return Some(format!(
            "created and started Docker container '{}'.",
            container_name
        ));
    }

    let create_stderr = String::from_utf8_lossy(&created.stderr);
    Some(format!(
        "could not start Docker container '{}': {}",
        container_name,
        create_stderr.trim()
    ))
}

async fn retry_minio_storage_check(
    endpoint: &str,
    bucket: &str,
    access_key: &str,
    secret_key: &str,
    use_ssl: bool,
) -> Result<String, String> {
    let mut last_error = String::from("MinIO did not become ready after auto-start.");
    for _ in 0..5 {
        match crate::shared::storage_config::test_minio_storage(
            endpoint, bucket, access_key, secret_key, use_ssl,
        )
        .await
        {
            Ok(message) => return Ok(message),
            Err(error) => {
                last_error = error;
                tokio::time::sleep(std::time::Duration::from_millis(800)).await;
            }
        }
    }
    Err(last_error)
}

async fn retry_mailhog_connect(host: &str, port: &str) -> std::io::Result<()> {
    let mut last_error = None;
    for _ in 0..5 {
        match tokio::net::TcpStream::connect(format!("{}:{}", host, port)).await {
            Ok(_) => return Ok(()),
            Err(error) => {
                last_error = Some(error);
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
            }
        }
    }
    Err(last_error.unwrap_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::Other,
            "MailHog did not become ready after auto-start.",
        )
    }))
}
