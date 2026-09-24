//! Bounded phone approval for the first Rooiam-owned action: workspace API-key creation.
//! Login-v1 QR values and signing bytes are deliberately unrelated to this protocol.
use actix_web::{web, HttpRequest, HttpResponse};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, Duration, Utc};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Row};
use subtle::ConstantTimeEq;
use uuid::Uuid;

use crate::bootstrap::state::AppState;
use crate::http::middleware::auth::{extract_session, RequireAuth};
use crate::modules::device_login::{
    repository::DeviceLoginRepository,
    service::{hash_device_token, verify_device_approval_signature, DeviceLoginService},
};
use crate::modules::organization::{
    integration::{
        normalize_workspace_api_key_permission_preset, workspace_api_key_permissions_for_preset,
        WORKSPACE_KEY_PRESET_WORKSPACE_OWNER,
    },
    repository::OrganizationRepository,
};
use crate::modules::rbac::{repository::RbacRepository, service::RbacService};
use crate::shared::{error::AppError, runtime_config::effective_issuer_url};

const ACTION: &str = "workspace.api_key.create";
const MAX_LABEL: usize = 100;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ActionApproval {
    pub id: Uuid,
    pub org_id: Uuid,
    pub requester_user_id: Uuid,
    pub requester_session_id: Uuid,
    pub browser_proof_hash: String,
    pub server_origin: String,
    pub action: String,
    pub label: String,
    pub permission_preset: String,
    pub allowed_permissions: Vec<String>,
    pub key_expires_at: Option<DateTime<Utc>>,
    pub payload_digest: String,
    pub policy_version: i64,
    pub display_code: String,
    pub status: String,
    pub approved_device_id: Option<Uuid>,
    pub expires_at: DateTime<Utc>,
    pub resulting_key_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct StartApproval {
    pub label: String,
    pub permission_preset: Option<String>,
    pub expires_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct BrowserApproval {
    id: Uuid,
    browser_proof: String,
}

#[derive(Debug, Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct PhoneDecision {
    id: Uuid,
    device_token: String,
    approval_signature: Option<String>,
    display_code: Option<String>,
}

#[derive(Serialize, utoipa::ToSchema)]
pub struct ApprovalStatus {
    id: Uuid,
    status: String,
    expires_at: DateTime<Utc>,
    resulting_key_id: Option<Uuid>,
}

fn effective_status(row: &ActionApproval) -> String {
    if matches!(row.status.as_str(), "pending" | "approved") && row.expires_at <= Utc::now() {
        "expired".into()
    } else {
        row.status.clone()
    }
}

fn status_response(row: &ActionApproval) -> ApprovalStatus {
    ApprovalStatus {
        id: row.id,
        status: effective_status(row),
        expires_at: row.expires_at,
        resulting_key_id: row.resulting_key_id,
    }
}

pub fn payload_digest(
    label: &str,
    preset: &str,
    permissions: &[String],
    expiry: Option<DateTime<Utc>>,
) -> String {
    // Length-prefixed UTF-8 fields; no JSON key-order or delimiter ambiguity.
    let mut hash = Sha256::new();
    for field in std::iter::once(label.to_owned())
        .chain(std::iter::once(preset.to_owned()))
        .chain(std::iter::once(
            expiry.map(|v| v.to_rfc3339()).unwrap_or_default(),
        ))
        .chain(permissions.iter().cloned())
    {
        hash.update((field.len() as u32).to_be_bytes());
        hash.update(field.as_bytes());
    }
    hex::encode(hash.finalize())
}

fn approval_payload(row: &ActionApproval) -> String {
    format!(
        "rooiam-action-approval/v1\n{}\n{}\n{}\n{}\n{}\n{}\n{}\n{}",
        row.server_origin,
        row.id,
        row.org_id,
        row.requester_user_id,
        row.action,
        row.payload_digest,
        row.display_code,
        row.expires_at.to_rfc3339()
    )
}

pub(crate) fn proof_hash(proof: &str) -> Result<String, AppError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(proof)
        .map_err(|_| AppError::Forbidden("Invalid browser proof.".into()))?;
    if bytes.len() != 32 {
        return Err(AppError::Forbidden("Invalid browser proof.".into()));
    }
    Ok(hex::encode(Sha256::digest(&bytes)))
}

