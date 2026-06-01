use actix_web::{web, HttpRequest, HttpResponse};
use uuid::Uuid;

use crate::bootstrap::state::AppState;
use crate::http::middleware::auth::{extract_session, RequireAuth};
use crate::modules::audit::service::{AuditEvent, AuditService};
use crate::modules::identity::repository::IdentityRepository;
use crate::modules::session::{
    cookie::build_session_cookie,
    repository::SessionRepository,
    service::SessionService,
};
use crate::shared::error::AppError;
use crate::shared::auth_context::resolve_login_context;
use crate::shared::auth_policy::get_workspace_policy_for_redirect;
use crate::shared::ip_policy::{access_denied_message, evaluate_ip_access, resolve_effective_ip_policy_for_redirect};
use crate::shared::request_ip::{client_ip_from_http_request, client_ip_string_from_http_request};

fn infer_login_surface(redirect_uri: Option<&str>) -> Option<String> {
    let Some(uri) = redirect_uri else {
        return None;
    };

    if uri.starts_with("/tenant/") || uri.starts_with("/workspace/") {
        return Some("tenant".into());
    }

    if uri == "/" {
        return Some("admin".into());
    }

    if let Ok(parsed) = url::Url::parse(uri) {
        let path = parsed.path();
        if path.starts_with("/tenant/") || path.starts_with("/workspace/") {
            return Some("tenant".into());
        }
        if path == "/" {
            return Some("admin".into());
        }
    }

    None
}

use super::{repository::MfaRepository, service::MfaService};

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct FinishTotpEnrollmentRequest {
    challenge_id: Uuid,
    code: String,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct VerifyLoginMfaRequest {
    challenge_id: Uuid,
    code: String,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct StartLoginEnrollmentRequest {
    challenge_id: Uuid,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct FinishLoginEnrollmentRequest {
    challenge_id: Uuid,
    code: String,
}

fn mfa_service(state: &web::Data<AppState>) -> MfaService {
    MfaService::new(
        MfaRepository::new(state.db.clone()),
        IdentityRepository::new(state.db.clone()),
        state.config.as_ref().clone(),
    )
}

async fn get_status(req: HttpRequest, state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let (enabled, remaining) = mfa_service(&state).totp_status(session.user_id).await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "totp_enabled": enabled,
        "backup_codes_remaining": remaining,
    })))
}

async fn start_totp_enrollment(req: HttpRequest, state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let enrollment = mfa_service(&state).start_totp_enrollment(session.user_id).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "challenge_id": enrollment.challenge.id,
        "secret": enrollment.secret,
        "otpauth_uri": enrollment.otpauth_uri,
    })))
}

async fn finish_totp_enrollment(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<FinishTotpEnrollmentRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let result = mfa_service(&state)
        .finish_totp_enrollment(session.user_id, body.challenge_id, &body.code)
        .await?;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(session.user_id),
        organization_id: session.current_org_id,
        action: "auth.mfa.enrolled".into(),
        target_type: "mfa_method".into(),
        target_id: Some("totp".into()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({ "method": "totp" }),
    }).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "backup_codes": result.codes,
    })))
}

async fn disable_totp(req: HttpRequest, state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let deleted = mfa_service(&state).disable_totp(session.user_id).await?;

    // Revoke all other sessions — disabling MFA is a security-level change
    // and existing sessions may have been granted elevated access based on MFA completion.
    let session_repo = crate::modules::session::repository::SessionRepository::new(state.db.clone());
    let _ = session_repo.revoke_sessions_by_user_id(session.user_id, Some(session.session_id)).await;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(session.user_id),
        organization_id: session.current_org_id,
        action: "auth.mfa.totp.disabled".into(),
        target_type: "mfa_method".into(),
        target_id: Some("totp".into()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({ "disabled": deleted, "other_sessions_revoked": true }),
    }).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "disabled": deleted,
    })))
}

async fn regenerate_backup_codes(req: HttpRequest, state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let result = mfa_service(&state).regenerate_backup_codes(session.user_id).await?;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(session.user_id),
        organization_id: session.current_org_id,
        action: "auth.mfa.backup_codes.regenerated".into(),
        target_type: "mfa_method".into(),
        target_id: Some("totp".into()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({ "count": result.remaining }),
    }).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "codes": result.codes,
        "remaining": result.remaining,
    })))
}

