use actix_web::{web, HttpRequest, HttpResponse};
use sha2::Digest as _;
use sqlx::Row;
use uuid::Uuid;

use crate::bootstrap::state::AppState;
use crate::modules::audit::service::{AuditEvent, AuditService};
use crate::modules::organization::handlers::{
    demo_app_icon_url, load_client_allowed_embed_origins, sort_order_or_error, ClientListQuery,
    OrgClientResponse, OrgOAuthClient, PaginatedActivityResponse, TenantAuthConfigResponse,
    WorkspaceIntegrationClientSecretMetadataResponse, ORG_CLIENT_LIST_LIMIT,
    ORG_CLIENT_REDIRECT_URI_LIMIT,
};
use crate::shared::error::AppError;
use crate::shared::request_ip::client_ip_string_from_http_request;
use crate::modules::oidc::service::OIDCService;
use crate::modules::session::repository::SessionRepository;
use crate::shared::runtime_config::load_runtime_app_config;

#[derive(serde::Serialize, utoipa::ToSchema)]
pub struct WorkspaceIntegrationInfoResponse {
    workspace_id: Uuid,
    workspace_slug: String,
    workspace_name: String,
    login_display_name: Option<String>,
    icon_url: Option<String>,
    login_logo_url: Option<String>,
    icon_container: Option<String>,
    login_logo_container: Option<String>,
    login_logo_size: Option<String>,
    brand_color: Option<String>,
    key_label: String,
    key_prefix: String,
    permission_preset: String,
    allowed_permissions: Vec<String>,
}

#[derive(sqlx::FromRow)]
pub struct WorkspaceIntegrationInfoRow {
    pub org_id: Uuid,
    pub org_slug: String,
    pub org_name: String,
    pub login_display_name: Option<String>,
    pub icon_url: Option<String>,
    pub login_logo_url: Option<String>,
    pub icon_container: Option<String>,
    pub login_logo_container: Option<String>,
    pub login_logo_size: Option<String>,
    pub brand_color: Option<String>,
    pub created_by: Uuid,
    pub label: String,
    pub key_prefix: String,
    pub permission_preset: String,
    pub allowed_permissions: Vec<String>,
}

pub const WORKSPACE_KEY_PRESET_WORKSPACE_OWNER: &str = "workspace_owner";
pub const WORKSPACE_KEY_PRESET_WORKSPACE_ADMIN: &str = "workspace_admin";

pub fn workspace_api_key_permissions_for_preset(preset: &str) -> Vec<String> {
    match preset {
        WORKSPACE_KEY_PRESET_WORKSPACE_ADMIN => vec![
            "workspace.read",
            "branding.read",
            "auth_config.read",
            "clients.read",
            "clients.create",
            "clients.update",
            "clients.status",
            "members.read",
            "members.role_update",
            "invites.read",
            "invites.create",
            "invites.delete",
            "activity.read",
            "effective_policy.read",
        ]
        .into_iter()
        .map(String::from)
        .collect(),
        _ => vec![
            "workspace.read",
            "branding.read",
            "branding.write",
            "auth_config.read",
            "auth_config.write",
            "clients.read",
            "clients.create",
            "clients.update",
            "clients.status",
            "clients.rotate_secret",
            "clients.delete",
            "members.read",
            "members.enroll",
            "members.profile_update",
            "members.role_update",
            "members.remove",
            "members.sessions.revoke",
            "invites.read",
            "invites.create",
            "invites.delete",
            "activity.read",
            "effective_policy.read",
        ]
        .into_iter()
        .map(String::from)
        .collect(),
    }
}

pub fn normalize_workspace_api_key_permission_preset(raw: Option<&str>) -> &'static str {
    match raw.unwrap_or("").trim() {
        WORKSPACE_KEY_PRESET_WORKSPACE_ADMIN => WORKSPACE_KEY_PRESET_WORKSPACE_ADMIN,
        "owner_full" => WORKSPACE_KEY_PRESET_WORKSPACE_OWNER,
        _ => WORKSPACE_KEY_PRESET_WORKSPACE_OWNER,
    }
}

