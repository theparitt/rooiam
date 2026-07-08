use actix_web::{web, HttpRequest, HttpResponse};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::bootstrap::state::AppState;
use crate::http::middleware::auth::{extract_session, RequireAuth};
use crate::modules::admin::access::{ensure_platform_staff, ensure_platform_staff_by_user_id};
use crate::modules::admin::demo::{
    demo_email_filter, demo_org_slug_filter, is_demo_client_visible, is_demo_email_visible,
    is_demo_org_slug_visible,
};
use crate::modules::admin::listing::{
    normalize_page, normalize_page_size, normalize_search, AdminListQuery, PaginatedResponse,
};
use crate::modules::admin::policies::{
    get_platform_admin_ip_policy, get_platform_client_governance, get_platform_ip_policy,
    get_platform_workspace_governance, get_tenant_access_policy,
    get_tenant_workspace_app_governance, update_platform_admin_ip_policy,
    update_platform_client_governance, update_platform_ip_policy,
    update_platform_workspace_governance, update_tenant_access_policy,
    update_tenant_workspace_app_governance,
};
use crate::modules::admin::risk::{
    get_risk_policy, list_platform_security_alert_reviews, mark_platform_security_alert_reviewed,
    reset_platform_security_alert_reviews, update_risk_policy,
};
use crate::modules::admin::storage::{
    get_storage_config, test_storage_config, update_storage_config,
};
use crate::modules::audit::service::{AuditEvent, AuditService};
use crate::shared::demo_seed::demo_seed_enabled;
use crate::shared::error::AppError;
use crate::shared::oauth_client::generate_confidential_client_secret;
use crate::shared::platform_org::get_platform_org_id;
use crate::shared::request_ip::client_ip_string_from_http_request;

// ── Response types ──────────────────────────────────────────────────────────

const ADMIN_WORKSPACE_DETAIL_MEMBER_LIMIT: i64 = 200;
const ADMIN_WORKSPACE_DETAIL_CLIENT_LIMIT: i64 = 100;
const ADMIN_CLIENT_REDIRECT_URI_LIMIT: i64 = 25;
#[derive(Serialize, FromRow)]
pub struct AdminUser {
    pub id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub avatar_url: Option<String>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub last_seen_at: Option<chrono::DateTime<chrono::Utc>>,
    pub status: String,
    pub is_platform_owner: bool,
    pub is_superuser: bool,
    pub workspace_count: i64,
    pub primary_workspace_name: Option<String>,
    pub primary_workspace_slug: Option<String>,
    pub primary_workspace_icon_url: Option<String>,
    pub primary_workspace_icon_container: Option<String>,
    /// Highest role across all workspaces: "owner" > "admin" > "member" > null
    pub highest_workspace_role: Option<String>,
}

#[derive(Serialize, FromRow)]
pub struct AdminOrganization {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub icon_url: Option<String>,
    pub icon_container: String,
    pub member_count: i64,
    pub status: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize, FromRow)]
pub struct AdminOrganizationSummary {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub status: String,
    pub platform_locked: bool,
    pub member_count: i64,
    pub app_count: i64,
    pub allow_magic_link: bool,
    pub allow_google: bool,
    pub allow_microsoft: bool,
    pub allow_passkey: bool,
    pub require_mfa: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize, FromRow, Clone)]
pub struct AdminOrganizationMember {
    pub id: Uuid,
    pub user_id: Uuid,
    pub status: String,
    pub display_name: Option<String>,
    pub email: Option<String>,
    pub role_names: Vec<String>,
    pub role_codes: Vec<String>,
}

#[derive(Serialize)]
pub struct AdminOrganizationDetail {
    pub organization: AdminOrganizationSummary,
    pub owner: Option<AdminOrganizationMember>,
    pub admins: Vec<AdminOrganizationMember>,
    pub members: Vec<AdminOrganizationMember>,
    pub clients: Vec<AdminClient>,
    pub recent_activity: Vec<AdminAuditLog>,
}

#[derive(Serialize, FromRow)]
pub struct AdminUserWorkspaceMembership {
    pub membership_id: Uuid,
    pub organization_id: Uuid,
    pub organization_name: String,
    pub organization_slug: String,
    pub organization_icon_url: Option<String>,
    pub organization_icon_container: String,
    pub membership_status: String,
    pub role_names: Vec<String>,
    pub role_codes: Vec<String>,
}

#[derive(Serialize)]
pub struct AdminUserDetail {
    pub user: AdminUser,
    pub workspace_memberships: Vec<AdminUserWorkspaceMembership>,
    pub recent_activity: Vec<AdminAuditLog>,
}

#[derive(Serialize, FromRow)]
pub struct AdminClient {
    pub id: Uuid,
    pub client_id: String,
    pub app_name: String,
    pub app_type: String,
    pub status: String,
    pub owner_user_id: Option<Uuid>,
    pub owner_email: Option<String>,
    pub org_id: Option<Uuid>,
    pub organization_name: Option<String>,
    pub organization_slug: Option<String>,
    pub is_first_party: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub redirect_uris: Vec<String>,
}