async fn verify_login_mfa(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<VerifyLoginMfaRequest>,
) -> Result<HttpResponse, AppError> {
    let service = mfa_service(&state);
    let context = service.get_login_context(body.challenge_id).await.ok();
    let result = match service.finish_login_challenge(body.challenge_id, &body.code).await {
        Ok(result) => result,
        Err(err) => {
            let login_context = match context.as_ref() {
                Some(value) => resolve_login_context(&state.db, value.user_id, value.redirect_uri.as_deref()).await.ok(),
                None => None,
            };
            let primary_method = context.as_ref().map(|value| value.primary_method.clone()).unwrap_or_else(|| "unknown".into());
            let provider = context.as_ref().and_then(|value| value.provider.clone());
            let current_org_id = login_context.as_ref().and_then(|value| value.current_org_id);
            let mut metadata = serde_json::Map::new();
            metadata.insert("error".into(), serde_json::json!(err.to_string()));
            metadata.insert("primary_method".into(), serde_json::json!(primary_method.clone()));
            metadata.insert("provider".into(), serde_json::json!(provider.clone()));
            if let Some(login_context) = login_context {
                if let Some(app_name) = login_context.app_name {
                    metadata.insert("app_name".into(), serde_json::json!(app_name));
                }
                if let Some(workspace_slug) = login_context.workspace_slug {
                    metadata.insert("workspace_slug".into(), serde_json::json!(workspace_slug));
                }
            }
            AuditService::new(state.db.clone()).log(AuditEvent {
                actor_user_id: None,
                organization_id: current_org_id,
                action: "auth.mfa.challenge.failed".into(),
                target_type: "mfa_method".into(),
                target_id: Some("totp".into()),
                ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
                metadata: serde_json::Value::Object(metadata),
            }).await;
            return Err(err);
        }
    };

    if result.used_backup_code {
        AuditService::new(state.db.clone()).log(AuditEvent {
            actor_user_id: Some(result.user_id),
            organization_id: None,
            action: "auth.mfa.backup_code.used".into(),
            target_type: "mfa_method".into(),
            target_id: Some("totp".into()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
            metadata: serde_json::json!({}),
        }).await;
    }

    let login_context = resolve_login_context(&state.db, result.user_id, result.redirect_uri.as_deref()).await?;
    let (_, effective_ip_policy) =
        resolve_effective_ip_policy_for_redirect(&state.db, result.redirect_uri.as_deref()).await?;
    let decision = evaluate_ip_access(
        &effective_ip_policy,
        client_ip_from_http_request(&req, state.config.as_ref()),
    )?;
    if decision != crate::shared::ip_policy::IpAccessDecision::Allowed {
        return Err(AppError::Forbidden(access_denied_message(&decision).into()));
    }
    let workspace_policy = get_workspace_policy_for_redirect(&state.db, result.redirect_uri.as_deref()).await?;
    let audit_org_id = login_context.current_org_id.or_else(|| workspace_policy.as_ref().map(|org| org.id));
    let session_repo = SessionRepository::new(state.db.clone());
    let session_service = SessionService::new(session_repo, state.db.clone());
    let (_session, opaque) = session_service.create_opaque_session_with_context(
        result.user_id,
        crate::modules::session::models::SessionCreateContext {
            user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
            ip: client_ip_from_http_request(&req, state.config.as_ref()),
            current_org_id: login_context.current_org_id,
            login_surface: infer_login_surface(result.redirect_uri.as_deref()),
            login_app_name: login_context.app_name.clone(),
            login_workspace_slug: login_context.workspace_slug.clone(),
        },
    ).await?;
    let cookie = build_session_cookie(opaque, &state.config, 7 * 24 * 3600);

    let mut metadata = serde_json::Map::new();
    metadata.insert("method".into(), serde_json::json!(result.primary_method.clone()));
    metadata.insert("provider".into(), serde_json::json!(result.provider.clone()));
    metadata.insert("mfa_method".into(), serde_json::json!("totp"));
    metadata.insert("used_backup_code".into(), serde_json::json!(result.used_backup_code));
    if let Some(app_name) = login_context.app_name {
        metadata.insert("app_name".into(), serde_json::json!(app_name));
    }
    if let Some(workspace_slug) = login_context.workspace_slug {
        metadata.insert("workspace_slug".into(), serde_json::json!(workspace_slug));
    }

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(result.user_id),
        organization_id: audit_org_id,
        action: "auth.login.success".into(),
        target_type: "user".into(),
        target_id: Some(result.user_id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::Value::Object(metadata),
    }).await;

    Ok(HttpResponse::Ok()
        .cookie(cookie)
        .json(serde_json::json!({
            "ok": true,
            "redirect_uri": result.redirect_uri,
        })))
}

async fn start_login_enrollment(
    state: web::Data<AppState>,
    body: web::Json<StartLoginEnrollmentRequest>,
) -> Result<HttpResponse, AppError> {
    let enrollment = mfa_service(&state)
        .get_login_enrollment_context(body.challenge_id)
        .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "challenge_id": body.challenge_id,
        "secret": enrollment.secret,
        "otpauth_uri": enrollment.otpauth_uri,
        "redirect_uri": enrollment.redirect_uri,
    })))
}

