use actix_multipart::Multipart;
use actix_web::{mime, web, HttpRequest, HttpResponse};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{Duration, Utc};
use futures_util::TryStreamExt;
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};
use std::path::Path;
use uuid::Uuid;
use url::Url;

use crate::bootstrap::state::AppState;
use crate::shared::error::AppError;
use crate::http::middleware::auth::{extract_session, RequireAuth};
use crate::modules::audit::service::{AuditEvent, AuditService};
use crate::modules::mfa::{repository::MfaRepository, service::MfaService};
use crate::modules::oidc::service::OIDCService;
use crate::modules::organization::repository::OrganizationRepository;
use crate::modules::session::{models::ActiveSession, repository::SessionRepository};
use crate::shared::storage_config::{delete_public_asset, store_public_asset};
use crate::modules::webauthn::repository::WebauthnRepository;
use crate::modules::webauthn::service::WebauthnService;
use crate::shared::request_ip::client_ip_string_from_http_request;
use crate::shared::runtime_config::load_runtime_app_config;
use crate::shared::runtime_config::{effective_admin_url, effective_app_url};
use super::{repository::IdentityRepository, service::IdentityService};
use super::models::{LinkedAccountsResponse, LinkedMagicLinkStatus, LinkedProviderStatus, SecurityCapabilitiesResponse};

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateProfileRequest {
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StartLinkRequest {
    pub redirect_uri: Option<String>,
}

#[derive(serde::Serialize)]
pub struct UploadAvatarResponse {
    pub url: String,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct FinishPasskeyRegistrationRequest {
    challenge_id: Uuid,
    name: Option<String>,
    credential: serde_json::Value,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct RenamePasskeyRequest {
    name: String,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct FinishTotpEnrollmentRequest {
    challenge_id: Uuid,
    code: String,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct MyAuditLogQuery {
    page: Option<i64>,
    page_size: Option<i64>,
    date_from: Option<String>,
    date_to: Option<String>,
}

async fn is_platform_staff(state: &web::Data<AppState>, user_id: Uuid) -> Result<bool, AppError> {
    let is_staff: Option<bool> = sqlx::query_scalar(
        "SELECT (is_platform_owner OR is_superuser) FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to check platform staff status: {}", e)))?;

    Ok(is_staff.unwrap_or(false))
}

async fn require_recent_admin_reauth(
    req: &HttpRequest,
    state: &web::Data<AppState>,
    session: &crate::modules::session::models::ActiveSession,
) -> Result<(), AppError> {
    if !is_platform_staff(state, session.user_id).await? {
        return Ok(());
    }

    let (current_session, _) = crate::modules::session::repository::SessionRepository::new(state.db.clone())
        .get_valid_session(session.session_id)
        .await?;

    let max_age = Duration::minutes(60);
    if Utc::now() - current_session.created_at > max_age {
        AuditService::new(state.db.clone()).log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: session.current_org_id,
            action: "identity.link.reauth_required".into(),
            target_type: "external_identity".into(),
            target_id: None,
            ip: client_ip_string_from_http_request(req, state.config.as_ref()),
            user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
            metadata: serde_json::json!({
                "reason": "admin_session_too_old",
                "max_age_minutes": 60
            }),
        }).await;

        return Err(AppError::Forbidden(
            "For admin accounts, linking and unlinking providers requires a recent sign-in. Sign out and sign in again before retrying.".into()
        ));
    }

    Ok(())
}

fn token_webauthn_service(state: &web::Data<AppState>) -> WebauthnService {
    WebauthnService::new(
        WebauthnRepository::new(state.db.clone()),
        IdentityRepository::new(state.db.clone()),
        state.config.as_ref().clone(),
    )
}

fn token_mfa_service(state: &web::Data<AppState>) -> MfaService {
    MfaService::new(
        MfaRepository::new(state.db.clone()),
        IdentityRepository::new(state.db.clone()),
        state.config.as_ref().clone(),
    )
}

fn validated_audit_log_pagination(query: &MyAuditLogQuery) -> Result<(i64, i64, Option<String>, Option<String>), AppError> {
    let page = query.page.unwrap_or(1);
    if page < 1 {
        return Err(AppError::Validation("page must be greater than or equal to 1.".into()));
    }

    let page_size = query.page_size.unwrap_or(25);
    if !(1..=1000).contains(&page_size) {
        return Err(AppError::Validation("page_size must be between 1 and 1000.".into()));
    }

    let date_from = query.date_from.as_deref().map(str::trim).filter(|value| !value.is_empty()).map(String::from);
    let date_to = query.date_to.as_deref().map(str::trim).filter(|value| !value.is_empty()).map(String::from);

    Ok((page, page_size, date_from, date_to))
}

struct ActorSecurityState {
    current_org_id: Option<Uuid>,
    current_org_slug: Option<String>,
    primary_email: Option<String>,
    linked_providers: Vec<String>,
    passkey_count: usize,
    totp_enabled: bool,
    backup_codes_remaining: i64,
    passkey_supported: bool,
    passkey_allowed: bool,
    mfa_required: bool,
}

async fn load_actor_security_state(
    state: &web::Data<AppState>,
    user_id: Uuid,
    current_org_id: Option<Uuid>,
) -> Result<ActorSecurityState, AppError> {
    let identity_repo = IdentityRepository::new(state.db.clone());
    let primary_email = identity_repo.get_primary_email_by_user_id(user_id).await?;
    let external_identities = identity_repo.list_external_identities_by_user_id(user_id).await?;
    let passkeys = WebauthnRepository::new(state.db.clone())
        .list_passkeys_by_user_id(user_id)
        .await?;
    let (totp_enabled, backup_codes_remaining) = token_mfa_service(state).totp_status(user_id).await?;

    let current_org = match current_org_id {
        Some(org_id) => OrganizationRepository::new(state.db.clone()).get_organization_by_id(org_id).await?,
        None => None,
    };

    let passkey_supported = !state.config.webauthn.rp_id.trim().is_empty()
        && !state.config.webauthn.origin.trim().is_empty();
    let passkey_allowed = passkey_supported
        && current_org.as_ref().map(|org| org.allow_passkey).unwrap_or(true);
    let mfa_required = current_org.as_ref().map(|org| org.require_mfa).unwrap_or(false);

    Ok(ActorSecurityState {
        current_org_id,
        current_org_slug: current_org.map(|org| org.slug),
        primary_email,
        linked_providers: external_identities.into_iter().map(|identity| identity.provider).collect(),
        passkey_count: passkeys.len(),
        totp_enabled,
        backup_codes_remaining,
        passkey_supported,
        passkey_allowed,
        mfa_required,
    })
}

fn can_remove_last_passkey(security: &ActorSecurityState) -> bool {
    security.primary_email.is_some() || !security.linked_providers.is_empty() || security.passkey_count > 1
}

async fn get_security_capabilities_bearer(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;
    let security = load_actor_security_state(&state, session.user_id, session.current_org_id).await?;

    Ok(HttpResponse::Ok().json(SecurityCapabilitiesResponse {
        current_org_id: security.current_org_id,
        current_org_slug: security.current_org_slug.clone(),
        passkey_supported: security.passkey_supported,
        passkey_allowed: security.passkey_allowed,
        passkey_required: false,
        mfa_allowed: true,
        mfa_required: security.mfa_required,
        totp_enabled: security.totp_enabled,
        backup_codes_remaining: security.backup_codes_remaining,
        passkey_count: security.passkey_count,
        linked_providers: security.linked_providers.clone(),
        magic_link_enabled: security.primary_email.is_some(),
        can_add_passkey: security.passkey_allowed,
        can_remove_passkey: security.passkey_count > 0 && can_remove_last_passkey(&security),
        can_enable_totp: !security.totp_enabled,
        can_disable_totp: security.totp_enabled && !security.mfa_required,
    }))
}

/// GET /identity/token/me — Bearer-auth version of get_me for candycloud-api proxy
async fn get_me_bearer(req: HttpRequest, state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;

    let repo = IdentityRepository::new(state.db.clone());
    let service = IdentityService::new(repo);

    let user = service.get_my_profile(session.user_id).await?;

    Ok(HttpResponse::Ok().json(user))
}

/// GET /identity/token/audit-logs — Bearer-auth version of list_my_audit_logs
async fn list_my_audit_logs_bearer(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<MyAuditLogQuery>,
) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;

    let (page, page_size, date_from, date_to) = validated_audit_log_pagination(&query)?;
    let offset = (page - 1) * page_size;

    #[derive(serde::Serialize, sqlx::FromRow)]
    struct MyAuditLog {
        id: i64,
        actor_user_id: Option<uuid::Uuid>,
        actor_email: Option<String>,
        action: String,
        target_type: String,
        target_id: Option<String>,
        ip: Option<String>,
        user_agent: Option<String>,
        metadata: serde_json::Value,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    let total: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM audit_logs al
           WHERE al.actor_user_id = $1
             AND ($2::date IS NULL OR al.created_at >= $2::date)
             AND ($3::date IS NULL OR al.created_at < ($3::date + interval '1 day'))"#
    )
    .bind(session.user_id)
    .bind(&date_from)
    .bind(&date_to)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to count personal audit log entries: {}", e)))?;

    let logs = sqlx::query_as::<_, MyAuditLog>(
        r#"
        SELECT al.id, al.actor_user_id, ue.email AS actor_email,
               al.action, al.target_type, al.target_id, al.ip::text, al.user_agent, al.metadata, al.created_at
        FROM audit_logs al
        LEFT JOIN user_emails ue ON ue.user_id = al.actor_user_id AND ue.is_primary = true
        WHERE al.actor_user_id = $1
          AND ($2::date IS NULL OR al.created_at >= $2::date)
          AND ($3::date IS NULL OR al.created_at < ($3::date + interval '1 day'))
        ORDER BY al.created_at DESC
        LIMIT $4 OFFSET $5
        "#
    )
    .bind(session.user_id)
    .bind(&date_from)
    .bind(&date_to)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to fetch personal audit logs: {}", e)))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "items": logs,
        "total": total,
        "page": page,
        "page_size": page_size,
    })))
}

