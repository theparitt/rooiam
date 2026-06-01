use actix_web::{web, HttpRequest, HttpResponse};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::bootstrap::state::AppState;
use crate::http::middleware::auth::extract_session;
use crate::modules::admin::access::ensure_platform_staff;
use crate::modules::audit::service::{AuditEvent, AuditService};
use crate::shared::error::AppError;
use crate::shared::request_ip::client_ip_string_from_http_request;

#[derive(Serialize)]
struct PlatformSessionPolicyResponse {
    session_duration_days: i64,
    magic_link_expiry_minutes: i64,
    oidc_access_token_ttl_minutes: i64,
    refresh_token_ttl_days: i64,
    idle_timeout_minutes: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateSessionPolicyRequest {
    pub session_duration_days: Option<i64>,
    pub magic_link_expiry_minutes: Option<i64>,
    pub oidc_access_token_ttl_minutes: Option<i64>,
    pub refresh_token_ttl_days: Option<i64>,
    pub idle_timeout_minutes: Option<i64>,
}

#[derive(Serialize)]
struct TenantSessionPolicyResponse {
    session_duration_days: i64,
    magic_link_expiry_minutes: i64,
    idle_timeout_minutes: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateTenantSessionPolicyRequest {
    pub session_duration_days: Option<i64>,
    pub magic_link_expiry_minutes: Option<i64>,
    pub idle_timeout_minutes: Option<i64>,
}

#[derive(Serialize)]
pub struct OrgSessionPolicyResponse {
    platform_session_duration_days: i64,
    platform_magic_link_expiry_minutes: i64,
    platform_oidc_access_token_ttl_minutes: i64,
    platform_refresh_token_ttl_days: i64,
    platform_idle_timeout_minutes: i64,
    session_duration_days: Option<i32>,
    magic_link_expiry_minutes: Option<i32>,
    oidc_access_token_ttl_minutes: Option<i32>,
    refresh_token_ttl_days: Option<i32>,
    idle_timeout_minutes: Option<i32>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateOrgSessionPolicyRequest {
    pub session_duration_days: Option<i32>,
    pub magic_link_expiry_minutes: Option<i32>,
    pub oidc_access_token_ttl_minutes: Option<i32>,
    pub refresh_token_ttl_days: Option<i32>,
    pub idle_timeout_minutes: Option<i32>,
}

async fn load_platform_session_policy(db: &sqlx::PgPool) -> PlatformSessionPolicyResponse {
    async fn get_i64(db: &sqlx::PgPool, key: &str, default: i64) -> i64 {
        sqlx::query_scalar::<_, String>("SELECT value FROM system_settings WHERE key = $1")
            .bind(key)
            .fetch_optional(db)
            .await
            .ok()
            .flatten()
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(default)
    }

    PlatformSessionPolicyResponse {
        session_duration_days: get_i64(db, "session_duration_days", 30).await,
        magic_link_expiry_minutes: get_i64(db, "magic_link_expiry_minutes", 15).await,
        oidc_access_token_ttl_minutes: get_i64(db, "oidc_access_token_ttl_minutes", 60).await,
        refresh_token_ttl_days: get_i64(db, "refresh_token_ttl_days", 30).await,
        idle_timeout_minutes: get_i64(db, "idle_timeout_minutes", 60).await,
    }
}

async fn load_tenant_session_policy(db: &sqlx::PgPool) -> TenantSessionPolicyResponse {
    async fn get_i64(db: &sqlx::PgPool, key: &str, default: i64) -> i64 {
        sqlx::query_scalar::<_, String>("SELECT value FROM system_settings WHERE key = $1")
            .bind(key)
            .fetch_optional(db)
            .await
            .ok()
            .flatten()
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap_or(default)
    }

    TenantSessionPolicyResponse {
        session_duration_days: get_i64(db, "tenant_session_duration_days", 14).await,
        magic_link_expiry_minutes: get_i64(db, "tenant_magic_link_expiry_minutes", 15).await,
        idle_timeout_minutes: get_i64(db, "tenant_idle_timeout_minutes", 30).await,
    }
}

pub async fn get_session_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    Ok(HttpResponse::Ok().json(load_platform_session_policy(&state.db).await))
}

pub async fn update_session_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdateSessionPolicyRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;