async fn current_workspace(
    req: &HttpRequest,
    state: &web::Data<AppState>,
) -> Result<(Uuid, Uuid, Uuid), AppError> {
    let session = extract_session(req)?;
    let org = session
        .current_org_id
        .ok_or_else(|| AppError::Validation("Select a workspace first.".into()))?;
    super::handlers::ensure_demo_workspace_allowed(state, org).await?;
    Ok((org, session.user_id, session.session_id))
}

async fn require_key_permission(
    state: &web::Data<AppState>,
    org: Uuid,
    user: Uuid,
) -> Result<(), AppError> {
    if !RbacService::new(RbacRepository::new(state.db.clone()))
        .has_permission(user, org, "org:update")
        .await?
    {
        return Err(AppError::Forbidden(
            "You cannot manage workspace API keys.".into(),
        ));
    }
    Ok(())
}

pub async fn policy(db: &PgPool, org: Uuid) -> Result<(bool, i64), AppError> {
    let row = sqlx::query(
        "SELECT required, version FROM workspace_api_key_phone_policies WHERE org_id = $1",
    )
    .bind(org)
    .fetch_optional(db)
    .await?;
    Ok(row
        .map(|r| (r.get("required"), r.get("version")))
        .unwrap_or((false, 0)))
}

#[utoipa::path(get, path = "/v1/orgs/current/api-key-phone-policy", tag = "browser", security(("session_cookie" = [])), responses((status = 200, description = "Workspace API-key phone-confirmation policy")))]
pub async fn get_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let (org, user, _) = current_workspace(&req, &state).await?;
    require_key_permission(&state, org, user).await?;
    let (required, version) = policy(&state.db, org).await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"required": required, "version": version})))
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct SetPolicy {
    required: bool,
}

#[utoipa::path(put, path = "/v1/orgs/current/api-key-phone-policy", tag = "browser", request_body = SetPolicy, security(("session_cookie" = [])), responses((status = 200, description = "Owner changed the phone-confirmation policy"), (status = 403, description = "Owner or recent sign-in required")))]
pub async fn set_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<SetPolicy>,
) -> Result<HttpResponse, AppError> {
    let (org, user, _) = current_workspace(&req, &state).await?;
    if !OrganizationRepository::new(state.db.clone())
        .is_org_owner(org, user)
        .await?
    {
        return Err(AppError::Forbidden(
            "Only the workspace owner can change API-key phone confirmation.".into(),
        ));
    }
    if Utc::now() - extract_session(&req)?.created_at > Duration::minutes(10) {
        return Err(AppError::Forbidden(
            "Sign in again before changing this security policy.".into(),
        ));
    }
    if body.required {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM user_trusted_devices WHERE user_id = $1 AND revoked_at IS NULL AND attestation_status = 'verified' AND device_public_key IS NOT NULL")
            .bind(user).fetch_one(&state.db).await?;
        if count == 0 {
            return Err(AppError::Validation(
                "Enroll a verified phone on your account before requiring phone confirmation."
                    .into(),
            ));
        }
    }
    let mut tx = state.db.begin().await?;
    sqlx::query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE")
        .execute(&mut *tx)
        .await?;
    sqlx::query("SELECT id FROM organizations WHERE id = $1 AND status = 'active' AND platform_locked = FALSE FOR UPDATE")
        .bind(org)
        .fetch_optional(&mut *tx).await?
        .ok_or_else(|| AppError::Forbidden("Workspace is inactive or locked.".into()))?;
    let still_owner: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM organization_members om JOIN member_roles mr ON mr.member_id = om.id JOIN roles r ON r.id = mr.role_id WHERE om.organization_id = $1 AND om.user_id = $2 AND om.status = 'active' AND r.code = 'owner')")
        .bind(org).bind(user).fetch_one(&mut *tx).await?;
    if !still_owner {
        return Err(AppError::Forbidden(
            "Only the current workspace owner can change this policy.".into(),
        ));
    }
    let row = sqlx::query("INSERT INTO workspace_api_key_phone_policies (org_id, required, updated_by) VALUES ($1,$2,$3) ON CONFLICT (org_id) DO UPDATE SET required = EXCLUDED.required, updated_by = EXCLUDED.updated_by, updated_at = NOW(), version = workspace_api_key_phone_policies.version + 1 RETURNING required, version")
        .bind(org).bind(body.required).bind(user).fetch_one(&mut *tx).await?;
    let required: bool = row.get("required");
    let version: i64 = row.get("version");
    sqlx::query("INSERT INTO audit_logs (actor_user_id, organization_id, action, target_type, target_id, metadata) VALUES ($1,$2,'api_key.phone_policy.changed','workspace_api_key_phone_policy',$3,$4)")
        .bind(user).bind(org).bind(org.to_string()).bind(serde_json::json!({"required": required, "version": version})).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"required": required, "version": version})))
}