/// Retrieve the active user's current identity profile
#[utoipa::path(
    get,
    path = "/v1/identity/me",
    tag = "browser",
    security(("session_cookie" = [])),
    responses(
        (status = 200, description = "The signed-in user's profile"),
        (status = 401, description = "No valid session cookie"),
    ),
)]
pub async fn get_me(req: HttpRequest, state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;

    let repo = IdentityRepository::new(state.db.clone());
    let service = IdentityService::new(repo);

    let user = service.get_my_profile(session.user_id).await?;

    Ok(HttpResponse::Ok().json(user))
}

/// Update the active user's identity profile
#[utoipa::path(
    patch,
    path = "/v1/identity/me/profile",
    tag = "browser",
    request_body = UpdateProfileRequest,
    security(("session_cookie" = [])),
    responses(
        (status = 200, description = "Updated profile"),
        (status = 400, description = "Validation error"),
        (status = 401, description = "No valid session cookie"),
    ),
)]
pub async fn update_me(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdateProfileRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;

    if let Some(ref name) = body.display_name {
        if name.len() > 100 {
            return Err(AppError::Validation("Display name must be 100 characters or fewer.".into()));
        }
    }
    if let Some(ref url) = body.avatar_url {
        if url.len() > 2048 {
            return Err(AppError::Validation("Avatar URL must be 2048 characters or fewer.".into()));
        }
        // Must be a relative path or an absolute https URL
        if !url.starts_with('/') {
            let parsed = Url::parse(url)
                .map_err(|_| AppError::Validation("Avatar URL is not a valid URL.".into()))?;
            if parsed.scheme() != "https" {
                return Err(AppError::Validation("Avatar URL must use HTTPS.".into()));
            }
        }
    }

    let repo = IdentityRepository::new(state.db.clone());
    let service = IdentityService::new(repo);

    let updated_user = service
        .update_my_profile(session.user_id, body.display_name.clone(), body.avatar_url.clone())
        .await?;

    let mut changed_fields = serde_json::Map::new();
    if body.display_name.is_some() { changed_fields.insert("display_name".into(), serde_json::Value::Bool(true)); }
    if body.avatar_url.is_some()   { changed_fields.insert("avatar_url".into(), serde_json::Value::Bool(true)); }

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(session.user_id),
        organization_id: session.current_org_id,
        action: "identity.profile.updated".into(),
        target_type: "user".into(),
        target_id: Some(session.user_id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({ "fields": changed_fields }),
    }).await;

    Ok(HttpResponse::Ok().json(updated_user))
}

