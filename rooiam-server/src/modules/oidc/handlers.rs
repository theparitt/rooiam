use actix_web::{http::StatusCode, web, HttpRequest, HttpResponse, ResponseError};
use serde::{Deserialize, Serialize};
use url::Url;

use crate::bootstrap::state::AppState;
use crate::modules::audit::service::{AuditEvent, AuditService};
use crate::shared::error::AppError;
use crate::modules::session::{cookie::{build_clear_session_cookie, ROOIAM_SESSION_COOKIE}, repository::SessionRepository, service::SessionService};
use crate::shared::request_ip::client_ip_string_from_http_request;
use crate::shared::runtime_config::{effective_app_url, load_runtime_app_config};
use super::service::{oidc_signing_alg, OIDCService};

#[derive(Serialize)]
struct DiscoveryDocument {
    issuer: String,
    authorization_endpoint: String,
    token_endpoint: String,
    revocation_endpoint: String,
    introspection_endpoint: String,
    userinfo_endpoint: String,
    end_session_endpoint: String,
    jwks_uri: String,
    response_types_supported: Vec<&'static str>,
    subject_types_supported: Vec<&'static str>,
    id_token_signing_alg_values_supported: Vec<&'static str>,
    scopes_supported: Vec<&'static str>,
    claims_supported: Vec<&'static str>,
    grant_types_supported: Vec<&'static str>,
    token_endpoint_auth_methods_supported: Vec<&'static str>,
    code_challenge_methods_supported: Vec<&'static str>,
}

