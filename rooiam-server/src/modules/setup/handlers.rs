use actix_web::{web, HttpRequest, HttpResponse};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::Utc;
use rand::{rngs::OsRng, RngCore};
use serde::Deserialize;
use crate::bootstrap::state::AppState;
use crate::modules::organization::repository::OrganizationRepository;
use crate::modules::setup::access::{
    ensure_platform_owner,
    ensure_platform_staff_or_setup_access,
    ensure_setup_access,
    load_authenticated_session,
};
use crate::modules::setup::auth_bootstrap::{
    get_login_bootstrap,
    get_public_auth_methods,
};
use crate::modules::setup::demo::{get_demo_app_catalog, get_demo_app_config};
use crate::modules::setup::diagnostics::{
    callback_url,
    enrich_database_diagnostics,
    load_database_diagnostics,
    mask_connection_url,
    normalized_url_or_error,
};
use crate::modules::setup::policy::load_admin_access_policy;
use crate::modules::setup::settings::{
    get_setting,
    platform_owner_exists,
    set_setting,
    setup_access_mode,
};
use crate::modules::setup::support::demo_mailbox_url;
use crate::modules::setup::types::*;
use crate::shared::demo_seed::{demo_customer_email_for_org, demo_end_user_email_for_org, demo_routes_enabled, demo_seed_enabled, demo_tenant_admin_email_for_org};
use crate::shared::test_seed::{test_mode_enabled, TEST_IDENTITIES};
use crate::shared::error::AppError;
use crate::shared::storage_config::{load_platform_storage_config, save_platform_storage_config, test_local_storage, test_minio_storage, PlatformStorageConfigUpdate};
use crate::shared::request_ip::{client_ip_from_http_request, client_ip_string_from_http_request};
use crate::shared::runtime_config::{effective_public_urls, PublicUrls};
use crate::modules::identity::repository::IdentityRepository;
use crate::modules::session::{
    cookie::build_session_cookie,
    repository::SessionRepository,
    service::SessionService,
};
use crate::modules::audit::service::{AuditEvent, AuditService};

// ── Handlers ─────────────────────────────────────────────────────────────────

/// GET /v1/setup/status — check if the system has been initialized
async fn get_status(state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let db = &state.db;

    let initialized = get_setting(db, "setup_completed").await
        .map(|v| v == "true")
        .unwrap_or(false);

    let has_admin = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users")
        .fetch_one(db)
        .await
        .unwrap_or(0) > 0;

    let has_smtp = get_setting(db, "smtp_host").await.is_some();
    let has_google = get_setting(db, "google_client_id").await.is_some();
    let has_microsoft = get_setting(db, "microsoft_client_id").await.is_some();

    Ok(HttpResponse::Ok().json(SetupStatus {
        initialized,
        has_admin_user: has_admin,
        has_smtp,
        has_google_oauth: has_google,
        has_microsoft_oauth: has_microsoft,
        demo_mode: demo_seed_enabled(),
    }))
}

async fn get_public_urls(state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let urls = effective_public_urls(&state.db, state.config.as_ref()).await?;

    Ok(HttpResponse::Ok().json(PublicUrlsResponse {
        google_callback_url: callback_url(&urls.issuer_url, "google"),
        microsoft_callback_url: callback_url(&urls.issuer_url, "microsoft"),
        issuer_url: urls.issuer_url,
        frontend_url: urls.frontend_url,
        admin_url: urls.admin_url,
    }))
}