pub fn workspace_api_key_has_permission(
    ctx: &WorkspaceIntegrationInfoRow,
    permission: &str,
) -> bool {
    // The stored grant is authoritative. The preset describes how the key was
    // created; it must not silently re-grant a permission removed from the key.
    ctx.allowed_permissions.iter().any(|value| value == permission)
}

#[cfg(test)]
mod permission_tests {
    use super::*;

    #[test]
    fn persisted_key_grants_cannot_be_widened_by_preset() {
        let ctx = WorkspaceIntegrationInfoRow {
            org_id: Uuid::new_v4(), org_slug: "a".into(), org_name: "A".into(),
            login_display_name: None, icon_url: None, login_logo_url: None,
            icon_container: None, login_logo_container: None, login_logo_size: None,
            brand_color: None, created_by: Uuid::new_v4(), label: "restricted".into(),
            key_prefix: "restricted".into(), permission_preset: "workspace_owner".into(),
            allowed_permissions: vec!["workspace.read".into()],
        };
        assert!(workspace_api_key_has_permission(&ctx, "workspace.read"));
        assert!(!workspace_api_key_has_permission(&ctx, "members.remove"));
        assert!(!workspace_api_key_has_permission(&ctx, "clients.delete"));
    }

    #[test]
    fn self_enrollment_is_an_owner_key_permission_only() {
        assert!(workspace_api_key_permissions_for_preset(WORKSPACE_KEY_PRESET_WORKSPACE_OWNER)
            .iter().any(|permission| permission == "members.enroll"));
        assert!(!workspace_api_key_permissions_for_preset(WORKSPACE_KEY_PRESET_WORKSPACE_ADMIN)
            .iter().any(|permission| permission == "members.enroll"));
    }
}

pub fn require_workspace_api_key_permission(
    ctx: &WorkspaceIntegrationInfoRow,
    permission: &str,
) -> Result<(), AppError> {
    if workspace_api_key_has_permission(ctx, permission) {
        Ok(())
    } else {
        Err(AppError::Forbidden(format!(
            "This API key does not allow '{}'. Create a key with the required preset or permissions.",
            permission
        )))
    }
}

#[derive(serde::Serialize)]
pub struct WorkspaceIntegrationBrandingResponse {
    workspace_id: Uuid,
    workspace_slug: String,
    workspace_name: String,
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
    login_method_order: Vec<String>,
}

#[derive(sqlx::FromRow)]
struct WorkspaceIntegrationBrandingRow {
    org_id: Uuid,
    org_slug: String,
    org_name: String,
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
    login_method_order: Option<Vec<String>>,
}

fn extract_workspace_api_key(req: &HttpRequest) -> Option<String> {
    if let Some(header) = req
        .headers()
        .get("authorization")
        .and_then(|value| value.to_str().ok())
    {
        if let Some(token) = header.strip_prefix("Bearer ") {
            let trimmed = token.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }

    req.headers()
        .get("x-api-key")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

pub async fn resolve_workspace_api_key_context(
    req: &HttpRequest,
    state: &web::Data<AppState>,
) -> Result<WorkspaceIntegrationInfoRow, AppError> {
    let raw_key = extract_workspace_api_key(req).ok_or_else(|| {
        AppError::Validation(
            "Missing API key. Send it as Authorization: Bearer <key> or X-API-Key.".into(),
        )
    })?;

    let mut hasher = sha2::Sha256::new();
    hasher.update(raw_key.as_bytes());
    let key_hash = hex::encode(hasher.finalize());

    let row = sqlx::query_as::<_, WorkspaceIntegrationInfoRow>(
        r#"
        SELECT
            o.id AS org_id,
            o.slug AS org_slug,
            o.name AS org_name,
            o.login_display_name,
            o.icon_url,
            o.login_logo_url,
            o.icon_container,
            o.login_logo_container,
            o.login_logo_size,
            o.brand_color,
            k.created_by,
            k.label,
            k.key_prefix,
            k.permission_preset,
            k.allowed_permissions
        FROM tenant_api_keys k
        JOIN organizations o ON o.id = k.org_id
        WHERE k.key_hash = $1
          AND k.revoked = FALSE
          AND (k.expires_at IS NULL OR k.expires_at > NOW())
          AND o.status = 'active'
          AND o.platform_locked = FALSE
        LIMIT 1
        "#,
    )
    .bind(&key_hash)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to resolve workspace API key context: {e}")))?
    .ok_or_else(|| AppError::Validation("Invalid, revoked, or expired API key.".into()))?;

    sqlx::query("UPDATE tenant_api_keys SET last_used_at = NOW() WHERE key_hash = $1")
        .bind(&key_hash)
        .execute(&state.db)
        .await
        .map_err(|e| {
            AppError::Internal(format!("Failed to update workspace API key usage: {e}"))
        })?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(row.created_by),
            organization_id: Some(row.org_id),
            action: "api_key.used".into(),
            target_type: "tenant_api_key".into(),
            target_id: Some(row.key_prefix.clone()),
            ip: client_ip_string_from_http_request(req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "label": row.label,
                "key_prefix": row.key_prefix,
                "method": req.method().as_str(),
                "path": req.path(),
            }),
        })
        .await;

    Ok(row)
}

