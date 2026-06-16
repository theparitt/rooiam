use actix_multipart::Multipart;
use actix_web::{mime, web, HttpRequest, HttpResponse};
use futures_util::TryStreamExt;
use sha2::Digest as _;
use sqlx::Row;
use std::path::Path;
use url::Url;
use uuid::Uuid;

use super::{
    models::OrganizationActivityItem, repository::OrganizationRepository,
    service::OrganizationService,
};
use crate::bootstrap::state::AppState;
use crate::http::middleware::auth::{extract_session, RequireAuth};
use crate::modules::audit::service::{AuditEvent, AuditService};
use crate::modules::organization::integration::{
    get_workspace_integration_auth_config, get_workspace_integration_branding,
    get_workspace_integration_client_detail, get_workspace_integration_client_secret_metadata,
    get_workspace_integration_info, list_workspace_integration_clients,
    normalize_workspace_api_key_permission_preset, require_workspace_api_key_permission,
    resolve_workspace_api_key_context, workspace_api_key_permissions_for_preset,
    WORKSPACE_KEY_PRESET_WORKSPACE_OWNER,
};
use crate::modules::rbac::{models::Role, repository::RbacRepository, service::RbacService};
use crate::shared::client_policy::{
    effective_client_policy, is_client_type_allowed, load_platform_client_governance,
    load_tenant_client_policy, EffectiveClientPolicy, PlatformClientGovernance, TenantClientPolicy,
};
use crate::shared::demo_seed::{demo_seed_enabled, is_seeded_demo_org_slug};
use crate::shared::error::AppError;
use crate::shared::ip_policy::{
    access_denied_message, evaluate_ip_access, load_platform_ip_policy, load_tenant_ip_policy,
    resolve_effective_ip_policy, save_tenant_ip_policy, EffectiveIpPolicy, PlatformIpPolicy,
    TenantIpPolicy,
};
use crate::shared::oauth_client::{
    generate_client_id, generate_confidential_client_secret,
    normalize_client_allowed_embed_origins_with_limit, normalize_client_redirect_uris_with_limit,
};
use crate::shared::request_ip::client_ip_string_from_http_request;
use crate::shared::storage_config::store_public_asset;
use crate::shared::workspace_governance::{
    load_effective_workspace_app_registration_governance, load_platform_workspace_governance,
};

async fn resolve_workspace_api_owner_user_id(
    org_id: Uuid,
    state: &web::Data<AppState>,
) -> Result<Uuid, AppError> {
    sqlx::query_scalar(
        r#"
        SELECT om.user_id
        FROM organization_members om
        JOIN member_roles mr ON mr.member_id = om.id
        JOIN roles r ON r.id = mr.role_id
        WHERE om.organization_id = $1
          AND om.status = 'active'
          AND r.code = 'owner'
        LIMIT 1
        "#,
    )
    .bind(org_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Failed to resolve workspace owner for API-key management: {}",
            e
        ))
    })?
    .ok_or_else(|| AppError::Validation("Workspace owner not found for API-key management.".into()))
}

#[utoipa::path(
    get,
    path = "/v1/orgs/integrations/members",
    tag = "integrations",
    params(MemberListQuery),
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Paginated workspace members"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the members.read permission"),
    ),
)]
pub async fn list_workspace_integration_members(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<MemberListQuery>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "members.read")?;
    let repo = OrganizationRepository::new(state.db.clone());
    let mut members = repo.get_organization_member_views(ctx.org_id).await?;
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 1000);
    let search = query.q.as_deref().unwrap_or("").trim().to_lowercase();
    if search.len() > 256 {
        return Err(AppError::Validation(
            "Search query is too long (max 256 characters).".into(),
        ));
    }
    let role_filter = query.role.as_deref().unwrap_or("all").trim().to_lowercase();
    let status_filter = query
        .status
        .as_deref()
        .unwrap_or("all")
        .trim()
        .to_lowercase();
    let sort_by = query.sort_by.as_deref().unwrap_or("created_at");
    let sort_order = sort_order_or_error(query.sort_order.as_deref())?;

    members.retain(|member| {
        (status_filter == "all" || member.status.eq_ignore_ascii_case(&status_filter))
            && (role_filter == "all"
                || member
                    .role_codes
                    .iter()
                    .any(|role| role.eq_ignore_ascii_case(&role_filter)))
            && (search.is_empty()
                || member
                    .display_name
                    .as_deref()
                    .unwrap_or("")
                    .to_lowercase()
                    .contains(&search)
                || member
                    .email
                    .as_deref()
                    .unwrap_or("")
                    .to_lowercase()
                    .contains(&search)
                || member
                    .role_codes
                    .iter()
                    .any(|role| role.to_lowercase().contains(&search)))
    });

    match sort_by {
        "display_name" => members.sort_by(|a, b| a.display_name.as_deref().unwrap_or("").to_lowercase().cmp(&b.display_name.as_deref().unwrap_or("").to_lowercase())),
        "email" => members.sort_by(|a, b| a.email.as_deref().unwrap_or("").to_lowercase().cmp(&b.email.as_deref().unwrap_or("").to_lowercase())),
        "status" => members.sort_by(|a, b| a.status.cmp(&b.status)),
        "role" => members.sort_by(|a, b| a.role_codes.join(",").cmp(&b.role_codes.join(","))),
        "created_at" => members.sort_by_key(|member| member.created_at),
        "last_seen_at" => members.sort_by_key(|member| member.last_seen_at),
        _ => return Err(AppError::Validation("sort_by must be one of display_name, email, status, role, created_at, or last_seen_at.".into())),
    }
    if sort_order == "desc" {
        members.reverse();
    }

    let total = members.len() as i64;
    let start = ((page - 1) * page_size) as usize;
    let end = (start + page_size as usize).min(members.len());
    let items = if start >= members.len() {
        vec![]
    } else {
        members[start..end].to_vec()
    };
    Ok(HttpResponse::Ok().json(PaginatedActivityResponse {
        items,
        total,
        page,
        page_size,
    }))
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateWorkspaceIntegrationMemberProfileRequest {
    display_name: Option<String>,
    avatar_url: Option<String>,
}

#[derive(serde::Serialize)]
struct WorkspaceIntegrationMemberSessionEntry {
    id: Uuid,
    user_agent: Option<String>,
    ip: Option<String>,
    last_seen_at: Option<chrono::DateTime<chrono::Utc>>,
    created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(serde::Serialize)]
pub struct WorkspaceIntegrationClientSecretMetadataResponse {
    pub id: Uuid,
    pub client_id: String,
    pub app_name: String,
    pub app_type: String,
    pub status: String,
    pub has_client_secret: bool,
    pub can_rotate_secret: bool,
}

#[derive(serde::Serialize)]
struct WorkspaceIntegrationApiKeyMeResponse {
    workspace_id: Uuid,
    workspace_slug: String,
    workspace_name: String,
    key_label: String,
    key_prefix: String,
    permission_preset: String,
    allowed_permissions: Vec<String>,
}

#[derive(serde::Serialize)]
struct WorkspaceIntegrationPolicySummaryResponse {
    workspace_id: Uuid,
    workspace_slug: String,
    login_methods: Vec<String>,
    mfa_summary: serde_json::Value,
    session_summary: serde_json::Value,
    ip_policy_summary: serde_json::Value,
    client_policy_summary: serde_json::Value,
}

#[derive(serde::Serialize)]
struct WorkspaceIntegrationWidgetPreviewConfigResponse {
    workspace_id: Uuid,
    workspace_slug: String,
    login_display_name: Option<String>,
    login_title: Option<String>,
    login_subtitle: Option<String>,
    icon_url: Option<String>,
    login_logo_url: Option<String>,
    brand_color: Option<String>,
    show_login_logo: bool,
    show_login_title: bool,
    show_login_subtitle: bool,
    show_powered_by: bool,
    widget_radius: String,
    widget_shadow: String,
    icon_container: String,
    login_logo_container: String,
    login_logo_size: String,
    card_radius: String,
    button_style: String,
    card_bg_style: String,
    card_bg_color2: Option<String>,
    card_border_width: String,
    card_border_color: Option<String>,
    login_method_order: Vec<String>,
    enabled_login_methods: Vec<String>,
}

async fn load_workspace_integration_invite_detail(
    state: &web::Data<AppState>,
    org_id: Uuid,
    invite_id: Uuid,
) -> Result<super::models::OrganizationInviteSummary, AppError> {
    sqlx::query_as::<_, super::models::OrganizationInviteSummary>(
        r#"
        SELECT
            oi.id,
            oi.email,
            u.display_name AS inviter_display_name,
            oi.expires_at,
            oi.created_at
        FROM organization_invites oi
        LEFT JOIN users u ON u.id = oi.inviter_user_id
        WHERE oi.organization_id = $1
          AND oi.id = $2
          AND oi.used_at IS NULL
          AND oi.expires_at > NOW()
        LIMIT 1
        "#,
    )
    .bind(org_id)
    .bind(invite_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace invite detail: {}", e)))?
    .ok_or_else(|| AppError::NotFound("Invite not found in this workspace.".into()))
}

#[utoipa::path(
    get,
    path = "/v1/orgs/integrations/members/{member_id}",
    tag = "integrations",
    params(("member_id" = Uuid, Path, description = "Member UUID")),
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Member detail"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the members.read permission"),
        (status = 404, description = "Member not found in this workspace"),
    ),
)]
pub async fn get_workspace_integration_member_detail(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "members.read")?;
    let member_id = path.into_inner();

    let repo = OrganizationRepository::new(state.db.clone());
    let member = repo
        .get_organization_member_views(ctx.org_id)
        .await?
        .into_iter()
        .find(|item| item.id == member_id)
        .ok_or_else(|| AppError::Validation("Member not found in this workspace.".into()))?;

    Ok(HttpResponse::Ok().json(member))
}

#[utoipa::path(
    patch,
    path = "/v1/orgs/integrations/members/{member_id}/profile",
    tag = "integrations",
    params(("member_id" = Uuid, Path, description = "Member UUID")),
    request_body = UpdateWorkspaceIntegrationMemberProfileRequest,
    security(("workspace_api_key" = [])),
    responses((status = 200, description = "Member profile updated"), (status = 400), (status = 401), (status = 403), (status = 404)),
)]
pub async fn update_workspace_integration_member_profile(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<UpdateWorkspaceIntegrationMemberProfileRequest>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "members.profile_update")?;
    let member_id = path.into_inner();

    let display_name = body
        .display_name
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let avatar_url = body
        .avatar_url
        .as_ref()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let target_user_id: Uuid = sqlx::query_scalar(
        "SELECT user_id FROM organization_members WHERE id = $1 AND organization_id = $2",
    )
    .bind(member_id)
    .bind(ctx.org_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to resolve workspace member user ID: {}", e)))?
    .ok_or_else(|| AppError::Validation("Member not found in this workspace.".into()))?;

    sqlx::query(
        "UPDATE users SET display_name = $1, avatar_url = $2, updated_at = NOW() WHERE id = $3",
    )
    .bind(display_name.clone())
    .bind(avatar_url.clone())
    .bind(target_user_id)
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to update workspace member profile: {}", e)))?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: None,
            organization_id: Some(ctx.org_id),
            action: "api_key.workspace.member.profile_updated".into(),
            target_type: "member".into(),
            target_id: Some(member_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "display_name": display_name,
                "avatar_url": avatar_url,
                "key_prefix": ctx.key_prefix,
            }),
        })
        .await;

    get_workspace_integration_member_detail(req, state, web::Path::from(member_id)).await
}

#[utoipa::path(
    get,
    path = "/v1/orgs/integrations/members/{member_id}/sessions",
    tag = "integrations",
    params(("member_id" = Uuid, Path, description = "Member UUID")),
    security(("workspace_api_key" = [])),
    responses((status = 200, description = "Member's active sessions"), (status = 401), (status = 403), (status = 404)),
)]
pub async fn list_workspace_integration_member_sessions(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "members.read")?;
    let member_id = path.into_inner();

    let target_user_id: Uuid = sqlx::query_scalar(
        "SELECT user_id FROM organization_members WHERE id = $1 AND organization_id = $2",
    )
    .bind(member_id)
    .bind(ctx.org_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Failed to resolve workspace member for session listing: {}",
            e
        ))
    })?
    .ok_or_else(|| AppError::Validation("Member not found in this workspace.".into()))?;

    let rows = sqlx::query(
        r#"
        SELECT id, user_agent, ip::text AS ip, last_seen_at, created_at
        FROM sessions
        WHERE user_id = $1
          AND current_org_id = $2
          AND revoked_at IS NULL
          AND expires_at > NOW()
        ORDER BY last_seen_at DESC
        LIMIT 100
        "#,
    )
    .bind(target_user_id)
    .bind(ctx.org_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace member sessions: {}", e)))?;

    use sqlx::Row;
    let sessions = rows
        .iter()
        .map(|row| WorkspaceIntegrationMemberSessionEntry {
            id: row.get("id"),
            user_agent: row.get("user_agent"),
            ip: row.get("ip"),
            last_seen_at: row.get("last_seen_at"),
            created_at: row.get("created_at"),
        })
        .collect::<Vec<_>>();

    Ok(HttpResponse::Ok().json(sessions))
}

#[utoipa::path(
    delete,
    path = "/v1/orgs/integrations/members/{member_id}/sessions",
    tag = "integrations",
    params(("member_id" = Uuid, Path, description = "Member UUID")),
    security(("workspace_api_key" = [])),
    responses((status = 200, description = "Revoked the member's sessions"), (status = 401), (status = 403), (status = 404)),
)]
pub async fn revoke_workspace_integration_member_sessions(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "members.sessions.revoke")?;
    let member_id = path.into_inner();

    let target_user_id: Uuid = sqlx::query_scalar(
        "SELECT user_id FROM organization_members WHERE id = $1 AND organization_id = $2",
    )
    .bind(member_id)
    .bind(ctx.org_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Failed to resolve workspace member for session revocation: {}",
            e
        ))
    })?
    .ok_or_else(|| AppError::Validation("Member not found in this workspace.".into()))?;

    let revoked_count = sqlx::query(
        "UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND current_org_id = $2 AND revoked_at IS NULL AND expires_at > NOW()"
    )
    .bind(target_user_id)
    .bind(ctx.org_id)
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to revoke workspace member sessions: {}", e)))?
    .rows_affected();

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: None,
            organization_id: Some(ctx.org_id),
            action: "api_key.workspace.member.sessions_revoked".into(),
            target_type: "member".into(),
            target_id: Some(member_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "revoked_count": revoked_count,
                "key_prefix": ctx.key_prefix,
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "member_id": member_id,
        "revoked_count": revoked_count,
    })))
}

#[utoipa::path(
    get,
    path = "/v1/orgs/integrations/invites",
    tag = "integrations",
    params(InviteListQuery),
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Paginated pending workspace invites"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the invites.read permission"),
    ),
)]
pub async fn list_workspace_integration_invites(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<InviteListQuery>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "invites.read")?;
    let repo = OrganizationRepository::new(state.db.clone());
    let mut invites = repo.list_pending_invites(ctx.org_id).await?;
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 1000);
    let search = query.q.as_deref().unwrap_or("").trim().to_lowercase();
    if search.len() > 256 {
        return Err(AppError::Validation(
            "Search query is too long (max 256 characters).".into(),
        ));
    }
    let sort_by = query.sort_by.as_deref().unwrap_or("created_at");
    let sort_order = sort_order_or_error(query.sort_order.as_deref())?;

    invites.retain(|invite| {
        search.is_empty()
            || invite.email.to_lowercase().contains(&search)
            || invite
                .inviter_display_name
                .as_deref()
                .unwrap_or("")
                .to_lowercase()
                .contains(&search)
    });

    match sort_by {
        "email" => invites.sort_by(|a, b| a.email.to_lowercase().cmp(&b.email.to_lowercase())),
        "created_at" => invites.sort_by_key(|invite| invite.created_at),
        "expires_at" => invites.sort_by_key(|invite| invite.expires_at),
        _ => {
            return Err(AppError::Validation(
                "sort_by must be one of email, created_at, or expires_at.".into(),
            ))
        }
    }
    if sort_order == "desc" {
        invites.reverse();
    }

    let total = invites.len() as i64;
    let start = ((page - 1) * page_size) as usize;
    let end = (start + page_size as usize).min(invites.len());
    let items = if start >= invites.len() {
        vec![]
    } else {
        invites[start..end].to_vec()
    };
    Ok(HttpResponse::Ok().json(PaginatedActivityResponse {
        items,
        total,
        page,
        page_size,
    }))
}

#[utoipa::path(
    get,
    path = "/v1/orgs/integrations/invites/{invite_id}",
    tag = "integrations",
    params(("invite_id" = Uuid, Path, description = "Invite UUID")),
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Invite detail"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the invites.read permission"),
        (status = 404, description = "Invite not found in this workspace"),
    ),
)]
pub async fn get_workspace_integration_invite_detail(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<InvitePath>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "invites.read")?;
    let invite =
        load_workspace_integration_invite_detail(&state, ctx.org_id, path.into_inner().invite_id)
            .await?;
    Ok(HttpResponse::Ok().json(invite))
}

#[utoipa::path(
    get,
    path = "/v1/orgs/integrations/activity",
    tag = "integrations",
    params(ActivityQuery),
    security(("workspace_api_key" = [])),
    responses((status = 200, description = "Workspace activity (audit) log"), (status = 401), (status = 403)),
)]
pub async fn list_workspace_integration_activity(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<ActivityQuery>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "activity.read")?;
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 1000);
    let search_raw = query
        .q
        .as_deref()
        .or(query.search.as_deref())
        .unwrap_or("")
        .trim();
    if search_raw.len() > 256 {
        return Err(AppError::Validation(
            "Search query is too long (max 256 characters).".into(),
        ));
    }
    let search = search_raw.to_lowercase();
    let action_filter = query
        .action
        .as_deref()
        .unwrap_or("all")
        .trim()
        .to_lowercase();
    let date_from = query
        .date_from
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let date_to = query
        .date_to
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let repo = OrganizationRepository::new(state.db.clone());
    let (items, total) = repo
        .get_organization_activity(
            ctx.org_id,
            page,
            page_size,
            &search,
            &action_filter,
            date_from.as_deref(),
            date_to.as_deref(),
        )
        .await?;

    let sort_by = query.sort_by.as_deref().unwrap_or("created_at");
    let sort_order = sort_order_or_error(query.sort_order.as_deref())?;
    let mut items = items
        .into_iter()
        .map(|item| TenantActivityResponse {
            id: item.id,
            actor_user_id: item.actor_user_id,
            actor_display_name: item.actor_display_name,
            actor_email: item.actor_email,
            action: item.action,
            target_type: item.target_type,
            target_id: item.target_id,
            ip: item.ip,
            metadata: item.metadata,
            created_at: item.created_at,
        })
        .collect::<Vec<_>>();

    match sort_by {
        "created_at" => items.sort_by_key(|item| item.created_at.clone()),
        "action" => items.sort_by(|a, b| a.action.cmp(&b.action)),
        "actor" => items.sort_by(|a, b| {
            a.actor_display_name
                .as_deref()
                .unwrap_or("")
                .to_lowercase()
                .cmp(&b.actor_display_name.as_deref().unwrap_or("").to_lowercase())
        }),
        _ => {
            return Err(AppError::Validation(
                "sort_by must be one of created_at, action, or actor.".into(),
            ))
        }
    }
    if sort_order == "desc" {
        items.reverse();
    }

    Ok(HttpResponse::Ok().json(PaginatedActivityResponse {
        items,
        total,
        page,
        page_size,
    }))
}

#[utoipa::path(
    get,
    path = "/v1/orgs/integrations/members/{member_id}/activity",
    tag = "integrations",
    params(("member_id" = Uuid, Path, description = "Member UUID"), ActivityQuery),
    security(("workspace_api_key" = [])),
    responses((status = 200, description = "Member activity (audit) log"), (status = 401), (status = 403), (status = 404)),
)]
pub async fn list_workspace_integration_member_activity(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    query: web::Query<ActivityQuery>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "activity.read")?;
    let member_id = path.into_inner();

    let target_user_id: Uuid = sqlx::query_scalar(
        "SELECT user_id FROM organization_members WHERE id = $1 AND organization_id = $2",
    )
    .bind(member_id)
    .bind(ctx.org_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Failed to resolve workspace member for activity lookup: {}",
            e
        ))
    })?
    .ok_or_else(|| AppError::Validation("Member not found in this workspace.".into()))?;

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 1000);
    let offset = (page - 1) * page_size;

    let total: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM audit_logs
        WHERE organization_id = $1
          AND (
            actor_user_id = $2
            OR target_id = $3
            OR metadata->>'member_id' = $3
            OR metadata->>'user_id' = $4
          )
        "#,
    )
    .bind(ctx.org_id)
    .bind(target_user_id)
    .bind(member_id.to_string())
    .bind(target_user_id.to_string())
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Failed to count workspace member activity entries: {}",
            e
        ))
    })?;

    let mut items = sqlx::query_as::<_, OrganizationActivityItem>(
        r#"
        SELECT
            al.id,
            al.actor_user_id,
            u.display_name AS actor_display_name,
            ue.email AS actor_email,
            al.action,
            al.target_type,
            al.target_id,
            al.ip::text AS ip,
            al.user_agent,
            al.metadata,
            al.created_at
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
        WHERE al.organization_id = $1
          AND (
            al.actor_user_id = $2
            OR al.target_id = $3
            OR al.metadata->>'member_id' = $3
            OR al.metadata->>'user_id' = $4
          )
        ORDER BY al.created_at DESC
        LIMIT $5 OFFSET $6
        "#,
    )
    .bind(ctx.org_id)
    .bind(target_user_id)
    .bind(member_id.to_string())
    .bind(target_user_id.to_string())
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Failed to load workspace member activity entries: {}",
            e
        ))
    })?;

    let sort_by = query.sort_by.as_deref().unwrap_or("created_at");
    let sort_order = sort_order_or_error(query.sort_order.as_deref())?;
    match sort_by {
        "created_at" => items.sort_by_key(|item| item.created_at),
        "action" => items.sort_by(|a, b| a.action.cmp(&b.action)),
        _ => {
            return Err(AppError::Validation(
                "sort_by must be one of created_at or action.".into(),
            ))
        }
    }
    if sort_order == "desc" {
        items.reverse();
    }

    Ok(HttpResponse::Ok().json(PaginatedActivityResponse {
        items: items
            .into_iter()
            .map(|item| TenantActivityResponse {
                id: item.id,
                actor_user_id: item.actor_user_id,
                actor_display_name: item.actor_display_name,
                actor_email: item.actor_email,
                action: item.action,
                target_type: item.target_type,
                target_id: item.target_id,
                ip: item.ip,
                metadata: item.metadata,
                created_at: item.created_at,
            })
            .collect(),
        total,
        page,
        page_size,
    }))
}