async fn finish_login_enrollment(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<FinishLoginEnrollmentRequest>,
) -> Result<HttpResponse, AppError> {
    let service = mfa_service(&state);
    let context = service
        .get_login_enrollment_context(body.challenge_id)
        .await
        .ok();
    let result = match service.finish_login_enrollment(body.challenge_id, &body.code).await {
        Ok(result) => result,
        Err(err) => {
            let current_org_id = match context.as_ref() {
                Some(value) => resolve_login_context(&state.db, value.user_id, value.redirect_uri.as_deref())
                    .await
                    .ok()
                    .and_then(|value| value.current_org_id),
                None => None,
            };
            AuditService::new(state.db.clone()).log(AuditEvent {
                actor_user_id: context.as_ref().map(|value| value.user_id),
                organization_id: current_org_id,
                action: "auth.mfa.enrollment.failed".into(),
                target_type: "mfa_method".into(),
                target_id: Some("totp".into()),
                ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
                metadata: serde_json::json!({
                    "error": err.to_string(),
                    "during_login": true,
                }),
            }).await;
            return Err(err);
        }
    };

    let login_context = resolve_login_context(&state.db, result.user_id, result.redirect_uri.as_deref()).await?;
    let (_, effective_ip_policy) =
        resolve_effective_ip_policy_for_redirect(&state.db, result.redirect_uri.as_deref()).await?;
    let decision = evaluate_ip_access(
        &effective_ip_policy,
        client_ip_from_http_request(&req, state.config.as_ref()),
    )?;
    if decision != crate::shared::ip_policy::IpAccessDecision::Allowed {
        return Err(AppError::Forbidden(access_denied_message(&decision).into()));
    }
    let workspace_policy = get_workspace_policy_for_redirect(&state.db, result.redirect_uri.as_deref()).await?;
    let session_repo = SessionRepository::new(state.db.clone());
    let session_service = SessionService::new(session_repo, state.db.clone());
    let (_session, opaque) = session_service.create_opaque_session_with_context(
        result.user_id,
        crate::modules::session::models::SessionCreateContext {
            user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
            ip: client_ip_from_http_request(&req, state.config.as_ref()),
            current_org_id: login_context.current_org_id,
            login_surface: infer_login_surface(result.redirect_uri.as_deref()),
            login_app_name: login_context.app_name.clone(),
            login_workspace_slug: login_context.workspace_slug.clone(),
        },
    ).await?;
    let cookie = build_session_cookie(opaque, &state.config, 7 * 24 * 3600);

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(result.user_id),
        organization_id: login_context.current_org_id.or_else(|| workspace_policy.as_ref().map(|org| org.id)),
        action: "auth.mfa.enrolled".into(),
        target_type: "mfa_method".into(),
        target_id: Some("totp".into()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({
            "during_login": true,
            "primary_method": result.primary_method,
            "provider": result.provider,
        }),
    }).await;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(result.user_id),
        organization_id: login_context.current_org_id.or_else(|| workspace_policy.as_ref().map(|org| org.id)),
        action: "auth.login.success".into(),
        target_type: "user".into(),
        target_id: Some(result.user_id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({
            "method": result.primary_method,
            "provider": result.provider,
            "mfa_method": "totp",
            "enrolled_during_login": true,
            "workspace_slug": login_context.workspace_slug,
            "app_name": login_context.app_name,
        }),
    }).await;

    Ok(HttpResponse::Ok()
        .cookie(cookie)
        .json(serde_json::json!({
            "ok": true,
            "redirect_uri": result.redirect_uri,
            "recovery_codes": result.recovery_codes,
        })))
}

pub fn routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/mfa/login")
            // TOTP codes are 6 digits — tighter limit to slow brute-force
            .wrap(crate::http::middleware::rate_limit::RateLimit::per_endpoint(5, 60))
            .wrap(crate::http::middleware::rate_limit::RateLimit::global_per_ip("mfa", 30, 60))
            .route("/enroll/start", web::post().to(start_login_enrollment))
            .route("/enroll/finish", web::post().to(finish_login_enrollment))
            .route("/verify", web::post().to(verify_login_mfa))
    );

    cfg.service(
        web::scope("/mfa")
            .wrap(RequireAuth)
            .route("/status", web::get().to(get_status))
            .route("/totp/start", web::post().to(start_totp_enrollment))
            .route("/totp/finish", web::post().to(finish_totp_enrollment))
            .route("/recovery-codes/regenerate", web::post().to(regenerate_backup_codes))
            .route("/totp", web::delete().to(disable_totp))
    );
}

/// Alias — same as `routes()`. Used from router for clarity.
pub fn routes_global(cfg: &mut web::ServiceConfig) {
    routes(cfg);
}
