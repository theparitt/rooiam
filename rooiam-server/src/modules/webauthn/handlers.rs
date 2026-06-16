use actix_web::{web, HttpRequest, HttpResponse};
use uuid::Uuid;

use crate::bootstrap::state::AppState;
use crate::http::middleware::auth::{extract_session, RequireAuth};
use crate::modules::audit::service::{AuditEvent, AuditService};
use crate::modules::identity::repository::IdentityRepository;
use crate::modules::mfa::{repository::MfaRepository, service::MfaService};
use crate::modules::organization::repository::OrganizationRepository;
use crate::modules::session::{
    cookie::build_session_cookie, repository::SessionRepository, service::SessionService,
};
use crate::shared::auth_context::resolve_login_context;
use crate::shared::auth_policy::{
    admin_console_passkey_allowed, ensure_auth_method_allowed_for_workspace_id,
    get_workspace_policy_for_redirect, AuthMethod,
};
use crate::shared::demo_seed::{demo_seed_enabled, is_seeded_demo_email};
use crate::shared::error::AppError;
use crate::shared::ip_policy::{
    access_denied_message, evaluate_ip_access, resolve_effective_ip_policy_for_redirect,
};
use crate::shared::operator_policy::{enforce_operator_login_policy, AuthMethod as OpAuthMethod};
use crate::shared::request_ip::{client_ip_from_http_request, client_ip_string_from_http_request};
use crate::shared::widget_login_context::{
    consume_widget_login_context, create_widget_login_context,
    is_widget_login_context_invalid_error,
};