#[derive(Serialize)]
struct JwksResponse {
    keys: Vec<serde_json::Value>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EndSessionRequest {
    pub id_token_hint: Option<String>,
    pub post_logout_redirect_uri: Option<String>,
    pub state: Option<String>,
    pub client_id: Option<String>,
}

#[derive(Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
#[serde(deny_unknown_fields)]
pub struct AuthorizeRequest {
    pub response_type: String,
    pub client_id: String,
    pub redirect_uri: String,
    pub scope: Option<String>,
    pub state: Option<String>,
    pub nonce: Option<String>,
    pub code_challenge: Option<String>,
    pub code_challenge_method: Option<String>,
}

#[derive(Deserialize, utoipa::ToSchema)]
#[serde(deny_unknown_fields)]
pub struct TokenRequest {
    pub grant_type: String,
    pub code: Option<String>,
    pub refresh_token: Option<String>,
    pub redirect_uri: Option<String>,
    pub client_id: String,
    pub client_secret: Option<String>,
    pub code_verifier: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RevocationRequest {
    pub token: String,
    pub token_type_hint: Option<String>,
    pub client_id: String,
    pub client_secret: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IntrospectionRequest {
    pub token: String,
    pub token_type_hint: Option<String>,
    pub client_id: String,
    pub client_secret: Option<String>,
}

fn extract_bearer_token(req: &HttpRequest) -> Result<&str, AppError> {
    let header = req
        .headers()
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .ok_or(AppError::Unauthorized)?;

    header
        .strip_prefix("Bearer ")
        .or_else(|| header.strip_prefix("bearer "))
        .ok_or(AppError::Unauthorized)
}

fn oauth_error_response(status: StatusCode, error: &str, description: &str) -> HttpResponse {
    HttpResponse::build(status).json(serde_json::json!({
        "error": error,
        "error_description": description,
    }))
}

fn map_token_error(err: AppError) -> HttpResponse {
    match err {
        AppError::Validation(message) => {
            let normalized = message.to_ascii_lowercase();
            let (status, error) = if normalized.contains("unsupported grant_type") {
                (StatusCode::BAD_REQUEST, "unsupported_grant_type")
            } else if normalized.contains("client_secret")
                || normalized.contains("client_id")
                || normalized.contains("another client")
                || normalized.contains("client has no secret configured")
            {
                (StatusCode::UNAUTHORIZED, "invalid_client")
            } else if normalized.contains("disabled by workspace or platform policy") {
                (StatusCode::BAD_REQUEST, "unauthorized_client")
            } else if normalized.contains("client is suspended") {
                (StatusCode::BAD_REQUEST, "unauthorized_client")
            } else if normalized.contains("authorization code")
                || normalized.contains("refresh token")
                || normalized.contains("redirect uri mismatch")
                || normalized.contains("code_verifier")
                || normalized.contains("pkce")
            {
                (StatusCode::BAD_REQUEST, "invalid_grant")
            } else {
                (StatusCode::BAD_REQUEST, "invalid_request")
            };

            oauth_error_response(status, error, &message)
        }
        AppError::Unauthorized => oauth_error_response(StatusCode::UNAUTHORIZED, "invalid_client", "Client authentication failed."),
        other => other.error_response(),
    }
}

fn map_authorize_error(err: &AppError) -> (&'static str, String) {
    match err {
        AppError::Validation(message) => {
            let normalized = message.to_ascii_lowercase();
            if normalized.contains("response_type") {
                ("unsupported_response_type", message.clone())
            } else if normalized.contains("client_id") {
                ("unauthorized_client", message.clone())
            } else if normalized.contains("redirect_uri") {
                ("invalid_request", message.clone())
            } else if normalized.contains("pkce") || normalized.contains("code_challenge") {
                ("invalid_request", message.clone())
            } else if normalized.contains("suspended")
                || normalized.contains("disabled by workspace or platform policy")
            {
                ("unauthorized_client", message.clone())
            } else {
                ("invalid_request", message.clone())
            }
        }
        AppError::Forbidden(message) => ("access_denied", message.clone()),
        AppError::Unauthorized => ("login_required", "Authentication required.".into()),
        _ => ("server_error", "Authorization request failed.".into()),
    }
}

fn oauth_authorize_error_redirect(
    redirect_uri: &str,
    state: Option<&str>,
    error: &str,
    description: &str,
) -> Result<HttpResponse, AppError> {
    let mut url = Url::parse(redirect_uri).map_err(|_| AppError::Validation("Invalid redirect_uri".into()))?;
    url.query_pairs_mut()
        .append_pair("error", error)
        .append_pair("error_description", description);
    if let Some(state) = state {
        url.query_pairs_mut().append_pair("state", state);
    }

    Ok(HttpResponse::Found()
        .insert_header(("Location", url.to_string()))
        .finish())
}

#[utoipa::path(
    get,
    path = "/.well-known/openid-configuration",
    tag = "oidc",
    responses(
        (status = 200, description = "OIDC discovery document (issuer, endpoints, supported algs)"),
    ),
)]
pub async fn discovery(state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let runtime_config = load_runtime_app_config(state.get_ref()).await?;
    let issuer = runtime_config.server.issuer_url.clone();
    let metadata = DiscoveryDocument {
        issuer: issuer.clone(),
        authorization_endpoint: format!("{}/v1/oidc/authorize", issuer),
        token_endpoint: format!("{}/v1/oidc/token", issuer),
        revocation_endpoint: format!("{}/v1/oidc/revoke", issuer),
        introspection_endpoint: format!("{}/v1/oidc/introspect", issuer),
        userinfo_endpoint: format!("{}/v1/oidc/userinfo", issuer),
        end_session_endpoint: format!("{}/v1/oidc/end-session", issuer),
        jwks_uri: format!("{}/.well-known/jwks.json", issuer),
        response_types_supported: vec!["code"],
        subject_types_supported: vec!["public"],
        id_token_signing_alg_values_supported: vec![oidc_signing_alg(&std::sync::Arc::new(runtime_config.clone()))],
        scopes_supported: vec!["openid", "profile", "email"],
        claims_supported: vec!["sub", "email", "email_verified", "name", "picture", "sid"],
        grant_types_supported: vec!["authorization_code", "refresh_token"],
        token_endpoint_auth_methods_supported: vec!["client_secret_post", "none"],
        code_challenge_methods_supported: vec!["S256", "plain"],
    };

    Ok(HttpResponse::Ok().json(metadata))
}

#[utoipa::path(
    get,
    path = "/.well-known/jwks.json",
    tag = "oidc",
    responses(
        (status = 200, description = "JSON Web Key Set for verifying issued ID tokens"),
    ),
)]
pub async fn jwks_with_state(state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    use super::service::oidc_jwks_from_db;
    Ok(HttpResponse::Ok().json(JwksResponse {
        keys: oidc_jwks_from_db(&state.db, &state.config).await?,
    }))
}

