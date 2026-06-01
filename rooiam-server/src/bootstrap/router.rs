use actix_web::{web, HttpResponse};
use redis::cmd;
use serde::Serialize;

use crate::bootstrap::state::AppState;

const VERSION: &str = env!("CARGO_PKG_VERSION");
const BUILD_TIME_UTC: Option<&str> = option_env!("ROOIAM_BUILD_TIME_UTC");
const GIT_SHA: Option<&str> = option_env!("ROOIAM_GIT_SHA");
const GIT_BRANCH: Option<&str> = option_env!("ROOIAM_GIT_BRANCH");

#[derive(Serialize)]
struct HealthResponse {
    status: &'static str,
    version: &'static str,
    build: BuildInfo,
    checks: HealthChecks,
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

async fn health_check(state: web::Data<AppState>) -> HttpResponse {
    // Database — cheap ping query
    let db_result = sqlx::query("SELECT 1")
        .execute(&state.db)
        .await;
    let db = match db_result {
        Ok(_) => CheckResult { ok: true, error: None },
        Err(e) => CheckResult { ok: false, error: Some(e.to_string()) },
    };

    // Redis — PING command
    let redis_result: Result<String, _> = cmd("PING")
        .query_async(&mut state.redis.clone())
        .await;
    let redis = match redis_result {
        Ok(_) => CheckResult { ok: true, error: None },
        Err(e) => CheckResult { ok: false, error: Some(e.to_string()) },
    };

    let all_ok = db.ok && redis.ok;
    let body = HealthResponse {
        status: if all_ok { "ok" } else { "degraded" },
        version: VERSION,
        build: build_info(),
        checks: HealthChecks { database: db, redis },
    };

    if all_ok {
        HttpResponse::Ok().json(body)
    } else {
        HttpResponse::ServiceUnavailable().json(body)
    }
}

async fn server_info(state: web::Data<AppState>) -> HttpResponse {
    HttpResponse::Ok().json(ServerInfoResponse {
        name: "rooiam-server",
        version: VERSION,
        mode: state.config.mode.label(),
        build: build_info(),
    })
}

pub fn register_routes(rl: crate::bootstrap::config::RateLimitConfig, mode: crate::bootstrap::config::ServerMode) -> impl Fn(&mut web::ServiceConfig) {
    tracing::info!("Registering routes (mode={})...", mode.label());
    move |cfg: &mut web::ServiceConfig| {
    use crate::http::middleware::rate_limit::RateLimit;
    cfg.route("/health", web::get().to(health_check));
    cfg.route("/server-info", web::get().to(server_info));
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
            )
            .service(
                web::scope("/identity")
                    .wrap(RateLimit::per_endpoint(rl.identity_per_endpoint, 60))
                    .wrap(RateLimit::global_per_ip("identity", rl.identity_per_ip, 60))
                    .configure(crate::modules::identity::handlers::routes)
            )
            .service(
                web::scope("/orgs")
                    .wrap(RateLimit::per_endpoint(rl.orgs_per_endpoint, 60))
                    .wrap(RateLimit::global_per_ip("orgs", rl.orgs_per_ip, 60))
                    .configure(crate::modules::organization::handlers::routes)
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
            .configure(crate::modules::webauthn::handlers::routes_global(rl.clone()))
            .configure(crate::modules::mfa::handlers::routes_global)
    );
    } // end closure
}