#[utoipa::path(
    get,
    path = "/v1/orgs/integrations/workspace",
    tag = "integrations",
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Workspace info for the authenticated API key", body = WorkspaceIntegrationInfoResponse),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the workspace.read permission"),
    ),
)]
pub async fn get_workspace_integration_info(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let row = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&row, "workspace.read")?;

    Ok(HttpResponse::Ok().json(WorkspaceIntegrationInfoResponse {
        workspace_id: row.org_id,
        workspace_slug: row.org_slug,
        workspace_name: row.org_name,
        login_display_name: row.login_display_name,
        icon_url: row.icon_url,
        login_logo_url: row.login_logo_url,
        icon_container: row.icon_container,
        login_logo_container: row.login_logo_container,
        login_logo_size: row.login_logo_size,
        brand_color: row.brand_color,
        key_label: row.label,
        key_prefix: row.key_prefix,
        permission_preset: row.permission_preset,
        allowed_permissions: row.allowed_permissions,
    }))
}

#[derive(serde::Deserialize, utoipa::ToSchema)]
pub struct WorkspaceMemberEnrollment {
    access_token: String,
    client_id: String,
}

/// Enroll the holder of a valid OAuth token as an ordinary workspace member.
/// The API key cannot choose a user or role, and suspended members stay suspended.
#[utoipa::path(
    post,
    path = "/v1/orgs/integrations/members/enroll",
    tag = "integrations",
    security(("workspace_api_key" = [])),
    request_body = WorkspaceMemberEnrollment,
    responses((status = 200, description = "The signed-in user is an active member"), (status = 401), (status = 403)),
)]
pub async fn enroll_workspace_integration_member(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<WorkspaceMemberEnrollment>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "members.enroll")?;
    if body.access_token.len() > 8192 || body.access_token.is_empty()
        || body.client_id.len() > 256 || body.client_id.is_empty()
    {
        return Err(AppError::Validation("Invalid enrollment credentials.".into()));
    }
    let config = load_runtime_app_config(state.get_ref()).await?;
    let oidc = OIDCService::new(state.db.clone(), std::sync::Arc::new(config));
    let claims = oidc.validate_access_token(&body.access_token).await?;
    if claims.aud != body.client_id {
        return Err(AppError::Unauthorized);
    }
    let user_id = Uuid::parse_str(&claims.sub).map_err(|_| AppError::Unauthorized)?;
    let session_id = Uuid::parse_str(&claims.sid).map_err(|_| AppError::Unauthorized)?;
    let (session, _) = SessionRepository::new(state.db.clone())
        .get_valid_session(session_id).await?;
    if session.user_id != user_id {
        return Err(AppError::Unauthorized);
    }
    let client_valid: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM oauth_clients WHERE client_id=$1 AND org_id=$2 AND status='active')",
    )
    .bind(&body.client_id)
    .bind(ctx.org_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to verify enrollment client: {e}")))?;
    if !client_valid {
        return Err(AppError::Forbidden("OAuth client is outside this workspace.".into()));
    }

    let mut tx = state.db.begin().await?;
    let inserted: Option<Uuid> = sqlx::query_scalar(
        "INSERT INTO organization_members (organization_id,user_id,status) VALUES ($1,$2,'active') ON CONFLICT (organization_id,user_id) DO NOTHING RETURNING id",
    )
    .bind(ctx.org_id)
    .bind(user_id)
    .fetch_optional(&mut *tx)
    .await?;
    let member_id = if let Some(id) = inserted {
        sqlx::query("INSERT INTO member_roles (member_id,role_id) SELECT $1,id FROM roles WHERE code='member' AND is_system=TRUE LIMIT 1 ON CONFLICT DO NOTHING")
            .bind(id).execute(&mut *tx).await?;
        id
    } else {
        let existing: (Uuid, String) = sqlx::query_as(
            "SELECT id,status FROM organization_members WHERE organization_id=$1 AND user_id=$2",
        )
        .bind(ctx.org_id).bind(user_id).fetch_one(&mut *tx).await?;
        if existing.1 != "active" {
            return Err(AppError::Forbidden("Workspace membership is suspended.".into()));
        }
        existing.0
    };
    tx.commit().await?;
    if inserted.is_some() {
        AuditService::new(state.db.clone()).log(AuditEvent {
            actor_user_id: Some(user_id), organization_id: Some(ctx.org_id),
            action: "workspace.member.self_enrolled".into(), target_type: "organization_member".into(),
            target_id: Some(member_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
            metadata: serde_json::json!({"client_id": body.client_id}),
        }).await;
    }
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "member_id": member_id, "subject": user_id, "status": "active", "created": inserted.is_some()
    })))
}