async fn test_database_connection(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    ensure_setup_access(&req, &state).await?;

    let diagnostics = enrich_database_diagnostics(
        &state.db,
        load_database_diagnostics(state.config.as_ref()),
    )
    .await?;

    Ok(HttpResponse::Ok().json(DatabaseStatusResponse {
        ok: diagnostics.ready,
        message: format!(
            "Database connection passed. {} is ready with {} applied migrations.",
            diagnostics.name,
            diagnostics.migration_count
        ),
        database_url_masked: diagnostics.url_masked,
        database_name: diagnostics.name,
        database_host: diagnostics.host,
        database_port: diagnostics.port,
        database_username: diagnostics.username,
        database_mode_target: diagnostics.mode_target,
        database_connection_ready: diagnostics.ready,
        database_migration_count: diagnostics.migration_count,
        database_latest_migration: diagnostics.latest_migration,
    }))
}
async fn get_setup_config(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    ensure_setup_access(&req, &state).await?;
    let urls = effective_public_urls(&state.db, state.config.as_ref()).await?;
    let database = enrich_database_diagnostics(&state.db, load_database_diagnostics(state.config.as_ref())).await?;
    let platform_owner_exists = platform_owner_exists(&state.db).await?;

    let admin_email = if platform_owner_exists {
        get_setting(&state.db, "superuser_email").await.unwrap_or_default()
    } else {
        get_setting(&state.db, "setup_owner_email").await.unwrap_or_default()
    };
    let admin_display_name = if !platform_owner_exists {
        get_setting(&state.db, "setup_owner_display_name").await.unwrap_or_default()
    } else if admin_email.is_empty() {
        String::new()
    } else {
        sqlx::query_scalar::<_, String>(
            r#"
            SELECT u.display_name
            FROM users u
            JOIN user_emails ue ON ue.user_id = u.id
            WHERE ue.email = $1 AND ue.is_primary = true
            LIMIT 1
            "#,
        )
        .bind(&admin_email)
        .fetch_optional(&state.db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to load admin display name during setup status read: {}", e)))?
        .unwrap_or_default()
    };

    let smtp_password = get_setting(&state.db, "smtp_password").await.unwrap_or_default();
    let smtp_verified_email = get_setting(&state.db, "setup_smtp_verified_email")
        .await
        .unwrap_or_default();
    let smtp_verified_at = get_setting(&state.db, "setup_smtp_verified_at")
        .await
        .unwrap_or_default();
    let google_client_id = get_setting(&state.db, "google_client_id")
        .await
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| state.config.oauth.google_client_id.clone());
    let google_client_secret = get_setting(&state.db, "google_client_secret")
        .await
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| state.config.oauth.google_client_secret.clone());
    let google_client_secret_configured = !google_client_secret.trim().is_empty();
    let microsoft_client_id = get_setting(&state.db, "microsoft_client_id")
        .await
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| state.config.oauth.microsoft_client_id.clone());
    let microsoft_client_secret = get_setting(&state.db, "microsoft_client_secret")
        .await
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| state.config.oauth.microsoft_client_secret.clone());
    let microsoft_client_secret_configured = !microsoft_client_secret.trim().is_empty();
    let microsoft_tenant_id = get_setting(&state.db, "microsoft_tenant_id")
        .await
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| state.config.oauth.microsoft_tenant_id.clone());
    let demo_mailbox_url = demo_mailbox_url();
    let smtp_host = if demo_seed_enabled() {
        std::env::var("ROOIAM_DEMO_SMTP_HOST").unwrap_or_else(|_| "127.0.0.1".to_string())
    } else {
        get_setting(&state.db, "smtp_host")
            .await
            .or_else(|| std::env::var("ROOIAM_SMTP_HOST").ok())
            .unwrap_or_default()
    };
    let smtp_port = if demo_seed_enabled() {
        std::env::var("ROOIAM_DEMO_SMTP_PORT").unwrap_or_else(|_| "1025".to_string())
    } else {
        get_setting(&state.db, "smtp_port")
            .await
            .or_else(|| std::env::var("ROOIAM_SMTP_PORT").ok())
            .unwrap_or_else(|| "587".to_string())
    };
    let smtp_security = if demo_seed_enabled() {
        "none".to_string()
    } else {
        get_setting(&state.db, "smtp_security")
            .await
            .or_else(|| std::env::var("ROOIAM_SMTP_SECURITY").ok())
            .unwrap_or_else(|| "none".to_string())
    };
    let smtp_insecure_tls = if demo_seed_enabled() {
        false
    } else {
        get_setting(&state.db, "smtp_insecure_tls")
            .await
            .or_else(|| std::env::var("ROOIAM_SMTP_INSECURE_TLS").ok())
            .map(|v| matches!(v.trim().to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "on"))
            .unwrap_or(false)
    };
    let smtp_username = if demo_seed_enabled() {
        String::new()
    } else {
        get_setting(&state.db, "smtp_username")
            .await
            .or_else(|| std::env::var("ROOIAM_SMTP_USER").ok())
            .or_else(|| std::env::var("SMTP_USER").ok())
            .unwrap_or_default()
    };
    let smtp_from_email = if demo_seed_enabled() {
        std::env::var("ROOIAM_DEMO_SMTP_FROM").unwrap_or_else(|_| "demo@rooiam.local".to_string())
    } else {
        get_setting(&state.db, "smtp_from_email")
            .await
            .or_else(|| std::env::var("ROOIAM_SMTP_FROM").ok())
            .or_else(|| std::env::var("ROOIAM_FROM_EMAIL").ok())
            .or_else(|| std::env::var("FROM_EMAIL").ok())
            .unwrap_or_default()
    };

    let admin_access_policy = load_admin_access_policy(&state.db).await?;

    Ok(HttpResponse::Ok().json(SetupConfigResponse {
        admin_email,
        admin_display_name,
        platform_owner_exists,
        smtp_verified_email,
        smtp_verified_at,
        issuer_url: urls.issuer_url.clone(),
        frontend_url: urls.frontend_url.clone(),
        admin_url: urls.admin_url.clone(),
        demo_mailbox_url,
        redis_url: state.config.redis.url.clone(),
        redis_url_masked: mask_connection_url(&state.config.redis.url),
        database_url_masked: database.url_masked,
        database_name: database.name,
        database_host: database.host,
        database_port: database.port,
        database_username: database.username,
        database_mode_target: database.mode_target,
        database_connection_ready: database.ready,
        database_migration_count: database.migration_count,
        database_latest_migration: database.latest_migration,
        google_callback_url: callback_url(&urls.issuer_url, "google"),
        microsoft_callback_url: callback_url(&urls.issuer_url, "microsoft"),
        smtp_host,
        smtp_port,
        smtp_security,
        smtp_insecure_tls,
        smtp_username,
        smtp_password: String::new(),
        smtp_password_configured: !smtp_password.trim().is_empty(),
        smtp_from_email,
        google_client_id,
        google_client_secret,
        google_client_secret_configured,
        google_oauth_verified_at: get_setting(&state.db, "google_oauth_verified_at").await.unwrap_or_default(),
        google_admin_login_enabled: admin_access_policy.google_admin_login_enabled,
        microsoft_client_id,
        microsoft_client_secret,
        microsoft_client_secret_configured,
        microsoft_tenant_id,
        microsoft_oauth_verified_at: get_setting(&state.db, "microsoft_oauth_verified_at").await.unwrap_or_default(),
        microsoft_admin_login_enabled: admin_access_policy.microsoft_admin_login_enabled,
        admin_passkey_allowed: admin_access_policy.admin_passkey_allowed,
        admin_require_mfa: admin_access_policy.admin_require_mfa,
        setup_access_mode: setup_access_mode(),
        rate_limit_window_seconds: 60,
        rate_limit_auth_per_endpoint: state.config.rate_limit.auth_per_endpoint,
        rate_limit_auth_per_ip: state.config.rate_limit.auth_per_ip,
        rate_limit_identity_per_endpoint: state.config.rate_limit.identity_per_endpoint,
        rate_limit_identity_per_ip: state.config.rate_limit.identity_per_ip,
        rate_limit_orgs_per_endpoint: state.config.rate_limit.orgs_per_endpoint,
        rate_limit_orgs_per_ip: state.config.rate_limit.orgs_per_ip,
        rate_limit_oauth_per_endpoint: state.config.rate_limit.oauth_per_endpoint,
        rate_limit_oauth_per_ip: state.config.rate_limit.oauth_per_ip,
        rate_limit_webauthn_per_endpoint: state.config.rate_limit.webauthn_per_endpoint,
        rate_limit_webauthn_per_ip: state.config.rate_limit.webauthn_per_ip,
    }))
}

async fn get_admin_access_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff_or_setup_access(&req, &state).await?;

    let policy = load_admin_access_policy(&state.db).await?;

    Ok(HttpResponse::Ok().json(AdminAccessPolicyResponse {
        demo_mode: policy.demo_mode,
        google_admin_login_enabled: policy.google_admin_login_enabled,
        microsoft_admin_login_enabled: policy.microsoft_admin_login_enabled,
        admin_passkey_allowed: policy.admin_passkey_allowed,
        admin_require_mfa: policy.admin_require_mfa,
    }))
}

/// POST /v1/setup/create-admin — save the platform owner draft used by setup
async fn create_admin(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<CreateAdminRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_setup_access(&req, &state).await?;
    let db = &state.db;

    // Guard: block if setup is already completed
    let already_done = get_setting(db, "setup_completed").await
        .map(|v| v == "true")
        .unwrap_or(false);
    if already_done {
        return Err(AppError::Validation(
            "System is already initialized. Use the admin panel to manage users. The setup wizard cannot create a new platform owner now.".into()
        ));
    }

    // Guard: only allow if no platform owner exists yet
    if platform_owner_exists(db).await? {
        return Err(AppError::Validation(
            "Platform owner already exists. The setup wizard cannot create another.".into()
        ));
    }
    let email = body.email.trim().to_ascii_lowercase();
    let display_name = body.display_name.trim().to_string();
    if email.is_empty() {
        return Err(AppError::Validation("Platform owner email is required.".into()));
    }
    if display_name.is_empty() {
        return Err(AppError::Validation("Platform owner display name is required.".into()));
    }

    let previous_email = get_setting(db, "setup_owner_email").await.unwrap_or_default();
    if !previous_email.is_empty() && previous_email != email {
        set_setting(db, "setup_smtp_verified_email", "").await?;
        set_setting(db, "setup_smtp_verified_at", "").await?;
    }
    set_setting(db, "setup_owner_email", &email).await?;
    set_setting(db, "setup_owner_display_name", &display_name).await?;

    tracing::info!("Setup: platform owner draft saved → {}", email);

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Platform owner draft saved.",
        "user_email": email,
    })))
}