#[utoipa::path(
    get,
    path = "/v1/orgs/integrations/effective-policy",
    tag = "integrations",
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Effective auth/security policy for this workspace"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the effective_policy.read permission"),
    ),
)]
pub async fn get_workspace_integration_effective_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "effective_policy.read")?;

    #[derive(sqlx::FromRow)]
    struct OrgPolicyRow {
        allow_magic_link: bool,
        allow_google: bool,
        allow_microsoft: bool,
        allow_passkey: bool,
        require_mfa: bool,
        require_mfa_for_admins: bool,
        tenant_portal_require_mfa: bool,
        allowed_email_domains: Option<String>,
        max_session_age_hours: Option<i32>,
        magic_link_expiry_minutes: Option<i32>,
        oidc_access_token_ttl_minutes: Option<i32>,
        refresh_token_ttl_days: Option<i32>,
        idle_timeout_minutes: Option<i32>,
        max_concurrent_sessions: Option<i32>,
        status: String,
        platform_locked: bool,
    }

    let org = sqlx::query_as::<_, OrgPolicyRow>(
        r#"
        SELECT
            allow_magic_link, allow_google, allow_microsoft, allow_passkey,
            require_mfa, require_mfa_for_admins, tenant_portal_require_mfa,
            allowed_email_domains, max_session_age_hours, magic_link_expiry_minutes,
            oidc_access_token_ttl_minutes, refresh_token_ttl_days, idle_timeout_minutes,
            max_concurrent_sessions,
            status, platform_locked
        FROM organizations WHERE id = $1
        "#,
    )
    .bind(ctx.org_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace effective policy: {}", e)))?;

    async fn session_setting(db: &sqlx::PgPool, key: &str, default: i64) -> i64 {
        sqlx::query_scalar::<_, i64>("SELECT value::bigint FROM system_settings WHERE key = $1")
            .bind(key)
            .fetch_optional(db)
            .await
            .ok()
            .flatten()
            .unwrap_or(default)
    }

    let platform_session_duration_days =
        session_setting(&state.db, "session_duration_days", 7).await;
    let platform_magic_link_expiry_minutes =
        session_setting(&state.db, "magic_link_expiry_minutes", 15).await as i32;
    let platform_oidc_access_token_ttl_minutes =
        session_setting(&state.db, "oidc_access_token_ttl_minutes", 60).await as i32;
    let platform_refresh_token_ttl_days =
        session_setting(&state.db, "refresh_token_ttl_days", 30).await as i32;
    let platform_idle_timeout_minutes =
        session_setting(&state.db, "idle_timeout_minutes", 0).await as i32;
    let effective_max_session_age_hours = org
        .max_session_age_hours
        .unwrap_or((platform_session_duration_days as i32) * 24);

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "organization_id": ctx.org_id,
        "auth_policy": {
            "allow_magic_link": org.allow_magic_link,
            "allow_google": org.allow_google,
            "allow_microsoft": org.allow_microsoft,
            "allow_passkey": org.allow_passkey,
            "require_mfa": org.require_mfa,
            "require_mfa_for_admins": org.require_mfa_for_admins,
            "tenant_portal_require_mfa": org.tenant_portal_require_mfa,
            "allowed_email_domains": org.allowed_email_domains,
            "max_session_age_hours": effective_max_session_age_hours,
            "max_session_age_hours_workspace_override": org.max_session_age_hours,
            "max_session_age_hours_source": if org.max_session_age_hours.is_some() { "workspace" } else { "platform_default" },
            "max_concurrent_sessions": org.max_concurrent_sessions,
            "max_concurrent_sessions_source": if org.max_concurrent_sessions.is_some() { "workspace" } else { "unlimited_default" },
            "magic_link_expiry_minutes": org.magic_link_expiry_minutes.unwrap_or(platform_magic_link_expiry_minutes),
            "magic_link_expiry_minutes_workspace_override": org.magic_link_expiry_minutes,
            "magic_link_expiry_minutes_source": if org.magic_link_expiry_minutes.is_some() { "workspace" } else { "platform_default" },
            "oidc_access_token_ttl_minutes": org.oidc_access_token_ttl_minutes.unwrap_or(platform_oidc_access_token_ttl_minutes),
            "oidc_access_token_ttl_minutes_workspace_override": org.oidc_access_token_ttl_minutes,
            "oidc_access_token_ttl_minutes_source": if org.oidc_access_token_ttl_minutes.is_some() { "workspace" } else { "platform_default" },
            "refresh_token_ttl_days": org.refresh_token_ttl_days.unwrap_or(platform_refresh_token_ttl_days),
            "refresh_token_ttl_days_workspace_override": org.refresh_token_ttl_days,
            "refresh_token_ttl_days_source": if org.refresh_token_ttl_days.is_some() { "workspace" } else { "platform_default" },
            "idle_timeout_minutes": org.idle_timeout_minutes.unwrap_or(platform_idle_timeout_minutes),
            "idle_timeout_minutes_workspace_override": org.idle_timeout_minutes,
            "idle_timeout_minutes_source": if org.idle_timeout_minutes.is_some() { "workspace" } else { "platform_default" },
        },
        "workspace_status": {
            "status": org.status,
            "platform_locked": org.platform_locked,
        },
        "ip_policy": load_tenant_ip_policy(&state.db, ctx.org_id).await.ok(),
        "client_policy": load_tenant_client_policy(&state.db, ctx.org_id).await.ok(),
    })))
}

#[utoipa::path(
    get,
    path = "/v1/orgs/integrations/policy-summary",
    tag = "integrations",
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Human-readable summary of enabled login methods + policy"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the effective_policy.read permission"),
    ),
)]
pub async fn get_workspace_integration_policy_summary(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "effective_policy.read")?;

    let org = sqlx::query(
        r#"
        SELECT
            allow_magic_link, allow_google, allow_microsoft, allow_passkey,
            require_mfa, require_mfa_for_admins, tenant_portal_require_mfa,
            max_session_age_hours, max_concurrent_sessions,
            status, platform_locked
        FROM organizations WHERE id = $1
        "#,
    )
    .bind(ctx.org_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace policy summary: {}", e)))?;

    let mut login_methods = Vec::new();
    if org.try_get::<bool, _>("allow_magic_link").map_err(|e| {
        AppError::Internal(format!(
            "Workspace policy summary is missing allow_magic_link: {}",
            e
        ))
    })? {
        login_methods.push("magic_link".to_string());
    }
    if org.try_get::<bool, _>("allow_google").map_err(|e| {
        AppError::Internal(format!(
            "Workspace policy summary is missing allow_google: {}",
            e
        ))
    })? {
        login_methods.push("google".to_string());
    }
    if org.try_get::<bool, _>("allow_microsoft").map_err(|e| {
        AppError::Internal(format!(
            "Workspace policy summary is missing allow_microsoft: {}",
            e
        ))
    })? {
        login_methods.push("microsoft".to_string());
    }
    if org.try_get::<bool, _>("allow_passkey").map_err(|e| {
        AppError::Internal(format!(
            "Workspace policy summary is missing allow_passkey: {}",
            e
        ))
    })? {
        login_methods.push("passkey".to_string());
    }

    let ip_policy = load_tenant_ip_policy(&state.db, ctx.org_id).await.ok();
    let client_policy = load_tenant_client_policy(&state.db, ctx.org_id).await.ok();
    async fn session_setting(db: &sqlx::PgPool, key: &str, default: i64) -> i64 {
        sqlx::query_scalar::<_, i64>("SELECT value::bigint FROM system_settings WHERE key = $1")
            .bind(key)
            .fetch_optional(db)
            .await
            .ok()
            .flatten()
            .unwrap_or(default)
    }

    let platform_session_duration_days =
        session_setting(&state.db, "session_duration_days", 7).await;
    let raw_max_session_age_hours = org
        .try_get::<Option<i32>, _>("max_session_age_hours")
        .map_err(|e| {
            AppError::Internal(format!(
                "Workspace policy summary is missing max_session_age_hours: {}",
                e
            ))
        })?;
    let raw_max_concurrent_sessions = org
        .try_get::<Option<i32>, _>("max_concurrent_sessions")
        .map_err(|e| {
            AppError::Internal(format!(
                "Workspace policy summary is missing max_concurrent_sessions: {}",
                e
            ))
        })?;
    let effective_max_session_age_hours =
        raw_max_session_age_hours.unwrap_or((platform_session_duration_days as i32) * 24);

    Ok(HttpResponse::Ok().json(WorkspaceIntegrationPolicySummaryResponse {
        workspace_id: ctx.org_id,
        workspace_slug: ctx.org_slug,
        login_methods,
        mfa_summary: serde_json::json!({
            "require_mfa": org.try_get::<bool, _>("require_mfa").map_err(|e| AppError::Internal(format!("Workspace policy summary is missing require_mfa: {}", e)))?,
            "require_mfa_for_admins": org.try_get::<bool, _>("require_mfa_for_admins").map_err(|e| AppError::Internal(format!("Workspace policy summary is missing require_mfa_for_admins: {}", e)))?,
            "tenant_portal_require_mfa": org.try_get::<bool, _>("tenant_portal_require_mfa").map_err(|e| AppError::Internal(format!("Workspace policy summary is missing tenant_portal_require_mfa: {}", e)))?,
        }),
        session_summary: serde_json::json!({
            "max_session_age_hours": effective_max_session_age_hours,
            "max_session_age_hours_workspace_override": raw_max_session_age_hours,
            "max_session_age_hours_source": if raw_max_session_age_hours.is_some() { "workspace" } else { "platform_default" },
            "max_concurrent_sessions": raw_max_concurrent_sessions,
            "max_concurrent_sessions_source": if raw_max_concurrent_sessions.is_some() { "workspace" } else { "unlimited_default" },
            "workspace_status": org.try_get::<String, _>("status").map_err(|e| AppError::Internal(format!("Workspace policy summary is missing status: {}", e)))?,
            "platform_locked": org.try_get::<bool, _>("platform_locked").map_err(|e| AppError::Internal(format!("Workspace policy summary is missing platform_locked: {}", e)))?,
        }),
        ip_policy_summary: serde_json::json!({
            "use_custom_ip_policy": ip_policy.as_ref().map(|item| item.use_custom_ip_policy).unwrap_or(false),
            "allowlist_count": ip_policy.as_ref().map(|item| item.allowlist.len()).unwrap_or(0),
            "blocklist_count": ip_policy.as_ref().map(|item| item.blocklist.len()).unwrap_or(0),
        }),
        client_policy_summary: serde_json::json!({
            "allow_client_management": client_policy.as_ref().map(|item| item.allow_client_management).unwrap_or(true),
            "allow_web_clients": client_policy.as_ref().map(|item| item.allow_web_clients).unwrap_or(true),
            "allow_spa_clients": client_policy.as_ref().map(|item| item.allow_spa_clients).unwrap_or(true),
            "allow_native_clients": client_policy.as_ref().map(|item| item.allow_native_clients).unwrap_or(true),
        }),
    }))
}

#[utoipa::path(
    get,
    path = "/v1/orgs/integrations/api-keys/me",
    tag = "integrations",
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Metadata + granted permissions for the calling API key"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the workspace.read permission"),
    ),
)]
pub async fn get_workspace_integration_api_key_me(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "workspace.read")?;
    let permission_preset = ctx.permission_preset.clone();
    let allowed_permissions = workspace_api_key_permissions_for_preset(&permission_preset);

    Ok(
        HttpResponse::Ok().json(WorkspaceIntegrationApiKeyMeResponse {
            workspace_id: ctx.org_id,
            workspace_slug: ctx.org_slug,
            workspace_name: ctx.org_name,
            key_label: ctx.label,
            key_prefix: ctx.key_prefix,
            permission_preset,
            allowed_permissions,
        }),
    )
}

#[utoipa::path(
    get,
    path = "/v1/orgs/integrations/roles",
    tag = "integrations",
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Roles assignable to workspace members"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the members.read permission"),
    ),
)]
pub async fn list_workspace_integration_roles(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "members.read")?;

    let roles = RbacService::new(RbacRepository::new(state.db.clone()))
        .get_available_roles(ctx.org_id)
        .await?
        .into_iter()
        .map(|role| super::models::OrganizationRoleSummary {
            code: role.code,
            name: role.name,
            description: None,
        })
        .collect::<Vec<_>>();

    Ok(HttpResponse::Ok().json(serde_json::json!({ "roles": roles })))
}

#[utoipa::path(
    get,
    path = "/v1/orgs/integrations/permissions",
    tag = "integrations",
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Catalog of permissions known to the workspace"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the workspace.read permission"),
    ),
)]
pub async fn list_workspace_integration_permissions(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "workspace.read")?;

    let perms = RbacRepository::new(state.db.clone())
        .list_permissions()
        .await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({ "permissions": perms })))
}

#[utoipa::path(
    get,
    path = "/v1/orgs/integrations/audit/actions",
    tag = "integrations",
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Distinct audit action codes available for filtering"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the activity.read permission"),
    ),
)]
pub async fn list_workspace_integration_audit_actions(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "activity.read")?;

    let actions = sqlx::query_scalar::<_, String>(
        "SELECT DISTINCT action FROM audit_logs WHERE organization_id = $1 ORDER BY action",
    )
    .bind(ctx.org_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!("Failed to load workspace audit action list: {}", e))
    })?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "actions": actions })))
}

#[utoipa::path(
    get,
    path = "/v1/orgs/integrations/widget-preview-config",
    tag = "integrations",
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Config needed to render the hosted login widget preview"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the branding.read permission"),
    ),
)]
pub async fn get_workspace_integration_widget_preview_config(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "branding.read")?;

    let org = sqlx::query_as::<_, super::models::Organization>(
        r#"
        SELECT id, name, slug, login_display_name, login_title, login_subtitle, icon_url, login_logo_url, brand_color,
               show_login_logo, show_login_title, show_login_subtitle, show_powered_by,
               widget_radius, widget_shadow, icon_container, login_logo_container, login_logo_size,
               card_radius, button_style, card_bg_style, card_bg_color2, card_border_width, card_border_color,
               login_method_order, allow_magic_link, allow_google, allow_microsoft, allow_passkey, require_mfa,
               allow_client_management, allow_web_clients, allow_spa_clients, allow_native_clients, allowed_email_domains,
               max_session_age_hours, magic_link_expiry_minutes, oidc_access_token_ttl_minutes, refresh_token_ttl_days,
               idle_timeout_minutes, require_mfa_for_admins, tenant_portal_require_mfa, max_concurrent_sessions,
               magic_link_rate_limit_admin_override, magic_link_rate_window_admin_override,
               magic_link_rate_limit_staff_override, magic_link_rate_window_staff_override,
               status, platform_locked, created_at, updated_at
        FROM organizations WHERE id = $1
        "#
    )
    .bind(ctx.org_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace widget preview config: {}", e)))?;

    let enabled_login_methods = org
        .login_method_order
        .iter()
        .filter(|item| match item.as_str() {
            "magic_link" => org.allow_magic_link,
            "google" => org.allow_google,
            "microsoft" => org.allow_microsoft,
            "passkey" => org.allow_passkey,
            _ => false,
        })
        .cloned()
        .collect::<Vec<_>>();

    Ok(
        HttpResponse::Ok().json(WorkspaceIntegrationWidgetPreviewConfigResponse {
            workspace_id: org.id,
            workspace_slug: org.slug,
            login_display_name: org.login_display_name,
            login_title: org.login_title,
            login_subtitle: org.login_subtitle,
            icon_url: org.icon_url,
            login_logo_url: org.login_logo_url,
            brand_color: org.brand_color,
            show_login_logo: org.show_login_logo,
            show_login_title: org.show_login_title,
            show_login_subtitle: org.show_login_subtitle,
            show_powered_by: org.show_powered_by,
            widget_radius: org.widget_radius,
            widget_shadow: org.widget_shadow,
            icon_container: org.icon_container,
            login_logo_container: org.login_logo_container,
            login_logo_size: org.login_logo_size,
            card_radius: org.card_radius,
            button_style: org.button_style,
            card_bg_style: org.card_bg_style,
            card_bg_color2: org.card_bg_color2,
            card_border_width: org.card_border_width,
            card_border_color: org.card_border_color,
            login_method_order: org.login_method_order,
            enabled_login_methods,
        }),
    )
}

#[utoipa::path(
    patch,
    path = "/v1/orgs/integrations/branding",
    tag = "integrations",
    request_body = UpdateCurrentOrganizationBrandingRequest,
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Updated workspace branding"),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the branding.write permission"),
    ),
)]
pub async fn update_workspace_integration_branding(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdateCurrentOrganizationBrandingRequest>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "branding.write")?;
    ensure_demo_workspace_allowed(&state, ctx.org_id).await?;

    if let Some(ref v) = body.login_display_name {
        if v.len() > 100 {
            return Err(AppError::Validation(
                "Login display name must be 100 characters or fewer.".into(),
            ));
        }
    }
    if let Some(ref v) = body.login_title {
        if v.len() > 200 {
            return Err(AppError::Validation(
                "Login title must be 200 characters or fewer.".into(),
            ));
        }
    }
    if let Some(ref v) = body.login_subtitle {
        if v.len() > 200 {
            return Err(AppError::Validation(
                "Login subtitle must be 200 characters or fewer.".into(),
            ));
        }
    }
    if let Some(ref v) = body.icon_url {
        if !v.is_empty() {
            validate_branding_url(v, "Icon URL")?;
        }
    }
    if let Some(ref v) = body.login_logo_url {
        if !v.is_empty() {
            validate_branding_url(v, "Login logo URL")?;
        }
    }
    if let Some(ref v) = body.brand_color {
        if !v.is_empty() {
            validate_hex_color(v, "Brand color")?;
        }
    }
    if let Some(ref v) = body.card_bg_color2 {
        if !v.is_empty() {
            validate_hex_color(v, "Card background color")?;
        }
    }
    if let Some(ref v) = body.card_border_color {
        if !v.is_empty() {
            validate_hex_color(v, "Card border color")?;
        }
    }

    if let Some(ref new_name) = body.name {
        let trimmed = new_name.trim();
        if trimmed.is_empty() {
            return Err(AppError::Validation(
                "Workspace name cannot be empty.".into(),
            ));
        }
        sqlx::query("UPDATE organizations SET name = $1, login_display_name = NULL, updated_at = NOW() WHERE id = $2")
            .bind(trimmed)
            .bind(ctx.org_id)
            .execute(&state.db)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to update workspace name: {}", e)))?;
    }

    let owner_user_id = resolve_workspace_api_owner_user_id(ctx.org_id, &state).await?;
    let repo = OrganizationRepository::new(state.db.clone());
    let service = OrganizationService::new(repo, state.db.clone());
    service
        .update_branding(
            ctx.org_id,
            owner_user_id,
            body.login_display_name
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.login_title
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.login_subtitle
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.icon_url
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.login_logo_url
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.brand_color
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.show_login_logo,
            body.show_login_title,
            body.show_login_subtitle,
            body.show_powered_by,
            body.widget_radius.clone(),
            body.widget_shadow.clone(),
            body.icon_container.clone(),
            body.login_logo_container.clone(),
            body.login_logo_size.clone(),
            body.card_radius.clone(),
            body.button_style.clone(),
            body.card_bg_style.clone(),
            body.card_bg_color2
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.card_border_width.clone(),
            body.card_border_color
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.login_method_order.clone(),
        )
        .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: None,
            organization_id: Some(ctx.org_id),
            action: "workspace.branding.updated_via_api_key".into(),
            target_type: "organization".into(),
            target_id: Some(ctx.org_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "key_prefix": ctx.key_prefix }),
        })
        .await;

    get_workspace_integration_branding(req, state).await
}

#[utoipa::path(
    patch,
    path = "/v1/orgs/integrations/auth-config",
    tag = "integrations",
    request_body = UpdateTenantAuthConfigRequest,
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Updated workspace auth provider + SMTP configuration"),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the auth_config.write permission"),
    ),
)]
pub async fn update_workspace_integration_auth_config(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdateTenantAuthConfigRequest>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "auth_config.write")?;
    ensure_demo_workspace_allowed(&state, ctx.org_id).await?;

    sqlx::query(
        "INSERT INTO tenant_auth_config (org_id) VALUES ($1) ON CONFLICT (org_id) DO NOTHING",
    )
    .bind(ctx.org_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!("Failed to initialize workspace auth config: {}", e))
    })?;

    if body.clear_google.unwrap_or(false) {
        sqlx::query("UPDATE tenant_auth_config SET google_client_id = NULL, google_client_secret = NULL, updated_at = NOW() WHERE org_id = $1")
            .bind(ctx.org_id)
            .execute(&state.db)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to clear workspace Google auth config: {}", e)))?;
    } else if let (Some(id), Some(secret)) = (&body.google_client_id, &body.google_client_secret) {
        if !id.trim().is_empty() && !secret.trim().is_empty() {
            let enc = encrypt_secret(secret.trim(), &state.config)?;
            sqlx::query("UPDATE tenant_auth_config SET google_client_id = $1, google_client_secret = $2, updated_at = NOW() WHERE org_id = $3")
                .bind(id.trim())
                .bind(&enc)
                .bind(ctx.org_id)
                .execute(&state.db)
                .await
                .map_err(|e| AppError::Internal(format!("Failed to save workspace Google auth config: {}", e)))?;
        }
    } else if let Some(id) = &body.google_client_id {
        if !id.trim().is_empty() {
            sqlx::query("UPDATE tenant_auth_config SET google_client_id = $1, updated_at = NOW() WHERE org_id = $2")
                .bind(id.trim())
                .bind(ctx.org_id)
                .execute(&state.db)
                .await
                .map_err(|e| AppError::Internal(format!("Failed to update workspace Google client ID: {}", e)))?;
        }
    }

    if body.clear_microsoft.unwrap_or(false) {
        sqlx::query("UPDATE tenant_auth_config SET microsoft_client_id = NULL, microsoft_client_secret = NULL, microsoft_tenant_id = NULL, updated_at = NOW() WHERE org_id = $1")
            .bind(ctx.org_id)
            .execute(&state.db)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to clear workspace Microsoft auth config: {}", e)))?;
    } else if let (Some(id), Some(secret)) =
        (&body.microsoft_client_id, &body.microsoft_client_secret)
    {
        if !id.trim().is_empty() && !secret.trim().is_empty() {
            let enc = encrypt_secret(secret.trim(), &state.config)?;
            let tenant_id = body
                .microsoft_tenant_id
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or("common");
            sqlx::query("UPDATE tenant_auth_config SET microsoft_client_id = $1, microsoft_client_secret = $2, microsoft_tenant_id = $3, updated_at = NOW() WHERE org_id = $4")
                .bind(id.trim())
                .bind(&enc)
                .bind(tenant_id)
                .bind(ctx.org_id)
                .execute(&state.db)
                .await
                .map_err(|e| AppError::Internal(format!("Failed to save workspace Microsoft auth config: {}", e)))?;
        }
    }

    if body.clear_smtp.unwrap_or(false) {
        sqlx::query("UPDATE tenant_auth_config SET smtp_host = NULL, smtp_port = NULL, smtp_user = NULL, smtp_password = NULL, smtp_from = NULL, smtp_security = NULL, updated_at = NOW() WHERE org_id = $1")
            .bind(ctx.org_id)
            .execute(&state.db)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to clear workspace SMTP config: {}", e)))?;
    } else if let Some(host) = &body.smtp_host {
        if !host.trim().is_empty() {
            let encrypted_password = if let Some(password) = &body.smtp_password {
                if !password.trim().is_empty() {
                    Some(encrypt_secret(password.trim(), &state.config)?)
                } else {
                    None
                }
            } else {
                None
            };

            if let Some(ep) = encrypted_password {
                sqlx::query("UPDATE tenant_auth_config SET smtp_host = $1, smtp_port = $2, smtp_user = $3, smtp_password = $4, smtp_from = $5, smtp_security = $6, updated_at = NOW() WHERE org_id = $7")
                    .bind(host.trim())
                    .bind(body.smtp_port)
                    .bind(body.smtp_user.as_deref().map(str::trim))
                    .bind(&ep)
                    .bind(body.smtp_from.as_deref().map(str::trim))
                    .bind(body.smtp_security.as_deref().unwrap_or("starttls"))
                    .bind(ctx.org_id)
                    .execute(&state.db)
                    .await
                    .map_err(|e| AppError::Internal(format!("Failed to save workspace SMTP config: {}", e)))?;
            } else {
                sqlx::query("UPDATE tenant_auth_config SET smtp_host = $1, smtp_port = $2, smtp_user = $3, smtp_from = $4, smtp_security = $5, updated_at = NOW() WHERE org_id = $6")
                    .bind(host.trim())
                    .bind(body.smtp_port)
                    .bind(body.smtp_user.as_deref().map(str::trim))
                    .bind(body.smtp_from.as_deref().map(str::trim))
                    .bind(body.smtp_security.as_deref().unwrap_or("starttls"))
                    .bind(ctx.org_id)
                    .execute(&state.db)
                    .await
                    .map_err(|e| AppError::Internal(format!("Failed to update workspace SMTP config without password change: {}", e)))?;
            }
        }
    }

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: None,
            organization_id: Some(ctx.org_id),
            action: "tenant_auth_config.updated_via_api_key".into(),
            target_type: "organization".into(),
            target_id: Some(ctx.org_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "key_prefix": ctx.key_prefix }),
        })
        .await;

    get_workspace_integration_auth_config(req, state).await
}

