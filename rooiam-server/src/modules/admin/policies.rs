use actix_web::{web, HttpRequest, HttpResponse};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::bootstrap::state::AppState;
use crate::http::middleware::auth::extract_session;
use crate::modules::admin::access::ensure_platform_staff;
use crate::modules::audit::service::{AuditEvent, AuditService};
use crate::shared::client_policy::{
    load_platform_client_governance,
    save_platform_client_governance,
    PlatformClientGovernance,
};
use crate::shared::error::AppError;
use crate::shared::ip_policy::{
    load_platform_admin_ip_policy,
    load_platform_ip_policy,
    save_platform_admin_ip_policy,
    save_platform_ip_policy,
    PlatformAdminIpPolicy,
    PlatformIpPolicy,
};
use crate::shared::request_ip::client_ip_string_from_http_request;
use crate::shared::tenant_access::{
    load_tenant_access_policy,
    save_tenant_access_policy,
    TenantAccessPolicy,
};
use crate::shared::workspace_governance::{
    load_effective_workspace_app_registration_governance,
    load_platform_workspace_governance,
    load_tenant_workspace_app_registration_governance,
    save_platform_workspace_governance,
    save_tenant_workspace_app_registration_governance,
    PlatformWorkspaceGovernance,
    TenantWorkspaceAppRegistrationGovernance,
    HARD_CAP_ALLOWED_EMBED_ORIGINS_PER_APP,
    HARD_CAP_APPS_PER_WORKSPACE,
    HARD_CAP_REDIRECT_URIS_PER_APP,
    HARD_CAP_WORKSPACES_PER_USER,
};









#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct UpdatePlatformClientGovernanceRequest {
    pub tenant_client_management_enabled: bool,
    pub tenant_web_clients_enabled: bool,
    pub tenant_spa_clients_enabled: bool,
    pub tenant_native_clients_enabled: bool,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct UpdatePlatformIpPolicyRequest {
    pub tenant_ip_policy_editable: bool,
    pub default_allowlist: String,
    pub default_blocklist: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct UpdatePlatformAdminIpPolicyRequest {
    pub allowlist: String,
    pub blocklist: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct UpdatePlatformWorkspaceGovernanceRequest {
    pub max_workspaces_per_user: Option<i32>,
    pub max_apps_per_workspace: Option<i32>,
    pub max_redirect_uris_per_app_default: Option<i32>,
    pub max_redirect_uris_per_app_limit: Option<i32>,
    pub max_allowed_embed_origins_per_app_default: Option<i32>,
    pub max_allowed_embed_origins_per_app_limit: Option<i32>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct UpdateTenantWorkspaceAppGovernanceRequest {
    pub max_redirect_uris_per_app: Option<i32>,
    pub max_allowed_embed_origins_per_app: Option<i32>,
}

#[derive(Serialize)]
pub(super) struct TenantWorkspaceAppGovernanceResponse {
    pub platform_default_max_redirect_uris_per_app: i32,
    pub platform_max_redirect_uris_per_app: i32,
    pub platform_default_max_allowed_embed_origins_per_app: i32,
    pub platform_max_allowed_embed_origins_per_app: i32,
    pub tenant_max_redirect_uris_per_app: Option<i32>,
    pub tenant_max_allowed_embed_origins_per_app: Option<i32>,
    pub effective_max_redirect_uris_per_app: i32,
    pub effective_max_allowed_embed_origins_per_app: i32,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct UpdateTenantAccessPolicyRequest {
    pub allow_magic_link: bool,
    pub allow_google: bool,
    pub allow_microsoft: bool,
    pub allow_passkey: bool,
}

pub(super) async fn get_platform_client_governance(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let policy = load_platform_client_governance(&state.db).await?;
    Ok(HttpResponse::Ok().json(policy))
}

pub(super) async fn update_platform_client_governance(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdatePlatformClientGovernanceRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;

    let policy = PlatformClientGovernance {
        tenant_client_management_enabled: body.tenant_client_management_enabled,
        tenant_web_clients_enabled: body.tenant_web_clients_enabled,
        tenant_spa_clients_enabled: body.tenant_spa_clients_enabled,
        tenant_native_clients_enabled: body.tenant_native_clients_enabled,
    };

    save_platform_client_governance(&state.db, &policy).await?;

    let actor = extract_session(&req)?;
    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(actor.user_id),
        organization_id: None,
        action: "admin.platform.client_governance.updated".into(),
        target_type: "system_setting".into(),
        target_id: Some("client_governance".into()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({
            "tenant_client_management_enabled": policy.tenant_client_management_enabled,
            "tenant_web_clients_enabled": policy.tenant_web_clients_enabled,
            "tenant_spa_clients_enabled": policy.tenant_spa_clients_enabled,
            "tenant_native_clients_enabled": policy.tenant_native_clients_enabled,
        }),
    }).await;

    Ok(HttpResponse::Ok().json(policy))
}

pub(super) async fn get_platform_ip_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let policy = load_platform_ip_policy(&state.db).await?;
    Ok(HttpResponse::Ok().json(policy))
}

pub(super) async fn get_tenant_access_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    Ok(HttpResponse::Ok().json(load_tenant_access_policy(&state.db).await?))
}

pub(super) async fn update_tenant_access_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdateTenantAccessPolicyRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;

    let policy = TenantAccessPolicy {
        allow_magic_link: body.allow_magic_link,
        allow_google: body.allow_google,
        allow_microsoft: body.allow_microsoft,
        allow_passkey: body.allow_passkey,
    };
    save_tenant_access_policy(&state.db, &policy).await?;

    let actor = extract_session(&req)?;
    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(actor.user_id),
        organization_id: None,
        action: "admin.platform.tenant_access_policy.updated".into(),
        target_type: "system_setting".into(),
        target_id: Some("tenant_access_policy".into()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({
            "allow_magic_link": policy.allow_magic_link,
            "allow_google": policy.allow_google,
            "allow_microsoft": policy.allow_microsoft,
            "allow_passkey": policy.allow_passkey,
        }),
    }).await;

    Ok(HttpResponse::Ok().json(load_tenant_access_policy(&state.db).await?))
}