use super::{repository::WebauthnRepository, service::WebauthnService};

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct StartLoginRequest {
    email: String,
    redirect_uri: Option<String>,
    widget_login_context: Option<String>,
    widget_embed_origin: Option<String>,
    surface: Option<String>,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct FinishRegistrationRequest {
    challenge_id: Uuid,
    name: Option<String>,
    /// The raw WebAuthn `PublicKeyCredential` from the browser's `navigator.credentials.create()`.
    #[schema(value_type = Object)]
    credential: serde_json::Value,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct FinishLoginRequest {
    challenge_id: Uuid,
    /// The raw WebAuthn assertion from `navigator.credentials.get()`.
    #[schema(value_type = Object)]
    credential: serde_json::Value,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ReportLoginFailureRequest {
    email: Option<String>,
    stage: String,
    reason: String,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RenamePasskeyRequest {
    name: String,
}

struct CompletedPasskeyLogin {
    user_id: Uuid,
    redirect_uri: Option<String>,
    workspace_id: Option<Uuid>,
    surface: Option<String>,
}

fn webauthn_service(state: &web::Data<AppState>) -> WebauthnService {
    WebauthnService::new(
        WebauthnRepository::new(state.db.clone()),
        IdentityRepository::new(state.db.clone()),
        state.config.as_ref().clone(),
    )
}

#[utoipa::path(
    get,
    path = "/v1/webauthn/passkeys",
    tag = "browser",
    security(("session_cookie" = [])),
    responses(
        (status = 200, description = "The signed-in user's registered passkeys"),
        (status = 401, description = "No valid session cookie"),
    ),
)]
pub async fn list_passkeys(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let service = webauthn_service(&state);
    let passkeys = service.list_my_passkeys(session.user_id).await?;

    let response: Vec<serde_json::Value> = passkeys
        .into_iter()
        .map(|passkey| {
            serde_json::json!({
                "id": passkey.id,
                "name": passkey.name,
                "aaguid": passkey.aaguid,
                "transports": passkey.transports,
                "sign_count": passkey.sign_count,
                "last_used_at": passkey.last_used_at,
                "created_at": passkey.created_at,
            })
        })
        .collect();

    Ok(HttpResponse::Ok().json(response))
}

#[utoipa::path(
    post,
    path = "/v1/webauthn/login/start",
    tag = "browser",
    request_body = StartLoginRequest,
    responses(
        (status = 200, description = "WebAuthn assertion options + challenge_id for login/finish (public)"),
        (status = 400, description = "Validation error"),
    ),
)]
pub async fn start_login(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<StartLoginRequest>,
) -> Result<HttpResponse, AppError> {
    let widget_login_context =
        match consume_widget_login_context(&state, body.widget_login_context.as_deref()).await {
            Ok(value) => value,
            Err(AppError::Validation(message))
                if is_widget_login_context_invalid_error(&message) =>
            {
                AuditService::new(state.db.clone())
                    .log(AuditEvent {
                        actor_user_id: None,
                        organization_id: crate::shared::platform_org::get_platform_org_id(
                            &state.db,
                        )
                        .await,
                        action: "auth.widget.context_invalid".into(),
                        target_type: "widget_login_context".into(),
                        target_id: body.widget_login_context.clone(),
                        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                        user_agent: req
                            .headers()
                            .get("user-agent")
                            .and_then(|h| h.to_str().ok())
                            .map(String::from),
                        metadata: serde_json::json!({
                            "reason": "expired_or_replayed",
                            "embed_origin": body.widget_embed_origin,
                            "surface": body.surface,
                            "stage": "passkey_start",
                            "email": body.email.trim().to_lowercase(),
                        }),
                    })
                    .await;
                return Err(AppError::Validation(message));
            }
            Err(err) => return Err(err),
        };
    if let Some(ctx) = widget_login_context.as_ref() {
        let supplied_embed_origin = body
            .widget_embed_origin
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if supplied_embed_origin != Some(ctx.embed_origin.as_str()) {
            return Err(AppError::Forbidden(
                "Hosted login session mismatch: this widget session was issued for a different site. Refresh the widget on the current site and try again.".into()
            ));
        }
    }
    let effective_redirect_uri = widget_login_context
        .as_ref()
        .map(|ctx| ctx.redirect_uri.clone())
        .or_else(|| body.redirect_uri.clone());
    let effective_workspace_id = widget_login_context
        .as_ref()
        .and_then(|ctx| ctx.workspace_id);
    let rotated_widget_login_context = if let Some(ctx) = widget_login_context.as_ref() {
        Some(create_widget_login_context(state.get_ref(), ctx.clone()).await?)
    } else {
        None
    };
    let (_, effective_ip_policy) =
        resolve_effective_ip_policy_for_redirect(&state.db, effective_redirect_uri.as_deref())
            .await?;
    let decision = evaluate_ip_access(
        &effective_ip_policy,
        client_ip_from_http_request(&req, state.config.as_ref()),
    )?;
    if decision != crate::shared::ip_policy::IpAccessDecision::Allowed {
        return Err(AppError::Forbidden(access_denied_message(&decision).into()));
    }

    let service = webauthn_service(&state);
    let result = match service
        .start_authentication(
            body.email.clone(),
            effective_redirect_uri.clone(),
            effective_workspace_id,
            body.surface.clone(),
        )
        .await
    {
        Ok(result) => result,
        Err(err) => {
            if let AppError::Validation(message) = &err {
                if message.contains("redirect_uri must match a registered app callback") {
                    AuditService::new(state.db.clone())
                        .log(AuditEvent {
                            actor_user_id: None,
                            organization_id: crate::shared::platform_org::get_platform_org_id(
                                &state.db,
                            )
                            .await,
                            action: "auth.app_callback_rejected".into(),
                            target_type: "redirect_uri".into(),
                            target_id: effective_redirect_uri.clone(),
                            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                            user_agent: req
                                .headers()
                                .get("user-agent")
                                .and_then(|h| h.to_str().ok())
                                .map(String::from),
                            metadata: serde_json::json!({
                                "method": "passkey",
                                "surface": body.surface,
                                "email": body.email.trim().to_lowercase(),
                            }),
                        })
                        .await;
                }
            }
            AuditService::new(state.db.clone())
                .log(AuditEvent {
                    actor_user_id: None,
                    organization_id: None,
                    action: "auth.passkey.login.failed".into(),
                    target_type: "user".into(),
                    target_id: Some(body.email.trim().to_lowercase()),
                    ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                    user_agent: req
                        .headers()
                        .get("user-agent")
                        .and_then(|h| h.to_str().ok())
                        .map(String::from),
                    metadata: serde_json::json!({
                        "error": err.to_string(),
                        "stage": "start",
                    }),
                })
                .await;
            return Err(err);
        }
    };

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "challenge_id": result.challenge.id,
        "widget_login_context": rotated_widget_login_context,
        "request_options": {
            "publicKey": result.options.public_key,
        }
    })))
}

#[utoipa::path(
    post,
    path = "/v1/webauthn/register/start",
    tag = "browser",
    security(("session_cookie" = [])),
    responses(
        (status = 200, description = "WebAuthn creation options + challenge_id to pass to register/finish"),
        (status = 401, description = "No valid session cookie"),
    ),
)]
pub async fn start_registration(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let service = webauthn_service(&state);
    let result = service.start_registration(session.user_id).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "challenge_id": result.challenge.id,
        "creation_options": {
            "publicKey": result.options.public_key,
        }
    })))
}