#[utoipa::path(
    post,
    path = "/v1/orgs/integrations/clients",
    tag = "integrations",
    request_body = CreateOrgClientRequest,
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Created OAuth client/app (includes the one-time client secret)"),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the clients.create permission"),
    ),
)]
pub async fn create_workspace_integration_client(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<CreateOrgClientRequest>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "clients.create")?;
    ensure_demo_workspace_allowed(&state, ctx.org_id).await?;

    let owner_user_id = resolve_workspace_api_owner_user_id(ctx.org_id, &state).await?;
    let platform_policy = load_platform_client_governance(&state.db).await?;
    let workspace_governance = load_platform_workspace_governance(&state.db).await?;
    let tenant_policy = load_tenant_client_policy(&state.db, ctx.org_id).await?;
    let effective_policy = effective_client_policy(&platform_policy, &tenant_policy);
    if !effective_policy.allow_client_management {
        return Err(AppError::Forbidden(
            "Workspace-managed OAuth clients are disabled by platform or workspace policy.".into(),
        ));
    }

    if body.app_name.trim().is_empty() {
        return Err(AppError::Validation("App name is required.".into()));
    }
    if !["web", "spa", "native"].contains(&body.app_type.as_str()) {
        return Err(AppError::Validation(
            "app_type must be web, spa, or native.".into(),
        ));
    }
    if !is_client_type_allowed(&effective_policy, &body.app_type) {
        return Err(AppError::Forbidden(format!(
            "{} clients are disabled by platform or workspace policy.",
            body.app_type.to_uppercase()
        )));
    }

    let app_registration_governance =
        load_effective_workspace_app_registration_governance(&state.db, ctx.org_id).await?;
    let redirect_uris = normalize_client_redirect_uris_with_limit(
        &body.app_type,
        &body.redirect_uris,
        app_registration_governance.max_redirect_uris_per_app as usize,
    )?;
    let allowed_embed_origins = normalize_client_allowed_embed_origins_with_limit(
        &body.allowed_embed_origins,
        app_registration_governance.max_allowed_embed_origins_per_app as usize,
    )?;
    let app_limit = workspace_governance.effective_max_apps();
    let existing_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM oauth_clients WHERE org_id = $1")
            .bind(ctx.org_id)
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                AppError::Internal(format!("Failed to count existing workspace apps: {}", e))
            })?;
    if existing_count >= i64::from(app_limit) {
        return Err(AppError::Validation(format!(
            "Workspace app limit reached. This workspace can create up to {} apps.",
            app_limit
        )));
    }

    let client_id = generate_client_id();
    let mut client_secret = None;
    let mut client_secret_hash = None;
    if body.app_type == "web" {
        let (secret, hash) = generate_confidential_client_secret()?;
        client_secret = Some(secret);
        client_secret_hash = Some(hash);
    }

    let mut tx = state.db.begin().await.map_err(|e| {
        AppError::Internal(format!(
            "Failed to start workspace app creation transaction: {}",
            e
        ))
    })?;
    let client = sqlx::query_as::<_, OrgOAuthClient>(
        r#"
        INSERT INTO oauth_clients (client_id, client_secret_hash, app_name, app_type, status, owner_user_id, org_id, is_first_party)
        VALUES ($1, $2, $3, $4, 'active', $5, $6, false)
        RETURNING id, client_id, app_name, NULL::text AS app_icon_url, app_type, status, is_first_party, created_at
        "#,
    )
    .bind(&client_id)
    .bind(&client_secret_hash)
    .bind(body.app_name.trim())
    .bind(&body.app_type)
    .bind(owner_user_id)
    .bind(ctx.org_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to create workspace app: {}", e)))?;

    for uri in &redirect_uris {
        sqlx::query("INSERT INTO oauth_client_redirect_uris (oauth_client_id, redirect_uri) VALUES ($1, $2)")
            .bind(client.id)
            .bind(uri)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to save workspace app redirect URI: {}", e)))?;
    }
    for origin in &allowed_embed_origins {
        sqlx::query("INSERT INTO oauth_client_allowed_embed_origins (oauth_client_id, origin) VALUES ($1, $2)")
            .bind(client.id)
            .bind(origin)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to save workspace app allowed embed origin: {}", e)))?;
    }

    tx.commit().await.map_err(|e| {
        AppError::Internal(format!("Failed to commit workspace app creation: {}", e))
    })?;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: None,
        organization_id: Some(ctx.org_id),
        action: "oauth_client.created_via_api_key".into(),
        target_type: "oauth_client".into(),
        target_id: Some(client.id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({ "app_name": client.app_name, "key_prefix": ctx.key_prefix }),
    }).await;

    Ok(HttpResponse::Created().json(OrgClientResponse {
        client,
        redirect_uris,
        allowed_embed_origins,
        client_secret,
    }))
}

#[utoipa::path(
    patch,
    path = "/v1/orgs/integrations/clients/{client_id}",
    tag = "integrations",
    params(("client_id" = Uuid, Path, description = "Client UUID")),
    request_body = UpdateOrgClientRequest,
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Updated OAuth client/app"),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the clients.update permission"),
        (status = 404, description = "Client not found in this workspace"),
    ),
)]
pub async fn update_workspace_integration_client(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<uuid::Uuid>,
    body: web::Json<UpdateOrgClientRequest>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "clients.update")?;
    ensure_demo_workspace_allowed(&state, ctx.org_id).await?;
    let client_id_param = path.into_inner();

    if body.app_name.trim().is_empty() {
        return Err(AppError::Validation("App name is required.".into()));
    }

    let existing = sqlx::query_as::<_, OrgOAuthClient>(
        "SELECT id, client_id, app_name, NULL::text AS app_icon_url, app_type, status, is_first_party, created_at FROM oauth_clients WHERE id = $1 AND org_id = $2"
    )
    .bind(client_id_param)
    .bind(ctx.org_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace app for update: {}", e)))?
    .ok_or_else(|| AppError::NotFound("Client not found in your workspace.".into()))?;

    let app_registration_governance =
        load_effective_workspace_app_registration_governance(&state.db, ctx.org_id).await?;
    let redirect_uris = normalize_client_redirect_uris_with_limit(
        &existing.app_type,
        &body.redirect_uris,
        app_registration_governance.max_redirect_uris_per_app as usize,
    )?;
    let allowed_embed_origins = normalize_client_allowed_embed_origins_with_limit(
        &body.allowed_embed_origins,
        app_registration_governance.max_allowed_embed_origins_per_app as usize,
    )?;
    let mut tx = state.db.begin().await.map_err(|e| {
        AppError::Internal(format!(
            "Failed to start workspace app update transaction: {}",
            e
        ))
    })?;

    let updated_client = sqlx::query_as::<_, OrgOAuthClient>(
        r#"
        UPDATE oauth_clients
        SET app_name = $1
        WHERE id = $2 AND org_id = $3
        RETURNING id, client_id, app_name, NULL::text AS app_icon_url, app_type, status, is_first_party, created_at
        "#,
    )
    .bind(body.app_name.trim())
    .bind(client_id_param)
    .bind(ctx.org_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to update workspace app: {}", e)))?;

    sqlx::query("DELETE FROM oauth_client_redirect_uris WHERE oauth_client_id = $1")
        .bind(client_id_param)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Failed to clear workspace app redirect URIs: {}",
                e
            ))
        })?;
    sqlx::query("DELETE FROM oauth_client_allowed_embed_origins WHERE oauth_client_id = $1")
        .bind(client_id_param)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Failed to clear workspace app allowed embed origins: {}",
                e
            ))
        })?;

    for uri in &redirect_uris {
        sqlx::query("INSERT INTO oauth_client_redirect_uris (oauth_client_id, redirect_uri) VALUES ($1, $2)")
            .bind(client_id_param)
            .bind(uri)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to save updated workspace app redirect URI: {}", e)))?;
    }
    for origin in &allowed_embed_origins {
        sqlx::query("INSERT INTO oauth_client_allowed_embed_origins (oauth_client_id, origin) VALUES ($1, $2)")
            .bind(client_id_param)
            .bind(origin)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to save updated workspace app allowed embed origin: {}", e)))?;
    }

    tx.commit()
        .await
        .map_err(|e| AppError::Internal(format!("Failed to commit workspace app update: {}", e)))?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: None,
            organization_id: Some(ctx.org_id),
            action: "oauth_client.updated_via_api_key".into(),
            target_type: "oauth_client".into(),
            target_id: Some(updated_client.id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "app_name": updated_client.app_name,
                "redirect_uri_count": redirect_uris.len(),
                "key_prefix": ctx.key_prefix,
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(OrgClientResponse {
        client: updated_client,
        redirect_uris,
        allowed_embed_origins,
        client_secret: None,
    }))
}

#[utoipa::path(
    patch,
    path = "/v1/orgs/integrations/clients/{client_id}/status",
    tag = "integrations",
    params(("client_id" = Uuid, Path, description = "Client UUID")),
    request_body = UpdateOrgClientStatusRequest,
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Updated client status"),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the clients.status permission"),
        (status = 404, description = "Client not found in this workspace"),
    ),
)]
pub async fn update_workspace_integration_client_status(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<uuid::Uuid>,
    body: web::Json<UpdateOrgClientStatusRequest>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "clients.status")?;
    ensure_demo_workspace_allowed(&state, ctx.org_id).await?;
    let client_id_param = path.into_inner();
    let normalized_status = body.status.trim().to_lowercase();

    if normalized_status != "active" && normalized_status != "suspended" {
        return Err(AppError::Validation(
            "Status must be either 'active' or 'suspended'.".into(),
        ));
    }

    let client = sqlx::query_as::<_, OrgOAuthClient>(
        "SELECT id, client_id, app_name, NULL::text AS app_icon_url, app_type, status, is_first_party, created_at FROM oauth_clients WHERE id = $1 AND org_id = $2"
    )
    .bind(client_id_param)
    .bind(ctx.org_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace app for status update: {}", e)))?
    .ok_or_else(|| AppError::NotFound("Client not found in your workspace.".into()))?;

    let updated = sqlx::query_as::<_, OrgOAuthClient>(
        "UPDATE oauth_clients SET status = $1 WHERE id = $2 AND org_id = $3 RETURNING id, client_id, app_name, NULL::text AS app_icon_url, app_type, status, is_first_party, created_at"
    )
    .bind(&normalized_status)
    .bind(client.id)
    .bind(ctx.org_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to update workspace app status: {}", e)))?;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: None,
        organization_id: Some(ctx.org_id),
        action: if normalized_status == "active" {
            "oauth_client.resumed_via_api_key".into()
        } else {
            "oauth_client.suspended_via_api_key".into()
        },
        target_type: "oauth_client".into(),
        target_id: Some(client.id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({ "app_name": updated.app_name, "key_prefix": ctx.key_prefix }),
    }).await;

    Ok(HttpResponse::Ok().json(updated))
}

#[utoipa::path(
    post,
    path = "/v1/orgs/integrations/clients/{client_id}/rotate-secret",
    tag = "integrations",
    params(("client_id" = Uuid, Path, description = "Client UUID")),
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Rotated client secret (includes the new one-time secret)"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the clients.rotate_secret permission"),
        (status = 404, description = "Client not found in this workspace"),
    ),
)]
pub async fn rotate_workspace_integration_client_secret(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<uuid::Uuid>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "clients.rotate_secret")?;
    ensure_demo_workspace_allowed(&state, ctx.org_id).await?;
    let client_id_param = path.into_inner();

    let client = sqlx::query_as::<_, OrgOAuthClient>(
        "SELECT id, client_id, app_name, NULL::text AS app_icon_url, app_type, status, is_first_party, created_at FROM oauth_clients WHERE id = $1 AND org_id = $2"
    )
    .bind(client_id_param)
    .bind(ctx.org_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace app for secret rotation: {}", e)))?
    .ok_or_else(|| AppError::NotFound("Client not found in your workspace.".into()))?;

    if client.app_type != "web" {
        return Err(AppError::Validation(
            "Only confidential web clients can rotate a client secret.".into(),
        ));
    }
    if client.status != "active" {
        return Err(AppError::Validation(
            "Paused clients cannot rotate a client secret until resumed.".into(),
        ));
    }

    let (client_secret, client_secret_hash) = generate_confidential_client_secret()?;
    sqlx::query("UPDATE oauth_clients SET client_secret_hash = $1 WHERE id = $2 AND org_id = $3")
        .bind(&client_secret_hash)
        .bind(client.id)
        .bind(ctx.org_id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Failed to rotate workspace app client secret: {}",
                e
            ))
        })?;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: None,
        organization_id: Some(ctx.org_id),
        action: "oauth_client.secret_rotated_via_api_key".into(),
        target_type: "oauth_client".into(),
        target_id: Some(client.id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({ "app_name": client.app_name, "key_prefix": ctx.key_prefix }),
    }).await;

    Ok(HttpResponse::Ok().json(RotateOrgClientSecretResponse {
        client_id: client.client_id,
        client_secret,
    }))
}

#[utoipa::path(
    delete,
    path = "/v1/orgs/integrations/clients/{client_id}",
    tag = "integrations",
    params(("client_id" = Uuid, Path, description = "Client UUID")),
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Client deleted"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the clients.delete permission"),
        (status = 404, description = "Client not found in this workspace"),
    ),
)]
pub async fn delete_workspace_integration_client(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<uuid::Uuid>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "clients.delete")?;
    ensure_demo_workspace_allowed(&state, ctx.org_id).await?;
    let client_id_param = path.into_inner();

    let rows = sqlx::query("DELETE FROM oauth_clients WHERE id = $1 AND org_id = $2")
        .bind(client_id_param)
        .bind(ctx.org_id)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to delete workspace app: {}", e)))?
        .rows_affected();

    if rows == 0 {
        return Err(AppError::NotFound(
            "Client not found in your workspace.".into(),
        ));
    }

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: None,
            organization_id: Some(ctx.org_id),
            action: "oauth_client.deleted_via_api_key".into(),
            target_type: "oauth_client".into(),
            target_id: Some(client_id_param.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "key_prefix": ctx.key_prefix }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "ok": true })))
}

#[utoipa::path(
    post,
    path = "/v1/orgs/integrations/invites",
    tag = "integrations",
    request_body = SendInviteRequest,
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Invite created and email queued"),
        (status = 400, description = "Validation error"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the invites.create permission"),
    ),
)]
pub async fn send_workspace_integration_invite(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<SendInviteRequest>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "invites.create")?;
    ensure_demo_workspace_allowed(&state, ctx.org_id).await?;

    let owner_user_id = resolve_workspace_api_owner_user_id(ctx.org_id, &state).await?;
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    use rand::RngCore;
    let mut raw_bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut raw_bytes);
    let raw_token = URL_SAFE_NO_PAD.encode(raw_bytes);
    let mut hasher = sha2::Sha256::new();
    hasher.update(&raw_token);
    let token_hash = hex::encode(hasher.finalize());
    let expires_at = chrono::Utc::now() + chrono::Duration::hours(48);

    let repo = OrganizationRepository::new(state.db.clone());
    repo.create_invite(
        ctx.org_id,
        &body.email,
        &token_hash,
        owner_user_id,
        expires_at,
    )
    .await?;

    let app_url = crate::shared::runtime_config::effective_app_url(&state.db)
        .await
        .unwrap_or_else(|_| "http://localhost:5172".to_string());
    let accept_url = format!(
        "{}/accept-invite?token={}",
        app_url.trim_end_matches('/'),
        raw_token
    );
    if let Err(err) = crate::infra::email::send_action_email(
        &state.db,
        &body.email,
        &format!("You've been invited to join {}", ctx.org_name),
        &format!("You're invited to join {}", ctx.org_name),
        &format!("A workspace API integration invited you to join {} on Rooiam. Click the button below to accept the invitation. This link expires in 48 hours.", ctx.org_name),
        "Accept Invitation",
        &accept_url,
    )
    .await
    {
        tracing::warn!("Invite email to {} failed (invite still created): {}", body.email, err);
    }

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: None,
        organization_id: Some(ctx.org_id),
        action: "workspace.invite.sent_via_api_key".into(),
        target_type: "invite".into(),
        target_id: None,
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({ "invited_email": body.email, "key_prefix": ctx.key_prefix }),
    }).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Invitation sent successfully",
    })))
}

#[utoipa::path(
    delete,
    path = "/v1/orgs/integrations/invites/{invite_id}",
    tag = "integrations",
    params(("invite_id" = Uuid, Path, description = "Invite UUID")),
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Invite revoked"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the invites.delete permission"),
        (status = 404, description = "Invite not found in this workspace"),
    ),
)]
pub async fn revoke_workspace_integration_invite(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<InvitePath>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "invites.delete")?;
    ensure_demo_workspace_allowed(&state, ctx.org_id).await?;

    let repo = OrganizationRepository::new(state.db.clone());
    let invite = repo
        .revoke_invite(path.into_inner().invite_id, ctx.org_id)
        .await?;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: None,
        organization_id: Some(ctx.org_id),
        action: "workspace.invite.revoked_via_api_key".into(),
        target_type: "invite".into(),
        target_id: Some(invite.id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({ "invited_email": invite.email, "key_prefix": ctx.key_prefix }),
    }).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Invitation revoked successfully",
    })))
}

#[utoipa::path(
    patch,
    path = "/v1/orgs/integrations/members/{member_id}/role",
    tag = "integrations",
    params(("member_id" = Uuid, Path, description = "Member UUID")),
    request_body = UpdateMemberRoleRequest,
    security(("workspace_api_key" = [])),
    responses((status = 200, description = "Member role updated"), (status = 400), (status = 401), (status = 403), (status = 404)),
)]
pub async fn update_workspace_integration_member_role(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<UpdateMemberRoleRequest>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "members.role_update")?;
    ensure_demo_workspace_allowed(&state, ctx.org_id).await?;
    let member_id = path.into_inner();
    let new_role = body.role_code.trim().to_string();

    let before_roles: Vec<String> = sqlx::query_scalar(
        r#"
        SELECT r.code FROM roles r
        JOIN member_roles mr ON mr.role_id = r.id
        JOIN organization_members om ON om.id = mr.member_id
        WHERE om.id = $1 AND om.organization_id = $2
        "#,
    )
    .bind(member_id)
    .bind(ctx.org_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let owner_user_id = resolve_workspace_api_owner_user_id(ctx.org_id, &state).await?;
    let repo = OrganizationRepository::new(state.db.clone());
    let service = OrganizationService::new(repo, state.db.clone());

    let target_user_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT user_id FROM organization_members WHERE id = $1 AND organization_id = $2",
    )
    .bind(member_id)
    .bind(ctx.org_id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    service
        .update_member_role(ctx.org_id, owner_user_id, member_id, &new_role)
        .await?;

    if let Some(uid) = target_user_id {
        let _ = sqlx::query(
            "UPDATE sessions SET revoked_at = NOW() \
             WHERE user_id = $1 AND current_org_id = $2 \
             AND revoked_at IS NULL AND expires_at > NOW()",
        )
        .bind(uid)
        .bind(ctx.org_id)
        .execute(&state.db)
        .await;
    }

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: None,
            organization_id: Some(ctx.org_id),
            action: "workspace.member.role_changed_via_api_key".into(),
            target_type: "member".into(),
            target_id: Some(member_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "before_roles": before_roles,
                "after_role": new_role,
                "key_prefix": ctx.key_prefix,
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Member role updated successfully",
    })))
}

#[utoipa::path(
    delete,
    path = "/v1/orgs/integrations/members/{member_id}",
    tag = "integrations",
    params(("member_id" = Uuid, Path, description = "Member UUID")),
    security(("workspace_api_key" = [])),
    responses((status = 200, description = "Member removed from the workspace"), (status = 401), (status = 403), (status = 404)),
)]
pub async fn remove_workspace_integration_member(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "members.remove")?;
    ensure_demo_workspace_allowed(&state, ctx.org_id).await?;
    let member_id = path.into_inner();

    let repo = OrganizationRepository::new(state.db.clone());
    let removed_user_id = repo.remove_member(ctx.org_id, member_id).await?;

    sqlx::query(
        "UPDATE sessions SET revoked_at = NOW() \
         WHERE user_id = $1 AND current_org_id = $2 \
         AND revoked_at IS NULL AND expires_at > NOW()",
    )
    .bind(removed_user_id)
    .bind(ctx.org_id)
    .execute(&state.db)
    .await?;

    sqlx::query(
        "UPDATE oauth_refresh_tokens SET revoked_at = NOW() \
         WHERE user_id = $1 AND revoked_at IS NULL \
         AND session_id IN (SELECT id FROM sessions WHERE user_id = $1 AND current_org_id = $2)",
    )
    .bind(removed_user_id)
    .bind(ctx.org_id)
    .execute(&state.db)
    .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: None,
            organization_id: Some(ctx.org_id),
            action: "workspace.member.removed_via_api_key".into(),
            target_type: "member".into(),
            target_id: Some(removed_user_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "member_id": member_id, "key_prefix": ctx.key_prefix }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Member removed from workspace.",
    })))
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateOrganizationRequest {
    pub name: String,
    pub slug: String,
}

#[derive(serde::Deserialize, utoipa::IntoParams)]
#[serde(deny_unknown_fields)]
#[into_params(parameter_in = Query)]
pub struct ActivityQuery {
    /// Page number (1-based)
    page: Option<i64>,
    /// Items per page (max 1000)
    page_size: Option<i64>,
    /// Search term
    search: Option<String>,
    /// Search term (alias)
    q: Option<String>,
    /// Filter by audit action
    action: Option<String>,
    /// ISO date lower bound
    date_from: Option<String>,
    /// ISO date upper bound
    date_to: Option<String>,
    /// Sort field
    sort_by: Option<String>,
    /// asc | desc
    sort_order: Option<String>,
}

#[derive(serde::Deserialize, utoipa::IntoParams)]
#[serde(deny_unknown_fields)]
#[into_params(parameter_in = Query)]
pub struct ClientListQuery {
    /// Page number (1-based)
    pub page: Option<i64>,
    /// Items per page (max 1000)
    pub page_size: Option<i64>,
    /// Search by app name / client id
    pub q: Option<String>,
    /// Filter by status
    pub status: Option<String>,
    /// Filter by app type (web | spa | native)
    pub app_type: Option<String>,
    /// Sort field
    pub sort_by: Option<String>,
    /// asc | desc
    pub sort_order: Option<String>,
}

#[derive(serde::Deserialize, utoipa::IntoParams)]
#[serde(deny_unknown_fields)]
#[into_params(parameter_in = Query)]
pub struct MemberListQuery {
    /// Page number (1-based, default 1)
    page: Option<i64>,
    /// Items per page (default 20, max 1000)
    page_size: Option<i64>,
    /// Search by display name, email, or role
    q: Option<String>,
    /// Filter by role code, or "all"
    role: Option<String>,
    /// Filter by status, or "all"
    status: Option<String>,
    /// Sort field: display_name | email | status | role | created_at | last_seen_at
    sort_by: Option<String>,
    /// Sort direction: asc | desc
    sort_order: Option<String>,
}

