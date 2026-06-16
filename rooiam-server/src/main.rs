use actix_cors::Cors;
use actix_files::Files;
use actix_web::http::header;
use actix_web::{web, App, HttpServer};
use rooiam_server_lib::openapi::ApiDoc;
use rooiam_server_lib::shared::storage_config::{load_platform_storage_config, StorageBackend};
use rooiam_server_lib::{bootstrap, http, infra, modules, shared};
use std::io::{self, ErrorKind, IsTerminal, Write};
use std::path::PathBuf;
use tracing_subscriber::EnvFilter;
use url::Url;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

const COMPILED_SERVER_ASSETS_DIR: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/assets");

#[tokio::main]
async fn main() -> std::io::Result<()> {
    //── Check for CLI subcommand ─────────────────────────────────────────────
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(|s| s.as_str()) == Some("setup") {
        modules::setup::cli::run_setup_wizard(None).await;
        return Ok(());
    }

    //── Parse --env-file flag ───────────────────────────────────────────────
    let explicit_env_file = args.iter().position(|a| a == "--env-file");
    if let Some(env_pos) = explicit_env_file {
        if let Some(env_path) = args.get(env_pos + 1) {
            tracing::info!("Loading env from: {}", env_path);
            if let Err(err) = dotenvy::from_path(env_path) {
                eprintln!(
                    "Cannot find or load the env file you specified: {}",
                    env_path
                );
                eprintln!("Reason: {}", err);
                if prompt_launch_setup_wizard() {
                    modules::setup::cli::run_setup_wizard(Some(env_path)).await;
                    return Ok(());
                }
                std::process::exit(1);
            }
        } else {
            eprintln!("Missing value for --env-file");
            std::process::exit(1);
        }
    } else {
        tracing::info!("Loading .env");
        let _ = dotenvy::dotenv(); // Load .env file silently
        if missing_bootstrap_config() {
            eprintln!("No configuration found.");
            eprintln!("Run: cargo run -- setup");
            std::process::exit(1);
        }
    };

    // ── Normal server startup ────────────────────────────────────────────────
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::from_default_env().add_directive("rooiam_server=debug".parse().unwrap()),
        )
        .init();

    // Determine mode BEFORE any other config
    let mode = bootstrap::config::ServerMode::from_env();
    let deploy_target = bootstrap::config::DeployTarget::from_env();

    // ── MODE BANNER ──────────────────────────────────────────────────────────
    match mode {
        bootstrap::config::ServerMode::Production => {
            tracing::warn!("═══════════════════════════════════════════════════════════════");
            tracing::warn!("⚠️  PRODUCTION MODE ⚠️");
            tracing::warn!("═══════════════════════════════════════════════════════════════");
        }

        bootstrap::config::ServerMode::Demo => {
            tracing::info!("═══════════════════════════════════════════════════════════════");
            tracing::info!("✨  DEMO MODE ✨");
            tracing::info!("═══════════════════════════════════════════════════════════════");
        }

        bootstrap::config::ServerMode::Test => {
            tracing::info!("═══════════════════════════════════════════════════════════════");
            tracing::info!("🧪  TEST MODE 🧪");
            tracing::info!("═══════════════════════════════════════════════════════════════");
        }
    }

    tracing::info!("Starting Rooiam v1 server bootstrap...");

    bootstrap::config::AppConfig::check_env(&mode, &deploy_target);
    let config = bootstrap::config::AppConfig::from_env();
    shared::meerkateer::send_deploy_status("started").await;
    if let Err(e) = config.prepare_database().await {
        shared::meerkateer::send_event(
            "critical",
            startup_failure_event_kind(&e.to_string()),
            "database preparation failed",
            1,
        )
        .await;
        shared::meerkateer::send_deploy_status("failed").await;
        tracing::error!("Database preparation failed: {:#}", e);
        std::process::exit(1);
    }

    let state = match bootstrap::state::AppState::new(&config).await {
        Ok(state) => state,
        Err(e) => {
            shared::meerkateer::send_event(
                "critical",
                startup_failure_event_kind(&e.to_string()),
                "startup dependency check failed",
                1,
            )
            .await;
            shared::meerkateer::send_deploy_status("failed").await;
            tracing::error!("Startup failed: {:#}", e);
            std::process::exit(1);
        }
    };

    seed_runtime_data(&config, &state).await;
    shared::demo_seed::reconcile_superuser_for_mode(&state.db)
        .await
        .expect("Failed to reconcile demo/production superuser state");

    let state_data = web::Data::new(state);
    let serve_local_media = matches!(
        load_platform_storage_config(&state_data.db)
            .await
            .map(|cfg| cfg.backend)
            .unwrap_or(StorageBackend::Local),
        StorageBackend::Local
    );

    // Spawn background task: prune old audit logs according to retention policy
    shared::audit_retention::spawn_audit_retention_task(state_data.db.clone());
    // Spawn background task: delete expired/used tokens every hour
    shared::token_cleanup::spawn_token_cleanup_task(state_data.db.clone());
    // Spawn background task: optional Meerkateer heartbeat push.
    shared::meerkateer::spawn_heartbeat_task();

    let host = config.server.host.clone();
    let port = config.server.port;
    let server_assets_dir = resolve_server_assets_dir();

    // Read allowed origins from env, defaulting to the URLs the server already knows.
    let allowed_origins = load_allowed_origins(&config);

    log_startup_summary(&state_data, &config, &allowed_origins).await;

    tracing::info!("🚀 Rooiam listening on http://{}:{}", host, port);
    if uses_local_surface_matrix(&config) {
        tracing::info!("   Platform admin     → http://localhost:5171");
        tracing::info!("   Tenant/workspace   → http://localhost:5172");
        tracing::info!("   Landing            → http://localhost:5173");
        tracing::info!("   Docs               → http://localhost:5175");
        tracing::info!("   Book               → http://localhost:5176");
        tracing::info!("   Demo API           → http://localhost:5180");
        tracing::info!("   Demo admin         → http://localhost:5181");
        tracing::info!("   Demo portal        → http://localhost:5182");
        tracing::info!("   Demo app           → http://localhost:5184");
        tracing::info!("   Example 1          → http://localhost:5191");
        tracing::info!("   Example 2          → http://localhost:5192");
        tracing::info!("   Example 3          → http://localhost:5193");
    } else {
        tracing::info!("   Admin URL          → {}", config.server.admin_url);
        tracing::info!("   Frontend URL       → {}", config.server.frontend_url);
        tracing::info!("   Issuer URL         → {}", config.server.issuer_url);
    }

    tracing::info!("   CORS (static)");
    for origin in &allowed_origins {
        tracing::info!("     + {}", origin);
    }

    tracing::info!("   Assets    → {}", server_assets_dir.display());

    let server = HttpServer::new(move || {
        let server_assets_dir = server_assets_dir.clone();
        // Build CORS — must allow credentials for cookie-based sessions.
        //
        // Widget embed origins are registered in the database at runtime by workspace
        // operators and are not known at server startup. We therefore allow any valid
        // https:// origin (plus localhost for development) through the CORS layer.
        // The actual security gate for widget endpoints is the per-app embed origin
        // check performed inside each handler against the database.  All other
        // endpoints require a valid session cookie, which browsers will not send
        // cross-origin unless the server explicitly echoes back the requesting origin
        // in Access-Control-Allow-Origin — so accepting unknown origins here does not
        // weaken those endpoints.
        let static_origins = allowed_origins.clone();
        let cors = Cors::default()
            .allowed_origin_fn(move |origin, _req_head| {
                let origin_str = match origin.to_str() {
                    Ok(s) => s,
                    Err(_) => return false,
                };

                // Always allow the statically configured origins (admin, app, etc.)
                if static_origins.iter().any(|o| o == origin_str) {
                    return true;
                }

                // Allow any https:// origin — downstream apps embedding the widget
                // are not known at deploy time.  Handler-level embed origin checks
                // in the database are the real gate for widget endpoints.
                if origin_str.starts_with("https://") {
                    return true;
                }

                // Allow localhost / loopback on any port for local development.
                if let Ok(url) = Url::parse(origin_str) {
                    if let Some(host) = url.host_str() {
                        if matches!(host, "localhost" | "127.0.0.1" | "::1") {
                            return true;
                        }
                    }
                }
                false
            })
            .allowed_methods(vec!["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
            .allowed_headers(vec![
                header::CONTENT_TYPE,
                header::AUTHORIZATION,
                header::ACCEPT,
                header::COOKIE,
                header::HeaderName::from_static("x-rooiam-setup-token"),
                header::HeaderName::from_static("dnt"),
                header::HeaderName::from_static("sec-ch-ua"),
                header::HeaderName::from_static("sec-ch-ua-mobile"),
                header::HeaderName::from_static("sec-ch-ua-platform"),
                header::HeaderName::from_static("sec-fetch-dest"),
                header::HeaderName::from_static("sec-fetch-mode"),
                header::HeaderName::from_static("sec-fetch-site"),
                header::HeaderName::from_static("user-agent"),
                header::REFERER,
            ])
            .expose_headers(vec![header::SET_COOKIE])
            .supports_credentials() // ← critical: allows cookies to be sent cross-origin
            .max_age(3600);

        let app = App::new()
            .wrap(cors)
            .wrap(http::middleware::security_headers::SecurityHeaders)
            .wrap(http::middleware::parameter_guard::ParameterGuard)
            .wrap(http::middleware::request_log::RequestLogger)
            .app_data(shared::request_validation::json_config(
                config.server.max_logo_bytes,
            ))
            .app_data(shared::request_validation::query_config())
            .app_data(shared::request_validation::path_config())
            .app_data(shared::request_validation::form_config())
            .app_data(state_data.clone())
            .service(
                Files::new("/assets", server_assets_dir)
                    .prefer_utf8(true)
                    .use_last_modified(true),
            )
            // OpenAPI: serves the generated spec at /openapi.json and Swagger UI at /docs.
            .service(SwaggerUi::new("/docs/{_:.*}").url("/openapi.json", ApiDoc::openapi()))
            .configure(bootstrap::router::register_routes(
                config.rate_limit.clone(),
                config.mode.clone(),
            ));

        if serve_local_media {
            app.service(
                Files::new(&config.storage.public_media_base, &config.storage.root)
                    .prefer_utf8(true)
                    .use_last_modified(true),
            )
        } else {
            app
        }
    });

    tracing::info!("Binding to host={:?} port={:?}", host, port);
    let server = server
        .bind((host.as_str(), port))
        .map_err(|e| {
            let message = if e.kind() == ErrorKind::AddrInUse {
                format!(
                    "Cannot bind Rooiam to {}:{} because the address is already in use. Stop the other process or change ROOIAM_PORT.",
                    host, port
                )
            } else {
                format!("Failed to bind Rooiam to {}:{}: {}", host, port, e)
            };
            std::io::Error::new(e.kind(), message)
        })?
        .run();

    shared::meerkateer::send_deploy_status("finished").await;

    let server_handle = server.handle();

    // Graceful shutdown: wait up to 30s for in-flight requests on SIGTERM/SIGINT
    tokio::spawn(async move {
        use tokio::signal::unix::{signal, SignalKind};
        let mut sigterm =
            signal(SignalKind::terminate()).expect("Failed to install SIGTERM handler");
        let mut sigint = signal(SignalKind::interrupt()).expect("Failed to install SIGINT handler");
        tokio::select! {
            _ = sigterm.recv() => tracing::info!("SIGTERM received — shutting down"),
            _ = sigint.recv()  => tracing::info!("SIGINT received — shutting down"),
        }
        server_handle.stop(true).await;
    });

    server.await
}

fn missing_bootstrap_config() -> bool {
    std::env::var_os("ROOIAM_MODE").is_none() && std::env::var_os("ROOIAM_DEPLOY_TARGET").is_none()
}

fn prompt_launch_setup_wizard() -> bool {
    if !io::stdin().is_terminal() || !io::stdout().is_terminal() {
        eprintln!("Run: cargo run -- setup");
        return false;
    }

    eprintln!("Launch the setup wizard now? [Y/n]");
    let _ = io::stderr().flush();

    let mut answer = String::new();
    match io::stdin().read_line(&mut answer) {
        Ok(_) => {
            let answer = answer.trim().to_ascii_lowercase();
            answer.is_empty() || answer == "y" || answer == "yes"
        }
        Err(_) => false,
    }
}

fn startup_failure_event_kind(message: &str) -> &'static str {
    let lower = message.to_ascii_lowercase();
    if lower.contains("postgres") || lower.contains("database") {
        "database_unavailable"
    } else if lower.contains("redis") {
        "cache_unavailable"
    } else if lower.contains("minio") || lower.contains("storage") {
        "object_storage_unavailable"
    } else {
        "config_misconfigured"
    }
}