#[utoipa::path(
    post,
    path = "/v1/webauthn/login/finish",
    tag = "browser",
    request_body = FinishLoginRequest,
    responses(
        (status = 200, description = "Passkey verified; sets the session cookie (or returns next step, e.g. MFA)"),
        (status = 400, description = "Invalid assertion or expired challenge"),
    ),
)]
pub async fn finish_login(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<FinishLoginRequest>,
) -> Result<HttpResponse, AppError> {
    let repo = WebauthnRepository::new(state.db.clone());
    let identity_repo = IdentityRepository::new(state.db.clone());
    let target_email = async {
        let user_id = repo
            .peek_challenge_user_id(body.challenge_id, "login")
            .await?;
        identity_repo
            .get_primary_email_by_user_id(user_id)
            .await
            .ok()
            .flatten()
    }
    .await;

    let service = webauthn_service(&state);
    let auth = match service
        .finish_authentication(body.challenge_id, body.credential.clone())
        .await
    {
        Ok(auth) => auth,
        Err(err) => {
            AuditService::new(state.db.clone())
                .log(AuditEvent {
                    actor_user_id: None,
                    organization_id: None,
                    action: "auth.passkey.login.failed".into(),
                    target_type: "user".into(),
                    target_id: target_email,
                    ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                    user_agent: req
                        .headers()
                        .get("user-agent")
                        .and_then(|h| h.to_str().ok())
                        .map(String::from),
                    metadata: serde_json::json!({
                        "error": err.to_string(),
                        "stage": "finish",
                    }),
                })
                .await;
            return Err(err);
        }
    };

    complete_passkey_login_response(
        req,
        state,
        CompletedPasskeyLogin {
            user_id: auth.user_id,
            redirect_uri: auth.redirect_uri,
            workspace_id: auth.workspace_id,
            surface: auth.surface,
        },
        "passkey",
        "auth.passkey.login.success",
    )
    .await
}