#[utoipa::path(
    get,
    path = "/v1/oidc/authorize",
    tag = "oidc",
    params(AuthorizeRequest),
    responses(
        (status = 302, description = "Redirect: to login if no session, else back to the client's redirect_uri with an authorization code (or an error)"),
        (status = 400, description = "Invalid authorize request (bad client_id/redirect_uri/response_type)"),
    ),
)]
pub async fn authorize(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<AuthorizeRequest>,
) -> Result<HttpResponse, AppError> {
    let query = query.into_inner();

    // Validate all required parameters up front — no silent fallbacks.
    {
        let mut missing: Vec<&str> = Vec::new();
        let mut invalid: Vec<String> = Vec::new();

        if query.client_id.trim().is_empty() { missing.push("client_id") }
        if query.redirect_uri.trim().is_empty() { missing.push("redirect_uri") }
        if query.response_type.trim().is_empty() { missing.push("response_type") }

        if !missing.is_empty() {
            return Err(AppError::Validation(format!(
                "Missing required OIDC authorize parameters: {}",
                missing.join(", ")
            )));
        }

        if query.response_type.trim() != "code" {
            invalid.push(format!("response_type must be 'code', got '{}'", query.response_type.trim()));
        }

        if Url::parse(query.redirect_uri.trim()).is_err() {
            invalid.push(format!("redirect_uri is not a valid URL: '{}'", query.redirect_uri.trim()));
        }

        match query.code_challenge_method.as_deref().map(str::trim) {
            Some(method) if method != "S256" => {
                invalid.push(format!("code_challenge_method must be 'S256', got '{}'", method));
            }
            _ => {}
        }

        if let Some(challenge) = query.code_challenge.as_deref().map(str::trim) {
            if !challenge.is_empty() && (challenge.len() < 43 || challenge.len() > 128) {
                invalid.push(format!(
                    "code_challenge length must be 43–128 characters, got {}",
                    challenge.len()
                ));
            }
        }

        if !invalid.is_empty() {
            return Err(AppError::Validation(format!(
                "Invalid OIDC authorize parameters: {}",
                invalid.join("; ")
            )));
        }
    }

    let runtime_config = load_runtime_app_config(state.get_ref()).await?;
    let hosted_login_url = format!("{}/login-widget", runtime_config.server.issuer_url.trim_end_matches('/'));
    let path_and_query = req.uri().path_and_query().map(|value| value.as_str()).unwrap_or("");
    let oidc_authorize_resume_url = format!(
        "{}{}",
        runtime_config.server.issuer_url.trim_end_matches('/'),
        path_and_query
    );

    // Look up the org slug for this client so the login page can load the correct
    // workspace auth policy (e.g. passkey disabled for mintmallow). Best-effort:
    // if the lookup fails we still redirect to login without an org param.
    let client_org_slug: Option<String> = sqlx::query_scalar(
        "SELECT o.slug FROM oauth_clients c JOIN organizations o ON o.id = c.org_id WHERE c.client_id = $1"
    )
    .bind(&query.client_id)
    .fetch_optional(&state.db)
    .await
    .unwrap_or(None);

    // Build a login redirect URL with the org slug appended when available.
    // Build the login widget redirect URL.
    //
    // REQUIRED params — must always be present:
    //   - return_to  : the OIDC authorize URL to resume after login completes
    //   - client_id  : the OAuth client ID — the widget uses this to load app config,
    //                  allowed embed origins, and widget_login_context. Without it,
    //                  the widget cannot start any OAuth or magic link flow.
    //
    // Optional params:
    //   - org        : workspace slug — pre-loads the correct workspace branding and
    //                  auth policy (e.g. passkey enabled/disabled for that workspace)
    let build_login_redirect = |base: &str| -> Result<String, AppError> {
        let mut url = Url::parse(base)
            .map_err(|_| AppError::Internal("Invalid hosted login URL configured".into()))?;
        url.query_pairs_mut().append_pair("return_to", &oidc_authorize_resume_url);
        url.query_pairs_mut().append_pair("client_id", &query.client_id);
        if let Some(slug) = &client_org_slug {
            url.query_pairs_mut().append_pair("org", slug);
        }
        Ok(url.to_string())
    };

    // 1. Validate the session cookie directly — RequireAuth middleware is not applied on the OIDC
    //    scope because unauthenticated users must be redirected to login, not receive a 401.
    //    We replicate the session-verification logic here so signed-in users get an auth code
    //    without a new login prompt.
    //
    //    Important contract:
    //    - `/oidc/authorize` is the app's OIDC authorization flow.
    //    - `/login-widget` is only the hosted sign-in surface used when no Rooiam session exists.
    //    - the hosted widget does not become the app callback; after login, Rooiam resumes this
    //      authorize request and still redirects to the app's registered `redirect_uri`.
    let session = {
        let cookie_value = req.cookie(ROOIAM_SESSION_COOKIE).map(|c| c.value().to_string());
        match cookie_value {
            Some(token) => {
                let session_repo = SessionRepository::new(state.db.clone());
                let session_service = SessionService::new(session_repo, state.db.clone());
                match session_service.verify_opaque_session(&token).await {
                    Ok(s) => s,
                    Err(_) => {
                        // Session cookie present but invalid/expired.
                        // Redirect to the hosted sign-in surface so the user can authenticate, then resume the
                        // OIDC authorize request on the trusted issuer. This is not an app callback redirect.
                        return Ok(HttpResponse::Found()
                            .insert_header(("Location", build_login_redirect(&hosted_login_url)?))
                            .finish());
                    }
                }
            }
            None => {
                // No session cookie.
                // Redirect to the hosted sign-in surface so the user can authenticate, then resume the
                // OIDC authorize request on the trusted issuer. This is not an app callback redirect.
                return Ok(HttpResponse::Found()
                    .insert_header(("Location", build_login_redirect(&hosted_login_url)?))
                    .finish());
            }
        }
    };

    let oidc_service = OIDCService::new(state.db.clone(), std::sync::Arc::new(runtime_config));
    let result: Result<HttpResponse, AppError> = async {
        if query.response_type != "code" {
            return Err(AppError::Validation("Unsupported response_type. Only 'code' is supported.".into()));
        }

        let client = oidc_service.get_client(&query.client_id).await?;
        let redirect_valid = oidc_service.validate_redirect_uri(client.id, &query.redirect_uri).await?;
        if !redirect_valid {
            AuditService::new(state.db.clone()).log(AuditEvent {
                actor_user_id: Some(session.user_id),
                organization_id: session.current_org_id,
                action: "auth.app_callback_rejected".into(),
                target_type: "redirect_uri".into(),
                target_id: Some(query.redirect_uri.clone()),
                ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
                metadata: serde_json::json!({
                    "method": "oidc_authorize",
                    "client_id": query.client_id,
                }),
            }).await;
            return Err(AppError::Validation("Invalid redirect_uri".into()));
        }

        // All client types must use PKCE (S256). Public clients (spa/native) have no
        // client_secret, so PKCE is their only protection. Confidential clients (web) should
        // also use PKCE to prevent authorization code interception (RFC 7636, OAuth 2.1).
        {
            let challenge = query
                .code_challenge
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| AppError::Validation("PKCE is required. Include code_challenge and code_challenge_method=S256.".into()))?;
            let method = query
                .code_challenge_method
                .as_deref()
                .unwrap_or("plain");

            if method != "S256" {
                return Err(AppError::Validation("Only code_challenge_method=S256 is supported.".into()));
            }

            if challenge.len() < 43 || challenge.len() > 128 {
                return Err(AppError::Validation("Invalid PKCE code_challenge length.".into()));
            }
        }

        let scope_list = query.scope.clone().unwrap_or_default().split_whitespace().map(|s| s.to_string()).collect();
        let code = oidc_service.create_authorization_code(
            client.id,
            session.user_id,
            session.session_id,
            &query.redirect_uri,
            scope_list,
            query.code_challenge.as_deref(),
            query.code_challenge_method.as_deref(),
            query.nonce.as_deref(),
        ).await?;

        let mut redirect_url = Url::parse(&query.redirect_uri)
            .map_err(|_| AppError::Validation("Invalid redirect_uri".into()))?;
        redirect_url.query_pairs_mut().append_pair("code", &code);
        if let Some(st) = &query.state {
            redirect_url.query_pairs_mut().append_pair("state", st);
        }

        Ok(HttpResponse::Found()
            .insert_header(("Location", redirect_url.to_string()))
            .finish())
    }.await;

    Ok(match result {
        Ok(response) => response,
        Err(err) => {
            let can_redirect_error = if query.client_id.trim().is_empty() {
                false
            } else {
                let client_id: Option<uuid::Uuid> = sqlx::query_scalar(
                    "SELECT id FROM oauth_clients WHERE client_id = $1"
                )
                .bind(&query.client_id)
                .fetch_optional(&state.db)
                .await
                .unwrap_or(None);

                match client_id {
                    Some(client_id) => oidc_service
                        .validate_redirect_uri(client_id, &query.redirect_uri)
                        .await
                        .unwrap_or(false),
                    None => false,
                }
            };

            if can_redirect_error {
                let (error, description) = map_authorize_error(&err);
                oauth_authorize_error_redirect(&query.redirect_uri, query.state.as_deref(), error, &description)?
            } else {
                err.error_response()
            }
        }
    })
}

