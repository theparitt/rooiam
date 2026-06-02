use actix_web::{web, HttpRequest, HttpResponse};
use actix_web::http::header::{CONTENT_SECURITY_POLICY, HeaderValue};
use crate::shared::error::AppError;
use crate::bootstrap::state::AppState;
use super::service::AuthService;
use super::repository::AuthRepository;
use crate::modules::session::{
    service::SessionService,
    repository::SessionRepository,
    cookie::{build_clear_session_cookie, build_session_cookie, ROOIAM_SESSION_COOKIE},
};
use crate::modules::audit::service::{AuditService, AuditEvent};
use crate::modules::identity::repository::IdentityRepository;
use crate::modules::mfa::{repository::MfaRepository, service::MfaService};
use crate::shared::auth_context::resolve_login_context;
use crate::shared::auth_policy::{ensure_auth_method_allowed, ensure_email_domain_allowed, get_workspace_policy_for_redirect, AuthMethod};
use crate::shared::operator_policy::{enforce_operator_login_policy, AuthMethod as OpAuthMethod};
use crate::shared::ip_policy::{access_denied_message, evaluate_ip_access, resolve_effective_ip_policy_for_redirect};
use crate::shared::platform_org::get_platform_org_id;
use crate::shared::request_ip::{client_ip_from_http_request, client_ip_string_from_http_request};
use crate::shared::runtime_config::{effective_admin_url, effective_app_url, effective_public_urls};
use crate::shared::widget_login_context::{
    consume_widget_login_context, create_widget_login_context, is_widget_login_context_invalid_error,
    WidgetLoginContextPayload,
};
use crate::modules::organization::repository::OrganizationRepository;
use sqlx::Row;
use sha2::{Digest, Sha256};
use url::Url;

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct StartMagicLinkRequest {
    pub email: String,
    pub redirect_uri: Option<String>,
    pub widget_login_context: Option<String>,
    pub widget_embed_origin: Option<String>,
    pub surface: Option<String>,
}

#[derive(serde::Serialize)]
pub struct StartMagicLinkResponse {
    pub ok: bool,
    pub message: String,
    pub widget_login_context: Option<String>,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct VerifyMagicLinkRequest {
    pub token: String,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VerifyMagicLinkQuery {
    pub token: String,
}

enum MagicLinkVerificationResult {
    Success {
        user_id: uuid::Uuid,
        redirect_uri: Option<String>,
        opaque_session: String,
        surface: Option<String>,
    },
    MfaRequired {
        challenge_id: uuid::Uuid,
        redirect_uri: Option<String>,
        surface: Option<String>,
    },
    MfaEnrollmentRequired {
        challenge_id: uuid::Uuid,
        redirect_uri: Option<String>,
        surface: Option<String>,
    },
}

fn infer_magic_link_surface(surface: Option<&str>) -> &'static str {
    match surface {
        Some("admin") => "admin",
        _ => "tenant",
    }
}

async fn build_login_ui_verify_url(
    state: &web::Data<AppState>,
    _surface: Option<&str>,
    redirect_uri: Option<&str>,
    mfa_challenge: Option<uuid::Uuid>,
    mfa_enrollment_challenge: Option<uuid::Uuid>,
) -> Result<String, AppError> {
    let target_base = effective_public_urls(&state.db, state.config.as_ref()).await?.issuer_url;
    let mut url = Url::parse(&format!("{}/verify", target_base.trim_end_matches('/')))
        .map_err(|e| AppError::Internal(format!("Invalid login UI URL: {}", e)))?;

    {
        let mut query = url.query_pairs_mut();
        if let Some(challenge_id) = mfa_challenge {
            query.append_pair("mfa_challenge", &challenge_id.to_string());
        }
        if let Some(challenge_id) = mfa_enrollment_challenge {
            query.append_pair("mfa_enrollment_challenge", &challenge_id.to_string());
        }
        if let Some(value) = redirect_uri.map(str::trim).filter(|value| !value.is_empty()) {
            query.append_pair("redirect_uri", value);
        }
    }

    Ok(url.to_string())
}

#[derive(serde::Deserialize, Default)]
#[serde(deny_unknown_fields)]
struct HostedLoginWidgetQuery {
    preview: Option<String>,
    workspace_id: Option<String>,
    workspace: Option<String>,
    org: Option<String>,
    client_id: Option<String>,
}

#[derive(sqlx::FromRow)]
struct HostedLoginWidgetAppRow {
    client_id: String,
    app_name: String,
    redirect_uri: String,
}

fn redirect_matches_origin(redirect_uri: &str, origin: Option<&str>) -> bool {
    let Some(origin) = origin.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };
    Url::parse(redirect_uri)
        .ok()
        .map(|parsed| parsed.origin().ascii_serialization() == origin)
        .unwrap_or(false)
}

fn configured_embed_preview_origins() -> Vec<String> {
    let mut origins = std::env::var("ROOIAM_ALLOWED_ORIGINS")
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();

    for key in ["ROOIAM_SERVER_URL", "ROOIAM_APP_URL", "ROOIAM_ADMIN_URL"] {
        if let Ok(value) = std::env::var(key) {
            if let Ok(parsed) = Url::parse(value.trim()) {
                let origin = parsed.origin().ascii_serialization();
                if !origins.iter().any(|existing| existing == &origin) {
                    origins.push(origin);
                }
            }
        }
    }

    origins.sort();
    origins.dedup();
    origins
}

fn require_explicit_embed_origins() -> bool {
    match std::env::var("ROOIAM_REQUIRE_EXPLICIT_EMBED_ORIGINS")
        .ok()
        .as_deref()
        .map(str::trim)
    {
        Some("1" | "true" | "TRUE" | "yes" | "YES") => true,
        Some("0" | "false" | "FALSE" | "no" | "NO") => false,
        _ => !matches!(
            std::env::var("ROOIAM_MODE").ok().as_deref().map(str::trim),
            Some("development" | "dev" | "local")
        ),
    }
}

fn request_embed_origin(req: &HttpRequest) -> Option<String> {
    let origin_header = req
        .headers()
        .get("origin")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty());

    if let Some(origin) = origin_header {
        if let Ok(parsed) = Url::parse(origin) {
            return Some(parsed.origin().ascii_serialization());
        }
    }

    let referer_header = req
        .headers()
        .get("referer")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty());

    referer_header.and_then(|referer| {
        Url::parse(referer)
            .ok()
            .map(|parsed| parsed.origin().ascii_serialization())
    })
}

fn frame_ancestors_directive(origins: &[String]) -> String {
    if origins.is_empty() {
        "'none'".into()
    } else {
        origins.join(" ")
    }
}