#[derive(Serialize)]
pub struct AdminClientDetail {
    #[serde(flatten)]
    pub client: AdminClient,
    pub owner_display_name: Option<String>,
    pub organization_status: Option<String>,
    pub recent_activity: Vec<AdminAuditLog>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateAdminUserStatusRequest {
    pub status: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateAdminUserRoleRequest {
    /// "platform_admin" to grant, "user" to revoke
    pub role: String,
}

#[derive(Serialize)]
pub struct RotateAdminClientSecretResponse {
    pub client_id: String,
    pub client_secret: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateAdminClientStatusRequest {
    pub status: String,
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async fn list_all_users(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<AdminListQuery>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let page = normalize_page(&query)?;
    let page_size = normalize_page_size(&query)?;
    let offset = (page - 1) * page_size;
    let search = normalize_search(&query);
    let role_filter = query.role.as_deref().unwrap_or("all").trim().to_lowercase();

    let total: i64 = sqlx::query_scalar(
        r#"
        WITH user_rollup AS (
            SELECT
                u.id,
                COALESCE(e.email, '') AS email,
                u.display_name,
                u.is_platform_owner,
                u.is_superuser,
                COUNT(DISTINCT om.id) AS workspace_count,
                CASE
                    WHEN bool_or(r.code = 'owner')  THEN 'owner'
                    WHEN bool_or(r.code = 'admin')  THEN 'admin'
                    WHEN bool_or(r.code = 'member') THEN 'member'
                    ELSE NULL
                END AS highest_workspace_role
            FROM users u
            LEFT JOIN user_emails e ON e.user_id = u.id AND e.is_primary = true
            LEFT JOIN organization_members om ON om.user_id = u.id
            LEFT JOIN member_roles mr ON mr.member_id = om.id
            LEFT JOIN roles r ON r.id = mr.role_id AND r.is_system = true
            WHERE $1 = false OR COALESCE(e.email, '') = ANY($2)
            GROUP BY u.id, e.email
        )
        SELECT COUNT(*)
        FROM user_rollup ur
        WHERE
            ($3 = '' OR ur.email ILIKE '%' || $3 || '%' OR COALESCE(ur.display_name, '') ILIKE '%' || $3 || '%')
            AND (
                $4 = 'all'
                OR ($4 = 'platform' AND (ur.is_platform_owner OR ur.is_superuser))
                OR ($4 = 'platform_owner' AND ur.is_platform_owner)
                OR ($4 = 'platform_admin' AND ur.is_superuser AND NOT ur.is_platform_owner)
                OR ($4 = 'workspace_admin' AND NOT ur.is_platform_owner AND NOT ur.is_superuser AND ur.highest_workspace_role IN ('owner', 'admin'))
                OR ($4 = 'user' AND NOT ur.is_platform_owner AND NOT ur.is_superuser AND (ur.highest_workspace_role = 'member' OR ur.workspace_count > 0))
            )
        "#
    )
    .bind(demo_seed_enabled())
    .bind(demo_email_filter())
    .bind(&search)
    .bind(&role_filter)
    .fetch_one(&state.db)
    .await
    ?;

    let users = sqlx::query_as::<_, AdminUser>(
        r#"
        WITH user_rollup AS (
            SELECT
                u.id,
                COALESCE(e.email, '') AS email,
                u.display_name,
                u.avatar_url,
                u.created_at,
                ls.last_seen_at,
                u.status,
                u.is_platform_owner,
                u.is_superuser,
                COUNT(DISTINCT om.id) AS workspace_count,
                pwo.primary_workspace_name,
                pwo.primary_workspace_slug,
                pwo.primary_workspace_icon_url,
                pwo.primary_workspace_icon_container,
                CASE
                    WHEN bool_or(r.code = 'owner')  THEN 'owner'
                    WHEN bool_or(r.code = 'admin')  THEN 'admin'
                    WHEN bool_or(r.code = 'member') THEN 'member'
                    ELSE NULL
                END AS highest_workspace_role
            FROM users u
            LEFT JOIN user_emails e         ON e.user_id = u.id AND e.is_primary = true
            LEFT JOIN organization_members om ON om.user_id = u.id
            LEFT JOIN member_roles mr        ON mr.member_id = om.id
            LEFT JOIN roles r                ON r.id = mr.role_id AND r.is_system = true
            LEFT JOIN LATERAL (
                SELECT
                    o.name AS primary_workspace_name,
                    o.slug AS primary_workspace_slug,
                    o.icon_url AS primary_workspace_icon_url,
                    o.icon_container AS primary_workspace_icon_container
                FROM organization_members om2
                JOIN organizations o ON o.id = om2.organization_id
                LEFT JOIN member_roles mr2 ON mr2.member_id = om2.id
                LEFT JOIN roles r2 ON r2.id = mr2.role_id AND r2.is_system = true
                WHERE om2.user_id = u.id
                GROUP BY o.id, o.name, o.slug, o.icon_url, o.icon_container, o.created_at, om2.created_at
                ORDER BY
                    MAX(CASE
                        WHEN r2.code = 'owner' THEN 3
                        WHEN r2.code = 'admin' THEN 2
                        WHEN r2.code = 'member' THEN 1
                        ELSE 0
                    END) DESC,
                    om2.created_at ASC,
                    o.created_at ASC
                LIMIT 1
            ) pwo ON true
            LEFT JOIN LATERAL (
                SELECT MAX(s.last_seen_at) AS last_seen_at
                FROM sessions s
                WHERE s.user_id = u.id
            ) ls ON true
            WHERE $1 = false OR COALESCE(e.email, '') = ANY($2)
            GROUP BY
                u.id,
                e.email,
                u.avatar_url,
                ls.last_seen_at,
                pwo.primary_workspace_name,
                pwo.primary_workspace_slug,
                pwo.primary_workspace_icon_url,
                pwo.primary_workspace_icon_container
        )
        SELECT *
        FROM user_rollup ur
        WHERE
            ($3 = '' OR ur.email ILIKE '%' || $3 || '%' OR COALESCE(ur.display_name, '') ILIKE '%' || $3 || '%')
            AND (
                $4 = 'all'
                OR ($4 = 'platform' AND (ur.is_platform_owner OR ur.is_superuser))
                OR ($4 = 'platform_owner' AND ur.is_platform_owner)
                OR ($4 = 'platform_admin' AND ur.is_superuser AND NOT ur.is_platform_owner)
                OR ($4 = 'workspace_admin' AND NOT ur.is_platform_owner AND NOT ur.is_superuser AND ur.highest_workspace_role IN ('owner', 'admin'))
                OR ($4 = 'user' AND NOT ur.is_platform_owner AND NOT ur.is_superuser AND (ur.highest_workspace_role = 'member' OR ur.workspace_count > 0))
            )
        ORDER BY ur.created_at DESC
        LIMIT $5 OFFSET $6
        "#
    )
    .bind(demo_seed_enabled())
    .bind(demo_email_filter())
    .bind(&search)
    .bind(&role_filter)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    ?;

    Ok(HttpResponse::Ok().json(PaginatedResponse {
        items: users,
        total,
        page,
        page_size,
    }))
}

async fn list_all_organizations(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<AdminListQuery>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let page = normalize_page(&query)?;
    let page_size = normalize_page_size(&query)?;
    let offset = (page - 1) * page_size;
    let search = normalize_search(&query);

    let total: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM organizations o
        WHERE ($1 = false OR o.slug = ANY($2))
          AND ($3 = '' OR o.name ILIKE '%' || $3 || '%' OR o.slug ILIKE '%' || $3 || '%')
        "#,
    )
    .bind(demo_seed_enabled())
    .bind(demo_org_slug_filter())
    .bind(&search)
    .fetch_one(&state.db)
    .await?;

    let orgs = sqlx::query_as::<_, AdminOrganization>(
        r#"
        SELECT 
            o.id, 
            o.name, 
            o.slug, 
            o.icon_url,
            o.icon_container,
            (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id) AS member_count,
            o.status,
            o.created_at
        FROM organizations o
        WHERE ($1 = false OR o.slug = ANY($2))
          AND ($3 = '' OR o.name ILIKE '%' || $3 || '%' OR o.slug ILIKE '%' || $3 || '%')
        ORDER BY o.created_at DESC
        LIMIT $4 OFFSET $5
        "#
    )
    .bind(demo_seed_enabled())
    .bind(demo_org_slug_filter())
    .bind(&search)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    ?;

    Ok(HttpResponse::Ok().json(PaginatedResponse {
        items: orgs,
        total,
        page,
        page_size,
    }))
}

async fn get_user_detail(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let user_id = path.into_inner();

    let user = sqlx::query_as::<_, AdminUser>(
        r#"
        SELECT
            u.id,
            COALESCE(e.email, '') AS email,
            u.display_name,
            u.avatar_url,
            u.created_at,
            ls.last_seen_at,
            u.status,
            u.is_platform_owner,
            u.is_superuser,
            COUNT(DISTINCT om.id) AS workspace_count,
            pwo.primary_workspace_name,
            pwo.primary_workspace_slug,
            pwo.primary_workspace_icon_url,
            pwo.primary_workspace_icon_container,
            CASE
                WHEN bool_or(r.code = 'owner')  THEN 'owner'
                WHEN bool_or(r.code = 'admin')  THEN 'admin'
                WHEN bool_or(r.code = 'member') THEN 'member'
                ELSE NULL
            END AS highest_workspace_role
        FROM users u
        LEFT JOIN user_emails e ON e.user_id = u.id AND e.is_primary = true
        LEFT JOIN organization_members om ON om.user_id = u.id
        LEFT JOIN member_roles mr ON mr.member_id = om.id
        LEFT JOIN roles r ON r.id = mr.role_id AND r.is_system = true
        LEFT JOIN LATERAL (
            SELECT
                o.name AS primary_workspace_name,
                o.slug AS primary_workspace_slug,
                o.icon_url AS primary_workspace_icon_url,
                o.icon_container AS primary_workspace_icon_container
            FROM organization_members om2
            JOIN organizations o ON o.id = om2.organization_id
            LEFT JOIN member_roles mr2 ON mr2.member_id = om2.id
            LEFT JOIN roles r2 ON r2.id = mr2.role_id AND r2.is_system = true
            WHERE om2.user_id = u.id
            GROUP BY o.id, o.name, o.slug, o.icon_url, o.icon_container, o.created_at, om2.created_at
            ORDER BY
                MAX(CASE
                    WHEN r2.code = 'owner' THEN 3
                    WHEN r2.code = 'admin' THEN 2
                    WHEN r2.code = 'member' THEN 1
                    ELSE 0
                END) DESC,
                om2.created_at ASC,
                o.created_at ASC
            LIMIT 1
        ) pwo ON true
        LEFT JOIN LATERAL (
            SELECT MAX(s.last_seen_at) AS last_seen_at
            FROM sessions s
            WHERE s.user_id = u.id
        ) ls ON true
        WHERE u.id = $1
        GROUP BY
            u.id,
            e.email,
            u.avatar_url,
            ls.last_seen_at,
            pwo.primary_workspace_name,
            pwo.primary_workspace_slug,
            pwo.primary_workspace_icon_url,
            pwo.primary_workspace_icon_container
        "#
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await
    ?
    .ok_or_else(|| AppError::NotFound("Member not found.".into()))?;

    if demo_seed_enabled() && !demo_email_filter().contains(&user.email.as_str()) {
        return Err(AppError::NotFound("Member not found.".into()));
    }

    let workspace_memberships = sqlx::query_as::<_, AdminUserWorkspaceMembership>(
        r#"
        SELECT
            om.id AS membership_id,
            o.id AS organization_id,
            o.name AS organization_name,
            o.slug AS organization_slug,
            o.icon_url AS organization_icon_url,
            o.icon_container AS organization_icon_container,
            om.status AS membership_status,
            COALESCE(array_remove(array_agg(DISTINCT r.name), NULL), ARRAY[]::text[]) AS role_names,
            COALESCE(array_remove(array_agg(DISTINCT r.code), NULL), ARRAY[]::text[]) AS role_codes
        FROM organization_members om
        JOIN organizations o ON o.id = om.organization_id
        LEFT JOIN member_roles mr ON mr.member_id = om.id
        LEFT JOIN roles r ON r.id = mr.role_id
        WHERE om.user_id = $1
          AND ($2 = false OR o.slug = ANY($3))
        GROUP BY om.id, o.id, o.name, o.slug, o.icon_url, o.icon_container, om.status, om.created_at
        ORDER BY
            MAX(CASE
                WHEN r.code = 'owner' THEN 3
                WHEN r.code = 'admin' THEN 2
                WHEN r.code = 'member' THEN 1
                ELSE 0
            END) DESC,
            om.created_at ASC,
            o.created_at ASC
        LIMIT 100
        "#,
    )
    .bind(user_id)
    .bind(demo_seed_enabled())
    .bind(demo_org_slug_filter())
    .fetch_all(&state.db)
    .await?;

    let recent_activity = sqlx::query_as::<_, AdminAuditLog>(
        r#"
        SELECT
            al.id,
            al.actor_user_id,
            ue.email as actor_email,
            u.display_name as actor_display_name,
            al.organization_id,
            al.action,
            al.target_type,
            al.target_id,
            al.ip::text,
            al.user_agent,
            al.metadata,
            al.created_at
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
        LEFT JOIN organizations o ON o.id = al.organization_id
        WHERE al.actor_user_id = $1
          AND (
                $2 = false
                OR COALESCE(ue.email, '') = ANY($3)
                OR (o.slug IS NOT NULL AND o.slug = ANY($4))
                OR COALESCE(al.metadata->>'demo_mode', 'false') = 'true'
          )
        ORDER BY al.created_at DESC
        LIMIT 20
        "#,
    )
    .bind(user_id)
    .bind(demo_seed_enabled())
    .bind(demo_email_filter())
    .bind(demo_org_slug_filter())
    .fetch_all(&state.db)
    .await?;

    Ok(HttpResponse::Ok().json(AdminUserDetail {
        user,
        workspace_memberships,
        recent_activity,
    }))
}

async fn update_user_status(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<UpdateAdminUserStatusRequest>,
) -> Result<HttpResponse, AppError> {
    let actor = extract_session(&req)?;
    ensure_platform_staff_by_user_id(actor.user_id, &state).await?;

    let target_user_id = path.into_inner();
    let normalized_status = body.status.trim().to_lowercase();
    if normalized_status != "active" && normalized_status != "suspended" {
        return Err(AppError::Validation(
            "Status must be either 'active' or 'suspended'.".into(),
        ));
    }

    let target = sqlx::query_as::<_, crate::modules::identity::models::User>(
        r#"
        SELECT
            u.id,
            e.email,
            u.display_name,
            u.avatar_url,
            u.status,
            u.is_platform_owner,
            u.is_superuser,
            u.created_at,
            u.updated_at,
            u.last_login_ip,
            u.last_login_ua_hash
        FROM users u
        LEFT JOIN user_emails e ON e.user_id = u.id AND e.is_primary = true
        WHERE u.id = $1
        "#,
    )
    .bind(target_user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Member not found.".into()))?;

    if demo_seed_enabled() && !target.email.as_deref().is_some_and(is_demo_email_visible) {
        return Err(AppError::NotFound("Member not found.".into()));
    }

    if target.is_platform_owner {
        return Err(AppError::Forbidden(
            "Platform owner status cannot be changed from this screen.".into(),
        ));
    }

    if actor.user_id == target_user_id {
        return Err(AppError::Forbidden(
            "You cannot change your own account status from this screen.".into(),
        ));
    }

    let updated = sqlx::query_as::<_, AdminUser>(
        r#"
        WITH updated_user AS (
            UPDATE users
            SET status = $2,
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, status
        )
        SELECT
            u.id,
            COALESCE(e.email, '') AS email,
            u.display_name,
            u.avatar_url,
            u.created_at,
            ls.last_seen_at,
            uu.status,
            u.is_platform_owner,
            u.is_superuser,
            COUNT(DISTINCT om.id) AS workspace_count,
            pwo.primary_workspace_name,
            pwo.primary_workspace_slug,
            pwo.primary_workspace_icon_url,
            pwo.primary_workspace_icon_container,
            CASE
                WHEN bool_or(r.code = 'owner')  THEN 'owner'
                WHEN bool_or(r.code = 'admin')  THEN 'admin'
                WHEN bool_or(r.code = 'member') THEN 'member'
                ELSE NULL
            END AS highest_workspace_role
        FROM updated_user uu
        JOIN users u ON u.id = uu.id
        LEFT JOIN user_emails e ON e.user_id = u.id AND e.is_primary = true
        LEFT JOIN organization_members om ON om.user_id = u.id
        LEFT JOIN member_roles mr ON mr.member_id = om.id
        LEFT JOIN roles r ON r.id = mr.role_id AND r.is_system = true
        LEFT JOIN LATERAL (
            SELECT
                o.name AS primary_workspace_name,
                o.slug AS primary_workspace_slug,
                o.icon_url AS primary_workspace_icon_url,
                o.icon_container AS primary_workspace_icon_container
            FROM organization_members om2
            JOIN organizations o ON o.id = om2.organization_id
            LEFT JOIN member_roles mr2 ON mr2.member_id = om2.id
            LEFT JOIN roles r2 ON r2.id = mr2.role_id AND r2.is_system = true
            WHERE om2.user_id = u.id
            GROUP BY o.id, o.name, o.slug, o.icon_url, o.icon_container, o.created_at, om2.created_at
            ORDER BY
                MAX(CASE
                    WHEN r2.code = 'owner' THEN 3
                    WHEN r2.code = 'admin' THEN 2
                    WHEN r2.code = 'member' THEN 1
                    ELSE 0
                END) DESC,
                om2.created_at ASC,
                o.created_at ASC
            LIMIT 1
        ) pwo ON true
        LEFT JOIN LATERAL (
            SELECT MAX(s.last_seen_at) AS last_seen_at
            FROM sessions s
            WHERE s.user_id = u.id
        ) ls ON true
        GROUP BY
            u.id,
            e.email,
            u.avatar_url,
            ls.last_seen_at,
            uu.status,
            pwo.primary_workspace_name,
            pwo.primary_workspace_slug,
            pwo.primary_workspace_icon_url,
            pwo.primary_workspace_icon_container
        "#
    )
    .bind(target_user_id)
    .bind(&normalized_status)
    .fetch_one(&state.db)
    .await
    ?;

    if normalized_status != "active" {
        sqlx::query(
            "UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()"
        )
        .bind(target_user_id)
        .execute(&state.db)
        .await
        ?;
    }

    let platform_org_id = get_platform_org_id(&state.db).await;
    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(actor.user_id),
            organization_id: platform_org_id,
            action: if normalized_status == "active" {
                "admin.user.resumed".into()
            } else {
                "admin.user.suspended".into()
            },
            target_type: "user".into(),
            target_id: Some(target_user_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "status": normalized_status,
                "target_email": updated.email,
                "demo_mode": demo_seed_enabled(),
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(updated))
}

async fn update_user_role(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<UpdateAdminUserRoleRequest>,
) -> Result<HttpResponse, AppError> {
    let actor = extract_session(&req)?;
    ensure_platform_staff_by_user_id(actor.user_id, &state).await?;

    // Only platform owner can grant/revoke platform admin
    let actor_row = sqlx::query!(
        "SELECT is_platform_owner FROM users WHERE id = $1",
        actor.user_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Actor not found.".into()))?;

    if !actor_row.is_platform_owner {
        return Err(AppError::Forbidden(
            "Only the platform owner can grant or revoke platform admin.".into(),
        ));
    }

    let target_user_id = path.into_inner();
    let normalized_role = body.role.trim().to_lowercase();
    if normalized_role != "platform_admin" && normalized_role != "user" {
        return Err(AppError::Validation(
            "Role must be 'platform_admin' or 'user'.".into(),
        ));
    }

    let target = sqlx::query!(
        r#"SELECT u.id, u.is_platform_owner, u.is_superuser FROM users u WHERE u.id = $1"#,
        target_user_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Member not found.".into()))?;

    if target.is_platform_owner {
        return Err(AppError::Forbidden(
            "Platform owner role cannot be changed.".into(),
        ));
    }
    if actor.user_id == target_user_id {
        return Err(AppError::Forbidden(
            "You cannot change your own platform role.".into(),
        ));
    }

    let grant = normalized_role == "platform_admin";

    let updated = sqlx::query_as::<_, AdminUser>(
        r#"
        WITH updated_user AS (
            UPDATE users
            SET is_superuser = $2,
                updated_at = NOW()
            WHERE id = $1
            RETURNING id
        )
        SELECT
            u.id,
            COALESCE(e.email, '') AS email,
            u.display_name,
            u.avatar_url,
            u.created_at,
            ls.last_seen_at,
            u.status,
            u.is_platform_owner,
            u.is_superuser,
            COUNT(DISTINCT om.id) AS workspace_count,
            pwo.primary_workspace_name,
            pwo.primary_workspace_slug,
            pwo.primary_workspace_icon_url,
            pwo.primary_workspace_icon_container,
            CASE
                WHEN bool_or(r.code = 'owner')  THEN 'owner'
                WHEN bool_or(r.code = 'admin')  THEN 'admin'
                WHEN bool_or(r.code = 'member') THEN 'member'
                ELSE NULL
            END AS highest_workspace_role
        FROM updated_user uu
        JOIN users u ON u.id = uu.id
        LEFT JOIN user_emails e ON e.user_id = u.id AND e.is_primary = true
        LEFT JOIN organization_members om ON om.user_id = u.id
        LEFT JOIN member_roles mr ON mr.member_id = om.id
        LEFT JOIN roles r ON r.id = mr.role_id AND r.is_system = true
        LEFT JOIN LATERAL (
            SELECT
                o.name  AS primary_workspace_name,
                o.slug  AS primary_workspace_slug,
                o.icon_url AS primary_workspace_icon_url,
                o.icon_container AS primary_workspace_icon_container
            FROM organization_members om2
            JOIN organizations o ON o.id = om2.organization_id
            WHERE om2.user_id = u.id
            ORDER BY om2.created_at ASC
            LIMIT 1
        ) pwo ON true
        LEFT JOIN LATERAL (
            SELECT MAX(s.last_seen_at) AS last_seen_at
            FROM sessions s
            WHERE s.user_id = u.id
        ) ls ON true
        GROUP BY
            u.id,
            e.email,
            u.avatar_url,
            ls.last_seen_at,
            pwo.primary_workspace_name,
            pwo.primary_workspace_slug,
            pwo.primary_workspace_icon_url,
            pwo.primary_workspace_icon_container
        "#,
    )
    .bind(target_user_id)
    .bind(grant)
    .fetch_one(&state.db)
    .await?;

    // Revoke sessions when removing admin privilege
    if !grant {
        sqlx::query(
            "UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()"
        )
        .bind(target_user_id)
        .execute(&state.db)
        .await
        ?;
    }

    let platform_org_id = get_platform_org_id(&state.db).await;
    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(actor.user_id),
            organization_id: platform_org_id,
            action: if grant {
                "admin.user.role.granted_platform_admin".into()
            } else {
                "admin.user.role.revoked_platform_admin".into()
            },
            target_type: "user".into(),
            target_id: Some(target_user_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "target_email": updated.email,
                "grant": grant,
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(updated))
}

// ---------- per-user workspace limit override ----------

#[derive(Serialize)]
pub struct AdminUserWorkspaceLimit {
    /// Admin-set override for this user; null means the platform policy applies.
    pub override_limit: Option<i32>,
    /// Platform-wide limit (operator setting clamped to the hard cap).
    pub platform_limit: i32,
    /// The limit actually applied to this user.
    pub effective_limit: i32,
    /// Active workspaces the user currently belongs to.
    pub current_workspaces: i64,
    /// Maximum value accepted for an override.
    pub override_ceiling: i32,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateUserWorkspaceLimitRequest {
    /// New override; null clears the override (user returns to platform policy).
    pub limit: Option<i32>,
}

async fn load_user_workspace_limit(
    state: &AppState,
    user_id: Uuid,
) -> Result<AdminUserWorkspaceLimit, AppError> {
    let governance =
        crate::shared::workspace_governance::load_platform_workspace_governance(&state.db).await?;
    let override_limit =
        crate::shared::workspace_governance::user_max_workspaces_override(&state.db, user_id)
            .await?;
    let effective_limit = crate::shared::workspace_governance::effective_max_workspaces_for_user(
        &state.db,
        &governance,
        user_id,
    )
    .await?;
    let current_workspaces: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM organization_members om
        JOIN organizations o ON o.id = om.organization_id
        WHERE om.user_id = $1 AND om.status = 'active' AND o.status = 'active'
        "#,
    )
    .bind(user_id)
    .fetch_one(&state.db)
    .await?;

    Ok(AdminUserWorkspaceLimit {
        override_limit,
        platform_limit: governance.effective_max_workspaces(),
        effective_limit,
        current_workspaces,
        override_ceiling: crate::shared::workspace_governance::PER_USER_MAX_WORKSPACES_CEILING,
    })
}

async fn ensure_user_exists(state: &AppState, user_id: Uuid) -> Result<(), AppError> {
    let exists: Option<i32> = sqlx::query_scalar("SELECT 1 FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?;
    if exists.is_none() {
        return Err(AppError::NotFound("Member not found.".into()));
    }
    Ok(())
}

/// GET /admin/users/{user_id}/workspace-limit
async fn get_user_workspace_limit(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let actor = extract_session(&req)?;
    ensure_platform_staff_by_user_id(actor.user_id, &state).await?;

    let target_user_id = path.into_inner();
    ensure_user_exists(&state, target_user_id).await?;
    let payload = load_user_workspace_limit(&state, target_user_id).await?;
    Ok(HttpResponse::Ok().json(payload))
}

/// PUT /admin/users/{user_id}/workspace-limit — set or clear (limit: null).
async fn update_user_workspace_limit(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<UpdateUserWorkspaceLimitRequest>,
) -> Result<HttpResponse, AppError> {
    let actor = extract_session(&req)?;
    ensure_platform_staff_by_user_id(actor.user_id, &state).await?;

    let target_user_id = path.into_inner();
    ensure_user_exists(&state, target_user_id).await?;

    crate::shared::workspace_governance::set_user_max_workspaces_override(
        &state.db,
        target_user_id,
        body.limit,
    )
    .await?;

    let platform_org_id = get_platform_org_id(&state.db).await;
    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(actor.user_id),
            organization_id: platform_org_id,
            action: "admin.user.workspace_limit.updated".into(),
            target_type: "user".into(),
            target_id: Some(target_user_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "limit": body.limit }),
        })
        .await;

    let payload = load_user_workspace_limit(&state, target_user_id).await?;
    Ok(HttpResponse::Ok().json(payload))
}

async fn get_organization_detail(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let organization_id = path.into_inner();

    let organization = sqlx::query_as::<_, AdminOrganizationSummary>(
        r#"
        SELECT
            o.id,
            o.name,
            o.slug,
            o.status,
            o.platform_locked,
            (SELECT COUNT(*) FROM organization_members om WHERE om.organization_id = o.id) AS member_count,
            (SELECT COUNT(*) FROM oauth_clients c WHERE c.org_id = o.id) AS app_count,
            o.allow_magic_link,
            o.allow_google,
            o.allow_microsoft,
            o.allow_passkey,
            o.require_mfa,
            o.created_at
        FROM organizations o
        WHERE o.id = $1
        "#
    )
    .bind(organization_id)
    .fetch_optional(&state.db)
    .await
    ?
    .ok_or_else(|| AppError::NotFound("Workspace not found.".into()))?;

    if demo_seed_enabled() && !is_demo_org_slug_visible(&organization.slug) {
        return Err(AppError::NotFound("Workspace not found.".into()));
    }

    let members = sqlx::query_as::<_, AdminOrganizationMember>(
        r#"
        SELECT
            om.id,
            om.user_id,
            om.status,
            u.display_name,
            ue.email,
            COALESCE(array_remove(array_agg(DISTINCT r.name), NULL), ARRAY[]::text[]) AS role_names,
            COALESCE(array_remove(array_agg(DISTINCT r.code), NULL), ARRAY[]::text[]) AS role_codes
        FROM organization_members om
        JOIN users u ON u.id = om.user_id
        LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
        LEFT JOIN member_roles mr ON mr.member_id = om.id
        LEFT JOIN roles r ON r.id = mr.role_id
        WHERE om.organization_id = $1
        GROUP BY om.id, om.user_id, om.status, u.display_name, ue.email
        ORDER BY om.created_at ASC
        LIMIT $2
        "#,
    )
    .bind(organization_id)
    .bind(ADMIN_WORKSPACE_DETAIL_MEMBER_LIMIT)
    .fetch_all(&state.db)
    .await?;

    let clients = sqlx::query_as::<_, AdminClient>(
        r#"
        SELECT
            c.id,
            c.client_id,
            c.app_name,
            c.app_type,
            c.status,
            c.owner_user_id,
            ue.email AS owner_email,
            c.org_id,
            o.name AS organization_name,
            o.slug AS organization_slug,
            c.is_first_party,
            c.created_at,
            COALESCE(
                ARRAY(
                    SELECT r.redirect_uri
                    FROM oauth_client_redirect_uris r
                    WHERE r.oauth_client_id = c.id
                    ORDER BY r.redirect_uri
                    LIMIT $2
                ),
                ARRAY[]::text[]
            ) AS redirect_uris
        FROM oauth_clients c
        LEFT JOIN organizations o ON o.id = c.org_id
        LEFT JOIN user_emails ue ON ue.user_id = c.owner_user_id AND ue.is_primary = true
        WHERE c.org_id = $1
        ORDER BY c.created_at DESC
        LIMIT $3
        "#,
    )
    .bind(organization_id)
    .bind(ADMIN_CLIENT_REDIRECT_URI_LIMIT)
    .bind(ADMIN_WORKSPACE_DETAIL_CLIENT_LIMIT)
    .fetch_all(&state.db)
    .await?;

    let recent_activity = sqlx::query_as::<_, AdminAuditLog>(
        r#"
        SELECT
            al.id,
            al.actor_user_id,
            ue.email as actor_email,
            u.display_name as actor_display_name,
            al.organization_id,
            al.action,
            al.target_type,
            al.target_id,
            al.ip::text,
            al.user_agent,
            al.metadata,
            al.created_at
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
        WHERE al.organization_id = $1
        ORDER BY al.created_at DESC
        LIMIT 20
        "#,
    )
    .bind(organization_id)
    .fetch_all(&state.db)
    .await?;

    let owner = members
        .iter()
        .find(|member| member.role_codes.iter().any(|role| role == "owner"))
        .cloned();
    let admins = members
        .iter()
        .filter(|member| {
            member
                .role_codes
                .iter()
                .any(|role| role == "owner" || role == "admin")
        })
        .cloned()
        .collect::<Vec<_>>();

    Ok(HttpResponse::Ok().json(AdminOrganizationDetail {
        organization,
        owner,
        admins,
        members,
        clients,
        recent_activity,
    }))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdateOrgStatusRequest {
    status: String,
}

async fn update_organization_status(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<UpdateOrgStatusRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;

    let org_id = path.into_inner();
    let normalized = body.status.trim().to_lowercase();
    if normalized != "active" && normalized != "suspended" {
        return Err(AppError::Validation(
            "Status must be 'active' or 'suspended'.".into(),
        ));
    }

    if demo_seed_enabled() {
        let slug: Option<String> =
            sqlx::query_scalar("SELECT slug FROM organizations WHERE id = $1")
                .bind(org_id)
                .fetch_optional(&state.db)
                .await?;
        if !slug.as_deref().is_some_and(is_demo_org_slug_visible) {
            return Err(AppError::NotFound("Organization not found.".into()));
        }
    }

    #[derive(Serialize)]
    struct OrgStatusResponse {
        id: Uuid,
        status: String,
        platform_locked: bool,
    }

    // Platform admin pausing = lock the workspace (tenant cannot re-enable)
    // Platform admin activating = unlock and restore
    let platform_locked = normalized == "suspended";

    sqlx::query(
        "UPDATE organizations SET status = $2, platform_locked = $3, updated_at = NOW() WHERE id = $1"
    )
        .bind(org_id)
        .bind(&normalized)
        .bind(platform_locked)
        .execute(&state.db)
        .await
        ?;

    let actor = extract_session(&req)?;
    let platform_org_id = get_platform_org_id(&state.db).await;
    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(actor.user_id),
        organization_id: platform_org_id,
        action: if normalized == "active" {
            "admin.organization.resumed".into()
        } else {
            "admin.organization.suspended".into()
        },
        target_type: "organization".into(),
        target_id: Some(org_id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({ "status": normalized, "platform_locked": platform_locked }),
    }).await;

    Ok(HttpResponse::Ok().json(OrgStatusResponse {
        id: org_id,
        status: normalized,
        platform_locked,
    }))
}

async fn list_all_clients(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<AdminListQuery>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let page = normalize_page(&query)?;
    let page_size = normalize_page_size(&query)?;
    let offset = (page - 1) * page_size;
    let search = normalize_search(&query);
    let scope = query
        .scope
        .as_deref()
        .unwrap_or("all")
        .trim()
        .to_lowercase();

    let total: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM oauth_clients c
        LEFT JOIN organizations o ON o.id = c.org_id
        LEFT JOIN user_emails ue ON ue.user_id = c.owner_user_id AND ue.is_primary = true
        WHERE (
            $1 = false
            OR (o.slug IS NOT NULL AND o.slug = ANY($2))
            OR (ue.email IS NOT NULL AND ue.email = ANY($3))
        )
          AND (
            $4 = '' OR
            c.app_name ILIKE '%' || $4 || '%' OR
            c.client_id ILIKE '%' || $4 || '%' OR
            COALESCE(ue.email, '') ILIKE '%' || $4 || '%' OR
            COALESCE(o.name, '') ILIKE '%' || $4 || '%' OR
            COALESCE(o.slug, '') ILIKE '%' || $4 || '%'
          )
          AND (
            $5 = 'all'
            OR ($5 = 'platform' AND c.org_id IS NULL)
            OR ($5 <> 'all' AND $5 <> 'platform' AND o.slug = $5)
          )
        "#,
    )
    .bind(demo_seed_enabled())
    .bind(demo_org_slug_filter())
    .bind(demo_email_filter())
    .bind(&search)
    .bind(&scope)
    .fetch_one(&state.db)
    .await?;

    let clients = sqlx::query_as::<_, AdminClient>(
        r#"
        SELECT
            c.id,
            c.client_id,
            c.app_name,
            c.app_type,
            c.status,
            c.owner_user_id,
            ue.email AS owner_email,
            c.org_id,
            o.name AS organization_name,
            o.slug AS organization_slug,
            c.is_first_party,
            c.created_at,
            COALESCE(
                ARRAY(
                    SELECT r.redirect_uri
                    FROM oauth_client_redirect_uris r
                    WHERE r.oauth_client_id = c.id
                    ORDER BY r.redirect_uri
                ),
                ARRAY[]::text[]
            ) AS redirect_uris
        FROM oauth_clients c
        LEFT JOIN organizations o ON o.id = c.org_id
        LEFT JOIN user_emails ue ON ue.user_id = c.owner_user_id AND ue.is_primary = true
        WHERE (
            $1 = false
            OR (o.slug IS NOT NULL AND o.slug = ANY($2))
            OR (ue.email IS NOT NULL AND ue.email = ANY($3))
        )
          AND (
            $4 = '' OR
            c.app_name ILIKE '%' || $4 || '%' OR
            c.client_id ILIKE '%' || $4 || '%' OR
            COALESCE(ue.email, '') ILIKE '%' || $4 || '%' OR
            COALESCE(o.name, '') ILIKE '%' || $4 || '%' OR
            COALESCE(o.slug, '') ILIKE '%' || $4 || '%'
          )
          AND (
            $5 = 'all'
            OR ($5 = 'platform' AND c.org_id IS NULL)
            OR ($5 <> 'all' AND $5 <> 'platform' AND o.slug = $5)
          )
        ORDER BY c.created_at DESC
        LIMIT $6 OFFSET $7
        "#,
    )
    .bind(demo_seed_enabled())
    .bind(demo_org_slug_filter())
    .bind(demo_email_filter())
    .bind(&search)
    .bind(&scope)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;

    Ok(HttpResponse::Ok().json(PaginatedResponse {
        items: clients,
        total,
        page,
        page_size,
    }))
}

async fn get_admin_client_detail(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let client_id = path.into_inner();

    let client = sqlx::query_as::<_, AdminClient>(
        r#"
        SELECT
            c.id,
            c.client_id,
            c.app_name,
            c.app_type,
            c.status,
            c.owner_user_id,
            ue.email AS owner_email,
            c.org_id,
            o.name AS organization_name,
            o.slug AS organization_slug,
            c.is_first_party,
            c.created_at,
            COALESCE(
                ARRAY(
                    SELECT r.redirect_uri
                    FROM oauth_client_redirect_uris r
                    WHERE r.oauth_client_id = c.id
                    ORDER BY r.redirect_uri
                    LIMIT $2
                ),
                ARRAY[]::text[]
            ) AS redirect_uris
        FROM oauth_clients c
        LEFT JOIN organizations o ON o.id = c.org_id
        LEFT JOIN user_emails ue ON ue.user_id = c.owner_user_id AND ue.is_primary = true
        WHERE c.id = $1
        "#,
    )
    .bind(client_id)
    .bind(ADMIN_CLIENT_REDIRECT_URI_LIMIT)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("App not found.".into()))?;

    if demo_seed_enabled() {
        if !is_demo_client_visible(
            client.owner_email.as_deref(),
            client.organization_slug.as_deref(),
        ) {
            return Err(AppError::NotFound("App not found.".into()));
        }
    }

    let owner_display_name: Option<String> = if let Some(owner_user_id) = client.owner_user_id {
        sqlx::query_scalar("SELECT display_name FROM users WHERE id = $1")
            .bind(owner_user_id)
            .fetch_optional(&state.db)
            .await?
    } else {
        None
    };

    let organization_status: Option<String> = if let Some(org_id) = client.org_id {
        sqlx::query_scalar("SELECT status FROM organizations WHERE id = $1")
            .bind(org_id)
            .fetch_optional(&state.db)
            .await?
    } else {
        None
    };

    let recent_activity = sqlx::query_as::<_, AdminAuditLog>(
        r#"
        SELECT
            al.id,
            al.actor_user_id,
            actor_email.email AS actor_email,
            actor.display_name AS actor_display_name,
            al.organization_id,
            al.action,
            al.target_type,
            al.target_id,
            al.ip::text AS ip,
            al.user_agent,
            al.metadata,
            al.created_at
        FROM audit_logs al
        LEFT JOIN users actor ON actor.id = al.actor_user_id
        LEFT JOIN user_emails actor_email ON actor_email.user_id = actor.id AND actor_email.is_primary = true
        WHERE al.target_type = 'oauth_client'
          AND al.target_id = $1
        ORDER BY al.created_at DESC
        LIMIT 20
        "#
    )
    .bind(client.id.to_string())
    .fetch_all(&state.db)
    .await
    ?;

    Ok(HttpResponse::Ok().json(AdminClientDetail {
        client,
        owner_display_name,
        organization_status,
        recent_activity,
    }))
}

async fn rotate_admin_client_secret(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let actor = extract_session(&req)?;
    ensure_platform_staff_by_user_id(actor.user_id, &state).await?;

    let client = sqlx::query_as::<_, AdminClient>(
        r#"
        SELECT
            c.id,
            c.client_id,
            c.app_name,
            c.app_type,
            c.status,
            c.owner_user_id,
            ue.email AS owner_email,
            c.org_id,
            o.name AS organization_name,
            o.slug AS organization_slug,
            c.is_first_party,
            c.created_at,
            COALESCE(
                ARRAY(
                    SELECT r.redirect_uri
                    FROM oauth_client_redirect_uris r
                    WHERE r.oauth_client_id = c.id
                    ORDER BY r.redirect_uri
                    LIMIT $2
                ),
                ARRAY[]::text[]
            ) AS redirect_uris
        FROM oauth_clients c
        LEFT JOIN organizations o ON o.id = c.org_id
        LEFT JOIN user_emails ue ON ue.user_id = c.owner_user_id AND ue.is_primary = true
        WHERE c.id = $1
        "#,
    )
    .bind(path.into_inner())
    .bind(ADMIN_CLIENT_REDIRECT_URI_LIMIT)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("App not found.".into()))?;

    if demo_seed_enabled() {
        if !is_demo_client_visible(
            client.owner_email.as_deref(),
            client.organization_slug.as_deref(),
        ) {
            return Err(AppError::NotFound("App not found.".into()));
        }
    }

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

    sqlx::query("UPDATE oauth_clients SET client_secret_hash = $1 WHERE id = $2")
        .bind(&client_secret_hash)
        .bind(client.id)
        .execute(&state.db)
        .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(actor.user_id),
            organization_id: client.org_id,
            action: "admin.oauth_client.secret_rotated".into(),
            target_type: "oauth_client".into(),
            target_id: Some(client.id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "client_id": client.client_id,
                "app_name": client.app_name,
                "owner_email": client.owner_email,
                "organization_slug": client.organization_slug,
                "demo_mode": demo_seed_enabled(),
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(RotateAdminClientSecretResponse {
        client_id: client.client_id,
        client_secret,
    }))
}

async fn update_admin_client_status(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<UpdateAdminClientStatusRequest>,
) -> Result<HttpResponse, AppError> {
    let actor = extract_session(&req)?;
    ensure_platform_staff_by_user_id(actor.user_id, &state).await?;
    let normalized_status = body.status.trim().to_lowercase();

    if normalized_status != "active" && normalized_status != "suspended" {
        return Err(AppError::Validation(
            "Status must be either 'active' or 'suspended'.".into(),
        ));
    }

    let client = sqlx::query_as::<_, AdminClient>(
        r#"
        SELECT
            c.id,
            c.client_id,
            c.app_name,
            c.app_type,
            c.status,
            c.owner_user_id,
            ue.email AS owner_email,
            c.org_id,
            o.name AS organization_name,
            o.slug AS organization_slug,
            c.is_first_party,
            c.created_at,
            COALESCE(
                ARRAY(
                    SELECT r.redirect_uri
                    FROM oauth_client_redirect_uris r
                    WHERE r.oauth_client_id = c.id
                    ORDER BY r.redirect_uri
                    LIMIT $2
                ),
                ARRAY[]::text[]
            ) AS redirect_uris
        FROM oauth_clients c
        LEFT JOIN organizations o ON o.id = c.org_id
        LEFT JOIN user_emails ue ON ue.user_id = c.owner_user_id AND ue.is_primary = true
        WHERE c.id = $1
        "#,
    )
    .bind(path.into_inner())
    .bind(ADMIN_CLIENT_REDIRECT_URI_LIMIT)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("App not found.".into()))?;

    if demo_seed_enabled() {
        if !is_demo_client_visible(
            client.owner_email.as_deref(),
            client.organization_slug.as_deref(),
        ) {
            return Err(AppError::NotFound("App not found.".into()));
        }
    }

    sqlx::query("UPDATE oauth_clients SET status = $1 WHERE id = $2")
        .bind(&normalized_status)
        .bind(client.id)
        .execute(&state.db)
        .await?;

    let updated = sqlx::query_as::<_, AdminClient>(
        r#"
        SELECT
            c.id,
            c.client_id,
            c.app_name,
            c.app_type,
            c.status,
            c.owner_user_id,
            ue.email AS owner_email,
            c.org_id,
            o.name AS organization_name,
            o.slug AS organization_slug,
            c.is_first_party,
            c.created_at,
            COALESCE(
                ARRAY(
                    SELECT r.redirect_uri
                    FROM oauth_client_redirect_uris r
                    WHERE r.oauth_client_id = c.id
                    ORDER BY r.redirect_uri
                    LIMIT $2
                ),
                ARRAY[]::text[]
            ) AS redirect_uris
        FROM oauth_clients c
        LEFT JOIN organizations o ON o.id = c.org_id
        LEFT JOIN user_emails ue ON ue.user_id = c.owner_user_id AND ue.is_primary = true
        WHERE c.id = $1
        "#,
    )
    .bind(client.id)
    .bind(ADMIN_CLIENT_REDIRECT_URI_LIMIT)
    .fetch_one(&state.db)
    .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(actor.user_id),
            organization_id: updated.org_id,
            action: if normalized_status == "active" {
                "admin.oauth_client.resumed".into()
            } else {
                "admin.oauth_client.suspended".into()
            },
            target_type: "oauth_client".into(),
            target_id: Some(updated.id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "client_id": updated.client_id,
                "app_name": updated.app_name,
                "owner_email": updated.owner_email,
                "organization_slug": updated.organization_slug,
                "status": updated.status,
                "demo_mode": demo_seed_enabled(),
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(updated))
}

async fn delete_admin_client(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let actor = extract_session(&req)?;
    ensure_platform_staff_by_user_id(actor.user_id, &state).await?;
    let client_id = path.into_inner();

    let client = sqlx::query_as::<_, AdminClient>(
        r#"
        SELECT
            c.id,
            c.client_id,
            c.app_name,
            c.app_type,
            c.status,
            c.owner_user_id,
            ue.email AS owner_email,
            c.org_id,
            o.name AS organization_name,
            o.slug AS organization_slug,
            c.is_first_party,
            c.created_at,
            COALESCE(
                ARRAY(
                    SELECT r.redirect_uri
                    FROM oauth_client_redirect_uris r
                    WHERE r.oauth_client_id = c.id
                    ORDER BY r.redirect_uri
                    LIMIT $2
                ),
                ARRAY[]::text[]
            ) AS redirect_uris
        FROM oauth_clients c
        LEFT JOIN organizations o ON o.id = c.org_id
        LEFT JOIN user_emails ue ON ue.user_id = c.owner_user_id AND ue.is_primary = true
        WHERE c.id = $1
        "#,
    )
    .bind(client_id)
    .bind(ADMIN_CLIENT_REDIRECT_URI_LIMIT)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("App not found.".into()))?;

