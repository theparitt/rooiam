use actix_web::{dev::ServiceRequest, http::header::HeaderMap, HttpRequest};
use ipnet::IpNet;
use std::net::{IpAddr, SocketAddr};

use crate::bootstrap::config::AppConfig;

pub fn parse_client_ip(raw: Option<&str>) -> Option<IpAddr> {
    let raw = raw?.split(',').next()?.trim();
    raw.parse::<IpAddr>()
        .ok()
        .or_else(|| raw.parse::<SocketAddr>().ok().map(|addr| addr.ip()))
}

pub fn client_ip_from_http_request(req: &HttpRequest, config: &AppConfig) -> Option<IpAddr> {
    resolve_client_ip(req.connection_info().peer_addr(), req.headers(), config)
}

pub fn client_ip_string_from_http_request(req: &HttpRequest, config: &AppConfig) -> Option<String> {
    client_ip_from_http_request(req, config).map(|ip| ip.to_string())
}

pub fn client_ip_from_service_request(req: &ServiceRequest, config: &AppConfig) -> Option<IpAddr> {
    resolve_client_ip(req.connection_info().peer_addr(), req.headers(), config)
}

pub fn client_ip_string_from_service_request(req: &ServiceRequest, config: &AppConfig) -> Option<String> {
    client_ip_from_service_request(req, config).map(|ip| ip.to_string())
}

fn resolve_client_ip(peer_addr: Option<&str>, headers: &HeaderMap, config: &AppConfig) -> Option<IpAddr> {
    let peer_ip = parse_client_ip(peer_addr)?;
    if !is_trusted_proxy(peer_ip, &config.server.trusted_proxy_cidrs) {
        return Some(peer_ip);
    }

    let forwarded_chain = forwarded_ip_chain(headers);
    if forwarded_chain.is_empty() {
        return Some(peer_ip);
    }

    let mut current = peer_ip;
    for candidate in forwarded_chain.iter().rev() {
        if !is_trusted_proxy(current, &config.server.trusted_proxy_cidrs) {
            break;
        }
        current = *candidate;
    }

    Some(current)
}

fn is_trusted_proxy(ip: IpAddr, trusted_proxy_cidrs: &[IpNet]) -> bool {
    trusted_proxy_cidrs.iter().any(|cidr| cidr.contains(&ip))
}

fn forwarded_ip_chain(headers: &HeaderMap) -> Vec<IpAddr> {
    let x_forwarded_for = headers
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .map(parse_x_forwarded_for)
        .unwrap_or_default();

    if !x_forwarded_for.is_empty() {
        return x_forwarded_for;
    }

    headers
        .get("forwarded")
        .and_then(|value| value.to_str().ok())
        .map(parse_forwarded_header)
        .unwrap_or_default()
}

fn parse_x_forwarded_for(raw: &str) -> Vec<IpAddr> {
    raw.split(',')
        .filter_map(|value| parse_client_ip(Some(value.trim())))
        .collect()
}

fn parse_forwarded_header(raw: &str) -> Vec<IpAddr> {
    raw.split(',')
        .filter_map(|entry| {
            entry.split(';').find_map(|part| {
                let (key, value) = part.trim().split_once('=')?;
                if !key.eq_ignore_ascii_case("for") {
                    return None;
                }
                parse_forwarded_for_value(value)
            })
        })
        .collect()
}

fn parse_forwarded_for_value(raw: &str) -> Option<IpAddr> {
    let value = raw.trim().trim_matches('"');
    if value.eq_ignore_ascii_case("unknown") || value.starts_with('_') {
        return None;
    }

    if let Some(stripped) = value.strip_prefix('[') {
        let ip_part = stripped.split_once(']').map(|(ip, _)| ip).unwrap_or(stripped);
        return ip_part.parse::<IpAddr>().ok();
    }

    parse_client_ip(Some(value))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bootstrap::config::{AppConfig, DatabaseConfig, DeployTarget, OAuthConfig, OidcConfig, RateLimitConfig, RedisConfig, ServerConfig, ServerMode, StorageConfig, WebauthnConfig};
    use actix_web::http::header::HeaderName;

    fn test_config(trusted_proxy_cidrs: &[&str]) -> AppConfig {
        AppConfig {
            mode: ServerMode::Test,
            deploy_target: DeployTarget::Local,
            server: ServerConfig {
                host: "0.0.0.0".into(),
                port: 5170,
                issuer_url: "https://auth.example.com".into(),
                frontend_url: "https://app.example.com".into(),
                admin_url: "https://admin.example.com".into(),
                trusted_proxy_cidrs: trusted_proxy_cidrs.iter().map(|value| value.parse().unwrap()).collect(),
                max_logo_bytes: 8 * 1024 * 1024,
            },
            database: DatabaseConfig { url: "postgres://postgres:postgres@127.0.0.1:5432/rooiam".into() },
            redis: RedisConfig { url: "redis://127.0.0.1:6379".into() },
            storage: StorageConfig { root: "/tmp/rooiam".into(), public_media_base: "/media".into() },
            oauth: OAuthConfig {
                google_client_id: String::new(),
                google_client_secret: String::new(),
                microsoft_client_id: String::new(),
                microsoft_client_secret: String::new(),
                google_redirect_uri: "https://auth.example.com/api/v1/auth/google/callback".into(),
                microsoft_redirect_uri: "https://auth.example.com/api/v1/auth/microsoft/callback".into(),
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
    fn ignores_forwarded_headers_from_untrusted_peers() {
        let config = test_config(&[]);
        let mut headers = HeaderMap::new();
        headers.insert(HeaderName::from_static("x-forwarded-for"), "198.51.100.77".parse().unwrap());

        let resolved = resolve_client_ip(Some("203.0.113.10:443"), &headers, &config);

        assert_eq!(resolved, Some("203.0.113.10".parse().unwrap()));
    }

    #[test]
    fn uses_rightmost_untrusted_ip_when_peer_is_trusted_proxy() {
        let config = test_config(&["10.0.0.0/8"]);
        let mut headers = HeaderMap::new();
        headers.insert(
            HeaderName::from_static("x-forwarded-for"),
            "1.1.1.1, 198.51.100.77, 10.1.2.3".parse().unwrap(),
        );

        let resolved = resolve_client_ip(Some("10.2.3.4:443"), &headers, &config);

        assert_eq!(resolved, Some("198.51.100.77".parse().unwrap()));
    }

    #[test]
    fn parses_forwarded_header_entries() {
        let config = test_config(&["10.0.0.0/8"]);
        let mut headers = HeaderMap::new();
        headers.insert(
            HeaderName::from_static("forwarded"),
            r#"for=198.51.100.77;proto=https, for="[2001:db8::10]:1234""#.parse().unwrap(),
        );

        let resolved = resolve_client_ip(Some("10.2.3.4:443"), &headers, &config);

        assert_eq!(resolved, Some("2001:db8::10".parse().unwrap()));
    }
}
