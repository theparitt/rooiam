use actix_web::{web, HttpRequest, HttpResponse};
use chrono::{DateTime, Utc};
use serde::Deserialize;
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
use crate::shared::auth_policy::{ensure_email_domain_allowed, get_workspace_policy_for_redirect};
use crate::shared::error::AppError;
use crate::shared::ip_policy::{
    access_denied_message, evaluate_ip_access, resolve_effective_ip_policy_for_redirect,
};
use crate::shared::operator_policy::{enforce_operator_login_policy, AuthMethod as OpAuthMethod};
use crate::shared::platform_org::get_platform_org_id;
use crate::shared::redirect::{
    is_first_party_public_redirect_uri, is_relative_redirect_uri, normalize_redirect_uri,
};
use crate::shared::request_ip::{client_ip_from_http_request, client_ip_string_from_http_request};
use crate::shared::runtime_config::effective_issuer_url;
use crate::shared::tenant_access::load_tenant_access_policy;
use crate::shared::widget_login_context::{
    consume_widget_login_context, is_widget_login_context_invalid_error,
};

use super::models::{DeviceLoginIntent, UserTrustedDevice};
use super::repository::DeviceLoginRepository;
use super::service::{
    build_approval_payload, create_device_attestation_challenge,
    device_attestation_challenge_redis_key, device_attestation_challenge_ttl_seconds,
    effective_intent_status, CreateDeviceAttestationChallengeInput, DeviceLoginService,
    RegisterTrustedDeviceAttestationInput, RegisterTrustedDeviceInput, StartDeviceLoginInput,
    UpdateTrustedDevicePushTokenInput,
};