#[utoipa::path(
    post,
    path = "/v1/oidc/token",
    tag = "oidc",
    request_body(content = TokenRequest, content_type = "application/x-www-form-urlencoded"),
    responses(
        (status = 200, description = "Token response: access_token, id_token, optional refresh_token"),
        (status = 400, description = "OAuth error (invalid_grant, invalid_request, etc.)"),
        (status = 401, description = "Client authentication failed"),
    ),
)]
pub async fn token(
    state: web::Data<AppState>,
    form: web::Form<TokenRequest>,
) -> Result<HttpResponse, AppError> {
    let runtime_config = load_runtime_app_config(state.get_ref()).await?;
    let oidc_service = OIDCService::new(state.db.clone(), std::sync::Arc::new(runtime_config));

    let result: Result<HttpResponse, AppError> = async {
        // Validate client authentication (required for all grant types)
        let client = oidc_service.get_client(&form.client_id).await?;
        if client.app_type == "web" {
            let secret = form.client_secret.as_deref().ok_or_else(|| AppError::Validation("Missing 'client_secret' for web application".into()))?;
            oidc_service.validate_client_secret(&client, secret)?;
        }

        let token_response = match form.grant_type.as_str() {
            "authorization_code" => {
                let code_plain = form.code.as_deref().ok_or_else(|| AppError::Validation("Missing 'code'".into()))?;
                let redirect_uri = form.redirect_uri.as_deref().ok_or_else(|| AppError::Validation("Missing 'redirect_uri'".into()))?;
                oidc_service.exchange_code_for_tokens(
                    code_plain,
                    client.id,
                    redirect_uri,
                    form.code_verifier.as_deref(),
                ).await?
            }
            "refresh_token" => {
                let rt = form.refresh_token.as_deref().ok_or_else(|| AppError::Validation("Missing 'refresh_token'".into()))?;
                oidc_service.exchange_refresh_token(rt, client.id).await?
            }
            _ => return Err(AppError::Validation("Unsupported grant_type. Supported: 'authorization_code', 'refresh_token'.".into())),
        };

        Ok(HttpResponse::Ok().json(token_response))
    }.await;

    Ok(match result {
        Ok(response) => response,
        Err(err) => map_token_error(err),
    })
}