#[utoipa::path(
    get,
    path = "/v1/orgs/integrations/branding",
    tag = "integrations",
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Workspace branding configuration"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the branding.read permission"),
    ),
)]
pub async fn get_workspace_integration_branding(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "branding.read")?;

    let row = sqlx::query_as::<_, WorkspaceIntegrationBrandingRow>(
        r#"
        SELECT
            id AS org_id,
            slug AS org_slug,
            name AS org_name,
            login_display_name,
            login_title,
            login_subtitle,
            icon_url,
            login_logo_url,
            brand_color,
            show_login_logo,
            show_login_title,
            show_login_subtitle,
            show_powered_by,
            login_method_order
        FROM organizations
        WHERE id = $1
        "#,
    )
    .bind(ctx.org_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Failed to load workspace integration branding: {e}"
        ))
    })?;

    Ok(
        HttpResponse::Ok().json(WorkspaceIntegrationBrandingResponse {
            workspace_id: row.org_id,
            workspace_slug: row.org_slug,
            workspace_name: row.org_name,
            login_display_name: row.login_display_name,
            login_title: row.login_title,
            login_subtitle: row.login_subtitle,
            icon_url: row.icon_url,
            login_logo_url: row.login_logo_url,
            brand_color: row.brand_color,
            show_login_logo: row.show_login_logo,
            show_login_title: row.show_login_title,
            show_login_subtitle: row.show_login_subtitle,
            show_powered_by: row.show_powered_by,
            login_method_order: row.login_method_order.unwrap_or_default(),
        }),
    )
}

#[utoipa::path(
    get,
    path = "/v1/orgs/integrations/auth-config",
    tag = "integrations",
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Workspace auth provider + SMTP configuration (secrets redacted)"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the auth_config.read permission"),
    ),
)]
pub async fn get_workspace_integration_auth_config(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "auth_config.read")?;

    let row = sqlx::query!(
        r#"
        SELECT google_client_id, google_client_secret,
               microsoft_client_id, microsoft_client_secret, microsoft_tenant_id,
               smtp_host, smtp_port, smtp_from, smtp_security
        FROM tenant_auth_config WHERE org_id = $1
        "#,
        ctx.org_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Failed to load workspace integration auth config: {e}"
        ))
    })?;

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