#[derive(serde::Deserialize, serde::Serialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RegisterTrustedDeviceAttestationRequest {
    pub format: String,
    pub key_id: Option<String>,
    pub app_id: Option<String>,
    pub environment: Option<String>,
    pub challenge_token: Option<String>,
    pub statement: String,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateDeviceAttestationChallengeRequest {
    pub format: String,
    pub key_id: String,
    pub app_id: String,
    pub environment: String,
    pub device_public_key: String,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct CreateDeviceAttestationChallengeResponse {
    pub ok: bool,
    pub challenge_token: String,
    pub challenge: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct TrustedDeviceAttestationSummary {
    pub status: String,
    pub status_reason: Option<String>,
    pub format: Option<String>,
    pub key_id: Option<String>,
    pub app_id: Option<String>,
    pub environment: Option<String>,
    pub received_at: Option<DateTime<Utc>>,
    pub verified_at: Option<DateTime<Utc>>,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RegisterTrustedDeviceRequest {
    pub device_label: String,
    pub platform: String,
    pub device_token: String,
    pub device_public_key: String,
    pub attestation: Option<RegisterTrustedDeviceAttestationRequest>,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct TrustedDeviceResponse {
    pub id: Uuid,
    pub device_label: String,
    pub platform: String,
    pub device_public_key: Option<String>,
    pub push_capable: bool,
    pub attestation: TrustedDeviceAttestationSummary,
    pub last_seen_at: Option<DateTime<Utc>>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct StartDeviceLoginRequest {
    pub redirect_uri: Option<String>,
    pub widget_login_context: Option<String>,
    pub widget_embed_origin: Option<String>,
    pub surface: Option<String>,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct StartDeviceLoginResponse {
    pub ok: bool,
    pub public_id: Uuid,
    pub browser_nonce: String,
    pub qr_value: String,
    pub display_code: String,
    pub number_choices: Vec<u8>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Deserialize, utoipa::IntoParams)]
pub struct DeviceLoginStatusQuery {
    pub browser_nonce: String,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct DeviceLoginStatusResponse {
    pub ok: bool,
    pub status: String,
    pub status_reason: Option<String>,
    pub display_code: String,
    pub number_choices: Vec<u8>,
    pub redirect_uri: Option<String>,
    pub approved_at: Option<DateTime<Utc>>,
    pub consumed_at: Option<DateTime<Utc>>,
    pub expires_at: DateTime<Utc>,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CompleteDeviceLoginRequest {
    pub public_id: Uuid,
    pub browser_nonce: String,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CancelDeviceLoginRequest {
    pub public_id: Uuid,
    pub browser_nonce: String,
}

#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct DeviceLoginIntentPreviewResponse {
    pub ok: bool,
    pub public_id: Uuid,
    pub status: String,
    pub status_reason: Option<String>,
    pub display_code: String,
    pub match_number: u8,
    pub approval_payload: String,
    pub expires_at: DateTime<Utc>,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct ApproveDeviceLoginRequest {
    pub public_id: Uuid,
    pub device_token: String,
    pub selected_number: u8,
    pub approval_signature: String,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct RejectDeviceLoginRequest {
    pub public_id: Uuid,
    pub device_token: String,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateTrustedDevicePushTokenRequest {
    pub push_token: Option<String>,
}

fn device_login_service(state: &web::Data<AppState>) -> DeviceLoginService {
    DeviceLoginService::new(
        DeviceLoginRepository::new(state.db.clone()),
        state.config.clone(),
        state.redis.clone(),
    )
}

fn device_login_repo(state: &web::Data<AppState>) -> DeviceLoginRepository {
    DeviceLoginRepository::new(state.db.clone())
}

fn to_response(device: UserTrustedDevice) -> TrustedDeviceResponse {
    TrustedDeviceResponse {
        id: device.id,
        device_label: device.device_label,
        platform: device.platform,
        device_public_key: device.device_public_key,
        push_capable: device
            .push_token
            .as_deref()
            .map(str::trim)
            .map(|value| !value.is_empty())
            .unwrap_or(false),
        attestation: TrustedDeviceAttestationSummary {
            status: device.attestation_status,
            status_reason: device.attestation_status_reason,
            format: device.attestation_format,
            key_id: device.attestation_key_id,
            app_id: device.attestation_app_id,
            environment: device.attestation_environment,
            received_at: device.attestation_received_at,
            verified_at: device.attestation_verified_at,
        },
        last_seen_at: device.last_seen_at,
        last_used_at: device.last_used_at,
        revoked_at: device.revoked_at,
        created_at: device.created_at,
    }
}

fn request_user_agent(req: &HttpRequest) -> Option<String> {
    req.headers()
        .get("user-agent")
        .and_then(|h| h.to_str().ok())
        .map(String::from)
}

fn intent_number_choices(intent: &DeviceLoginIntent) -> Vec<u8> {
    let mut choices = vec![intent.match_number as u8];
    choices.extend(intent.decoy_numbers.iter().map(|value| *value as u8));
    choices
}

async fn resolve_device_login_redirect_uri(
    state: &web::Data<AppState>,
    redirect_uri: Option<String>,
) -> Result<Option<String>, AppError> {
    let Some(raw_redirect) = redirect_uri
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };

    match normalize_redirect_uri(Some(raw_redirect.clone())) {
        Ok(value) => Ok(value),
        Err(AppError::Validation(message)) if message == "redirect_uri is not allowed" => {
            if is_relative_redirect_uri(&raw_redirect)
                || is_first_party_public_redirect_uri(&raw_redirect)
                || device_login_repo(state)
                    .resolve_redirect_target(&raw_redirect)
                    .await?
                    .is_some()
            {
                Ok(Some(raw_redirect))
            } else {
                Err(AppError::Validation(
                    "This app callback is not allowed. Use a registered app redirect_uri or a first-party Rooiam URL.".into(),
                ))
            }
        }
        Err(error) => Err(error),
    }
}

async fn build_device_login_completion_response(
    req: &HttpRequest,
    state: &web::Data<AppState>,
    intent: DeviceLoginIntent,
) -> Result<HttpResponse, AppError> {
    let approved_user_id = intent.approved_user_id.ok_or_else(|| {
        AppError::Internal("Approved device login intent is missing user ID.".into())
    })?;

    let email = IdentityRepository::new(state.db.clone())
        .get_primary_email_by_user_id(approved_user_id)
        .await?
        .ok_or_else(|| AppError::Forbidden("This account does not have a primary email.".into()))?;
    let redirect_uri = intent.redirect_uri.clone();
    let approved_device_id = intent.approved_device_id;

    let login_context =
        resolve_login_context(&state.db, approved_user_id, redirect_uri.as_deref()).await?;
    let workspace_policy =
        get_workspace_policy_for_redirect(&state.db, redirect_uri.as_deref()).await?;

    if let Some(ref org) = workspace_policy {
        ensure_email_domain_allowed(org, &email)?;
    }

    let org_repo = OrganizationRepository::new(state.db.clone());
    let op_policy = enforce_operator_login_policy(
        &state.db,
        approved_user_id,
        &email,
        OpAuthMethod::Passkey,
        login_context.current_org_id,
        client_ip_from_http_request(req, state.config.as_ref()),
    )
    .await?;

    let mfa_repo = MfaRepository::new(state.db.clone());
    let mfa_service = MfaService::new(
        mfa_repo,
        IdentityRepository::new(state.db.clone()),
        state.config.as_ref().clone(),
    );
    let (totp_enabled, _) = mfa_service.totp_status(approved_user_id).await?;

    let workspace_requires_mfa = match workspace_policy.as_ref() {
        Some(org) => {
            org.require_mfa
                || (org.require_mfa_for_admins
                    && org_repo
                        .is_org_admin_or_owner(org.id, approved_user_id)
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
                portal_mfa
                    || op_policy
                        .as_ref()
                        .map(|policy| policy.require_mfa)
                        .unwrap_or(false)
            } else {
                op_policy
                    .as_ref()
                    .map(|policy| policy.require_mfa)
                    .unwrap_or(false)
            }
        }
    };

    if workspace_requires_mfa && !totp_enabled {
        let enrollment = mfa_service
            .start_login_enrollment(approved_user_id, redirect_uri.clone(), "device_login", None)
            .await?;

        return Ok(HttpResponse::Ok().json(serde_json::json!({
            "ok": true,
            "mfa_enrollment_required": true,
            "challenge_id": enrollment.challenge.id,
            "message": "This workspace requires MFA. Set up your authenticator app to finish signing in.",
        })));
    }

    if totp_enabled {
        let challenge = mfa_service
            .start_login_challenge(approved_user_id, redirect_uri.clone(), "device_login", None)
            .await?;

        return Ok(HttpResponse::Ok().json(serde_json::json!({
            "ok": true,
            "mfa_required": true,
            "challenge_id": challenge.challenge.id,
            "method": "totp",
        })));
    }

    let session_repo = SessionRepository::new(state.db.clone());
    let session_service = SessionService::new(session_repo, state.db.clone());
    let (_session, opaque_session) = session_service
        .create_opaque_session_with_context(
            approved_user_id,
            crate::modules::session::models::SessionCreateContext {
                user_agent: request_user_agent(req),
                ip: client_ip_from_http_request(req, state.config.as_ref()),
                current_org_id: login_context.current_org_id,
                login_surface: intent.surface.clone(),
                login_app_name: login_context.app_name.clone(),
                login_workspace_slug: login_context.workspace_slug.clone(),
            },
        )
        .await?;

    let cookie = build_session_cookie(opaque_session, &state.config, 7 * 24 * 3600);
    let audit_org_id = login_context
        .current_org_id
        .or_else(|| workspace_policy.as_ref().map(|org| org.id));

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(approved_user_id),
            organization_id: audit_org_id,
            action: "auth.login.success".into(),
            target_type: "user".into(),
            target_id: Some(approved_user_id.to_string()),
            ip: client_ip_string_from_http_request(req, state.config.as_ref()),
            user_agent: request_user_agent(req),
            metadata: serde_json::json!({
                "method": "device_login",
                "redirect_to": redirect_uri,
                "approved_device_id": approved_device_id,
                "workspace_slug": login_context.workspace_slug,
                "app_name": login_context.app_name,
            }),
        })
        .await;

    Ok(HttpResponse::Ok().cookie(cookie).json(serde_json::json!({
        "ok": true,
        "user_id": approved_user_id,
        "redirect_uri": redirect_uri,
    })))
}

#[utoipa::path(
    post,
    path = "/v1/auth/device-login/start",
    tag = "browser",
    request_body = StartDeviceLoginRequest,
    responses(
        (status = 200, description = "QR device-login request created"),
        (status = 400, description = "Validation error"),
        (status = 429, description = "Rate limited"),
    ),
)]
pub async fn start_device_login(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<StartDeviceLoginRequest>,
) -> Result<HttpResponse, AppError> {
    let ip = client_ip_string_from_http_request(&req, state.config.as_ref());
    let user_agent = request_user_agent(&req);

    let widget_login_context =
        match consume_widget_login_context(&state, body.widget_login_context.as_deref()).await {
            Ok(value) => value,
            Err(AppError::Validation(message))
                if is_widget_login_context_invalid_error(&message) =>
            {
                AuditService::new(state.db.clone())
                    .log(AuditEvent {
                        actor_user_id: None,
                        organization_id: get_platform_org_id(&state.db).await,
                        action: "auth.widget.context_invalid".into(),
                        target_type: "widget_login_context".into(),
                        target_id: body.widget_login_context.clone(),
                        ip: ip.clone(),
                        user_agent: user_agent.clone(),
                        metadata: serde_json::json!({
                            "reason": "expired_or_replayed",
                            "embed_origin": body.widget_embed_origin,
                            "surface": body.surface,
                            "stage": "device_login_start",
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
                "Hosted login session mismatch: this widget session was issued for a different site. Refresh the widget on the current site and try again.".into(),
            ));
        }
    }

    let effective_redirect_uri = resolve_device_login_redirect_uri(
        &state,
        widget_login_context
            .as_ref()
            .map(|ctx| ctx.redirect_uri.clone())
            .or_else(|| body.redirect_uri.clone()),
    )
    .await?;

    if matches!(body.surface.as_deref(), Some("admin")) {
        return Err(AppError::Validation(
            "QR device login is not available on the admin console.".into(),
        ));
    }

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

    let tenant_access = load_tenant_access_policy(&state.db).await?;
    if !tenant_access.allow_device_login {
        return Err(AppError::Validation(
            "QR device login is currently disabled.".into(),
        ));
    }

    let repo = device_login_repo(&state);
    let (workspace_id, oauth_client_id) = if let Some(ctx) = widget_login_context.as_ref() {
        (
            ctx.workspace_id,
            repo.get_oauth_client_internal_id(&ctx.client_id).await?,
        )
    } else if let Some(redirect_uri) = effective_redirect_uri.as_deref() {
        match repo.resolve_redirect_target(redirect_uri).await? {
            Some((client_id, org_id)) => (Some(org_id), Some(client_id)),
            None => (None, None),
        }
    } else {
        (None, None)
    };

    let issuer_url = effective_issuer_url(&state.db).await?;
    let started = device_login_service(&state)
        .start_device_login(StartDeviceLoginInput {
            workspace_id,
            oauth_client_id,
            redirect_uri: effective_redirect_uri.clone(),
            surface: body.surface.clone(),
            requester_ip: ip.clone(),
            requester_user_agent: user_agent.clone(),
            issuer_url,
        })
        .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: None,
            organization_id: workspace_id.or(get_platform_org_id(&state.db).await),
            action: "auth.device_login.started".into(),
            target_type: "device_login_intent".into(),
            target_id: Some(started.public_id.to_string()),
            ip,
            user_agent,
            metadata: serde_json::json!({
                "redirect_uri": effective_redirect_uri,
                "surface": body.surface,
                "display_code": started.display_code,
                "expires_at": started.expires_at,
                "workspace_id": workspace_id,
                "oauth_client_id": oauth_client_id,
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(StartDeviceLoginResponse {
        ok: true,
        public_id: started.public_id,
        browser_nonce: started.browser_nonce,
        qr_value: started.qr_value,
        display_code: started.display_code,
        number_choices: started.number_choices,
        expires_at: started.expires_at,
    }))
}

#[utoipa::path(
    get,
    path = "/v1/auth/device-login/{public_id}/status",
    tag = "browser",
    params(
        ("public_id" = Uuid, Path, description = "Public device-login intent ID"),
        DeviceLoginStatusQuery
    ),
    responses(
        (status = 200, description = "Current QR device-login status"),
        (status = 400, description = "Validation error"),
        (status = 404, description = "Intent not found"),
    ),
)]
pub async fn get_device_login_status(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    query: web::Query<DeviceLoginStatusQuery>,
) -> Result<HttpResponse, AppError> {
    let intent = device_login_service(&state)
        .load_browser_intent(
            path.into_inner(),
            &query.browser_nonce,
            request_user_agent(&req).as_deref(),
        )
        .await?;

    Ok(HttpResponse::Ok().json(DeviceLoginStatusResponse {
        ok: true,
        status: effective_intent_status(&intent),
        status_reason: intent.status_reason.clone(),
        display_code: intent.display_code.clone(),
        number_choices: intent_number_choices(&intent),
        redirect_uri: intent.redirect_uri.clone(),
        approved_at: intent.approved_at,
        consumed_at: intent.consumed_at,
        expires_at: intent.expires_at,
    }))
}

#[utoipa::path(
    post,
    path = "/v1/auth/device-login/complete",
    tag = "browser",
    request_body = CompleteDeviceLoginRequest,
    responses(
        (status = 200, description = "Phone-approved QR login completed; sets session cookie or returns MFA next step"),
        (status = 400, description = "Validation error"),
        (status = 409, description = "Intent not approved or already consumed"),
    ),
)]
pub async fn complete_device_login(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<CompleteDeviceLoginRequest>,
) -> Result<HttpResponse, AppError> {
    let intent = device_login_service(&state)
        .consume_approved_browser_intent(
            body.public_id,
            &body.browser_nonce,
            request_user_agent(&req).as_deref(),
        )
        .await?;

    build_device_login_completion_response(&req, &state, intent).await
}

#[utoipa::path(
    post,
    path = "/v1/auth/device-login/cancel",
    tag = "browser",
    request_body = CancelDeviceLoginRequest,
    responses(
        (status = 200, description = "Pending QR device-login request cancelled from the browser"),
        (status = 400, description = "Validation error"),
        (status = 409, description = "Intent cannot be cancelled"),
    ),
)]
pub async fn cancel_device_login(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<CancelDeviceLoginRequest>,
) -> Result<HttpResponse, AppError> {
    let cancelled = device_login_service(&state)
        .cancel_browser_intent(
            body.public_id,
            &body.browser_nonce,
            request_user_agent(&req).as_deref(),
        )
        .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: None,
            organization_id: cancelled
                .workspace_id
                .or(get_platform_org_id(&state.db).await),
            action: "auth.device_login.cancelled".into(),
            target_type: "device_login_intent".into(),
            target_id: Some(cancelled.public_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: request_user_agent(&req),
            metadata: serde_json::json!({
                "display_code": cancelled.display_code,
                "status_reason": cancelled.status_reason,
                "redirect_uri": cancelled.redirect_uri,
                "surface": cancelled.surface,
                "requester_ip": cancelled.requester_ip,
                "requester_user_agent": cancelled.requester_user_agent,
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "status": effective_intent_status(&cancelled),
        "status_reason": cancelled.status_reason,
    })))
}

#[utoipa::path(
    get,
    path = "/v1/identity/device-login/intents/{public_id}",
    tag = "browser",
    params(("public_id" = Uuid, Path, description = "Public device-login intent ID")),
    security(("session_cookie" = [])),
    responses(
        (status = 200, description = "Preview scanned device-login request"),
        (status = 401, description = "No valid session cookie"),
        (status = 404, description = "Intent not found"),
    ),
)]
pub async fn get_device_login_intent(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let _session = extract_session(&req)?;
    let public_id = path.into_inner();
    let intent = device_login_repo(&state)
        .get_device_login_intent_by_public_id(public_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Device login request not found.".into()))?;
    let approval_payload = build_approval_payload(&intent);

    Ok(HttpResponse::Ok().json(DeviceLoginIntentPreviewResponse {
        ok: true,
        public_id: intent.public_id,
        status: effective_intent_status(&intent),
        status_reason: intent.status_reason,
        display_code: intent.display_code,
        match_number: intent.match_number as u8,
        approval_payload,
        expires_at: intent.expires_at,
    }))
}

#[utoipa::path(
    post,
    path = "/v1/identity/device-login/approve",
    tag = "browser",
    request_body = ApproveDeviceLoginRequest,
    security(("session_cookie" = [])),
    responses(
        (status = 200, description = "QR device-login request approved from a trusted device"),
        (status = 400, description = "Validation error"),
        (status = 401, description = "No valid session cookie"),
        (status = 409, description = "Intent cannot be approved"),
    ),
)]
pub async fn approve_device_login(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<ApproveDeviceLoginRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let approved = device_login_service(&state)
        .approve_device_login(
            session.user_id,
            body.public_id,
            &body.device_token,
            body.selected_number,
            &body.approval_signature,
        )
        .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: approved.workspace_id.or(session.current_org_id),
            action: "auth.device_login.approved".into(),
            target_type: "device_login_intent".into(),
            target_id: Some(approved.public_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: request_user_agent(&req),
            metadata: serde_json::json!({
                "approved_device_id": approved.approved_device_id,
                "display_code": approved.display_code,
                "redirect_uri": approved.redirect_uri,
                "surface": approved.surface,
                "requester_ip": approved.requester_ip,
                "requester_user_agent": approved.requester_user_agent,
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "status": effective_intent_status(&approved),
        "status_reason": approved.status_reason,
        "approved_at": approved.approved_at,
    })))
}