    async fn upsert(db: &sqlx::PgPool, key: &str, value: i64) -> Result<(), AppError> {
        sqlx::query(
            "INSERT INTO system_settings (key, value) VALUES ($1, $2::text)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        )
        .bind(key)
        .bind(value)
        .execute(db)
        .await?;
        Ok(())
    }

    if let Some(days) = body.session_duration_days {
        if !(1..=365).contains(&days) {
            return Err(AppError::Validation(
                "session_duration_days must be between 1 and 365".into(),
            ));
        }
        upsert(&state.db, "session_duration_days", days).await?;
    }
    if let Some(mins) = body.magic_link_expiry_minutes {
        if !(1..=1440).contains(&mins) {
            return Err(AppError::Validation(
                "magic_link_expiry_minutes must be between 1 and 1440".into(),
            ));
        }
        upsert(&state.db, "magic_link_expiry_minutes", mins).await?;
    }
    if let Some(mins) = body.oidc_access_token_ttl_minutes {
        if !(5..=1440).contains(&mins) {
            return Err(AppError::Validation(
                "oidc_access_token_ttl_minutes must be between 5 and 1440".into(),
            ));
        }
        upsert(&state.db, "oidc_access_token_ttl_minutes", mins).await?;
    }
    if let Some(days) = body.refresh_token_ttl_days {
        if !(1..=365).contains(&days) {
            return Err(AppError::Validation(
                "refresh_token_ttl_days must be between 1 and 365".into(),
            ));
        }
        upsert(&state.db, "refresh_token_ttl_days", days).await?;
    }
    if let Some(mins) = body.idle_timeout_minutes {
        if !(0..=1440).contains(&mins) {
            return Err(AppError::Validation(
                "idle_timeout_minutes must be between 0 and 1440".into(),
            ));
        }
        upsert(&state.db, "idle_timeout_minutes", mins).await?;
    }

    let actor = extract_session(&req)?;
    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(actor.user_id),
            organization_id: None,
            action: "admin.platform.session_policy.updated".into(),
            target_type: "system_setting".into(),
            target_id: Some("session_policy".into()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "session_duration_days": body.session_duration_days,
                "magic_link_expiry_minutes": body.magic_link_expiry_minutes,
                "oidc_access_token_ttl_minutes": body.oidc_access_token_ttl_minutes,
                "refresh_token_ttl_days": body.refresh_token_ttl_days,
                "idle_timeout_minutes": body.idle_timeout_minutes,
            }),
        })
        .await;

    get_session_policy(req, state).await
}

pub async fn get_tenant_session_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    Ok(HttpResponse::Ok().json(load_tenant_session_policy(&state.db).await))
}

pub async fn update_tenant_session_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdateTenantSessionPolicyRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;

    async fn upsert(db: &sqlx::PgPool, key: &str, value: i64) -> Result<(), AppError> {
        sqlx::query(
            "INSERT INTO system_settings (key, value) VALUES ($1, $2::text)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        )
        .bind(key)
        .bind(value)
        .execute(db)
        .await?;
        Ok(())
    }

    if let Some(days) = body.session_duration_days {
        if !(1..=365).contains(&days) {
            return Err(AppError::Validation(
                "session_duration_days must be between 1 and 365".into(),
            ));
        }
        upsert(&state.db, "tenant_session_duration_days", days).await?;
    }
    if let Some(mins) = body.magic_link_expiry_minutes {
        if !(1..=1440).contains(&mins) {
            return Err(AppError::Validation(
                "magic_link_expiry_minutes must be between 1 and 1440".into(),
            ));
        }
        upsert(&state.db, "tenant_magic_link_expiry_minutes", mins).await?;
    }
    if let Some(mins) = body.idle_timeout_minutes {
        if !(0..=1440).contains(&mins) {
            return Err(AppError::Validation(
                "idle_timeout_minutes must be between 0 and 1440".into(),
            ));
        }
        upsert(&state.db, "tenant_idle_timeout_minutes", mins).await?;
    }

    let actor = extract_session(&req)?;
    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(actor.user_id),
            organization_id: None,
            action: "admin.tenant.session_policy.updated".into(),
            target_type: "system_setting".into(),
            target_id: Some("tenant_session_policy".into()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "session_duration_days": body.session_duration_days,
                "magic_link_expiry_minutes": body.magic_link_expiry_minutes,
                "idle_timeout_minutes": body.idle_timeout_minutes,
            }),
        })
        .await;

    get_tenant_session_policy(req, state).await
}

