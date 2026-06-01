use crate::bootstrap::config::AppConfig;
use actix_web::cookie::{time::Duration as CookieDuration, Cookie, SameSite};
use url::Url;
use uuid::Uuid;

pub const ROOIAM_SESSION_COOKIE: &str = "rooiam_sid";

/// Generates the opaque session string in the format: <session_id>.<raw_secret>
pub fn format_session_token(session_id: Uuid, raw_secret: &str) -> String {
    format!("{}.{}", session_id, raw_secret)
}

/// Builds the Set-Cookie HTTP header value
pub fn build_session_cookie<'a>(token: String, config: &AppConfig, ttl_seconds: i64) -> Cookie<'a> {
    let is_secure = cookie_secure(config);
    let domain = cookie_domain();
    // When a parent domain is set (e.g. rooiam.com), the cookie covers all subdomains.
    // Requests between subdomains (app.rooiam.com → api.rooiam.com) are same-site,
    // so SameSite=Lax works and is compatible with Safari ITP / Firefox ETP.
    // Without a domain, the cookie is host-only on the API origin. Cross-origin fetches
    // from the app subdomain require SameSite=None, but ITP will block that in Safari.
    // Always set ROOIAM_COOKIE_DOMAIN to the parent domain in production.
    let same_site = if domain.is_some() {
        SameSite::Lax
    } else if is_secure {
        SameSite::None
    } else {
        SameSite::Lax
    };
    let mut builder = Cookie::build(ROOIAM_SESSION_COOKIE, token)
        .path("/")
        .secure(is_secure)
        .http_only(true)
        .same_site(same_site)
        .max_age(CookieDuration::seconds(ttl_seconds));

    if let Some(d) = domain {
        builder = builder.domain(d);
    }

    builder.finish()
}

pub fn build_clear_session_cookie<'a>(config: &AppConfig) -> Cookie<'a> {
    let is_secure = cookie_secure(config);
    let domain = cookie_domain();
    let same_site = if domain.is_some() {
        SameSite::Lax
    } else if is_secure {
        SameSite::None
    } else {
        SameSite::Lax
    };
    let mut builder = Cookie::build(ROOIAM_SESSION_COOKIE, "")
        .path("/")
        .secure(is_secure)
        .http_only(true)
        .same_site(same_site)
        .max_age(CookieDuration::seconds(0));

    if let Some(d) = domain {
        builder = builder.domain(d);
    }

    builder.finish()
}

fn cookie_domain() -> Option<String> {
    std::env::var("ROOIAM_COOKIE_DOMAIN")
        .ok()
        .map(|value| value.trim().trim_start_matches('.').to_string())
        .filter(|value| !value.is_empty())
        .filter(|value| !is_loopback_host(value))
}

fn cookie_secure(config: &AppConfig) -> bool {
    std::env::var("ROOIAM_COOKIE_SECURE")
        .ok()
        .and_then(|value| match value.trim().to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" => Some(true),
            "0" | "false" | "no" => Some(false),
            _ => None,
        })
        .unwrap_or_else(|| match Url::parse(&config.server.issuer_url) {
            Ok(parsed) if parsed.scheme() == "https" => true,
            Ok(parsed) => parsed
                .host_str()
                .map(|host| !is_loopback_host(host))
                .unwrap_or(false),
            Err(_) => false,
        })
}