#[utoipa::path(
    post,
    path = "/v1/identity/device-login/reject",
    tag = "browser",
    request_body = RejectDeviceLoginRequest,
    security(("session_cookie" = [])),
    responses(
        (status = 200, description = "QR device-login request rejected from a trusted device"),
        (status = 400, description = "Validation error"),
        (status = 401, description = "No valid session cookie"),
        (status = 409, description = "Intent cannot be rejected"),
    ),
)]
pub async fn reject_device_login(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<RejectDeviceLoginRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let rejected = device_login_service(&state)
        .reject_device_login(session.user_id, body.public_id, &body.device_token)
        .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: rejected.workspace_id.or(session.current_org_id),
            action: "auth.device_login.rejected".into(),
            target_type: "device_login_intent".into(),
            target_id: Some(rejected.public_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: request_user_agent(&req),
            metadata: serde_json::json!({
                "display_code": rejected.display_code,
                "status_reason": rejected.status_reason,
                "redirect_uri": rejected.redirect_uri,
                "surface": rejected.surface,
                "requester_ip": rejected.requester_ip,
                "requester_user_agent": rejected.requester_user_agent,
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "status": effective_intent_status(&rejected),
        "status_reason": rejected.status_reason,
    })))
}

#[utoipa::path(
    post,
    path = "/v1/identity/me/devices",
    tag = "browser",
    request_body = RegisterTrustedDeviceRequest,
    security(("session_cookie" = [])),
    responses(
        (status = 200, description = "Trusted device registered"),
        (status = 400, description = "Validation error"),
        (status = 401, description = "No valid session cookie"),
        (status = 409, description = "Device already registered"),
    ),
)]
pub async fn register_trusted_device(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<RegisterTrustedDeviceRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let device = device_login_service(&state)
        .register_trusted_device(
            session.user_id,
            RegisterTrustedDeviceInput {
                device_label: body.device_label.clone(),
                platform: body.platform.clone(),
                device_token: body.device_token.clone(),
                device_public_key: Some(body.device_public_key.clone()),
                attestation: body.attestation.as_ref().map(|attestation| {
                    RegisterTrustedDeviceAttestationInput {
                        format: attestation.format.clone(),
                        key_id: attestation.key_id.clone(),
                        app_id: attestation.app_id.clone(),
                        environment: attestation.environment.clone(),
                        challenge_token: attestation.challenge_token.clone(),
                        statement: attestation.statement.clone(),
                    }
                }),
            },
        )
        .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: session.current_org_id,
            action: "identity.device.registered".into(),
            target_type: "trusted_device".into(),
            target_id: Some(device.id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: request_user_agent(&req),
            metadata: serde_json::json!({
                "platform": device.platform,
                "device_label": device.device_label,
                "attestation_status": device.attestation_status,
                "attestation_format": device.attestation_format,
                "push_capable": device.push_token.is_some(),
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(to_response(device)))
}

#[utoipa::path(
    post,
    path = "/v1/identity/me/devices/attestation-challenge",
    tag = "browser",
    request_body = CreateDeviceAttestationChallengeRequest,
    security(("session_cookie" = [])),
    responses(
        (status = 200, description = "One-time attestation challenge issued"),
        (status = 400, description = "Validation error"),
        (status = 401, description = "No valid session cookie"),
    ),
)]
pub async fn create_trusted_device_attestation_challenge(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<CreateDeviceAttestationChallengeRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let challenge = create_device_attestation_challenge(
        session.user_id,
        CreateDeviceAttestationChallengeInput {
            format: body.format.clone(),
            key_id: body.key_id.clone(),
            app_id: body.app_id.clone(),
            environment: body.environment.clone(),
            device_public_key: body.device_public_key.clone(),
        },
    )?;
    let redis_key = device_attestation_challenge_redis_key(&challenge.token)?;
    let payload = serde_json::to_string(&challenge.record).map_err(|error| {
        AppError::Internal(format!(
            "Failed to serialize device attestation challenge payload: {}",
            error
        ))
    })?;
    let mut redis = state.redis.clone();
    let _: () = redis::cmd("SETEX")
        .arg(&redis_key)
        .arg(device_attestation_challenge_ttl_seconds())
        .arg(payload)
        .query_async(&mut redis)
        .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: session.current_org_id,
            action: "identity.device.attestation_challenge_issued".into(),
            target_type: "trusted_device_attestation".into(),
            target_id: Some(challenge.token.clone()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: request_user_agent(&req),
            metadata: serde_json::json!({
                "format": challenge.record.format,
                "app_id": challenge.record.app_id,
                "environment": challenge.record.environment,
                "expires_at": challenge.expires_at,
            }),
        })
        .await;

    Ok(
        HttpResponse::Ok().json(CreateDeviceAttestationChallengeResponse {
            ok: true,
            challenge_token: challenge.token,
            challenge: challenge.challenge,
            expires_at: challenge.expires_at,
        }),
    )
}