/// POST /v1/setup/configure-smtp
async fn configure_smtp(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<SmtpConfigRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_setup_access(&req, &state).await?;
    let db = &state.db;

    set_setting(db, "smtp_host", body.host.trim()).await?;
    set_setting(db, "smtp_port", &body.port.to_string()).await?;
    set_setting(db, "smtp_security", body.security.trim()).await?;
    set_setting(db, "smtp_insecure_tls", if body.insecure_tls { "true" } else { "false" }).await?;
    set_setting(db, "smtp_username", body.username.trim()).await?;
    if !body.password.trim().is_empty() {
        set_setting(db, "smtp_password", &body.password).await?;
    }
    set_setting(db, "smtp_from_email", body.from_email.trim()).await?;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: load_authenticated_session(&req, &state).await.ok().map(|s| s.user_id),
        organization_id: None,
        action: "setup.smtp.configured".into(),
        target_type: "system_setting".into(),
        target_id: Some("smtp".into()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({
            "host": body.host.trim(),
            "port": body.port,
            "security": body.security.trim(),
            "username": body.username.trim(),
            "from_email": body.from_email.trim(),
            "password_changed": !body.password.trim().is_empty(),
        }),
    }).await;

    tracing::info!("Setup: SMTP configured → {}:{}", body.host, body.port);

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "SMTP configuration saved.",
    })))
}

/// POST /v1/setup/test-smtp
async fn test_smtp(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<TestSmtpRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_setup_access(&req, &state).await?;
    if body.host.trim().is_empty() {
        return Err(AppError::Validation("SMTP host is required".into()));
    }
    if body.from_email.trim().is_empty() {
        return Err(AppError::Validation("From email is required".into()));
    }
    if body.test_email.trim().is_empty() {
        return Err(AppError::Validation("Test recipient email is required".into()));
    }

    let stored_password = if body.password.trim().is_empty() {
        get_setting(&state.db, "smtp_password").await.unwrap_or_default()
    } else {
        String::new()
    };

    crate::infra::email::send_test_email(
        &state.db,
        crate::infra::email::SmtpConfig {
            host: body.host.trim().to_string(),
            port: body.port,
            username: Some(body.username.trim().to_string()).filter(|value| !value.is_empty()),
            password: Some(if body.password.trim().is_empty() {
                stored_password
            } else {
                body.password.clone()
            })
            .filter(|value| !value.is_empty()),
            from_email: body.from_email.trim().to_string(),
            security: if demo_seed_enabled() {
                std::env::var("ROOIAM_DEMO_SMTP_SECURITY").unwrap_or_else(|_| "none".to_string())
            } else if !body.security.trim().is_empty() {
                body.security.trim().to_string()
            } else {
                get_setting(&state.db, "smtp_security").await
                    .or_else(|| std::env::var("ROOIAM_SMTP_SECURITY").ok())
                    .unwrap_or_else(|| "none".to_string())
            },
            insecure_tls: body.insecure_tls,
        },
        body.test_email.trim(),
    )
    .await
    .map_err(AppError::Validation)?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": format!("SMTP test email sent to {}.", body.test_email.trim()),
    })))
}

/// POST /v1/setup/send-smtp-verification
///
/// Sends a 6-digit verification code to `to_email` using the provided SMTP config.
/// The code is stored in Redis with a 10-minute TTL, keyed by client IP.
/// This is the wizard-only flow — config is NOT saved to DB until the code is verified.
async fn send_smtp_verification(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<TestSmtpRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_setup_access(&req, &state).await?;
    if body.host.trim().is_empty() {
        return Err(AppError::Validation("SMTP host is required".into()));
    }
    if body.from_email.trim().is_empty() {
        return Err(AppError::Validation("From email is required".into()));
    }
    if body.test_email.trim().is_empty() {
        return Err(AppError::Validation("Recipient email is required".into()));
    }

    // Generate 6-digit code
    let code: u32 = rand::random::<u32>() % 900_000 + 100_000;
    let code_str = code.to_string();

    // Store in Redis keyed by client IP, TTL 10 minutes
    let ip = client_ip_string_from_http_request(&req, state.config.as_ref())
        .unwrap_or_else(|| "unknown".to_string());
    let redis_key = format!("smtp_verify:{}", ip);
    let mut redis = state.redis.clone();
    let pending = serde_json::to_string(&PendingSmtpVerification {
        code: code_str.clone(),
        email: body.test_email.trim().to_ascii_lowercase(),
    })
    .map_err(|e| AppError::Internal(format!("Failed to serialize SMTP verification: {}", e)))?;
    let _: () = redis::cmd("SET")
        .arg(&redis_key)
        .arg(&pending)
        .arg("EX")
        .arg(600u64)
        .query_async(&mut redis)
        .await
        .map_err(|e| AppError::Internal(format!("Redis error: {}", e)))?;

    // Send the code via the provided SMTP config
    let password = if body.password.trim().is_empty() {
        get_setting(&state.db, "smtp_password").await.unwrap_or_default()
    } else {
        body.password.clone()
    };

    crate::infra::email::send_custom_email(
        &crate::infra::email::SmtpConfig {
            host: body.host.trim().to_string(),
            port: body.port,
            username: Some(body.username.trim().to_string()).filter(|v| !v.is_empty()),
            password: Some(password).filter(|v| !v.is_empty()),
            from_email: body.from_email.trim().to_string(),
            security: if !body.security.trim().is_empty() {
                body.security.trim().to_string()
            } else {
                "none".to_string()
            },
            insecure_tls: body.insecure_tls,
        },
        body.test_email.trim(),
        "Your Rooiam verification code",
        &format!("Your Rooiam SMTP verification code is: {}\n\nThis code expires in 10 minutes.", code_str),
    )
    .await
    .map_err(|e| {
        // Clean up Redis key if send failed — don't leave a stale code
        let mut redis2 = state.redis.clone();
        let key2 = redis_key.clone();
        actix_web::rt::spawn(async move {
            let _: () = redis::cmd("DEL").arg(&key2).query_async(&mut redis2).await.unwrap_or(());
        });
        AppError::Validation(e)
    })?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": format!("Verification code sent to {}. Enter the 6-digit code to confirm.", body.test_email.trim()),
    })))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct VerifySmtpCodeRequest {
    code: String,
    test_email: String,
    // SMTP config fields — saved to DB only after code is verified
    host: String,
    port: u16,
    #[serde(default)]
    security: String,
    #[serde(default)]
    insecure_tls: bool,
    #[serde(default)]
    username: String,
    #[serde(default)]
    password: String,
    from_email: String,
}