async fn load_widget_allowed_embed_origins(
    state: &web::Data<AppState>,
    client_id: &str,
    workspace_id: Option<&str>,
    workspace_slug: Option<&str>,
) -> Result<Vec<String>, AppError> {
    let rows = sqlx::query(
        r#"
        SELECT c.org_id, o.slug, ae.origin
        FROM oauth_clients c
        JOIN organizations o ON o.id = c.org_id
        LEFT JOIN oauth_client_allowed_embed_origins ae ON ae.oauth_client_id = c.id
        WHERE c.client_id = $1
          AND c.status = 'active'
        ORDER BY ae.origin
        "#,
    )
    .bind(client_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load hosted login widget embed origins: {}", e)))?;

    let first = rows
        .first()
        .ok_or_else(|| AppError::NotFound("Workspace app not found for this widget.".into()))?;

    let org_id: uuid::Uuid = first
        .try_get("org_id")
        .map_err(|e| AppError::Internal(format!("Hosted login widget is missing workspace ID: {}", e)))?;
    let org_slug: String = first
        .try_get("slug")
        .map_err(|e| AppError::Internal(format!("Hosted login widget is missing workspace slug: {}", e)))?;

    if let Some(raw_workspace_id) = workspace_id.map(str::trim).filter(|value| !value.is_empty()) {
        let parsed = uuid::Uuid::parse_str(raw_workspace_id)
            .map_err(|_| AppError::Validation("Workspace ID is invalid.".into()))?;
        if parsed != org_id {
            return Err(AppError::Forbidden(
                "This hosted login widget app does not belong to the requested workspace.".into(),
            ));
        }
    }

    if let Some(expected_slug) = workspace_slug.map(str::trim).filter(|value| !value.is_empty()) {
        if expected_slug != org_slug {
            return Err(AppError::Forbidden(
                "This hosted login widget app does not belong to the requested workspace.".into(),
            ));
        }
    }

    let mut origins = Vec::new();
    for row in rows {
        let origin: Option<String> = row
            .try_get("origin")
            .map_err(|e| AppError::Internal(format!("Hosted login widget embed origin row is invalid: {}", e)))?;
        if let Some(value) = origin {
            origins.push(value);
        }
    }
    origins.sort();
    origins.dedup();
    Ok(origins)
}

async fn load_widget_app_redirect(
    state: &web::Data<AppState>,
    client_id: &str,
    workspace_id: Option<&str>,
    workspace_slug: Option<&str>,
    preferred_origin: Option<&str>,
) -> Result<Option<HostedLoginWidgetAppRow>, AppError> {
    let org_id = if let Some(value) = workspace_id.map(str::trim).filter(|value| !value.is_empty()) {
        Some(uuid::Uuid::parse_str(value).map_err(|_| AppError::Validation("Invalid workspace_id.".into()))?)
    } else if let Some(slug) = workspace_slug.map(str::trim).filter(|value| !value.is_empty()) {
        let repo = OrganizationRepository::new(state.db.clone());
        repo.get_organization_by_slug(slug).await?.map(|org| org.id)
    } else {
        None
    };

    let mut rows = sqlx::query_as::<_, HostedLoginWidgetAppRow>(
        r#"
        SELECT c.client_id, c.app_name, r.redirect_uri
        FROM oauth_clients c
        JOIN oauth_client_redirect_uris r ON r.oauth_client_id = c.id
        WHERE c.client_id = $1
          AND c.status = 'active'
          AND ($2::uuid IS NULL OR c.org_id = $2)
        ORDER BY r.redirect_uri
        "#,
    )
    .bind(client_id)
    .bind(org_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load hosted login widget app redirects: {}", e)))?;

    if let Some(index) = rows.iter().position(|row| redirect_matches_origin(&row.redirect_uri, preferred_origin)) {
        return Ok(Some(rows.swap_remove(index)));
    }

    if preferred_origin.is_some() {
        return Ok(None);
    }

    Ok(rows.into_iter().next())
}

async fn hosted_login_page(req: HttpRequest, state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    if req.path() != "/login-widget" {
        return Ok(HttpResponse::Ok()
            .content_type("text/html; charset=utf-8")
            .body(HOSTED_LOGIN_HTML));
    }

    let query = web::Query::<HostedLoginWidgetQuery>::from_query(req.query_string())
        .map(|value| value.into_inner())
        .map_err(|e| AppError::Validation(crate::shared::request_validation::normalize_extractor_error("query", e.to_string())))?;
    let preview_mode = query.preview.as_deref() == Some("1");
    let workspace_slug = query.workspace.as_deref().or(query.org.as_deref());

    let allowed_origins = if preview_mode {
        configured_embed_preview_origins()
    } else {
        let client_id = query
            .client_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| AppError::Forbidden("The hosted login widget requires a workspace app client_id.".into()))?;
        load_widget_allowed_embed_origins(&state, client_id, query.workspace_id.as_deref(), workspace_slug).await?
    };

    if allowed_origins.is_empty() {
        return Err(AppError::Forbidden(
            if require_explicit_embed_origins() {
                "This workspace app does not have any allowed embed origins configured. Add explicit embed origins in Workspace Apps before using the hosted login widget.".into()
            } else {
                "This workspace app does not have any allowed embed origins configured.".into()
            },
        ));
    }

    let embed_origin = request_embed_origin(&req)
        .ok_or_else(|| AppError::Forbidden("Unable to determine the embedding site origin for this widget request.".into()))?;

    if !allowed_origins.iter().any(|origin| origin == &embed_origin) {
        log_blocked_widget_embed_probe(
            &state,
            client_ip_string_from_http_request(&req, state.config.as_ref()).as_deref(),
            req.headers()
                .get("user-agent")
                .and_then(|value| value.to_str().ok()),
            &embed_origin,
            query.client_id.as_deref(),
        ).await;
        AuditService::new(state.db.clone()).log(AuditEvent {
            actor_user_id: None,
            organization_id: get_platform_org_id(&state.db).await,
            action: "auth.widget.embed_origin_blocked".into(),
            target_type: "oauth_client".into(),
            target_id: query.client_id.clone(),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|value| value.to_str().ok())
                .map(str::to_string),
            metadata: serde_json::json!({
                "embed_origin": embed_origin,
                "allowed_origins": allowed_origins,
                "workspace_id": query.workspace_id,
                "workspace": workspace_slug,
                "path": req.path(),
            }),
        }).await;
        return Err(AppError::Forbidden(format!(
            "This site is not allowed to embed the hosted login widget: {}.",
            embed_origin
        )));
    }

    let initial_widget_login_context = if preview_mode {
        String::new()
    } else {
        let client_id = query
            .client_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| AppError::Forbidden("The hosted login widget requires a workspace app client_id.".into()))?;
        let app_row = match load_widget_app_redirect(&state, client_id, query.workspace_id.as_deref(), workspace_slug, Some(&embed_origin)).await? {
            Some(value) => value,
            None => {
                AuditService::new(state.db.clone()).log(AuditEvent {
                    actor_user_id: None,
                    organization_id: get_platform_org_id(&state.db).await,
                    action: "auth.widget.app_callback_rejected".into(),
                    target_type: "oauth_client".into(),
                    target_id: Some(client_id.to_string()),
                    ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                    user_agent: req
                        .headers()
                        .get("user-agent")
                        .and_then(|value| value.to_str().ok())
                        .map(str::to_string),
                    metadata: serde_json::json!({
                        "reason": "no_registered_callback_for_embed_origin",
                        "embed_origin": embed_origin,
                        "workspace_id": query.workspace_id,
                        "workspace": workspace_slug,
                    }),
                }).await;
                return Err(AppError::Forbidden(
                    "This hosted login widget app does not have a matching app callback for this site. Add a redirect URI with the same origin as the embedding site.".into()
                ));
            }
        };
        create_widget_login_context(
            state.get_ref(),
            WidgetLoginContextPayload {
                redirect_uri: app_row.redirect_uri,
                workspace_id: query.workspace_id.as_deref().and_then(|value| uuid::Uuid::parse_str(value.trim()).ok()),
                client_id: app_row.client_id,
                app_name: app_row.app_name,
                embed_origin: embed_origin.clone(),
            },
        ).await?
    };

    let frame_ancestors = frame_ancestors_directive(&allowed_origins);
    let csp = format!(
        "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: http: https:; connect-src 'self' http: https:; frame-ancestors {}",
        frame_ancestors,
    );
    // In preview mode there is no client_id and no widget_login_context, so the
    // widget must NOT send widget_embed_origin to /setup/login-bootstrap — that
    // endpoint rejects widget_embed_origin without a client_id. Inject an empty
    // origin so the widget's `if (widgetEmbedOrigin)` guard skips it. Preview is
    // branding-only and does not need the embed origin.
    let widget_embed_origin_for_html = if preview_mode { "" } else { embed_origin.as_str() };
    let html = HOSTED_LOGIN_HTML
        .replace("__INITIAL_WIDGET_LOGIN_CONTEXT__", &initial_widget_login_context)
        .replace("__WIDGET_EMBED_ORIGIN__", widget_embed_origin_for_html);

    Ok(HttpResponse::Ok()
        .insert_header((
            CONTENT_SECURITY_POLICY,
            HeaderValue::from_str(&csp).unwrap_or(HeaderValue::from_static("default-src 'none'; frame-ancestors 'none'")),
        ))
        .content_type("text/html; charset=utf-8")
        .body(html))
}

async fn log_blocked_widget_embed_probe(
    state: &web::Data<AppState>,
    ip: Option<&str>,
    user_agent: Option<&str>,
    embed_origin: &str,
    client_id: Option<&str>,
) {
    let Some(ip) = ip else { return; };
    let mut redis_conn = state.redis.clone();
    let key = format!("security:blocked_widget_origin:{}", ip);
    let count: i64 = redis::cmd("INCR").arg(&key).query_async(&mut redis_conn).await.unwrap_or(0);
    if count == 1 {
        let _: () = redis::cmd("EXPIRE")
            .arg(&key)
            .arg(600)
            .query_async(&mut redis_conn)
            .await
            .unwrap_or(());
    }
    if count >= 4 {
        AuditService::new(state.db.clone()).log(AuditEvent {
            actor_user_id: None,
            organization_id: get_platform_org_id(&state.db).await,
            action: "auth.login.suspicious".into(),
            target_type: "ip".into(),
            target_id: Some(ip.to_string()),
            ip: Some(ip.to_string()),
            user_agent: user_agent.map(str::to_string),
            metadata: serde_json::json!({
                "reason": "repeated_blocked_embed_origin_probe",
                "window_seconds": 600,
                "failed_attempts": count,
                "embed_origin": embed_origin,
                "client_id": client_id,
            }),
        }).await;
    }
}

async fn hosted_login_widget_stylesheet() -> HttpResponse {
    HttpResponse::Ok()
        .content_type("text/css; charset=utf-8")
        .insert_header(("Cache-Control", "public, max-age=300"))
        .body(HOSTED_LOGIN_CSS)
}

async fn hosted_verify_page() -> HttpResponse {
    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(HOSTED_VERIFY_HTML)
}

async fn resolve_post_login_redirect(
    state: &web::Data<AppState>,
    surface: Option<&str>,
    redirect_uri: Option<&str>,
) -> Result<String, AppError> {
    if let Some(value) = redirect_uri.map(str::trim).filter(|value| !value.is_empty()) {
        if value.starts_with('/') && !value.starts_with("//") {
            let target_base = if infer_magic_link_surface(surface) == "admin" {
                effective_admin_url(&state.db).await?
            } else {
                effective_app_url(&state.db).await?
            };
            let base = Url::parse(&target_base)
                .map_err(|e| AppError::Internal(format!("Invalid redirect base URL: {}", e)))?;
            return base
                .join(value)
                .map(|url| url.to_string())
                .map_err(|e| AppError::Internal(format!("Invalid post-login redirect URL: {}", e)));
        }
        return Ok(value.to_string());
    }

    if infer_magic_link_surface(surface) == "admin" {
        effective_admin_url(&state.db).await
    } else {
        effective_app_url(&state.db).await
    }
}

fn append_magic_link_verified_marker(target: &str) -> Result<String, AppError> {
    let mut url = Url::parse(target)
        .map_err(|e| AppError::Internal(format!("Invalid post-login redirect URL: {}", e)))?;
    url.query_pairs_mut().append_pair("magic_link", "verified");
    Ok(url.to_string())
}