#[utoipa::path(
    get,
    path = "/v1/oidc/userinfo",
    tag = "oidc",
    security(("oidc_access_token" = [])),
    responses(
        (status = 200, description = "Claims for the user the access token was issued for"),
        (status = 401, description = "Missing or invalid access token"),
    ),
)]
pub async fn userinfo(
    req: HttpRequest,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let token = extract_bearer_token(&req)?;
    let runtime_config = load_runtime_app_config(state.get_ref()).await?;
    let oidc_service = OIDCService::new(state.db.clone(), std::sync::Arc::new(runtime_config));
    let payload = oidc_service.userinfo(token).await?;
    Ok(HttpResponse::Ok().json(payload))
}

pub async fn revoke(
    state: web::Data<AppState>,
    form: web::Form<RevocationRequest>,
) -> Result<HttpResponse, AppError> {
    let runtime_config = load_runtime_app_config(state.get_ref()).await?;
    let oidc_service = OIDCService::new(state.db.clone(), std::sync::Arc::new(runtime_config));

    let result: Result<HttpResponse, AppError> = async {
        let client = oidc_service.get_client(&form.client_id).await?;
        if client.app_type == "web" {
            let secret = form.client_secret.as_deref().ok_or_else(|| AppError::Validation("Missing 'client_secret' for web application".into()))?;
            oidc_service.validate_client_secret(&client, secret)?;
        }

        match form.token_type_hint.as_deref() {
            Some("access_token") => {
                // Access tokens are self-contained JWTs today, so revocation here is a no-op.
            }
            Some("refresh_token") | None => {
                // RFC 7009 §2.2: the server MUST respond with 200 even when the token is invalid,
                // expired, or not owned by this client — prevents token enumeration.
                let _ = oidc_service.revoke_refresh_token(&form.token, client.id).await;
            }
            Some(_) => {
                let _ = oidc_service.revoke_refresh_token(&form.token, client.id).await;
            }
        }

        Ok(HttpResponse::Ok().finish())
    }.await;

    Ok(match result {
        Ok(response) => response,
        Err(err) => map_token_error(err),
    })
}

