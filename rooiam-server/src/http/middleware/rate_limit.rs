use actix_web::{
    dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform},
    Error,
};
use futures_util::future::LocalBoxFuture;
use std::future::{ready, Ready};

use crate::bootstrap::state::AppState;
use crate::shared::error::AppError;
use crate::shared::request_ip::client_ip_string_from_service_request;

/// How the rate-limit key is constructed.
///
/// - `PerEndpoint`  — separate counter per (IP, method, path).
///   Good for individual sensitive endpoints (magic-link send, MFA verify).
/// - `GlobalPerIp`  — single counter per IP across the whole scope.
///   Good for catching spray attacks that rotate across many endpoints.
#[derive(Clone, Copy)]
pub enum RateLimitKeyMode {
    PerEndpoint,
    GlobalPerIp { scope: &'static str },
}

/// Middleware factory for rate limiting.
pub struct RateLimit {
    pub max_requests: u64,
    pub window_seconds: u64,
    pub key_mode: RateLimitKeyMode,
}

impl RateLimit {
    /// Per-endpoint limit — separate counter for each (IP, method, path).
    pub fn per_endpoint(max_requests: u64, window_seconds: u64) -> Self {
        Self {
            max_requests,
            window_seconds,
            key_mode: RateLimitKeyMode::PerEndpoint,
        }
    }

    /// Global per-IP limit — one counter across all endpoints in this scope.
    pub fn global_per_ip(scope: &'static str, max_requests: u64, window_seconds: u64) -> Self {
        Self {
            max_requests,
            window_seconds,
            key_mode: RateLimitKeyMode::GlobalPerIp { scope },
        }
    }

    /// Backwards-compatible constructor — behaves as `per_endpoint`.
    pub fn new(max_requests: u64, window_seconds: u64) -> Self {
        Self::per_endpoint(max_requests, window_seconds)
    }
}

/// Pure function for key construction — extracted for testability.
pub fn build_rate_limit_key(mode: RateLimitKeyMode, ip: &str, method: &str, path: &str) -> String {
    match mode {
        RateLimitKeyMode::PerEndpoint => format!("rl:ep:{}:{}:{}", ip, method, path),
        RateLimitKeyMode::GlobalPerIp { scope } => format!("rl:gip:{}:{}", scope, ip),
    }
}

impl<S, B> Transform<S, ServiceRequest> for RateLimit
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = RateLimitMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(RateLimitMiddleware {
            service,
            max_requests: self.max_requests,
            window_seconds: self.window_seconds,
            key_mode: self.key_mode,
        }))
    }
}

pub struct RateLimitMiddleware<S> {
    service: S,
    max_requests: u64,
    window_seconds: u64,
    key_mode: RateLimitKeyMode,
}

impl<S, B> Service<ServiceRequest> for RateLimitMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let max_requests = self.max_requests;
        let window_seconds = self.window_seconds;
        let key_mode = self.key_mode;

        let app_state = req.app_data::<actix_web::web::Data<AppState>>().cloned();
        let client_ip = app_state
            .as_ref()
            .and_then(|state| client_ip_string_from_service_request(&req, state.config.as_ref()))
            .unwrap_or_else(|| "unknown".to_string());

        let key = build_rate_limit_key(key_mode, &client_ip, req.method().as_str(), req.path());

        let srv = &self.service;
        let fut = srv.call(req);

        Box::pin(async move {
            if let Some(state) = app_state {
                let mut redis_conn = state.redis.clone();

                // Atomic fixed-window counter via Lua
                let script = redis::Script::new(
                    r#"
                    local current = redis.call("INCR", KEYS[1])
                    if tonumber(current) == 1 then
                        redis.call("EXPIRE", KEYS[1], ARGV[1])
                    end
                    return current
                    "#
                );

                match script
                    .key(&key)
                    .arg(window_seconds)
                    .invoke_async::<u64>(&mut redis_conn)
                    .await
                {
                    Ok(count) if count > max_requests => {
                        return Err(AppError::RateLimited.into());
                    }
                    Err(e) => {
                        // Fail open — if Redis is unavailable don't block the user,
                        // but log so ops can detect Redis issues quickly.
                        tracing::warn!("Rate limit Redis error (key={}): {}", key, e);
                    }
                    _ => {}
                }
            } else {
                tracing::warn!("AppState not found in RateLimit middleware");
            }

            fut.await
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Key construction ──────────────────────────────────────────────────

    #[test]
    fn per_endpoint_key_includes_method_and_path() {
        let key = build_rate_limit_key(
            RateLimitKeyMode::PerEndpoint,
            "1.2.3.4", "POST", "/v1/auth/send",
        );
        assert_eq!(key, "rl:ep:1.2.3.4:POST:/v1/auth/send");
    }

    #[test]
    fn per_endpoint_different_paths_produce_different_keys() {
        let k1 = build_rate_limit_key(RateLimitKeyMode::PerEndpoint, "1.2.3.4", "POST", "/v1/auth/send");
        let k2 = build_rate_limit_key(RateLimitKeyMode::PerEndpoint, "1.2.3.4", "POST", "/v1/auth/verify");
        assert_ne!(k1, k2, "Different paths must produce different per-endpoint keys");
    }

    #[test]
    fn global_per_ip_key_ignores_method_and_path() {
        let k1 = build_rate_limit_key(RateLimitKeyMode::GlobalPerIp { scope: "auth" }, "1.2.3.4", "POST", "/v1/auth/send");
        let k2 = build_rate_limit_key(RateLimitKeyMode::GlobalPerIp { scope: "auth" }, "1.2.3.4", "GET",  "/v1/auth/other");
        assert_eq!(k1, k2, "Global per-IP key must be same regardless of method/path");
    }

    #[test]
    fn global_per_ip_different_ips_produce_different_keys() {
        let k1 = build_rate_limit_key(RateLimitKeyMode::GlobalPerIp { scope: "auth" }, "1.2.3.4", "POST", "/");
        let k2 = build_rate_limit_key(RateLimitKeyMode::GlobalPerIp { scope: "auth" }, "5.6.7.8", "POST", "/");
        assert_ne!(k1, k2);
    }

    #[test]
    fn global_per_ip_different_scopes_produce_different_keys() {
        let k1 = build_rate_limit_key(RateLimitKeyMode::GlobalPerIp { scope: "auth" },    "1.2.3.4", "POST", "/");
        let k2 = build_rate_limit_key(RateLimitKeyMode::GlobalPerIp { scope: "webauthn" }, "1.2.3.4", "POST", "/");
        assert_ne!(k1, k2, "Different scopes must not share counters");
    }

    // ── Constructor aliases ───────────────────────────────────────────────

    #[test]
    fn new_is_per_endpoint() {
        let rl = RateLimit::new(10, 60);
        assert!(matches!(rl.key_mode, RateLimitKeyMode::PerEndpoint));
        assert_eq!(rl.max_requests, 10);
        assert_eq!(rl.window_seconds, 60);
    }

    #[test]
    fn per_endpoint_constructor() {
        let rl = RateLimit::per_endpoint(20, 30);
        assert!(matches!(rl.key_mode, RateLimitKeyMode::PerEndpoint));
        assert_eq!(rl.max_requests, 20);
    }

    #[test]
    fn global_per_ip_constructor() {
        let rl = RateLimit::global_per_ip("mfa", 5, 60);
        assert!(matches!(rl.key_mode, RateLimitKeyMode::GlobalPerIp { scope: "mfa" }));
        assert_eq!(rl.max_requests, 5);
    }
}