fn resolve_server_assets_dir() -> PathBuf {
    if let Ok(path) = std::env::var("ROOIAM_SERVER_ASSETS_DIR") {
        let path = PathBuf::from(path);
        if path.is_dir() {
            return path;
        }
        tracing::warn!(
            "ROOIAM_SERVER_ASSETS_DIR points to a missing directory: {}",
            path.display()
        );
    }

    let docker_runtime_path = PathBuf::from("/app/assets");
    if docker_runtime_path.is_dir() {
        return docker_runtime_path;
    }

    let compiled_path = PathBuf::from(COMPILED_SERVER_ASSETS_DIR);
    if compiled_path.is_dir() {
        return compiled_path;
    }

    compiled_path
}

async fn seed_runtime_data(
    config: &bootstrap::config::AppConfig,
    state: &bootstrap::state::AppState,
) {
    match config.mode {
        bootstrap::config::ServerMode::Demo => {
            shared::demo_seed::seed_demo_data(&state.db)
                .await
                .expect("Failed to seed local demo data");
        }
        bootstrap::config::ServerMode::Test => {
            shared::test_seed::seed_test_data(&state.db)
                .await
                .expect("Failed to seed test data");
        }
        bootstrap::config::ServerMode::Production => {}
    }
}

fn load_allowed_origins(config: &bootstrap::config::AppConfig) -> Vec<String> {
    std::env::var("ROOIAM_ALLOWED_ORIGINS")
        .unwrap_or_else(|_| format!("{},{}", config.server.frontend_url, config.server.admin_url))
        .split(',')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn uses_local_surface_matrix(config: &bootstrap::config::AppConfig) -> bool {
    matches!(config.deploy_target, bootstrap::config::DeployTarget::Local)
}

async fn log_startup_summary(
    state: &web::Data<bootstrap::state::AppState>,
    config: &bootstrap::config::AppConfig,
    allowed_origins: &[String],
) {
    let mode = &config.mode;
    let mode_label = match mode {
        bootstrap::config::ServerMode::Production => "PRODUCTION MODE",
        bootstrap::config::ServerMode::Demo => "DEMO MODE",
        bootstrap::config::ServerMode::Test => "TEST MODE",
    };

    let mode_hint = match mode {
        bootstrap::config::ServerMode::Production => {
            "No demo seed, no demo routes. Production-ready."
        }
        bootstrap::config::ServerMode::Demo => "Demo seed active. Demo-login endpoint enabled.",
        bootstrap::config::ServerMode::Test => {
            "No demo seed. Demo-login active. 127.0.0.1 trusted as proxy (X-Forwarded-For works)."
        }
    };

    let public_urls = shared::runtime_config::effective_public_urls_detail(&state.db, mode.label())
        .await
        .unwrap();

    let smtp_summary = infra::email::smtp_runtime_summary(&state.db)
        .await
        .ok()
        .flatten();
    let oidc_signing =
        if config.oidc.private_key_pem.is_some() && config.oidc.public_key_pem.is_some() {
            format!("RS256 (kid={})", config.oidc.key_id)
        } else {
            "HS256 development secret".to_string()
        };

    tracing::info!("============================================================");
    tracing::info!("ROOIAM STARTUP SUMMARY");
    tracing::info!("============================================================");
    tracing::info!("Mode");
    for line in mode_banner_lines(mode) {
        tracing::info!("  {}", line);
    }
    tracing::info!("  {}", mode_label);
    tracing::info!("  {}", mode_hint);
    tracing::info!("  ROOIAM_MODE={}", mode.label());
    tracing::info!("  ROOIAM_DEPLOY_TARGET={}", config.deploy_target.label());
    tracing::info!("Server");
    tracing::info!(
        "  bind           : {}:{}",
        config.server.host,
        config.server.port
    );
    tracing::info!(
        "  server_url     : {}  [{}]",
        public_urls.issuer_url,
        public_urls.issuer_url_source
    );
    tracing::info!(
        "  admin_url     : {}  [{}]",
        public_urls.admin_url,
        public_urls.admin_url_source
    );
    tracing::info!(
        "  app_url       : {}  [{}]",
        public_urls.app_url,
        public_urls.app_url_source
    );
    tracing::info!(
        "  enduser_url   : {}  [{}]",
        public_urls.enduser_url,
        public_urls.enduser_url_source
    );
    tracing::info!("  max_logo_bytes : {}", config.server.max_logo_bytes);
    tracing::info!(
        "  cookie_secure  : {}",
        std::env::var("ROOIAM_COOKIE_SECURE").unwrap_or_else(|_| "(auto)".to_string())
    );
    tracing::info!(
        "  cookie_domain  : {}",
        std::env::var("ROOIAM_COOKIE_DOMAIN").unwrap_or_else(|_| "(none)".to_string())
    );
    tracing::info!("Infrastructure");
    tracing::info!(
        "  postgres       : {}",
        mask_connection_url(&config.database.url)
    );
    tracing::info!(
        "  redis          : {}",
        mask_connection_url(&config.redis.url)
    );
    tracing::info!("  storage_root   : {}", config.storage.root);
    tracing::info!("  public_media   : {}", config.storage.public_media_base);
    tracing::info!(
        "  cors_origins   : {}",
        if allowed_origins.is_empty() {
            "(none)".to_string()
        } else {
            allowed_origins.join(", ")
        }
    );

    match smtp_summary {
        Some(smtp) => {
            tracing::info!("SMTP");
            tracing::info!("  profile        : {}", smtp.mode_label);
            tracing::info!("  host           : {}", smtp.host);
            tracing::info!("  port           : {}", smtp.port);
            tracing::info!("  from           : {}", smtp.from_email);
            tracing::info!("  security       : {}", smtp.security);
            tracing::info!("  username_set   : {}", smtp.username_present);
            tracing::info!("  password_set   : {}", smtp.password_present);
        }
        None => {
            tracing::info!("SMTP");
            tracing::info!("  not configured");
        }
    }
    tracing::info!("OAuth");
    tracing::info!(
        "  google_enabled    : {}",
        !config.oauth.google_client_id.trim().is_empty()
            && !config.oauth.google_client_secret.trim().is_empty()
    );
    tracing::info!("  google_callback   : {}", config.oauth.google_redirect_uri);
    tracing::info!(
        "  microsoft_enabled : {}",
        !config.oauth.microsoft_client_id.trim().is_empty()
            && !config.oauth.microsoft_client_secret.trim().is_empty()
    );
    tracing::info!(
        "  microsoft_callback: {}",
        config.oauth.microsoft_redirect_uri
    );
    tracing::info!("Security");
    tracing::info!("  oidc_signing   : {}", oidc_signing);
    tracing::info!(
        "  trusted_proxies: {}",
        if config.server.trusted_proxy_cidrs.is_empty() {
            "(none)".to_string()
        } else {
            config
                .server
                .trusted_proxy_cidrs
                .iter()
                .map(|cidr| cidr.to_string())
                .collect::<Vec<_>>()
                .join(", ")
        }
    );
    tracing::info!("  webauthn_rp_id : {}", config.webauthn.rp_id);
    tracing::info!("  webauthn_origin: {}", config.webauthn.origin);
    let mp = match mode {
        bootstrap::config::ServerMode::Production => "PROD",
        bootstrap::config::ServerMode::Demo => "DEMO",
        bootstrap::config::ServerMode::Test => "TEST",
    };
    tracing::info!(
        "Rate Limits (per IP, per 60s) — override with ROOIAM_RATE_{}_* or ROOIAM_RATE_*",
        mp
    );
    tracing::info!("  /auth/*          : {} req/endpoint, {} req/group  [ROOIAM_RATE_{}_AUTH_PER_ENDPOINT / ROOIAM_RATE_{}_AUTH_PER_IP]", config.rate_limit.auth_per_endpoint, config.rate_limit.auth_per_ip, mp, mp);
    tracing::info!("  /identity/*      : {} req/endpoint, {} req/group  [ROOIAM_RATE_{}_IDENTITY_PER_ENDPOINT / ROOIAM_RATE_{}_IDENTITY_PER_IP]", config.rate_limit.identity_per_endpoint, config.rate_limit.identity_per_ip, mp, mp);
    tracing::info!("  /orgs/*          : {} req/endpoint, {} req/group  [ROOIAM_RATE_{}_ORGS_PER_ENDPOINT / ROOIAM_RATE_{}_ORGS_PER_IP]", config.rate_limit.orgs_per_endpoint, config.rate_limit.orgs_per_ip, mp, mp);
    tracing::info!("  /oauth/*         : {} req/endpoint, {} req/group  [ROOIAM_RATE_{}_OAUTH_PER_ENDPOINT / ROOIAM_RATE_{}_OAUTH_PER_IP]", config.rate_limit.oauth_per_endpoint, config.rate_limit.oauth_per_ip, mp, mp);
    tracing::info!("  /webauthn/login/*: {} req/endpoint, {} req/group  [ROOIAM_RATE_{}_WEBAUTHN_PER_ENDPOINT / ROOIAM_RATE_{}_WEBAUTHN_PER_IP]", config.rate_limit.webauthn_per_endpoint, config.rate_limit.webauthn_per_ip, mp, mp);
    tracing::info!("============================================================");
}

fn mask_connection_url(url: &str) -> String {
    if let Ok(mut parsed) = url::Url::parse(url) {
        if parsed.password().is_some() {
            let _ = parsed.set_password(Some("******"));
        }
        return parsed.to_string();
    }
    url.to_string()
}

fn mode_banner_lines(mode: &bootstrap::config::ServerMode) -> [&'static str; 3] {
    match mode {
        bootstrap::config::ServerMode::Demo => [
            "=======================================",
            "          DEMO MODE ENABLED",
            "=======================================",
        ],
        bootstrap::config::ServerMode::Test => [
            "=======================================",
            "          TEST MODE ENABLED",
            "=======================================",
        ],
        bootstrap::config::ServerMode::Production => [
            "=======================================",
            "        PRODUCTION MODE ENABLED",
            "=======================================",
        ],
    }
}