async fn complete_passkey_login_response(
    req: HttpRequest,
    state: web::Data<AppState>,
    auth: CompletedPasskeyLogin,
    method_name: &'static str,
    success_action: &'static str,
) -> Result<HttpResponse, AppError> {
    let mfa_service = MfaService::new(
        MfaRepository::new(state.db.clone()),
        IdentityRepository::new(state.db.clone()),
        state.config.as_ref().clone(),
    );
    let workspace_org = ensure_auth_method_allowed_for_workspace_id(
        &state.db,
        auth.workspace_id,
        auth.redirect_uri.as_deref(),
        AuthMethod::Passkey,
    )
    .await?;
    // Admin console login (no workspace in redirect_uri) — enforce platform passkey policy
    if workspace_org.is_none() {
        if !admin_console_passkey_allowed(&state.db).await? {
            return Err(AppError::Validation(
                "Passkey sign-in is disabled for the admin console.".into(),
            ));
        }
    }
    let (_, effective_ip_policy) =
        resolve_effective_ip_policy_for_redirect(&state.db, auth.redirect_uri.as_deref()).await?;
    let decision = evaluate_ip_access(
        &effective_ip_policy,
        client_ip_from_http_request(&req, state.config.as_ref()),
    )?;
    if decision != crate::shared::ip_policy::IpAccessDecision::Allowed {
        return Err(AppError::Forbidden(access_denied_message(&decision).into()));
    }
    let login_context =
        resolve_login_context(&state.db, auth.user_id, auth.redirect_uri.as_deref()).await?;
    let workspace_policy =
        get_workspace_policy_for_redirect(&state.db, auth.redirect_uri.as_deref()).await?;
    let org_repo = OrganizationRepository::new(state.db.clone());

    // Operator policy gate: enforces auth method, IP, email domain for operator logins.
    let identity_repo = IdentityRepository::new(state.db.clone());
    let user_email = identity_repo
        .get_primary_email_by_user_id(auth.user_id)
        .await
        .unwrap_or_default()
        .unwrap_or_default();
    let op_policy = enforce_operator_login_policy(
        &state.db,
        auth.user_id,
        &user_email,
        OpAuthMethod::Passkey,
        login_context.current_org_id,
        client_ip_from_http_request(&req, state.config.as_ref()),
    )
    .await?;

    let workspace_requires_mfa = match workspace_policy.as_ref() {
        Some(org) => {
            org.require_mfa
                || (org.require_mfa_for_admins
                    && org_repo
                        .is_org_admin_or_owner(org.id, auth.user_id)
                        .await
                        .unwrap_or(false))
        }
        None => {
            if let Some(org_id) = login_context.current_org_id {
                let portal_mfa = org_repo
                    .get_organization_by_id(org_id)
                    .await?
                    .map(|org| org.tenant_portal_require_mfa)
                    .unwrap_or(false);
                portal_mfa || op_policy.as_ref().map(|p| p.require_mfa).unwrap_or(false)
            } else {
                // Admin console login — operator policy governs
                op_policy.as_ref().map(|p| p.require_mfa).unwrap_or(false)
            }
        }
    };
    let (totp_enabled, _) = mfa_service.totp_status(auth.user_id).await?;
    let audit_org_id = login_context
        .current_org_id
        .or_else(|| workspace_policy.as_ref().map(|org| org.id));

    if workspace_requires_mfa && !totp_enabled {
        let enrollment = mfa_service
            .start_login_enrollment(auth.user_id, auth.redirect_uri.clone(), "passkey", None)
            .await?;
        AuditService::new(state.db.clone())
            .log(AuditEvent {
                actor_user_id: Some(auth.user_id),
                organization_id: login_context
                    .current_org_id
                    .or_else(|| workspace_policy.as_ref().map(|org| org.id)),
                action: "auth.mfa.enrollment.required".into(),
                target_type: "mfa_method".into(),
                target_id: Some("totp".into()),
                ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                user_agent: req
                    .headers()
                    .get("user-agent")
                    .and_then(|h| h.to_str().ok())
                    .map(String::from),
                metadata: serde_json::json!({
                    "reason": "workspace_requires_mfa_but_user_has_no_totp",
                    "workspace_slug": workspace_policy.as_ref().map(|org| org.slug.clone()),
                }),
            })
            .await;

        return Ok(HttpResponse::Ok().json(serde_json::json!({
            "ok": true,
            "mfa_enrollment_required": true,
            "challenge_id": enrollment.challenge.id,
            "message": "This workspace requires MFA. Set up your authenticator app to finish signing in.",
        })));
    }

    if totp_enabled {
        let mut metadata = serde_json::Map::new();
        metadata.insert("method".into(), serde_json::json!(method_name));
        if let Some(app_name) = login_context.app_name.clone() {
            metadata.insert("app_name".into(), serde_json::json!(app_name));
        }
        if let Some(workspace_slug) = login_context.workspace_slug.clone() {
            metadata.insert("workspace_slug".into(), serde_json::json!(workspace_slug));
        }

        let challenge = mfa_service
            .start_login_challenge(auth.user_id, auth.redirect_uri.clone(), "passkey", None)
            .await?;

        AuditService::new(state.db.clone())
            .log(AuditEvent {
                actor_user_id: Some(auth.user_id),
                organization_id: audit_org_id,
                action: "auth.mfa.required".into(),
                target_type: "mfa_method".into(),
                target_id: Some("totp".into()),
                ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                user_agent: req
                    .headers()
                    .get("user-agent")
                    .and_then(|h| h.to_str().ok())
                    .map(String::from),
                metadata: serde_json::Value::Object(metadata),
            })
            .await;

        return Ok(HttpResponse::Ok().json(serde_json::json!({
            "ok": true,
            "mfa_required": true,
            "challenge_id": challenge.challenge.id,
            "method": "totp",
        })));
    }

    let session_repo = SessionRepository::new(state.db.clone());
    let session_service = SessionService::new(session_repo, state.db.clone());
    let (_session, opaque) = session_service
        .create_opaque_session_with_context(
            auth.user_id,
            crate::modules::session::models::SessionCreateContext {
                user_agent: req
                    .headers()
                    .get("user-agent")
                    .and_then(|h| h.to_str().ok())
                    .map(String::from),
                ip: client_ip_from_http_request(&req, state.config.as_ref()),
                current_org_id: login_context.current_org_id,
                login_surface: auth.surface.clone(),
                login_app_name: login_context.app_name.clone(),
                login_workspace_slug: login_context.workspace_slug.clone(),
            },
        )
        .await?;

    let cookie = build_session_cookie(opaque, &state.config, 7 * 24 * 3600);

    let mut metadata = serde_json::Map::new();
    metadata.insert("method".into(), serde_json::json!(method_name));
    if let Some(app_name) = login_context.app_name {
        metadata.insert("app_name".into(), serde_json::json!(app_name));
    }
    if let Some(workspace_slug) = login_context.workspace_slug {
        metadata.insert("workspace_slug".into(), serde_json::json!(workspace_slug));
    }

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(auth.user_id),
            organization_id: audit_org_id,
            action: success_action.into(),
            target_type: "user".into(),
            target_id: Some(auth.user_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::Value::Object(metadata),
        })
        .await;

    Ok(HttpResponse::Ok().cookie(cookie).json(serde_json::json!({
        "ok": true,
        "redirect_uri": auth.redirect_uri,
    })))
}