/// PATCH /identity/token/profile — Bearer-auth version of update_me
async fn update_me_bearer(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdateProfileRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;

    if let Some(ref name) = body.display_name {
        if name.len() > 100 {
            return Err(AppError::Validation("Display name must be 100 characters or fewer.".into()));
        }
    }
    if let Some(ref url) = body.avatar_url {
        if url.len() > 2048 {
            return Err(AppError::Validation("Avatar URL must be 2048 characters or fewer.".into()));
        }
        if !url.starts_with('/') {
            let parsed = Url::parse(url)
                .map_err(|_| AppError::Validation("Avatar URL is not a valid URL.".into()))?;
            if parsed.scheme() != "https" {
                return Err(AppError::Validation("Avatar URL must use HTTPS.".into()));
            }
        }
    }

    let repo = IdentityRepository::new(state.db.clone());
    let service = IdentityService::new(repo);

    let updated_user = service
        .update_my_profile(session.user_id, body.display_name.clone(), body.avatar_url.clone())
        .await?;

    let mut changed_fields = serde_json::Map::new();
    if body.display_name.is_some() { changed_fields.insert("display_name".into(), serde_json::Value::Bool(true)); }
    if body.avatar_url.is_some()   { changed_fields.insert("avatar_url".into(), serde_json::Value::Bool(true)); }

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(session.user_id),
        organization_id: session.current_org_id,
        action: "identity.profile.updated".into(),
        target_type: "user".into(),
        target_id: Some(session.user_id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({ "fields": changed_fields }),
    }).await;

    Ok(HttpResponse::Ok().json(updated_user))
}

fn avatar_filename_ext(filename: Option<&str>, content_type: Option<&mime::Mime>) -> &'static str {
    let from_name = filename
        .and_then(|value| Path::new(value).extension().and_then(|ext| ext.to_str()))
        .map(|value| value.trim().to_ascii_lowercase());

    match from_name.as_deref() {
        Some("png") => "png",
        Some("jpg") | Some("jpeg") => "jpg",
        Some("webp") => "webp",
        Some("gif") => "gif",
        Some("svg") => "svg",
        _ => match content_type.map(|value| value.essence_str()) {
            Some("image/png") => "png",
            Some("image/jpeg") => "jpg",
            Some("image/webp") => "webp",
            Some("image/gif") => "gif",
            Some("image/svg+xml") => "svg",
            _ => "bin",
        },
    }
}

fn validate_avatar_upload_part(
    field_name: Option<&str>,
    file_name: Option<&str>,
    content_type: Option<&mime::Mime>,
) -> Result<&'static str, AppError> {
    if field_name != Some("file") {
        return Err(AppError::Validation("Avatar upload must contain exactly one multipart field named 'file'.".into()));
    }

    let content_type_value = content_type
        .map(|value| value.essence_str())
        .ok_or_else(|| AppError::Validation("Avatar upload must include an image Content-Type.".into()))?;

    match content_type_value {
        "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/svg+xml" => {}
        _ => return Err(AppError::Validation("Unsupported image Content-Type. Use PNG, JPG, WEBP, GIF, or SVG.".into())),
    }

    let ext = avatar_filename_ext(file_name, content_type);
    if ext == "bin" {
        return Err(AppError::Validation("Unsupported image format. Use PNG, JPG, WEBP, GIF, or SVG.".into()));
    }

    Ok(ext)
}

async fn upload_avatar(
    req: HttpRequest,
    state: web::Data<AppState>,
    mut payload: Multipart,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let max_bytes = state.config.server.max_logo_bytes;
    let mut image: Option<(Vec<u8>, Option<mime::Mime>, &'static str)> = None;

    while let Some(mut field) = payload
        .try_next()
        .await
        .map_err(|e| AppError::Validation(format!("Invalid upload payload: {}", e)))?
    {
        if image.is_some() {
            return Err(AppError::Validation("Avatar upload must contain exactly one image file.".into()));
        }

        let field_name = field
            .content_disposition()
            .and_then(|value| value.get_name())
            .map(str::to_string);
        let content_type = field.content_type().cloned();
        let file_name = field
            .content_disposition()
            .and_then(|value| value.get_filename())
            .map(str::to_string);
        let ext = validate_avatar_upload_part(field_name.as_deref(), file_name.as_deref(), content_type.as_ref())?;

        let mut bytes = Vec::new();
        while let Some(chunk) = field
            .try_next()
            .await
            .map_err(|e| AppError::Validation(format!("Could not read uploaded file: {}", e)))?
        {
            if bytes.len() + chunk.len() > max_bytes {
                let mb = (max_bytes / (1024 * 1024)).max(1);
                return Err(AppError::Validation(format!("Image is too large. Maximum size is {}MB.", mb)));
            }
            bytes.extend_from_slice(&chunk);
        }

        if bytes.is_empty() {
            return Err(AppError::Validation("Uploaded image file is empty.".into()));
        }

        image = Some((bytes, content_type, ext));
    }

    let (bytes, content_type, ext) = image
        .ok_or_else(|| AppError::Validation("No image file was uploaded.".into()))?;

    let relative_path = format!("uploads/users/{}/avatar/{}.{}", session.user_id, Uuid::new_v4(), ext);
    let url = store_public_asset(
        &state.db,
        state.config.as_ref(),
        &relative_path,
        &bytes,
        content_type.as_ref().map(|value| value.essence_str()),
    )
    .await?;
    let repo = IdentityRepository::new(state.db.clone());

    // Delete old avatar file from disk before saving new URL
    if let Ok(current_user) = repo.get_user_by_id(session.user_id).await {
        if let Some(old_url) = current_user.avatar_url {
            let _ = delete_public_asset(&state.db, state.config.as_ref(), &old_url).await;
        }
    }

    let service = IdentityService::new(repo);
    let updated_user = service
        .update_my_profile(session.user_id, None, Some(url.clone()))
        .await?;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(session.user_id),
        organization_id: session.current_org_id,
        action: "identity.profile.avatar_uploaded".into(),
        target_type: "user".into(),
        target_id: Some(session.user_id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({
            "avatar_url": url,
        }),
    }).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "url": url,
        "user": updated_user
    })))
}

async fn list_sessions(req: HttpRequest, state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    list_sessions_for_actor(&state, &session).await
}

async fn revoke_all_sessions(req: HttpRequest, state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    revoke_all_sessions_for_actor(&req, &state, &session).await
}

async fn revoke_session(req: HttpRequest, state: web::Data<AppState>, path: web::Path<Uuid>) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    revoke_one_session_for_actor(&state, &session, path.into_inner()).await
}

fn extract_bearer_token(req: &HttpRequest) -> Result<&str, AppError> {
    let header = req
        .headers()
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .ok_or(AppError::Unauthorized)?;

    header
        .strip_prefix("Bearer ")
        .or_else(|| header.strip_prefix("bearer "))
        .ok_or(AppError::Unauthorized)
}

