use actix_web::{web, HttpRequest, HttpResponse};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::bootstrap::state::AppState;
use crate::http::middleware::auth::extract_session;
use crate::modules::admin::access::ensure_platform_staff;
use crate::modules::audit::service::{AuditEvent, AuditService};
use crate::shared::error::AppError;
use crate::shared::request_ip::client_ip_string_from_http_request;

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RiskPolicyResponse {
    pub enabled: bool,
    pub new_ip_enabled: bool,
    pub new_ip_lookback: i64,
    pub rapid_ip_change_enabled: bool,
    pub rapid_ip_change_window_minutes: i64,
    pub new_user_agent_enabled: bool,
    pub new_user_agent_lookback: i64,
    pub operator_email_enabled: bool,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateRiskPolicyRequest {
    pub enabled: Option<bool>,
    pub new_ip_enabled: Option<bool>,
    pub new_ip_lookback: Option<i64>,
    pub rapid_ip_change_enabled: Option<bool>,
    pub rapid_ip_change_window_minutes: Option<i64>,
    pub new_user_agent_enabled: Option<bool>,
    pub new_user_agent_lookback: Option<i64>,
    pub operator_email_enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct SecurityAlertReviewItem {
    pub alert_key: String,
    pub reviewed_by_user_id: Option<Uuid>,
    pub reviewed_by_display_name: Option<String>,
    pub reviewed_by_email: Option<String>,
    pub reviewed_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct MarkSecurityAlertReviewRequest {
    pub alert_key: String,
}

pub async fn get_risk_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
    let policy = crate::shared::risk::load_policy(&state.db).await;
    Ok(HttpResponse::Ok().json(RiskPolicyResponse {
        enabled: policy.enabled,
        new_ip_enabled: policy.new_ip_enabled,
        new_ip_lookback: policy.new_ip_lookback,
        rapid_ip_change_enabled: policy.rapid_ip_change_enabled,
        rapid_ip_change_window_minutes: policy.rapid_ip_change_window_minutes,
        new_user_agent_enabled: policy.new_user_agent_enabled,
        new_user_agent_lookback: policy.new_user_agent_lookback,
        operator_email_enabled: policy.operator_email_enabled,
    }))
}

pub async fn update_risk_policy(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<UpdateRiskPolicyRequest>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;

    async fn upsert_bool(db: &sqlx::PgPool, key: &str, value: bool) -> Result<(), AppError> {
        sqlx::query(
            "INSERT INTO system_settings (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
        )
        .bind(key)
        .bind(if value { "1" } else { "0" })
        .execute(db)
        .await?;
        Ok(())
    }

    async fn upsert_i64(db: &sqlx::PgPool, key: &str, value: i64) -> Result<(), AppError> {
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

    if let Some(v) = body.enabled {
        upsert_bool(&state.db, "risk_enabled", v).await?;
    }
    if let Some(v) = body.new_ip_enabled {
        upsert_bool(&state.db, "risk_new_ip_enabled", v).await?;
    }
    if let Some(v) = body.new_ip_lookback {
        if !(1..=100).contains(&v) {
            return Err(AppError::Validation("new_ip_lookback must be 1–100".into()));
        }
        upsert_i64(&state.db, "risk_new_ip_lookback", v).await?;
    }
    if let Some(v) = body.rapid_ip_change_enabled {
        upsert_bool(&state.db, "risk_rapid_ip_change_enabled", v).await?;
    }
    if let Some(v) = body.rapid_ip_change_window_minutes {
        if !(1..=1440).contains(&v) {
            return Err(AppError::Validation(
                "rapid_ip_change_window_minutes must be 1–1440".into(),
            ));
        }
        upsert_i64(&state.db, "risk_rapid_ip_change_window_minutes", v).await?;
    }
    if let Some(v) = body.new_user_agent_enabled {
        upsert_bool(&state.db, "risk_new_user_agent_enabled", v).await?;
    }
    if let Some(v) = body.new_user_agent_lookback {
        if !(1..=100).contains(&v) {
            return Err(AppError::Validation(
                "new_user_agent_lookback must be 1–100".into(),
            ));
        }
        upsert_i64(&state.db, "risk_new_user_agent_lookback", v).await?;
    }
    if let Some(v) = body.operator_email_enabled {
        upsert_bool(&state.db, "risk_operator_email_enabled", v).await?;
    }

    let actor = extract_session(&req)?;
    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(actor.user_id),
            organization_id: None,
            action: "admin.platform.risk_policy.updated".into(),
            target_type: "system_setting".into(),
            target_id: Some("risk_policy".into()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req
                .headers()
                .get("user-agent")
                .and_then(|h| h.to_str().ok())
                .map(String::from),
            metadata: serde_json::json!({
                "enabled": body.enabled,
                "new_ip_enabled": body.new_ip_enabled,
                "new_ip_lookback": body.new_ip_lookback,
                "rapid_ip_change_enabled": body.rapid_ip_change_enabled,
                "rapid_ip_change_window_minutes": body.rapid_ip_change_window_minutes,
                "new_user_agent_enabled": body.new_user_agent_enabled,
                "new_user_agent_lookback": body.new_user_agent_lookback,
                "operator_email_enabled": body.operator_email_enabled,
            }),
        })
        .await;

    get_risk_policy(req, state).await
}

pub async fn list_platform_security_alert_reviews(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    ensure_platform_staff(&req, &state).await?;
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
        WHERE sar.scope_type = 'platform' AND sar.scope_id IS NULL
        ORDER BY sar.reviewed_at DESC
        "#,
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Failed to load platform security alert reviews: {}",
            e
        ))
    })?;
    Ok(HttpResponse::Ok().json(serde_json::json!({ "items": items })))
}

pub async fn mark_platform_security_alert_reviewed(
    req: HttpRequest,
    state: web::Data<AppState>,
    body: web::Json<MarkSecurityAlertReviewRequest>,
) -> Result<HttpResponse, AppError> {
    let session = extract_session(&req)?;
    ensure_platform_staff(&req, &state).await?;
    let alert_key = body.alert_key.trim();
    if alert_key.is_empty() {
        return Err(AppError::Validation("alert_key is required.".into()));
    }

    sqlx::query(
        r#"
        INSERT INTO security_alert_reviews (scope_type, scope_id, alert_key, reviewed_by_user_id, reviewed_at)
        VALUES ('platform', NULL, $1, $2, NOW())
        ON CONFLICT (scope_type, scope_id, alert_key)
        DO UPDATE SET reviewed_by_user_id = EXCLUDED.reviewed_by_user_id, reviewed_at = NOW()
        "#,
    )
    .bind(alert_key)
    .bind(session.user_id)
    .execute(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to mark platform security alert as reviewed: {}", e)))?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(session.user_id),
            organization_id: None,
            action: "admin.security_alert.reviewed".into(),
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

pub async fn reset_platform_security_alert_reviews(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let actor = extract_session(&req)?;
    ensure_platform_staff(&req, &state).await?;
    sqlx::query(
        "DELETE FROM security_alert_reviews WHERE scope_type = 'platform' AND scope_id IS NULL",
    )
    .execute(&state.db)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Failed to reset platform security alert reviews: {}",
            e
        ))
    })?;

    AuditService::new(state.db.clone())
        .log(AuditEvent {
            actor_user_id: Some(actor.user_id),
            organization_id: None,
            action: "admin.security_alert.reviews_reset".into(),
            target_type: "security_alert".into(),
            target_id: None,
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