#[utoipa::path(post, path = "/v1/orgs/current/action-approvals", tag = "browser", request_body = StartApproval, security(("session_cookie" = [])), responses((status = 201, description = "Immutable API-key request and QR"), (status = 409, description = "Phone policy is off")))]
pub async fn start(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<StartApproval>,
) -> Result<HttpResponse, AppError> {
    let (org, user, session) = current_workspace(&req, &state).await?;
    require_key_permission(&state, org, user).await?;
    let (required, version) = policy(&state.db, org).await?;
    if !required {
        return Err(AppError::Conflict(
            "Phone confirmation is not required for this workspace.".into(),
        ));
    }
    let label = body.label.trim();
    if label.is_empty() || label.len() > MAX_LABEL || label.chars().any(char::is_control) {
        return Err(AppError::Validation(
            "API key label must contain 1–100 printable bytes.".into(),
        ));
    }
    if body.expires_at.is_some_and(|v| v <= Utc::now()) {
        return Err(AppError::Validation(
            "API key expiry must be in the future.".into(),
        ));
    }
    if let Some(raw) = body.permission_preset.as_deref() {
        if !matches!(raw, "workspace_owner" | "workspace_admin") {
            return Err(AppError::Validation(
                "Unsupported API key permission preset.".into(),
            ));
        }
    }
    let preset = normalize_workspace_api_key_permission_preset(body.permission_preset.as_deref());
    if preset == WORKSPACE_KEY_PRESET_WORKSPACE_OWNER
        && !OrganizationRepository::new(state.db.clone())
            .is_org_owner(org, user)
            .await?
    {
        return Err(AppError::Forbidden(
            "Only the workspace owner can create a full-access key.".into(),
        ));
    }
    let permissions = workspace_api_key_permissions_for_preset(preset);
    let digest = payload_digest(label, preset, &permissions, body.expires_at);
    let id = Uuid::new_v4();
    let mut proof = [0u8; 32];
    OsRng.fill_bytes(&mut proof);
    let browser_proof = URL_SAFE_NO_PAD.encode(proof);
    let mut code = [0u8; 4];
    OsRng.fill_bytes(&mut code);
    let display_code = format!("{:06}", u32::from_be_bytes(code) % 1_000_000);
    let expires_at = Utc::now() + Duration::minutes(5);
    let issuer = effective_issuer_url(&state.db).await?;
    let issuer = issuer.trim_end_matches('/');
    let mut tx = state.db.begin().await?;
    sqlx::query("INSERT INTO workspace_action_approvals (id, org_id, requester_user_id, requester_session_id, browser_proof_hash, server_origin, action, label, permission_preset, allowed_permissions, key_expires_at, payload_digest, policy_version, display_code, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)")
        .bind(id).bind(org).bind(user).bind(session).bind(proof_hash(&browser_proof)?).bind(issuer).bind(ACTION).bind(label).bind(preset).bind(&permissions).bind(body.expires_at).bind(digest).bind(version).bind(&display_code).bind(expires_at).execute(&mut *tx).await?;
    sqlx::query("INSERT INTO audit_logs (actor_user_id, organization_id, action, target_type, target_id, metadata) VALUES ($1,$2,'api_key.approval.started','workspace_action_approval',$3,$4)")
        .bind(user).bind(org).bind(id.to_string()).bind(serde_json::json!({"action":ACTION,"permission_preset":preset,"policy_version":version}))
        .execute(&mut *tx).await?;
    tx.commit().await?;
    let qr = format!(
        "rooiam://action-approval?server={}&id={}&v=1",
        url::form_urlencoded::byte_serialize(issuer.as_bytes()).collect::<String>(),
        id
    );
    Ok(HttpResponse::Created().json(serde_json::json!({"id":id,"browser_proof":browser_proof,"qr_value":qr,"display_code":display_code,"expires_at":expires_at,"status":"pending","action":ACTION})))
}