async fn complete_magic_link_verification(
    req: &HttpRequest,
    state: &web::Data<AppState>,
    token: &str,
) -> Result<MagicLinkVerificationResult, AppError> {
    let auth_repo = AuthRepository::new(state.db.clone());
    let auth_service = AuthService::new(auth_repo);
    let audit_service = AuditService::new(state.db.clone());

    let ip = client_ip_string_from_http_request(req, state.config.as_ref());
    let ua = req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from);

    let token_attempt_key = {
        let hash = hex::encode(Sha256::digest(token.as_bytes()));
        format!("ml_attempts:{}", hash)
    };
    {
        let attempts: i64 = redis::cmd("GET")
            .arg(&token_attempt_key)
            .query_async(&mut state.redis.clone())
            .await
            .unwrap_or(0);
        if attempts >= 5 {
            log_suspicious_login_if_needed(state, ip.as_deref(), ua.as_deref()).await;
            return Err(AppError::Validation("Token is invalid or expired".into()));
        }
    }

    let verified_link = match auth_service.verify_magic_link(token).await {
        Ok(link) => link,
        Err(e) => {
            let mut redis = state.redis.clone();
            let count: i64 = redis::cmd("INCR").arg(&token_attempt_key).query_async(&mut redis).await.unwrap_or(0);
            if count == 1 {
                let _: () = redis::cmd("EXPIRE").arg(&token_attempt_key).arg(900).query_async(&mut redis).await.unwrap_or(());
            }
            let platform_org_id = get_platform_org_id(&state.db).await;
            audit_service.log(AuditEvent {
                actor_user_id: None,
                organization_id: platform_org_id,
                action: "auth.login.failed".into(),
                target_type: "magic_link".into(),
                target_id: None,
                ip: ip.clone(),
                user_agent: ua.clone(),
                metadata: serde_json::json!({ "error": e.to_string() }),
            }).await;
            log_suspicious_login_if_needed(state, ip.as_deref(), ua.as_deref()).await;
            return Err(e);
        }
    };

    ensure_auth_method_allowed(&state.db, verified_link.redirect_uri.as_deref(), AuthMethod::MagicLink).await?;

    let identity_repo = IdentityRepository::new(state.db.clone());
    let logged_in_user_id = match identity_repo.get_user_id_by_email(&verified_link.email).await? {
        Some(uid) => uid,
        None => identity_repo.create_user_with_email(&verified_link.email).await?,
    };

    let mfa_service = MfaService::new(
        MfaRepository::new(state.db.clone()),
        IdentityRepository::new(state.db.clone()),
        state.config.as_ref().clone(),
    );
    let login_context = resolve_login_context(&state.db, logged_in_user_id, verified_link.redirect_uri.as_deref()).await?;
    let workspace_policy = get_workspace_policy_for_redirect(&state.db, verified_link.redirect_uri.as_deref()).await?;

    if let Some(ref org) = workspace_policy {
        ensure_email_domain_allowed(org, &verified_link.email)?;
    }

    let org_repo = OrganizationRepository::new(state.db.clone());

    let op_policy = enforce_operator_login_policy(
        &state.db,
        logged_in_user_id,
        &verified_link.email,
        OpAuthMethod::MagicLink,
        login_context.current_org_id,
        client_ip_from_http_request(req, state.config.as_ref()),
    ).await?;

    let workspace_requires_mfa = match workspace_policy.as_ref() {
        Some(org) => org.require_mfa || (org.require_mfa_for_admins && org_repo.is_org_admin_or_owner(org.id, logged_in_user_id).await.unwrap_or(false)),
        None => {
            if let Some(org_id) = login_context.current_org_id {
                let portal_mfa = org_repo.get_organization_by_id(org_id).await?.map(|org| org.tenant_portal_require_mfa).unwrap_or(false);
                portal_mfa || op_policy.as_ref().map(|p| p.require_mfa).unwrap_or(false)
            } else {
                op_policy.as_ref().map(|p| p.require_mfa).unwrap_or(false)
            }
        }
    };
    let (totp_enabled, _) = mfa_service.totp_status(logged_in_user_id).await?;

    if workspace_requires_mfa && !totp_enabled {
        let enrollment = mfa_service.start_login_enrollment(logged_in_user_id, verified_link.redirect_uri.clone(), "magic_link", None).await?;
        return Ok(MagicLinkVerificationResult::MfaEnrollmentRequired {
            challenge_id: enrollment.challenge.id,
            redirect_uri: verified_link.redirect_uri,
            surface: verified_link.surface,
        });
    }

    if totp_enabled {
        let challenge = mfa_service.start_login_challenge(logged_in_user_id, verified_link.redirect_uri.clone(), "magic_link", None).await?;
        return Ok(MagicLinkVerificationResult::MfaRequired {
            challenge_id: challenge.challenge.id,
            redirect_uri: verified_link.redirect_uri,
            surface: verified_link.surface,
        });
    }

    let session_repo = SessionRepository::new(state.db.clone());
    let session_service = SessionService::new(session_repo, state.db.clone());
    let (_session, opaque_string) = session_service.create_opaque_session_with_context(
        logged_in_user_id,
        crate::modules::session::models::SessionCreateContext {
            user_agent: ua.clone(),
            ip: client_ip_from_http_request(req, state.config.as_ref()),
            current_org_id: login_context.current_org_id,
            login_surface: verified_link.surface.clone(),
            login_app_name: login_context.app_name.clone(),
            login_workspace_slug: login_context.workspace_slug.clone(),
        },
    ).await?;

    Ok(MagicLinkVerificationResult::Success {
        user_id: logged_in_user_id,
        redirect_uri: verified_link.redirect_uri,
        opaque_session: opaque_string,
        surface: verified_link.surface,
    })
}

#[utoipa::path(
    post,
    path = "/v1/auth/magic-link/start",
    tag = "browser",
    request_body = StartMagicLinkRequest,
    responses(
        (status = 200, description = "Magic-link email queued (response does not reveal whether the email exists)"),
        (status = 400, description = "Validation error"),
        (status = 429, description = "Rate limited"),
    ),
)]
pub async fn start_magic_link(
    req: actix_web::HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<StartMagicLinkRequest>,
) -> Result<HttpResponse, AppError> {
    tracing::info!("Starting magic link flow");

    let ip = client_ip_string_from_http_request(&req, state.config.as_ref());
    let ua = req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from);

    let widget_login_context = match consume_widget_login_context(&state, body.widget_login_context.as_deref()).await {
        Ok(value) => value,
        Err(AppError::Validation(message)) if is_widget_login_context_invalid_error(&message) => {
            AuditService::new(state.db.clone()).log(AuditEvent {
                actor_user_id: None,
                organization_id: get_platform_org_id(&state.db).await,
                action: "auth.widget.context_invalid".into(),
                target_type: "widget_login_context".into(),
                target_id: body.widget_login_context.clone(),
                ip: ip.clone(),
                user_agent: ua.clone(),
                metadata: serde_json::json!({
                    "reason": "expired_or_replayed",
                    "embed_origin": body.widget_embed_origin,
                    "surface": body.surface,
                    "stage": "magic_link_start",
                }),
            }).await;
            return Err(AppError::Validation(message));
        }
        Err(err) => return Err(err),
    };
    if let Some(ctx) = widget_login_context.as_ref() {
        let supplied_embed_origin = body.widget_embed_origin.as_deref().map(str::trim).filter(|value| !value.is_empty());
        if supplied_embed_origin != Some(ctx.embed_origin.as_str()) {
            return Err(AppError::Forbidden("This hosted login session does not match the current site.".into()));
        }
    }
    let effective_redirect_uri = widget_login_context
        .as_ref()
        .map(|ctx| ctx.redirect_uri.clone())
        .or_else(|| body.redirect_uri.clone());
    let rotated_widget_login_context = if let Some(ctx) = widget_login_context.as_ref() {
        Some(create_widget_login_context(state.get_ref(), ctx.clone()).await?)
    } else {
        None
    };

    let (_, effective_ip_policy) = resolve_effective_ip_policy_for_redirect(&state.db, effective_redirect_uri.as_deref()).await?;
    let decision = evaluate_ip_access(
        &effective_ip_policy,
        client_ip_from_http_request(&req, state.config.as_ref()),
    )?;
    if decision != crate::shared::ip_policy::IpAccessDecision::Allowed {
        return Err(AppError::Forbidden(access_denied_message(&decision).into()));
    }

    let repo = AuthRepository::new(state.db.clone());
    let service = AuthService::new(repo);
    let mut redis_conn = state.redis.clone();

    if let Err(err) = service.start_magic_link(
        body.email.clone(),
        effective_redirect_uri.clone(),
        body.surface.clone(),
        &mut redis_conn,
    ).await {
        if let AppError::Validation(message) = &err {
            if message.contains("redirect_uri must match a registered app callback") {
                AuditService::new(state.db.clone()).log(AuditEvent {
                    actor_user_id: None,
                    organization_id: get_platform_org_id(&state.db).await,
                    action: "auth.app_callback_rejected".into(),
                    target_type: "redirect_uri".into(),
                    target_id: effective_redirect_uri.clone(),
                    ip: ip.clone(),
                    user_agent: ua.clone(),
                    metadata: serde_json::json!({
                        "method": "magic_link",
                        "surface": body.surface,
                        "email": body.email.trim().to_lowercase(),
                    }),
                }).await;
            }
        }
        return Err(err);
    }

    let workspace_policy = get_workspace_policy_for_redirect(&state.db, effective_redirect_uri.as_deref()).await?;
    let audit_org_id = match workspace_policy {
        Some(ref org) => Some(org.id),
        None => get_platform_org_id(&state.db).await,
    };
    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: None,
        organization_id: audit_org_id,
        action: "auth.magic_link.requested".into(),
        target_type: "email".into(),
        target_id: Some(body.email.clone()),
        ip,
        user_agent: ua,
        metadata: serde_json::json!({
            "surface": body.surface,
            "redirect_uri": effective_redirect_uri,
        }),
    }).await;

    Ok(HttpResponse::Ok().json(StartMagicLinkResponse {
        ok: true,
        message: "If the email is valid, a magic link has been sent.".into(),
        widget_login_context: rotated_widget_login_context,
    }))
}