async fn extract_bearer_self_session(
    req: &HttpRequest,
    state: &web::Data<AppState>,
) -> Result<ActiveSession, AppError> {
    let token = extract_bearer_token(req)?;
    let runtime_config = load_runtime_app_config(state.get_ref()).await?;
    let oidc_service = OIDCService::new(state.db.clone(), std::sync::Arc::new(runtime_config));
    let claims = oidc_service.validate_access_token(token)?;
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    let session_id = Uuid::parse_str(&claims.sid).map_err(|_| AppError::Unauthorized)?;

    let session_repo = SessionRepository::new(state.db.clone());
    let (session, is_superuser) = session_repo.get_valid_session(session_id).await?;
    if session.user_id != user_id {
        return Err(AppError::Unauthorized);
    }

    Ok(ActiveSession {
        session_id: session.id,
        user_id: session.user_id,
        current_org_id: session.current_org_id,
        login_surface: session.login_surface,
        is_superuser,
        created_at: session.created_at,
        last_seen_at: session.last_seen_at,
        session_fingerprint: session.session_fingerprint,
    })
}

async fn list_sessions_for_actor(
    state: &web::Data<AppState>,
    session: &ActiveSession,
) -> Result<HttpResponse, AppError> {
    tracing::info!("Listing sessions for user {}", session.user_id);

    let session_repo = SessionRepository::new(state.db.clone());
    let sessions = session_repo.get_sessions_by_user_id(session.user_id).await?;

    let viewable_sessions: Vec<serde_json::Value> = sessions
        .into_iter()
        .map(|s| {
            serde_json::json!({
                "id": s.id,
                "current_org_id": s.current_org_id,
                "login_app_name": s.login_app_name,
                "login_workspace_slug": s.login_workspace_slug,
                "user_agent": s.user_agent,
                "ip": s.ip,
                "created_at": s.created_at,
                "last_seen_at": s.last_seen_at,
                "expires_at": s.expires_at,
                "is_current": s.id == session.session_id,
            })
        })
        .collect();

    Ok(HttpResponse::Ok().json(viewable_sessions))
}

async fn revoke_all_sessions_for_actor(
    req: &HttpRequest,
    state: &web::Data<AppState>,
    session: &ActiveSession,
) -> Result<HttpResponse, AppError> {
    let session_repo = SessionRepository::new(state.db.clone());
    let revoked = session_repo
        .revoke_sessions_by_user_id(session.user_id, Some(session.session_id))
        .await?;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(session.user_id),
        organization_id: session.current_org_id,
        action: "auth.sessions.revoked_all".into(),
        target_type: "session".into(),
        target_id: Some(session.session_id.to_string()),
        ip: client_ip_string_from_http_request(req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({ "revoked_count": revoked }),
    }).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Other active sessions revoked.",
        "revoked_count": revoked
    })))
}

async fn revoke_one_session_for_actor(
    state: &web::Data<AppState>,
    session: &ActiveSession,
    target_session_id: Uuid,
) -> Result<HttpResponse, AppError> {
    tracing::info!("User {} attempting to revoke {}", session.user_id, target_session_id);

    let session_repo = SessionRepository::new(state.db.clone());
    let (target_session, _) = session_repo.get_valid_session(target_session_id).await?;
    if target_session.user_id != session.user_id {
        return Err(AppError::Forbidden("You do not own this session".into()));
    }

    session_repo.revoke_session(target_session_id).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Session locally revoked."
    })))
}

async fn list_sessions_bearer(req: HttpRequest, state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;
    list_sessions_for_actor(&state, &session).await
}

async fn revoke_all_sessions_bearer(req: HttpRequest, state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;
    revoke_all_sessions_for_actor(&req, &state, &session).await
}

async fn revoke_session_bearer(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;
    revoke_one_session_for_actor(&state, &session, path.into_inner()).await
}

async fn get_linked_accounts(req: HttpRequest, state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    get_linked_accounts_for_actor(&state, session.user_id).await
}

async fn get_linked_accounts_for_actor(
    state: &web::Data<AppState>,
    user_id: Uuid,
) -> Result<HttpResponse, AppError> {
    let identity_repo = IdentityRepository::new(state.db.clone());
    let primary_email = identity_repo.get_primary_email_by_user_id(user_id).await?;
    let external_identities = identity_repo.list_external_identities_by_user_id(user_id).await?;
    let passkeys = WebauthnRepository::new(state.db.clone())
        .list_passkeys_by_user_id(user_id)
        .await?;
    let (totp_enabled, _) = MfaService::new(
        MfaRepository::new(state.db.clone()),
        identity_repo.clone(),
        state.config.as_ref().clone(),
    )
    .totp_status(user_id)
    .await?;

    let providers = ["google", "microsoft"]
        .into_iter()
        .map(|provider| {
            let linked = external_identities.iter().find(|identity| identity.provider == provider);
            // A provider is the signup provider if it's linked and the user has no magic-link
            // email — meaning they originally signed up through this OAuth provider.
            let is_signup_provider = linked.is_some() && primary_email.is_none();
            LinkedProviderStatus {
                provider: provider.to_string(),
                linked: linked.is_some(),
                linked_email: linked.and_then(|identity| identity.email.clone()),
                is_signup_provider,
            }
        })
        .collect();

    Ok(HttpResponse::Ok().json(LinkedAccountsResponse {
        primary_email: primary_email.clone(),
        magic_link: LinkedMagicLinkStatus {
            enabled: primary_email.is_some(),
        },
        providers,
        passkeys: passkeys.len(),
        totp_enabled,
    }))
}

async fn get_linked_accounts_bearer(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;
    get_linked_accounts_for_actor(&state, session.user_id).await
}

async fn list_passkeys_bearer(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;
    let service = token_webauthn_service(&state);
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

async fn start_passkey_registration_bearer(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;
    let security = load_actor_security_state(&state, session.user_id, session.current_org_id).await?;
    if !security.passkey_supported {
        return Err(AppError::Validation("Passkeys are not configured on this Rooiam server.".into()));
    }
    if !security.passkey_allowed {
        return Err(AppError::Forbidden("Passkeys are disabled for this workspace.".into()));
    }

    let result = token_webauthn_service(&state).start_registration(session.user_id).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "challenge_id": result.challenge.id,
        "creation_options": {
            "publicKey": result.options.public_key,
        }
    })))
}

async fn finish_passkey_registration_bearer(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<FinishPasskeyRegistrationRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;
    let security = load_actor_security_state(&state, session.user_id, session.current_org_id).await?;
    if !security.passkey_supported {
        return Err(AppError::Validation("Passkeys are not configured on this Rooiam server.".into()));
    }
    if !security.passkey_allowed {
        return Err(AppError::Forbidden("Passkeys are disabled for this workspace.".into()));
    }

    let passkey = token_webauthn_service(&state)
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

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(session.user_id),
        organization_id: session.current_org_id,
        action: "auth.passkey.registered".into(),
        target_type: "passkey".into(),
        target_id: Some(passkey.id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({ "name": passkey.name, "surface": "token_api" }),
    }).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "id": passkey.id,
        "name": passkey.name,
    })))
}

