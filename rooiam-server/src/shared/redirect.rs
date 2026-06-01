use url::Url;

use crate::shared::error::AppError;

const PLACEHOLDER_APP_NAME: &str = "Your App";

fn configured_public_origins() -> Vec<String> {
    let mut origins = std::env::var("ROOIAM_ALLOWED_ORIGINS")
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();

    for key in ["ROOIAM_SERVER_URL", "ROOIAM_APP_URL", "ROOIAM_ADMIN_URL"] {
        if let Ok(value) = std::env::var(key) {
            if let Ok(parsed) = Url::parse(value.trim()) {
                let origin = parsed.origin().ascii_serialization();
                if !origins.iter().any(|allowed| allowed == &origin) {
                    origins.push(origin);
                }
            }
        }
    }

    origins
}

fn configured_first_party_origins() -> Vec<String> {
    ["ROOIAM_SERVER_URL", "ROOIAM_APP_URL", "ROOIAM_ADMIN_URL"]
        .into_iter()
        .filter_map(|key| std::env::var(key).ok())
        .filter_map(|value| Url::parse(value.trim()).ok())
        .map(|parsed| parsed.origin().ascii_serialization())
        .collect()
}

fn remove_placeholder_app_param(url: &mut Url) {
    let filtered_pairs: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(key, value)| !(key == "app" && value == PLACEHOLDER_APP_NAME))
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();

    if filtered_pairs.is_empty() {
        url.set_query(None);
        return;
    }

    {
        let mut pairs = url.query_pairs_mut();
        pairs.clear();
        for (key, value) in filtered_pairs {
            pairs.append_pair(&key, &value);
        }
    }
}

fn to_relative_redirect(url: &Url) -> String {
    let mut value = url.path().to_string();
    if let Some(query) = url.query() {
        value.push('?');
        value.push_str(query);
    }
    if let Some(fragment) = url.fragment() {
        value.push('#');
        value.push_str(fragment);
    }
    value
}

pub fn normalize_redirect_uri(redirect_uri: Option<String>) -> Result<Option<String>, AppError> {
    match redirect_uri {
        Some(uri) => Ok(Some(validate_redirect_uri(&uri)?)),
        None => Ok(None),
    }
}

pub fn is_relative_redirect_uri(redirect_uri: &str) -> bool {
    redirect_uri.starts_with('/') && !redirect_uri.starts_with("//")
}

pub fn is_first_party_public_redirect_uri(redirect_uri: &str) -> bool {
    let Ok(parsed) = Url::parse(redirect_uri.trim()) else {
        return false;
    };
    let origin = parsed.origin().ascii_serialization();
    configured_first_party_origins()
        .iter()
        .any(|allowed| allowed == &origin)
}

pub fn validate_redirect_uri(redirect_uri: &str) -> Result<String, AppError> {
    let redirect_uri = redirect_uri.trim();

    if redirect_uri.is_empty() {
        return Err(AppError::Validation("redirect_uri cannot be empty".into()));
    }

    if redirect_uri.starts_with('/') && !redirect_uri.starts_with("//") {
        let base = Url::parse("http://rooiam.local").expect("static base URL is valid");
        let mut parsed = base.join(redirect_uri).map_err(|_| {
            AppError::Validation("redirect_uri must be a valid URL or relative path".into())
        })?;
        remove_placeholder_app_param(&mut parsed);
        return Ok(to_relative_redirect(&parsed));
    }

    let mut parsed = Url::parse(redirect_uri).map_err(|_| {
        AppError::Validation("redirect_uri must be a valid URL or relative path".into())
    })?;

    let origin = parsed.origin().ascii_serialization();
    let allowed_origins = configured_public_origins();

    if allowed_origins.iter().any(|allowed| allowed == &origin) {
        remove_placeholder_app_param(&mut parsed);
        return Ok(parsed.to_string());
    }

    Err(AppError::Validation("redirect_uri is not allowed".into()))
}

#[cfg(test)]
mod tests {
    use super::validate_redirect_uri;

    #[test]
    fn strips_placeholder_app_from_relative_redirects() {
        let redirect =
            validate_redirect_uri("/app?app=Your+App&org=roochoco").expect("redirect is valid");
        assert_eq!(redirect, "/app?org=roochoco");
    }

    #[test]
    fn strips_placeholder_app_from_absolute_redirects() {
        std::env::set_var("ROOIAM_APP_URL", "http://localhost:5170");
        let redirect = validate_redirect_uri("http://localhost:5170/app?app=Your+App")
            .expect("redirect is valid");
        assert_eq!(redirect, "http://localhost:5170/app");
    }
}