pub(super) async fn update_platform_ip_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdatePlatformIpPolicyRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;

    let policy = PlatformIpPolicy {
        tenant_ip_policy_editable: body.tenant_ip_policy_editable,
        default_allowlist: body.default_allowlist.clone(),
        default_blocklist: body.default_blocklist.clone(),
    };

    save_platform_ip_policy(&state.db, &policy).await?;

    let actor = extract_session(&req)?;
    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(actor.user_id),
        organization_id: None,
        action: "admin.platform.ip_policy.updated".into(),
        target_type: "system_setting".into(),
        target_id: Some("platform_ip_policy".into()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({
            "tenant_ip_policy_editable": policy.tenant_ip_policy_editable,
            "allowlist_count": policy.default_allowlist.len(),
            "blocklist_count": policy.default_blocklist.len(),
        }),
    }).await;

    Ok(HttpResponse::Ok().json(load_platform_ip_policy(&state.db).await?))
}

pub(super) async fn get_platform_admin_ip_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let policy = load_platform_admin_ip_policy(&state.db).await?;
    Ok(HttpResponse::Ok().json(policy))
}

pub(super) async fn update_platform_admin_ip_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdatePlatformAdminIpPolicyRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;

    let policy = PlatformAdminIpPolicy {
        allowlist: body.allowlist.clone(),
        blocklist: body.blocklist.clone(),
    };

    save_platform_admin_ip_policy(&state.db, &policy).await?;

    let actor = extract_session(&req)?;
    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(actor.user_id),
        organization_id: None,
        action: "admin.platform.admin_ip_policy.updated".into(),
        target_type: "system_setting".into(),
        target_id: Some("admin_ip_policy".into()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({
            "allowlist_count": policy.allowlist.len(),
            "blocklist_count": policy.blocklist.len(),
        }),
    }).await;

    Ok(HttpResponse::Ok().json(load_platform_admin_ip_policy(&state.db).await?))
}

pub(super) async fn get_platform_workspace_governance(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    Ok(HttpResponse::Ok().json(load_platform_workspace_governance(&state.db).await?))
}

pub(super) async fn update_platform_workspace_governance(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdatePlatformWorkspaceGovernanceRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;

    let policy = PlatformWorkspaceGovernance {
        max_workspaces_per_user: body.max_workspaces_per_user,
        max_apps_per_workspace: body.max_apps_per_workspace,
        max_redirect_uris_per_app_default: body.max_redirect_uris_per_app_default,
        max_redirect_uris_per_app_limit: body.max_redirect_uris_per_app_limit,
        max_allowed_embed_origins_per_app_default: body.max_allowed_embed_origins_per_app_default,
        max_allowed_embed_origins_per_app_limit: body.max_allowed_embed_origins_per_app_limit,
        hard_cap_workspaces_per_user: HARD_CAP_WORKSPACES_PER_USER,
        hard_cap_apps_per_workspace: HARD_CAP_APPS_PER_WORKSPACE,
        hard_cap_redirect_uris_per_app: HARD_CAP_REDIRECT_URIS_PER_APP,
        hard_cap_allowed_embed_origins_per_app: HARD_CAP_ALLOWED_EMBED_ORIGINS_PER_APP,
    };
    let saved = save_platform_workspace_governance(&state.db, &policy).await?;

    let actor = extract_session(&req)?;
    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(actor.user_id),
        organization_id: None,
        action: "admin.platform.workspace_governance.updated".into(),
        target_type: "system_setting".into(),
        target_id: Some("workspace_governance".into()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({
            "max_workspaces_per_user": policy.max_workspaces_per_user,
            "max_apps_per_workspace": policy.max_apps_per_workspace,
            "max_redirect_uris_per_app_default": policy.max_redirect_uris_per_app_default,
            "max_redirect_uris_per_app_limit": policy.max_redirect_uris_per_app_limit,
            "max_allowed_embed_origins_per_app_default": policy.max_allowed_embed_origins_per_app_default,
            "max_allowed_embed_origins_per_app_limit": policy.max_allowed_embed_origins_per_app_limit,
        }),
    }).await;

    Ok(HttpResponse::Ok().json(saved))
}

