use std::time::Duration;

use actix_web::{web, HttpRequest, HttpResponse};
use chrono::{SecondsFormat, Utc};
use redis::cmd;
use serde::Serialize;
use tokio::time::timeout;

use crate::bootstrap::state::AppState;

const SERVICE_NAME: &str = "rooiam-server";
const PROJECT_SLUG: &str = "rooiam";
const SERVICE_ENVIRONMENT_VAR: &str = "ROOIAM_SERVICE_ENVIRONMENT";
const METRICS_ENABLED_VAR: &str = "ROOIAM_METRICS_ENABLED";
const METRICS_TOKEN_VAR: &str = "ROOIAM_METRICS_TOKEN";
const FORCE_CHECK_FAILURES_VAR: &str = "ROOIAM_MKS1_FORCE_CHECK_FAILURES";
const MEERKATEER_TIMEOUT_MS_VAR: &str = "ROOIAM_MEERKATEER_TIMEOUT_MS";
const DEFAULT_SERVICE_ENVIRONMENT: &str = "development";
const INTERFACE_NAME: &str = "meerkateer";
const INTERFACE_VERSION: &str = "1";
const DEFAULT_MEERKATEER_TIMEOUT_MS: u64 = 3000;
const VERSION: &str = env!("CARGO_PKG_VERSION");
const BUILD_TIME_UTC: Option<&str> = option_env!("ROOIAM_BUILD_TIME_UTC");
const GIT_SHA: Option<&str> = option_env!("ROOIAM_GIT_SHA");
const GIT_BRANCH: Option<&str> = option_env!("ROOIAM_GIT_BRANCH");

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    service: &'static str,
    project: &'static str,
    environment: String,
    interface: &'static str,
    interface_version: &'static str,
    version: &'static str,
    build: BuildInfo,
    checks: HealthChecks,
    timestamp: String,
}

#[derive(Serialize)]
struct HealthChecks {
    database: CheckResult,
    redis: CheckResult,
}

#[derive(Serialize)]
struct CheckResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
struct BuildInfo {
    built_at_utc: &'static str,
    git_sha: &'static str,
    git_branch: &'static str,
}

#[derive(Serialize)]
struct ReadyResponse {
    ready: bool,
    service: &'static str,
    project: &'static str,
    environment: String,
    interface: &'static str,
    interface_version: &'static str,
    checks: HealthChecks,
    timestamp: String,
}

#[derive(Serialize)]
struct MeerkateerMetadataResponse {
    interface: &'static str,
    interface_version: &'static str,
    service: &'static str,
    project: &'static str,
    environment: String,
    runtime: &'static str,
    version: &'static str,
    build: BuildInfo,
    endpoints: MeerkateerEndpoints,
    capabilities: MeerkateerCapabilities,
}

#[derive(Serialize)]
struct MeerkateerEndpoints {
    health: &'static str,
    ready: &'static str,
    metrics: &'static str,
    server_info: &'static str,
}

#[derive(Serialize)]
struct MeerkateerCapabilities {
    health: bool,
    readiness: bool,
    prometheus_metrics: bool,
    server_info: bool,
    push_heartbeat: bool,
    push_event: bool,
    push_deploy: bool,
}

#[derive(Serialize)]
struct ServerInfoResponse {
    name: &'static str,
    version: &'static str,
    mode: &'static str,
    build: BuildInfo,
}

fn build_info() -> BuildInfo {
    BuildInfo {
        built_at_utc: BUILD_TIME_UTC.unwrap_or("unknown"),
        git_sha: GIT_SHA.unwrap_or("unknown"),
        git_branch: GIT_BRANCH.unwrap_or("unknown"),
    }
}

fn service_environment() -> String {
    match std::env::var(SERVICE_ENVIRONMENT_VAR) {
        Ok(value) => match value.trim() {
            "development" | "staging" | "production" | "test" | "local" => value.trim().to_string(),
            invalid => {
                tracing::warn!(
                    env_var = SERVICE_ENVIRONMENT_VAR,
                    invalid_value = invalid,
                    "Invalid service environment for MKS-1; falling back to default"
                );
                DEFAULT_SERVICE_ENVIRONMENT.to_string()
            }
        },
        Err(_) => DEFAULT_SERVICE_ENVIRONMENT.to_string(),
    }
}