/// POST /v1/setup/verify-smtp-code
///
/// Verifies the 6-digit code sent by `send_smtp_verification`.
/// On success, saves the SMTP config to DB and clears the Redis key.
async fn verify_smtp_code(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<VerifySmtpCodeRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_setup_access(&req, &state).await?;

    let submitted = body.code.trim();
    if submitted.is_empty() {
        return Err(AppError::Validation("Code is required".into()));
    }

    let ip = client_ip_string_from_http_request(&req, state.config.as_ref())
        .unwrap_or_else(|| "unknown".to_string());
    let redis_key = format!("smtp_verify:{}", ip);
    let mut redis = state.redis.clone();

    let stored: Option<String> = redis::cmd("GET")
        .arg(&redis_key)
        .query_async(&mut redis)
        .await
        .unwrap_or(None);

    let stored = match stored {
        None => {
            return Err(AppError::Validation(
                "Code expired or not found. Click Send verification code again.".into(),
            ));
        }
        Some(raw) => raw,
    };

    let pending: PendingSmtpVerification = serde_json::from_str(&stored)
        .map_err(|_| AppError::Validation("Code expired or invalid. Click Send verification code again.".into()))?;
    if pending.code != submitted {
        return Err(AppError::Validation("Incorrect code. Try again.".into()));
    }
    if pending.email.trim() != body.test_email.trim().to_ascii_lowercase() {
        return Err(AppError::Validation("The verified email no longer matches the current platform owner draft. Send a new code.".into()));
    }

    // Code is correct — delete it and save SMTP config to DB
    let _: () = redis::cmd("DEL").arg(&redis_key).query_async(&mut redis).await.unwrap_or(());

    let db = &state.db;
    set_setting(db, "smtp_host",         body.host.trim()).await?;
    set_setting(db, "smtp_port",         &body.port.to_string()).await?;
    set_setting(db, "smtp_security",     body.security.trim()).await?;
    set_setting(db, "smtp_insecure_tls", if body.insecure_tls { "true" } else { "false" }).await?;
    set_setting(db, "smtp_username",     body.username.trim()).await?;
    set_setting(db, "smtp_from_email",   body.from_email.trim()).await?;
    if !body.password.trim().is_empty() {
        set_setting(db, "smtp_password", body.password.trim()).await?;
    }
    let verified_at = Utc::now().to_rfc3339();
    set_setting(db, "setup_smtp_verified_email", body.test_email.trim()).await?;
    set_setting(db, "setup_smtp_verified_at", &verified_at).await?;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: load_authenticated_session(&req, &state).await.ok().map(|s| s.user_id),
        organization_id: None,
        action: "setup.smtp.verified".into(),
        target_type: "system_setting".into(),
        target_id: Some("smtp".into()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({
            "verified_email": body.test_email.trim(),
            "verified_at": verified_at,
        }),
    }).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "verified": true })))
}

/// POST /v1/setup/test-redis
async fn test_redis(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<TestRedisRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_setup_access(&req, &state).await?;
    let url = body.url.trim();
    if url.is_empty() {
        return Err(AppError::Validation("Redis URL is required".into()));
    }

    let client = redis::Client::open(url)
        .map_err(|e| AppError::Validation(format!("Invalid Redis URL: {}", e)))?;
    let mut conn = client
        .get_connection_manager()
        .await
        .map_err(|e| AppError::Validation(format!("Could not connect to Redis: {}", e)))?;

    let pong: String = redis::cmd("PING")
        .query_async(&mut conn)
        .await
        .map_err(|e| AppError::Validation(format!("Redis ping failed: {}", e)))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": format!("Redis connection successful ({})", pong),
    })))
}

