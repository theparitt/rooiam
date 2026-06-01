use std::collections::HashSet;

use argon2::{password_hash::SaltString, Argon2, PasswordHasher};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::{rngs::OsRng, RngCore};
use url::Url;

use crate::shared::error::AppError;

const MAX_CLIENT_REDIRECT_URIS: usize = 25;
const MAX_CLIENT_ALLOWED_EMBED_ORIGINS: usize = 25;

fn is_loopback_host(host: Option<&str>) -> bool {
    matches!(host, Some("localhost") | Some("127.0.0.1") | Some("::1"))
}

fn validate_client_redirect_uri(app_type: &str, redirect_uri: &str) -> Result<String, AppError> {
    let value = redirect_uri.trim();
    if value.is_empty() {
        return Err(AppError::Validation("redirect_uri cannot be empty".into()));
    }

    let parsed = Url::parse(value)
        .map_err(|_| AppError::Validation("redirect_uri must be a valid absolute URL".into()))?;

    if parsed.fragment().is_some() {
        return Err(AppError::Validation("redirect_uri must not contain a fragment".into()));
    }

    let scheme = parsed.scheme();
    let host = parsed.host_str();
    let is_loopback = is_loopback_host(host);

    match app_type {
        "web" | "spa" => {
            if scheme == "https" || (scheme == "http" && is_loopback) {
                Ok(parsed.to_string())
            } else {
                Err(AppError::Validation(
                    "Web and SPA redirect_uri values must use HTTPS, except localhost/loopback HTTP for development.".into(),
                ))
            }
        }
        "native" => {
            if scheme == "https" || (scheme == "http" && is_loopback) {
                return Ok(parsed.to_string());
            }

            if scheme != "http" && scheme != "https" {
                return Ok(parsed.to_string());
            }

            Err(AppError::Validation(
                "Native redirect_uri values must use a custom scheme, HTTPS, or localhost/loopback HTTP.".into(),
            ))
        }
        _ => Err(AppError::Validation("app_type must be web, spa, or native.".into())),
    }
}

pub fn normalize_client_redirect_uris_with_limit(
    app_type: &str,
    redirect_uris: &[String],
    max_redirect_uris: usize,
) -> Result<Vec<String>, AppError> {
    if redirect_uris.is_empty() {
        return Err(AppError::Validation("At least one redirect URI is required.".into()));
    }
    if redirect_uris.len() > max_redirect_uris {
        return Err(AppError::Validation(format!(
            "A maximum of {} redirect URIs is allowed per client.",
            max_redirect_uris
        )));
    }

    let mut seen = HashSet::new();
    let mut normalized = Vec::new();

    for redirect_uri in redirect_uris {
        let value = validate_client_redirect_uri(app_type, redirect_uri)?;
        if seen.insert(value.clone()) {
            normalized.push(value);
        }
    }

    Ok(normalized)
}

pub fn normalize_client_redirect_uris(app_type: &str, redirect_uris: &[String]) -> Result<Vec<String>, AppError> {
    normalize_client_redirect_uris_with_limit(app_type, redirect_uris, MAX_CLIENT_REDIRECT_URIS)
}

fn validate_client_allowed_embed_origin(origin: &str) -> Result<String, AppError> {
    let value = origin.trim();
    if value.is_empty() {
        return Err(AppError::Validation("allowed_embed_origin cannot be empty".into()));
    }

    let parsed = Url::parse(value)
        .map_err(|_| AppError::Validation("allowed_embed_origin must be a valid absolute origin URL".into()))?;

    if parsed.fragment().is_some() || parsed.query().is_some() {
        return Err(AppError::Validation("allowed_embed_origin must not contain a query or fragment".into()));
    }

    let path = parsed.path();
    if !path.is_empty() && path != "/" {
        return Err(AppError::Validation("allowed_embed_origin must be an origin only, without a path".into()));
    }

    let scheme = parsed.scheme();
    let host = parsed.host_str();
    let is_loopback = is_loopback_host(host);

    if !(scheme == "https" || (scheme == "http" && is_loopback)) {
        return Err(AppError::Validation(
            "allowed_embed_origin values must use HTTPS, except localhost/loopback HTTP for development.".into(),
        ));
    }

    Ok(parsed.origin().ascii_serialization())
}

pub fn normalize_client_allowed_embed_origins_with_limit(
    origins: &[String],
    max_allowed_embed_origins: usize,
) -> Result<Vec<String>, AppError> {
    if origins.len() > max_allowed_embed_origins {
        return Err(AppError::Validation(format!(
            "A maximum of {} allowed embed origins is allowed per client.",
            max_allowed_embed_origins
        )));
    }

    let mut seen = HashSet::new();
    let mut normalized = Vec::new();

    for origin in origins {
        let value = validate_client_allowed_embed_origin(origin)?;
        if seen.insert(value.clone()) {
            normalized.push(value);
        }
    }

    Ok(normalized)
}

pub fn normalize_client_allowed_embed_origins(origins: &[String]) -> Result<Vec<String>, AppError> {
    normalize_client_allowed_embed_origins_with_limit(origins, MAX_CLIENT_ALLOWED_EMBED_ORIGINS)
}

pub fn generate_client_id() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

pub fn generate_confidential_client_secret() -> Result<(String, String), AppError> {
    let mut secret_bytes = [0u8; 48];
    OsRng.fill_bytes(&mut secret_bytes);
    let secret = URL_SAFE_NO_PAD.encode(secret_bytes);
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(secret.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(format!("Failed to hash client secret: {}", e)))?
        .to_string();
    Ok((secret, hash))
}