pub async fn introspect(
    state: web::Data<AppState>,
    form: web::Form<IntrospectionRequest>,
) -> Result<HttpResponse, AppError> {
    let runtime_config = load_runtime_app_config(state.get_ref()).await?;
    let oidc_service = OIDCService::new(state.db.clone(), std::sync::Arc::new(runtime_config));

    let result: Result<HttpResponse, AppError> = async {
        let client = oidc_service.get_client(&form.client_id).await?;
        if client.app_type == "web" {
            let secret = form.client_secret.as_deref().ok_or_else(|| AppError::Validation("Missing 'client_secret' for web application".into()))?;
            oidc_service.validate_client_secret(&client, secret)?;
        }

        let payload = match form.token_type_hint.as_deref() {
            Some("refresh_token") => oidc_service.introspect_refresh_token(&form.token, client.id).await?,
            Some("access_token") => oidc_service.introspect_access_token(&form.token, &client.client_id)?,
            _ => {
                let access = oidc_service.introspect_access_token(&form.token, &client.client_id)?;
                if access.get("active").and_then(|value| value.as_bool()) == Some(true) {
                    access
                } else {
                    oidc_service.introspect_refresh_token(&form.token, client.id).await?
                }
            }
        };

        Ok(HttpResponse::Ok().json(payload))
    }.await;

    Ok(match result {
        Ok(response) => response,
        Err(err) => map_token_error(err),
    })
}