async fn demo_login(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<StartLoginRequest>,
) -> Result<HttpResponse, AppError> {
    // Demo mode skips browser WebAuthn ceremony, but still reuses the normal
    // passkey policy, IP, MFA, and session issuance path below.
    if !demo_seed_enabled() {
        return Err(AppError::NotFound(
            "Demo passkey sign-in is unavailable.".into(),
        ));
    }

    let widget_login_context =
        match consume_widget_login_context(&state, body.widget_login_context.as_deref()).await {
            Ok(value) => value,
            Err(AppError::Validation(message))
                if is_widget_login_context_invalid_error(&message) =>
            {
                AuditService::new(state.db.clone())
                    .log(AuditEvent {
                        actor_user_id: None,
                        organization_id: crate::shared::platform_org::get_platform_org_id(
                            &state.db,
                        )
                        .await,
                        action: "auth.widget.context_invalid".into(),
                        target_type: "widget_login_context".into(),
                        target_id: body.widget_login_context.clone(),
                        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                        user_agent: req
                            .headers()
                            .get("user-agent")
                            .and_then(|h| h.to_str().ok())
                            .map(String::from),
                        metadata: serde_json::json!({
                            "reason": "expired_or_replayed",
                            "embed_origin": body.widget_embed_origin,
                            "surface": body.surface,
                            "stage": "passkey_demo_start",
                            "email": body.email.trim().to_lowercase(),
                        }),
                    })
                    .await;
                return Err(AppError::Validation(message));
            }
            Err(err) => return Err(err),
        };
    if let Some(ctx) = widget_login_context.as_ref() {
        let supplied_embed_origin = body
            .widget_embed_origin
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if supplied_embed_origin != Some(ctx.embed_origin.as_str()) {
            return Err(AppError::Forbidden(
                "Hosted login session mismatch: this widget session was issued for a different site. Refresh the widget on the current site and try again.".into()
            ));
        }
    }
    let effective_redirect_uri = widget_login_context
        .as_ref()
        .map(|ctx| ctx.redirect_uri.clone())
        .or_else(|| body.redirect_uri.clone());

    let normalized_email = body.email.trim().to_ascii_lowercase();
    if !is_seeded_demo_email(&normalized_email) {
        return Err(AppError::Validation(
            "Demo passkey is only available for seeded demo accounts.".into(),
        ));
    }

    let identity_repo = IdentityRepository::new(state.db.clone());
    let user_id = identity_repo
        .get_user_id_by_email(&normalized_email)
        .await?
        .ok_or_else(|| {
            AppError::Validation(
                "Demo account is unavailable. Restart demo mode to reseed it.".into(),
            )
        })?;

    complete_passkey_login_response(
        req,
        state,
        CompletedPasskeyLogin {
            user_id,
            redirect_uri: effective_redirect_uri,
            workspace_id: widget_login_context
                .as_ref()
                .and_then(|ctx| ctx.workspace_id),
            surface: body.surface.clone(),
        },
        "passkey_demo",
        "auth.passkey.demo.login.success",
    )
    .await
}

#[utoipa::path(
    post,
    path = "/v1/webauthn/register/finish",
    tag = "browser",
    request_body = FinishRegistrationRequest,
    security(("session_cookie" = [])),
    responses(
        (status = 200, description = "Passkey registered"),
        (status = 400, description = "Invalid credential or expired challenge"),
        (status = 401, description = "No valid session cookie"),
    ),
)]
pub async fn finish_registration(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<FinishRegistrationRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let service = webauthn_service(&state);
    let passkey = service
        .finish_registration(
            session.user_id,
            body.challenge_id,
            body.name
                .clone()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "Security Key".into()),
            body.credential.clone(),
        )
        .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: session.current_org_id,
            action: "auth.passkey.registered".into(),
            target_type: "passkey".into(),
            target_id: Some(passkey.id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "name": passkey.name }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "id": passkey.id,
        "name": passkey.name,
    })))
}