pub async fn get_org_session_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let org_id = path.into_inner();

    let platform = load_platform_session_policy(&state.db).await;

    let row = sqlx::query!(
        r#"SELECT max_session_age_hours, magic_link_expiry_minutes,
                  oidc_access_token_ttl_minutes, refresh_token_ttl_days, idle_timeout_minutes
           FROM organizations WHERE id = $1"#,
        org_id
    )
    .fetch_optional(&state.db)
    .await?
    .ok_or_else(|| AppError::NotFound("Workspace not found.".into()))?;

    let session_duration_days: Option<i32> = row.max_session_age_hours.map(|h| h / 24);

    Ok(HttpResponse::Ok().json(OrgSessionPolicyResponse {
        platform_session_duration_days: platform.session_duration_days,
        platform_magic_link_expiry_minutes: platform.magic_link_expiry_minutes,
        platform_oidc_access_token_ttl_minutes: platform.oidc_access_token_ttl_minutes,
        platform_refresh_token_ttl_days: platform.refresh_token_ttl_days,
        platform_idle_timeout_minutes: platform.idle_timeout_minutes,
        session_duration_days,
        magic_link_expiry_minutes: row.magic_link_expiry_minutes,
        oidc_access_token_ttl_minutes: row.oidc_access_token_ttl_minutes,
        refresh_token_ttl_days: row.refresh_token_ttl_days,
        idle_timeout_minutes: row.idle_timeout_minutes,
    }))
}

pub async fn update_org_session_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
    body: web::Json<UpdateOrgSessionPolicyRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let org_id = path.into_inner();

    let platform = load_platform_session_policy(&state.db).await;

    if let Some(days) = body.session_duration_days {
        if days < 1 || days as i64 > platform.session_duration_days {
            return Err(AppError::Validation(format!(
                "session_duration_days must be between 1 and {} (platform max)",
                platform.session_duration_days
            )));
        }
    }
    if let Some(mins) = body.magic_link_expiry_minutes {
        if mins < 1 || mins as i64 > platform.magic_link_expiry_minutes {
            return Err(AppError::Validation(format!(
                "magic_link_expiry_minutes must be between 1 and {} (platform max)",
                platform.magic_link_expiry_minutes
            )));
        }
    }
    if let Some(mins) = body.oidc_access_token_ttl_minutes {
        if mins < 5 || mins as i64 > platform.oidc_access_token_ttl_minutes {
            return Err(AppError::Validation(format!(
                "oidc_access_token_ttl_minutes must be between 5 and {} (platform max)",
                platform.oidc_access_token_ttl_minutes
            )));
        }
    }
    if let Some(days) = body.refresh_token_ttl_days {
        if days < 1 || days as i64 > platform.refresh_token_ttl_days {
            return Err(AppError::Validation(format!(
                "refresh_token_ttl_days must be between 1 and {} (platform max)",
                platform.refresh_token_ttl_days
            )));
        }
    }
    if let Some(mins) = body.idle_timeout_minutes {
        if mins < 0
            || (platform.idle_timeout_minutes > 0 && (mins as i64) < platform.idle_timeout_minutes)
        {
            return Err(AppError::Validation(
                "idle_timeout_minutes cannot be more permissive than platform setting".into(),
            ));
        }
    }

    let max_session_age_hours: Option<i32> = body.session_duration_days.map(|d| d * 24);

    sqlx::query!(
        r#"UPDATE organizations SET
            max_session_age_hours          = COALESCE($2, max_session_age_hours),
            magic_link_expiry_minutes      = COALESCE($3, magic_link_expiry_minutes),
            oidc_access_token_ttl_minutes  = COALESCE($4, oidc_access_token_ttl_minutes),
            refresh_token_ttl_days         = COALESCE($5, refresh_token_ttl_days),
            idle_timeout_minutes           = COALESCE($6, idle_timeout_minutes)
           WHERE id = $1"#,
        org_id,
        max_session_age_hours,
        body.magic_link_expiry_minutes,
        body.oidc_access_token_ttl_minutes,
        body.refresh_token_ttl_days,
        body.idle_timeout_minutes,
    )
    .execute(&state.db)
    .await?;

    let actor = extract_session(&req)?;
    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(actor.user_id),
            organization_id: Some(org_id),
            action: "admin.workspace.session_policy.updated".into(),
            target_type: "organization".into(),
            target_id: Some(org_id.to_string()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "session_duration_days": body.session_duration_days,
                "magic_link_expiry_minutes": body.magic_link_expiry_minutes,
                "oidc_access_token_ttl_minutes": body.oidc_access_token_ttl_minutes,
                "refresh_token_ttl_days": body.refresh_token_ttl_days,
                "idle_timeout_minutes": body.idle_timeout_minutes,
            }),
        })
        .await;

    get_org_session_policy(req, state, web::Path::from(org_id)).await
}