/// POST /v1/setup/configure-oauth
async fn configure_oauth(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<OAuthConfigRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_setup_access(&req, &state).await?;
    let db = &state.db;
    let existing_google_client_id = get_setting(db, "google_client_id").await.unwrap_or_default();
    let existing_google_client_secret = get_setting(db, "google_client_secret").await.unwrap_or_default();
    let existing_microsoft_client_id = get_setting(db, "microsoft_client_id").await.unwrap_or_default();
    let existing_microsoft_client_secret = get_setting(db, "microsoft_client_secret").await.unwrap_or_default();
    let existing_microsoft_tenant_id = get_setting(db, "microsoft_tenant_id")
        .await
        .unwrap_or_else(|| "common".to_string());
    let google_verified = get_setting(db, "google_oauth_verified_at").await.unwrap_or_default();
    let microsoft_verified = get_setting(db, "microsoft_oauth_verified_at").await.unwrap_or_default();
    let mut google_changed = false;
    let mut microsoft_changed = false;

    if let Some(ref id) = body.google_client_id {
        if id.trim().is_empty() {
            // Keep the existing value unless the caller explicitly clears through a dedicated flow.
        } else {
        google_changed |= id != &existing_google_client_id;
        set_setting(db, "google_client_id", id.trim()).await?;
        }
    }
    if let Some(ref secret) = body.google_client_secret {
        if !secret.trim().is_empty() {
            google_changed |= secret != &existing_google_client_secret;
            set_setting(db, "google_client_secret", secret).await?;
        }
    }
    if let Some(ref id) = body.microsoft_client_id {
        if !id.trim().is_empty() {
            microsoft_changed |= id != &existing_microsoft_client_id;
            set_setting(db, "microsoft_client_id", id.trim()).await?;
        }
    }
    if let Some(ref secret) = body.microsoft_client_secret {
        if !secret.trim().is_empty() {
            microsoft_changed |= secret != &existing_microsoft_client_secret;
            set_setting(db, "microsoft_client_secret", secret).await?;
        }
    }
    if let Some(ref tenant) = body.microsoft_tenant_id {
        if !tenant.trim().is_empty() {
            microsoft_changed |= tenant != &existing_microsoft_tenant_id;
            set_setting(db, "microsoft_tenant_id", tenant.trim()).await?;
        }
    }

    if google_changed {
        set_setting(db, "google_oauth_verified_at", "").await?;
        set_setting(db, "google_admin_login_enabled", "false").await?;
    }
    if microsoft_changed {
        set_setting(db, "microsoft_oauth_verified_at", "").await?;
        set_setting(db, "microsoft_admin_login_enabled", "false").await?;
    }

    if let Some(enabled) = body.google_admin_login_enabled {
        if enabled && google_verified.is_empty() {
            return Err(AppError::Validation("Verify Google login successfully before enabling it for admin sign-in.".into()));
        }
        set_setting(db, "google_admin_login_enabled", if enabled { "true" } else { "false" }).await?;
    }

    if let Some(enabled) = body.microsoft_admin_login_enabled {
        if enabled && microsoft_verified.is_empty() {
            return Err(AppError::Validation("Verify Microsoft login successfully before enabling it for admin sign-in.".into()));
        }
        set_setting(db, "microsoft_admin_login_enabled", if enabled { "true" } else { "false" }).await?;
    }

    // ── Audit events ────────────────────────────────────────────────────────
    let actor_user_id = load_authenticated_session(&req, &state).await.ok().map(|s| s.user_id);
    let req_ip = client_ip_string_from_http_request(&req, state.config.as_ref());
    let req_ua = req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from);
    let audit = AuditService::new(state.db.clone());

    if google_changed {
        audit.log(AuditEvent {
            actor_user_id,
            organization_id: None,
            action: "setup.oauth.google.configured".into(),
            target_type: "system_setting".into(),
            target_id: Some("google_oauth".into()),
            ip: req_ip.clone(),
            user_agent: req_ua.clone(),
            metadata: serde_json::json!({
                "client_id_changed": body.google_client_id.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false),
                "client_secret_changed": body.google_client_secret.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false),
                "verification_reset": true,
            }),
        }).await;
    } else if body.google_client_id.is_some() || body.google_client_secret.is_some() {
        audit.log(AuditEvent {
            actor_user_id,
            organization_id: None,
            action: "setup.oauth.google.configured".into(),
            target_type: "system_setting".into(),
            target_id: Some("google_oauth".into()),
            ip: req_ip.clone(),
            user_agent: req_ua.clone(),
            metadata: serde_json::json!({
                "client_id_changed": body.google_client_id.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false),
                "client_secret_changed": body.google_client_secret.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false),
                "verification_reset": false,
            }),
        }).await;
    }

    if let Some(enabled) = body.google_admin_login_enabled {
        audit.log(AuditEvent {
            actor_user_id,
            organization_id: None,
            action: if enabled { "setup.oauth.google.admin_login_enabled".into() } else { "setup.oauth.google.admin_login_disabled".into() },
            target_type: "system_setting".into(),
            target_id: Some("google_admin_login_enabled".into()),
            ip: req_ip.clone(),
            user_agent: req_ua.clone(),
            metadata: serde_json::json!({ "enabled": enabled }),
        }).await;
    }

    if microsoft_changed {
        audit.log(AuditEvent {
            actor_user_id,
            organization_id: None,
            action: "setup.oauth.microsoft.configured".into(),
            target_type: "system_setting".into(),
            target_id: Some("microsoft_oauth".into()),
            ip: req_ip.clone(),
            user_agent: req_ua.clone(),
            metadata: serde_json::json!({
                "client_id_changed": body.microsoft_client_id.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false),
                "client_secret_changed": body.microsoft_client_secret.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false),
                "tenant_id_changed": body.microsoft_tenant_id.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false),
                "verification_reset": true,
            }),
        }).await;
    } else if body.microsoft_client_id.is_some() || body.microsoft_client_secret.is_some() || body.microsoft_tenant_id.is_some() {
        audit.log(AuditEvent {
            actor_user_id,
            organization_id: None,
            action: "setup.oauth.microsoft.configured".into(),
            target_type: "system_setting".into(),
            target_id: Some("microsoft_oauth".into()),
            ip: req_ip.clone(),
            user_agent: req_ua.clone(),
            metadata: serde_json::json!({
                "client_id_changed": body.microsoft_client_id.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false),
                "client_secret_changed": body.microsoft_client_secret.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false),
                "tenant_id_changed": body.microsoft_tenant_id.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false),
                "verification_reset": false,
            }),
        }).await;
    }

    if let Some(enabled) = body.microsoft_admin_login_enabled {
        audit.log(AuditEvent {
            actor_user_id,
            organization_id: None,
            action: if enabled { "setup.oauth.microsoft.admin_login_enabled".into() } else { "setup.oauth.microsoft.admin_login_disabled".into() },
            target_type: "system_setting".into(),
            target_id: Some("microsoft_admin_login_enabled".into()),
            ip: req_ip.clone(),
            user_agent: req_ua.clone(),
            metadata: serde_json::json!({ "enabled": enabled }),
        }).await;
    }
    // ────────────────────────────────────────────────────────────────────────

    tracing::info!("Setup: OAuth providers configured");

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "OAuth configuration saved.",
    })))
}

async fn prepare_oauth_verification(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<PrepareOAuthVerificationRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_setup_access(&req, &state).await?;

    let provider = body.provider.trim().to_lowercase();
    if provider != "google" && provider != "microsoft" {
        return Err(AppError::Validation("Provider must be google or microsoft.".into()));
    }
    if body.client_id.trim().is_empty() {
        return Err(AppError::Validation("Client ID is required.".into()));
    }

    let stored_secret = match provider.as_str() {
        "google" => get_setting(&state.db, "google_client_secret").await.unwrap_or_default(),
        "microsoft" => get_setting(&state.db, "microsoft_client_secret").await.unwrap_or_default(),
        _ => String::new(),
    };
    let effective_secret = if body.client_secret.trim().is_empty() {
        stored_secret
    } else {
        body.client_secret.trim().to_string()
    };
    if effective_secret.trim().is_empty() {
        return Err(AppError::Validation("Client secret is required before verification.".into()));
    }

    let tenant_id = if provider == "microsoft" {
        Some(body.tenant_id.clone().unwrap_or_else(|| "common".to_string()))
    } else {
        None
    };

    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let draft_key = URL_SAFE_NO_PAD.encode(bytes);
    let redis_key = format!("pending_oauth_verify:{}", draft_key);
    let payload = serde_json::json!({
        "provider": provider,
        "client_id": body.client_id.trim(),
        "client_secret": effective_secret,
        "tenant_id": tenant_id,
    });
    let mut redis_conn = state.redis.clone();
    let _: () = redis::cmd("SETEX")
        .arg(&redis_key)
        .arg(600)
        .arg(payload.to_string())
        .query_async(&mut redis_conn)
        .await
        .map_err(|e| AppError::Internal(format!("Redis auth state failure: {}", e)))?;

    let initiated_ip = client_ip_string_from_http_request(&req, state.config.as_ref());
    let initiated_ua = req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from);
    let auth_url = crate::modules::oauth::handlers::start_oauth_flow(
        &state,
        &provider,
        Some(body.redirect_uri.trim()),
        Some("admin"),
        "login",
        None,
        initiated_ip,
        initiated_ua,
        Some(draft_key),
    ).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "authorization_url": auth_url,
    })))
}

/// POST /v1/setup/configure-admin-access — platform owner only
async fn configure_admin_access(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<AdminAccessRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_owner(&req, &state).await?;
    let db = &state.db;

    if let Some(allowed) = body.admin_passkey_allowed {
        set_setting(db, "admin_passkey_allowed", if allowed { "true" } else { "false" }).await?;
    }
    if let Some(require) = body.admin_require_mfa {
        set_setting(db, "admin_require_mfa", if require { "true" } else { "false" }).await?;
    }

    let actor_user_id = load_authenticated_session(&req, &state).await.ok().map(|s| s.user_id);
    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id,
        organization_id: None,
        action: "setup.admin_access.configured".into(),
        target_type: "system_setting".into(),
        target_id: Some("admin_access".into()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({
            "passkey_allowed": body.admin_passkey_allowed,
            "mfa_required": body.admin_require_mfa,
        }),
    }).await;

    tracing::info!("Setup: admin access policy configured");

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Admin access policy saved.",
    })))
}