    if demo_seed_enabled() {
        if !is_demo_client_visible(
            client.owner_email.as_deref(),
            client.organization_slug.as_deref(),
        ) {
            return Err(AppError::NotFound("App not found.".into()));
        }
    }

    sqlx::query("DELETE FROM oauth_clients WHERE id = $1")
        .bind(client.id)
        .execute(&state.db)
        .await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(actor.user_id),
            organization_id: client.org_id,
            action: "admin.oauth_client.deleted".into(),
            target_type: "oauth_client".into(),
            target_id: Some(client.id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "client_id": client.client_id,
                "app_name": client.app_name,
                "owner_email": client.owner_email,
                "organization_slug": client.organization_slug,
                "demo_mode": demo_seed_enabled(),
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "ok": true })))
}

#[derive(Serialize, Deserialize, FromRow)]
#[serde(deny_unknown_fields)]
pub struct AdminAuditLog {
    pub id: i64,
    pub actor_user_id: Option<Uuid>,
    pub actor_email: Option<String>,
    pub actor_display_name: Option<String>,
    pub organization_id: Option<Uuid>,
    pub action: String,
    pub target_type: String,
    pub target_id: Option<String>,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
}

/// List all workspace members across all organizations (superuser only).
async fn list_tenant_members(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<AdminListQuery>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let page = normalize_page(&query)?;
    let page_size = normalize_page_size(&query)?;
    let offset = (page - 1) * page_size;
    let search = normalize_search(&query);
    let role = query.role.as_deref().unwrap_or("all").trim().to_lowercase();

    let total: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(DISTINCT om.id)
        FROM organization_members om
        JOIN users u ON u.id = om.user_id
        JOIN organizations o ON o.id = om.organization_id
        LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
        LEFT JOIN member_roles mr ON mr.member_id = om.id
        LEFT JOIN roles r ON r.id = mr.role_id
        WHERE o.is_platform_org = false
        AND (
            $1 = false OR COALESCE(ue.email, '') = ANY($2)
        )
        AND (
            $3 = '' OR
            COALESCE(ue.email, '') ILIKE '%' || $3 || '%' OR
            COALESCE(u.display_name, '') ILIKE '%' || $3 || '%'
        )
        AND (
            $4 = 'all'
            OR ($4 = 'admin' AND EXISTS (
                SELECT 1 FROM member_roles mr2 JOIN roles r2 ON r2.id = mr2.role_id
                WHERE mr2.member_id = om.id AND r2.code IN ('owner', 'admin')
            ))
            OR ($4 = 'user' AND NOT EXISTS (
                SELECT 1 FROM member_roles mr2 JOIN roles r2 ON r2.id = mr2.role_id
                WHERE mr2.member_id = om.id AND r2.code IN ('owner', 'admin')
            ))
        )
        "#,
    )
    .bind(demo_seed_enabled())
    .bind(demo_email_filter())
    .bind(&search)
    .bind(&role)
    .fetch_one(&state.db)
    .await?;

    #[derive(Serialize, FromRow)]
    struct TenantMemberRow {
        id: Uuid,
        organization_id: Uuid,
        organization_name: String,
        organization_slug: String,
        user_id: Uuid,
        status: String,
        membership_status: String,
        created_at: DateTime<Utc>,
        display_name: Option<String>,
        avatar_url: Option<String>,
        email: Option<String>,
        role_names: Vec<String>,
        role_codes: Vec<String>,
        last_seen_at: Option<DateTime<Utc>>,
    }

    let members = sqlx::query_as::<_, TenantMemberRow>(
        r#"
        SELECT
            om.id,
            om.organization_id,
            o.name AS organization_name,
            o.slug AS organization_slug,
            om.user_id,
            u.status,
            om.status AS membership_status,
            om.created_at,
            u.display_name,
            u.avatar_url,
            ue.email,
            COALESCE(array_remove(array_agg(DISTINCT r.name), NULL), ARRAY[]::text[]) AS role_names,
            COALESCE(array_remove(array_agg(DISTINCT r.code), NULL), ARRAY[]::text[]) AS role_codes,
            COALESCE(
                GREATEST(MAX(s.last_seen_at), MAX(al.created_at)),
                MAX(s.last_seen_at),
                MAX(al.created_at)
            ) AS last_seen_at
        FROM organization_members om
        JOIN users u ON u.id = om.user_id
        JOIN organizations o ON o.id = om.organization_id
        LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
        LEFT JOIN member_roles mr ON mr.member_id = om.id
        LEFT JOIN roles r ON r.id = mr.role_id
        LEFT JOIN sessions s ON s.user_id = u.id
        LEFT JOIN audit_logs al ON al.actor_user_id = u.id
        WHERE o.is_platform_org = false
        AND (
            $1 = false OR COALESCE(ue.email, '') = ANY($2)
        )
        AND (
            $3 = '' OR
            COALESCE(ue.email, '') ILIKE '%' || $3 || '%' OR
            COALESCE(u.display_name, '') ILIKE '%' || $3 || '%'
        )
        AND (
            $4 = 'all'
            OR ($4 = 'admin' AND EXISTS (
                SELECT 1 FROM member_roles mr2 JOIN roles r2 ON r2.id = mr2.role_id
                WHERE mr2.member_id = om.id AND r2.code IN ('owner', 'admin')
            ))
            OR ($4 = 'user' AND NOT EXISTS (
                SELECT 1 FROM member_roles mr2 JOIN roles r2 ON r2.id = mr2.role_id
                WHERE mr2.member_id = om.id AND r2.code IN ('owner', 'admin')
            ))
        )
        GROUP BY om.id, om.organization_id, o.name, o.slug, om.user_id, u.status, om.status, om.created_at, u.display_name, u.avatar_url, ue.email
        ORDER BY om.created_at DESC
        LIMIT $5 OFFSET $6
        "#
    )
    .bind(demo_seed_enabled())
    .bind(demo_email_filter())
    .bind(&search)
    .bind(&role)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    ?;

    Ok(HttpResponse::Ok().json(PaginatedResponse {
        items: members,
        total,
        page,
        page_size,
    }))
}