#[utoipa::path(
    post,
    path = "/v1/webauthn/login/report-failure",
    tag = "browser",
    request_body = ReportLoginFailureRequest,
    responses(
        (status = 200, description = "Client-side login failure recorded for audit (public)"),
    ),
)]
pub async fn report_login_failure(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<ReportLoginFailureRequest>,
) -> Result<HttpResponse, AppError> {
    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: None,
            organization_id: None,
            action: "auth.passkey.login.failed".into(),
            target_type: "passkey".into(),
            target_id: None,
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "error": body.reason,
                "stage": body.stage,
                "email": body.email.as_ref().map(|email| email.trim().to_lowercase()),
                "source": "client_reported",
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "ok": true })))
}

#[utoipa::path(
    delete,
    path = "/v1/webauthn/passkeys/{id}",
    tag = "browser",
    params(("id" = Uuid, Path, description = "Passkey ID")),
    security(("session_cookie" = [])),
    responses(
        (status = 200, description = "Passkey deleted"),
        (status = 400, description = "Cannot delete the last login method"),
        (status = 401, description = "No valid session cookie"),
        (status = 404, description = "Passkey not found"),
    ),
)]
pub async fn delete_passkey(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let passkey_id = path.into_inner();
    let service = webauthn_service(&state);
    service
        .delete_my_passkey(session.user_id, passkey_id)
        .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: session.current_org_id,
            action: "auth.passkey.deleted".into(),
            target_type: "passkey".into(),
            target_id: Some(passkey_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({}),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Passkey deleted."
    })))
}

#[utoipa::path(
    patch,
    path = "/v1/webauthn/passkeys/{id}",
    tag = "browser",
    params(("id" = Uuid, Path, description = "Passkey ID")),
    request_body = RenamePasskeyRequest,
    security(("session_cookie" = [])),
    responses(
        (status = 200, description = "Passkey renamed"),
        (status = 400, description = "Validation error"),
        (status = 401, description = "No valid session cookie"),
        (status = 404, description = "Passkey not found"),
    ),
)]
pub async fn rename_passkey(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<RenamePasskeyRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let passkey_id = path.into_inner();
    let new_name = body.name.trim().to_string();
    if new_name.is_empty() {
        return Err(AppError::Validation("Passkey name cannot be empty.".into()));
    }
    if new_name.len() > 100 {
        return Err(AppError::Validation(
            "Passkey name is too long (max 100 characters).".into(),
        ));
    }

    let service = webauthn_service(&state);
    // Ensure the passkey belongs to this user before renaming
    let passkeys = service.list_my_passkeys(session.user_id).await?;
    if !passkeys.iter().any(|p| p.id == passkey_id) {
        return Err(AppError::NotFound("Passkey not found.".into()));
    }

    let repo = WebauthnRepository::new(state.db.clone());
    repo.rename_passkey(passkey_id, session.user_id, &new_name)
        .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: session.current_org_id,
            action: "auth.passkey.renamed".into(),
            target_type: "passkey".into(),
            target_id: Some(passkey_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "new_name": new_name }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "name": new_name,
    })))
}

pub fn routes(rl: crate::bootstrap::config::RateLimitConfig) -> impl Fn(&mut web::ServiceConfig) {
    move |cfg: &mut web::ServiceConfig| {
        cfg.service(
            web::scope("/webauthn/login")
                .wrap(
                    crate::http::middleware::rate_limit::RateLimit::per_endpoint(
                        rl.webauthn_per_endpoint,
                        60,
                    ),
                )
                .wrap(
                    crate::http::middleware::rate_limit::RateLimit::global_per_ip(
                        "webauthn",
                        rl.webauthn_per_ip,
                        60,
                    ),
                )
                .route("/start", web::post().to(start_login))
                .route("/finish", web::post().to(finish_login))
                .route("/demo", web::post().to(demo_login))
                .route("/report-failure", web::post().to(report_login_failure)),
        );

        cfg.service(
            web::scope("/webauthn")
                .wrap(RequireAuth)
                .route("/register/start", web::post().to(start_registration))
                .route("/register/finish", web::post().to(finish_registration))
                .route("/passkeys", web::get().to(list_passkeys))
                .route("/passkeys/{id}", web::delete().to(delete_passkey))
                .route("/passkeys/{id}", web::patch().to(rename_passkey)),
        );
    }
}

/// Alias — same as `routes()`. Used from router for clarity.
pub fn routes_global(
    rl: crate::bootstrap::config::RateLimitConfig,
) -> impl Fn(&mut web::ServiceConfig) {
    routes(rl)
}