#[derive(serde::Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
#[serde(deny_unknown_fields)]
pub struct InviteListQuery {
    pub page: Option<i64>,
    pub page_size: Option<i64>,
    pub q: Option<String>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

pub fn sort_order_or_error(value: Option<&str>) -> Result<&'static str, AppError> {
    match value.unwrap_or("desc").trim().to_ascii_lowercase().as_str() {
        "asc" => Ok("asc"),
        "desc" => Ok("desc"),
        _ => Err(AppError::Validation(
            "sort_order must be asc or desc.".into(),
        )),
    }
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct ActivityExportQuery {
    format: Option<String>, // "csv" or "json" (default "csv")
    search: Option<String>,
    action: Option<String>,
    date_from: Option<String>,
    date_to: Option<String>,
}

#[derive(serde::Serialize)]
pub struct PaginatedActivityResponse<T> {
    pub items: Vec<T>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SwitchOrganizationRequest {
    pub organization_id: Uuid,
}

#[derive(serde::Serialize)]
pub struct TenantPortalResponse {
    pub current_org: Option<super::models::Organization>,
    pub organizations: Vec<super::models::Organization>,
    pub permissions: Vec<String>,
    pub current_user_role_codes: Vec<String>,
    pub available_roles: Vec<super::models::OrganizationRoleSummary>,
    pub max_logo_bytes: usize,
    pub demo_mode: bool,
    pub max_workspaces_allowed: i32,
    pub max_apps_per_workspace: i32,
    pub max_redirect_uris_per_app: i32,
    pub max_allowed_embed_origins_per_app: i32,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateCurrentOrganizationBrandingRequest {
    pub name: Option<String>,
    pub login_display_name: Option<String>,
    pub login_title: Option<String>,
    pub login_subtitle: Option<String>,
    pub icon_url: Option<String>,
    pub login_logo_url: Option<String>,
    pub brand_color: Option<String>,
    pub show_login_logo: Option<bool>,
    pub show_login_title: Option<bool>,
    pub show_login_subtitle: Option<bool>,
    pub show_powered_by: Option<bool>,
    pub widget_radius: Option<String>,
    pub widget_shadow: Option<String>,
    pub icon_container: Option<String>,
    pub login_logo_container: Option<String>,
    pub login_logo_size: Option<String>,
    pub card_radius: Option<String>,
    pub button_style: Option<String>,
    pub card_bg_style: Option<String>,
    pub card_bg_color2: Option<String>,
    pub card_border_width: Option<String>,
    pub card_border_color: Option<String>,
    pub login_method_order: Option<Vec<String>>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateCurrentOrganizationAuthPolicyRequest {
    pub allow_magic_link: bool,
    pub allow_google: bool,
    pub allow_microsoft: bool,
    pub allow_passkey: bool,
    pub require_mfa: bool,
    #[serde(default)]
    pub require_mfa_for_admins: bool,
    #[serde(default)]
    pub tenant_portal_require_mfa: bool,
    #[serde(default)]
    pub allowed_email_domains: String,
    pub max_session_age_hours: Option<i32>,
    pub max_concurrent_sessions: Option<i32>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateCurrentOrganizationClientPolicyRequest {
    pub allow_client_management: bool,
    pub allow_web_clients: bool,
    pub allow_spa_clients: bool,
    pub allow_native_clients: bool,
}

#[derive(serde::Serialize)]
pub struct OrganizationClientPolicyResponse {
    pub platform: PlatformClientGovernance,
    pub tenant: TenantClientPolicy,
    pub effective: EffectiveClientPolicy,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateCurrentOrganizationIpPolicyRequest {
    pub use_custom_ip_policy: bool,
    pub allowlist: String,
    pub blocklist: String,
}

#[derive(serde::Serialize)]
pub struct OrganizationIpPolicyResponse {
    pub platform: PlatformIpPolicy,
    pub tenant: TenantIpPolicy,
    pub effective: EffectiveIpPolicy,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicBrandingQuery {
    pub workspace_id: Option<Uuid>,
    pub slug: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UploadBrandingAssetQuery {
    pub kind: String,
}

#[derive(serde::Serialize)]
pub struct UploadBrandingAssetResponse {
    pub url: String,
    pub kind: String,
}

#[derive(serde::Serialize)]
pub struct PublicBrandingResponse {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub login_display_name: Option<String>,
    pub login_title: Option<String>,
    pub login_subtitle: Option<String>,
    pub icon_url: Option<String>,
    pub icon_container: String,
    pub login_logo_url: Option<String>,
    pub brand_color: Option<String>,
    pub show_login_logo: bool,
    pub show_login_title: bool,
    pub show_login_subtitle: bool,
    pub show_powered_by: bool,
    pub widget_radius: String,
    pub widget_shadow: String,
    pub login_logo_container: String,
    pub login_logo_size: String,
    pub card_radius: String,
    pub button_style: String,
    pub card_bg_style: String,
    pub card_bg_color2: Option<String>,
    pub card_border_width: String,
    pub card_border_color: Option<String>,
    pub login_method_order: Vec<String>,
}

#[derive(serde::Serialize)]
pub struct TenantActivityResponse {
    pub id: i64,
    pub actor_user_id: Option<Uuid>,
    pub actor_display_name: Option<String>,
    pub actor_email: Option<String>,
    pub action: String,
    pub target_type: String,
    pub target_id: Option<String>,
    pub ip: Option<String>,
    pub metadata: serde_json::Value,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, serde::Serialize, sqlx::FromRow)]
pub struct SecurityAlertReviewItem {
    pub alert_key: String,
    pub reviewed_by_user_id: Option<Uuid>,
    pub reviewed_by_display_name: Option<String>,
    pub reviewed_by_email: Option<String>,
    pub reviewed_at: chrono::DateTime<chrono::Utc>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MarkSecurityAlertReviewRequest {
    pub alert_key: String,
}

async fn ensure_demo_workspace_allowed(
    state: &web::Data<AppState>,
    org_id: Uuid,
) -> Result<(), AppError> {
    if !demo_seed_enabled() {
        return Ok(());
    }

    let repo = OrganizationRepository::new(state.db.clone());
    let org = repo
        .get_organization_by_id(org_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Workspace not found".into()))?;

    if !is_seeded_demo_org_slug(&org.slug) {
        return Err(AppError::NotFound("Workspace not found".into()));
    }

    Ok(())
}

async fn load_operator_workspaces(
    repo: &OrganizationRepository,
    user_id: Uuid,
    organizations: Vec<super::models::Organization>,
) -> Result<Vec<super::models::Organization>, AppError> {
    let mut operator_orgs = Vec::with_capacity(organizations.len());
    for org in organizations {
        if repo.is_org_admin_or_owner(org.id, user_id).await? {
            operator_orgs.push(org);
        }
    }
    Ok(operator_orgs)
}

/// Create a new organization tenant
async fn create_org(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<CreateOrganizationRequest>,
) -> Result<HttpResponse, AppError> {
    if demo_seed_enabled() {
        return Err(AppError::Forbidden(
            "Workspace creation is disabled in demo mode.".into(),
        ));
    }
    let session = extract_session(&req)?;

    let repo = OrganizationRepository::new(state.db.clone());
    let membership_count = repo.count_user_organizations(session.user_id).await?;
    if membership_count > 0 && !repo.has_any_org_owner_role(session.user_id).await? {
        return Err(AppError::Forbidden(
            "Only workspace owners can create additional workspaces from this operator portal."
                .into(),
        ));
    }
    let service = OrganizationService::new(repo, state.db.clone());

    let org = service
        .create_tenant(session.user_id, &body.name, &body.slug)
        .await?;

    Ok(HttpResponse::Created().json(org))
}

/// List organizations the current user belongs to
async fn list_orgs(req: HttpRequest, state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;

    let repo = OrganizationRepository::new(state.db.clone());
    let service = OrganizationService::new(repo, state.db.clone());

    let mut orgs = service.get_my_organizations(session.user_id).await?;
    if demo_seed_enabled() {
        orgs.retain(|org| is_seeded_demo_org_slug(&org.slug));
    }

    Ok(HttpResponse::Ok().json(orgs))
}

/// Load the current tenant portal context for the signed-in user.
async fn current_portal(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;

    let repo = OrganizationRepository::new(state.db.clone());
    let service = OrganizationService::new(repo.clone(), state.db.clone());
    let mut organizations = service.get_my_organizations(session.user_id).await?;
    if demo_seed_enabled() {
        organizations.retain(|org| is_seeded_demo_org_slug(&org.slug));
    }
    let total_membership_count = organizations.len();
    let organizations = load_operator_workspaces(&repo, session.user_id, organizations).await?;

    if organizations.is_empty() && total_membership_count > 0 {
        return Err(AppError::Forbidden(
            "This workspace operator area is only for workspace owners and workspace admins."
                .into(),
        ));
    }

    let current_org = match session.current_org_id {
        Some(org_id) => {
            if repo.is_org_admin_or_owner(org_id, session.user_id).await? {
                service
                    .get_organization_if_member(org_id, session.user_id)
                    .await
                    .ok()
            } else {
                None
            }
        }
        None => None,
    };
    let current_org =
        current_org.filter(|org| !demo_seed_enabled() || is_seeded_demo_org_slug(&org.slug));

    let permissions = if let Some(ref org) = current_org {
        RbacService::new(RbacRepository::new(state.db.clone()))
            .get_user_permissions(session.user_id, org.id)
            .await?
    } else {
        Vec::new()
    };
    let current_user_role_codes = if let Some(ref org) = current_org {
        repo.get_user_role_codes(org.id, session.user_id).await?
    } else {
        Vec::new()
    };

    let available_roles = if let Some(ref org) = current_org {
        RbacService::new(RbacRepository::new(state.db.clone()))
            .get_available_roles(org.id)
            .await?
            .into_iter()
            .filter(|role: &Role| role.is_system && role.code != "owner")
            .map(|role| super::models::OrganizationRoleSummary {
                code: role.code,
                name: role.name,
                description: None,
            })
            .collect()
    } else {
        Vec::new()
    };
    let workspace_governance = load_platform_workspace_governance(&state.db).await?;
    let effective_app_registration_governance = if let Some(ref org) = current_org {
        load_effective_workspace_app_registration_governance(&state.db, org.id).await?
    } else {
        crate::shared::workspace_governance::EffectiveWorkspaceAppRegistrationGovernance {
            max_redirect_uris_per_app: workspace_governance
                .effective_default_max_redirect_uris_per_app(),
            max_allowed_embed_origins_per_app: workspace_governance
                .effective_default_max_allowed_embed_origins_per_app(),
        }
    };

    Ok(HttpResponse::Ok().json(TenantPortalResponse {
        current_org,
        organizations,
        permissions,
        current_user_role_codes,
        available_roles,
        max_logo_bytes: state.config.server.max_logo_bytes,
        demo_mode: crate::shared::demo_seed::demo_seed_enabled(),
        max_workspaces_allowed: workspace_governance.effective_max_workspaces(),
        max_apps_per_workspace: workspace_governance.effective_max_apps(),
        max_redirect_uris_per_app: effective_app_registration_governance.max_redirect_uris_per_app,
        max_allowed_embed_origins_per_app: effective_app_registration_governance
            .max_allowed_embed_origins_per_app,
    }))
}

/// Load public workspace branding for tenant-facing login screens by slug.
pub async fn public_branding_handler(
    state: web::Data<AppState>,
    query: web::Query<PublicBrandingQuery>,
) -> Result<HttpResponse, AppError> {
    let repo = OrganizationRepository::new(state.db.clone());
    let org = if let Some(workspace_id) = query.workspace_id {
        repo.get_organization_by_id(workspace_id).await?
    } else if let Some(slug) = query
        .slug
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if demo_seed_enabled() && !is_seeded_demo_org_slug(slug) {
            return Err(AppError::NotFound("Workspace not found".into()));
        }
        repo.get_organization_by_slug(slug).await?
    } else {
        return Err(AppError::Validation(
            "Workspace ID or slug is required.".into(),
        ));
    }
    .ok_or_else(|| AppError::NotFound("Workspace not found".into()))?;

    Ok(HttpResponse::Ok().json(PublicBrandingResponse {
        id: org.id,
        slug: org.slug,
        name: org.name,
        login_display_name: org.login_display_name,
        login_title: org.login_title,
        login_subtitle: org.login_subtitle,
        icon_url: org.icon_url,
        icon_container: org.icon_container.clone(),
        login_logo_url: org.login_logo_url,
        brand_color: org.brand_color,
        show_login_logo: org.show_login_logo,
        show_login_title: org.show_login_title,
        show_login_subtitle: org.show_login_subtitle,
        show_powered_by: org.show_powered_by,
        widget_radius: org.widget_radius,
        widget_shadow: org.widget_shadow,
        login_logo_container: org.login_logo_container.clone(),
        login_logo_size: org.login_logo_size.clone(),
        card_radius: org.card_radius,
        button_style: org.button_style,
        card_bg_style: org.card_bg_style,
        card_bg_color2: org.card_bg_color2,
        card_border_width: org.card_border_width,
        card_border_color: org.card_border_color,
        login_method_order: org.login_method_order,
    }))
}

/// Switch the current active session context to another organization
async fn switch_org(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<SwitchOrganizationRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    ensure_demo_workspace_allowed(&state, body.organization_id).await?;

    let repo = OrganizationRepository::new(state.db.clone());
    if !repo
        .is_org_admin_or_owner(body.organization_id, session.user_id)
        .await?
    {
        return Err(AppError::Forbidden(
            "Only workspace owners and workspace admins can open this workspace operator area."
                .into(),
        ));
    }
    let service = OrganizationService::new(repo, state.db.clone());

    let effective_ip_policy =
        resolve_effective_ip_policy(&state.db, Some(body.organization_id)).await?;
    let decision = evaluate_ip_access(
        &effective_ip_policy,
        crate::shared::request_ip::client_ip_from_http_request(&req, state.config.as_ref()),
    )?;
    if decision != crate::shared::ip_policy::IpAccessDecision::Allowed {
        return Err(AppError::Forbidden(access_denied_message(&decision).into()));
    }

    service
        .switch_organization_context(session.session_id, session.user_id, body.organization_id)
        .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Organization context switched successfully",
        "current_org_id": body.organization_id
    })))
}

/// Update branding for the current active organization when the user has branding:manage.
fn validate_hex_color(value: &str, field: &str) -> Result<(), AppError> {
    let s = value.trim();
    let valid = (s.len() == 7 || s.len() == 9)
        && s.starts_with('#')
        && s[1..].chars().all(|c| c.is_ascii_hexdigit());
    if !valid {
        return Err(AppError::Validation(format!(
            "{field} must be a hex color (#RRGGBB or #RRGGBBAA)."
        )));
    }
    Ok(())
}

/// Validate the `allowed_email_domains` field.
/// Format: comma-separated list of lowercase domain names (e.g. "example.com,acme.org").
/// Rules:
///   - Empty string means "no restriction" — always valid.
///   - Each domain must match hostname label rules: alphanumeric with hyphens,
///     no leading/trailing hyphens, separated by dots.
///   - Max 20 unique domains, each domain max 253 characters.
///   - Duplicates are rejected.
fn validate_allowed_email_domains(raw: &str) -> Result<(), AppError> {
    if raw.trim().is_empty() {
        return Ok(());
    }

    let domains: Vec<&str> = raw
        .split(',')
        .map(|d| d.trim())
        .filter(|d| !d.is_empty())
        .collect();

    if domains.len() > 20 {
        return Err(AppError::Validation(
            "allowed_email_domains may contain at most 20 domains.".into(),
        ));
    }

    let mut seen = std::collections::HashSet::new();
    for domain in &domains {
        let d = domain.to_lowercase();
        if d.len() > 253 {
            return Err(AppError::Validation(format!(
                "Domain '{}' exceeds 253 characters.",
                domain
            )));
        }
        // Must have at least one dot (e.g. "example.com"), not just a bare label
        if !d.contains('.') {
            return Err(AppError::Validation(format!(
                "'{}' is not a valid domain (must contain at least one dot, e.g. example.com).",
                domain
            )));
        }
        for label in d.split('.') {
            if label.is_empty() {
                return Err(AppError::Validation(format!(
                    "'{}' contains an empty label (double dot or leading/trailing dot).",
                    domain
                )));
            }
            if label.len() > 63 {
                return Err(AppError::Validation(format!(
                    "'{}' label '{}' exceeds 63 characters.",
                    domain, label
                )));
            }
            if label.starts_with('-') || label.ends_with('-') {
                return Err(AppError::Validation(format!(
                    "'{}' label '{}' must not start or end with a hyphen.",
                    domain, label
                )));
            }
            if !label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
                return Err(AppError::Validation(format!("'{}' label '{}' contains invalid characters (only letters, digits, hyphens allowed).", domain, label)));
            }
        }
        if !seen.insert(d.clone()) {
            return Err(AppError::Validation(format!(
                "Duplicate domain: '{}'.",
                domain
            )));
        }
    }

    Ok(())
}

fn validate_branding_url(value: &str, field: &str) -> Result<(), AppError> {
    if value.len() > 2048 {
        return Err(AppError::Validation(format!(
            "{field} must be 2048 characters or fewer."
        )));
    }
    if !value.starts_with('/') {
        let parsed = url::Url::parse(value)
            .map_err(|_| AppError::Validation(format!("{field} is not a valid URL.")))?;
        let scheme = parsed.scheme();
        let host = parsed.host_str().unwrap_or_default();
        let allow_dev_http = if scheme == "http" {
            host.eq_ignore_ascii_case("localhost")
                || host == "127.0.0.1"
                || host == "::1"
                || host
                    .parse::<std::net::IpAddr>()
                    .map(|ip| match ip {
                        std::net::IpAddr::V4(ipv4) => ipv4.is_private() || ipv4.is_loopback(),
                        std::net::IpAddr::V6(ipv6) => ipv6.is_loopback() || ipv6.is_unique_local(),
                    })
                    .unwrap_or(false)
        } else {
            false
        };
        if scheme != "https" && !allow_dev_http {
            return Err(AppError::Validation(format!(
                "{field} must use HTTPS (or HTTP on a local development host)."
            )));
        }
    }
    Ok(())
}

async fn update_current_org_branding(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdateCurrentOrganizationBrandingRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before updating branding.".into())
    })?;

    // Validate text field lengths
    if let Some(ref v) = body.login_display_name {
        if v.len() > 100 {
            return Err(AppError::Validation(
                "Login display name must be 100 characters or fewer.".into(),
            ));
        }
    }
    if let Some(ref v) = body.login_title {
        if v.len() > 200 {
            return Err(AppError::Validation(
                "Login title must be 200 characters or fewer.".into(),
            ));
        }
    }
    if let Some(ref v) = body.login_subtitle {
        if v.len() > 200 {
            return Err(AppError::Validation(
                "Login subtitle must be 200 characters or fewer.".into(),
            ));
        }
    }
    // Validate URL fields
    if let Some(ref v) = body.icon_url {
        if !v.is_empty() {
            validate_branding_url(v, "Icon URL")?;
        }
    }
    if let Some(ref v) = body.login_logo_url {
        if !v.is_empty() {
            validate_branding_url(v, "Login logo URL")?;
        }
    }
    // Validate color fields
    if let Some(ref v) = body.brand_color {
        if !v.is_empty() {
            validate_hex_color(v, "Brand color")?;
        }
    }
    if let Some(ref v) = body.card_bg_color2 {
        if !v.is_empty() {
            validate_hex_color(v, "Card background color")?;
        }
    }
    if let Some(ref v) = body.card_border_color {
        if !v.is_empty() {
            validate_hex_color(v, "Card border color")?;
        }
    }

    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "branding:manage")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to update workspace branding.".into(),
        ));
    }

    // Rename workspace if name provided
    if let Some(ref new_name) = body.name {
        let trimmed = new_name.trim();
        if trimmed.is_empty() {
            return Err(AppError::Validation(
                "Workspace name cannot be empty.".into(),
            ));
        }
        sqlx::query("UPDATE organizations SET name = $1, login_display_name = NULL, updated_at = NOW() WHERE id = $2")
            .bind(trimmed)
            .bind(org_id)
            .execute(&state.db)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to update workspace name: {e}")))?;
    }

    let repo = OrganizationRepository::new(state.db.clone());
    let service = OrganizationService::new(repo, state.db.clone());
    let org = service
        .update_branding(
            org_id,
            session.user_id,
            body.login_display_name
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.login_title
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.login_subtitle
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.icon_url
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.login_logo_url
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.brand_color
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.show_login_logo,
            body.show_login_title,
            body.show_login_subtitle,
            body.show_powered_by,
            body.widget_radius
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.widget_shadow
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.icon_container
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.login_logo_container
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.login_logo_size
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.card_radius
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.button_style
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.card_bg_style
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.card_bg_color2.clone().map(|v| v.trim().to_string()),
            body.card_border_width
                .clone()
                .map(|v| v.trim().to_string())
                .filter(|v| !v.is_empty()),
            body.card_border_color.clone().map(|v| v.trim().to_string()),
            body.login_method_order.clone(),
        )
        .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "workspace.branding.updated".into(),
            target_type: "organization".into(),
            target_id: Some(org_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "name_changed": body.name.is_some(),
                "login_display_name_changed": body.login_display_name.is_some(),
                "icon_url_changed": body.icon_url.is_some(),
                "login_logo_url_changed": body.login_logo_url.is_some(),
                "brand_color_changed": body.brand_color.is_some(),
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(org))
}

fn branding_asset_filename_ext(
    filename: Option<&str>,
    content_type: Option<&mime::Mime>,
) -> &'static str {
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

fn validate_branding_upload_part(
    field_name: Option<&str>,
    file_name: Option<&str>,
    content_type: Option<&mime::Mime>,
) -> Result<&'static str, AppError> {
    if field_name != Some("file") {
        return Err(AppError::Validation(
            "Branding upload must contain exactly one multipart field named 'file'.".into(),
        ));
    }

    let content_type_value = content_type
        .map(|value| value.essence_str())
        .ok_or_else(|| {
            AppError::Validation("Branding upload must include an image Content-Type.".into())
        })?;

    match content_type_value {
        "image/png" | "image/jpeg" | "image/webp" | "image/gif" | "image/svg+xml" => {}
        _ => {
            return Err(AppError::Validation(
                "Unsupported image Content-Type. Use PNG, JPG, WEBP, GIF, or SVG.".into(),
            ))
        }
    }

    let ext = branding_asset_filename_ext(file_name, content_type);
    if ext == "bin" {
        return Err(AppError::Validation(
            "Unsupported image format. Use PNG, JPG, WEBP, GIF, or SVG.".into(),
        ));
    }

    Ok(ext)
}

async fn upload_current_org_branding_asset(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<UploadBrandingAssetQuery>,
    mut payload: Multipart,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before uploading branding assets.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "branding:manage")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to upload workspace branding assets.".into(),
        ));
    }

    let asset_dir = match query.kind.trim() {
        "icon" => "icon",
        "login-logo" => "login-logo",
        _ => {
            return Err(AppError::Validation(
                "Upload kind must be 'icon' or 'login-logo'.".into(),
            ))
        }
    };

    let max_bytes = state.config.server.max_logo_bytes;
    let mut image: Option<(Vec<u8>, Option<mime::Mime>, &'static str)> = None;

    while let Some(mut field) = payload
        .try_next()
        .await
        .map_err(|e| AppError::Validation(format!("Invalid upload payload: {}", e)))?
    {
        if image.is_some() {
            return Err(AppError::Validation(
                "Branding upload must contain exactly one image file.".into(),
            ));
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
        let ext = validate_branding_upload_part(
            field_name.as_deref(),
            file_name.as_deref(),
            content_type.as_ref(),
        )?;

        let mut bytes = Vec::new();
        while let Some(chunk) = field
            .try_next()
            .await
            .map_err(|e| AppError::Validation(format!("Could not read uploaded file: {}", e)))?
        {
            if bytes.len() + chunk.len() > max_bytes {
                let mb = (max_bytes / (1024 * 1024)).max(1);
                return Err(AppError::Validation(format!(
                    "Image is too large. Maximum size is {}MB.",
                    mb
                )));
            }
            bytes.extend_from_slice(&chunk);
        }

        if bytes.is_empty() {
            return Err(AppError::Validation("Uploaded image file is empty.".into()));
        }

        image = Some((bytes, content_type, ext));
    }

    let (bytes, content_type, ext) =
        image.ok_or_else(|| AppError::Validation("No image file was uploaded.".into()))?;

    let relative_path = format!(
        "uploads/orgs/{}/{}/{}.{}",
        org_id,
        asset_dir,
        Uuid::new_v4(),
        ext
    );
    let url = store_public_asset(
        &state.db,
        state.config.as_ref(),
        &relative_path,
        &bytes,
        content_type.as_ref().map(|value| value.essence_str()),
    )
    .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "workspace.branding_asset.uploaded".into(),
            target_type: "organization".into(),
            target_id: Some(org_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "kind": asset_dir }),
        })
        .await;

    Ok(HttpResponse::Ok().json(UploadBrandingAssetResponse {
        url,
        kind: asset_dir.to_string(),
    }))
}