fn is_loopback_host(host: &str) -> bool {
    let normalized = host.trim().trim_start_matches('[').trim_end_matches(']');
    if normalized.eq_ignore_ascii_case("localhost") {
        return true;
    }
    normalized
        .parse::<std::net::IpAddr>()
        .map(|ip| ip.is_loopback())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bootstrap::config::{
        AppConfig, DatabaseConfig, DeployTarget, OAuthConfig, OidcConfig, RateLimitConfig,
        RedisConfig, ServerConfig, ServerMode, StorageConfig, WebauthnConfig,
    };
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn with_env_var<T>(key: &str, value: Option<&str>, f: impl FnOnce() -> T) -> T {
        let _guard = env_lock().lock().expect("env lock poisoned");
        let previous = std::env::var(key).ok();
        match value {
            Some(value) => std::env::set_var(key, value),
            None => std::env::remove_var(key),
        }
        let result = f();
        match previous {
            Some(value) => std::env::set_var(key, value),
            None => std::env::remove_var(key),
        }
        result
    }

    fn test_config(issuer_url: &str) -> AppConfig {
        AppConfig {
            mode: ServerMode::Test,
            deploy_target: DeployTarget::Local,
            server: ServerConfig {
                host: "0.0.0.0".into(),
                port: 5170,
                issuer_url: issuer_url.into(),
                frontend_url: "https://app.example.com".into(),
                admin_url: "https://admin.example.com".into(),
                trusted_proxy_cidrs: Vec::new(),
                max_logo_bytes: 8 * 1024 * 1024,
            },
            database: DatabaseConfig {
                url: "postgres://postgres:postgres@127.0.0.1:5432/rooiam".into(),
            },
            redis: RedisConfig {
                url: "redis://127.0.0.1:6379".into(),
            },
            storage: StorageConfig {
                root: "/tmp/rooiam".into(),
                public_media_base: "/media".into(),
            },
            oauth: OAuthConfig {
                google_client_id: String::new(),
                google_client_secret: String::new(),
                microsoft_client_id: String::new(),
                microsoft_client_secret: String::new(),
                google_redirect_uri: "https://auth.example.com/api/v1/auth/google/callback".into(),
                microsoft_redirect_uri: "https://auth.example.com/api/v1/auth/microsoft/callback"
                    .into(),
                microsoft_tenant_id: "common".into(),
                google_redirect_uri_explicit: false,
                microsoft_redirect_uri_explicit: false,
            },
            oidc: OidcConfig {
                signing_secret: "test-signing-secret".into(),
                private_key_pem: None,
                public_key_pem: None,
                key_id: "test".into(),
            },
            webauthn: WebauthnConfig {
                rp_id: "localhost".into(),
                rp_name: "Rooiam".into(),
                origin: "http://localhost:5171".into(),
                extra_origins: Vec::new(),
                allow_any_port: true,
            },
            rate_limit: RateLimitConfig {
                auth_per_endpoint: u64::MAX,
                auth_per_ip: u64::MAX,
                identity_per_endpoint: u64::MAX,
                identity_per_ip: u64::MAX,
                orgs_per_endpoint: u64::MAX,
                orgs_per_ip: u64::MAX,
                oauth_per_endpoint: u64::MAX,
                oauth_per_ip: u64::MAX,
                webauthn_per_endpoint: u64::MAX,
                webauthn_per_ip: u64::MAX,
            },
        }
    }

    #[test]
    fn defaults_secure_when_issuer_is_https() {
        with_env_var("ROOIAM_COOKIE_SECURE", None, || {
            assert!(cookie_secure(&test_config("https://auth.example.com")));
        });
    }

    #[test]
    fn keeps_localhost_http_insecure_by_default() {
        with_env_var("ROOIAM_COOKIE_SECURE", None, || {
            assert!(!cookie_secure(&test_config("http://localhost:5170")));
        });
    }

    #[test]
    fn keeps_ipv6_loopback_http_insecure_by_default() {
        with_env_var("ROOIAM_COOKIE_SECURE", None, || {
            assert!(!cookie_secure(&test_config("http://[::1]:5170")));
        });
    }

    #[test]
    fn ignores_loopback_cookie_domain_overrides() {
        with_env_var("ROOIAM_COOKIE_DOMAIN", Some("localhost"), || {
            assert_eq!(cookie_domain(), None);
        });
        with_env_var("ROOIAM_COOKIE_DOMAIN", Some(".127.0.0.1"), || {
            assert_eq!(cookie_domain(), None);
        });
    }

    #[test]
    fn trims_leading_dot_from_cookie_domain() {
        with_env_var("ROOIAM_COOKIE_DOMAIN", Some(".example.com"), || {
            assert_eq!(cookie_domain().as_deref(), Some("example.com"));
        });
    }
}