#[utoipa::path(
    post,
    path = "/v1/auth/magic-link/verify",
    tag = "browser",
    request_body = VerifyMagicLinkRequest,
    responses(
        (status = 200, description = "Token accepted; sets the session cookie and returns the signed-in user / next step (e.g. MFA)"),
        (status = 400, description = "Invalid or expired token"),
    ),
)]
pub async fn verify_magic_link(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<VerifyMagicLinkRequest>,
) -> Result<HttpResponse, AppError> {
    tracing::info!("Verifying magic link token via API...");

    match complete_magic_link_verification(&req, &state, &body.token).await? {
        MagicLinkVerificationResult::MfaEnrollmentRequired { challenge_id, .. } => Ok(HttpResponse::Ok().json(serde_json::json!({
            "ok": true,
            "mfa_enrollment_required": true,
            "challenge_id": challenge_id,
            "message": "This workspace requires MFA. Set up your authenticator app to finish signing in.",
        }))),
        MagicLinkVerificationResult::MfaRequired { challenge_id, .. } => Ok(HttpResponse::Ok().json(serde_json::json!({
            "ok": true,
            "mfa_required": true,
            "challenge_id": challenge_id,
            "method": "totp",
        }))),
        MagicLinkVerificationResult::Success { user_id, redirect_uri, opaque_session, .. } => {
            let cookie = build_session_cookie(opaque_session, &state.config, 7 * 24 * 3600);
            let login_context = resolve_login_context(&state.db, user_id, redirect_uri.as_deref()).await?;
            let workspace_policy = get_workspace_policy_for_redirect(&state.db, redirect_uri.as_deref()).await?;
            let audit_org_id = login_context.current_org_id.or_else(|| workspace_policy.as_ref().map(|org| org.id));
            let mut metadata = serde_json::Map::new();
            metadata.insert("method".into(), serde_json::json!("magic_link"));
            metadata.insert("redirect_to".into(), serde_json::json!(redirect_uri));
            if let Some(app_name) = login_context.app_name {
                metadata.insert("app_name".into(), serde_json::json!(app_name));
            }
            if let Some(workspace_slug) = login_context.workspace_slug {
                metadata.insert("workspace_slug".into(), serde_json::json!(workspace_slug));
            }
            AuditService::new(state.db.clone()).log(AuditEvent {
                actor_user_id: Some(user_id),
                organization_id: audit_org_id,
                action: "auth.login.success".into(),
                target_type: "user".into(),
                target_id: Some(user_id.to_string()),
                ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
                metadata: serde_json::Value::Object(metadata),
            }).await;
            Ok(HttpResponse::Ok().cookie(cookie).json(serde_json::json!({
                "ok": true,
                "user_id": user_id,
                "redirect_uri": redirect_uri,
            })))
        }
    }
}

async fn verify_magic_link_link(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<VerifyMagicLinkQuery>,
) -> Result<HttpResponse, AppError> {
    tracing::info!("Verifying magic link token via email link...");

    match complete_magic_link_verification(&req, &state, &query.token).await? {
        MagicLinkVerificationResult::MfaEnrollmentRequired { challenge_id, redirect_uri, surface } => {
            let redirect = build_login_ui_verify_url(
                &state,
                surface.as_deref(),
                redirect_uri.as_deref(),
                None,
                Some(challenge_id),
            ).await?;
            Ok(HttpResponse::Found().insert_header(("Location", redirect)).finish())
        }
        MagicLinkVerificationResult::MfaRequired { challenge_id, redirect_uri, surface } => {
            let redirect = build_login_ui_verify_url(
                &state,
                surface.as_deref(),
                redirect_uri.as_deref(),
                Some(challenge_id),
                None,
            ).await?;
            Ok(HttpResponse::Found().insert_header(("Location", redirect)).finish())
        }
        MagicLinkVerificationResult::Success { user_id, redirect_uri, opaque_session, surface, .. } => {
            let cookie = build_session_cookie(opaque_session, &state.config, 7 * 24 * 3600);
            let login_context = resolve_login_context(&state.db, user_id, redirect_uri.as_deref()).await?;
            let workspace_policy = get_workspace_policy_for_redirect(&state.db, redirect_uri.as_deref()).await?;
            let audit_org_id = login_context.current_org_id.or_else(|| workspace_policy.as_ref().map(|org| org.id));
            let mut metadata = serde_json::Map::new();
            metadata.insert("method".into(), serde_json::json!("magic_link"));
            metadata.insert("redirect_to".into(), serde_json::json!(redirect_uri));
            if let Some(app_name) = login_context.app_name {
                metadata.insert("app_name".into(), serde_json::json!(app_name));
            }
            if let Some(workspace_slug) = login_context.workspace_slug {
                metadata.insert("workspace_slug".into(), serde_json::json!(workspace_slug));
            }
            AuditService::new(state.db.clone()).log(AuditEvent {
                actor_user_id: Some(user_id),
                organization_id: audit_org_id,
                action: "auth.login.success".into(),
                target_type: "user".into(),
                target_id: Some(user_id.to_string()),
                ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
                metadata: serde_json::Value::Object(metadata),
            }).await;
            let target = append_magic_link_verified_marker(
                &resolve_post_login_redirect(&state, surface.as_deref(), redirect_uri.as_deref()).await?
            )?;
            Ok(HttpResponse::Found()
                .cookie(cookie)
                .insert_header(("Location", target))
                .finish())
        }
    }
}

async fn log_suspicious_login_if_needed(state: &web::Data<AppState>, ip: Option<&str>, user_agent: Option<&str>) {
    let Some(ip) = ip else { return; };
    let mut redis_conn = state.redis.clone();
    let key = format!("security:failed_login:{}", ip);
    let count: i64 = redis::cmd("INCR").arg(&key).query_async(&mut redis_conn).await.unwrap_or(0);
    if count == 1 { let _: () = redis::cmd("EXPIRE").arg(&key).arg(600).query_async(&mut redis_conn).await.unwrap_or(()); }
    if count >= 5 {
        let platform_org_id = get_platform_org_id(&state.db).await;
        AuditService::new(state.db.clone()).log(AuditEvent {
            actor_user_id: None, organization_id: platform_org_id, action: "auth.login.suspicious".into(),
            target_type: "ip".into(), target_id: Some(ip.to_string()), ip: Some(ip.to_string()), user_agent: user_agent.map(String::from),
            metadata: serde_json::json!({ "reason": "repeated_failed_magic_link_verification", "window_seconds": 600, "failed_attempts": count }),
        }).await;
    }
}

#[utoipa::path(
    post,
    path = "/v1/auth/logout",
    tag = "browser",
    security(("session_cookie" = [])),
    responses(
        (status = 200, description = "Session revoked and cookie cleared (idempotent)"),
    ),
)]
pub async fn logout(req: actix_web::HttpRequest, state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    if let Some(cookie) = req.cookie(ROOIAM_SESSION_COOKIE) {
        let session_repo = SessionRepository::new(state.db.clone());
        let session_service = SessionService::new(session_repo.clone(), state.db.clone());
        if let Ok(session) = session_service.verify_opaque_session(cookie.value()).await {
            let _ = session_repo.revoke_session(session.session_id).await;
            AuditService::new(state.db.clone()).log(AuditEvent {
                actor_user_id: Some(session.user_id), organization_id: session.current_org_id, action: "auth.logout.success".into(),
                target_type: "session".into(), target_id: Some(session.session_id.to_string()),
                ip: client_ip_string_from_http_request(&req, state.config.as_ref()), user_agent: None, metadata: serde_json::json!({}),
            }).await;
        }
    }
    Ok(HttpResponse::Ok().cookie(build_clear_session_cookie(&state.config)).json(serde_json::json!({ "ok": true })))
}

pub fn routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("")
            .route("/magic-link/start", web::post().to(start_magic_link))
            .route("/magic-link/verify", web::post().to(verify_magic_link))
            .route("/magic-link/verify", web::get().to(verify_magic_link_link))
            .route("/logout", web::post().to(logout))
    );
}

const AUTH_UI_PER_ENDPOINT_LIMIT: u64 = 20;
const AUTH_UI_GLOBAL_PER_IP_LIMIT: u64 = 100;
const AUTH_UI_RATE_LIMIT_WINDOW_SECONDS: u64 = 60;

pub fn ui_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::resource("/widget-assets/login-widget.css")
            .wrap(crate::http::middleware::rate_limit::RateLimit::per_endpoint(
                AUTH_UI_PER_ENDPOINT_LIMIT,
                AUTH_UI_RATE_LIMIT_WINDOW_SECONDS,
            ))
            .wrap(crate::http::middleware::rate_limit::RateLimit::global_per_ip(
                "auth_ui",
                AUTH_UI_GLOBAL_PER_IP_LIMIT,
                AUTH_UI_RATE_LIMIT_WINDOW_SECONDS,
            ))
            .route(web::get().to(hosted_login_widget_stylesheet))
    );
    cfg.service(
        web::resource("/login-widget")
            .wrap(crate::http::middleware::rate_limit::RateLimit::per_endpoint(
                AUTH_UI_PER_ENDPOINT_LIMIT,
                AUTH_UI_RATE_LIMIT_WINDOW_SECONDS,
            ))
            .wrap(crate::http::middleware::rate_limit::RateLimit::global_per_ip(
                "auth_ui",
                AUTH_UI_GLOBAL_PER_IP_LIMIT,
                AUTH_UI_RATE_LIMIT_WINDOW_SECONDS,
            ))
            .route(web::get().to(hosted_login_page))
    );
    cfg.service(
        web::resource("/login")
            .wrap(crate::http::middleware::rate_limit::RateLimit::per_endpoint(
                AUTH_UI_PER_ENDPOINT_LIMIT,
                AUTH_UI_RATE_LIMIT_WINDOW_SECONDS,
            ))
            .wrap(crate::http::middleware::rate_limit::RateLimit::global_per_ip(
                "auth_ui",
                AUTH_UI_GLOBAL_PER_IP_LIMIT,
                AUTH_UI_RATE_LIMIT_WINDOW_SECONDS,
            ))
            .route(web::get().to(hosted_login_page))
    );
    cfg.service(
        web::resource("/verify")
            .wrap(crate::http::middleware::rate_limit::RateLimit::per_endpoint(
                AUTH_UI_PER_ENDPOINT_LIMIT,
                AUTH_UI_RATE_LIMIT_WINDOW_SECONDS,
            ))
            .wrap(crate::http::middleware::rate_limit::RateLimit::global_per_ip(
                "auth_ui",
                AUTH_UI_GLOBAL_PER_IP_LIMIT,
                AUTH_UI_RATE_LIMIT_WINDOW_SECONDS,
            ))
            .route(web::get().to(hosted_verify_page))
    );
}