fn current_timestamp() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn meerkateer_timeout() -> Duration {
    let millis = std::env::var(MEERKATEER_TIMEOUT_MS_VAR)
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_MEERKATEER_TIMEOUT_MS);
    Duration::from_millis(millis)
}

fn safe_dep_error_message(message: &str) -> &'static str {
    let lower = message.to_ascii_lowercase();
    if lower.contains("timed out") || lower.contains("timeout") {
        "timeout"
    } else if lower.contains("disabled") {
        "disabled"
    } else if lower.contains("misconfig")
        || lower.contains("invalid")
        || lower.contains("missing")
        || lower.contains("not set")
    {
        "misconfigured"
    } else if lower.contains("unknown") {
        "unknown"
    } else {
        "unavailable"
    }
}

fn safe_dep_error<E: std::fmt::Display>(error: &E) -> &'static str {
    safe_dep_error_message(&error.to_string())
}

fn normalized_safe_error(value: &str) -> &'static str {
    match value.trim().to_ascii_lowercase().as_str() {
        "timeout" => "timeout",
        "misconfigured" => "misconfigured",
        "disabled" => "disabled",
        "unknown" => "unknown",
        _ => "unavailable",
    }
}

fn forced_check_result(dependency: &str) -> Option<CheckResult> {
    let raw = std::env::var(FORCE_CHECK_FAILURES_VAR).ok()?;
    for entry in raw
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
    {
        let (target, error) = match entry.split_once('=') {
            Some((target, error)) => (target.trim(), normalized_safe_error(error)),
            None => (entry, "unavailable"),
        };

        if target.eq_ignore_ascii_case("all") || target.eq_ignore_ascii_case(dependency) {
            return Some(CheckResult {
                ok: false,
                error: Some(error.to_string()),
            });
        }
    }

    None
}

fn metrics_enabled() -> bool {
    std::env::var(METRICS_ENABLED_VAR)
        .ok()
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(true)
}