async fn load_workspace_integration_client_response(
    state: &web::Data<AppState>,
    org_id: Uuid,
    client_id_param: Uuid,
) -> Result<OrgClientResponse, AppError> {
    let client = sqlx::query_as::<_, OrgOAuthClient>(
        "SELECT id, client_id, app_name, NULL::text AS app_icon_url, app_type, status, is_first_party, created_at FROM oauth_clients WHERE id = $1 AND org_id = $2",
    )
    .bind(client_id_param)
    .bind(org_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace integration client: {e}")))?
    .ok_or_else(|| AppError::NotFound("Client not found in your workspace.".into()))?;

    let redirect_uris = sqlx::query_scalar::<_, String>(
        "SELECT redirect_uri FROM oauth_client_redirect_uris WHERE oauth_client_id = $1 ORDER BY redirect_uri LIMIT $2",
    )
    .bind(client.id)
    .bind(ORG_CLIENT_REDIRECT_URI_LIMIT)
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace integration client redirect URIs: {e}")))?;
    let allowed_embed_origins = load_client_allowed_embed_origins(&state.db, client.id).await?;

    Ok(OrgClientResponse {
        client,
        redirect_uris,
        allowed_embed_origins,
        client_secret: None,
    })
}

#[utoipa::path(
    get,
    path = "/v1/orgs/integrations/clients",
    tag = "integrations",
    params(ClientListQuery),
    security(("workspace_api_key" = [])),
    responses((status = 200, description = "Paginated workspace OAuth clients/apps"), (status = 401), (status = 403)),
)]
pub async fn list_workspace_integration_clients(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<ClientListQuery>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "clients.read")?;
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 1000);
    let search = query.q.as_deref().unwrap_or("").trim().to_lowercase();
    if search.len() > 256 {
        return Err(AppError::Validation(
            "Search query is too long (max 256 characters).".into(),
        ));
    }
    let status_filter = query
        .status
        .as_deref()
        .unwrap_or("all")
        .trim()
        .to_lowercase();
    let app_type_filter = query
        .app_type
        .as_deref()
        .unwrap_or("all")
        .trim()
        .to_lowercase();
    let sort_by = query.sort_by.as_deref().unwrap_or("created_at");
    let sort_order = sort_order_or_error(query.sort_order.as_deref())?;

    let client_rows = sqlx::query!(
        "SELECT id, client_id, app_name, app_type, status, is_first_party, created_at FROM oauth_clients WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2",
        ctx.org_id,
        ORG_CLIENT_LIST_LIMIT
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace integration clients: {e}")))?;

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
            "SELECT redirect_uri FROM oauth_client_redirect_uris WHERE oauth_client_id = $1 ORDER BY redirect_uri LIMIT $2",
        )
        .bind(client.id)
        .bind(ORG_CLIENT_REDIRECT_URI_LIMIT)
        .fetch_all(&state.db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to load workspace integration client redirect URIs: {e}")))?;
        let allowed_embed_origins = load_client_allowed_embed_origins(&state.db, client.id).await?;
        responses.push(OrgClientResponse {
            client,
            redirect_uris,
            allowed_embed_origins,
            client_secret: None,
        });
    }

    let mut filtered = responses
        .into_iter()
        .filter(|entry| {
            (status_filter == "all" || entry.client.status.eq_ignore_ascii_case(&status_filter))
                && (app_type_filter == "all"
                    || entry.client.app_type.eq_ignore_ascii_case(&app_type_filter))
                && (search.is_empty()
                    || entry.client.app_name.to_lowercase().contains(&search)
                    || entry.client.client_id.to_lowercase().contains(&search)
                    || entry.client.app_type.to_lowercase().contains(&search)
                    || entry.client.status.to_lowercase().contains(&search)
                    || entry
                        .redirect_uris
                        .iter()
                        .any(|uri| uri.to_lowercase().contains(&search))
                    || entry
                        .allowed_embed_origins
                        .iter()
                        .any(|origin| origin.to_lowercase().contains(&search)))
        })
        .collect::<Vec<_>>();

    match sort_by {
        "app_name" => filtered.sort_by(|a, b| {
            a.client
                .app_name
                .to_lowercase()
                .cmp(&b.client.app_name.to_lowercase())
        }),
        "client_id" => filtered.sort_by(|a, b| {
            a.client
                .client_id
                .to_lowercase()
                .cmp(&b.client.client_id.to_lowercase())
        }),
        "app_type" => filtered.sort_by(|a, b| a.client.app_type.cmp(&b.client.app_type)),
        "status" => filtered.sort_by(|a, b| a.client.status.cmp(&b.client.status)),
        "created_at" => filtered.sort_by_key(|entry| entry.client.created_at),
        _ => {
            return Err(AppError::Validation(
                "sort_by must be one of app_name, client_id, app_type, status, or created_at."
                    .into(),
            ))
        }
    }
    if sort_order == "desc" {
        filtered.reverse();
    }

    let total = filtered.len() as i64;
    let start = ((page - 1) * page_size) as usize;
    let end = (start + page_size as usize).min(filtered.len());
    let items = if start >= filtered.len() {
        vec![]
    } else {
        filtered[start..end].to_vec()
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
    path = "/v1/orgs/integrations/clients/{client_id}",
    tag = "integrations",
    params(("client_id" = Uuid, Path, description = "Client UUID")),
    security(("workspace_api_key" = [])),
    responses((status = 200, description = "Client/app detail"), (status = 401), (status = 403), (status = 404)),
)]
pub async fn get_workspace_integration_client_detail(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "clients.read")?;
    let response =
        load_workspace_integration_client_response(&state, ctx.org_id, path.into_inner()).await?;
    Ok(HttpResponse::Ok().json(response))
}