/// Update company-scoped auth method policy for the current active organization when the user has auth_policy:manage.
async fn update_current_org_auth_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdateCurrentOrganizationAuthPolicyRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before updating company sign-in policy.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "auth_policy:manage")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to update company sign-in policy.".into(),
        ));
    }

    // Capture before state for audit log and snapshot
    let repo = OrganizationRepository::new(state.db.clone());
    let before = repo.get_organization_by_id(org_id).await?;

    // Save snapshot before applying change (keep last 10)
    if let Some(ref b) = before {
        let snapshot = serde_json::json!({
            "allow_magic_link": b.allow_magic_link,
            "allow_google": b.allow_google,
            "allow_microsoft": b.allow_microsoft,
            "allow_passkey": b.allow_passkey,
            "require_mfa": b.require_mfa,
            "require_mfa_for_admins": b.require_mfa_for_admins,
            "tenant_portal_require_mfa": b.tenant_portal_require_mfa,
            "allowed_email_domains": b.allowed_email_domains,
            "max_session_age_hours": b.max_session_age_hours,
            "max_concurrent_sessions": b.max_concurrent_sessions,
        });
        let _ = sqlx::query(
            "INSERT INTO org_policy_snapshots (organization_id, snapshot, created_by) VALUES ($1, $2, $3)"
        )
        .bind(org_id)
        .bind(&snapshot)
        .bind(session.user_id)
        .execute(&state.db)
        .await;

        // Prune old snapshots beyond 10
        let _ = sqlx::query(
            r#"
            DELETE FROM org_policy_snapshots
            WHERE id IN (
                SELECT id FROM org_policy_snapshots
                WHERE organization_id = $1
                ORDER BY created_at DESC
                OFFSET 10
            )
            "#,
        )
        .bind(org_id)
        .execute(&state.db)
        .await;
    }

    // Validate allowed_email_domains format before persisting
    validate_allowed_email_domains(&body.allowed_email_domains)?;

    let service = OrganizationService::new(repo, state.db.clone());
    let org = service
        .update_auth_policy(
            org_id,
            session.user_id,
            body.allow_magic_link,
            body.allow_google,
            body.allow_microsoft,
            body.allow_passkey,
            body.require_mfa,
            body.require_mfa_for_admins,
            body.tenant_portal_require_mfa,
            &body.allowed_email_domains,
            body.max_session_age_hours,
            body.max_concurrent_sessions,
        )
        .await?;

    // Audit: record before/after for all policy fields
    if let Some(before) = before {
        AuditService::new(state.db.clone())
            .log(AuditEvent {
                actor_user_id: Some(session.user_id),
                organization_id: Some(org_id),
                action: "workspace.auth_policy.updated".into(),
                target_type: "organization".into(),
                target_id: Some(org_id.to_string()),
                ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                user_agent: req
                    .headers()
                    .get("user-agent")
                    .and_then(|h| h.to_str().ok())
                    .map(String::from),
                metadata: serde_json::json!({
                    "before": {
                        "allow_magic_link": before.allow_magic_link,
                        "allow_google": before.allow_google,
                        "allow_microsoft": before.allow_microsoft,
                        "allow_passkey": before.allow_passkey,
                        "require_mfa": before.require_mfa,
                        "require_mfa_for_admins": before.require_mfa_for_admins,
                        "tenant_portal_require_mfa": before.tenant_portal_require_mfa,
                        "allowed_email_domains": before.allowed_email_domains,
                        "max_session_age_hours": before.max_session_age_hours,
                        "max_concurrent_sessions": before.max_concurrent_sessions,
                    },
                    "after": {
                        "allow_magic_link": org.allow_magic_link,
                        "allow_google": org.allow_google,
                        "allow_microsoft": org.allow_microsoft,
                        "allow_passkey": org.allow_passkey,
                        "require_mfa": org.require_mfa,
                        "require_mfa_for_admins": org.require_mfa_for_admins,
                        "tenant_portal_require_mfa": org.tenant_portal_require_mfa,
                        "allowed_email_domains": org.allowed_email_domains,
                        "max_session_age_hours": org.max_session_age_hours,
                        "max_concurrent_sessions": org.max_concurrent_sessions,
                    },
                }),
            })
            .await;
    }

    Ok(HttpResponse::Ok().json(org))
}

async fn get_current_org_client_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before viewing client policy.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "org:update")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to view workspace client policy.".into(),
        ));
    }

    let platform = load_platform_client_governance(&state.db).await?;
    let tenant = load_tenant_client_policy(&state.db, org_id).await?;
    let effective = effective_client_policy(&platform, &tenant);

    Ok(HttpResponse::Ok().json(OrganizationClientPolicyResponse {
        platform,
        tenant,
        effective,
    }))
}

async fn update_current_org_client_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdateCurrentOrganizationClientPolicyRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before updating client policy.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "org:update")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to update workspace client policy.".into(),
        ));
    }

    let platform = load_platform_client_governance(&state.db).await?;
    if !platform.tenant_client_management_enabled {
        return Err(AppError::Forbidden(
            "Platform policy does not allow tenant-managed OAuth clients.".into(),
        ));
    }
    if body.allow_web_clients && !platform.tenant_web_clients_enabled {
        return Err(AppError::Validation(
            "Platform policy does not allow workspace web clients.".into(),
        ));
    }
    if body.allow_spa_clients && !platform.tenant_spa_clients_enabled {
        return Err(AppError::Validation(
            "Platform policy does not allow workspace SPA clients.".into(),
        ));
    }
    if body.allow_native_clients && !platform.tenant_native_clients_enabled {
        return Err(AppError::Validation(
            "Platform policy does not allow workspace native clients.".into(),
        ));
    }

    let repo = OrganizationRepository::new(state.db.clone());
    let service = OrganizationService::new(repo, state.db.clone());
    service
        .update_client_policy(
            org_id,
            session.user_id,
            body.allow_client_management,
            body.allow_web_clients,
            body.allow_spa_clients,
            body.allow_native_clients,
        )
        .await?;

    let tenant = load_tenant_client_policy(&state.db, org_id).await?;
    let effective = effective_client_policy(&platform, &tenant);

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "workspace.client_policy.updated".into(),
            target_type: "organization".into(),
            target_id: Some(org_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "allow_client_management": body.allow_client_management,
                "allow_web_clients": body.allow_web_clients,
                "allow_spa_clients": body.allow_spa_clients,
                "allow_native_clients": body.allow_native_clients,
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(OrganizationClientPolicyResponse {
        platform,
        tenant,
        effective,
    }))
}

async fn get_current_org_ip_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before viewing IP policy.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "org:update")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to view workspace IP policy.".into(),
        ));
    }

    let platform = load_platform_ip_policy(&state.db).await?;
    let tenant = load_tenant_ip_policy(&state.db, org_id).await?;
    let effective = resolve_effective_ip_policy(&state.db, Some(org_id)).await?;

    Ok(HttpResponse::Ok().json(OrganizationIpPolicyResponse {
        platform,
        tenant,
        effective,
    }))
}

async fn update_current_org_ip_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdateCurrentOrganizationIpPolicyRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before updating IP policy.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "org:update")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to update workspace IP policy.".into(),
        ));
    }

    let platform = load_platform_ip_policy(&state.db).await?;
    if body.use_custom_ip_policy && !platform.tenant_ip_policy_editable {
        return Err(AppError::Forbidden(
            "Platform policy does not allow workspace-specific IP policy overrides.".into(),
        ));
    }

    let tenant = TenantIpPolicy {
        use_custom_ip_policy: body.use_custom_ip_policy,
        allowlist: body.allowlist.clone(),
        blocklist: body.blocklist.clone(),
    };

    save_tenant_ip_policy(&state.db, org_id, &tenant).await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "workspace.ip_policy.updated".into(),
            target_type: "organization".into(),
            target_id: Some(org_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "use_custom_ip_policy": tenant.use_custom_ip_policy,
                "allowlist_count": tenant.allowlist.len(),
                "blocklist_count": tenant.blocklist.len(),
            }),
        })
        .await;

    let effective = resolve_effective_ip_policy(&state.db, Some(org_id)).await?;
    Ok(HttpResponse::Ok().json(OrganizationIpPolicyResponse {
        platform,
        tenant: load_tenant_ip_policy(&state.db, org_id).await?,
        effective,
    }))
}

/// List members for the current active organization in a tenant-friendly shape.
async fn list_current_org_members(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before viewing company members.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "members:read")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to view company members.".into(),
        ));
    }

    let repo = OrganizationRepository::new(state.db.clone());
    let service = OrganizationService::new(repo, state.db.clone());
    let members = service
        .get_organization_member_views(org_id, session.user_id)
        .await?;

    Ok(HttpResponse::Ok().json(members))
}

/// List audit activity for the current workspace with pagination and filtering.
async fn list_current_org_activity(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<ActivityQuery>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before viewing company activity.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "activity:read")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to view company activity.".into(),
        ));
    }

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 1000);
    let search_raw = query.search.as_deref().unwrap_or("").trim();
    if search_raw.len() > 256 {
        return Err(AppError::Validation(
            "Search query is too long (max 256 characters).".into(),
        ));
    }
    let search = search_raw.to_lowercase();
    let action_filter = query
        .action
        .as_deref()
        .unwrap_or("all")
        .trim()
        .to_lowercase();
    let date_from = query
        .date_from
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let date_to = query
        .date_to
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let repo = OrganizationRepository::new(state.db.clone());
    let service = OrganizationService::new(repo, state.db.clone());
    let (items, total) = service
        .get_organization_activity(
            org_id,
            session.user_id,
            page,
            page_size,
            &search,
            &action_filter,
            date_from.as_deref(),
            date_to.as_deref(),
        )
        .await?;

    Ok(HttpResponse::Ok().json(PaginatedActivityResponse {
        items: items
            .into_iter()
            .map(|item| TenantActivityResponse {
                id: item.id,
                actor_user_id: item.actor_user_id,
                actor_display_name: item.actor_display_name,
                actor_email: item.actor_email,
                action: item.action,
                target_type: item.target_type,
                target_id: item.target_id,
                ip: item.ip,
                metadata: item.metadata,
                created_at: item.created_at,
            })
            .collect(),
        total,
        page,
        page_size,
    }))
}

async fn list_current_org_security_alert_reviews(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before viewing suspicious-auth reviews.".into())
    })?;

    let repo = OrganizationRepository::new(state.db.clone());
    if !repo.is_org_admin_or_owner(org_id, session.user_id).await? {
        return Err(AppError::Forbidden(
            "You do not have permission to view suspicious-auth reviews.".into(),
        ));
    }

    let items = sqlx::query_as::<_, SecurityAlertReviewItem>(
        r#"
        SELECT
            sar.alert_key,
            sar.reviewed_by_user_id,
            u.display_name AS reviewed_by_display_name,
            ue.email AS reviewed_by_email,
            sar.reviewed_at
        FROM security_alert_reviews sar
        LEFT JOIN users u ON u.id = sar.reviewed_by_user_id
        LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
        WHERE sar.scope_type = 'organization' AND sar.scope_id = $1
        ORDER BY sar.reviewed_at DESC
        "#,
    )
    .bind(org_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Failed to load workspace security alert reviews: {e}"
        ))
    })?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "items": items })))
}

async fn mark_current_org_security_alert_reviewed(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<MarkSecurityAlertReviewRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before reviewing suspicious-auth alerts.".into())
    })?;

    let repo = OrganizationRepository::new(state.db.clone());
    if !repo.is_org_admin_or_owner(org_id, session.user_id).await? {
        return Err(AppError::Forbidden(
            "You do not have permission to review suspicious-auth alerts.".into(),
        ));
    }

    let alert_key = body.alert_key.trim();
    if alert_key.is_empty() {
        return Err(AppError::Validation("alert_key is required.".into()));
    }

    sqlx::query(
        r#"
        INSERT INTO security_alert_reviews (scope_type, scope_id, alert_key, reviewed_by_user_id, reviewed_at)
        VALUES ('organization', $1, $2, $3, NOW())
        ON CONFLICT (scope_type, scope_id, alert_key)
        DO UPDATE SET reviewed_by_user_id = EXCLUDED.reviewed_by_user_id, reviewed_at = NOW()
        "#
    )
    .bind(org_id)
    .bind(alert_key)
    .bind(session.user_id)
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to save workspace security alert review: {e}")))?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "workspace.security_alert.reviewed".into(),
            target_type: "security_alert".into(),
            target_id: Some(alert_key.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "alert_key": alert_key }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "ok": true })))
}

async fn reset_current_org_security_alert_reviews(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before resetting suspicious-auth reviews.".into())
    })?;

    let repo = OrganizationRepository::new(state.db.clone());
    if !repo.is_org_admin_or_owner(org_id, session.user_id).await? {
        return Err(AppError::Forbidden(
            "You do not have permission to reset suspicious-auth reviews.".into(),
        ));
    }

    sqlx::query(
        "DELETE FROM security_alert_reviews WHERE scope_type = 'organization' AND scope_id = $1",
    )
    .bind(org_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Failed to reset workspace security alert reviews: {e}"
        ))
    })?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "workspace.security_alert.reviews_reset".into(),
            target_type: "security_alert".into(),
            target_id: Some(org_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({}),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "ok": true })))
}

/// Export the current workspace audit log as CSV or JSON (max 10 000 rows).
async fn export_current_org_activity(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<ActivityExportQuery>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before exporting activity.".into())
    })?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "activity:read")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to export workspace activity.".into(),
        ));
    }

    let search_raw = query.search.as_deref().unwrap_or("").trim();
    if search_raw.len() > 256 {
        return Err(AppError::Validation(
            "Search query is too long (max 256 characters).".into(),
        ));
    }
    let search = search_raw.to_lowercase();
    let action_filter = query
        .action
        .as_deref()
        .unwrap_or("all")
        .trim()
        .to_lowercase();
    let format = query.format.as_deref().unwrap_or("csv").to_lowercase();
    let date_from = query
        .date_from
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let date_to = query
        .date_to
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    // Fetch up to 10 000 rows (page 1, page_size 10 000)
    let repo = OrganizationRepository::new(state.db.clone());
    let service = OrganizationService::new(repo, state.db.clone());
    let (items, _) = service
        .get_organization_activity(
            org_id,
            session.user_id,
            1,
            10_000,
            &search,
            &action_filter,
            date_from.as_deref(),
            date_to.as_deref(),
        )
        .await?;

    if format == "json" {
        let json_items: Vec<serde_json::Value> = items
            .iter()
            .map(|item| {
                serde_json::json!({
                    "id": item.id,
                    "actor_user_id": item.actor_user_id,
                    "actor_display_name": item.actor_display_name,
                    "actor_email": item.actor_email,
                    "action": item.action,
                    "target_type": item.target_type,
                    "target_id": item.target_id,
                    "ip": item.ip,
                    "metadata": item.metadata,
                    "created_at": item.created_at.to_rfc3339(),
                })
            })
            .collect();

        return Ok(HttpResponse::Ok()
            .insert_header(("Content-Type", "application/json"))
            .insert_header((
                "Content-Disposition",
                "attachment; filename=\"activity.json\"",
            ))
            .json(json_items));
    }

    // Default: CSV
    let mut csv = String::from("id,actor_user_id,actor_email,actor_display_name,action,target_type,target_id,ip,metadata,created_at\n");
    for item in &items {
        // Escape for CSV: wrap in quotes, double internal quotes.
        // Also prepend a tab to values that start with formula-injection characters
        // (=, +, -, @) to prevent spreadsheet formula execution.
        let escape = |s: &str| {
            let s = s.replace('"', "\"\"");
            if s.starts_with(['=', '+', '-', '@', '\t', '\r']) {
                format!("\"\t{}\"", s)
            } else {
                format!("\"{}\"", s)
            }
        };
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},{}\n",
            item.id,
            item.actor_user_id
                .map(|u| u.to_string())
                .unwrap_or_default(),
            escape(item.actor_email.as_deref().unwrap_or("")),
            escape(item.actor_display_name.as_deref().unwrap_or("")),
            escape(&item.action),
            escape(&item.target_type),
            escape(item.target_id.as_deref().unwrap_or("")),
            escape(item.ip.as_deref().unwrap_or("")),
            escape(&item.metadata.to_string()),
            item.created_at.to_rfc3339(),
        ));
    }

    Ok(HttpResponse::Ok()
        .insert_header(("Content-Type", "text/csv; charset=utf-8"))
        .insert_header((
            "Content-Disposition",
            "attachment; filename=\"activity.csv\"",
        ))
        .body(csv))
}

/// List audit activity across all orgs the current user owns or administers.
async fn list_my_orgs_activity(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<ActivityQuery>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let user_id = session.user_id;

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 1000);
    let offset = (page - 1) * page_size;
    let search_raw = query.search.as_deref().unwrap_or("").trim();
    if search_raw.len() > 256 {
        return Err(AppError::Validation(
            "Search query is too long (max 256 characters).".into(),
        ));
    }
    let search = search_raw.to_lowercase();
    let action_filter = query
        .action
        .as_deref()
        .unwrap_or("all")
        .trim()
        .to_lowercase();
    let date_from = query
        .date_from
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let date_to = query
        .date_to
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    // Org IDs where the user is owner or admin (has a role with 'owner' or 'admin' code).
    let org_ids: Vec<Uuid> = sqlx::query_scalar(
        r#"
        SELECT DISTINCT om.organization_id
        FROM organization_members om
        JOIN member_roles mr ON mr.member_id = om.id
        JOIN roles r ON r.id = mr.role_id
        WHERE om.user_id = $1
          AND r.code IN ('owner', 'admin')
          AND om.status = 'active'
        "#,
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Failed to load workspace ids for cross-workspace activity: {e}"
        ))
    })?;

    if org_ids.is_empty() {
        return Ok(
            HttpResponse::Ok().json(PaginatedActivityResponse::<TenantActivityResponse> {
                items: vec![],
                total: 0,
                page,
                page_size,
            }),
        );
    }

    let total: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
        WHERE (
                al.organization_id = ANY($1)
                OR (al.organization_id IS NULL AND al.actor_user_id = $2)
              )
          AND ($3 = '' OR al.action ILIKE '%' || $3 || '%' OR al.target_type ILIKE '%' || $3 || '%'
               OR COALESCE(al.target_id, '') ILIKE '%' || $3 || '%'
               OR COALESCE(al.ip::text, '') ILIKE '%' || $3 || '%'
               OR COALESCE(ue.email, '') ILIKE '%' || $3 || '%'
               OR COALESCE(u.display_name, '') ILIKE '%' || $3 || '%')
          AND ($4 = 'all' OR ($4 = 'success' AND al.action LIKE '%success%')
               OR ($4 = 'failed' AND al.action LIKE '%failed%')
               OR ($4 = 'suspicious' AND al.action LIKE '%suspicious%'))
          AND ($5::date IS NULL OR al.created_at >= $5::date)
          AND ($6::date IS NULL OR al.created_at < ($6::date + interval '1 day'))
        "#,
    )
    .bind(&org_ids)
    .bind(user_id)
    .bind(&search)
    .bind(&action_filter)
    .bind(&date_from)
    .bind(&date_to)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Failed to count cross-workspace activity entries: {e}"
        ))
    })?;

    let items = sqlx::query_as::<_, OrganizationActivityItem>(
        r#"
        SELECT
            al.id,
            al.actor_user_id,
            u.display_name AS actor_display_name,
            ue.email AS actor_email,
            al.action,
            al.target_type,
            al.target_id,
            al.ip::text AS ip,
            al.user_agent,
            al.metadata,
            al.created_at
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
        WHERE (
                al.organization_id = ANY($1)
                OR (al.organization_id IS NULL AND al.actor_user_id = $2)
              )
          AND ($3 = '' OR al.action ILIKE '%' || $3 || '%' OR al.target_type ILIKE '%' || $3 || '%'
               OR COALESCE(al.target_id, '') ILIKE '%' || $3 || '%'
               OR COALESCE(al.ip::text, '') ILIKE '%' || $3 || '%'
               OR COALESCE(ue.email, '') ILIKE '%' || $3 || '%'
               OR COALESCE(u.display_name, '') ILIKE '%' || $3 || '%')
          AND ($4 = 'all' OR ($4 = 'success' AND al.action LIKE '%success%')
               OR ($4 = 'failed' AND al.action LIKE '%failed%')
               OR ($4 = 'suspicious' AND al.action LIKE '%suspicious%'))
          AND ($5::date IS NULL OR al.created_at >= $5::date)
          AND ($6::date IS NULL OR al.created_at < ($6::date + interval '1 day'))
        ORDER BY al.created_at DESC
        LIMIT $7 OFFSET $8
        "#,
    )
    .bind(&org_ids)
    .bind(user_id)
    .bind(&search)
    .bind(&action_filter)
    .bind(&date_from)
    .bind(&date_to)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Failed to load cross-workspace activity entries: {e}"
        ))
    })?;

    Ok(HttpResponse::Ok().json(PaginatedActivityResponse {
        items: items
            .into_iter()
            .map(|item| TenantActivityResponse {
                id: item.id,
                actor_user_id: item.actor_user_id,
                actor_display_name: item.actor_display_name,
                actor_email: item.actor_email,
                action: item.action,
                target_type: item.target_type,
                target_id: item.target_id,
                ip: item.ip,
                metadata: item.metadata,
                created_at: item.created_at,
            })
            .collect(),
        total,
        page,
        page_size,
    }))
}

/// List all members in the specified organization
async fn list_org_members(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let target_org_id = path.into_inner();

    let repo = OrganizationRepository::new(state.db.clone());
    let service = OrganizationService::new(repo, state.db.clone());

    let members = service
        .get_organization_members(target_org_id, session.user_id)
        .await?;

    Ok(HttpResponse::Ok().json(members))
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SendInviteRequest {
    pub email: String,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateMemberRoleRequest {
    pub role_code: String,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AcceptInviteRequest {
    pub token: String,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InvitePath {
    pub invite_id: Uuid,
}

/// Send an invitation to join an organization
async fn send_invite(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<SendInviteRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let target_org_id = path.into_inner();

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, target_org_id, "members:invite")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to invite members to this workspace.".into(),
        ));
    }

    let repo = OrganizationRepository::new(state.db.clone());
    let service = OrganizationService::new(repo, state.db.clone());

    service
        .send_invite(target_org_id, session.user_id, &body.email)
        .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(target_org_id),
            action: "workspace.invite.sent".into(),
            target_type: "invite".into(),
            target_id: None,
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "invited_email": body.email }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Invitation sent successfully",
    })))
}

/// Send an invitation to the current active organization for tenant admins.
async fn send_current_org_invite(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<SendInviteRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before inviting a company member.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "members:invite")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to invite company members.".into(),
        ));
    }

    let repo = OrganizationRepository::new(state.db.clone());
    let service = OrganizationService::new(repo, state.db.clone());
    service
        .send_invite(org_id, session.user_id, &body.email)
        .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "workspace.invite.sent".into(),
            target_type: "invite".into(),
            target_id: None,
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "invited_email": body.email }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Invitation sent successfully",
    })))
}