/// List all tenant-scoped audit logs across all organizations (superuser only).
async fn list_tenant_audit_logs(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<AdminListQuery>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let page = normalize_page(&query)?;
    let page_size = normalize_page_size(&query)?;
    let offset = (page - 1) * page_size;
    let search = normalize_search(&query);
    let action = query
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

    let total: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
        INNER JOIN organizations o ON o.id = al.organization_id
        WHERE o.is_platform_org = false
          AND ($1 = '' OR al.action ILIKE '%' || $1 || '%' OR al.target_type ILIKE '%' || $1 || '%' OR COALESCE(al.target_id, '') ILIKE '%' || $1 || '%' OR COALESCE(al.ip::text, '') ILIKE '%' || $1 || '%' OR COALESCE(ue.email, '') ILIKE '%' || $1 || '%' OR COALESCE(u.display_name, '') ILIKE '%' || $1 || '%')
          AND ($2 = 'all' OR ($2 = 'success' AND al.action LIKE '%success%') OR ($2 = 'failed' AND al.action LIKE '%failed%') OR ($2 = 'suspicious' AND al.action LIKE '%suspicious%'))
          AND ($3::date IS NULL OR al.created_at >= $3::date)
          AND ($4::date IS NULL OR al.created_at < ($4::date + interval '1 day'))
        "#
    )
    .bind(&search)
    .bind(&action)
    .bind(&date_from)
    .bind(&date_to)
    .fetch_one(&state.db)
    .await?;

    let logs = sqlx::query_as::<_, AdminAuditLog>(
        r#"
        SELECT
            al.id,
            al.actor_user_id,
            ue.email as actor_email,
            u.display_name as actor_display_name,
            al.organization_id,
            al.action,
            al.target_type,
            al.target_id,
            al.ip::text,
            al.user_agent,
            al.metadata,
            al.created_at
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
        INNER JOIN organizations o ON o.id = al.organization_id
        WHERE o.is_platform_org = false
          AND ($1 = '' OR al.action ILIKE '%' || $1 || '%' OR al.target_type ILIKE '%' || $1 || '%' OR COALESCE(al.target_id, '') ILIKE '%' || $1 || '%' OR COALESCE(al.ip::text, '') ILIKE '%' || $1 || '%' OR COALESCE(ue.email, '') ILIKE '%' || $1 || '%' OR COALESCE(u.display_name, '') ILIKE '%' || $1 || '%')
          AND ($2 = 'all' OR ($2 = 'success' AND al.action LIKE '%success%') OR ($2 = 'failed' AND al.action LIKE '%failed%') OR ($2 = 'suspicious' AND al.action LIKE '%suspicious%'))
          AND ($3::date IS NULL OR al.created_at >= $3::date)
          AND ($4::date IS NULL OR al.created_at < ($4::date + interval '1 day'))
        ORDER BY al.created_at DESC
        LIMIT $5 OFFSET $6
        "#
    )
    .bind(&search)
    .bind(&action)
    .bind(&date_from)
    .bind(&date_to)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;

    Ok(HttpResponse::Ok().json(PaginatedResponse {
        items: logs,
        total,
        page,
        page_size,
    }))
}

