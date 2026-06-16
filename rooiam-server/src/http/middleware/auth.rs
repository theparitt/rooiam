use actix_web::{
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    http::header,
    Error as ActixError, HttpMessage,
};
use std::future::{ready, Future, Ready};
use std::pin::Pin;
use std::rc::Rc;

use crate::bootstrap::state::AppState;
use crate::modules::audit::service::{AuditEvent, AuditService};
use crate::modules::organization::repository::OrganizationRepository;
use crate::modules::session::{
    cookie::ROOIAM_SESSION_COOKIE, repository::SessionRepository, service::SessionService,
};
use crate::shared::error::AppError;
use crate::shared::ip_policy::{
    access_denied_message, evaluate_ip_access, resolve_effective_ip_policy_for_user,
    IpAccessDecision,
};
use crate::shared::request_ip::client_ip_from_service_request;
use crate::shared::request_ip::client_ip_string_from_service_request;
use actix_web::ResponseError;

pub struct RequireAuth;

impl<S, B> Transform<S, ServiceRequest> for RequireAuth
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = ActixError> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<actix_web::body::EitherBody<B>>;
    type Error = ActixError;
    type InitError = ();
    type Transform = RequireAuthMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(RequireAuthMiddleware {
            service: Rc::new(service),
        }))
    }
}

pub struct RequireAuthMiddleware<S> {
    service: Rc<S>,
}

fn duplicate_session_cookie_count(req: &ServiceRequest) -> usize {
    req.headers()
        .get(header::COOKIE)
        .and_then(|value| value.to_str().ok())
        .map(|raw| {
            raw.split(';')
                .filter_map(|part| part.trim().split_once('='))
                .filter(|(name, _)| name.trim() == ROOIAM_SESSION_COOKIE)
                .count()
        })
        .unwrap_or(0)
}

fn log_cookie_conflict_if_present(req: &ServiceRequest) {
    let cookie_count = duplicate_session_cookie_count(req);
    if cookie_count > 1 {
        tracing::warn!(
            category = "auth_cookie_conflict",
            marker = "X",
            cookie_name = ROOIAM_SESSION_COOKIE,
            cookie_count,
            method = %req.method(),
            path = %req.path(),
            host = req.connection_info().host(),
            "Multiple rooiam_sid cookies received; likely stale cookie collision. Clear rooiam_sid cookies for rooiam.com and its subdomains."
        );
    }
}