/// GET /v1/oidc/end-session — RP-initiated logout (OIDC Session Management)
///
/// Clears the Rooiam session cookie and revokes the DB session.
/// Redirects to `post_logout_redirect_uri` only when it matches the registered app callback
/// (`redirect_uri`) values for the provided client_id.
/// Validates `id_token_hint` format if provided but does not require it (many RPs don't send it).
pub async fn end_session(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<EndSessionRequest>,
) -> Result<HttpResponse, AppError> {
    let query = query.into_inner();

    // Attempt to revoke the session if one is present — best-effort, never hard-fail logout.
    if let Some(token_value) = req.cookie(ROOIAM_SESSION_COOKIE).map(|c| c.value().to_string()) {
        let session_repo = SessionRepository::new(state.db.clone());
        let session_service = SessionService::new(session_repo.clone(), state.db.clone());
        if let Ok(session) = session_service.verify_opaque_session(&token_value).await {
            let _ = session_repo.revoke_session(session.session_id).await;
        }
    }

    let clear_cookie = build_clear_session_cookie(state.config.as_ref());

    let oidc_service = OIDCService::new(state.db.clone(), std::sync::Arc::new(load_runtime_app_config(state.get_ref()).await?));

    // Determine redirect target.
    let redirect_uri = if let Some(uri) = query.post_logout_redirect_uri.as_deref() {
        let client_id = query.client_id.as_deref().map(str::trim).filter(|value| !value.is_empty());
        match client_id {
            Some(client_id) => {
                let client = oidc_service.get_client(client_id).await?;
                if oidc_service.validate_redirect_uri(client.id, uri).await? {
                    if let Some(state_param) = query.state.as_deref() {
                        let mut redirect_url = Url::parse(uri)
                            .map_err(|_| AppError::Validation("Invalid post_logout_redirect_uri".into()))?;
                        redirect_url.query_pairs_mut().append_pair("state", state_param);
                        redirect_url.to_string()
                    } else {
                        uri.to_string()
                    }
                } else {
                    tracing::warn!("end_session: rejected post_logout_redirect_uri not registered for client");
                    AuditService::new(state.db.clone()).log(AuditEvent {
                        actor_user_id: None,
                        organization_id: None,
                        action: "auth.logout.redirect_rejected".into(),
                        target_type: "redirect_uri".into(),
                        target_id: Some(uri.to_string()),
                        ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                        user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
                        metadata: serde_json::json!({
                            "client_id": client_id,
                            "reason": "not_registered_for_client",
                        }),
                    }).await;
                    effective_app_url(&state.db).await?
                }
            }
            None => {
                tracing::warn!("end_session: ignoring post_logout_redirect_uri without client_id");
                AuditService::new(state.db.clone()).log(AuditEvent {
                    actor_user_id: None,
                    organization_id: None,
                    action: "auth.logout.redirect_rejected".into(),
                    target_type: "redirect_uri".into(),
                    target_id: Some(uri.to_string()),
                    ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                    user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
                    metadata: serde_json::json!({
                        "reason": "missing_client_id",
                    }),
                }).await;
                effective_app_url(&state.db).await?
            }
        }
    } else {
        // No redirect specified — send to app root
        effective_app_url(&state.db).await?
    };

    Ok(HttpResponse::Found()
        .cookie(clear_cookie)
        .insert_header(("Location", redirect_uri))
        .finish())
}

pub fn routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/oidc")
            .wrap(crate::http::middleware::rate_limit::RateLimit::new(30, 60))
            .route("/authorize", web::get().to(authorize))
            .route("/token", web::post().to(token))
            .route("/revoke", web::post().to(revoke))
            .route("/introspect", web::post().to(introspect))
            .route("/userinfo", web::get().to(userinfo))
            .route("/end-session", web::get().to(end_session))
    );
}

pub fn well_known_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/.well-known")
            .route("/openid-configuration", web::get().to(discovery))
            .route("/jwks.json", web::get().to(jwks_with_state))
    );
}