async fn rename_passkey_bearer(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<RenamePasskeyRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;
    let passkey_id = path.into_inner();
    let new_name = body.name.trim().to_string();
    if new_name.is_empty() {
        return Err(AppError::Validation("Passkey name cannot be empty.".into()));
    }
    if new_name.len() > 100 {
        return Err(AppError::Validation("Passkey name is too long (max 100 characters).".into()));
    }

    let service = token_webauthn_service(&state);
    let passkeys = service.list_my_passkeys(session.user_id).await?;
    if !passkeys.iter().any(|p| p.id == passkey_id) {
        return Err(AppError::NotFound("Passkey not found.".into()));
    }

    WebauthnRepository::new(state.db.clone())
        .rename_passkey(passkey_id, session.user_id, &new_name)
        .await?;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(session.user_id),
        organization_id: session.current_org_id,
        action: "auth.passkey.renamed".into(),
        target_type: "passkey".into(),
        target_id: Some(passkey_id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({ "new_name": new_name, "surface": "token_api" }),
    }).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "name": new_name,
    })))
}

async fn delete_passkey_bearer(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;
    let passkey_id = path.into_inner();
    let security = load_actor_security_state(&state, session.user_id, session.current_org_id).await?;
    if security.passkey_count == 0 {
        return Err(AppError::NotFound("Passkey not found.".into()));
    }
    if security.passkey_count == 1 && !can_remove_last_passkey(&security) {
        return Err(AppError::Forbidden(
            "Cannot remove the last usable sign-in method for this account.".into(),
        ));
    }

    token_webauthn_service(&state)
        .delete_my_passkey(session.user_id, passkey_id)
        .await?;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(session.user_id),
        organization_id: session.current_org_id,
        action: "auth.passkey.deleted".into(),
        target_type: "passkey".into(),
        target_id: Some(passkey_id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({ "surface": "token_api" }),
    }).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Passkey deleted."
    })))
}

async fn get_mfa_status_bearer(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;
    let (enabled, remaining) = token_mfa_service(&state).totp_status(session.user_id).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "totp_enabled": enabled,
        "backup_codes_remaining": remaining,
    })))
}

async fn start_totp_enrollment_bearer(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;
    let enrollment = token_mfa_service(&state).start_totp_enrollment(session.user_id).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "challenge_id": enrollment.challenge.id,
        "secret": enrollment.secret,
        "otpauth_uri": enrollment.otpauth_uri,
    })))
}

async fn finish_totp_enrollment_bearer(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<FinishTotpEnrollmentRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;
    let result = token_mfa_service(&state)
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
        metadata: serde_json::json!({ "method": "totp", "surface": "token_api" }),
    }).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "backup_codes": result.codes,
    })))
}

async fn regenerate_backup_codes_bearer(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;
    let result = token_mfa_service(&state).regenerate_backup_codes(session.user_id).await?;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(session.user_id),
        organization_id: session.current_org_id,
        action: "auth.mfa.backup_codes.regenerated".into(),
        target_type: "mfa_method".into(),
        target_id: Some("totp".into()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({ "count": result.remaining, "surface": "token_api" }),
    }).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "codes": result.codes,
        "remaining": result.remaining,
    })))
}

async fn disable_totp_bearer(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;
    let security = load_actor_security_state(&state, session.user_id, session.current_org_id).await?;
    if security.mfa_required {
        return Err(AppError::Forbidden(
            "MFA is required for this workspace, so TOTP cannot be disabled.".into(),
        ));
    }

    let deleted = token_mfa_service(&state).disable_totp(session.user_id).await?;
    let session_repo = SessionRepository::new(state.db.clone());
    let _ = session_repo.revoke_sessions_by_user_id(session.user_id, Some(session.session_id)).await;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(session.user_id),
        organization_id: session.current_org_id,
        action: "auth.mfa.totp.disabled".into(),
        target_type: "mfa_method".into(),
        target_id: Some("totp".into()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({ "disabled": deleted, "other_sessions_revoked": true, "surface": "token_api" }),
    }).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "disabled": deleted,
    })))
}

async fn start_link_provider(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<String>,
    body: web::Json<StartLinkRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    require_recent_admin_reauth(&req, &state, &session).await?;
    start_link_provider_for_actor(
        &req,
        &state,
        &path.into_inner(),
        body.redirect_uri.as_deref(),
        session.user_id,
        session.current_org_id,
    )
    .await
}

async fn start_link_provider_for_actor(
    req: &HttpRequest,
    state: &web::Data<AppState>,
    provider_raw: &str,
    redirect_uri_value: Option<&str>,
    user_id: Uuid,
    _current_org_id: Option<Uuid>,
) -> Result<HttpResponse, AppError> {
    let provider = provider_raw.to_lowercase();
    if provider != "google" && provider != "microsoft" {
        return Err(AppError::Validation("Unsupported provider".into()));
    }

    let redirect_uri = if let Some(value) = redirect_uri_value {
        // If the redirect is a relative path, resolve it against the frontend base URL
        // so the OAuth callback can redirect back to the correct frontend origin.
        if value.starts_with('/') && !value.starts_with("//") {
            let app_url = effective_app_url(&state.db).await?;
            let base = Url::parse(app_url.trim_end_matches('/'))
                .map_err(|e| AppError::Internal(format!("Invalid ROOIAM_APP_URL: {}", e)))?;
            base.join(value)
                .map_err(|_| AppError::Validation("Invalid redirect_uri".into()))?
                .to_string()
        } else {
            value.to_string()
        }
    } else {
        let admin_url = effective_admin_url(&state.db).await?;
        let mut url = Url::parse(&admin_url)
            .map_err(|e| AppError::Internal(format!("Invalid ROOIAM_ADMIN_URL: {}", e)))?;
        url.set_path("/settings");
        url.query_pairs_mut().append_pair("tab", "linked");
        url.to_string()
    };

    let initiated_ip = client_ip_string_from_http_request(&req, state.config.as_ref());
    let initiated_ua = req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from);
    let authorization_url = crate::modules::oauth::handlers::start_oauth_flow(
        state,
        &provider,
        Some(&redirect_uri),
        Some("admin"),
        "link",
        Some(user_id),
        initiated_ip,
        initiated_ua,
        None,
    )
    .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "authorization_url": authorization_url
    })))
}

async fn start_link_provider_bearer(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<String>,
    body: web::Json<StartLinkRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;
    start_link_provider_for_actor(
        &req,
        &state,
        &path.into_inner(),
        body.redirect_uri.as_deref(),
        session.user_id,
        session.current_org_id,
    )
    .await
}

async fn unlink_provider(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    require_recent_admin_reauth(&req, &state, &session).await?;
    unlink_provider_for_actor(&req, &state, &path.into_inner(), session.user_id, session.current_org_id).await
}