#[utoipa::path(
    get,
    path = "/v1/identity/me/devices",
    tag = "browser",
    security(("session_cookie" = [])),
    responses(
        (status = 200, description = "List trusted devices"),
        (status = 401, description = "No valid session cookie"),
    ),
)]
pub async fn list_trusted_devices(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let devices = device_login_service(&state)
        .list_trusted_devices(session.user_id)
        .await?;

    Ok(HttpResponse::Ok().json(devices.into_iter().map(to_response).collect::<Vec<_>>()))
}

#[utoipa::path(
    put,
    path = "/v1/identity/me/devices/{id}/push-token",
    tag = "browser",
    request_body = UpdateTrustedDevicePushTokenRequest,
    params(("id" = Uuid, Path, description = "Trusted device ID")),
    security(("session_cookie" = [])),
    responses(
        (status = 200, description = "Trusted device push token updated or cleared"),
        (status = 400, description = "Validation error"),
        (status = 401, description = "No valid session cookie"),
        (status = 404, description = "Trusted device not found"),
    ),
)]
pub async fn update_trusted_device_push_token(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<UpdateTrustedDevicePushTokenRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let device_id = path.into_inner();
    let device = device_login_service(&state)
        .update_trusted_device_push_token(
            session.user_id,
            device_id,
            UpdateTrustedDevicePushTokenInput {
                push_token: body.push_token.clone(),
            },
        )
        .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: session.current_org_id,
            action: "identity.device.push_token_updated".into(),
            target_type: "trusted_device".into(),
            target_id: Some(device_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: request_user_agent(&req),
            metadata: serde_json::json!({
                "push_capable": device.push_token.is_some(),
                "platform": device.platform,
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(to_response(device)))
}

#[utoipa::path(
    delete,
    path = "/v1/identity/me/devices/{id}",
    tag = "browser",
    params(("id" = Uuid, Path, description = "Trusted device ID")),
    security(("session_cookie" = [])),
    responses(
        (status = 200, description = "Trusted device revoked"),
        (status = 401, description = "No valid session cookie"),
        (status = 404, description = "Trusted device not found"),
    ),
)]
pub async fn revoke_trusted_device(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let device_id = path.into_inner();
    let revoked = device_login_service(&state)
        .revoke_trusted_device(session.user_id, device_id)
        .await?;

    if !revoked {
        return Err(AppError::NotFound("Trusted device not found.".into()));
    }

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: session.current_org_id,
            action: "identity.device.revoked".into(),
            target_type: "trusted_device".into(),
            target_id: Some(device_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: request_user_agent(&req),
            metadata: serde_json::json!({}),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Trusted device revoked."
    })))
}