async fn configure_public_urls(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<PublicUrlsRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_setup_access(&req, &state).await?;
    let previous_issuer_url = get_setting(&state.db, "issuer_url").await.unwrap_or_default();
    let urls = PublicUrls {
        issuer_url: normalized_url_or_error(&body.issuer_url, "issuer_url")?,
        frontend_url: normalized_url_or_error(&body.frontend_url, "frontend_url")?,
        admin_url: normalized_url_or_error(&body.admin_url, "admin_url")?,
    };

    set_setting(&state.db, "issuer_url", &urls.issuer_url).await?;
    set_setting(&state.db, "frontend_url", &urls.frontend_url).await?;
    set_setting(&state.db, "admin_url", &urls.admin_url).await?;
    let issuer_changed = !previous_issuer_url.is_empty() && previous_issuer_url != urls.issuer_url;
    if issuer_changed {
        set_setting(&state.db, "google_oauth_verified_at", "").await?;
        set_setting(&state.db, "microsoft_oauth_verified_at", "").await?;
        set_setting(&state.db, "google_admin_login_enabled", "false").await?;
        set_setting(&state.db, "microsoft_admin_login_enabled", "false").await?;
    }

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: load_authenticated_session(&req, &state).await.ok().map(|s| s.user_id),
        organization_id: None,
        action: "setup.public_urls.configured".into(),
        target_type: "system_setting".into(),
        target_id: Some("public_urls".into()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({
            "issuer_url": urls.issuer_url,
            "frontend_url": urls.frontend_url,
            "admin_url": urls.admin_url,
            "oauth_verification_reset": issuer_changed,
        }),
    }).await;

    Ok(HttpResponse::Ok().json(PublicUrlsResponse {
        google_callback_url: callback_url(&urls.issuer_url, "google"),
        microsoft_callback_url: callback_url(&urls.issuer_url, "microsoft"),
        issuer_url: urls.issuer_url,
        frontend_url: urls.frontend_url,
        admin_url: urls.admin_url,
    }))
}

/// GET /v1/setup/storage-config
async fn get_setup_storage_config(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    ensure_setup_access(&req, &state).await?;
    let cfg = load_platform_storage_config(&state.db).await?;
    Ok(HttpResponse::Ok().json(cfg))
}

/// POST /v1/setup/storage-config
async fn save_setup_storage_config(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<PlatformStorageConfigUpdate>,
) -> Result<HttpResponse, AppError> {
    ensure_setup_access(&req, &state).await?;
    let cfg = save_platform_storage_config(&state.db, &body).await?;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: load_authenticated_session(&req, &state).await.ok().map(|s| s.user_id),
        organization_id: None,
        action: "setup.storage.configured".into(),
        target_type: "system_setting".into(),
        target_id: Some("storage".into()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({
            "backend": format!("{:?}", body.backend).to_lowercase(),
            "local_path": body.local_path.trim(),
            "minio_endpoint": body.minio_endpoint.trim(),
            "minio_bucket": body.minio_bucket.trim(),
            "minio_access_key": body.minio_access_key.trim(),
            "minio_secret_key_changed": body.minio_secret_key.as_ref().map(|v| !v.trim().is_empty()).unwrap_or(false),
            "minio_use_ssl": body.minio_use_ssl,
        }),
    }).await;

    Ok(HttpResponse::Ok().json(cfg))
}

/// POST /v1/setup/test-storage
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SetupTestStorageRequest {
    backend: String,
    local_path: Option<String>,
    minio_endpoint: Option<String>,
    minio_bucket: Option<String>,
    minio_access_key: Option<String>,
    minio_secret_key: Option<String>,
    minio_use_ssl: Option<bool>,
}

async fn test_setup_storage(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<SetupTestStorageRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_setup_access(&req, &state).await?;

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
                    get_setting(&state.db, "storage_minio_secret_key")
                        .await
                        .filter(|value| !value.trim().is_empty())
                        .unwrap_or_else(|| std::env::var("ROOIAM_MINIO_PASSWORD").unwrap_or_default())
                } else {
                    sk.trim().to_string()
                }
            } else {
                get_setting(&state.db, "storage_minio_secret_key")
                    .await
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or_else(|| std::env::var("ROOIAM_MINIO_PASSWORD").unwrap_or_default())
            };

            match test_minio_storage(&endpoint, &bucket, &access_key, &secret_key, use_ssl).await {
                Ok(msg) => Ok(HttpResponse::Ok().json(serde_json::json!({ "ok": true, "message": msg }))),
                Err(e) => Err(AppError::Validation(e)),
            }
        }
        other => Err(AppError::Validation(format!("Unknown storage backend '{}'. Use 'local' or 'minio'.", other))),
    }
}

/// POST /v1/setup/complete — mark setup as done
async fn complete_setup(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    ensure_setup_access(&req, &state).await?;
    let db = &state.db;

    if !platform_owner_exists(db).await? {
        let email = get_setting(db, "setup_owner_email").await.unwrap_or_default();
        let display_name = get_setting(db, "setup_owner_display_name").await.unwrap_or_default();
        let smtp_verified_email = get_setting(db, "setup_smtp_verified_email").await.unwrap_or_default();

        if email.trim().is_empty() || display_name.trim().is_empty() {
            return Err(AppError::Validation("Platform owner draft is incomplete. Finish the Platform Owner step first.".into()));
        }
        if smtp_verified_email.trim().to_ascii_lowercase() != email.trim().to_ascii_lowercase() {
            return Err(AppError::Validation("SMTP must be verified for the current platform owner email before setup can finish.".into()));
        }

        let mut tx = db.begin()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to start tx: {}", e)))?;

        let user_id: uuid::Uuid = sqlx::query_scalar::<_, uuid::Uuid>(
            "INSERT INTO users (id, display_name, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, NOW(), NOW())
             RETURNING id"
        )
        .bind(&display_name)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to create platform owner: {}", e)))?;

        sqlx::query(
            "INSERT INTO user_emails (user_id, email, is_primary, is_verified, verified_at, created_at)
             VALUES ($1, $2, true, true, NOW(), NOW())"
        )
        .bind(user_id)
        .bind(&email)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to create platform owner email: {}", e)))?;

        sqlx::query(
            "UPDATE users SET is_platform_owner = true, is_superuser = true WHERE id = $1"
        )
        .bind(user_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to promote platform owner: {}", e)))?;

        tx.commit()
            .await
            .map_err(|e| AppError::Internal(format!("Failed to commit platform owner: {}", e)))?;

        set_setting(db, "superuser_email", &email).await?;

        let platform_org_id: Option<uuid::Uuid> = sqlx::query_scalar(
            r#"
            INSERT INTO organizations (name, slug, is_platform_org)
            VALUES ('Rooiam', 'rooiam', true)
            ON CONFLICT (slug) DO UPDATE SET is_platform_org = true
            RETURNING id
            "#
        )
        .fetch_optional(db)
        .await
        .ok()
        .flatten();

        if let Some(org_id) = platform_org_id {
            let member_id: Option<uuid::Uuid> = sqlx::query_scalar(
                "SELECT id FROM organization_members WHERE organization_id = $1 AND user_id = $2"
            )
            .bind(org_id)
            .bind(user_id)
            .fetch_optional(db)
            .await
            .ok()
            .flatten();

            let member_id = if let Some(mid) = member_id {
                mid
            } else {
                sqlx::query_scalar::<_, uuid::Uuid>(
                    "INSERT INTO organization_members (organization_id, user_id, status) VALUES ($1, $2, 'active') RETURNING id"
                )
                .bind(org_id)
                .bind(user_id)
                .fetch_one(db)
                .await
                .map_err(|e| AppError::Internal(format!("Failed to add platform owner to platform org: {}", e)))?
            };

            let _ = sqlx::query(
                r#"
                INSERT INTO member_roles (member_id, role_id)
                SELECT $1, id FROM roles WHERE code = 'owner' AND is_system = true
                ON CONFLICT DO NOTHING
                "#
            )
            .bind(member_id)
            .execute(db)
            .await;
        }

        set_setting(db, "setup_owner_email", "").await?;
        set_setting(db, "setup_owner_display_name", "").await?;
        tracing::info!("Setup: platform owner created at final commit → {} ({})", email, user_id);
    }

    set_setting(db, "setup_completed", "true").await?;
    tracing::info!("Setup: marked as complete ✅");
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Setup complete! Rooiam is ready.",
    })))
}

