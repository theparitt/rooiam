use actix_web::{web, HttpRequest, HttpResponse};
use uuid::Uuid;

use crate::bootstrap::state::AppState;
use crate::http::middleware::auth::{extract_session, RequireAuth};
use crate::modules::audit::service::{AuditEvent, AuditService};
use crate::modules::rbac::{repository::RbacRepository, service::RbacService};
use crate::shared::error::AppError;
use crate::shared::request_ip::client_ip_string_from_http_request;

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct CreateCustomRoleRequest {
    name: String,
    code: String,
    #[serde(default)]
    permissions: Vec<String>,
}

#[derive(serde::Serialize)]
struct RoleWithPermissions {
    id: Uuid,
    organization_id: Option<Uuid>,
    code: String,
    name: String,
    is_system: bool,
    created_at: chrono::DateTime<chrono::Utc>,
    permissions: Vec<String>,
}

/// GET /v1/orgs/current/roles — list all roles (system + custom) for the workspace.
async fn list_org_roles(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session
        .current_org_id
        .ok_or_else(|| AppError::Validation("Select a workspace first.".into()))?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac.has_permission(session.user_id, org_id, "roles:manage").await? {
        return Err(AppError::Forbidden("You do not have permission to manage roles.".into()));
    }

    let repo = RbacRepository::new(state.db.clone());
    let roles = repo.get_roles(Some(org_id)).await?;

    let mut result = Vec::with_capacity(roles.len());
    for role in roles {
        let permissions = repo.get_role_permissions(role.id).await?;
        result.push(RoleWithPermissions {
            id: role.id,
            organization_id: role.organization_id,
            code: role.code,
            name: role.name,
            is_system: role.is_system,
            created_at: role.created_at,
            permissions,
        });
    }

    Ok(HttpResponse::Ok().json(result))
}

/// GET /v1/orgs/current/roles/permissions — list all available permissions.
async fn list_permissions(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session
        .current_org_id
        .ok_or_else(|| AppError::Validation("Select a workspace first.".into()))?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac.has_permission(session.user_id, org_id, "roles:manage").await? {
        return Err(AppError::Forbidden("You do not have permission to manage roles.".into()));
    }

    let repo = RbacRepository::new(state.db.clone());
    let perms = repo.list_permissions().await?;
    Ok(HttpResponse::Ok().json(perms))
}

/// POST /v1/orgs/current/roles — create a custom role.
async fn create_org_role(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<CreateCustomRoleRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session
        .current_org_id
        .ok_or_else(|| AppError::Validation("Select a workspace first.".into()))?;

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac.has_permission(session.user_id, org_id, "roles:manage").await? {
        return Err(AppError::Forbidden("You do not have permission to manage roles.".into()));
    }

    let name = body.name.trim().to_string();
    let code = body.code.trim().to_lowercase().replace(' ', "_");

    if name.is_empty() || code.is_empty() {
        return Err(AppError::Validation("Role name and code are required.".into()));
    }
    if code.starts_with("system_") || ["owner","admin","manager","member","viewer"].contains(&code.as_str()) {
        return Err(AppError::Validation("That role code is reserved for system roles.".into()));
    }

    let repo = RbacRepository::new(state.db.clone());
    let role = repo.create_custom_role(org_id, &name, &code, &body.permissions).await?;
    let permissions = repo.get_role_permissions(role.id).await?;

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(session.user_id),
        organization_id: Some(org_id),
        action: "workspace.role.created".into(),
        target_type: "role".into(),
        target_id: Some(role.id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({
            "role_code": role.code,
            "role_name": role.name,
            "permissions": permissions,
        }),
    }).await;

    Ok(HttpResponse::Created().json(RoleWithPermissions {
        id: role.id,
        organization_id: role.organization_id,
        code: role.code,
        name: role.name,
        is_system: role.is_system,
        created_at: role.created_at,
        permissions,
    }))
}

/// DELETE /v1/orgs/current/roles/{role_id} — delete a custom role.
async fn delete_org_role(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let org_id = session
        .current_org_id
        .ok_or_else(|| AppError::Validation("Select a workspace first.".into()))?;
    let role_id = path.into_inner();

    let rbac = RbacService::new(RbacRepository::new(state.db.clone()));
    if !rbac.has_permission(session.user_id, org_id, "roles:manage").await? {
        return Err(AppError::Forbidden("You do not have permission to manage roles.".into()));
    }

    let repo = RbacRepository::new(state.db.clone());
    let deleted = repo.delete_custom_role(org_id, role_id).await?;
    if !deleted {
        return Err(AppError::NotFound("Custom role not found in this workspace (system roles cannot be deleted).".into()));
    }

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(session.user_id),
        organization_id: Some(org_id),
        action: "workspace.role.deleted".into(),
        target_type: "role".into(),
        target_id: Some(role_id.to_string()),
        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
        metadata: serde_json::json!({}),
    }).await;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "ok": true })))
}

pub fn routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/current/roles")
            .wrap(RequireAuth)
            .route("", web::get().to(list_org_roles))
            .route("", web::post().to(create_org_role))
            .route("/permissions", web::get().to(list_permissions))
            .route("/{role_id}", web::delete().to(delete_org_role)),
    );
}