async fn load(db: &PgPool, id: Uuid) -> Result<ActionApproval, AppError> {
    sqlx::query_as::<_, ActionApproval>("SELECT id, org_id, requester_user_id, requester_session_id, browser_proof_hash, server_origin, action, label, permission_preset, allowed_permissions, key_expires_at, payload_digest, policy_version, display_code, status, approved_device_id, expires_at, resulting_key_id FROM workspace_action_approvals WHERE id = $1")
        .bind(id).fetch_optional(db).await?.ok_or_else(|| AppError::NotFound("Approval request not found.".into()))
}

async fn browser_row(
    req: &HttpRequest,
    state: &web::Data<AppState>,
    body: &BrowserApproval,
) -> Result<ActionApproval, AppError> {
    let (org, user, session) = current_workspace(req, state).await?;
    let row = load(&state.db, body.id).await?;
    if row.org_id != org
        || row.requester_user_id != user
        || row.requester_session_id != session
        || !bool::from(
            row.browser_proof_hash
                .as_bytes()
                .ct_eq(proof_hash(&body.browser_proof)?.as_bytes()),
        )
    {
        return Err(AppError::NotFound("Approval request not found.".into()));
    }
    Ok(row)
}

#[utoipa::path(post, path = "/v1/orgs/current/action-approvals/status", tag = "browser", request_body = BrowserApproval, security(("session_cookie" = [])), responses((status = 200, body = ApprovalStatus)))]
pub async fn status(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<BrowserApproval>,
) -> Result<HttpResponse, AppError> {
    let row = browser_row(&req, &state, &body).await?;
    Ok(HttpResponse::Ok().json(status_response(&row)))
}

#[utoipa::path(post, path = "/v1/orgs/current/action-approvals/cancel", tag = "browser", request_body = BrowserApproval, security(("session_cookie" = [])), responses((status = 200, description = "Request cancelled")))]
pub async fn cancel(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<BrowserApproval>,
) -> Result<HttpResponse, AppError> {
    let row = browser_row(&req, &state, &body).await?;
    let mut tx = state.db.begin().await?;
    let affected = sqlx::query("UPDATE workspace_action_approvals SET status = 'cancelled', decided_at = NOW() WHERE id = $1 AND status IN ('pending','approved') AND expires_at > clock_timestamp()")
        .bind(row.id).execute(&mut *tx).await?.rows_affected();
    if affected != 1 {
        return Err(AppError::Conflict(
            "This request is no longer cancellable.".into(),
        ));
    }
    sqlx::query("INSERT INTO audit_logs (actor_user_id, organization_id, action, target_type, target_id, metadata) VALUES ($1,$2,'api_key.approval.cancelled','workspace_action_approval',$3,'{}'::jsonb)")
        .bind(row.requester_user_id).bind(row.org_id).bind(row.id.to_string()).execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"status":"cancelled"})))
}

#[utoipa::path(get, path = "/v1/identity/action-approvals/{id}", tag = "browser", params(("id" = Uuid, Path, description = "Action request ID")), security(("session_cookie" = [])), responses((status = 200, description = "Authoritative phone review details")))]
pub async fn preview(
    req: HttpRequest,
    state: web::Data<AppState>,
    id: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let row = load(&state.db, id.into_inner()).await?;
    if row.requester_user_id != session.user_id {
        return Err(AppError::NotFound("Approval request not found.".into()));
    }
    let workspace_name: String = sqlx::query_scalar("SELECT name FROM organizations WHERE id = $1")
        .bind(row.org_id)
        .fetch_one(&state.db)
        .await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "id":row.id,"protocol_version":1,"server_origin":row.server_origin,"action":ACTION,"status":effective_status(&row),
        "workspace_id":row.org_id,"workspace_name":workspace_name,"label":row.label,
        "permission_preset":row.permission_preset,"allowed_permissions":row.allowed_permissions,
        "key_expires_at":row.key_expires_at,"display_code":row.display_code,
        "expires_at":row.expires_at,"approval_payload":approval_payload(&row)
    })))
}