const HOSTED_LOGIN_CSS: &str = r#"
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap');
  :root {
    --bg-a:#fff8f3; --bg-b:#f6f1ff; --card:rgba(255,255,255,.92); --ink:#1f2937; --muted:#6b7280;
    --border:#eadcf7; --pink:#ffb6c8; --violet:#d9c2ff; --soft:#f8f5ff;
    --card-radius:32px; --button-radius:999px; --card-shadow:0 12px 28px rgba(15,23,42,.08), 0 2px 10px rgba(15,23,42,.04);
    --primary-bg:linear-gradient(135deg,var(--pink),var(--violet)); --primary-ink:#5a2d3f;
    --card-bg:white; --card-border-width:1px; --card-border-color:rgba(255,255,255,.84);
    --logo-width:84px; --logo-height:84px; --logo-radius:22px; --logo-padding:0px;
    --widget-safe-gap:18px;
  }
  * { box-sizing:border-box; }
  html {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    font-family:'Nunito',system-ui,sans-serif;
    background: transparent;
  }
  body { margin:0; font-family:'Nunito',system-ui,sans-serif; color:var(--ink); background:transparent; padding:var(--widget-safe-gap); overflow:hidden; }
  .card { width:min(100%, 390px); margin:0 auto; background:var(--card-bg); border:var(--card-border-width) solid var(--card-border-color); border-radius:var(--card-radius); box-shadow:var(--card-shadow); padding:22px 20px 20px; }
  .logo-wrap { width:var(--logo-width); height:var(--logo-height); border-radius:var(--logo-radius); overflow:hidden; display:none; margin:0 auto 14px; background:white; border:1px solid var(--border); }
  .logo { width:100%; height:100%; object-fit:cover; display:block; }
  h1 { margin:0; font-size:1.125rem; line-height:1.5rem; text-align:center; font-weight:700; letter-spacing:-0.01em; color:#1f2b46; }
  p.sub { margin:6px 0 0; color:#7a879d; font-weight:700; text-align:center; line-height:1.25rem; font-size:.875rem; }
  form { margin-top:16px; }
  input { width:100%; border-radius:var(--button-radius); border:1.5px solid var(--border); padding:13px 16px; font:inherit; font-size:.875rem; line-height:1.25rem; font-weight:700; background:white; color:#374151; }
  input::placeholder { color:#9ca3af; font-weight:700; }
  button, a.btn { width:100%; border:0; border-radius:var(--button-radius); padding:13px 16px; font:inherit; font-size:.875rem; line-height:1.25rem; font-weight:700; cursor:pointer; text-decoration:none; display:flex; align-items:center; justify-content:center; }
  .primary { margin-top:14px; background:var(--primary-bg); color:var(--primary-ink); box-shadow:0 4px 14px -2px rgba(255,181,200,0.45); }
  .secondary { margin-top:0; background:white; border:1px solid var(--border); color:#334155; box-shadow:0 2px 10px rgba(15,23,42,.04); }
  .filled-buttons .secondary { background:#fff4fa; border:0; color:#5a2d3f; box-shadow:0 4px 14px -2px rgba(255,181,200,0.18); }
  .outline-buttons .secondary { background:white; border:1.5px solid var(--border); color:#334155; box-shadow:0 2px 10px rgba(15,23,42,.04); }
  .stack { margin-top:14px; display:grid; gap:14px; }
  .sent-view { margin-top:8px; display:grid; gap:12px; justify-items:center; text-align:center; padding:8px 0 4px; }
  .sent-icon-shell { display:grid; place-items:center; }
  .sent-icon-shell span { font-size:44px; line-height:1; }
  .sent-title { margin:4px 0 0; font-size:1.125rem; line-height:1.5rem; font-weight:800; color:#1f2937; }
  .sent-copy { margin:0; color:#475569; font-size:.9375rem; line-height:1.375rem; font-weight:700; }
  .sent-subcopy { margin:-4px 0 0; color:#9ca3af; font-size:.8125rem; line-height:1.125rem; font-weight:700; }
  .sent-status {
    width:100%;
    min-height:44px;
    border-radius:16px;
    border:0;
    background:#f8fafc;
    color:#94a3b8;
    display:flex;
    align-items:center;
    justify-content:center;
    gap:10px;
    font-size:.875rem;
    line-height:1.25rem;
    font-weight:800;
  }
  .sent-status .spinner { width:13px; height:13px; border-width:2px; }
  .sent-link {
    border:0;
    background:transparent;
    color:#94a3b8;
    padding:0;
    width:auto;
    font-size:.875rem;
    line-height:1.25rem;
    font-weight:800;
    text-decoration:underline;
    text-underline-offset:3px;
    box-shadow:none;
  }
  .sent-link:hover { color:#64748b; }
  .btn-inner { display:inline-flex; align-items:center; justify-content:center; gap:10px; }
  .btn-icon { width:18px; height:18px; display:block; flex:0 0 auto; }
  .spinner { width:14px; height:14px; border-radius:999px; border:2px solid currentColor; border-right-color:transparent; display:inline-block; animation:spin .7s linear infinite; flex:0 0 auto; }
  button:disabled, input:disabled { cursor:not-allowed; opacity:.72; }
  @keyframes spin { to { transform:rotate(360deg); } }
  .notice { margin-top:14px; border-radius:18px; padding:11px 13px; background:#f8fafc; border:1px solid #dbe7ff; color:#475569; font-size:.875rem; line-height:1.25rem; font-weight:700; display:none; }
  .notice .notice-copy { display:block; }
  .notice .notice-action { margin-top:10px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; border:1px solid currentColor; background:white; color:inherit; padding:7px 11px; font:inherit; font-size:.82rem; font-weight:900; cursor:pointer; }
  .notice .notice-action:hover { opacity:.9; }
  .error { background:#fff1f2; border-color:#fecdd3; color:#be123c; }
  .ok { background:#eff8ff; border-color:#bfdbfe; color:#1d4ed8; display:flex; align-items:flex-start; gap:10px; }
  .ok::before { content:'✉'; display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; border-radius:999px; background:white; color:#2563eb; font-size:12px; font-weight:900; flex:0 0 auto; box-shadow:0 1px 3px rgba(37,99,235,.12); }
  .footer { margin-top:14px; display:flex; align-items:center; justify-content:center; min-height:18px; }
  .footer img { display:block; width:90px; height:auto; opacity:.35; }
  .hidden { display:none !important; }
"#;

const HOSTED_LOGIN_HTML: &str = r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rooiam Login</title>
  <link rel="stylesheet" href="/widget-assets/login-widget.css">
</head>
<body>
  <main class="card">
    <div id="logoWrap" class="logo-wrap hidden"><img id="logo" class="logo" alt="Workspace logo"></div>
    <h1 id="title">Sign in</h1>
    <p id="subtitle" class="sub"></p>
    <section id="login-view">
      <form id="magic-form">
        <input id="email" type="email" placeholder="you@example.com" autocomplete="email">
        <button id="magic-submit" class="primary" type="submit">Send Magic Link</button>
      </form>
      <div id="oauth-buttons" class="stack"></div>
    </section>
    <section id="sent-view" class="sent-view hidden">
      <div class="sent-icon-shell" aria-hidden="true"><span>💌</span></div>
      <h2 class="sent-title">Magic link sent!</h2>
      <p id="sent-copy" class="sent-copy">We sent a magic link.</p>
      <p class="sent-subcopy">Link expires in 15 minutes</p>
      <div class="sent-status">
        <span class="spinner" aria-hidden="true"></span>
        <span id="resend-status">Waiting for verification...</span>
      </div>
      <button id="back-button" class="sent-link" type="button">Use different email</button>
      <button id="resend-button" class="hidden" type="button">Resend Magic Link</button>
    </section>
    <div id="notice" class="notice"></div>
    <div id="footer" class="footer"><img src="/assets/rooiam-powered-by.svg" alt="Powered by Rooiam"></div>
  </main>
  <script>
    const params = new URLSearchParams(window.location.search);
    const apiBase = `${window.location.origin}/v1`;
    const previewMode = params.get('preview') === '1';
    const previewRedirectUri = params.get('preview_redirect_uri') || '';
    let redirectUri = previewMode ? previewRedirectUri : '';
    const surface = params.get('surface') || 'user';
    const workspaceId = params.get('workspace_id') || '';
    const workspace = params.get('workspace') || params.get('org') || '';
    const clientId = params.get('client_id') || '';
    const appName = params.get('app') || 'Rooiam';
    let widgetLoginContext = '__INITIAL_WIDGET_LOGIN_CONTEXT__';
    const widgetEmbedOrigin = '__WIDGET_EMBED_ORIGIN__';
    const titleEl = document.getElementById('title');
    const subtitleEl = document.getElementById('subtitle');
    const logoWrapEl = document.getElementById('logoWrap');
    const logoEl = document.getElementById('logo');
    const noticeEl = document.getElementById('notice');
    const loginViewEl = document.getElementById('login-view');
    const sentViewEl = document.getElementById('sent-view');
    const oauthButtons = document.getElementById('oauth-buttons');
    const footerEl = document.getElementById('footer');
    const cardEl = document.querySelector('.card');
    const formEl = document.getElementById('magic-form');
    const emailInput = document.getElementById('email');
    const resendButton = document.getElementById('resend-button');
    const backButton = document.getElementById('back-button');
    const sentCopyEl = document.getElementById('sent-copy');
    const resendStatusEl = document.getElementById('resend-status');
    const defaultLogoUrl = `${window.location.origin}/assets/rooiam-app-white.svg`;
    let authState = {};
    let widgetBusy = false;
    let magicView = 'login';
    let lastMagicEmail = '';
    let resendAllowedAt = 0;
    let resendTimer = null;
    const widgetError = params.get('widget_error') || '';
    const seededDemoEmails = new Set([
      'admin@rooiam.demo',
      'rooroo@sweetfactory.demo',
      'minmin@lovechocolate.user',
      'lulu@softmallow.user',
      'sunny@toastgarden.user',
      'poppy@jamdiner.user',
      'mozza@cheesetown.user',
      'moomoo@whitebakery.demo',
    ]);
    function setNotice(message, level='') {
      if (!message) { noticeEl.style.display='none'; noticeEl.textContent=''; noticeEl.className='notice'; return; }
      noticeEl.textContent = message;
      noticeEl.className = `notice ${level}`.trim();
      noticeEl.style.display = 'block';
    }
    function setNoticeHtml(html, level='') {
      if (!html) { noticeEl.style.display='none'; noticeEl.innerHTML=''; noticeEl.className='notice'; return; }
      noticeEl.innerHTML = html;
      noticeEl.className = `notice ${level}`.trim();
      noticeEl.style.display = 'block';
      const refreshButton = noticeEl.querySelector('[data-refresh-widget]');
      if (refreshButton) {
        refreshButton.addEventListener('click', function() {
          window.location.reload();
        });
      }
    }
    function isExpiredWidgetContextMessage(message) {
      return typeof message === 'string' && message.toLowerCase().includes('hosted login session expired or was already used');
    }
    function showExpiredWidgetContextNotice() {
      setNoticeHtml(
        '<span class="notice-copy">This hosted login session expired or was already used. Refresh the page to try again.</span>' +
        '<button class="notice-action" type="button" data-refresh-widget>Refresh widget</button>',
        'error'
      );
    }
    function setMagicView(nextView, email='') {
      magicView = nextView;
      const normalizedEmail = (email || lastMagicEmail || '').trim();
      loginViewEl.classList.toggle('hidden', nextView !== 'login');
      sentViewEl.classList.toggle('hidden', nextView !== 'sent');
      if (nextView === 'sent') {
        lastMagicEmail = normalizedEmail;
        if (sentCopyEl) {
          sentCopyEl.textContent = normalizedEmail
            ? `Check ${normalizedEmail}`
            : 'We sent a magic link.';
        }
        setNotice('');
      }
      reportSize();
    }
    function clearResendTimer() {
      if (resendTimer) {
        window.clearInterval(resendTimer);
        resendTimer = null;
      }
    }
    function updateResendUi() {
      if (!resendButton || !resendStatusEl) return;
      const seconds = Math.max(0, Math.ceil((resendAllowedAt - Date.now()) / 1000));
      const locked = seconds > 0;
      resendButton.disabled = widgetBusy || locked;
      resendStatusEl.textContent = locked
        ? 'Waiting for verification...'
        : 'Didn’t get it? You can resend now.';
    }
    function startResendCountdown(seconds = 30) {
      resendAllowedAt = Date.now() + (seconds * 1000);
      clearResendTimer();
      updateResendUi();
      resendTimer = window.setInterval(() => {
        updateResendUi();
        if (Date.now() >= resendAllowedAt) {
          clearResendTimer();
          updateResendUi();
        }
      }, 1000);
    }
    function buttonLabel(provider) {
      if (provider === 'google') return 'Continue with Google';
      if (provider === 'microsoft') return 'Continue with Microsoft';
      if (provider === 'passkey') return 'Continue with Passkey';
      return 'Send Magic Link';
    }
    function setWidgetBusy(nextBusy, busyProvider='') {
      widgetBusy = nextBusy;
      if (emailInput) emailInput.disabled = nextBusy;
      const magicSubmit = document.getElementById('magic-submit');
      if (magicSubmit) {
        magicSubmit.disabled = nextBusy;
        magicSubmit.innerHTML = nextBusy && busyProvider === 'magic_link'
          ? '<span class="btn-inner"><span class="spinner" aria-hidden="true"></span><span>Sending magic link...</span></span>'
          : 'Send Magic Link';
      }
      oauthButtons.querySelectorAll('button[data-provider]').forEach(btn => {
        const provider = btn.getAttribute('data-provider') || '';
        btn.disabled = nextBusy;
        btn.innerHTML = nextBusy && provider === busyProvider
          ? `<span class="btn-inner"><span class="spinner" aria-hidden="true"></span><span>${provider === 'passkey' ? 'Checking passkey...' : 'Redirecting...'}</span></span>`
          : `<span class="btn-inner">${iconForProvider(provider)}<span>${buttonLabel(provider)}</span></span>`;
      });
      if (resendButton) {
        resendButton.classList.toggle('hidden', magicView !== 'sent' || resendAllowedAt > Date.now());
        resendButton.innerHTML = nextBusy && busyProvider === 'magic_link_resend'
          ? '<span class="btn-inner"><span class="spinner" aria-hidden="true"></span><span>Sending again...</span></span>'
          : 'Resend Magic Link';
      }
      if (backButton) backButton.disabled = nextBusy;
      updateResendUi();
    }
    function resetWidgetBusyState() {
      setWidgetBusy(false);
    }
    function iconForProvider(provider) {
      if (provider === 'google') {
        return `
          <svg class='btn-icon' viewBox='0 0 24 24' aria-hidden='true'>
            <path fill='#EA4335' d='M12 10.2v3.9h5.5c-.24 1.25-.95 2.3-2 3.02l3.23 2.5c1.88-1.73 2.97-4.28 2.97-7.3 0-.7-.06-1.37-.18-2H12z'/>
            <path fill='#34A853' d='M12 22c2.7 0 4.97-.9 6.62-2.45l-3.23-2.5c-.9.6-2.04.95-3.39.95-2.6 0-4.8-1.76-5.59-4.12l-3.34 2.58A10 10 0 0 0 12 22z'/>
            <path fill='#4A90E2' d='M6.41 13.88A5.99 5.99 0 0 1 6.1 12c0-.65.11-1.28.31-1.88L3.07 7.54A10 10 0 0 0 2 12c0 1.6.38 3.11 1.07 4.46l3.34-2.58z'/>
            <path fill='#FBBC05' d='M12 6c1.47 0 2.8.5 3.84 1.48l2.88-2.88C16.96 2.96 14.7 2 12 2A10 10 0 0 0 3.07 7.54l3.34 2.58C7.2 7.76 9.4 6 12 6z'/>
          </svg>`;
      }
      if (provider === 'microsoft') {
        return `
          <svg class='btn-icon' viewBox='0 0 24 24' aria-hidden='true'>
            <rect x='3' y='3' width='8.5' height='8.5' fill='#F25022'/>
            <rect x='12.5' y='3' width='8.5' height='8.5' fill='#7FBA00'/>
            <rect x='3' y='12.5' width='8.5' height='8.5' fill='#00A4EF'/>
            <rect x='12.5' y='12.5' width='8.5' height='8.5' fill='#FFB900'/>
          </svg>`;
      }
      return '';
    }
    function reportSize() {
      if (!window.parent || window.parent === window || !cardEl) return;
      const rect = cardEl.getBoundingClientRect();
      const fullHeight = Math.ceil(Math.max(document.body.scrollHeight, rect.height + (rect.top * 2)));
      const fullWidth = Math.ceil(Math.max(document.body.scrollWidth, rect.width + (rect.left * 2)));
      window.parent.postMessage({
        type: 'rooiam-login-widget:size',
        height: fullHeight,
        width: fullWidth,
      }, '*');
    }
    function boolParam(name, fallback) {
      const value = params.get(name);
      if (value === null) return fallback;
      return value === 'true';
    }
    function textParam(name, fallback) {
      const value = params.get(name);
      return value === null ? fallback : value;
    }
    function radiusForCard(value) {
      switch (value) {
        case 'sharp': return '0px';
        case 'compact': return '16px';
        case 'rounded': return '32px';
        default: return '32px';
      }
    }
    function radiusForButton(value) {
      switch (value) {
        case 'sharp': return '0px';
        case 'compact': return '10px';
        case 'rounded': return '26px';
        case 'pill': return '999px';
        default: return '999px';
      }
    }
    function shadowForWidget(value) {
      switch (value) {
        case 'none': return 'none';
        case 'lifted': return '0 14px 30px rgba(15,23,42,.11), 0 6px 14px rgba(15,23,42,.06), 0 1px 3px rgba(15,23,42,.04)';
        case 'soft': return '0 12px 28px rgba(15,23,42,.08), 0 2px 10px rgba(15,23,42,.04)';
        default: return '0 12px 28px rgba(15,23,42,.08), 0 2px 10px rgba(15,23,42,.04)';
      }
    }
    function logoMetrics(container, size) {
      const sizeMap = {
        small: { square: [68, 68, 0], circle: [68, 68, 0], wide: [96, 60, 0] },
        medium: { square: [84, 84, 0], circle: [84, 84, 0], wide: [118, 72, 0] },
        large: { square: [104, 104, 0], circle: [104, 104, 0], wide: [144, 84, 0] },
      };
      const resolvedSize = sizeMap[size] ? size : 'medium';
      const resolvedContainer = container === 'circle' || container === 'wide' ? container : 'square';
      const [width, height, padding] = sizeMap[resolvedSize][resolvedContainer];
      const radius = resolvedContainer === 'circle' ? '999px' : resolvedContainer === 'wide' ? '24px' : '22px';
      return { width: `${width}px`, height: `${height}px`, padding: `${padding}px`, radius };
    }
    function backgroundForCard(style, brandColor, color2) {
      const secondary = color2 || '#ffffff';
      const primary = brandColor || '#fff8f3';
      switch (style) {
        case 'solid': return primary;
        case 'gradient-lr': return `linear-gradient(90deg, ${primary}, ${secondary})`;
        case 'gradient-tb': return `linear-gradient(180deg, ${primary}, ${secondary})`;
        case 'gradient-tl': return `linear-gradient(135deg, ${primary}, ${secondary})`;
        case 'gradient-tr': return `linear-gradient(45deg, ${primary}, ${secondary})`;
        case 'auto':
        default:
          return `radial-gradient(circle at top left, ${primary}22, transparent 48%), white`;
      }
    }
    function applyWidgetStyles(branding, auth) {
      if (!cardEl) return;
      const root = cardEl;
      const brandColor = branding?.brand_color || '#c96b8a';
      const cardRadius = branding?.card_radius || 'rounded';
      const buttonRadius = branding?.widget_radius || 'pill';
      const widgetShadow = branding?.widget_shadow || 'soft';
      const buttonStyle = branding?.button_style || 'filled';
      const cardBgStyle = branding?.card_bg_style || 'auto';
      const cardBgColor2 = branding?.card_bg_color2 || '#ffffff';
      const cardBorderWidth = branding?.card_border_width || '1px';
      const cardBorderColor = branding?.card_border_color || '#eadcf7';
      const logoContainer = branding?.login_logo_container || 'square';
      const logoSize = branding?.login_logo_size || 'medium';
      const logo = logoMetrics(logoContainer, logoSize);

      root.style.setProperty('--card-radius', radiusForCard(cardRadius));
      root.style.setProperty('--button-radius', radiusForButton(buttonRadius));
      root.style.setProperty('--card-shadow', shadowForWidget(widgetShadow));
      root.style.setProperty('--card-bg', backgroundForCard(cardBgStyle, brandColor, cardBgColor2));
      root.style.setProperty('--card-border-width', cardBorderWidth === 'none' ? '0px' : cardBorderWidth);
      root.style.setProperty('--card-border-color', cardBorderWidth === 'none' ? 'transparent' : cardBorderColor);
      root.style.setProperty('--pink', brandColor);
      root.style.setProperty('--primary-bg', `linear-gradient(135deg, ${brandColor}, var(--violet))`);
      root.style.setProperty('--logo-width', logo.width);
      root.style.setProperty('--logo-height', logo.height);
      root.style.setProperty('--logo-radius', logo.radius);
      root.classList.toggle('outline-buttons', buttonStyle === 'outline');
      root.classList.toggle('filled-buttons', buttonStyle !== 'outline');
    }
    function openVerify(params) {
      const url = new URL(`${window.location.origin}/verify`);
      Object.entries(params).forEach(([key, value]) => {
        if (value) url.searchParams.set(key, value);
      });
      redirectTop(url.toString());
    }
    function redirectTop(url) {
      try {
        if (window.top && window.top !== window) {
          window.top.location.href = url;
          return;
        }
      } catch (_) {
      }
      window.location.href = url;
    }
    async function handlePasskey() {
      if (widgetBusy) return;
      const email = document.getElementById('email').value.trim();
      if (!email) {
        setNotice('Enter your email first to use your passkey.', 'error');
        return;
      }
      let failureStage = 'start';
      setNotice('');
      setWidgetBusy(true, 'passkey');
      try {
        if (authState.demo_mode && seededDemoEmails.has(email.toLowerCase())) {
          const demoRes = await fetch(`${apiBase}/webauthn/login/demo`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, widget_login_context: widgetLoginContext, widget_embed_origin: widgetEmbedOrigin, surface }),
          });
          const demoData = await demoRes.json().catch(() => ({}));
          if (!demoRes.ok) {
            throw new Error(demoData?.error?.message || 'Demo passkey sign-in failed.');
          }
          if (demoData.mfa_enrollment_required && demoData.challenge_id) {
            openVerify({ mfa_enrollment_challenge: demoData.challenge_id, redirect_uri: redirectUri });
            return;
          }
          if (demoData.mfa_required && demoData.challenge_id) {
            openVerify({ mfa_challenge: demoData.challenge_id, redirect_uri: redirectUri });
            return;
          }
          redirectTop(demoData.redirect_uri || redirectUri || '/');
          return;
        }

        if (!(window.PublicKeyCredential && navigator.credentials)) {
          throw new Error('This browser does not support passkeys.');
        }

        const parseRequestOptionsFromJSON = window.PublicKeyCredential.parseRequestOptionsFromJSON;
        if (!parseRequestOptionsFromJSON) {
          throw new Error('This browser is missing the JSON WebAuthn helpers needed for passkey sign-in.');
        }

        const startRes = await fetch(`${apiBase}/webauthn/login/start`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, widget_login_context: widgetLoginContext, widget_embed_origin: widgetEmbedOrigin, surface }),
        });
        const startData = await startRes.json().catch(() => ({}));
        if (!startRes.ok) {
          throw new Error(startData?.error?.message || 'Failed to start passkey sign-in.');
        }
        if (startData.widget_login_context) {
          widgetLoginContext = startData.widget_login_context;
        }

        failureStage = 'browser';
        button.textContent = 'Waiting for passkey...';
        const publicKey = parseRequestOptionsFromJSON(startData.request_options.publicKey);
        const credential = await navigator.credentials.get({ publicKey });
        if (!credential) {
          throw new Error('Passkey sign-in was cancelled.');
        }

        failureStage = 'finish';
        const finishRes = await fetch(`${apiBase}/webauthn/login/finish`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challenge_id: startData.challenge_id,
            credential: credential.toJSON(),
          }),
        });
        const finishData = await finishRes.json().catch(() => ({}));
        if (!finishRes.ok) {
          throw new Error(finishData?.error?.message || 'Passkey sign-in failed.');
        }
        if (finishData.mfa_enrollment_required && finishData.challenge_id) {
          openVerify({ mfa_enrollment_challenge: finishData.challenge_id, redirect_uri: redirectUri });
          return;
        }
        if (finishData.mfa_required && finishData.challenge_id) {
          openVerify({ mfa_challenge: finishData.challenge_id, redirect_uri: redirectUri });
          return;
        }
        redirectTop(finishData.redirect_uri || redirectUri || '/');
      } catch (error) {
        if (failureStage === 'browser') {
          void fetch(`${apiBase}/webauthn/login/report-failure`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              stage: 'browser',
              reason: error instanceof Error ? error.message : 'Passkey sign-in failed in the browser.',
            }),
          }).catch(() => undefined);
        }
        const message = error instanceof Error ? error.message : 'Passkey sign-in failed.';
        if (isExpiredWidgetContextMessage(message)) {
          showExpiredWidgetContextNotice();
        } else {
          setNotice(message, 'error');
        }
      } finally {
        setWidgetBusy(false);
      }
    }
    async function loadBootstrap() {
      const qs = new URLSearchParams();
      if (workspaceId) qs.set('workspace_id', workspaceId);
      if (workspace) qs.set('workspace', workspace);
      if (clientId) qs.set('client_id', clientId);
      if (widgetEmbedOrigin) qs.set('widget_embed_origin', widgetEmbedOrigin);
      const res = await fetch(`${apiBase}/setup/login-bootstrap?${qs.toString()}`, { credentials:'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error?.message || data?.message || 'Could not load login settings.');
      }
      const branding = data.workspace || null;
      const auth = data.auth || {};
      const appConfig = data.app || null;
      if (appConfig && appConfig.widget_login_context) {
        widgetLoginContext = appConfig.widget_login_context;
      }
      if (clientId && !previewMode && !widgetLoginContext) {
        setNotice('This app does not have a valid hosted login context configured in Rooiam yet.', 'error');
      }
      if (previewMode && branding) {
        const orderParam = params.get('login_method_order');
        branding.login_title = textParam('login_title', branding.login_title);
        branding.login_subtitle = textParam('login_subtitle', branding.login_subtitle);
        branding.login_logo_url = textParam('login_logo_url', branding.login_logo_url);
        branding.icon_url = textParam('icon_url', branding.icon_url);
        branding.login_logo_container = textParam('login_logo_container', branding.login_logo_container);
        branding.login_logo_size = textParam('login_logo_size', branding.login_logo_size);
        branding.brand_color = textParam('brand_color', branding.brand_color);
        branding.show_login_logo = boolParam('show_login_logo', branding.show_login_logo);
        branding.show_login_title = boolParam('show_login_title', branding.show_login_title);
        branding.show_login_subtitle = boolParam('show_login_subtitle', branding.show_login_subtitle);
        branding.show_powered_by = boolParam('show_powered_by', branding.show_powered_by);
        branding.widget_radius = textParam('widget_radius', branding.widget_radius);
        branding.widget_shadow = textParam('widget_shadow', branding.widget_shadow);
        branding.card_radius = textParam('card_radius', branding.card_radius);
        branding.button_style = textParam('button_style', branding.button_style);
        branding.card_bg_style = textParam('card_bg_style', branding.card_bg_style);
        branding.card_bg_color2 = textParam('card_bg_color2', branding.card_bg_color2);
        branding.card_border_width = textParam('card_border_width', branding.card_border_width);
        branding.card_border_color = textParam('card_border_color', branding.card_border_color);
        if (orderParam) {
          branding.login_method_order = orderParam.split(',').map(item => item.trim()).filter(Boolean);
        }
      }
      auth.magic_link_enabled = boolParam('allow_magic_link', auth.magic_link_enabled);
      auth.passkey_enabled = boolParam('allow_passkey', auth.passkey_enabled);
      auth.google_enabled = boolParam('allow_google', auth.google_enabled);
      auth.microsoft_enabled = boolParam('allow_microsoft', auth.microsoft_enabled);
      authState = auth;
      applyWidgetStyles(branding, auth);
      const resolvedTitle = (branding && (branding.login_title || branding.login_display_name || branding.name)) || `Sign in to ${appName}`;
      const resolvedSubtitle = (branding && branding.login_subtitle) || '';
      titleEl.textContent = resolvedTitle;
      subtitleEl.textContent = resolvedSubtitle;
      titleEl.classList.toggle('hidden', Boolean(branding) && branding.show_login_title === false);
      subtitleEl.classList.toggle('hidden', !resolvedSubtitle || (Boolean(branding) && branding.show_login_subtitle === false));
      footerEl.classList.toggle('hidden', Boolean(branding) && branding.show_powered_by === false);
      logoWrapEl.classList.add('hidden');
      logoWrapEl.style.display = 'none';
      const logoSource = (branding && (branding.login_logo_url || branding.icon_url))
        ? new URL(branding.login_logo_url || branding.icon_url, window.location.origin).toString()
        : defaultLogoUrl;
      if (!branding || branding.show_login_logo !== false) {
        logoEl.src = logoSource;
        logoWrapEl.classList.remove('hidden');
        logoWrapEl.style.display = 'block';
      }
      const allowedProviders = {
        magic_link: Boolean(auth.magic_link_enabled),
        passkey: Boolean(auth.passkey_enabled),
        google: Boolean(auth.google_enabled),
        microsoft: Boolean(auth.microsoft_enabled),
      };
      if (formEl) {
        formEl.classList.toggle('hidden', !allowedProviders.magic_link);
      }
      if (!allowedProviders.magic_link && magicView === 'sent') {
        setMagicView('login');
      }
      const orderedMethods = Array.isArray(branding?.login_method_order) && branding.login_method_order.length > 0
        ? branding.login_method_order
        : ['magic_link', 'passkey', 'google', 'microsoft'];
      const providers = orderedMethods
        .filter(method => method !== 'magic_link' && allowedProviders[method])
        .map(method => [method, method === 'passkey'
          ? 'Continue with Passkey'
          : method === 'google'
            ? 'Continue with Google'
            : 'Continue with Microsoft']);
      oauthButtons.innerHTML = providers.map(([provider,label]) => `<button ${provider === 'passkey' ? 'id="passkey-submit"' : ''} class="secondary" type="button" data-provider="${provider}"><span class="btn-inner">${iconForProvider(provider)}<span>${label}</span></span></button>`).join('');
      oauthButtons.querySelectorAll('button[data-provider]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (widgetBusy) return;
          const provider = btn.getAttribute('data-provider');
          if (provider === 'passkey') {
            handlePasskey();
            return;
          }
          if (!widgetLoginContext) {
            setNotice('This app does not have a valid hosted login context configured in Rooiam yet.', 'error');
            return;
          }
          setNotice('');
          setWidgetBusy(true, provider);
          const previousWidgetLoginContext = widgetLoginContext;
          try {
            await loadBootstrap();
          } catch (error) {
            setWidgetBusy(false);
            setNotice(error instanceof Error ? error.message : 'Could not refresh the hosted login session. Refresh and try again.', 'error');
            reportSize();
            return;
          }
          if (!widgetLoginContext) {
            setWidgetBusy(false);
            setNotice('This app does not have a valid hosted login context configured in Rooiam yet.', 'error');
            reportSize();
            return;
          }
          if (widgetLoginContext === previousWidgetLoginContext) {
            setWidgetBusy(false);
            setNotice('Could not refresh the hosted login session. Refresh and try again.', 'error');
            reportSize();
            return;
          }
          const oauthPath = authState.demo_mode ? `/oauth/demo` : `/oauth/login`;
          const url = new URL(`${apiBase}${oauthPath}`);
          url.searchParams.set('provider', provider);
          url.searchParams.set('widget_login_context', widgetLoginContext);
          url.searchParams.set('surface', surface);
          if (!authState.demo_mode) {
            url.searchParams.set('widget_embed_origin', widgetEmbedOrigin);
            if (workspaceId) url.searchParams.set('workspace_id', workspaceId);
            if (workspace) url.searchParams.set('workspace', workspace);
            if (clientId) url.searchParams.set('client_id', clientId);
            if (appName) url.searchParams.set('app', appName);
          }
          redirectTop(url.toString());
        });
      });
      reportSize();
    }
    window.addEventListener('pageshow', function() {
      resetWidgetBusyState();
    });
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        resetWidgetBusyState();
      }
    });
    async function sendMagicLink(email, resend=false) {
      if (widgetBusy) return;
      if (!email) { setNotice('Enter an email address first.', 'error'); return; }
      if (!widgetLoginContext) { setNotice('This app does not have a valid hosted login context configured in Rooiam yet.', 'error'); return; }
      setNotice('');
      setWidgetBusy(true, resend ? 'magic_link_resend' : 'magic_link');
      try {
        const res = await fetch(`${apiBase}/auth/magic-link/start`, {
          method:'POST',
          credentials:'include',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ email, widget_login_context: widgetLoginContext, widget_embed_origin: widgetEmbedOrigin, surface })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error?.message || data?.message || 'Could not send magic link.');
        if (data.widget_login_context) {
          widgetLoginContext = data.widget_login_context;
        }
        setMagicView('sent', email);
        startResendCountdown(30);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not send magic link.';
        if (isExpiredWidgetContextMessage(message)) {
          showExpiredWidgetContextNotice();
        } else {
          setNotice(message, 'error');
        }
        reportSize();
      } finally {
        setWidgetBusy(false);
      }
    }
    formEl.addEventListener('submit', async (event) => {
      event.preventDefault();
      await sendMagicLink(emailInput.value.trim(), false);
    });
    resendButton.addEventListener('click', async () => {
      if (!lastMagicEmail) return;
      await sendMagicLink(lastMagicEmail, true);
    });
    backButton.addEventListener('click', () => {
      setNotice('');
      setMagicView('login', lastMagicEmail);
      if (emailInput && lastMagicEmail) emailInput.value = lastMagicEmail;
    });
    window.addEventListener('message', event => {
      if (event.origin !== widgetEmbedOrigin) return;
      if (event.data?.type !== 'rooiam-login-widget:prefill-email') return;
      const email = typeof event.data.email === 'string' ? event.data.email.trim() : '';
      if (!emailInput || !email) return;
      setNotice('');
      lastMagicEmail = email;
      emailInput.value = email;
      setMagicView('login', email);
      emailInput.focus();
    });
    if (widgetError === 'expired') {
      showExpiredWidgetContextNotice();
    }
    loadBootstrap().catch(() => setNotice('Could not load login settings.', 'error'));
    if (window.ResizeObserver && cardEl) {
      new ResizeObserver(() => reportSize()).observe(cardEl);
    }
    window.addEventListener('load', reportSize);
    window.addEventListener('resize', reportSize);
  </script>