async fn list_current_org_invites(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before viewing invitations.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "members:invite")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to view workspace invitations.".into(),
        ));
    }

    let repo = OrganizationRepository::new(state.db.clone());
    let service = OrganizationService::new(repo, state.db.clone());
    let invites = service
        .list_pending_invites(org_id, session.user_id)
        .await?;

    Ok(HttpResponse::Ok().json(invites))
}

async fn revoke_current_org_invite(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<InvitePath>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before revoking invitations.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "members:invite")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to revoke workspace invitations.".into(),
        ));
    }

    let repo = OrganizationRepository::new(state.db.clone());
    let service = OrganizationService::new(repo, state.db.clone());
    let invite = service
        .revoke_invite(org_id, session.user_id, path.into_inner().invite_id)
        .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "workspace.invite.revoked".into(),
            target_type: "invite".into(),
            target_id: Some(invite.id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "invited_email": invite.email }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Invitation revoked successfully",
    })))
}

/// Update a company member role within the current active workspace.
async fn update_current_org_member_role(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<UpdateMemberRoleRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before updating company member roles.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "roles:manage")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to manage company roles.".into(),
        ));
    }

    let member_id = path.into_inner();
    let new_role = body.role_code.trim().to_string();

    // Capture the member's current role(s) before changing
    let before_roles: Vec<String> = sqlx::query_scalar(
        r#"
        SELECT r.code FROM roles r
        JOIN member_roles mr ON mr.role_id = r.id
        JOIN organization_members om ON om.id = mr.member_id
        WHERE om.id = $1 AND om.organization_id = $2
        "#,
    )
    .bind(member_id)
    .bind(org_id)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    let repo = OrganizationRepository::new(state.db.clone());
    let service = OrganizationService::new(repo, state.db.clone());

    // Resolve user_id for this member before the role change
    let target_user_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT user_id FROM organization_members WHERE id = $1 AND organization_id = $2",
    )
    .bind(member_id)
    .bind(org_id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    service
        .update_member_role(org_id, session.user_id, member_id, &new_role)
        .await?;

    // Revoke the member's active sessions scoped to this org so the new role
    // takes effect immediately rather than at next session expiry.
    if let Some(uid) = target_user_id {
        let _ = sqlx::query(
            "UPDATE sessions SET revoked_at = NOW() \
             WHERE user_id = $1 AND current_org_id = $2 \
             AND revoked_at IS NULL AND expires_at > NOW()",
        )
        .bind(uid)
        .bind(org_id)
        .execute(&state.db)
        .await;
    }

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "workspace.member.role_changed".into(),
            target_type: "member".into(),
            target_id: Some(member_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "before_roles": before_roles,
                "after_role": new_role,
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Member role updated successfully",
    })))
}

/// Remove a member from the current active organization.
async fn remove_current_org_member(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before removing a member.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "members:manage")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to remove workspace members.".into(),
        ));
    }

    let member_id = path.into_inner();

    // Prevent self-removal via this endpoint
    let is_self: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM organization_members WHERE id = $1 AND user_id = $2)",
    )
    .bind(member_id)
    .bind(session.user_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if is_self {
        return Err(AppError::Validation(
            "You cannot remove yourself. Transfer ownership first.".into(),
        ));
    }

    let repo = OrganizationRepository::new(state.db.clone());
    let removed_user_id = repo.remove_member(org_id, member_id).await?;

    // Revoke removed member's org-scoped sessions immediately
    sqlx::query(
        "UPDATE sessions SET revoked_at = NOW() \
         WHERE user_id = $1 AND current_org_id = $2 \
         AND revoked_at IS NULL AND expires_at > NOW()",
    )
    .bind(removed_user_id)
    .bind(org_id)
    .execute(&state.db)
    .await?;

    // Cascade: revoke OIDC tokens for those sessions
    sqlx::query(
        "UPDATE oauth_refresh_tokens SET revoked_at = NOW() \
         WHERE user_id = $1 AND revoked_at IS NULL \
         AND session_id IN (SELECT id FROM sessions WHERE user_id = $1 AND current_org_id = $2)",
    )
    .bind(removed_user_id)
    .bind(org_id)
    .execute(&state.db)
    .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "workspace.member.removed".into(),
            target_type: "member".into(),
            target_id: Some(removed_user_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "member_id": member_id }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Member removed from workspace.",
    })))
}

/// Accept an invitation to join an organization
async fn accept_invite(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<AcceptInviteRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;

    let repo = OrganizationRepository::new(state.db.clone());
    let service = OrganizationService::new(repo, state.db.clone());

    let org_id = service.accept_invite(session.user_id, &body.token).await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "workspace.invite.accepted".into(),
            target_type: "member".into(),
            target_id: Some(session.user_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({}),
        })
        .await;

    let org_slug: Option<String> =
        sqlx::query_scalar("SELECT slug FROM organizations WHERE id = $1")
            .bind(org_id)
            .fetch_optional(&state.db)
            .await
            .ok()
            .flatten();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Invitation accepted. You are now a member.",
        "organization_id": org_id,
        "org_slug": org_slug,
    })))
}

// ── Org-scoped OAuth clients ─────────────────────────────────────────────────

#[derive(Clone, serde::Serialize, sqlx::FromRow)]
pub struct OrgOAuthClient {
    pub id: uuid::Uuid,
    pub client_id: String,
    pub app_name: String,
    pub app_icon_url: Option<String>,
    pub app_type: String,
    pub status: String,
    pub is_first_party: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

pub fn demo_app_icon_url(app_name: &str) -> Option<&'static str> {
    match app_name {
        "RooChoco Portal" => Some("/assets/demo/rooiam-logo-roochoco.png"),
        "MintMallow Portal" => Some("/assets/demo/rooiam-logo-mintmallow.png"),
        "MelonHoneyToast Portal" => Some("/assets/demo/rooiam-melonhoneytoast.jpg"),
        "BerryBurger Portal" => Some("/assets/demo/rooiam-berryburger.jpg"),
        "MooPizza Portal" => Some("/assets/demo/rooiam-moopizza.jpg"),
        _ => None,
    }
}

#[derive(Clone, serde::Serialize)]
pub struct OrgClientResponse {
    pub client: OrgOAuthClient,
    pub redirect_uris: Vec<String>,
    pub allowed_embed_origins: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_secret: Option<String>,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct CreateOrgClientRequest {
    pub app_name: String,
    pub app_type: String,
    pub redirect_uris: Vec<String>,
    #[serde(default)]
    pub allowed_embed_origins: Vec<String>,
    #[serde(default)]
    pub confirm_multi_origin: bool,
}

#[derive(serde::Serialize)]
pub struct RotateOrgClientSecretResponse {
    pub client_id: String,
    pub client_secret: String,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateOrgClientStatusRequest {
    pub status: String,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateOrgClientRequest {
    pub app_name: String,
    pub redirect_uris: Vec<String>,
    #[serde(default)]
    pub allowed_embed_origins: Vec<String>,
    #[serde(default)]
    pub confirm_multi_origin: bool,
}

fn requires_multi_origin_confirmation(
    redirect_uris: &[String],
    allowed_embed_origins: &[String],
) -> bool {
    let mut origins = std::collections::BTreeSet::new();
    for value in redirect_uris {
        if let Ok(parsed) = Url::parse(value.trim()) {
            origins.insert(parsed.origin().ascii_serialization());
        }
    }
    for value in allowed_embed_origins {
        origins.insert(value.trim().to_string());
    }
    origins.len() > 1
}

pub async fn load_client_allowed_embed_origins(
    db: &sqlx::PgPool,
    client_id: uuid::Uuid,
) -> Result<Vec<String>, AppError> {
    let mut origins = sqlx::query_scalar::<_, String>(
        "SELECT origin FROM oauth_client_allowed_embed_origins WHERE oauth_client_id = $1 ORDER BY origin LIMIT $2"
    )
    .bind(client_id)
    .bind(ORG_CLIENT_REDIRECT_URI_LIMIT)
    .fetch_all(db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load client allowed embed origins: {e}")))?;

    if origins.is_empty() {
        let redirect_uris = sqlx::query_scalar::<_, String>(
            "SELECT redirect_uri FROM oauth_client_redirect_uris WHERE oauth_client_id = $1 ORDER BY redirect_uri LIMIT $2"
        )
        .bind(client_id)
        .bind(ORG_CLIENT_REDIRECT_URI_LIMIT)
        .fetch_all(db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to load fallback client redirect URIs: {e}")))?;

        for redirect_uri in redirect_uris {
            if let Ok(parsed) = Url::parse(redirect_uri.trim()) {
                let origin = parsed.origin().ascii_serialization();
                if !origins.iter().any(|existing| existing == &origin) {
                    origins.push(origin);
                }
            }
        }
        origins.sort();
    }

    Ok(origins)
}

/// List OAuth clients owned by the current active organization.
async fn list_current_org_clients(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session
        .current_org_id
        .ok_or_else(|| AppError::Validation("Select a workspace before viewing clients.".into()))?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "org:update")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to view company clients.".into(),
        ));
    }

    let client_rows = sqlx::query!(
        "SELECT id, client_id, app_name, app_type, status, is_first_party, created_at FROM oauth_clients WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2",
        org_id,
        ORG_CLIENT_LIST_LIMIT
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace OAuth clients: {e}")))?;

    let clients = client_rows
        .into_iter()
        .map(|client| OrgOAuthClient {
            id: client.id,
            client_id: client.client_id,
            app_name: client.app_name.clone(),
            app_icon_url: demo_app_icon_url(&client.app_name).map(str::to_string),
            app_type: client.app_type,
            status: client.status,
            is_first_party: client.is_first_party,
            created_at: client.created_at,
        })
        .collect::<Vec<_>>();

    let mut responses = Vec::with_capacity(clients.len());
    for client in clients {
        let redirect_uris = sqlx::query_scalar::<_, String>(
            "SELECT redirect_uri FROM oauth_client_redirect_uris WHERE oauth_client_id = $1 ORDER BY redirect_uri LIMIT $2"
        )
        .bind(client.id)
        .bind(ORG_CLIENT_REDIRECT_URI_LIMIT)
        .fetch_all(&state.db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to load workspace client redirect URIs: {e}")))?;
        let allowed_embed_origins = load_client_allowed_embed_origins(&state.db, client.id).await?;
        responses.push(OrgClientResponse {
            client,
            redirect_uris,
            allowed_embed_origins,
            client_secret: None,
        });
    }

    Ok(HttpResponse::Ok().json(responses))
}

/// Create an OAuth client scoped to the current active organization.
async fn create_current_org_client(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<CreateOrgClientRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before creating a client.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "org:update")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to create company clients.".into(),
        ));
    }

    let platform_policy = load_platform_client_governance(&state.db).await?;
    let workspace_governance = load_platform_workspace_governance(&state.db).await?;
    let tenant_policy = load_tenant_client_policy(&state.db, org_id).await?;
    let effective_policy = effective_client_policy(&platform_policy, &tenant_policy);
    if !effective_policy.allow_client_management {
        return Err(AppError::Forbidden(
            "Workspace-managed OAuth clients are disabled by platform or workspace policy.".into(),
        ));
    }

    if body.app_name.trim().is_empty() {
        return Err(AppError::Validation("App name is required.".into()));
    }
    if !["web", "spa", "native"].contains(&body.app_type.as_str()) {
        return Err(AppError::Validation(
            "app_type must be web, spa, or native.".into(),
        ));
    }
    if !is_client_type_allowed(&effective_policy, &body.app_type) {
        return Err(AppError::Forbidden(format!(
            "{} clients are disabled by platform or workspace policy.",
            body.app_type.to_uppercase()
        )));
    }
    let app_registration_governance =
        load_effective_workspace_app_registration_governance(&state.db, org_id).await?;
    let redirect_uris = normalize_client_redirect_uris_with_limit(
        &body.app_type,
        &body.redirect_uris,
        app_registration_governance.max_redirect_uris_per_app as usize,
    )?;
    let allowed_embed_origins = normalize_client_allowed_embed_origins_with_limit(
        &body.allowed_embed_origins,
        app_registration_governance.max_allowed_embed_origins_per_app as usize,
    )?;
    if requires_multi_origin_confirmation(&redirect_uris, &allowed_embed_origins)
        && !body.confirm_multi_origin
    {
        return Err(AppError::Validation(
            "This app spans multiple site origins. Confirm the multi-origin app setup or create separate apps per site/environment.".into(),
        ));
    }
    let app_limit = workspace_governance.effective_max_apps();
    let existing_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM oauth_clients WHERE org_id = $1")
            .bind(org_id)
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                AppError::Internal(format!("Failed to count workspace OAuth clients: {e}"))
            })?;

    if existing_count >= i64::from(app_limit) {
        return Err(AppError::Validation(format!(
            "Workspace app limit reached. This workspace can create up to {} apps.",
            app_limit
        )));
    }

    let client_id = generate_client_id();

    let mut client_secret = None;
    let mut client_secret_hash = None;
    if body.app_type == "web" {
        let (secret, hash) = generate_confidential_client_secret()?;
        client_secret = Some(secret.clone());
        client_secret_hash = Some(hash);
    }

    let mut tx = state.db.begin().await.map_err(|e| {
        AppError::Internal(format!(
            "Failed to begin workspace client creation transaction: {e}"
        ))
    })?;

    let client = sqlx::query_as::<_, OrgOAuthClient>(
        r#"
        INSERT INTO oauth_clients (client_id, client_secret_hash, app_name, app_type, status, owner_user_id, org_id, is_first_party)
        VALUES ($1, $2, $3, $4, 'active', $5, $6, false)
        RETURNING id, client_id, app_name, NULL::text AS app_icon_url, app_type, status, is_first_party, created_at
        "#
    )
    .bind(&client_id)
    .bind(&client_secret_hash)
    .bind(body.app_name.trim())
    .bind(&body.app_type)
    .bind(session.user_id)
    .bind(org_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to create workspace OAuth client: {e}")))?;

    for uri in &redirect_uris {
        sqlx::query("INSERT INTO oauth_client_redirect_uris (oauth_client_id, redirect_uri) VALUES ($1, $2)")
            .bind(client.id)
            .bind(uri)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to save workspace client redirect URI: {e}")))?;
    }
    for origin in &allowed_embed_origins {
        sqlx::query("INSERT INTO oauth_client_allowed_embed_origins (oauth_client_id, origin) VALUES ($1, $2)")
            .bind(client.id)
            .bind(origin)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to save workspace client allowed embed origin: {e}")))?;
    }

    tx.commit().await.map_err(|e| {
        AppError::Internal(format!(
            "Failed to commit workspace client creation transaction: {e}"
        ))
    })?;

    crate::modules::audit::service::AuditService::new(state.db.clone())
        .log(crate::modules::audit::service::AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "oauth_client.created".into(),
            target_type: "oauth_client".into(),
            target_id: Some(client.id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "app_name": client.app_name }),
        })
        .await;

    Ok(HttpResponse::Created().json(OrgClientResponse {
        client,
        redirect_uris,
        allowed_embed_origins,
        client_secret,
    }))
}

/// Rotate the client secret for a confidential workspace-scoped OAuth client.
async fn rotate_current_org_client_secret(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<uuid::Uuid>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before rotating a client secret.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;
    let client_id_param = path.into_inner();

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "org:update")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to rotate company client secrets.".into(),
        ));
    }

    let client = sqlx::query_as::<_, OrgOAuthClient>(
        "SELECT id, client_id, app_name, app_type, status, is_first_party, created_at FROM oauth_clients WHERE id = $1 AND org_id = $2"
    )
    .bind(client_id_param)
    .bind(org_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace OAuth client for secret rotation: {e}")))?
    .ok_or_else(|| AppError::NotFound("Client not found in your workspace.".into()))?;

    if client.app_type != "web" {
        return Err(AppError::Validation(
            "Only confidential web clients can rotate a client secret.".into(),
        ));
    }
    if client.status != "active" {
        return Err(AppError::Validation(
            "Paused clients cannot rotate a client secret until resumed.".into(),
        ));
    }

    let (client_secret, client_secret_hash) = generate_confidential_client_secret()?;

    sqlx::query("UPDATE oauth_clients SET client_secret_hash = $1 WHERE id = $2 AND org_id = $3")
        .bind(&client_secret_hash)
        .bind(client.id)
        .bind(org_id)
        .execute(&state.db)
        .await
        .map_err(|e| {
            AppError::Internal(format!("Failed to rotate workspace client secret: {e}"))
        })?;

    crate::modules::audit::service::AuditService::new(state.db.clone())
        .log(crate::modules::audit::service::AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "oauth_client.secret_rotated".into(),
            target_type: "oauth_client".into(),
            target_id: Some(client.id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "app_name": client.app_name }),
        })
        .await;

    Ok(HttpResponse::Ok().json(RotateOrgClientSecretResponse {
        client_id: client.client_id,
        client_secret,
    }))
}

async fn update_current_org_client(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<uuid::Uuid>,
    body: web::Json<UpdateOrgClientRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before updating a client.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;
    let client_id_param = path.into_inner();

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "org:update")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to update company clients.".into(),
        ));
    }

    if body.app_name.trim().is_empty() {
        return Err(AppError::Validation("App name is required.".into()));
    }

    let existing = sqlx::query_as::<_, OrgOAuthClient>(
        "SELECT id, client_id, app_name, NULL::text AS app_icon_url, app_type, status, is_first_party, created_at FROM oauth_clients WHERE id = $1 AND org_id = $2"
    )
    .bind(client_id_param)
    .bind(org_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace OAuth client for update: {e}")))?
    .ok_or_else(|| AppError::NotFound("Client not found in your workspace.".into()))?;

    let app_registration_governance =
        load_effective_workspace_app_registration_governance(&state.db, org_id).await?;
    let redirect_uris = normalize_client_redirect_uris_with_limit(
        &existing.app_type,
        &body.redirect_uris,
        app_registration_governance.max_redirect_uris_per_app as usize,
    )?;
    let allowed_embed_origins = normalize_client_allowed_embed_origins_with_limit(
        &body.allowed_embed_origins,
        app_registration_governance.max_allowed_embed_origins_per_app as usize,
    )?;
    if requires_multi_origin_confirmation(&redirect_uris, &allowed_embed_origins)
        && !body.confirm_multi_origin
    {
        return Err(AppError::Validation(
            "This app spans multiple site origins. Confirm the multi-origin app setup or create separate apps per site/environment.".into(),
        ));
    }

    let mut tx = state.db.begin().await.map_err(|e| {
        AppError::Internal(format!(
            "Failed to begin workspace client update transaction: {e}"
        ))
    })?;

    let updated_client = sqlx::query_as::<_, OrgOAuthClient>(
        r#"
        UPDATE oauth_clients
        SET app_name = $1
        WHERE id = $2 AND org_id = $3
        RETURNING id, client_id, app_name, NULL::text AS app_icon_url, app_type, status, is_first_party, created_at
        "#
    )
    .bind(body.app_name.trim())
    .bind(client_id_param)
    .bind(org_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to update workspace OAuth client: {e}")))?;

    sqlx::query("DELETE FROM oauth_client_redirect_uris WHERE oauth_client_id = $1")
        .bind(client_id_param)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Failed to clear workspace client redirect URIs: {e}"
            ))
        })?;
    sqlx::query("DELETE FROM oauth_client_allowed_embed_origins WHERE oauth_client_id = $1")
        .bind(client_id_param)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Failed to clear workspace client allowed embed origins: {e}"
            ))
        })?;

    for uri in &redirect_uris {
        sqlx::query("INSERT INTO oauth_client_redirect_uris (oauth_client_id, redirect_uri) VALUES ($1, $2)")
            .bind(client_id_param)
            .bind(uri)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to save updated workspace client redirect URI: {e}")))?;
    }
    for origin in &allowed_embed_origins {
        sqlx::query("INSERT INTO oauth_client_allowed_embed_origins (oauth_client_id, origin) VALUES ($1, $2)")
            .bind(client_id_param)
            .bind(origin)
            .execute(&mut *tx)
            .await
            .map_err(|e| AppError::Internal(format!("Failed to save updated workspace client allowed embed origin: {e}")))?;
    }

    tx.commit().await.map_err(|e| {
        AppError::Internal(format!(
            "Failed to commit workspace client update transaction: {e}"
        ))
    })?;

    crate::modules::audit::service::AuditService::new(state.db.clone())
        .log(crate::modules::audit::service::AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "oauth_client.updated".into(),
            target_type: "oauth_client".into(),
            target_id: Some(updated_client.id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "app_name": updated_client.app_name,
                "redirect_uri_count": redirect_uris.len(),
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(OrgClientResponse {
        client: updated_client,
        redirect_uris,
        allowed_embed_origins,
        client_secret: None,
    }))
}

async fn update_current_org_client_status(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<uuid::Uuid>,
    body: web::Json<UpdateOrgClientStatusRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before updating a client.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;
    let client_id_param = path.into_inner();
    let normalized_status = body.status.trim().to_lowercase();

    if normalized_status != "active" && normalized_status != "suspended" {
        return Err(AppError::Validation(
            "Status must be either 'active' or 'suspended'.".into(),
        ));
    }

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "org:update")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to update company clients.".into(),
        ));
    }

    let client = sqlx::query_as::<_, OrgOAuthClient>(
        "SELECT id, client_id, app_name, app_type, status, is_first_party, created_at FROM oauth_clients WHERE id = $1 AND org_id = $2"
    )
    .bind(client_id_param)
    .bind(org_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace OAuth client for status update: {e}")))?
    .ok_or_else(|| AppError::NotFound("Client not found in your workspace.".into()))?;

    let updated = sqlx::query_as::<_, OrgOAuthClient>(
        "UPDATE oauth_clients SET status = $1 WHERE id = $2 AND org_id = $3 RETURNING id, client_id, app_name, app_type, status, is_first_party, created_at"
    )
    .bind(&normalized_status)
    .bind(client.id)
    .bind(org_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to update workspace OAuth client status: {e}")))?;

    crate::modules::audit::service::AuditService::new(state.db.clone())
        .log(crate::modules::audit::service::AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: if normalized_status == "active" {
                "oauth_client.resumed".into()
            } else {
                "oauth_client.suspended".into()
            },
            target_type: "oauth_client".into(),
            target_id: Some(client.id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "app_name": updated.app_name }),
        })
        .await;

    Ok(HttpResponse::Ok().json(updated))
}

/// Delete an OAuth client owned by the current active organization.
async fn delete_current_org_client(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<uuid::Uuid>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before deleting a client.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;
    let client_id_param = path.into_inner();

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "org:update")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to delete company clients.".into(),
        ));
    }

    let rows = sqlx::query("DELETE FROM oauth_clients WHERE id = $1 AND org_id = $2")
        .bind(client_id_param)
        .bind(org_id)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to delete workspace OAuth client: {e}")))?
        .rows_affected();

    if rows == 0 {
        return Err(AppError::NotFound(
            "Client not found in your workspace.".into(),
        ));
    }

    crate::modules::audit::service::AuditService::new(state.db.clone())
        .log(crate::modules::audit::service::AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "oauth_client.deleted".into(),
            target_type: "oauth_client".into(),
            target_id: Some(client_id_param.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({}),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "ok": true })))
}