async fn decision(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<PhoneDecision>,
    approve: bool,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    let row = load(&state.db, body.id).await?;
    if row.requester_user_id != session.user_id {
        return Err(AppError::NotFound("Approval request not found.".into()));
    }
    if effective_status(&row) != "pending" {
        return Err(AppError::Conflict(
            "This approval request is no longer pending.".into(),
        ));
    }
    if approve && body.display_code.as_deref() != Some(row.display_code.as_str()) {
        return Err(AppError::Validation(
            "The request code does not match the browser.".into(),
        ));
    }
    let repo = DeviceLoginRepository::new(state.db.clone());
    let device = repo
        .get_active_trusted_device_by_token_hash(
            session.user_id,
            &hash_device_token(&body.device_token)?,
        )
        .await?
        .ok_or_else(|| {
            AppError::Forbidden("This phone is not enrolled for this account.".into())
        })?;
    let service = DeviceLoginService::new(repo, state.config.clone(), state.redis.clone());
    let device = service
        .ensure_trusted_device_attestation_allows_qr_login(device)
        .await?;
    if approve {
        verify_device_approval_signature(
            device
                .device_public_key
                .as_deref()
                .ok_or_else(|| AppError::Forbidden("Trusted device key is missing.".into()))?,
            &approval_payload(&row),
            body.approval_signature
                .as_deref()
                .ok_or_else(|| AppError::Validation("Approval signature is required.".into()))?,
        )?;
    }
    let next = if approve { "approved" } else { "denied" };
    let mut tx = state.db.begin().await?;
    let affected = sqlx::query("UPDATE workspace_action_approvals SET status = $1, approved_device_id = $2, decided_at = NOW() WHERE id = $3 AND requester_user_id = $4 AND status = 'pending' AND expires_at > clock_timestamp()")
        .bind(next).bind(device.id).bind(row.id).bind(session.user_id).execute(&mut *tx).await?.rows_affected();
    if affected != 1 {
        return Err(AppError::Conflict(
            "This approval request expired or was already decided.".into(),
        ));
    }
    sqlx::query("INSERT INTO audit_logs (actor_user_id, organization_id, action, target_type, target_id, metadata) VALUES ($1,$2,$3,'workspace_action_approval',$4,$5)")
        .bind(session.user_id).bind(row.org_id).bind(if approve { "api_key.approval.approved" } else { "api_key.approval.denied" })
        .bind(row.id.to_string()).bind(serde_json::json!({"device_id":device.id,"action":ACTION}))
        .execute(&mut *tx).await?;
    tx.commit().await?;
    Ok(HttpResponse::Ok().json(serde_json::json!({"status":next})))
}

#[utoipa::path(post, path = "/v1/identity/action-approvals/approve", tag = "browser", request_body = PhoneDecision, security(("session_cookie" = [])), responses((status = 200, description = "Signed same-user device approval")))]
pub async fn approve(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<PhoneDecision>,
) -> Result<HttpResponse, AppError> {
    decision(req, state, body, true).await
}
#[utoipa::path(post, path = "/v1/identity/action-approvals/deny", tag = "browser", request_body = PhoneDecision, security(("session_cookie" = [])), responses((status = 200, description = "Same-user device denial")))]
pub async fn deny(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<PhoneDecision>,
) -> Result<HttpResponse, AppError> {
    decision(req, state, body, false).await
}

pub fn org_routes(cfg: &mut web::ServiceConfig) {
    use crate::http::middleware::rate_limit::RateLimit;
    cfg.service(
        web::resource("/current/api-key-phone-policy")
            .wrap(RequireAuth)
            .wrap(RateLimit::per_endpoint(10, 60))
            .wrap(actix_web::middleware::DefaultHeaders::new().add(("Cache-Control", "no-store")))
            .route(web::get().to(get_policy))
            .route(web::put().to(set_policy)),
    );
    cfg.service(
        web::scope("/current/action-approvals")
            .wrap(RequireAuth)
            .wrap(actix_web::middleware::DefaultHeaders::new().add(("Cache-Control", "no-store")))
            .service(
                web::resource("")
                    .wrap(RateLimit::per_endpoint(10, 60))
                    .route(web::post().to(start)),
            )
            .service(
                web::resource("/status")
                    .wrap(RateLimit::per_endpoint(120, 60))
                    .route(web::post().to(status)),
            )
            .service(
                web::resource("/cancel")
                    .wrap(RateLimit::per_endpoint(20, 60))
                    .route(web::post().to(cancel)),
            ),
    );
}

