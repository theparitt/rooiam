use std::future::{ready, Ready};

use actix_web::dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform};
use actix_web::http::header::{HeaderName, HeaderValue};
use actix_web::Error;
use futures_util::future::LocalBoxFuture;

/// Middleware that injects standard security headers on every response.
pub struct SecurityHeaders;

impl<S, B> Transform<S, ServiceRequest> for SecurityHeaders
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type InitError = ();
    type Transform = SecurityHeadersMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ready(Ok(SecurityHeadersMiddleware { service }))
    }
}

pub struct SecurityHeadersMiddleware<S> {
    service: S,
}

impl<S, B> Service<ServiceRequest> for SecurityHeadersMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let request_path = req.path().to_string();
        let fut = self.service.call(req);

        Box::pin(async move {
            let mut res = fut.await?;
            let headers = res.headers_mut();

            // Determine content type first — used to choose per-type header values.
            let is_html = headers
                .get(actix_web::http::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|v| v.starts_with("text/html"))
                .unwrap_or(false);

            // Prevent browsers from sniffing the content type
            headers.insert(
                HeaderName::from_static("x-content-type-options"),
                HeaderValue::from_static("nosniff"),
            );

            // X-Frame-Options: applied only to non-HTML responses (API/JSON).
            // HTML pages (demo OAuth, email verify) are navigated to as top-level
            // pages; frame-ancestors in the CSP provides clickjacking protection.
            if !is_html {
                headers.insert(
                    HeaderName::from_static("x-frame-options"),
                    HeaderValue::from_static("DENY"),
                );
            }

            // Force HTTPS for 1 year, including subdomains
            headers.insert(
                HeaderName::from_static("strict-transport-security"),
                HeaderValue::from_static("max-age=31536000; includeSubDomains"),
            );

            // Don't send the Referer header when navigating away
            headers.insert(
                HeaderName::from_static("referrer-policy"),
                HeaderValue::from_static("strict-origin-when-cross-origin"),
            );

            // CSP: choose policy based on response content type.

            let csp = if is_html {
                // Relaxed: allow self-origin scripts/styles, Google Fonts.
                // form-action is omitted — the demo OAuth form posts to the same
                // origin and some browser/frame contexts mis-resolve 'self'.
                // /login-widget may set its own dynamic CSP earlier in the handler.
                let _ = request_path;
                "default-src 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: http: https:; frame-ancestors 'none'"
            } else {
                // Strict: API responses should never render content in a browser
                "default-src 'none'; frame-ancestors 'none'"
            };
            let csp_header = HeaderName::from_static("content-security-policy");
            if !headers.contains_key(&csp_header) {
                headers.insert(
                    csp_header,
                    HeaderValue::from_str(csp)
                        .unwrap_or(HeaderValue::from_static("default-src 'none'")),
                );
            }

            // Disable FLoC / Topics API
            headers.insert(
                HeaderName::from_static("permissions-policy"),
                HeaderValue::from_static("interest-cohort=()"),
            );

            Ok(res)
        })
    }
}