async fn demo_login(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<DemoLoginRequest>,
) -> Result<HttpResponse, AppError> {
    if !demo_routes_enabled() {
        return Err(AppError::NotFound("Demo mode is not enabled.".into()));
    }

    let org_slug = body.org_slug.trim().to_ascii_lowercase();
    if org_slug.is_empty() {
        return Err(AppError::Validation("Organization slug is required.".into()));
    }

    let identity_repo = IdentityRepository::new(state.db.clone());
    let org_repo = OrganizationRepository::new(state.db.clone());
    let demo_email = body
        .email
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_else(|| {
            demo_end_user_email_for_org(&org_slug)
                .or_else(|| demo_customer_email_for_org(&org_slug))
                .unwrap_or_else(|| demo_tenant_admin_email_for_org(&org_slug))
                .to_string()
        });
    let user_id = identity_repo
        .get_user_id_by_email(&demo_email)
        .await?
        .ok_or_else(|| AppError::NotFound("Seeded demo user was not found.".into()))?;
    let org = org_repo
        .get_organization_by_slug(&org_slug)
        .await?
        .ok_or_else(|| AppError::NotFound("Demo workspace not found.".into()))?;

    if !org_repo.is_member(org.id, user_id).await? {
        return Err(AppError::Validation("Demo user is not a member of that workspace.".into()));
    }

    let app_name = body
        .app_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Rooiam Demo")
        .to_string();

    let session_service = SessionService::new(SessionRepository::new(state.db.clone()), state.db.clone());
    let (_session, opaque_string) = session_service
        .create_opaque_session_with_context(
            user_id,
            crate::modules::session::models::SessionCreateContext {
                user_agent: req
                    .headers()
                    .get("user-agent")
                    .and_then(|value| value.to_str().ok())
                    .map(str::to_string),
                ip: client_ip_from_http_request(&req, state.config.as_ref()),
                current_org_id: Some(org.id),
                login_surface: Some("tenant".into()),
                login_app_name: Some(app_name.clone()),
                login_workspace_slug: Some(org.slug.clone()),
            },
        )
        .await?;

    let cookie = build_session_cookie(opaque_string, &state.config, 7 * 24 * 3600);

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(user_id),
            organization_id: Some(org.id),
            action: "auth.login.success".into(),
            target_type: "user".into(),
            target_id: Some(user_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|value| value.to_str().ok())
                .map(str::to_string),
            metadata: serde_json::json!({
                "method": "demo_shortcut",
                "app_name": app_name,
                "workspace_slug": org.slug,
                "demo_user_email": demo_email,
                "demo_mode": true,
            }),
        })
        .await;

    Ok(HttpResponse::Ok()
        .cookie(cookie)
        .json(serde_json::json!({
            "ok": true,
            "workspace_slug": body.org_slug.trim(),
            "app_name": app_name,
        })))
}

// ── Test mode endpoints ───────────────────────────────────────────────────────

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TestLoginRequest {
    /// Must end in `.test`, e.g. `pixel@neoncat.test`.
    /// If omitted, defaults to `pixel@neoncat.test`.
    /// Use `owner@rooiam.test` for platform owner, `admin@rooiam.test` for platform admin.
    email: Option<String>,
    /// Override which org to log into. If omitted, derived from email domain.
    org_slug: Option<String>,
}

/// POST /v1/test/login
///
/// Creates the user + org on the fly if they don't exist, then logs in.
/// Only active in test mode (`ROOIAM_MODE=test`).
/// Email must end in `.test` to prevent accidental use of real addresses.
async fn test_login(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<TestLoginRequest>,
) -> Result<HttpResponse, AppError> {
    if !test_mode_enabled() {
        return Err(AppError::NotFound("Test mode is not enabled.".into()));
    }

    // Email is required — reject missing, blank, or empty values.
    let email = match body.email.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
        Some(v) => v.to_ascii_lowercase(),
        None => return Err(AppError::Validation("email is required".into())),
    };

    if !email.ends_with(".test") {
        return Err(AppError::Validation(
            "Test login email must end in .test (e.g. pixel@neoncat.test).".into(),
        ));
    }

    // Derive display name + org slug from the built-in list or from the email itself
    let (display_name, org_slug) = TEST_IDENTITIES
        .iter()
        .find(|(e, _, _)| *e == email.as_str())
        .map(|(_, name, slug)| ((*name).to_string(), (*slug).to_string()))
        .unwrap_or_else(|| {
            // e.g. "nova@moonpetal.test" → name="Nova", slug="moonpetal-test"
            let local = email.split('@').next().unwrap_or("tester");
            let domain = email.split('@').nth(1).unwrap_or("test");
            let slug = domain.replace('.', "-");
            let name = {
                let mut c = local.chars();
                match c.next() {
                    None => local.to_string(),
                    Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                }
            };
            (name, slug)
        });

    let identity_repo = IdentityRepository::new(state.db.clone());
    let org_repo = OrganizationRepository::new(state.db.clone());

    // Ensure user exists
    let user_id = match identity_repo.get_user_id_by_email(&email).await? {
        Some(id) => id,
        None => {
            let id = identity_repo.create_user_with_email(&email).await?;
            let _ = identity_repo
                .update_user_profile(id, Some(display_name.clone()), None)
                .await;
            id
        }
    };

    // Use explicit org_slug from request if provided, otherwise derive from email domain
    let org_slug = body.org_slug
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(|v| v.to_ascii_lowercase())
        .unwrap_or(org_slug);

    // Ensure org exists — create with this user as owner if not
    let org = match org_repo.get_organization_by_slug(&org_slug).await? {
        Some(o) => o,
        None => org_repo.create_organization(user_id, &org_slug, &org_slug).await?,
    };

    // Ensure user is a member of the org
    if !org_repo.is_member(org.id, user_id).await? {
        sqlx::query(
            "INSERT INTO organization_members (organization_id, user_id, status) VALUES ($1, $2, 'active') ON CONFLICT DO NOTHING"
        )
        .bind(org.id)
        .bind(user_id)
        .execute(&state.db)
        .await?;
    }

    let session_service = SessionService::new(SessionRepository::new(state.db.clone()), state.db.clone());
    let (_session, opaque_string) = session_service
        .create_opaque_session_with_context(
            user_id,
            crate::modules::session::models::SessionCreateContext {
                user_agent: req
                    .headers()
                    .get("user-agent")
                    .and_then(|v| v.to_str().ok())
                    .map(str::to_string),
                ip: client_ip_from_http_request(&req, state.config.as_ref()),
                current_org_id: Some(org.id),
                login_surface: Some("test".into()),
                login_app_name: Some("Rooiam Test".into()),
                login_workspace_slug: Some(org.slug.clone()),
            },
        )
        .await?;

    let cookie = build_session_cookie(opaque_string, &state.config, 7 * 24 * 3600);

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(user_id),
            organization_id: Some(org.id),
            action: "auth.login.success".into(),
            target_type: "user".into(),
            target_id: Some(user_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|v| v.to_str().ok())
                .map(str::to_string),
            metadata: serde_json::json!({
                "method": "test_shortcut",
                "test_user_email": email,
                "workspace_slug": org.slug,
            }),
        })
        .await;

    Ok(HttpResponse::Ok()
        .cookie(cookie)
        .json(serde_json::json!({
            "ok": true,
            "email": email,
            "display_name": display_name,
            "org_slug": org.slug,
            "user_id": user_id,
        })))
}