async fn list_org_audit_logs(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    query: web::Query<AdminListQuery>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let organization_id = path.into_inner();
    let page = normalize_page(&query)?;
    let page_size = normalize_page_size(&query)?;
    let offset = (page - 1) * page_size;
    let search = normalize_search(&query);
    let action = query
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

    let total: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
        WHERE al.organization_id = $1
          AND ($2 = '' OR al.action ILIKE '%' || $2 || '%' OR al.target_type ILIKE '%' || $2 || '%' OR COALESCE(al.target_id, '') ILIKE '%' || $2 || '%' OR COALESCE(al.ip::text, '') ILIKE '%' || $2 || '%' OR COALESCE(ue.email, '') ILIKE '%' || $2 || '%' OR COALESCE(u.display_name, '') ILIKE '%' || $2 || '%')
          AND ($3 = 'all' OR ($3 = 'success' AND al.action LIKE '%success%') OR ($3 = 'failed' AND al.action LIKE '%failed%') OR ($3 = 'suspicious' AND al.action LIKE '%suspicious%'))
          AND ($4::date IS NULL OR al.created_at >= $4::date)
          AND ($5::date IS NULL OR al.created_at < ($5::date + interval '1 day'))
        "#
    )
    .bind(organization_id)
    .bind(&search)
    .bind(&action)
    .bind(&date_from)
    .bind(&date_to)
    .fetch_one(&state.db)
    .await?;

    let logs = sqlx::query_as::<_, AdminAuditLog>(
        r#"
        SELECT
            al.id,
            al.actor_user_id,
            ue.email as actor_email,
            u.display_name as actor_display_name,
            al.organization_id,
            al.action,
            al.target_type,
            al.target_id,
            al.ip::text,
            al.user_agent,
            al.metadata,
            al.created_at
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
        WHERE al.organization_id = $1
          AND ($2 = '' OR al.action ILIKE '%' || $2 || '%' OR al.target_type ILIKE '%' || $2 || '%' OR COALESCE(al.target_id, '') ILIKE '%' || $2 || '%' OR COALESCE(al.ip::text, '') ILIKE '%' || $2 || '%' OR COALESCE(ue.email, '') ILIKE '%' || $2 || '%' OR COALESCE(u.display_name, '') ILIKE '%' || $2 || '%')
          AND ($3 = 'all' OR ($3 = 'success' AND al.action LIKE '%success%') OR ($3 = 'failed' AND al.action LIKE '%failed%') OR ($3 = 'suspicious' AND al.action LIKE '%suspicious%'))
          AND ($4::date IS NULL OR al.created_at >= $4::date)
          AND ($5::date IS NULL OR al.created_at < ($5::date + interval '1 day'))
        ORDER BY al.created_at DESC
        LIMIT $6 OFFSET $7
        "#
    )
    .bind(organization_id)
    .bind(&search)
    .bind(&action)
    .bind(&date_from)
    .bind(&date_to)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.db)
    .await?;

    Ok(HttpResponse::Ok().json(PaginatedResponse {
        items: logs,
        total,
        page,
        page_size,
    }))
}