// ── Tenant auth config ───────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct TenantAuthConfigResponse {
    // Presence indicators only — secrets are never returned
    pub google_configured: bool,
    pub google_client_id: Option<String>,
    pub microsoft_configured: bool,
    pub microsoft_client_id: Option<String>,
    pub microsoft_tenant_id: Option<String>,
    pub smtp_configured: bool,
    pub smtp_host: Option<String>,
    pub smtp_port: Option<i32>,
    pub smtp_from: Option<String>,
    pub smtp_security: Option<String>,
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct UpdateTenantAuthConfigRequest {
    // Google (all three must be provided together to set; send null to clear)
    pub google_client_id: Option<String>,
    pub google_client_secret: Option<String>,
    pub clear_google: Option<bool>,

    // Microsoft
    pub microsoft_client_id: Option<String>,
    pub microsoft_client_secret: Option<String>,
    pub microsoft_tenant_id: Option<String>,
    pub clear_microsoft: Option<bool>,

    // SMTP
    pub smtp_host: Option<String>,
    pub smtp_port: Option<i32>,
    pub smtp_user: Option<String>,
    pub smtp_password: Option<String>,
    pub smtp_from: Option<String>,
    pub smtp_security: Option<String>,
    pub clear_smtp: Option<bool>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PrepareTenantOAuthVerificationRequest {
    pub provider: String,
    pub client_id: String,
    pub client_secret: String,
    pub tenant_id: Option<String>,
    pub redirect_uri: String,
}

pub(crate) fn encrypt_secret(
    secret: &str,
    config: &std::sync::Arc<crate::bootstrap::config::AppConfig>,
) -> Result<String, AppError> {
    use aes_gcm_siv::{
        aead::{Aead, KeyInit},
        Aes256GcmSiv, Nonce,
    };
    use base64::Engine as _;
    use rand::{rngs::OsRng, RngCore};
    use sha2::{Digest, Sha256};

    let key_material = Sha256::digest(config.oidc.signing_secret.as_bytes());
    let cipher = Aes256GcmSiv::new_from_slice(&key_material)
        .map_err(|e| AppError::Internal(format!("Cipher init failed: {}", e)))?;
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, secret.as_bytes())
        .map_err(|e| AppError::Internal(format!("Encryption failed: {}", e)))?;
    let mut combined = nonce_bytes.to_vec();
    combined.extend(ciphertext);
    Ok(base64::engine::general_purpose::STANDARD.encode(combined))
}

/// Get the current tenant's custom auth config (secrets masked).
async fn get_current_org_auth_config(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session
        .current_org_id
        .ok_or_else(|| AppError::Validation("Select a workspace first.".into()))?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "org:update")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to view auth config.".into(),
        ));
    }

    let row = sqlx::query!(
        r#"
        SELECT google_client_id, google_client_secret,
               microsoft_client_id, microsoft_client_secret, microsoft_tenant_id,
               smtp_host, smtp_port, smtp_from, smtp_security
        FROM tenant_auth_config WHERE org_id = $1
        "#,
        org_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace auth config: {}", e)))?;

    let response = match row {
        None => TenantAuthConfigResponse {
            google_configured: false,
            google_client_id: None,
            microsoft_configured: false,
            microsoft_client_id: None,
            microsoft_tenant_id: None,
            smtp_configured: false,
            smtp_host: None,
            smtp_port: None,
            smtp_from: None,
            smtp_security: None,
        },
        Some(r) => TenantAuthConfigResponse {
            google_configured: r.google_client_secret.is_some(),
            google_client_id: r.google_client_id,
            microsoft_configured: r.microsoft_client_secret.is_some(),
            microsoft_client_id: r.microsoft_client_id,
            microsoft_tenant_id: r.microsoft_tenant_id,
            smtp_configured: r.smtp_host.is_some(),
            smtp_host: r.smtp_host,
            smtp_port: r.smtp_port,
            smtp_from: r.smtp_from,
            smtp_security: r.smtp_security,
        },
    };

    Ok(HttpResponse::Ok().json(response))
}

/// Update (upsert) the current tenant's custom auth config.
async fn update_current_org_auth_config(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdateTenantAuthConfigRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session
        .current_org_id
        .ok_or_else(|| AppError::Validation("Select a workspace first.".into()))?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "org:update")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to update auth config.".into(),
        ));
    }

    // Ensure the row exists
    sqlx::query(
        "INSERT INTO tenant_auth_config (org_id) VALUES ($1) ON CONFLICT (org_id) DO NOTHING",
    )
    .bind(org_id)
    .execute(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!("Failed to initialize workspace auth config: {}", e))
    })?;

    // Google
    if body.clear_google.unwrap_or(false) {
        sqlx::query("UPDATE tenant_auth_config SET google_client_id = NULL, google_client_secret = NULL, updated_at = NOW() WHERE org_id = $1")
            .bind(org_id).execute(&state.db).await.map_err(|e| AppError::Internal(format!("Failed to clear workspace Google auth config: {}", e)))?;
    } else if let (Some(id), Some(secret)) = (&body.google_client_id, &body.google_client_secret) {
        if !id.trim().is_empty() && !secret.trim().is_empty() {
            let enc = encrypt_secret(secret.trim(), &state.config)?;
            sqlx::query("UPDATE tenant_auth_config SET google_client_id = $1, google_client_secret = $2, updated_at = NOW() WHERE org_id = $3")
                .bind(id.trim()).bind(&enc).bind(org_id)
                .execute(&state.db).await.map_err(|e| AppError::Internal(format!("Failed to save workspace Google auth config: {}", e)))?;
        }
    } else if let Some(id) = &body.google_client_id {
        // Update client_id only (no new secret)
        if !id.trim().is_empty() {
            sqlx::query("UPDATE tenant_auth_config SET google_client_id = $1, updated_at = NOW() WHERE org_id = $2")
                .bind(id.trim()).bind(org_id)
                .execute(&state.db).await.map_err(|e| AppError::Internal(format!("Failed to update workspace Google client ID: {}", e)))?;
        }
    }

    // Microsoft
    if body.clear_microsoft.unwrap_or(false) {
        sqlx::query("UPDATE tenant_auth_config SET microsoft_client_id = NULL, microsoft_client_secret = NULL, microsoft_tenant_id = NULL, updated_at = NOW() WHERE org_id = $1")
            .bind(org_id).execute(&state.db).await.map_err(|e| AppError::Internal(format!("Failed to clear workspace Microsoft auth config: {}", e)))?;
    } else if let (Some(id), Some(secret)) =
        (&body.microsoft_client_id, &body.microsoft_client_secret)
    {
        if !id.trim().is_empty() && !secret.trim().is_empty() {
            let enc = encrypt_secret(secret.trim(), &state.config)?;
            let ms_tid = body
                .microsoft_tenant_id
                .as_deref()
                .filter(|v| !v.trim().is_empty())
                .unwrap_or("common");
            sqlx::query("UPDATE tenant_auth_config SET microsoft_client_id = $1, microsoft_client_secret = $2, microsoft_tenant_id = $3, updated_at = NOW() WHERE org_id = $4")
                .bind(id.trim()).bind(&enc).bind(ms_tid).bind(org_id)
                .execute(&state.db).await.map_err(|e| AppError::Internal(format!("Failed to save workspace Microsoft auth config: {}", e)))?;
        }
    }

    // SMTP
    if body.clear_smtp.unwrap_or(false) {
        sqlx::query("UPDATE tenant_auth_config SET smtp_host = NULL, smtp_port = NULL, smtp_user = NULL, smtp_password = NULL, smtp_from = NULL, smtp_security = NULL, updated_at = NOW() WHERE org_id = $1")
            .bind(org_id).execute(&state.db).await.map_err(|e| AppError::Internal(format!("Failed to clear workspace SMTP config: {}", e)))?;
    } else if let Some(host) = &body.smtp_host {
        if !host.trim().is_empty() {
            let enc_pass = if let Some(p) = &body.smtp_password {
                if !p.trim().is_empty() {
                    Some(encrypt_secret(p.trim(), &state.config)?)
                } else {
                    None
                }
            } else {
                None
            };

            if let Some(ep) = enc_pass {
                sqlx::query("UPDATE tenant_auth_config SET smtp_host = $1, smtp_port = $2, smtp_user = $3, smtp_password = $4, smtp_from = $5, smtp_security = $6, updated_at = NOW() WHERE org_id = $7")
                    .bind(host.trim())
                    .bind(body.smtp_port)
                    .bind(body.smtp_user.as_deref().map(str::trim))
                    .bind(&ep)
                    .bind(body.smtp_from.as_deref().map(str::trim))
                    .bind(body.smtp_security.as_deref().unwrap_or("starttls"))
                    .bind(org_id)
                    .execute(&state.db).await.map_err(|e| AppError::Internal(format!("Failed to save workspace SMTP config: {}", e)))?;
            } else {
                sqlx::query("UPDATE tenant_auth_config SET smtp_host = $1, smtp_port = $2, smtp_user = $3, smtp_from = $4, smtp_security = $5, updated_at = NOW() WHERE org_id = $6")
                    .bind(host.trim())
                    .bind(body.smtp_port)
                    .bind(body.smtp_user.as_deref().map(str::trim))
                    .bind(body.smtp_from.as_deref().map(str::trim))
                    .bind(body.smtp_security.as_deref().unwrap_or("starttls"))
                    .bind(org_id)
                    .execute(&state.db).await.map_err(|e| AppError::Internal(format!("Failed to update workspace SMTP config without password change: {}", e)))?;
            }
        }
    }

    crate::modules::audit::service::AuditService::new(state.db.clone())
        .log(crate::modules::audit::service::AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "tenant_auth_config.updated".into(),
            target_type: "organization".into(),
            target_id: Some(org_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({}),
        })
        .await;

    // Return updated config
    get_current_org_auth_config(req, state).await
}

async fn prepare_current_org_oauth_verification(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<PrepareTenantOAuthVerificationRequest>,
) -> Result<HttpResponse, AppError> {
    use base64::Engine as _;
    use rand::RngCore;

    let session = extract_session(&req)?;
    let org_id = session
        .current_org_id
        .ok_or_else(|| AppError::Validation("Select a workspace first.".into()))?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "org:update")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to update auth config.".into(),
        ));
    }

    let provider = body.provider.trim().to_lowercase();
    if provider != "google" && provider != "microsoft" {
        return Err(AppError::Validation(
            "Provider must be google or microsoft.".into(),
        ));
    }
    if body.client_id.trim().is_empty() {
        return Err(AppError::Validation("Client ID is required.".into()));
    }
    if body.client_secret.trim().is_empty() {
        return Err(AppError::Validation("Client secret is required.".into()));
    }

    let mut bytes = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let draft_key = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes);
    let redis_key = format!("pending_oauth_verify:{}", draft_key);
    let payload = serde_json::json!({
        "provider": provider,
        "client_id": body.client_id.trim(),
        "client_secret": body.client_secret.trim(),
        "tenant_id": body.tenant_id.as_deref().filter(|value| !value.trim().is_empty()).unwrap_or("common"),
        "save_scope": "organization",
        "organization_id": org_id,
        "actor_user_id": session.user_id,
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
    let initiated_ua = req
        .headers()
        .get("user-agent")
        .and_then(|h| h.to_str().ok())
        .map(String::from);
    let auth_url = crate::modules::oauth::handlers::start_oauth_flow(
        &state,
        &provider,
        Some(body.redirect_uri.trim()),
        Some("user"),
        "login",
        None,
        initiated_ip,
        initiated_ua,
        Some(draft_key),
    )
    .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "authorization_url": auth_url,
    })))
}

// ── Tenant API keys ──────────────────────────────────────────────────────────

#[derive(serde::Serialize, sqlx::FromRow)]
pub struct TenantApiKeyRow {
    pub id: uuid::Uuid,
    pub org_id: uuid::Uuid,
    pub label: String,
    pub key_prefix: String,
    pub permission_preset: String,
    pub allowed_permissions: Vec<String>,
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub revoked: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub last_used_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateApiKeyRequest {
    pub label: String,
    /// Optional ISO 8601 expiry datetime. Null means no expiry.
    pub expires_at: Option<chrono::DateTime<chrono::Utc>>,
    pub permission_preset: Option<String>,
}

const TENANT_API_KEY_LIMIT: i64 = 10;
pub const ORG_CLIENT_LIST_LIMIT: i64 = 100;
pub const ORG_CLIENT_REDIRECT_URI_LIMIT: i64 = 25;
const ORG_API_KEY_LIST_LIMIT: i64 = 100;

/// List all non-revoked API keys for the current workspace.
async fn list_current_org_api_keys(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    use uuid::Uuid;
    let session = extract_session(&req)?;
    let org_id: Uuid = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before viewing API keys.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "org:update")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to view API keys.".into(),
        ));
    }

    let keys = sqlx::query_as::<_, TenantApiKeyRow>(
        r#"
        SELECT id, org_id, label, key_prefix, permission_preset, allowed_permissions, expires_at, revoked, created_at, last_used_at
        FROM tenant_api_keys
        WHERE org_id = $1 AND revoked = FALSE
        ORDER BY created_at DESC
        LIMIT $2
        "#,
    )
    .bind(org_id)
    .bind(ORG_API_KEY_LIST_LIMIT)
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to list active workspace API keys: {}", e)))?;

    Ok(HttpResponse::Ok().json(keys))
}

/// Create a new API key for the current workspace. Returns the raw key once.
async fn create_current_org_api_key(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<CreateApiKeyRequest>,
) -> Result<HttpResponse, AppError> {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    use rand::{rngs::OsRng, RngCore};
    use sha2::Digest;
    use uuid::Uuid;

    let session = extract_session(&req)?;
    let org_id: Uuid = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before creating an API key.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "org:update")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to create API keys.".into(),
        ));
    }

    if body.label.trim().is_empty() {
        return Err(AppError::Validation("API key label is required.".into()));
    }

    let repo = OrganizationRepository::new(state.db.clone());
    let is_owner = repo.is_org_owner(org_id, session.user_id).await?;
    let permission_preset =
        normalize_workspace_api_key_permission_preset(body.permission_preset.as_deref());
    if permission_preset == WORKSPACE_KEY_PRESET_WORKSPACE_OWNER && !is_owner {
        return Err(AppError::Forbidden(
            "Only the workspace owner can create a full-access workspace API key.".into(),
        ));
    }
    let allowed_permissions = workspace_api_key_permissions_for_preset(permission_preset);

    let existing_key_count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM tenant_api_keys
        WHERE org_id = $1 AND revoked = FALSE
        "#,
    )
    .bind(org_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to count active workspace API keys: {}", e)))?;

    if existing_key_count >= TENANT_API_KEY_LIMIT {
        return Err(AppError::Validation(format!(
            "You can keep up to {} active API keys per workspace. Revoke an unused key before creating another.",
            TENANT_API_KEY_LIMIT
        )));
    }

    // Generate a 32-byte random key, base64url-encoded → ~43 chars
    let mut raw_bytes = [0u8; 32];
    OsRng.fill_bytes(&mut raw_bytes);
    let raw_key = format!("rooiam_{}", URL_SAFE_NO_PAD.encode(raw_bytes));

    // Store prefix (first 12 chars) for display
    let key_prefix = raw_key.chars().take(12).collect::<String>();

    // Hash the full raw key
    let mut hasher = sha2::Sha256::new();
    hasher.update(raw_key.as_bytes());
    let key_hash = hex::encode(hasher.finalize());

    let key = sqlx::query_as::<_, TenantApiKeyRow>(
        r#"
        INSERT INTO tenant_api_keys (org_id, created_by, label, key_hash, key_prefix, permission_preset, allowed_permissions, expires_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, org_id, label, key_prefix, permission_preset, allowed_permissions, expires_at, revoked, created_at, last_used_at
        "#,
    )
    .bind(org_id)
    .bind(session.user_id)
    .bind(body.label.trim())
    .bind(&key_hash)
    .bind(&key_prefix)
    .bind(permission_preset)
    .bind(&allowed_permissions)
    .bind(body.expires_at)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to create workspace API key: {}", e)))?;

    crate::modules::audit::service::AuditService::new(state.db.clone()).log(
        crate::modules::audit::service::AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "api_key.created".into(),
            target_type: "tenant_api_key".into(),
            target_id: Some(key.id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
            metadata: serde_json::json!({ "label": key.label, "permission_preset": key.permission_preset }),
        }
    ).await;

    Ok(HttpResponse::Created().json(serde_json::json!({
        "key": key,
        "raw_key": raw_key,
    })))
}

/// Revoke (soft-delete) an API key by id.
async fn revoke_current_org_api_key(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<uuid::Uuid>,
) -> Result<HttpResponse, AppError> {
    use uuid::Uuid;

    let session = extract_session(&req)?;
    let org_id: Uuid = session.current_org_id.ok_or_else(|| {
        AppError::Validation("Select a workspace before revoking an API key.".into())
    })?;
    ensure_demo_workspace_allowed(&state, org_id).await?;
    let key_id = path.into_inner();

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "org:update")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to revoke API keys.".into(),
        ));
    }

    let revoked_key = sqlx::query_as::<_, TenantApiKeyRow>(
        "UPDATE tenant_api_keys SET revoked = TRUE WHERE id = $1 AND org_id = $2 AND revoked = FALSE RETURNING id, org_id, label, key_prefix, permission_preset, allowed_permissions, expires_at, revoked, created_at, last_used_at"
    )
    .bind(key_id)
    .bind(org_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to revoke workspace API key: {}", e)))?
    .ok_or_else(|| AppError::NotFound("API key not found in your workspace.".into()))?;

    crate::modules::audit::service::AuditService::new(state.db.clone()).log(
        crate::modules::audit::service::AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "api_key.revoked".into(),
            target_type: "tenant_api_key".into(),
            target_id: Some(key_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
            metadata: serde_json::json!({ "label": revoked_key.label, "key_prefix": revoked_key.key_prefix }),
        }
    ).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "ok": true })))
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdateOrgStatusRequest {
    status: String,
}

async fn update_current_org_status(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdateOrgStatusRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session
        .current_org_id
        .ok_or_else(|| AppError::Validation("Select a workspace first.".into()))?;
    ensure_demo_workspace_allowed(&state, org_id).await?;

    let repo = OrganizationRepository::new(state.db.clone());
    if !repo.is_org_owner(org_id, session.user_id).await? {
        return Err(AppError::Forbidden(
            "Only the workspace owner can change workspace lifecycle status.".into(),
        ));
    }

    let normalized = body.status.trim().to_lowercase();
    if normalized != "active" && normalized != "suspended" {
        return Err(AppError::Validation(
            "Status must be 'active' or 'suspended'.".into(),
        ));
    }

    // Check platform_locked — if platform admin locked this workspace as suspended,
    // tenant admin cannot set it back to active.
    let platform_locked: bool =
        sqlx::query_scalar("SELECT platform_locked FROM organizations WHERE id = $1")
            .bind(org_id)
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                AppError::Internal(format!(
                    "Failed to load workspace platform_locked status: {}",
                    e
                ))
            })?;

    if platform_locked && normalized == "active" {
        return Err(AppError::Forbidden(
            "This workspace has been suspended by the platform administrator and cannot be re-activated from here.".into()
        ));
    }

    let before_status: String =
        sqlx::query_scalar("SELECT status FROM organizations WHERE id = $1")
            .bind(org_id)
            .fetch_one(&state.db)
            .await
            .map_err(|e| {
                AppError::Internal(format!(
                    "Failed to load workspace status before update: {}",
                    e
                ))
            })?;

    sqlx::query("UPDATE organizations SET status = $2, updated_at = NOW() WHERE id = $1")
        .bind(org_id)
        .bind(&normalized)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to update workspace status: {}", e)))?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "workspace.status.updated".into(),
            target_type: "organization".into(),
            target_id: Some(org_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "before": { "status": before_status },
                "after": { "status": normalized },
                "platform_locked": platform_locked,
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "id": org_id, "status": normalized })))
}

// ── Phase 6: Effective policy view ───────────────────────────────────────────

/// GET /v1/orgs/current/effective-policy
/// Shows platform defaults → tenant override → effective result for all auth policy dimensions.
async fn get_effective_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session
        .current_org_id
        .ok_or_else(|| AppError::Validation("Select a workspace first.".into()))?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "auth_policy:manage")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to view policy.".into(),
        ));
    }

    #[derive(sqlx::FromRow)]
    struct OrgPolicyRow {
        allow_magic_link: bool,
        allow_google: bool,
        allow_microsoft: bool,
        allow_passkey: bool,
        require_mfa: bool,
        require_mfa_for_admins: bool,
        tenant_portal_require_mfa: bool,
        allowed_email_domains: Option<String>,
        max_session_age_hours: Option<i32>,
        max_concurrent_sessions: Option<i32>,
        status: String,
        platform_locked: bool,
    }

    let org = sqlx::query_as::<_, OrgPolicyRow>(
        r#"
        SELECT
            allow_magic_link, allow_google, allow_microsoft, allow_passkey,
            require_mfa, require_mfa_for_admins, tenant_portal_require_mfa,
            allowed_email_domains, max_session_age_hours, max_concurrent_sessions,
            status, platform_locked
        FROM organizations WHERE id = $1
        "#,
    )
    .bind(org_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load effective workspace policy: {}", e)))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "organization_id": org_id,
        "auth_policy": {
            "allow_magic_link": org.allow_magic_link,
            "allow_google": org.allow_google,
            "allow_microsoft": org.allow_microsoft,
            "allow_passkey": org.allow_passkey,
            "require_mfa": org.require_mfa,
            "require_mfa_for_admins": org.require_mfa_for_admins,
            "tenant_portal_require_mfa": org.tenant_portal_require_mfa,
            "allowed_email_domains": org.allowed_email_domains,
            "max_session_age_hours": org.max_session_age_hours,
            "max_concurrent_sessions": org.max_concurrent_sessions,
        },
        "workspace_status": {
            "status": org.status,
            "platform_locked": org.platform_locked,
        },
        "ip_policy": load_tenant_ip_policy(&state.db, org_id).await.ok(),
        "client_policy": load_tenant_client_policy(&state.db, org_id).await.ok(),
    })))
}

// ── Phase 6: Policy change preview (lockout warning) ─────────────────────────

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct PolicyChangePreviewRequest {
    allow_magic_link: bool,
    allow_google: bool,
    allow_microsoft: bool,
    allow_passkey: bool,
}

/// POST /v1/orgs/current/auth-policy/preview
/// Returns a warning if the proposed policy change would lock out active members.
async fn preview_auth_policy_change(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<PolicyChangePreviewRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session
        .current_org_id
        .ok_or_else(|| AppError::Validation("Select a workspace first.".into()))?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "auth_policy:manage")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to preview policy changes.".into(),
        ));
    }

    let mut warnings: Vec<String> = Vec::new();
    let mut affected_users: Vec<serde_json::Value> = Vec::new();

    // Count members who only have magic link as their login method
    if !body.allow_magic_link {
        let count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(DISTINCT om.user_id)
            FROM organization_members om
            JOIN user_emails ue ON ue.user_id = om.user_id AND ue.is_primary = true
            WHERE om.organization_id = $1
              AND om.status = 'active'
              AND NOT EXISTS (
                  SELECT 1 FROM external_identities ei WHERE ei.user_id = om.user_id
              )
              AND NOT EXISTS (
                  SELECT 1 FROM webauthn_credentials wc WHERE wc.user_id = om.user_id
              )
            "#,
        )
        .bind(org_id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);

        if count > 0 {
            warnings.push(format!(
                "Disabling magic link would lock out {} member(s) who have no other login method.",
                count
            ));
            affected_users.push(serde_json::json!({ "reason": "magic_link_only", "count": count }));
        }
    }

    // Count members who only have Google as their login method
    if !body.allow_google {
        let count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(DISTINCT om.user_id)
            FROM organization_members om
            WHERE om.organization_id = $1
              AND om.status = 'active'
              AND EXISTS (
                  SELECT 1 FROM external_identities ei WHERE ei.user_id = om.user_id AND ei.provider = 'google'
              )
              AND NOT EXISTS (
                  SELECT 1 FROM user_emails ue WHERE ue.user_id = om.user_id AND ue.is_primary = true
              )
              AND NOT EXISTS (
                  SELECT 1 FROM external_identities ei WHERE ei.user_id = om.user_id AND ei.provider = 'microsoft'
              )
            "#
        )
        .bind(org_id)
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);

        if count > 0 {
            warnings.push(format!(
                "Disabling Google login would lock out {} member(s) who only use Google to sign in.",
                count
            ));
        }
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "would_lock_out_users": !warnings.is_empty(),
        "warnings": warnings,
        "affected": affected_users,
    })))
}

