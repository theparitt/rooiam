use std::collections::HashSet;
use std::future::{ready, Ready};

use actix_web::body::EitherBody;
use actix_web::dev::{forward_ready, Service, ServiceRequest, ServiceResponse, Transform};
use actix_web::{Error, HttpResponse};
use futures_util::future::LocalBoxFuture;
use url::form_urlencoded;





pub struct ParameterGuard;



impl<S, B> Transform<S, ServiceRequest> for ParameterGuard
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type InitError = ();
    type Transform = ParameterGuardMiddleware<S>;
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future
    {
        ready(Ok(ParameterGuardMiddleware { service }))
    }
}



pub struct ParameterGuardMiddleware<S>
{
    service: S,
}



impl<S, B> Service<ServiceRequest> for ParameterGuardMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error>,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<EitherBody<B>>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    forward_ready!(service);

    fn call(&self, req: ServiceRequest) -> Self::Future
    {
        if let Err(reason) = validate_query_string(req.query_string()) {
            tracing::warn!(
                method = %req.method(),
                path = %req.path(),
                query = %req.query_string(),
                error = %reason,
                "request parameter guard rejected"
            );

            let response = HttpResponse::BadRequest()
                .json(serde_json::json!({
                    "error": {
                        "message": format!("Invalid query parameters: {}", reason)
                    }
                }))
                .map_into_right_body();

            return Box::pin(async move {
                Ok(req.into_response(response))
            });
        }

        let fut = self.service.call(req);

        Box::pin(async move {
            fut.await.map(ServiceResponse::map_into_left_body)
        })
    }
}



fn validate_query_string(query: &str) -> Result<(), String>
{
    if query.is_empty() {
        return Ok(());
    }

    if query.len() > 4096 {
        return Err("query string is too long".into());
    }

    let mut keys = HashSet::new();
    let mut count = 0usize;

    for (key, value) in form_urlencoded::parse(query.as_bytes()) {
        count += 1;
        if count > 64 {
            return Err("too many query parameters".into());
        }

        let key = key.to_string();
        if key.trim().is_empty() {
            return Err("empty query parameter names are not allowed".into());
        }

        if key.len() > 64 {
            return Err(format!("query parameter '{}' is too long", key));
        }

        if key.contains('[') || key.contains(']') {
            return Err(format!("query parameter '{}' uses unsupported bracket syntax", key));
        }

        if !key.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.')) {
            return Err(format!("query parameter '{}' contains unsupported characters", key));
        }

        if !keys.insert(key.clone()) {
            return Err(format!("duplicate query parameter '{}' is not allowed", key));
        }

        if value.len() > 2048 {
            return Err(format!("query parameter '{}' value is too long", key));
        }

        if value.chars().any(|c| c.is_control()) {
            return Err(format!("query parameter '{}' contains control characters", key));
        }
    }

    Ok(())
}