</body>
</html>"#;

const HOSTED_VERIFY_HTML: &str = r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rooiam Verify</title>
  <style>
    body { margin:0; font-family:ui-rounded,"SF Pro Rounded","Avenir Next","Segoe UI",sans-serif; background:#faf7ff; color:#1f2937; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px; }
    .card { width:min(100%, 430px); background:white; border:1px solid #eadcf7; border-radius:28px; box-shadow:0 18px 48px rgba(15,23,42,.12); padding:24px; }
    h1 { margin:0 0 10px; font-size:1.8rem; }
    p { color:#64748b; font-weight:600; line-height:1.6; }
    input { width:100%; border-radius:18px; border:1px solid #d8c7f2; padding:14px 16px; font:inherit; margin-top:12px; }
    button { width:100%; margin-top:14px; border:0; border-radius:999px; padding:14px 18px; font:inherit; font-weight:800; cursor:pointer; background:linear-gradient(135deg,#ffb6c8,#d9c2ff); color:#1f2937; }
    .notice { margin-top:16px; border-radius:18px; padding:12px 14px; background:#f8fafc; border:1px solid #dbe7ff; color:#475569; font-size:.93rem; font-weight:700; display:none; white-space:pre-wrap; }
    .error { background:#fff1f2; border-color:#fecdd3; color:#be123c; }
    .ok { background:#effcf3; border-color:#bfe7c8; color:#166534; }
    .hidden { display:none; }
    code { word-break:break-all; }
  </style>
</head>
<body>
  <main class="card">
    <h1 id="title">Finishing sign-in</h1>
    <p id="subtitle">Rooiam is verifying your sign-in request.</p>
    <div id="totp-box" class="hidden">
      <input id="totp-code" type="text" placeholder="123456 or backup code">
      <button id="totp-submit" type="button">Verify MFA</button>
    </div>
    <div id="enroll-box" class="hidden">
      <p id="enroll-secret"></p>
      <input id="enroll-code" type="text" placeholder="Enter 6-digit code">
      <button id="enroll-submit" type="button">Finish MFA Setup</button>
    </div>
    <div id="notice" class="notice"></div>
  </main>
  <script>
    const params = new URLSearchParams(window.location.search);
    const apiBase = `${window.location.origin}/v1`;
    const redirectUri = params.get('redirect_uri') || '';
    const mfaChallenge = params.get('mfa_challenge') || '';
    const enrollmentChallenge = params.get('mfa_enrollment_challenge') || '';
    const titleEl = document.getElementById('title');
    const subtitleEl = document.getElementById('subtitle');
    const noticeEl = document.getElementById('notice');
    function setNotice(message, level='') {
      if (!message) { noticeEl.style.display='none'; noticeEl.textContent=''; noticeEl.className='notice'; return; }
      noticeEl.textContent = message;
      noticeEl.className = `notice ${level}`.trim();
      noticeEl.style.display = 'block';
    }
    async function verifyMfa() {
      const code = document.getElementById('totp-code').value.trim();
      const res = await fetch(`${apiBase}/mfa/login/verify`, {
        method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ challenge_id: mfaChallenge, code })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || 'Invalid MFA code.');
      window.location.href = data.redirect_uri || redirectUri || '/';
    }
    async function loadEnrollment() {
      const res = await fetch(`${apiBase}/mfa/login/enroll/start`, {
        method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ challenge_id: enrollmentChallenge })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || 'Could not start MFA setup.');
      document.getElementById('enroll-secret').innerHTML = `Authenticator secret:<br><code>${data.secret || ''}</code>`;
    }
    async function finishEnrollment() {
      const code = document.getElementById('enroll-code').value.trim();
      const res = await fetch(`${apiBase}/mfa/login/enroll/finish`, {
        method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ challenge_id: enrollmentChallenge, code })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || 'Could not finish MFA setup.');
      window.location.href = data.redirect_uri || redirectUri || '/';
    }
    if (mfaChallenge) {
      titleEl.textContent = 'Enter MFA Code';
      subtitleEl.textContent = 'Finish sign-in with your authenticator or backup code.';
      document.getElementById('totp-box').classList.remove('hidden');
      document.getElementById('totp-submit').addEventListener('click', () => verifyMfa().catch(err => setNotice(err.message, 'error')));
    } else if (enrollmentChallenge) {
      titleEl.textContent = 'Set Up MFA';
      subtitleEl.textContent = 'This sign-in requires an authenticator app before continuing.';
      document.getElementById('enroll-box').classList.remove('hidden');
      document.getElementById('enroll-submit').addEventListener('click', () => finishEnrollment().catch(err => setNotice(err.message, 'error')));
      loadEnrollment().catch(err => setNotice(err.message, 'error'));
    } else {
      titleEl.textContent = 'Nothing to verify';
      subtitleEl.textContent = 'This verification page is only used for MFA challenges during sign-in.';
    }
  </script>
</body>
</html>"#;