/// DELETE /v1/test/cleanup
///
/// Deletes all users, orgs, sessions, and audit rows created via test-login
/// (identified by `*.test` email addresses). Only active in test mode.
async fn test_cleanup(
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    if !test_mode_enabled() {
        return Err(AppError::NotFound("Test mode is not enabled.".into()));
    }

    // Delete in dependency order, track row counts via execute().rows_affected()
    // 1. Audit logs for test users
    let audit_deleted = sqlx::query(
        r#"
        DELETE FROM audit_logs
        WHERE actor_user_id IN (
            SELECT user_id FROM user_emails WHERE email LIKE '%.test'
        )
        "#
    )
    .execute(&state.db)
    .await
    .map(|r| r.rows_affected())
    .unwrap_or(0);

    // 2. Sessions for test users
    let sessions_deleted = sqlx::query(
        r#"
        DELETE FROM sessions
        WHERE user_id IN (
            SELECT user_id FROM user_emails WHERE email LIKE '%.test'
        )
        "#
    )
    .execute(&state.db)
    .await
    .map(|r| r.rows_affected())
    .unwrap_or(0);

    // 3. Org members for test users
    sqlx::query(
        r#"
        DELETE FROM organization_members
        WHERE user_id IN (
            SELECT user_id FROM user_emails WHERE email LIKE '%.test'
        )
        "#
    )
    .execute(&state.db)
    .await?;

    // 4. Test orgs (slugs ending in -test, only if no non-test members remain)
    let orgs_deleted = sqlx::query(
        r#"
        DELETE FROM organizations
        WHERE slug LIKE '%-test'
          AND NOT EXISTS (
              SELECT 1 FROM organization_members om
              JOIN user_emails ue ON ue.user_id = om.user_id
              WHERE om.organization_id = organizations.id
                AND ue.email NOT LIKE '%.test'
          )
        "#
    )
    .execute(&state.db)
    .await
    .map(|r| r.rows_affected())
    .unwrap_or(0);

    // 5. Test users
    let users_deleted = sqlx::query(
        r#"
        DELETE FROM users
        WHERE id IN (
            SELECT user_id FROM user_emails WHERE email LIKE '%.test'
        )
        "#
    )
    .execute(&state.db)
    .await
    .map(|r| r.rows_affected())
    .unwrap_or(0);

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "deleted": {
            "users": users_deleted,
            "orgs": orgs_deleted,
            "sessions": sessions_deleted,
            "audit_logs": audit_deleted,
        }
    })))
}

// ── Routes ───────────────────────────────────────────────────────────────────

pub fn routes(mode: crate::bootstrap::config::ServerMode) -> impl Fn(&mut web::ServiceConfig) {
    move |cfg: &mut web::ServiceConfig| {
    // ── /v1/setup — wizard + public config (always registered) ───────────────
    cfg.service(
        web::scope("/setup")
            .route("/status",                web::get().to(get_status))
            .route("/config",                web::get().to(get_setup_config))
            .route("/admin-access",          web::get().to(get_admin_access_policy))
            .route("/public-urls",           web::get().to(get_public_urls))
            .route("/test-database",         web::post().to(test_database_connection))
            .route("/auth-methods",          web::get().to(get_public_auth_methods))
            .route("/login-bootstrap",       web::get().to(get_login_bootstrap))
            .route("/create-admin",          web::post().to(create_admin))
            .route("/configure-public-urls", web::post().to(configure_public_urls))
            .route("/configure-smtp",             web::post().to(configure_smtp))
            .route("/test-smtp",                  web::post().to(test_smtp))
            .route("/send-smtp-verification",     web::post().to(send_smtp_verification))
            .route("/verify-smtp-code",           web::post().to(verify_smtp_code))
            .route("/test-redis",            web::post().to(test_redis))
            .route("/configure-oauth",       web::post().to(configure_oauth))
            .route("/prepare-oauth-verification", web::post().to(prepare_oauth_verification))
            .route("/configure-admin-access",web::post().to(configure_admin_access))
            .route("/storage-config",        web::get().to(get_setup_storage_config))
            .route("/storage-config",        web::post().to(save_setup_storage_config))
            .route("/test-storage",          web::post().to(test_setup_storage))
            .route("/complete",              web::post().to(complete_setup)),
    );

    // ── /v1/demo — demo showcase routes (demo + test mode only) ──────────────
    if mode.demo_routes_enabled() {
        cfg.service(
            web::scope("/demo")
                .route("/login",       web::post().to(demo_login))
                .route("/app-catalog", web::get().to(get_demo_app_catalog))
                .route("/app-config",  web::get().to(get_demo_app_config)),
        );
    }

    // ── /v1/test — test automation routes (test mode only) ───────────────────
    if mode == crate::bootstrap::config::ServerMode::Test {
        cfg.service(
            web::scope("/test")
                .route("/login",   web::post().to(test_login))
                .route("/cleanup", web::delete().to(test_cleanup)),
        );
    }
    } // end move closure
}