async fn list_all_audit_logs(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<AdminListQuery>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let page = normalize_page(&query)?;
    let page_size = normalize_page_size(&query)?;
    let offset = (page - 1) * page_size;
    let search = normalize_search(&query);
    let action = query
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

    let total: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
        LEFT JOIN organizations o ON o.id = al.organization_id
        WHERE (al.organization_id IS NULL OR o.is_platform_org = true)
          AND (
            $1 = false
            OR al.actor_user_id IS NULL
            OR COALESCE(ue.email, '') = ANY($2)
            OR COALESCE(al.metadata->>'demo_mode', 'false') = 'true'
          )
          AND (
            $3 = '' OR
            al.action ILIKE '%' || $3 || '%' OR
            al.target_type ILIKE '%' || $3 || '%' OR
            COALESCE(al.target_id, '') ILIKE '%' || $3 || '%' OR
            COALESCE(al.ip::text, '') ILIKE '%' || $3 || '%' OR
            COALESCE(al.actor_user_id::text, '') ILIKE '%' || $3 || '%' OR
            COALESCE(ue.email, '') ILIKE '%' || $3 || '%' OR
            COALESCE(u.display_name, '') ILIKE '%' || $3 || '%'
          )
          AND (
            $4 = 'all'
            OR ($4 = 'success' AND al.action LIKE '%success%')
            OR ($4 = 'failed' AND al.action LIKE '%failed%')
            OR ($4 = 'suspicious' AND al.action LIKE '%suspicious%')
          )
          AND ($5::date IS NULL OR al.created_at >= $5::date)
          AND ($6::date IS NULL OR al.created_at < ($6::date + interval '1 day'))
        "#,
    )
    .bind(demo_seed_enabled())
    .bind(demo_email_filter())
    .bind(&search)
    .bind(&action)
    .bind(&date_from)
    .bind(&date_to)
    .fetch_one(&state.db)
    .await?;

    let logs = sqlx::query_as::<_, AdminAuditLog>(
        r#"
        SELECT
            al.id,
            al.actor_user_id,
            ue.email as actor_email,
            u.display_name as actor_display_name,
            al.organization_id,
            al.action,
            al.target_type,
            al.target_id,
            al.ip::text,
            al.user_agent,
            al.metadata,
            al.created_at
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
        LEFT JOIN organizations o ON o.id = al.organization_id
        WHERE (al.organization_id IS NULL OR o.is_platform_org = true)
          AND (
            $1 = false
            OR al.actor_user_id IS NULL
            OR COALESCE(ue.email, '') = ANY($2)
            OR COALESCE(al.metadata->>'demo_mode', 'false') = 'true'
          )
          AND (
            $3 = '' OR
            al.action ILIKE '%' || $3 || '%' OR
            al.target_type ILIKE '%' || $3 || '%' OR
            COALESCE(al.target_id, '') ILIKE '%' || $3 || '%' OR
            COALESCE(al.ip::text, '') ILIKE '%' || $3 || '%' OR
            COALESCE(al.actor_user_id::text, '') ILIKE '%' || $3 || '%' OR
            COALESCE(ue.email, '') ILIKE '%' || $3 || '%' OR
            COALESCE(u.display_name, '') ILIKE '%' || $3 || '%'
          )
          AND (
            $4 = 'all'
            OR ($4 = 'success' AND al.action LIKE '%success%')
            OR ($4 = 'failed' AND al.action LIKE '%failed%')
            OR ($4 = 'suspicious' AND al.action LIKE '%suspicious%')
          )
          AND ($5::date IS NULL OR al.created_at >= $5::date)
          AND ($6::date IS NULL OR al.created_at < ($6::date + interval '1 day'))
        ORDER BY created_at DESC
        LIMIT $7 OFFSET $8
        "#,
    )
    .bind(demo_seed_enabled())
    .bind(demo_email_filter())
    .bind(&search)
    .bind(&action)
    .bind(&date_from)
    .bind(&date_to)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch audit logs: {}", e);
        AppError::Database(e)
    })?;

    Ok(HttpResponse::Ok().json(PaginatedResponse {
        items: logs,
        total,
        page,
        page_size,
    }))
}