async fn unlink_provider_for_actor(
    req: &HttpRequest,
    state: &web::Data<AppState>,
    provider_raw: &str,
    user_id: Uuid,
    current_org_id: Option<Uuid>,
) -> Result<HttpResponse, AppError> {
    let provider = provider_raw.to_lowercase();
    if provider != "google" && provider != "microsoft" {
        return Err(AppError::Validation("Unsupported provider".into()));
    }

    let identity_repo = IdentityRepository::new(state.db.clone());
    let primary_email = identity_repo.get_primary_email_by_user_id(user_id).await?;
    let external_identities = identity_repo.list_external_identities_by_user_id(user_id).await?;
    let passkeys = WebauthnRepository::new(state.db.clone())
        .list_passkeys_by_user_id(user_id)
        .await?;

    let currently_linked = external_identities.iter().any(|identity| identity.provider == provider);
    if !currently_linked {
        return Err(AppError::NotFound(format!("{} is not linked to this account", provider)));
    }

    let remaining_external_providers = external_identities
        .iter()
        .filter(|identity| identity.provider != provider)
        .count();

    let magic_link_available = primary_email.is_some();
    let has_passkey = !passkeys.is_empty();
    if !magic_link_available && remaining_external_providers == 0 && !has_passkey {
        return Err(AppError::Forbidden(
            "Cannot unlink the last usable sign-in method for this account.".into()
        ));
    }

    let deleted = identity_repo
        .delete_external_identity_for_user(user_id, &provider)
        .await?;
    if deleted == 0 {
        return Err(AppError::NotFound(format!("{} is not linked to this account", provider)));
    }

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(user_id),
        organization_id: current_org_id,
        action: format!("identity.unlink.{}", provider),
        target_type: "external_identity".into(),
        target_id: Some(provider.clone()),
        ip: client_ip_string_from_http_request(req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({
            "provider": provider,
            "magic_link_available": magic_link_available,
            "remaining_external_providers": remaining_external_providers,
            "has_passkey": has_passkey,
        }),
    }).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Provider unlinked successfully."
    })))
}

async fn unlink_provider_bearer(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let session = extract_bearer_self_session(&req, &state).await?;
    unlink_provider_for_actor(&req, &state, &path.into_inner(), session.user_id, session.current_org_id).await
}

// ── Email change flow ────────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct RequestEmailChangeRequest {
    new_email: String,
    surface: Option<String>,
}

/// POST /v1/identity/me/email-change/request
/// Sends a verification link to the new email address.
async fn request_email_change(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<RequestEmailChangeRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let new_email = body.new_email.trim().to_lowercase();

    if new_email.is_empty() || !new_email.contains('@') {
        return Err(AppError::Validation("Invalid email address.".into()));
    }

    let identity_repo = IdentityRepository::new(state.db.clone());
    let old_email = identity_repo
        .get_primary_email_by_user_id(session.user_id)
        .await?
        .ok_or_else(|| AppError::Validation("No primary email on this account.".into()))?;

    if new_email == old_email {
        return Err(AppError::Validation("New email is the same as current email.".into()));
    }

    // Block if new email is already in use
    let existing: Option<Uuid> = sqlx::query_scalar(
        "SELECT user_id FROM user_emails WHERE email = $1 LIMIT 1"
    )
    .bind(&new_email)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to check whether the new email is already in use: {}", e)))?;
    if existing.is_some() {
        return Err(AppError::Validation("That email address is already in use.".into()));
    }

    // Generate token
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let raw_token = URL_SAFE_NO_PAD.encode(bytes);
    let token_hash = hex::encode(Sha256::digest(raw_token.as_bytes()));
    let expires_at = Utc::now() + Duration::hours(24);

    // Invalidate any previous pending requests for this user
    sqlx::query("DELETE FROM email_change_tokens WHERE user_id = $1 AND used_at IS NULL")
        .bind(session.user_id)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to clear previous email change requests: {}", e)))?;

    sqlx::query(
        "INSERT INTO email_change_tokens (user_id, old_email, new_email, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(session.user_id)
    .bind(&old_email)
    .bind(&new_email)
    .bind(&token_hash)
    .bind(expires_at)
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to create the email change request: {}", e)))?;

    // Build verification URL
    let verify_url = if body.surface.as_deref() == Some("admin") {
        let admin_url = effective_admin_url(&state.db).await?;
        format!(
            "{}/verify-email?token={}",
            admin_url.trim_end_matches('/'),
            raw_token
        )
    } else {
        let app_url = effective_app_url(&state.db).await
            .unwrap_or_else(|_| "http://localhost:5172".to_string());
        format!(
            "{}/settings/email-change/verify?token={}",
            app_url.trim_end_matches('/'),
            raw_token
        )
    };

    // Send verification email to new address
    crate::infra::email::send_action_email(
        &state.db,
        &new_email,
        "Verify your new email address",
        "Email change verification",
        &format!("Someone requested to change their Rooiam account email to this address ({}).", new_email),
        "Verify email address",
        &verify_url,
    )
    .await
    .map_err(|e| {
        tracing::error!(
            email = %new_email,
            "Failed to send email change verification email: {}",
            e
        );
        AppError::External(
            "We could not send the email-change verification message right now. Please try again.".into(),
        )
    })?;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(session.user_id),
        organization_id: session.current_org_id,
        action: "user.email.change_requested".into(),
        target_type: "user".into(),
        target_id: Some(session.user_id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({ "new_email_domain": new_email.split('@').nth(1).unwrap_or("") }),
    }).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Verification email sent to the new address. Check your inbox and click the link to confirm."
    })))
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct VerifyEmailChangeRequest {
    token: String,
}