impl<S, B> Service<ServiceRequest> for RequireAuthMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = ActixError> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<actix_web::body::EitherBody<B>>;
    type Error = ActixError;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>>>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let srv = Rc::clone(&self.service);

        Box::pin(async move {
            // Extract AppState to get DB pool
            let app_state = match req.app_data::<actix_web::web::Data<AppState>>() {
                Some(st) => st,
                None => {
                    return Ok(req.into_response(
                        AppError::Internal("AppState not found".to_string())
                            .error_response()
                            .map_into_right_body(),
                    ));
                }
            };

            // Read session cookie
            let session_cookie = match req.cookie(ROOIAM_SESSION_COOKIE) {
                Some(cookie) => cookie,
                None => {
                    log_cookie_conflict_if_present(&req);
                    return Ok(req.into_response(
                        AppError::Unauthorized
                            .error_response()
                            .map_into_right_body(),
                    ));
                }
            };

            let token_string = session_cookie.value();

            let session_repo = SessionRepository::new(app_state.db.clone());
            let session_service = SessionService::new(session_repo.clone(), app_state.db.clone());

            match session_service.verify_opaque_session(token_string).await {
                Ok(active_session) => {
                    // Cap User-Agent length to prevent excessive storage in audit logs
                    let user_agent = req
                        .headers()
                        .get("user-agent")
                        .and_then(|h| h.to_str().ok())
                        .map(|ua| &ua[..ua.len().min(512)]);
                    let ip = client_ip_from_service_request(&req, app_state.config.as_ref());
                    let ip_string =
                        client_ip_string_from_service_request(&req, app_state.config.as_ref());

                    match evaluate_ip_access(
                        &resolve_effective_ip_policy_for_user(
                            &app_state.db,
                            active_session.is_superuser,
                            active_session.current_org_id,
                        )
                        .await?,
                        ip,
                    )? {
                        IpAccessDecision::Allowed => {}
                        decision => {
                            AuditService::new(app_state.db.clone())
                                .log(AuditEvent {
                                    actor_user_id: Some(active_session.user_id),
                                    organization_id: active_session.current_org_id,
                                    action: "auth.ip_policy.blocked".into(),
                                    target_type: "ip_policy".into(),
                                    target_id: None,
                                    ip: ip_string,
                                    user_agent: user_agent.map(String::from),
                                    metadata: serde_json::json!({
                                        "reason": match &decision {
                                            IpAccessDecision::Blocked { reason, .. } => reason,
                                            IpAccessDecision::Allowed => "allowed",
                                        },
                                        "current_org_id": active_session.current_org_id,
                                    }),
                                })
                                .await;

                            return Ok(req.into_response(
                                AppError::Forbidden(access_denied_message(&decision).into())
                                    .error_response()
                                    .map_into_right_body(),
                            ));
                        }
                    }

                    // Enforce session idle timeout by login surface / policy domain.
                    if matches!(active_session.login_surface.as_deref(), Some("tenant")) {
                        let effective_idle_mins: i64 = sqlx::query_scalar::<_, i64>(
                            "SELECT value::bigint FROM system_settings WHERE key = 'tenant_idle_timeout_minutes'"
                        )
                        .fetch_optional(&app_state.db)
                        .await
                        .unwrap_or_else(|e| { tracing::warn!("Failed to read tenant_idle_timeout_minutes: {e}"); None })
                        .unwrap_or(0);

                        if effective_idle_mins > 0 {
                            let idle = chrono::Utc::now() - active_session.last_seen_at;
                            if idle.num_minutes() >= effective_idle_mins {
                                let _ =
                                    session_repo.revoke_session(active_session.session_id).await;
                                log_cookie_conflict_if_present(&req);
                                return Ok(req.into_response(
                                    AppError::Unauthorized
                                        .error_response()
                                        .map_into_right_body(),
                                ));
                            }
                        }
                    } else if active_session.is_superuser {
                        let effective_idle_mins: i64 = sqlx::query_scalar::<_, i64>(
                            "SELECT value::bigint FROM system_settings WHERE key = 'idle_timeout_minutes'"
                        )
                        .fetch_optional(&app_state.db)
                        .await
                        .unwrap_or_else(|e| { tracing::warn!("Failed to read idle_timeout_minutes: {e}"); None })
                        .unwrap_or(0);

                        if effective_idle_mins > 0 {
                            let idle = chrono::Utc::now() - active_session.last_seen_at;
                            if idle.num_minutes() >= effective_idle_mins {
                                let _ =
                                    session_repo.revoke_session(active_session.session_id).await;
                                log_cookie_conflict_if_present(&req);
                                return Ok(req.into_response(
                                    AppError::Unauthorized
                                        .error_response()
                                        .map_into_right_body(),
                                ));
                            }
                        }
                    } else if let Some(org_id) = active_session.current_org_id {
                        if let Ok(Some(org)) = OrganizationRepository::new(app_state.db.clone())
                            .get_organization_by_id(org_id)
                            .await
                        {
                            let now = chrono::Utc::now();

                            // Absolute session age cap (max_session_age_hours)
                            if let Some(max_hours) = org.max_session_age_hours {
                                let age = now - active_session.created_at;
                                if age.num_hours() >= i64::from(max_hours) {
                                    let _ = session_repo
                                        .revoke_session(active_session.session_id)
                                        .await;
                                    log_cookie_conflict_if_present(&req);
                                    return Ok(req.into_response(
                                        AppError::Unauthorized
                                            .error_response()
                                            .map_into_right_body(),
                                    ));
                                }
                            }

                            // Idle timeout — org override first, then platform default
                            let idle_mins: i64 = org
                                .idle_timeout_minutes
                                .map(|v| v as i64)
                                .unwrap_or_else(|| {
                                    // fallback: read platform setting (fire-and-forget, default 0 = disabled)
                                    0 // will be overridden below via platform query
                                });

                            // Fetch platform idle timeout (org override takes priority if set)
                            let effective_idle_mins: i64 = if org.idle_timeout_minutes.is_some() {
                                idle_mins
                            } else {
                                sqlx::query_scalar::<_, i64>(
                                    "SELECT value::bigint FROM system_settings WHERE key = 'idle_timeout_minutes'"
                                )
                                .fetch_optional(&app_state.db)
                                .await
                                .unwrap_or_else(|e| { tracing::warn!("Failed to read idle_timeout_minutes: {e}"); None })
                                .unwrap_or(0)
                            };

                            if effective_idle_mins > 0 {
                                let idle = now - active_session.last_seen_at;
                                if idle.num_minutes() >= effective_idle_mins {
                                    let _ = session_repo
                                        .revoke_session(active_session.session_id)
                                        .await;
                                    log_cookie_conflict_if_present(&req);
                                    return Ok(req.into_response(
                                        AppError::Unauthorized
                                            .error_response()
                                            .map_into_right_body(),
                                    ));
                                }
                            }
                        }
                    }

                    // Session binding: detect device-class / subnet changes
                    if let Some(stored_fp) = &active_session.session_fingerprint {
                        let current_fp =
                            crate::shared::session_fingerprint::compute(user_agent, ip);
                        if &current_fp != stored_fp {
                            AuditService::new(app_state.db.clone())
                                .log(AuditEvent {
                                    actor_user_id: Some(active_session.user_id),
                                    organization_id: active_session.current_org_id,
                                    action: "auth.session.binding_mismatch".into(),
                                    target_type: "session".into(),
                                    target_id: Some(active_session.session_id.to_string()),
                                    ip: ip_string.clone(),
                                    user_agent: user_agent.map(String::from),
                                    metadata: serde_json::json!({
                                        "session_id": active_session.session_id,
                                    }),
                                })
                                .await;
                        }
                    }

                    let _ = session_repo
                        .touch_session(active_session.session_id, user_agent, ip)
                        .await;

                    // Inject ActiveSession into request extensions
                    req.extensions_mut().insert(active_session);

                    let res = srv.call(req).await?;
                    Ok(res.map_into_left_body())
                }
                Err(_) => {
                    // Invalid or expired session
                    log_cookie_conflict_if_present(&req);
                    Ok(req.into_response(
                        AppError::Unauthorized
                            .error_response()
                            .map_into_right_body(),
                    ))
                }
            }
        })
    }
}

// Extractor helper to get session in handlers
pub fn extract_session(
    req: &actix_web::HttpRequest,
) -> Result<crate::modules::session::models::ActiveSession, AppError> {
    req.extensions()
        .get::<crate::modules::session::models::ActiveSession>()
        .cloned()
        .ok_or(AppError::Unauthorized)
}