pub(super) async fn get_tenant_workspace_app_governance(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let org_id = path.into_inner();

    let exists: Option<bool> = sqlx::query_scalar::<_, bool>("SELECT TRUE FROM organizations WHERE id = $1")
        .bind(org_id)
        .fetch_optional(&state.db)
        .await?;
    if exists.is_none() {
        return Err(AppError::NotFound("Workspace not found.".into()));
    }

    let platform = load_platform_workspace_governance(&state.db).await?;
    let tenant = load_tenant_workspace_app_registration_governance(&state.db, org_id).await?;
    let effective = load_effective_workspace_app_registration_governance(&state.db, org_id).await?;

    Ok(HttpResponse::Ok().json(TenantWorkspaceAppGovernanceResponse {
        platform_default_max_redirect_uris_per_app: platform.effective_default_max_redirect_uris_per_app(),
        platform_max_redirect_uris_per_app: platform.effective_max_redirect_uris_per_app_limit(),
        platform_default_max_allowed_embed_origins_per_app: platform.effective_default_max_allowed_embed_origins_per_app(),
        platform_max_allowed_embed_origins_per_app: platform.effective_max_allowed_embed_origins_per_app_limit(),
        tenant_max_redirect_uris_per_app: tenant.max_redirect_uris_per_app,
        tenant_max_allowed_embed_origins_per_app: tenant.max_allowed_embed_origins_per_app,
        effective_max_redirect_uris_per_app: effective.max_redirect_uris_per_app,
        effective_max_allowed_embed_origins_per_app: effective.max_allowed_embed_origins_per_app,
    }))
}

pub(super) async fn update_tenant_workspace_app_governance(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<UpdateTenantWorkspaceAppGovernanceRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let org_id = path.into_inner();

    let exists: Option<bool> = sqlx::query_scalar::<_, bool>("SELECT TRUE FROM organizations WHERE id = $1")
        .bind(org_id)
        .fetch_optional(&state.db)
        .await?;
    if exists.is_none() {
        return Err(AppError::NotFound("Workspace not found.".into()));
    }

    let tenant = save_tenant_workspace_app_registration_governance(
        &state.db,
        org_id,
        &TenantWorkspaceAppRegistrationGovernance {
            max_redirect_uris_per_app: body.max_redirect_uris_per_app,
            max_allowed_embed_origins_per_app: body.max_allowed_embed_origins_per_app,
        },
    )
    .await?;
    let platform = load_platform_workspace_governance(&state.db).await?;
    let effective = load_effective_workspace_app_registration_governance(&state.db, org_id).await?;

    let actor = extract_session(&req)?;
    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(actor.user_id),
        organization_id: Some(org_id),
        action: "admin.tenant.app_governance.updated".into(),
        target_type: "organization".into(),
        target_id: Some(org_id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({
            "max_redirect_uris_per_app": tenant.max_redirect_uris_per_app,
            "max_allowed_embed_origins_per_app": tenant.max_allowed_embed_origins_per_app,
        }),
    }).await;

    Ok(HttpResponse::Ok().json(TenantWorkspaceAppGovernanceResponse {
        platform_default_max_redirect_uris_per_app: platform.effective_default_max_redirect_uris_per_app(),
        platform_max_redirect_uris_per_app: platform.effective_max_redirect_uris_per_app_limit(),
        platform_default_max_allowed_embed_origins_per_app: platform.effective_default_max_allowed_embed_origins_per_app(),
        platform_max_allowed_embed_origins_per_app: platform.effective_max_allowed_embed_origins_per_app_limit(),
        tenant_max_redirect_uris_per_app: tenant.max_redirect_uris_per_app,
        tenant_max_allowed_embed_origins_per_app: tenant.max_allowed_embed_origins_per_app,
        effective_max_redirect_uris_per_app: effective.max_redirect_uris_per_app,
        effective_max_allowed_embed_origins_per_app: effective.max_allowed_embed_origins_per_app,
    }))
}