/// POST /v1/identity/me/email-change/verify
/// Confirms the email change by consuming the token.
async fn verify_email_change(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<VerifyEmailChangeRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let token_hash = hex::encode(Sha256::digest(body.token.as_bytes()));

    #[derive(sqlx::FromRow)]
    struct EmailChangeRecord {
        id: Uuid,
        user_id: Uuid,
        old_email: String,
        new_email: String,
        expires_at: chrono::DateTime<chrono::Utc>,
        used_at: Option<chrono::DateTime<chrono::Utc>>,
    }

    let record = sqlx::query_as::<_, EmailChangeRecord>(
        r#"
        SELECT id, user_id, old_email, new_email, expires_at, used_at
        FROM email_change_tokens
        WHERE token_hash = $1
        "#
    )
    .bind(&token_hash)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load email change token: {}", e)))?
    .ok_or_else(|| AppError::NotFound("Invalid or expired email change token.".into()))?;

    if record.user_id != session.user_id {
        return Err(AppError::Forbidden("This token belongs to a different account.".into()));
    }
    if record.used_at.is_some() {
        return Err(AppError::Validation("This email change token has already been used.".into()));
    }
    if Utc::now() > record.expires_at {
        return Err(AppError::Validation("This email change token has expired.".into()));
    }

    // Check new email still not taken (could have changed since request)
    let existing: Option<Uuid> = sqlx::query_scalar(
        "SELECT user_id FROM user_emails WHERE email = $1 AND user_id != $2 LIMIT 1"
    )
    .bind(&record.new_email)
    .bind(record.user_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to verify whether the new email is already in use: {}", e)))?;
    if existing.is_some() {
        return Err(AppError::Validation("That email address is now in use by another account.".into()));
    }

    // Commit the email change in a transaction
    let mut tx = state
        .db
        .begin()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to start the email change transaction: {}", e)))?;

    // Update primary email record
    sqlx::query(
        "UPDATE user_emails SET email = $1 WHERE user_id = $2 AND is_primary = true"
    )
    .bind(&record.new_email)
    .bind(record.user_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to update the primary email address: {}", e)))?;

    // Mark token as used
    sqlx::query("UPDATE email_change_tokens SET used_at = NOW() WHERE id = $1")
        .bind(record.id)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to mark the email change token as used: {}", e)))?;

    tx.commit()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to commit the email change: {}", e)))?;

    // Notify old email that it was changed
    let text_body = format!(
        "Your Rooiam account email address has been changed.\n\nOld address: {}\nNew address: {}\n\nIf you did not make this change, contact support immediately.",
        record.old_email, record.new_email
    );
    let html_body = format!(
        "<p>Your Rooiam account email has been changed.</p><p>Old address: <code>{}</code><br/>New address: <code>{}</code></p><p>If you did not make this change, contact support immediately.</p>",
        record.old_email, record.new_email
    );
    let _ = crate::infra::email::send_notification_email(
        &state.db,
        &record.old_email,
        "Your account email address was changed",
        &text_body,
        &html_body,
    ).await.map_err(|e| tracing::warn!("Old-email change notification failed: {}", e));

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(session.user_id),
        organization_id: session.current_org_id,
        action: "user.email.changed".into(),
        target_type: "user".into(),
        target_id: Some(session.user_id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({
            "old_email": record.old_email,
            "new_email": record.new_email,
        }),
    }).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Email address updated successfully.",
        "new_email": record.new_email,
    })))
}

async fn list_my_audit_logs(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<MyAuditLogQuery>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;

    let (page, page_size, date_from, date_to) = validated_audit_log_pagination(&query)?;
    let offset = (page - 1) * page_size;

    #[derive(serde::Serialize, sqlx::FromRow)]
    struct MyAuditLog {
        id: i64,
        actor_user_id: Option<uuid::Uuid>,
        actor_email: Option<String>,
        action: String,
        target_type: String,
        target_id: Option<String>,
        ip: Option<String>,
        user_agent: Option<String>,
        metadata: serde_json::Value,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    // My audit logs = everything I personally did — all action types, just scoped to me as actor.
    let total: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM audit_logs al
           WHERE al.actor_user_id = $1
             AND ($2::date IS NULL OR al.created_at >= $2::date)
             AND ($3::date IS NULL OR al.created_at < ($3::date + interval '1 day'))"#
    )
    .bind(session.user_id)
    .bind(&date_from)
    .bind(&date_to)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to count personal audit log entries: {}", e)))?;

    let logs = sqlx::query_as::<_, MyAuditLog>(
        r#"
        SELECT al.id, al.actor_user_id, ue.email AS actor_email,
               al.action, al.target_type, al.target_id, al.ip::text, al.user_agent, al.metadata, al.created_at
        FROM audit_logs al
        LEFT JOIN user_emails ue ON ue.user_id = al.actor_user_id AND ue.is_primary = true
        WHERE al.actor_user_id = $1
          AND ($2::date IS NULL OR al.created_at >= $2::date)
          AND ($3::date IS NULL OR al.created_at < ($3::date + interval '1 day'))
        ORDER BY al.created_at DESC
        LIMIT $4 OFFSET $5
        "#
    )
    .bind(session.user_id)
    .bind(&date_from)
    .bind(&date_to)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load personal audit log entries: {}", e)))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "items": logs,
        "total": total,
        "page": page,
        "page_size": page_size,
    })))
}

/// POST /v1/identity/me/delete/request
/// Step 1: Send a confirmation email before account deletion. Token expires in 1 hour.
async fn request_delete_account(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let user_id = session.user_id;

    // Guard early: cannot delete if last owner of any org
    let last_owner_org: Option<String> = sqlx::query_scalar(
        r#"
        SELECT o.name FROM organizations o
        JOIN organization_members om ON om.organization_id = o.id AND om.user_id = $1 AND om.status = 'active'
        JOIN member_roles mr ON mr.member_id = om.id
        JOIN roles r ON r.id = mr.role_id AND r.code = 'owner'
        WHERE (
            SELECT COUNT(*) FROM organization_members om2
            JOIN member_roles mr2 ON mr2.member_id = om2.id
            JOIN roles r2 ON r2.id = mr2.role_id AND r2.code = 'owner'
            WHERE om2.organization_id = o.id AND om2.status = 'active'
        ) = 1
        LIMIT 1
        "#
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    if let Some(org_name) = last_owner_org {
        return Err(AppError::Validation(format!(
            "You are the last owner of '{}'. Transfer ownership or delete the workspace before deleting your account.",
            org_name
        )));
    }

    let identity_repo = IdentityRepository::new(state.db.clone());
    let email = identity_repo
        .get_primary_email_by_user_id(user_id)
        .await?
        .ok_or_else(|| AppError::Validation("No primary email on this account.".into()))?;

    // Invalidate any previous pending deletion tokens for this user
    sqlx::query("DELETE FROM account_deletion_tokens WHERE user_id = $1 AND used_at IS NULL")
        .bind(user_id)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to clear previous account deletion requests: {}", e)))?;

    // Generate token
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let raw_token = URL_SAFE_NO_PAD.encode(bytes);
    let token_hash = hex::encode(Sha256::digest(raw_token.as_bytes()));
    let expires_at = Utc::now() + Duration::hours(1);

    sqlx::query(
        "INSERT INTO account_deletion_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)"
    )
    .bind(user_id)
    .bind(&token_hash)
    .bind(expires_at)
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to create account deletion request: {}", e)))?;

    let app_url = effective_app_url(&state.db).await
        .unwrap_or_else(|_| "http://localhost:5172".to_string());
    let confirm_url = format!(
        "{}/settings/delete-account/confirm?token={}",
        app_url.trim_end_matches('/'),
        raw_token
    );

    crate::infra::email::send_action_email(
        &state.db,
        &email,
        "Confirm account deletion",
        "Account deletion request",
        "We received a request to permanently delete your account. If you did not request this, you can safely ignore this email — your account will remain active.",
        "Confirm account deletion",
        &confirm_url,
    )
    .await
    .map_err(|e| {
        tracing::error!(
            email = %email,
            "Failed to send account deletion confirmation email: {}",
            e
        );
        AppError::External(
            "We could not send the account deletion confirmation email right now. Please try again.".into(),
        )
    })?;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(user_id),
        organization_id: session.current_org_id,
        action: "user.account.deletion_requested".into(),
        target_type: "user".into(),
        target_id: Some(user_id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({}),
    }).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "A confirmation email has been sent. Click the link in the email to permanently delete your account. The link expires in 1 hour."
    })))
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct ConfirmDeleteAccountRequest {
    token: String,
}