async fn list_user_audit_logs(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    query: web::Query<AdminListQuery>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let user_id = path.into_inner();
    let page = normalize_page(&query)?;
    let page_size = normalize_page_size(&query)?;
    let offset = (page - 1) * page_size;
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

    let total: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM audit_logs
           WHERE actor_user_id = $1
             AND ($2::date IS NULL OR created_at >= $2::date)
             AND ($3::date IS NULL OR created_at < ($3::date + interval '1 day'))"#,
    )
    .bind(user_id)
    .bind(&date_from)
    .bind(&date_to)
    .fetch_one(&state.db)
    .await?;

    let logs = sqlx::query_as::<_, AdminAuditLog>(
        r#"
        SELECT
            al.id,
            al.actor_user_id,
            ue.email as actor_email,
            u.display_name as actor_display_name,
            al.organization_id,
            al.action,
            al.target_type,
            al.target_id,
            al.ip::text,
            al.user_agent,
            al.metadata,
            al.created_at
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
        WHERE al.actor_user_id = $1
          AND ($2::date IS NULL OR al.created_at >= $2::date)
          AND ($3::date IS NULL OR al.created_at < ($3::date + interval '1 day'))
        ORDER BY al.created_at DESC
        LIMIT $4 OFFSET $5
        "#,
    )
    .bind(user_id)
    .bind(&date_from)
    .bind(&date_to)
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Database(e))?;

    Ok(HttpResponse::Ok().json(PaginatedResponse {
        items: logs,
        total,
        page,
        page_size,
    }))
}

// ── Session policy handlers moved to admin/session_policies.rs ───────────────

// ── Routes ───────────────────────────────────────────────────────────────────

// ── Admin session management ─────────────────────────────────────────────────

#[derive(Serialize)]
struct AdminSessionEntry {
    id: Uuid,
    user_agent: Option<String>,
    ip: Option<String>,
    last_seen_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
}

/// Compute a numeric rank for a user so we can enforce the hierarchy:
/// Platform Owner (3) > Platform Admin (2) > Tenant Owner (1) > Tenant Admin (1) > User (0)
async fn user_rank(user_id: Uuid, state: &web::Data<AppState>) -> Result<u8, AppError> {
    let row = sqlx::query(
        r#"
        SELECT
            u.is_platform_owner,
            u.is_superuser,
            BOOL_OR(r.code = 'owner') AS is_tenant_owner,
            BOOL_OR(r.code = 'admin') AS is_tenant_admin
        FROM users u
        LEFT JOIN organization_members om ON om.user_id = u.id
        LEFT JOIN member_roles mr ON mr.member_id = om.id
        LEFT JOIN roles r ON r.id = mr.role_id AND r.is_system = true
        WHERE u.id = $1
        GROUP BY u.id, u.is_platform_owner, u.is_superuser
        "#,
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found".into()))?;

    use sqlx::Row;
    let is_platform_owner: bool = row.get("is_platform_owner");
    let is_superuser: bool = row.get("is_superuser");
    let is_tenant_owner: Option<bool> = row.get("is_tenant_owner");
    let is_tenant_admin: Option<bool> = row.get("is_tenant_admin");

    if is_platform_owner {
        return Ok(3);
    }
    if is_superuser {
        return Ok(2);
    }
    if is_tenant_owner.unwrap_or(false) {
        return Ok(1);
    }
    if is_tenant_admin.unwrap_or(false) {
        return Ok(1);
    }
    Ok(0)
}

async fn list_user_sessions(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let actor = extract_session(&req)?;
    ensure_platform_staff_by_user_id(actor.user_id, &state).await?;

    let target_user_id = path.into_inner();

    // Rank enforcement: actor must outrank or equal target
    let actor_rank = user_rank(actor.user_id, &state).await?;
    let target_rank = user_rank(target_user_id, &state).await?;
    if actor_rank < target_rank {
        return Err(AppError::Forbidden(
            "You cannot manage sessions for a user with higher privileges.".into(),
        ));
    }

    let rows = sqlx::query(
        r#"
        SELECT id, user_agent, ip::text AS ip, last_seen_at, created_at
        FROM sessions
        WHERE user_id = $1
          AND revoked_at IS NULL
          AND expires_at > NOW()
        ORDER BY last_seen_at DESC
        LIMIT 100
        "#,
    )
    .bind(target_user_id)
    .fetch_all(&state.db)
    .await?;

    use sqlx::Row;
    let sessions: Vec<AdminSessionEntry> = rows
        .iter()
        .map(|r| AdminSessionEntry {
            id: r.get("id"),
            user_agent: r.get("user_agent"),
            ip: r.get("ip"),
            last_seen_at: r.get("last_seen_at"),
            created_at: r.get("created_at"),
        })
        .collect();

    Ok(HttpResponse::Ok().json(sessions))
}

async fn revoke_user_sessions(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let actor = extract_session(&req)?;
    ensure_platform_staff_by_user_id(actor.user_id, &state).await?;

    let target_user_id = path.into_inner();

    if actor.user_id == target_user_id {
        return Err(AppError::Forbidden(
            "Use /identity/me/sessions/revoke-all to sign out your own other sessions.".into(),
        ));
    }

    // Rank enforcement
    let actor_rank = user_rank(actor.user_id, &state).await?;
    let target_rank = user_rank(target_user_id, &state).await?;
    if actor_rank < target_rank {
        return Err(AppError::Forbidden(
            "You cannot revoke sessions for a user with higher privileges.".into(),
        ));
    }

    // Fetch target email for audit log before revoking
    let target_email: Option<String> = sqlx::query_scalar(
        "SELECT e.email FROM user_emails e WHERE e.user_id = $1 AND e.is_primary = true LIMIT 1",
    )
    .bind(target_user_id)
    .fetch_optional(&state.db)
    .await?
    .flatten();

    let revoked_count = sqlx::query(
        "UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()"
    )
    .bind(target_user_id)
    .execute(&state.db)
    .await
    ?
    .rows_affected();

    let platform_org_id = get_platform_org_id(&state.db).await;
    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(actor.user_id),
            organization_id: platform_org_id,
            action: "admin.user.sessions_revoked".into(),
            target_type: "user".into(),
            target_id: Some(target_user_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "revoked_count": revoked_count,
                "target_email": target_email,
                "demo_mode": demo_seed_enabled(),
            }),
        })
        .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "revoked_count": revoked_count,
    })))
}

// ── Signing key rotation ─────────────────────────────────────────────────────

/// GET /v1/admin/signing-keys — list all signing keys (active + recently retired).
async fn list_signing_keys(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    if !session.is_superuser {
        return Err(AppError::Forbidden(
            "Only platform owners can manage signing keys.".into(),
        ));
    }

    #[derive(serde::Serialize, sqlx::FromRow)]
    struct SigningKeyRow {
        id: Uuid,
        kid: String,
        is_active: bool,
        retired_at: Option<chrono::DateTime<chrono::Utc>>,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    let keys = sqlx::query_as::<_, SigningKeyRow>(
        r#"
        SELECT id, kid, is_active, retired_at, created_at
        FROM oidc_signing_keys
        ORDER BY created_at DESC
        LIMIT 20
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "keys": keys })))
}