pub fn auth_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/device-login")
            .service(
                web::resource("/start")
                    .wrap(crate::http::middleware::rate_limit::RateLimit::per_endpoint(10, 60))
                    .wrap(
                        crate::http::middleware::rate_limit::RateLimit::global_per_ip(
                            "device_login_start",
                            30,
                            60,
                        ),
                    )
                    .route(web::post().to(start_device_login)),
            )
            .service(
                web::resource("/{public_id}/status")
                    .wrap(crate::http::middleware::rate_limit::RateLimit::per_endpoint(120, 60))
                    .wrap(
                        crate::http::middleware::rate_limit::RateLimit::global_per_ip(
                            "device_login_status",
                            600,
                            60,
                        ),
                    )
                    .route(web::get().to(get_device_login_status)),
            )
            .service(
                web::resource("/complete")
                    .wrap(crate::http::middleware::rate_limit::RateLimit::per_endpoint(30, 60))
                    .wrap(
                        crate::http::middleware::rate_limit::RateLimit::global_per_ip(
                            "device_login_complete",
                            120,
                            60,
                        ),
                    )
                    .route(web::post().to(complete_device_login)),
            )
            .service(
                web::resource("/cancel")
                    .wrap(crate::http::middleware::rate_limit::RateLimit::per_endpoint(30, 60))
                    .wrap(
                        crate::http::middleware::rate_limit::RateLimit::global_per_ip(
                            "device_login_cancel",
                            120,
                            60,
                        ),
                    )
                    .route(web::post().to(cancel_device_login)),
            ),
    );
}