#[utoipa::path(
    get,
    path = "/v1/orgs/integrations/clients/{client_id}/secret-metadata",
    tag = "integrations",
    params(("client_id" = Uuid, Path, description = "Client UUID")),
    security(("workspace_api_key" = [])),
    responses(
        (status = 200, description = "Client secret metadata (last rotation, presence flag; never the secret itself)"),
        (status = 401, description = "Missing or invalid workspace API key"),
        (status = 403, description = "API key lacks the clients.read permission"),
        (status = 404, description = "Client not found in this workspace"),
    ),
)]
pub async fn get_workspace_integration_client_secret_metadata(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let ctx = resolve_workspace_api_key_context(&req, &state).await?;
    require_workspace_api_key_permission(&ctx, "clients.read")?;
    let client_id_param = path.into_inner();

    let row = sqlx::query(
        "SELECT id, client_id, app_name, app_type, status, client_secret_hash IS NOT NULL AS has_client_secret FROM oauth_clients WHERE id = $1 AND org_id = $2",
    )
    .bind(client_id_param)
    .bind(ctx.org_id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load workspace integration client secret metadata: {e}")))?
    .ok_or_else(|| AppError::NotFound("Client not found in your workspace.".into()))?;

    let id: Uuid = row.try_get("id").map_err(|e| {
        AppError::Internal(format!(
            "Failed to read workspace integration client id: {e}"
        ))
    })?;
    let client_id: String = row.try_get("client_id").map_err(|e| {
        AppError::Internal(format!(
            "Failed to read workspace integration client_id: {e}"
        ))
    })?;
    let app_name: String = row.try_get("app_name").map_err(|e| {
        AppError::Internal(format!(
            "Failed to read workspace integration app name: {e}"
        ))
    })?;
    let app_type: String = row.try_get("app_type").map_err(|e| {
        AppError::Internal(format!(
            "Failed to read workspace integration app type: {e}"
        ))
    })?;
    let status: String = row.try_get("status").map_err(|e| {
        AppError::Internal(format!(
            "Failed to read workspace integration client status: {e}"
        ))
    })?;
    let has_client_secret: bool = row.try_get("has_client_secret").map_err(|e| {
        AppError::Internal(format!(
            "Failed to read workspace integration client secret metadata: {e}"
        ))
    })?;

    Ok(
        HttpResponse::Ok().json(WorkspaceIntegrationClientSecretMetadataResponse {
            id,
            client_id,
            app_name,
            app_type: app_type.clone(),
            status: status.clone(),
            has_client_secret,
            can_rotate_secret: app_type == "web" && status == "active" && has_client_secret,
        }),
    )
}