// ── Phase 6: Policy snapshots ─────────────────────────────────────────────────

/// GET /v1/orgs/current/policy-snapshots — list recent policy snapshots.
async fn list_policy_snapshots(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session
        .current_org_id
        .ok_or_else(|| AppError::Validation("Select a workspace first.".into()))?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "auth_policy:manage")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to view policy snapshots.".into(),
        ));
    }

    #[derive(serde::Serialize, sqlx::FromRow)]
    struct SnapshotRow {
        id: i64,
        snapshot: serde_json::Value,
        created_by: Option<Uuid>,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    let snapshots = sqlx::query_as::<_, SnapshotRow>(
        "SELECT id, snapshot, created_by, created_at FROM org_policy_snapshots WHERE organization_id = $1 ORDER BY created_at DESC LIMIT 10"
    )
    .bind(org_id)
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace policy snapshots: {}", e)))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "snapshots": snapshots })))
}

/// POST /v1/orgs/current/policy-snapshots/{id}/restore — restore a snapshot.
async fn restore_policy_snapshot(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<i64>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session
        .current_org_id
        .ok_or_else(|| AppError::Validation("Select a workspace first.".into()))?;
    let snapshot_id = path.into_inner();

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "auth_policy:manage")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to restore policy snapshots.".into(),
        ));
    }

    let snapshot: Option<serde_json::Value> = sqlx::query_scalar(
        "SELECT snapshot FROM org_policy_snapshots WHERE id = $1 AND organization_id = $2",
    )
    .bind(snapshot_id)
    .bind(org_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace policy snapshot: {}", e)))?;

    let snapshot = snapshot.ok_or_else(|| AppError::NotFound("Snapshot not found.".into()))?;

    // Extract fields from snapshot
    let get_bool = |key: &str| snapshot.get(key).and_then(|v| v.as_bool()).unwrap_or(false);
    let allow_magic_link = get_bool("allow_magic_link");
    let allow_google = get_bool("allow_google");
    let allow_microsoft = get_bool("allow_microsoft");
    let allow_passkey = get_bool("allow_passkey");
    let require_mfa = get_bool("require_mfa");
    let require_mfa_for_admins = get_bool("require_mfa_for_admins");
    let tenant_portal_require_mfa = get_bool("tenant_portal_require_mfa");
    let allowed_email_domains = snapshot
        .get("allowed_email_domains")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let max_session_age_hours: Option<i32> = snapshot
        .get("max_session_age_hours")
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);
    let max_concurrent_sessions: Option<i32> = snapshot
        .get("max_concurrent_sessions")
        .and_then(|v| v.as_i64())
        .map(|v| v as i32);

    sqlx::query(
        r#"
        UPDATE organizations SET
            allow_magic_link = $2, allow_google = $3, allow_microsoft = $4, allow_passkey = $5,
            require_mfa = $6, require_mfa_for_admins = $7, tenant_portal_require_mfa = $8,
            allowed_email_domains = $9, max_session_age_hours = $10, max_concurrent_sessions = $11,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(org_id)
    .bind(allow_magic_link)
    .bind(allow_google)
    .bind(allow_microsoft)
    .bind(allow_passkey)
    .bind(require_mfa)
    .bind(require_mfa_for_admins)
    .bind(tenant_portal_require_mfa)
    .bind(&allowed_email_domains)
    .bind(max_session_age_hours)
    .bind(max_concurrent_sessions)
    .execute(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Failed to restore workspace policy snapshot: {}",
            e
        ))
    })?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "workspace.auth_policy.snapshot_restored".into(),
            target_type: "organization".into(),
            target_id: Some(org_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "snapshot_id": snapshot_id }),
        })
        .await;

    Ok(HttpResponse::Ok()
        .json(serde_json::json!({ "ok": true, "message": "Policy restored from snapshot." })))
}

// ── Phase 6: Role templates ───────────────────────────────────────────────────

/// GET /v1/orgs/current/roles/templates — list available built-in role templates.
async fn list_role_templates(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session
        .current_org_id
        .ok_or_else(|| AppError::Validation("Select a workspace first.".into()))?;
    let _ = org_id; // Accessible to any authenticated org member

    let templates = vec![
        serde_json::json!({
            "name": "Billing Admin",
            "code": "billing_admin",
            "description": "Can manage billing and subscription settings. Read-only on members and policy.",
            "permissions": ["org:update"],
        }),
        serde_json::json!({
            "name": "Support Agent",
            "code": "support_agent",
            "description": "Can view member list and audit logs. Cannot change settings.",
            "permissions": ["members:read", "audit_logs:read"],
        }),
        serde_json::json!({
            "name": "Auditor",
            "code": "auditor",
            "description": "Read-only access to audit logs and activity. Cannot change anything.",
            "permissions": ["audit_logs:read"],
        }),
        serde_json::json!({
            "name": "Security Admin",
            "code": "security_admin",
            "description": "Can manage auth policy, IP policy, and MFA settings.",
            "permissions": ["auth_policy:manage", "roles:manage"],
        }),
    ];

    let _ = req;
    let _ = state;
    Ok(HttpResponse::Ok().json(serde_json::json!({ "templates": templates })))
}

// ── Phase 6: Role diff view ───────────────────────────────────────────────────

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct RoleDiffQuery {
    role_a: Uuid,
    role_b: Uuid,
}

/// GET /v1/orgs/current/roles/diff — compare permissions of two roles side by side.
async fn diff_roles(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<RoleDiffQuery>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session
        .current_org_id
        .ok_or_else(|| AppError::Validation("Select a workspace first.".into()))?;

    let rbac_svc = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac_svc
        .has_permission(session.user_id, org_id, "roles:manage")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to manage roles.".into(),
        ));
    }

    let repo = crate::modules::rbac::repository::RbacRepository::new(state.db.clone());
    let perms_a = repo.get_role_permissions(query.role_a).await?;
    let perms_b = repo.get_role_permissions(query.role_b).await?;

    let only_in_a: Vec<&String> = perms_a.iter().filter(|p| !perms_b.contains(p)).collect();
    let only_in_b: Vec<&String> = perms_b.iter().filter(|p| !perms_a.contains(p)).collect();
    let in_both: Vec<&String> = perms_a.iter().filter(|p| perms_b.contains(p)).collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "role_a_id": query.role_a,
        "role_b_id": query.role_b,
        "only_in_a": only_in_a,
        "only_in_b": only_in_b,
        "in_both": in_both,
    })))
}

// ── Phase 6: Self-lockout prevention ─────────────────────────────────────────

/// POST /v1/orgs/current/auth-policy/self-check
/// Returns whether the requesting user would lose access if the proposed policy is applied.
async fn check_self_lockout(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<PolicyChangePreviewRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session
        .current_org_id
        .ok_or_else(|| AppError::Validation("Select a workspace first.".into()))?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac
        .has_permission(session.user_id, org_id, "auth_policy:manage")
        .await?
    {
        return Err(AppError::Forbidden(
            "You do not have permission to check policy changes.".into(),
        ));
    }

    let identity_repo =
        crate::modules::identity::repository::IdentityRepository::new(state.db.clone());
    let has_email = identity_repo
        .get_primary_email_by_user_id(session.user_id)
        .await?
        .is_some();
    let ext_ids = identity_repo
        .list_external_identities_by_user_id(session.user_id)
        .await?;
    let has_google = ext_ids.iter().any(|e| e.provider == "google");
    let has_microsoft = ext_ids.iter().any(|e| e.provider == "microsoft");
    let passkeys_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM webauthn_credentials WHERE user_id = $1")
            .bind(session.user_id)
            .fetch_one(&state.db)
            .await
            .unwrap_or(0);

    let mut can_still_login = false;
    if body.allow_magic_link && has_email {
        can_still_login = true;
    }
    if body.allow_google && has_google {
        can_still_login = true;
    }
    if body.allow_microsoft && has_microsoft {
        can_still_login = true;
    }
    if body.allow_passkey && passkeys_count > 0 {
        can_still_login = true;
    }

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "would_lock_out_self": !can_still_login,
        "your_login_methods": {
            "magic_link": has_email,
            "google": has_google,
            "microsoft": has_microsoft,
            "passkey": passkeys_count > 0,
        },
    })))
}

// ── Phase 6: Owner transfer flow ─────────────────────────────────────────────

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct InitiateOwnerTransferRequest {
    to_user_id: Uuid,
}

/// POST /v1/orgs/current/owner-transfer — initiate an ownership transfer.
async fn initiate_owner_transfer(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<InitiateOwnerTransferRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session
        .current_org_id
        .ok_or_else(|| AppError::Validation("Select a workspace first.".into()))?;

    // Only the current owner can transfer ownership
    let is_owner: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM organization_members om JOIN roles r ON r.id = ANY(om.role_ids) WHERE om.user_id = $1 AND om.organization_id = $2 AND r.code = 'owner')"
    )
    .bind(session.user_id)
    .bind(org_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    // Simpler check via rbac membership
    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    let is_owner2 = rbac
        .has_permission(session.user_id, org_id, "org:transfer_ownership")
        .await
        .unwrap_or(false);

    if !is_owner && !is_owner2 {
        return Err(AppError::Forbidden(
            "Only the workspace owner can transfer ownership.".into(),
        ));
    }

    if body.to_user_id == session.user_id {
        return Err(AppError::Validation(
            "Cannot transfer ownership to yourself.".into(),
        ));
    }

    // Verify the target user is an active member
    let target_is_member: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM organization_members WHERE user_id = $1 AND organization_id = $2 AND status = 'active')"
    )
    .bind(body.to_user_id)
    .bind(org_id)
    .fetch_one(&state.db)
    .await
    .unwrap_or(false);

    if !target_is_member {
        return Err(AppError::Validation(
            "The target user must be an active member of this workspace.".into(),
        ));
    }

    // Generate transfer token
    let mut bytes = [0u8; 32];
    rand::RngCore::fill_bytes(&mut rand::rngs::OsRng, &mut bytes);
    let raw_token =
        base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, bytes);
    let token_hash = hex::encode(sha2::Digest::finalize(sha2::Sha256::new_with_prefix(
        raw_token.as_bytes(),
    )));
    let expires_at = chrono::Utc::now() + chrono::Duration::hours(48);

    // Cancel any pending transfers for this org
    sqlx::query(
        "UPDATE owner_transfer_requests SET cancelled_at = NOW() WHERE organization_id = $1 AND accepted_at IS NULL AND cancelled_at IS NULL"
    )
    .bind(org_id)
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to cancel previous workspace owner transfer requests: {}", e)))?;

    sqlx::query(
        "INSERT INTO owner_transfer_requests (organization_id, from_user_id, to_user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(org_id)
    .bind(session.user_id)
    .bind(body.to_user_id)
    .bind(&token_hash)
    .bind(expires_at)
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to create workspace owner transfer request: {}", e)))?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "workspace.owner_transfer.initiated".into(),
            target_type: "user".into(),
            target_id: Some(body.to_user_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "to_user_id": body.to_user_id }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "token": raw_token,
        "expires_at": expires_at,
        "message": "Ownership transfer initiated. The target user must confirm with the provided token within 48 hours.",
    })))
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct AcceptOwnerTransferRequest {
    token: String,
}

/// POST /v1/orgs/current/owner-transfer/accept — accept an ownership transfer.
async fn accept_owner_transfer(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<AcceptOwnerTransferRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session
        .current_org_id
        .ok_or_else(|| AppError::Validation("Select a workspace first.".into()))?;

    let token_hash = hex::encode(sha2::Digest::finalize(sha2::Sha256::new_with_prefix(
        body.token.as_bytes(),
    )));

    #[derive(sqlx::FromRow)]
    struct TransferRecord {
        id: Uuid,
        organization_id: Uuid,
        from_user_id: Uuid,
        to_user_id: Uuid,
        expires_at: chrono::DateTime<chrono::Utc>,
        accepted_at: Option<chrono::DateTime<chrono::Utc>>,
        cancelled_at: Option<chrono::DateTime<chrono::Utc>>,
    }

    let record = sqlx::query_as::<_, TransferRecord>(
        r#"
        SELECT id, organization_id, from_user_id, to_user_id, expires_at, accepted_at, cancelled_at
        FROM owner_transfer_requests
        WHERE token_hash = $1
        "#,
    )
    .bind(&token_hash)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Failed to load workspace owner transfer request: {}",
            e
        ))
    })?
    .ok_or_else(|| AppError::NotFound("Invalid or expired transfer token.".into()))?;

    if record.organization_id != org_id {
        return Err(AppError::Forbidden(
            "This token is for a different workspace.".into(),
        ));
    }
    if record.to_user_id != session.user_id {
        return Err(AppError::Forbidden(
            "This transfer is addressed to a different user.".into(),
        ));
    }
    if record.accepted_at.is_some() {
        return Err(AppError::Validation(
            "This transfer has already been accepted.".into(),
        ));
    }
    if record.cancelled_at.is_some() {
        return Err(AppError::Validation(
            "This transfer has been cancelled.".into(),
        ));
    }
    if chrono::Utc::now() > record.expires_at {
        return Err(AppError::Validation(
            "This transfer token has expired.".into(),
        ));
    }

    // Look up the owner role ID
    let owner_role_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM roles WHERE code = 'owner' AND (organization_id = $1 OR organization_id IS NULL) ORDER BY organization_id NULLS LAST LIMIT 1"
    )
    .bind(org_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace owner role: {}", e)))?;

    let Some(owner_role_id) = owner_role_id else {
        return Err(AppError::Internal("Owner role not found.".into()));
    };

    let mut tx = state.db.begin().await.map_err(|e| {
        AppError::Internal(format!(
            "Failed to start workspace owner transfer transaction: {}",
            e
        ))
    })?;

    // Demote previous owner to admin
    let admin_role_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM roles WHERE code = 'admin' AND (organization_id = $1 OR organization_id IS NULL) ORDER BY organization_id NULLS LAST LIMIT 1"
    )
    .bind(org_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace admin role during owner transfer: {}", e)))?;

    if let Some(admin_role_id) = admin_role_id {
        sqlx::query(
            "UPDATE organization_members SET role_ids = array_replace(role_ids, $1, $2) WHERE user_id = $3 AND organization_id = $4"
        )
        .bind(owner_role_id)
        .bind(admin_role_id)
        .bind(record.from_user_id)
        .bind(org_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to demote previous workspace owner: {}", e)))?;
    }

    // Promote new owner
    sqlx::query(
        "UPDATE organization_members SET role_ids = array_append(array_remove(role_ids, $1), $1) WHERE user_id = $2 AND organization_id = $3"
    )
    .bind(owner_role_id)
    .bind(session.user_id)
    .bind(org_id)
    .execute(&mut *tx)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to promote new workspace owner: {}", e)))?;

    // Mark transfer accepted
    sqlx::query("UPDATE owner_transfer_requests SET accepted_at = NOW() WHERE id = $1")
        .bind(record.id)
        .execute(&mut *tx)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Failed to mark workspace owner transfer as accepted: {}",
                e
            ))
        })?;

    tx.commit().await.map_err(|e| {
        AppError::Internal(format!("Failed to commit workspace owner transfer: {}", e))
    })?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: Some(org_id),
            action: "workspace.owner_transfer.accepted".into(),
            target_type: "user".into(),
            target_id: Some(session.user_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "from_user_id": record.from_user_id }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "message": "Ownership transfer accepted. You are now the workspace owner.",
    })))
}

pub fn routes(cfg: &mut web::ServiceConfig) {
    cfg.route("/public/branding", web::get().to(public_branding_handler));
    cfg.route(
        "/integrations/workspace",
        web::get().to(get_workspace_integration_info),
    );
    cfg.route(
        "/integrations/branding",
        web::get().to(get_workspace_integration_branding),
    );
    cfg.route(
        "/integrations/branding",
        web::patch().to(update_workspace_integration_branding),
    );
    cfg.route(
        "/integrations/auth-config",
        web::get().to(get_workspace_integration_auth_config),
    );
    cfg.route(
        "/integrations/auth-config",
        web::patch().to(update_workspace_integration_auth_config),
    );
    cfg.route(
        "/integrations/clients",
        web::get().to(list_workspace_integration_clients),
    );
    cfg.route(
        "/integrations/clients",
        web::post().to(create_workspace_integration_client),
    );
    cfg.route(
        "/integrations/clients/{client_id}",
        web::get().to(get_workspace_integration_client_detail),
    );
    cfg.route(
        "/integrations/clients/{client_id}",
        web::patch().to(update_workspace_integration_client),
    );
    cfg.route(
        "/integrations/clients/{client_id}",
        web::delete().to(delete_workspace_integration_client),
    );
    cfg.route(
        "/integrations/clients/{client_id}/status",
        web::patch().to(update_workspace_integration_client_status),
    );
    cfg.route(
        "/integrations/clients/{client_id}/secret-metadata",
        web::get().to(get_workspace_integration_client_secret_metadata),
    );
    cfg.route(
        "/integrations/clients/{client_id}/rotate-secret",
        web::post().to(rotate_workspace_integration_client_secret),
    );
    cfg.route(
        "/integrations/members",
        web::get().to(list_workspace_integration_members),
    );
    cfg.route(
        "/integrations/members/{member_id}",
        web::get().to(get_workspace_integration_member_detail),
    );
    cfg.route(
        "/integrations/members/{member_id}/activity",
        web::get().to(list_workspace_integration_member_activity),
    );
    cfg.route(
        "/integrations/members/{member_id}/profile",
        web::patch().to(update_workspace_integration_member_profile),
    );
    cfg.route(
        "/integrations/members/{member_id}/sessions",
        web::get().to(list_workspace_integration_member_sessions),
    );
    cfg.route(
        "/integrations/members/{member_id}/sessions",
        web::delete().to(revoke_workspace_integration_member_sessions),
    );
    cfg.route(
        "/integrations/members/{member_id}/role",
        web::patch().to(update_workspace_integration_member_role),
    );
    cfg.route(
        "/integrations/members/{member_id}",
        web::delete().to(remove_workspace_integration_member),
    );
    cfg.route(
        "/integrations/invites",
        web::get().to(list_workspace_integration_invites),
    );
    cfg.route(
        "/integrations/invites",
        web::post().to(send_workspace_integration_invite),
    );
    cfg.route(
        "/integrations/invites/{invite_id}",
        web::get().to(get_workspace_integration_invite_detail),
    );
    cfg.route(
        "/integrations/invites/{invite_id}",
        web::delete().to(revoke_workspace_integration_invite),
    );
    cfg.route(
        "/integrations/activity",
        web::get().to(list_workspace_integration_activity),
    );
    cfg.route(
        "/integrations/audit/actions",
        web::get().to(list_workspace_integration_audit_actions),
    );
    cfg.route(
        "/integrations/effective-policy",
        web::get().to(get_workspace_integration_effective_policy),
    );
    cfg.route(
        "/integrations/policy-summary",
        web::get().to(get_workspace_integration_policy_summary),
    );
    cfg.route(
        "/integrations/roles",
        web::get().to(list_workspace_integration_roles),
    );
    cfg.route(
        "/integrations/permissions",
        web::get().to(list_workspace_integration_permissions),
    );
    cfg.route(
        "/integrations/api-keys/me",
        web::get().to(get_workspace_integration_api_key_me),
    );
    cfg.route(
        "/integrations/widget-preview-config",
        web::get().to(get_workspace_integration_widget_preview_config),
    );
    crate::modules::rbac::handlers::routes(cfg);
    cfg.service(
        web::scope("")
            .wrap(RequireAuth)
            .route("", web::post().to(create_org))
            .route("", web::get().to(list_orgs))
            .route("/current/portal", web::get().to(current_portal))
            .route(
                "/current/branding",
                web::patch().to(update_current_org_branding),
            )
            .route(
                "/current/branding/upload",
                web::post().to(upload_current_org_branding_asset),
            )
            .route(
                "/current/auth-policy",
                web::patch().to(update_current_org_auth_policy),
            )
            .route(
                "/current/client-policy",
                web::get().to(get_current_org_client_policy),
            )
            .route(
                "/current/client-policy",
                web::patch().to(update_current_org_client_policy),
            )
            .route(
                "/current/ip-policy",
                web::get().to(get_current_org_ip_policy),
            )
            .route(
                "/current/ip-policy",
                web::patch().to(update_current_org_ip_policy),
            )
            .route(
                "/current/auth-config",
                web::get().to(get_current_org_auth_config),
            )
            .route(
                "/current/auth-config",
                web::patch().to(update_current_org_auth_config),
            )
            .route(
                "/current/auth-config/prepare-oauth-verification",
                web::post().to(prepare_current_org_oauth_verification),
            )
            .route(
                "/current/status",
                web::patch().to(update_current_org_status),
            )
            .route("/current/clients", web::get().to(list_current_org_clients))
            .route(
                "/current/clients",
                web::post().to(create_current_org_client),
            )
            .route(
                "/current/clients/{client_id}",
                web::patch().to(update_current_org_client),
            )
            .route(
                "/current/clients/{client_id}/rotate-secret",
                web::post().to(rotate_current_org_client_secret),
            )
            .route(
                "/current/clients/{client_id}/status",
                web::patch().to(update_current_org_client_status),
            )
            .route(
                "/current/clients/{client_id}",
                web::delete().to(delete_current_org_client),
            )
            .route("/current/members", web::get().to(list_current_org_members))
            .route("/current/invites", web::get().to(list_current_org_invites))
            .route(
                "/current/members/{member_id}/role",
                web::patch().to(update_current_org_member_role),
            )
            .route(
                "/current/members/{member_id}",
                web::delete().to(remove_current_org_member),
            )
            .route(
                "/workspace/activity",
                web::get().to(list_current_org_activity),
            )
            .route(
                "/workspace/activity/export",
                web::get().to(export_current_org_activity),
            )
            .route(
                "/current/security-alert-reviews",
                web::get().to(list_current_org_security_alert_reviews),
            )
            .route(
                "/current/security-alert-reviews",
                web::post().to(mark_current_org_security_alert_reviewed),
            )
            .route(
                "/current/security-alert-reviews",
                web::delete().to(reset_current_org_security_alert_reviews),
            )
            .route("/tenant/activity", web::get().to(list_my_orgs_activity))
            .route("/current/invites", web::post().to(send_current_org_invite))
            .route(
                "/current/invites/{invite_id}",
                web::delete().to(revoke_current_org_invite),
            )
            .route(
                "/current/api-keys",
                web::get().to(list_current_org_api_keys),
            )
            .route(
                "/current/api-keys",
                web::post().to(create_current_org_api_key),
            )
            .route(
                "/current/api-keys/{key_id}",
                web::delete().to(revoke_current_org_api_key),
            )
            // Phase 6: Control Plane Maturity
            .route(
                "/current/effective-policy",
                web::get().to(get_effective_policy),
            )
            .route(
                "/current/auth-policy/preview",
                web::post().to(preview_auth_policy_change),
            )
            .route(
                "/current/auth-policy/self-check",
                web::post().to(check_self_lockout),
            )
            .route(
                "/current/policy-snapshots",
                web::get().to(list_policy_snapshots),
            )
            .route(
                "/current/policy-snapshots/{id}/restore",
                web::post().to(restore_policy_snapshot),
            )
            .route(
                "/current/role-templates",
                web::get().to(list_role_templates),
            )
            .route("/current/role-diff", web::get().to(diff_roles))
            .route(
                "/current/owner-transfer",
                web::post().to(initiate_owner_transfer),
            )
            .route(
                "/current/owner-transfer/accept",
                web::post().to(accept_owner_transfer),
            )
            .route("/switch", web::post().to(switch_org))
            .route("/{org_id}/members", web::get().to(list_org_members))
            .route("/{org_id}/invites", web::post().to(send_invite))
            .route("/invites/accept", web::post().to(accept_invite)),
    );
}