pub fn routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/me/devices")
            .wrap(RequireAuth)
            .service(
                web::resource("/attestation-challenge")
                    .wrap(crate::http::middleware::rate_limit::RateLimit::per_endpoint(10, 60))
                    .wrap(
                        crate::http::middleware::rate_limit::RateLimit::global_per_ip(
                            "trusted_device_attestation_challenge",
                            30,
                            60,
                        ),
                    )
                    .route(web::post().to(create_trusted_device_attestation_challenge)),
            )
            .service(
                web::resource("")
                    .wrap(crate::http::middleware::rate_limit::RateLimit::per_endpoint(10, 60))
                    .wrap(
                        crate::http::middleware::rate_limit::RateLimit::global_per_ip(
                            "trusted_device_register",
                            30,
                            60,
                        ),
                    )
                    .route(web::post().to(register_trusted_device))
                    .route(web::get().to(list_trusted_devices)),
            )
            .service(
                web::resource("/{id}")
                    .wrap(crate::http::middleware::rate_limit::RateLimit::per_endpoint(30, 60))
                    .wrap(
                        crate::http::middleware::rate_limit::RateLimit::global_per_ip(
                            "trusted_device_revoke",
                            120,
                            60,
                        ),
                    )
                    .route(web::delete().to(revoke_trusted_device)),
            )
            .service(
                web::resource("/{id}/push-token")
                    .wrap(crate::http::middleware::rate_limit::RateLimit::per_endpoint(30, 60))
                    .wrap(
                        crate::http::middleware::rate_limit::RateLimit::global_per_ip(
                            "trusted_device_push_token",
                            120,
                            60,
                        ),
                    )
                    .route(web::put().to(update_trusted_device_push_token)),
            ),
    );

    cfg.service(
        web::scope("/device-login")
            .wrap(RequireAuth)
            .service(
                web::resource("/intents/{public_id}")
                    .wrap(crate::http::middleware::rate_limit::RateLimit::per_endpoint(120, 60))
                    .wrap(
                        crate::http::middleware::rate_limit::RateLimit::global_per_ip(
                            "device_login_intent_preview",
                            600,
                            60,
                        ),
                    )
                    .route(web::get().to(get_device_login_intent)),
            )
            .service(
                web::resource("/approve")
                    .wrap(crate::http::middleware::rate_limit::RateLimit::per_endpoint(30, 60))
                    .wrap(
                        crate::http::middleware::rate_limit::RateLimit::global_per_ip(
                            "device_login_approve",
                            120,
                            60,
                        ),
                    )
                    .route(web::post().to(approve_device_login)),
            )
            .service(
                web::resource("/reject")
                    .wrap(crate::http::middleware::rate_limit::RateLimit::per_endpoint(30, 60))
                    .wrap(
                        crate::http::middleware::rate_limit::RateLimit::global_per_ip(
                            "device_login_reject",
                            120,
                            60,
                        ),
                    )
                    .route(web::post().to(reject_device_login)),
            ),
    );
}