/// DELETE /v1/identity/me/delete/confirm
/// Step 2: Permanently delete the account after email confirmation.
/// Revokes all sessions and OIDC tokens, anonymizes audit logs, removes org
/// memberships, and hard-deletes the user row.
async fn delete_account(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<ConfirmDeleteAccountRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let user_id = session.user_id;

    let token_hash = hex::encode(Sha256::digest(body.token.as_bytes()));

    #[derive(sqlx::FromRow)]
    struct DeletionToken { id: Uuid, user_id: Uuid }

    let token_row: Option<DeletionToken> = sqlx::query_as(
        "SELECT id, user_id FROM account_deletion_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()"
    )
    .bind(&token_hash)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load account deletion token: {}", e)))?;

    let token_row = token_row
        .ok_or_else(|| AppError::NotFound("Invalid or expired confirmation token.".into()))?;

    if token_row.user_id != user_id {
        return Err(AppError::Forbidden("This confirmation token does not belong to your account.".into()));
    }

    // Mark token used before deletion
    sqlx::query("UPDATE account_deletion_tokens SET used_at = NOW() WHERE id = $1")
        .bind(token_row.id)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to mark account deletion token as used: {}", e)))?;

    // Write audit log BEFORE deleting (actor_user_id will be anonymized in the next step)
    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(user_id),
        organization_id: session.current_org_id,
        action: "user.account.deleted".into(),
        target_type: "user".into(),
        target_id: Some(user_id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({}),
    }).await;

    let mut tx = state.db.begin().await?;

    // 1. Revoke all OIDC refresh tokens
    sqlx::query("UPDATE oauth_refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL")
        .bind(user_id).execute(&mut *tx).await?;

    // 2. Revoke all sessions
    sqlx::query("UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL")
        .bind(user_id).execute(&mut *tx).await?;

    // 3. Anonymize audit log entries (preserve the log, scrub the identity)
    sqlx::query("UPDATE audit_logs SET actor_user_id = NULL WHERE actor_user_id = $1")
        .bind(user_id).execute(&mut *tx).await?;

    // 4. Remove from all organizations (cascades member_roles)
    sqlx::query("DELETE FROM organization_members WHERE user_id = $1")
        .bind(user_id).execute(&mut *tx).await?;

    // 5. Delete the user (cascades emails, linked accounts, MFA, passkeys, etc.)
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id).execute(&mut *tx).await?;

    tx.commit().await?;

    let clear_cookie = crate::modules::session::cookie::build_clear_session_cookie(&state.config);
    Ok(HttpResponse::Ok().cookie(clear_cookie).json(serde_json::json!({
        "ok": true,
        "message": "Your account has been permanently deleted.",
    })))
}

pub fn routes(cfg: &mut web::ServiceConfig) {
    // Everything under /me MUST be authenticated with the active opaque session
    cfg.service(
        web::scope("/me")
            .wrap(RequireAuth)
            .route("", web::get().to(get_me))
            .route("/profile", web::patch().to(update_me))
            .route("/avatar/upload", web::post().to(upload_avatar))
            .route("/sessions", web::get().to(list_sessions))
            .route("/sessions/revoke-all", web::post().to(revoke_all_sessions))
            .route("/sessions/{id}", web::delete().to(revoke_session))
            .route("/linked-accounts", web::get().to(get_linked_accounts))
            .route("/linked-accounts/{provider}/start", web::post().to(start_link_provider))
            .route("/linked-accounts/{provider}", web::delete().to(unlink_provider))
            .route("/audit-logs", web::get().to(list_my_audit_logs))
            .route("/email-change/request", web::post().to(request_email_change))
            .route("/email-change/verify", web::post().to(verify_email_change))
            .route("/delete/request", web::post().to(request_delete_account))
            .route("/delete/confirm", web::delete().to(delete_account)),
    )
    .service(
        // ROUTE REGISTRATION RULE:
        // Keep every bearer-auth self-service route under this single `/token` scope.
        //
        // Do NOT add a second sibling `web::scope("/token")` below or elsewhere in this
        // handler module. In Actix, the first matching scope can shadow later sibling
        // scopes with the same prefix, which makes newer routes look "missing" and
        // return 404 even though the handler exists in source.
        //
        // Before adding a new `/token/...` path, check this block first and append the
        // route here instead of creating another `/token` scope.
        web::scope("/token")
            .route("", web::get().to(get_me_bearer))
            .route("/profile", web::patch().to(update_me_bearer))
            .route("/audit-logs", web::get().to(list_my_audit_logs_bearer))
            .route("/security-capabilities", web::get().to(get_security_capabilities_bearer))
            .route("/sessions", web::get().to(list_sessions_bearer))
            .route("/sessions/revoke-all", web::post().to(revoke_all_sessions_bearer))
            .route("/sessions/{id}", web::delete().to(revoke_session_bearer))
            .route("/linked-accounts", web::get().to(get_linked_accounts_bearer))
            .route("/linked-accounts/{provider}/start", web::post().to(start_link_provider_bearer))
            .route("/linked-accounts/{provider}", web::delete().to(unlink_provider_bearer))
            .route("/passkeys", web::get().to(list_passkeys_bearer))
            .route("/passkeys/register/start", web::post().to(start_passkey_registration_bearer))
            .route("/passkeys/register/finish", web::post().to(finish_passkey_registration_bearer))
            .route("/passkeys/{id}", web::patch().to(rename_passkey_bearer))
            .route("/passkeys/{id}", web::delete().to(delete_passkey_bearer))
            .route("/mfa", web::get().to(get_mfa_status_bearer))
            .route("/mfa/totp/start", web::post().to(start_totp_enrollment_bearer))
            .route("/mfa/totp/finish", web::post().to(finish_totp_enrollment_bearer))
            .route("/mfa/recovery-codes/regenerate", web::post().to(regenerate_backup_codes_bearer))
            .route("/mfa/totp", web::delete().to(disable_totp_bearer)),
    );
}