/// POST /v1/admin/signing-keys/rotate — generate a new RSA signing key and make it active.
/// The previous key stays in JWKS for `signing_key_rollover_hours` (default 24h).
async fn rotate_signing_key(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    if !session.is_superuser {
        return Err(AppError::Forbidden(
            "Only platform owners can rotate signing keys.".into(),
        ));
    }

    // Generate 2048-bit RSA key pair
    let private_key = rsa::RsaPrivateKey::new(&mut rand::rngs::OsRng, 2048)
        .map_err(|e| AppError::Internal(format!("RSA key generation failed: {}", e)))?;
    let public_key = rsa::RsaPublicKey::from(&private_key);

    use rsa::pkcs8::{EncodePrivateKey, EncodePublicKey};
    let private_pem = private_key
        .to_pkcs8_pem(rsa::pkcs8::LineEnding::LF)
        .map_err(|e| AppError::Internal(format!("Private key PEM encode failed: {}", e)))?
        .to_string();
    let public_pem = public_key
        .to_public_key_pem(rsa::pkcs8::LineEnding::LF)
        .map_err(|e| AppError::Internal(format!("Public key PEM encode failed: {}", e)))?;

    let new_kid = format!("rooiam-{}", chrono::Utc::now().format("%Y%m%d%H%M%S"));

    // Rollover hours setting
    let rollover_hours: i64 = sqlx::query_scalar(
        "SELECT value::bigint FROM system_settings WHERE key = 'signing_key_rollover_hours'",
    )
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten()
    .unwrap_or(24);

    let mut tx = state.db.begin().await?;

    // Retire the current active key (set retired_at so it stays in JWKS during rollover window)
    sqlx::query(
        "UPDATE oidc_signing_keys SET is_active = false, retired_at = NOW() WHERE is_active = true",
    )
    .execute(&mut *tx)
    .await?;

    // Delete old keys past the rollover window
    sqlx::query(
        "DELETE FROM oidc_signing_keys WHERE retired_at IS NOT NULL AND retired_at < NOW() - ($1 || ' hours')::interval"
    )
    .bind(rollover_hours)
    .execute(&mut *tx)
    .await
    ?;

    // Insert new active key
    sqlx::query(
        "INSERT INTO oidc_signing_keys (kid, private_key_pem, public_key_pem, is_active) VALUES ($1, $2, $3, true)"
    )
    .bind(&new_kid)
    .bind(&private_pem)
    .bind(&public_pem)
    .execute(&mut *tx)
    .await
    ?;

    tx.commit().await?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: None,
            action: "platform.signing_key.rotated".into(),
            target_type: "signing_key".into(),
            target_id: Some(new_kid.clone()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({ "kid": new_kid, "rollover_hours": rollover_hours }),
        })
        .await;

    tracing::info!("OIDC signing key rotated. New key ID: {}", new_kid);

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "ok": true,
        "kid": new_kid,
        "message": format!("New signing key active. Previous key stays valid for {} hours.", rollover_hours),
    })))
}

// ── Active sessions by workspace (platform admin view) ────────────────────────

/// GET /v1/admin/sessions — active sessions across all workspaces (platform admin view).
async fn list_active_sessions_admin(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<AdminListQuery>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    if !session.is_superuser {
        return Err(AppError::Forbidden(
            "Only platform admins can view all sessions.".into(),
        ));
    }

    let page = normalize_page(&query)?;
    let page_size = normalize_page_size(&query)?;
    let search = normalize_search(&query);
    let offset = (page - 1) * page_size;

    let search_pattern = format!("%{}%", search);

    #[derive(serde::Serialize, sqlx::FromRow)]
    struct AdminSessionRow {
        id: Uuid,
        user_id: Uuid,
        user_email: Option<String>,
        org_name: Option<String>,
        org_slug: Option<String>,
        user_agent: Option<String>,
        ip: Option<String>,
        created_at: chrono::DateTime<chrono::Utc>,
        last_seen_at: chrono::DateTime<chrono::Utc>,
        expires_at: chrono::DateTime<chrono::Utc>,
    }

    let sessions = sqlx::query_as::<_, AdminSessionRow>(
        r#"
        SELECT
            s.id,
            s.user_id,
            e.email AS user_email,
            o.name AS org_name,
            o.slug AS org_slug,
            s.user_agent,
            s.ip::text AS ip,
            s.created_at,
            s.last_seen_at,
            s.expires_at
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN user_emails e ON e.user_id = u.id AND e.is_primary = true
        LEFT JOIN organizations o ON o.id = s.current_org_id
        WHERE s.revoked_at IS NULL
          AND s.expires_at > NOW()
          AND u.status = 'active'
          AND (
            $3 = ''
            OR e.email ILIKE $4
            OR o.name ILIKE $4
            OR o.slug ILIKE $4
          )
        ORDER BY s.last_seen_at DESC
        LIMIT $1 OFFSET $2
        "#,
    )
    .bind(page_size)
    .bind(offset)
    .bind(&search)
    .bind(&search_pattern)
    .fetch_all(&state.db)
    .await?;

    let total: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN user_emails e ON e.user_id = u.id AND e.is_primary = true
        LEFT JOIN organizations o ON o.id = s.current_org_id
        WHERE s.revoked_at IS NULL
          AND s.expires_at > NOW()
          AND u.status = 'active'
          AND ($1 = '' OR e.email ILIKE $2 OR o.name ILIKE $2 OR o.slug ILIKE $2)
        "#,
    )
    .bind(&search)
    .bind(&search_pattern)
    .fetch_one(&state.db)
    .await
    .unwrap_or(0);

    Ok(HttpResponse::Ok().json(PaginatedResponse {
        items: sessions,
        total,
        page,
        page_size,
    }))
}

pub fn routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/admin")
            .wrap(RequireAuth)
            .route("/users", web::get().to(list_all_users))
            .route("/users/{user_id}", web::get().to(get_user_detail))
            .route(
                "/users/{user_id}/status",
                web::patch().to(update_user_status),
            )
            .route("/users/{user_id}/role", web::patch().to(update_user_role))
            .route(
                "/users/{user_id}/workspace-limit",
                web::get().to(get_user_workspace_limit),
            )
            .route(
                "/users/{user_id}/workspace-limit",
                web::put().to(update_user_workspace_limit),
            )
            .route(
                "/users/{user_id}/sessions",
                web::get().to(list_user_sessions),
            )
            .route(
                "/users/{user_id}/sessions",
                web::delete().to(revoke_user_sessions),
            )
            .route(
                "/users/{user_id}/audit-logs",
                web::get().to(list_user_audit_logs),
            )
            .route("/organizations", web::get().to(list_all_organizations))
            .route(
                "/organizations/{organization_id}",
                web::get().to(get_organization_detail),
            )
            .route(
                "/organizations/{organization_id}/status",
                web::patch().to(update_organization_status),
            )
            .route(
                "/organizations/{organization_id}/audit-logs",
                web::get().to(list_org_audit_logs),
            )
            .route(
                "/organizations/{organization_id}/session-policy",
                web::get().to(crate::modules::admin::session_policies::get_org_session_policy),
            )
            .route(
                "/organizations/{organization_id}/session-policy",
                web::patch().to(crate::modules::admin::session_policies::update_org_session_policy),
            )
            .route(
                "/organizations/{organization_id}/app-governance",
                web::get().to(get_tenant_workspace_app_governance),
            )
            .route(
                "/organizations/{organization_id}/app-governance",
                web::patch().to(update_tenant_workspace_app_governance),
            )
            .route("/clients", web::get().to(list_all_clients))
            .route(
                "/clients/{client_id}",
                web::get().to(get_admin_client_detail),
            )
            .route(
                "/clients/{client_id}/rotate-secret",
                web::post().to(rotate_admin_client_secret),
            )
            .route(
                "/clients/{client_id}/status",
                web::patch().to(update_admin_client_status),
            )
            .route(
                "/clients/{client_id}",
                web::delete().to(delete_admin_client),
            )
            .route("/audit-logs", web::get().to(list_all_audit_logs))
            .route("/tenant/members", web::get().to(list_tenant_members))
            .route("/tenant/audit-logs", web::get().to(list_tenant_audit_logs))
            .route(
                "/tenant-session-policy",
                web::get().to(crate::modules::admin::session_policies::get_tenant_session_policy),
            )
            .route(
                "/tenant-session-policy",
                web::patch()
                    .to(crate::modules::admin::session_policies::update_tenant_session_policy),
            )
            .route("/tenant-access", web::get().to(get_tenant_access_policy))
            .route(
                "/tenant-access",
                web::patch().to(update_tenant_access_policy),
            )
            .route(
                "/client-governance",
                web::get().to(get_platform_client_governance),
            )
            .route(
                "/client-governance",
                web::patch().to(update_platform_client_governance),
            )
            .route("/ip-policy", web::get().to(get_platform_ip_policy))
            .route("/ip-policy", web::patch().to(update_platform_ip_policy))
            .route(
                "/ip-policy/admin",
                web::get().to(get_platform_admin_ip_policy),
            )
            .route(
                "/ip-policy/admin",
                web::patch().to(update_platform_admin_ip_policy),
            )
            .route(
                "/workspace-governance",
                web::get().to(get_platform_workspace_governance),
            )
            .route(
                "/workspace-governance",
                web::patch().to(update_platform_workspace_governance),
            )
            .route(
                "/session-policy",
                web::get().to(crate::modules::admin::session_policies::get_session_policy),
            )
            .route(
                "/session-policy",
                web::patch().to(crate::modules::admin::session_policies::update_session_policy),
            )
            .route("/storage-config", web::get().to(get_storage_config))
            .route("/storage-config", web::patch().to(update_storage_config))
            .route("/storage-config/test", web::post().to(test_storage_config))
            .route("/signing-keys", web::get().to(list_signing_keys))
            .route("/signing-keys/rotate", web::post().to(rotate_signing_key))
            .route("/sessions", web::get().to(list_active_sessions_admin))
            .route("/risk-policy", web::get().to(get_risk_policy))
            .route("/risk-policy", web::patch().to(update_risk_policy))
            .route(
                "/security-alert-reviews",
                web::get().to(list_platform_security_alert_reviews),
            )
            .route(
                "/security-alert-reviews",
                web::post().to(mark_platform_security_alert_reviewed),
            )
            .route(
                "/security-alert-reviews",
                web::delete().to(reset_platform_security_alert_reviews),
            ),
    );
}