fn metrics_token() -> Option<String> {
    std::env::var(METRICS_TOKEN_VAR)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

async fn database_check(state: &AppState) -> CheckResult {
    if let Some(result) = forced_check_result("database") {
        return result;
    }

    match timeout(
        meerkateer_timeout(),
        sqlx::query("SELECT 1").execute(&state.db),
    )
    .await
    {
        Ok(Ok(_)) => CheckResult {
            ok: true,
            error: None,
        },
        Ok(Err(error)) => {
            tracing::warn!(dependency = "database", error = %error, "Health check dependency probe failed");
            CheckResult {
                ok: false,
                error: Some(safe_dep_error(&error).to_string()),
            }
        }
        Err(error) => {
            tracing::warn!(dependency = "database", error = %error, "Health check dependency probe timed out");
            CheckResult {
                ok: false,
                error: Some("timeout".to_string()),
            }
        }
    }
}

async fn redis_check(state: &AppState) -> CheckResult {
    if let Some(result) = forced_check_result("redis") {
        return result;
    }

    let redis_probe = async {
        let mut redis = state.redis.clone();
        let redis_result: Result<String, _> = cmd("PING").query_async(&mut redis).await;
        redis_result
    };

    match timeout(meerkateer_timeout(), redis_probe).await {
        Ok(Ok(_)) => CheckResult {
            ok: true,
            error: None,
        },
        Ok(Err(error)) => {
            tracing::warn!(dependency = "redis", error = %error, "Health check dependency probe failed");
            CheckResult {
                ok: false,
                error: Some(safe_dep_error(&error).to_string()),
            }
        }
        Err(error) => {
            tracing::warn!(dependency = "redis", error = %error, "Health check dependency probe timed out");
            CheckResult {
                ok: false,
                error: Some("timeout".to_string()),
            }
        }
    }
}

async fn health_check(state: web::Data<AppState>) -> HttpResponse {
    let db = database_check(state.get_ref()).await;
    let redis = redis_check(state.get_ref()).await;

    let all_ok = db.ok && redis.ok;
    let body = HealthResponse {
        status: if all_ok { "ok" } else { "degraded" },
        service: SERVICE_NAME,
        project: PROJECT_SLUG,
        environment: service_environment(),
        interface: INTERFACE_NAME,
        interface_version: INTERFACE_VERSION,
        version: VERSION,
        build: build_info(),
        checks: HealthChecks {
            database: db,
            redis,
        },
        timestamp: current_timestamp(),
    };

    if all_ok {
        HttpResponse::Ok().json(body)
    } else {
        HttpResponse::ServiceUnavailable().json(body)
    }
}

/// Readiness probe — reports whether the server can serve traffic right now,
/// i.e. its backing dependencies (PostgreSQL, Redis) are reachable.
///
/// Distinct from `/health`: this endpoint returns a minimal body and is meant
/// for orchestrator readiness gates (Kubernetes `readinessProbe`, load-balancer
/// health gates). Returns 200 when ready, 503 when a dependency is down.
async fn ready_check(state: web::Data<AppState>) -> HttpResponse {
    let db = database_check(state.get_ref()).await;
    let redis = redis_check(state.get_ref()).await;

    let ready = db.ok && redis.ok;
    let body = ReadyResponse {
        ready,
        service: SERVICE_NAME,
        project: PROJECT_SLUG,
        environment: service_environment(),
        interface: INTERFACE_NAME,
        interface_version: INTERFACE_VERSION,
        checks: HealthChecks {
            database: db,
            redis,
        },
        timestamp: current_timestamp(),
    };

    if ready {
        HttpResponse::Ok().json(body)
    } else {
        HttpResponse::ServiceUnavailable().json(body)
    }
}

/// Prometheus metrics endpoint — emits text/plain exposition format (v0.0.4).
///
/// Kept dependency-light: rather than wiring a global recorder + middleware,
/// it samples cheap runtime facts at scrape time (process uptime, DB pool
/// gauges, build info). Scrapers read this on their own interval.
async fn metrics(req: HttpRequest, state: web::Data<AppState>) -> HttpResponse {
    if !metrics_enabled() {
        return HttpResponse::NotFound().finish();
    }

    if let Some(expected_token) = metrics_token() {
        let authorized = req
            .headers()
            .get("authorization")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "))
            .map(|value| value == expected_token)
            .unwrap_or(false);

        if !authorized {
            return HttpResponse::Forbidden().finish();
        }
    }

    let uptime = state.started_at.elapsed().as_secs_f64();

    // sqlx pool gauges — cheap, in-memory.
    let pool_size = state.db.size() as f64;
    let pool_idle = state.db.num_idle() as f64;
    let pool_in_use = pool_size - pool_idle;

    // Probe DB so we can expose an "up" gauge for the dependency.
    let db_up = database_check(state.get_ref()).await.ok;
    let redis_up = redis_check(state.get_ref()).await.ok;

    let git_sha = GIT_SHA.unwrap_or("unknown");
    let git_branch = GIT_BRANCH.unwrap_or("unknown");

    let mut out = String::new();

    out.push_str(
        "# HELP rooiam_build_info Build information; constant 1, labels carry the values.\n",
    );
    out.push_str("# TYPE rooiam_build_info gauge\n");
    out.push_str(&format!(
        "rooiam_build_info{{version=\"{VERSION}\",git_sha=\"{git_sha}\",git_branch=\"{git_branch}\"}} 1\n"
    ));

    out.push_str("# HELP rooiam_uptime_seconds Seconds since the process started.\n");
    out.push_str("# TYPE rooiam_uptime_seconds gauge\n");
    out.push_str(&format!("rooiam_uptime_seconds {uptime}\n"));

    out.push_str(
        "# HELP rooiam_dependency_up Whether a backing dependency is reachable (1 = up).\n",
    );
    out.push_str("# TYPE rooiam_dependency_up gauge\n");
    out.push_str(&format!(
        "rooiam_dependency_up{{dependency=\"database\"}} {}\n",
        if db_up { 1 } else { 0 }
    ));
    out.push_str(&format!(
        "rooiam_dependency_up{{dependency=\"redis\"}} {}\n",
        if redis_up { 1 } else { 0 }
    ));

    out.push_str("# HELP rooiam_db_pool_connections Database connection-pool gauges.\n");
    out.push_str("# TYPE rooiam_db_pool_connections gauge\n");
    out.push_str(&format!(
        "rooiam_db_pool_connections{{state=\"total\"}} {pool_size}\n"
    ));
    out.push_str(&format!(
        "rooiam_db_pool_connections{{state=\"idle\"}} {pool_idle}\n"
    ));
    out.push_str(&format!(
        "rooiam_db_pool_connections{{state=\"in_use\"}} {pool_in_use}\n"
    ));

    HttpResponse::Ok()
        .content_type("text/plain; version=0.0.4; charset=utf-8")
        .body(out)
}

async fn meerkateer_metadata() -> HttpResponse {
    let push_capabilities = crate::shared::meerkateer::push_capabilities_enabled();

    HttpResponse::Ok().json(MeerkateerMetadataResponse {
        interface: INTERFACE_NAME,
        interface_version: INTERFACE_VERSION,
        service: SERVICE_NAME,
        project: PROJECT_SLUG,
        environment: service_environment(),
        runtime: "rust",
        version: VERSION,
        build: build_info(),
        endpoints: MeerkateerEndpoints {
            health: "/health",
            ready: "/ready",
            metrics: "/metrics",
            server_info: "/server-info",
        },
        capabilities: MeerkateerCapabilities {
            health: true,
            readiness: true,
            prometheus_metrics: true,
            server_info: true,
            push_heartbeat: push_capabilities,
            push_event: push_capabilities,
            push_deploy: push_capabilities,
        },
    })
}

async fn server_info(state: web::Data<AppState>) -> HttpResponse {
    HttpResponse::Ok().json(ServerInfoResponse {
        name: SERVICE_NAME,
        version: VERSION,
        mode: state.config.mode.label(),
        build: build_info(),
    })
}

pub fn register_routes(
    rl: crate::bootstrap::config::RateLimitConfig,
    mode: crate::bootstrap::config::ServerMode,
) -> impl Fn(&mut web::ServiceConfig) {
    tracing::info!("Registering routes (mode={})...", mode.label());
    move |cfg: &mut web::ServiceConfig| {
        use crate::http::middleware::rate_limit::RateLimit;

        cfg.route("/health", web::get().to(health_check));
        cfg.route("/ready", web::get().to(ready_check));
        cfg.route("/metrics", web::get().to(metrics));
        cfg.route("/server-info", web::get().to(server_info));
        cfg.route(
            "/.well-known/meerkateer.json",
            web::get().to(meerkateer_metadata),
        );
        cfg.configure(crate::modules::auth::handlers::ui_routes);
        cfg.configure(crate::modules::oidc::handlers::well_known_routes);
        cfg.configure(crate::modules::oauth::handlers::legacy_callback_routes);

        cfg.service(
            web::scope("/v1")
                .service(
                    web::scope("/auth")
                        .wrap(RateLimit::per_endpoint(rl.auth_per_endpoint, 60))
                        .wrap(RateLimit::global_per_ip("auth", rl.auth_per_ip, 60))
                        .configure(crate::modules::auth::handlers::routes)
                        .configure(crate::modules::device_login::handlers::auth_routes),
                )
                .service(
                    web::scope("/identity")
                        .wrap(RateLimit::per_endpoint(rl.identity_per_endpoint, 60))
                        .wrap(RateLimit::global_per_ip("identity", rl.identity_per_ip, 60))
                        .configure(crate::modules::identity::handlers::routes)
                        .configure(crate::modules::device_login::handlers::routes),
                )
                .service(
                    web::scope("/orgs")
                        .wrap(RateLimit::per_endpoint(rl.orgs_per_endpoint, 60))
                        .wrap(RateLimit::global_per_ip("orgs", rl.orgs_per_ip, 60))
                        .configure(crate::modules::organization::handlers::routes),
                )
                .configure(crate::modules::oidc::handlers::routes)
                // Setup wizard — demo-login and test endpoints only registered in non-production modes
                .configure(crate::modules::setup::handlers::routes(mode.clone()))
                // Admin dash endpoints
                .configure(crate::modules::admin::handlers::routes)
                // OAuth clients (e.g. applications built on top of Rooiam)
                .configure(crate::modules::clients::handlers::routes)
                // OAuth, WebAuthn, MFA — per-endpoint AND global per-IP limits live inside
                // each module's routes(). routes_global() is an alias for clarity.
                .configure(crate::modules::oauth::handlers::routes_global(rl.clone()))
                .configure(crate::modules::webauthn::handlers::routes_global(
                    rl.clone(),
                ))
                .configure(crate::modules::mfa::handlers::routes_global),
        );
    } // end closure
}