pub fn identity_routes(cfg: &mut web::ServiceConfig) {
    use crate::http::middleware::rate_limit::RateLimit;
    cfg.service(
        web::scope("/action-approvals")
            .wrap(RequireAuth)
            .wrap(actix_web::middleware::DefaultHeaders::new().add(("Cache-Control", "no-store")))
            .service(
                web::resource("/approve")
                    .wrap(RateLimit::per_endpoint(20, 60))
                    .route(web::post().to(approve)),
            )
            .service(
                web::resource("/deny")
                    .wrap(RateLimit::per_endpoint(20, 60))
                    .route(web::post().to(deny)),
            )
            .service(
                web::resource("/{id}")
                    .wrap(RateLimit::per_endpoint(120, 60))
                    .route(web::get().to(preview)),
            ),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reviewed_key_parameters_are_bound_exactly() {
        let permissions = vec!["workspace.read".to_owned(), "clients.create".to_owned()];
        let original = payload_digest("CI key", "workspace_admin", &permissions, None);
        assert_eq!(
            original,
            "4e79a71f2fa68dc1827f79eb1518d9c6cdee811e040c04747aa110c6436bdde1"
        );
        assert_ne!(
            original,
            payload_digest("CI key ", "workspace_admin", &permissions, None)
        );
        assert_ne!(
            original,
            payload_digest("CI key", "workspace_owner", &permissions, None)
        );
        assert_ne!(
            original,
            payload_digest("CI key", "workspace_admin", &permissions[..1], None)
        );
        assert_ne!(
            original,
            payload_digest("CI key", "workspace_admin", &permissions, Some(Utc::now()))
        );
    }

    #[test]
    fn browser_proof_is_full_length_and_not_a_qr_reference() {
        let proof = URL_SAFE_NO_PAD.encode([7u8; 32]);
        assert_eq!(proof_hash(&proof).unwrap().len(), 64);
        assert!(proof_hash("short").is_err());
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn terminal_decision_cannot_be_reactivated(pool: PgPool) {
        let user: Uuid = sqlx::query_scalar("INSERT INTO users DEFAULT VALUES RETURNING id")
            .fetch_one(&pool)
            .await
            .unwrap();
        let org: Uuid = sqlx::query_scalar("INSERT INTO organizations (name, slug) VALUES ('Action test', 'action-test') RETURNING id").fetch_one(&pool).await.unwrap();
        let session: Uuid = sqlx::query_scalar("INSERT INTO sessions (user_id, session_secret_hash, expires_at) VALUES ($1, 'test', NOW() + interval '1 hour') RETURNING id")
            .bind(user).fetch_one(&pool).await.unwrap();
        let id: Uuid = sqlx::query_scalar("INSERT INTO workspace_action_approvals (org_id, requester_user_id, requester_session_id, browser_proof_hash, server_origin, action, label, permission_preset, allowed_permissions, payload_digest, policy_version, display_code, expires_at) VALUES ($1,$2,$3,'proof','https://auth.example','workspace.api_key.create','test','workspace_admin',ARRAY['workspace.read'],'digest',1,'123456',NOW() + interval '5 minutes') RETURNING id")
            .bind(org).bind(user).bind(session).fetch_one(&pool).await.unwrap();
        sqlx::query("UPDATE workspace_action_approvals SET status = 'denied' WHERE id = $1")
            .bind(id)
            .execute(&pool)
            .await
            .unwrap();
        let changed = sqlx::query("UPDATE workspace_action_approvals SET status = 'approved' WHERE id = $1 AND status = 'pending' AND expires_at > clock_timestamp()")
            .bind(id).execute(&pool).await.unwrap().rows_affected();
        assert_eq!(changed, 0);
    }
}
