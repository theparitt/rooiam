use ipnet::IpNet;
use sqlx::{Connection, Executor};
use std::collections::HashSet;
use std::{env, fs};
use url::Url;

/// Server operating mode. Set via `ROOIAM_MODE`.
///
/// | Mode         | Demo seed | Demo-login route | 127.0.0.1 trusted proxy |
/// |--------------|-----------|-----------------|-------------------------|
/// | Production   | no        | no              | no                      |
/// | Demo         | yes       | yes             | no                      |
/// | Test         | no        | yes             | yes (for IP spoofing)   |
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ServerMode {
    Production,
    Demo,
    Test,
}

impl ServerMode {
    /// Load from `ROOIAM_MODE`. Must be explicitly set.
    pub fn from_env() -> Self {
        maybe_load_default_dotenv();

        let mode_var = env::var("ROOIAM_MODE")
            .map(|v| v.trim().to_ascii_lowercase())
            .map_err(|_| {
                eprintln!("ERROR: ROOIAM_MODE is not set.");
                eprintln!("Set ROOIAM_MODE to one of: production, demo, test");
                eprintln!("Example: ROOIAM_MODE=production cargo run");
                std::process::exit(1);
            })
            .unwrap();

        match mode_var.as_str() {
            "production" | "prod" => ServerMode::Production,
            "demo" => ServerMode::Demo,
            "test" => ServerMode::Test,
            _ => {
                eprintln!("ERROR: Invalid ROOIAM_MODE='{}'", mode_var);
                eprintln!("Valid values: production, demo, test");
                std::process::exit(1);
            }
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            ServerMode::Production => "production",
            ServerMode::Demo => "demo",
            ServerMode::Test => "test",
        }
    }

    /// Whether the demo seed should run at startup.
    pub fn seed_on_startup(&self) -> bool {
        matches!(self, ServerMode::Demo)
    }

    /// Whether the `/v1/demo/login` endpoint is active.
    pub fn demo_routes_enabled(&self) -> bool {
        matches!(self, ServerMode::Demo | ServerMode::Test)
    }

    /// Whether `127.0.0.1` should be automatically added to trusted proxies.
    /// Enabled in test mode so `X-Forwarded-For` works without extra config.
    pub fn trust_localhost_proxy(&self) -> bool {
        matches!(self, ServerMode::Test)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DeployTarget {
    Local,
    Public,
}

impl DeployTarget {
    pub fn from_env() -> Self {
        maybe_load_default_dotenv();

        let target_var = env::var("ROOIAM_DEPLOY_TARGET")
            .map(|v| v.trim().to_ascii_lowercase())
            .map_err(|_| {
                eprintln!("ERROR: ROOIAM_DEPLOY_TARGET is not set.");
                eprintln!("Set ROOIAM_DEPLOY_TARGET to one of: local, public");
                eprintln!("Example: ROOIAM_DEPLOY_TARGET=local cargo run");
                std::process::exit(1);
            })
            .unwrap();

        match target_var.as_str() {
            "local" => DeployTarget::Local,
            "public" => DeployTarget::Public,
            _ => {
                eprintln!("ERROR: Invalid ROOIAM_DEPLOY_TARGET='{}'", target_var);
                eprintln!("Valid values: local, public");
                std::process::exit(1);
            }
        }
    }

    pub fn label(&self) -> &'static str {
        match self {
            DeployTarget::Local => "local",
            DeployTarget::Public => "public",
        }
    }

    pub fn prefers_env_urls(&self) -> bool {
        matches!(self, DeployTarget::Local)
    }
}

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub mode: ServerMode,
    pub deploy_target: DeployTarget,
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub redis: RedisConfig,
    pub storage: StorageConfig,
    pub oauth: OAuthConfig,
    pub oidc: OidcConfig,
    pub webauthn: WebauthnConfig,
    pub rate_limit: RateLimitConfig,
    pub device_attestation: DeviceAttestationConfig,
}

#[derive(Clone, Debug)]
pub struct RateLimitConfig {
    /// Max requests per minute per endpoint in /auth/* (e.g. magic link send)
    pub auth_per_endpoint: u64,
    /// Max requests per minute per IP across all /auth/* endpoints
    pub auth_per_ip: u64,
    /// Max requests per minute per endpoint in /identity/* (e.g. /identity/me)
    pub identity_per_endpoint: u64,
    /// Max requests per minute per IP across all /identity/* endpoints
    pub identity_per_ip: u64,
    /// Max requests per minute per endpoint in /orgs/*
    pub orgs_per_endpoint: u64,
    /// Max requests per minute per IP across all /orgs/* endpoints
    pub orgs_per_ip: u64,
    /// Max requests per minute per endpoint in /oauth/* (social login start/callback)
    pub oauth_per_endpoint: u64,
    /// Max requests per minute per IP across all /oauth/* endpoints
    pub oauth_per_ip: u64,
    /// Max requests per minute per endpoint in /webauthn/login/* (passkey login)
    pub webauthn_per_endpoint: u64,
    /// Max requests per minute per IP across all /webauthn/login/* endpoints
    pub webauthn_per_ip: u64,
}

#[derive(Clone, Debug)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub issuer_url: String,
    pub frontend_url: String,
    pub admin_url: String,
    pub trusted_proxy_cidrs: Vec<IpNet>,
    /// Max logo upload size in bytes (default 8MB). Set via ROOIAM_MAX_LOGO_BYTES.
    pub max_logo_bytes: usize,
}

#[derive(Clone, Debug)]
pub struct DatabaseConfig {
    pub url: String,
}

#[derive(Clone, Debug)]
pub struct RedisConfig {
    pub url: String,
}

#[derive(Clone, Debug)]
pub struct StorageConfig {
    pub root: String,
    pub public_media_base: String,
}

#[derive(Clone, Debug)]
pub struct OAuthConfig {
    pub google_client_id: String,
    pub google_client_secret: String,
    pub microsoft_client_id: String,
    pub microsoft_client_secret: String,
    pub google_redirect_uri: String,
    pub microsoft_redirect_uri: String,
    pub microsoft_tenant_id: String,
    pub google_redirect_uri_explicit: bool,
    pub microsoft_redirect_uri_explicit: bool,
}

#[derive(Clone, Debug)]
pub struct OidcConfig {
    pub signing_secret: String,
    pub private_key_pem: Option<String>,
    pub public_key_pem: Option<String>,
    pub key_id: String,
}

#[derive(Clone, Debug)]
pub struct WebauthnConfig {
    pub rp_id: String,
    pub rp_name: String,
    pub origin: String,
    pub extra_origins: Vec<String>,
    pub allow_any_port: bool,
}

#[derive(Clone, Debug)]
pub struct DeviceAttestationConfig {
    pub apple_app_id_prefix: Option<String>,
    pub google_play_service_account_email: Option<String>,
    pub google_play_service_account_private_key_pem: Option<String>,
    pub google_play_token_uri: String,
}

impl AppConfig {
    /// Validate environment variables for the given mode.
    ///
    /// Prints every var with its resolved value:
    ///   [ OK      ]  VAR = value
    ///   [ DEFAULT ]  VAR = value  (not set, using built-in default)
    ///   [ WARN    ]  VAR not set — reason
    ///   [ MISSING ]  VAR — hint
    ///   [ IGNORE  ]  VAR is set but not used in this mode
    ///
    /// Exits immediately if any required var is absent so the operator sees the full list at once.
    pub fn check_env(mode: &ServerMode, deploy_target: &DeployTarget) {
        println!();
        println!(
            "  Rooiam — environment check  mode={} deploy_target={}",
            mode.label(),
            deploy_target.label()
        );
        println!("  ═══════════════════════════════════════════════════════════════");

        let mut bad = false;

        // ── Server ─────────────────────────────────────────────────────────────
        section("Server");
        check_required_val("ROOIAM_MODE", "production | demo | test", &mut bad);
        check_required_val("ROOIAM_DEPLOY_TARGET", "local | public", &mut bad);
        check_required_val(
            "ROOIAM_SERVER_URL",
            "public HTTPS URL of this API, e.g. https://api.example.com",
            &mut bad,
        );
        check_required_val(
            "ROOIAM_APP_URL",
            "public URL of the tenant portal, e.g. https://app.example.com",
            &mut bad,
        );
        check_required_val(
            "ROOIAM_ADMIN_URL",
            "public URL of the admin console, e.g. https://admin.example.com",
            &mut bad,
        );
        check_required_val(
            "ROOIAM_HOST",
            "bind address, e.g. 0.0.0.0 or 127.0.0.1",
            &mut bad,
        );
        check_required_val("ROOIAM_PORT", "port number, e.g. 5170 or 5180", &mut bad);
        check_optional_val(
            "ROOIAM_ENDUSER_URL",
            "demo-only downstream end-user app URL, e.g. candycloud-web",
        );
        check_optional_val(
            "ROOIAM_LANDING_URL",
            "landing page URL (informational only)",
        );
        check_optional_val("ROOIAM_DOCS_URL", "docs site URL (informational only)");
        check_optional_val(
            "ROOIAM_ALLOWED_ORIGINS",
            "extra CORS origins beyond app+admin URLs",
        );
        check_optional_val(
            "ROOIAM_TRUSTED_PROXY_CIDRS",
            "CIDR list for trusted reverse proxies — X-Forwarded-For is ignored without this",
        );
        check_optional_val(
            "ROOIAM_MAX_LOGO_BYTES",
            "max logo upload size (default 8388608 = 8MB)",
        );

        // ── Cookie ─────────────────────────────────────────────────────────────
        section("Cookie");
        check_required_val(
            "ROOIAM_COOKIE_SECURE",
            "true (HTTPS / production) or false (local HTTP dev)",
            &mut bad,
        );
        check_warn_val(
            "ROOIAM_COOKIE_DOMAIN",
            "not set — cookie is host-only on the API origin; \
             Safari/Firefox ITP blocks cross-subdomain requests. \
             Set to parent domain, e.g. rooiam.com",
        );

        section("Deploy target");
        match deploy_target {
            DeployTarget::Local => {
                check_local_target_url("ROOIAM_SERVER_URL");
                check_local_target_url("ROOIAM_APP_URL");
                check_local_target_url("ROOIAM_ADMIN_URL");
                check_expected_bool(
                    "ROOIAM_COOKIE_SECURE",
                    false,
                    "local runs should usually use plain HTTP",
                );
                check_expected_empty_or_loopback_domain("ROOIAM_COOKIE_DOMAIN");
            }
            DeployTarget::Public => {
                check_public_target_url("ROOIAM_SERVER_URL", &mut bad);
                check_public_target_url("ROOIAM_APP_URL", &mut bad);
                check_public_target_url("ROOIAM_ADMIN_URL", &mut bad);
                check_expected_bool_strict("ROOIAM_COOKIE_SECURE", true, &mut bad);
            }
        }

        // ── Database ───────────────────────────────────────────────────────────
        section("Database");
        check_required_secret(
            "ROOIAM_DATABASE_URL",
            "postgres://user:pass@host:5432/rooiam",
            &mut bad,
        );

        // ── Redis ──────────────────────────────────────────────────────────────
        section("Redis");
        check_required_val(
            "ROOIAM_REDIS_URL",
            "full Redis URL, e.g. redis://host:6379",
            &mut bad,
        );

        // ── Storage ────────────────────────────────────────────────────────────
        section("Storage");
        check_optional_val(
            "ROOIAM_STORAGE_ROOT",
            "local file storage root (default <cwd>/.localdata/rooiam)",
        );
        check_optional_val(
            "ROOIAM_PUBLIC_MEDIA_BASE",
            "public base URL or path for uploaded media (default /media; old stored URLs are not rewritten)",
        );
        check_optional_val(
            "ROOIAM_MINIO_ENDPOINT",
            "MinIO endpoint, e.g. http://minio:9000",
        );
        check_optional_val("ROOIAM_MINIO_BUCKET", "MinIO bucket name");
        check_optional_secret(
            "ROOIAM_MINIO_USER",
            "MinIO access key (falls back to MINIO_ROOT_USER)",
        );
        check_optional_secret(
            "ROOIAM_MINIO_PASSWORD",
            "MinIO secret key (falls back to MINIO_ROOT_PASSWORD)",
        );

        // ── OIDC Signing ───────────────────────────────────────────────────────
        section("OIDC Signing");
        let has_rsa = std::env::var("ROOIAM_OIDC_PRIVATE_KEY_PEM")
            .map(|v| !v.trim().is_empty())
            .unwrap_or(false)
            || std::env::var("ROOIAM_OIDC_PRIVATE_KEY_PATH")
                .map(|v| !v.trim().is_empty())
                .unwrap_or(false);
        if has_rsa {
            check_optional_val(
                "ROOIAM_OIDC_PRIVATE_KEY_PATH",
                "path to RSA private key PEM (RS256 signing)",
            );
            check_optional_val(
                "ROOIAM_OIDC_PUBLIC_KEY_PATH",
                "path to RSA public key PEM (RS256 verification)",
            );
            check_optional_val("ROOIAM_OIDC_PRIVATE_KEY_PEM", "RSA private key PEM inline");
            check_optional_val("ROOIAM_OIDC_PUBLIC_KEY_PEM", "RSA public key PEM inline");
            check_optional_val(
                "ROOIAM_OIDC_KEY_ID",
                "key ID for JWKS (default rooiam-rs256-1)",
            );
        } else {
            println!("  [ WARN    ]  ROOIAM_OIDC_PRIVATE_KEY_PEM / _PATH not set");
            println!("               → using HS256 with ROOIAM_OIDC_SIGNING_SECRET (dev only)");
            check_warn_val(
                "ROOIAM_OIDC_SIGNING_SECRET",
                "not set — using a generated dev secret (not safe for production)",
            );
            check_warn_val(
                "ROOIAM_JWT_SECRET",
                "legacy alias for ROOIAM_OIDC_SIGNING_SECRET (ignored if signing secret is set)",
            );
        }

        // ── WebAuthn ───────────────────────────────────────────────────────────
        section("WebAuthn");
        check_optional_val(
            "ROOIAM_WEBAUTHN_RP_ID",
            "relying-party ID (default: host from ROOIAM_SERVER_URL)",
        );
        check_optional_val(
            "ROOIAM_WEBAUTHN_RP_NAME",
            "relying-party display name (default: Rooiam)",
        );
        check_optional_val(
            "ROOIAM_WEBAUTHN_ORIGIN",
            "primary WebAuthn origin (default: ROOIAM_SERVER_URL)",
        );
        check_optional_val(
            "ROOIAM_WEBAUTHN_EXTRA_ORIGINS",
            "comma-separated extra origins allowed for passkeys",
        );
        check_optional_val(
            "ROOIAM_WEBAUTHN_ALLOW_ANY_PORT",
            "true to allow any port on the RP ID (default: true when RP ID is localhost)",
        );

        // ── OAuth Providers ────────────────────────────────────────────────────
        section("OAuth Providers");
        check_optional_secret(
            "ROOIAM_GOOGLE_CLIENT_ID",
            "Google OAuth client ID (required for Google login)",
        );
        check_optional_secret("ROOIAM_GOOGLE_CLIENT_SECRET", "Google OAuth client secret");
        check_optional_val(
            "ROOIAM_GOOGLE_REDIRECT_URI",
            "override default Google callback URL",
        );
        check_optional_secret(
            "ROOIAM_MICROSOFT_CLIENT_ID",
            "Microsoft OAuth client ID (required for MS login)",
        );
        check_optional_secret(
            "ROOIAM_MICROSOFT_CLIENT_SECRET",
            "Microsoft OAuth client secret",
        );
        check_optional_val(
            "ROOIAM_MICROSOFT_TENANT_ID",
            "Microsoft tenant (default: common)",
        );
        check_optional_val(
            "ROOIAM_MICROSOFT_REDIRECT_URI",
            "override default Microsoft callback URL",
        );

        section("Device attestation");
        check_optional_val(
            "ROOIAM_APPLE_APP_ID_PREFIX",
            "Apple Team ID / App ID prefix for App Attest verification",
        );
        check_optional_val(
            "ROOIAM_GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL",
            "Google service-account email for Play Integrity backend verification",
        );
        check_optional_val(
            "ROOIAM_GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY_PATH",
            "path to Google service-account private key PEM for Play Integrity",
        );
        check_optional_secret(
            "ROOIAM_GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY_PEM",
            "inline Google service-account private key PEM for Play Integrity",
        );
        check_optional_val(
            "ROOIAM_GOOGLE_PLAY_TOKEN_URI",
            "Google OAuth token URI for Play Integrity backend verification",
        );

        // ── Mode-specific ──────────────────────────────────────────────────────
        match mode {
            ServerMode::Production => {
                section("Production");
                check_required_secret(
                    "ROOIAM_SETUP_TOKEN",
                    "random secret for the setup wizard (openssl rand -hex 32)",
                    &mut bad,
                );
                check_warn_val(
                    "ROOIAM_SMTP_HOST",
                    "not set — email (magic links, invites, alerts) will not work",
                );
                check_optional_val("ROOIAM_SMTP_PORT", "SMTP port (default 587)");
                check_optional_val(
                    "ROOIAM_SMTP_SECURITY",
                    "none | starttls | tls (default starttls)",
                );
                check_optional_val("ROOIAM_SMTP_FROM", "sender address for outgoing email");
                check_optional_secret("ROOIAM_SMTP_USER", "SMTP username");
                check_optional_secret("ROOIAM_SMTP_PASS", "SMTP password");
                check_optional_val(
                    "ROOIAM_MAILBOX_URL",
                    "mailbox UI URL used as a setup-wizard default, e.g. http://localhost:8025",
                );
                println!("  ── not used in production mode ─────────────────────────────────");
                check_not_used("ROOIAM_DEMO_SMTP_HOST", &mut bad);
                check_not_used("ROOIAM_DEMO_SMTP_PORT", &mut bad);
                check_not_used("ROOIAM_DEMO_SMTP_FROM", &mut bad);
                check_not_used("ROOIAM_DEMO_MAILBOX_URL", &mut bad);
                check_not_used("ROOIAM_ENABLE_DEMO_SEED", &mut bad);
            }
            ServerMode::Demo => {
                section("Demo");
                check_required_val(
                    "ROOIAM_DEMO_SMTP_HOST",
                    "Mailhog host, e.g. localhost or mailhog",
                    &mut bad,
                );
                check_required_val(
                    "ROOIAM_DEMO_SMTP_PORT",
                    "Mailhog SMTP port, e.g. 1025",
                    &mut bad,
                );
                check_required_val(
                    "ROOIAM_DEMO_SMTP_FROM",
                    "from address for demo emails, e.g. demo@rooiam.local",
                    &mut bad,
                );
                check_warn_val(
                    "ROOIAM_DEMO_MAILBOX_URL",
                    "not set — mailbox link won't appear in the demo UI",
                );
                check_optional_val("ROOIAM_DEMO_APP_URL", "link to demo app shown in admin UI");
                check_optional_val(
                    "ROOIAM_DEMO_PORTAL_URL",
                    "link to demo portal shown in admin UI",
                );
                check_optional_val(
                    "ROOIAM_DEMO_ADMIN_URL",
                    "link to demo admin shown in admin UI",
                );
                println!("  ── not used in demo mode ───────────────────────────────────────");
                check_not_used("ROOIAM_SETUP_TOKEN", &mut bad);
                check_not_used("ROOIAM_SMTP_HOST", &mut bad);
            }
            ServerMode::Test => {
                section("Test");
                check_warn_val(
                    "ROOIAM_DEMO_SMTP_HOST",
                    "not set — Mailhog check will be skipped",
                );
            }
        }

        // ── Rate limits (informational only) ───────────────────────────────────
        section("Rate limits (overrides — all optional)");
        for suffix in &[
            "AUTH_PER_ENDPOINT",
            "AUTH_PER_IP",
            "IDENTITY_PER_ENDPOINT",
            "IDENTITY_PER_IP",
            "ORGS_PER_ENDPOINT",
            "ORGS_PER_IP",
            "OAUTH_PER_ENDPOINT",
            "OAUTH_PER_IP",
            "WEBAUTHN_PER_ENDPOINT",
            "WEBAUTHN_PER_IP",
        ] {
            let key = format!("ROOIAM_RATE_{}", suffix);
            match std::env::var(&key) {
                Ok(v) if !v.trim().is_empty() => println!("  [ OK      ]  {} = {}", key, v.trim()),
                _ => {}
            }
        }
        println!(
            "  (unset rate-limit vars use compiled-in defaults for mode={})",
            mode.label()
        );

        println!("  ═══════════════════════════════════════════════════════════════");

        validate_unexpected_rooiam_vars(mode, &mut bad);

        if bad {
            eprintln!();
            eprintln!(
                "  FATAL: required or inconsistent environment variables detected (mode={}, deploy_target={}).",
                mode.label(),
                deploy_target.label()
            );
            eprintln!("  Fix them in .env (local) or your docker-compose env-file, then restart.");
            eprintln!();
            std::process::exit(1);
        }

        println!();
    }

    pub fn from_env() -> Self {
        tracing::info!("Loading configuration...");
        let mode = ServerMode::from_env();
        let deploy_target = DeployTarget::from_env();
        let database_url = resolve_database_url(&mode);
        std::env::set_var("ROOIAM_DATABASE_URL", &database_url);
        let port = env::var("ROOIAM_PORT")
            .unwrap_or_else(|_| {
                panic!("ROOIAM_PORT is not set. Set it to the port number, e.g. 5170")
            })
            .trim()
            .parse::<u16>()
            .unwrap_or_else(|_| panic!("ROOIAM_PORT is not a valid port number"));
        let normalized_issuer = load_public_url("ROOIAM_SERVER_URL");
        let frontend_url = load_public_url("ROOIAM_APP_URL");
        let admin_url = load_public_url("ROOIAM_ADMIN_URL");
        let default_google_redirect = format!("{}/api/v1/auth/google/callback", normalized_issuer);
        let default_microsoft_redirect =
            format!("{}/api/v1/auth/microsoft/callback", normalized_issuer);

        let max_logo_bytes = env::var("ROOIAM_MAX_LOGO_BYTES")
            .ok()
            .and_then(|v| v.trim().parse::<usize>().ok())
            .unwrap_or(8 * 1024 * 1024); // default 8MB
        let storage_root = env_str(
            "ROOIAM_STORAGE_ROOT",
            &format!(
                "{}/.localdata/rooiam",
                env::current_dir().unwrap_or_else(|_| ".".into()).display()
            ),
        );
        let public_media_base =
            normalize_public_media_base(env_str("ROOIAM_PUBLIC_MEDIA_BASE", "/media"));

        let mut trusted_proxy_cidrs = load_trusted_proxy_cidrs();
        if mode.trust_localhost_proxy() {
            let localhost: IpNet = "127.0.0.1/32".parse().unwrap();
            if !trusted_proxy_cidrs.contains(&localhost) {
                trusted_proxy_cidrs.push(localhost);
            }
        }

        Self {
            mode: mode.clone(),
            deploy_target,
            server: ServerConfig {
                host: env::var("ROOIAM_HOST")
                    .unwrap_or_else(|_| panic!("ROOIAM_HOST is not set. Set it to the bind address, e.g. 0.0.0.0")),
                port,
                issuer_url: normalized_issuer.clone(),
                frontend_url,
                admin_url,
                trusted_proxy_cidrs,
                max_logo_bytes,
            },
            database: DatabaseConfig {
                url: database_url,
            },
            redis: RedisConfig {
                url: env::var("ROOIAM_REDIS_URL")
                    .unwrap_or_else(|_| panic!("ROOIAM_REDIS_URL is not set. Set it to a full Redis URL, e.g. redis://host:6379")),
            },
            storage: StorageConfig {
                root: storage_root,
                public_media_base,
            },
            oauth: OAuthConfig {
                google_client_id: env_str("ROOIAM_GOOGLE_CLIENT_ID", ""),
                google_client_secret: env_str("ROOIAM_GOOGLE_CLIENT_SECRET", ""),
                microsoft_client_id: env_str("ROOIAM_MICROSOFT_CLIENT_ID", ""),
                microsoft_client_secret: env_str("ROOIAM_MICROSOFT_CLIENT_SECRET", ""),
                google_redirect_uri: default_google_redirect,
                microsoft_redirect_uri: default_microsoft_redirect,
                microsoft_tenant_id: env::var("ROOIAM_MICROSOFT_TENANT_ID")
                    .unwrap_or_else(|_| "common".to_string()),
                google_redirect_uri_explicit: false,
                microsoft_redirect_uri_explicit: false,
            },
            oidc: OidcConfig {
                signing_secret: env::var("ROOIAM_OIDC_SIGNING_SECRET")
                    .ok()
                    .or_else(|| env::var("ROOIAM_JWT_SECRET").ok())
                    .filter(|value| !value.trim().is_empty())
                    .unwrap_or_else(|| format!("dev-oidc-signing-secret-{}", port)),
                private_key_pem: load_pem("ROOIAM_OIDC_PRIVATE_KEY_PEM", "ROOIAM_OIDC_PRIVATE_KEY_PATH"),
                public_key_pem: load_pem("ROOIAM_OIDC_PUBLIC_KEY_PEM", "ROOIAM_OIDC_PUBLIC_KEY_PATH"),
                key_id: env::var("ROOIAM_OIDC_KEY_ID")
                    .unwrap_or_else(|_| "rooiam-rs256-1".to_string()),
            },
            device_attestation: DeviceAttestationConfig {
                apple_app_id_prefix: env::var("ROOIAM_APPLE_APP_ID_PREFIX")
                    .ok()
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty()),
                google_play_service_account_email: env::var(
                    "ROOIAM_GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL",
                )
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty()),
                google_play_service_account_private_key_pem: load_pem(
                    "ROOIAM_GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY_PEM",
                    "ROOIAM_GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY_PATH",
                )
                .map(|value| value.replace("\\n", "\n")),
                google_play_token_uri: env::var("ROOIAM_GOOGLE_PLAY_TOKEN_URI")
                    .unwrap_or_else(|_| "https://oauth2.googleapis.com/token".to_string()),
            },
            rate_limit: {
                // Hardcoded defaults per mode.
                // Production: strict.  Demo: relaxed (real users clicking around).
                // Test: unlimited (automated scripts).
                // Any value can be overridden via env — see env_rate() for resolution order.
                let mp = match mode {
                    ServerMode::Test       => "TEST",
                    ServerMode::Production => "PROD",
                    ServerMode::Demo       => "DEMO",
                };
                let (auth_ep, auth_ip, id_ep, id_ip, org_ep, org_ip, oauth_ep, oauth_ip, wauthn_ep, wauthn_ip) = match mode {
                    ServerMode::Test       => (u64::MAX, u64::MAX, u64::MAX, u64::MAX, u64::MAX, u64::MAX, u64::MAX, u64::MAX, u64::MAX, u64::MAX),
                    ServerMode::Production => (10,  40,  400,  1200,  60,   200,  20,  60,  10,  60),
                    ServerMode::Demo       => (30,  60,  400,  1200,  600,  2000, 60,  200, 30,  200),
                };
                RateLimitConfig {
                    auth_per_endpoint:      env_rate(mp, "AUTH_PER_ENDPOINT",      auth_ep),
                    auth_per_ip:            env_rate(mp, "AUTH_PER_IP",            auth_ip),
                    identity_per_endpoint:  env_rate(mp, "IDENTITY_PER_ENDPOINT",  id_ep),
                    identity_per_ip:        env_rate(mp, "IDENTITY_PER_IP",        id_ip),
                    orgs_per_endpoint:      env_rate(mp, "ORGS_PER_ENDPOINT",      org_ep),
                    orgs_per_ip:            env_rate(mp, "ORGS_PER_IP",            org_ip),
                    oauth_per_endpoint:     env_rate(mp, "OAUTH_PER_ENDPOINT",     oauth_ep),
                    oauth_per_ip:           env_rate(mp, "OAUTH_PER_IP",           oauth_ip),
                    webauthn_per_endpoint:  env_rate(mp, "WEBAUTHN_PER_ENDPOINT",  wauthn_ep),
                    webauthn_per_ip:        env_rate(mp, "WEBAUTHN_PER_IP",        wauthn_ip),
                }
            },
            webauthn: {
                let issuer_host = url::Url::parse(
                    &normalized_issuer
                )
                .ok()
                .and_then(|url| url.host_str().map(str::to_string))
                .unwrap_or_else(|| "localhost".to_string());

                let default_origin = if issuer_host == "localhost" {
                    "http://localhost:5171".to_string()
                } else {
                    normalized_issuer.clone()
                };

                WebauthnConfig {
                    rp_id: env::var("ROOIAM_WEBAUTHN_RP_ID")
                        .unwrap_or_else(|_| issuer_host.clone()),
                    rp_name: env::var("ROOIAM_WEBAUTHN_RP_NAME")
                        .unwrap_or_else(|_| "Rooiam".to_string()),
                    origin: env::var("ROOIAM_WEBAUTHN_ORIGIN")
                        .unwrap_or(default_origin)
                        .trim_end_matches('/')
                        .to_string(),
                    extra_origins: env::var("ROOIAM_WEBAUTHN_EXTRA_ORIGINS")
                        .unwrap_or_default()
                        .split(',')
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .map(str::to_string)
                        .collect(),
                    allow_any_port: env::var("ROOIAM_WEBAUTHN_ALLOW_ANY_PORT")
                        .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES"))
                        .unwrap_or(issuer_host == "localhost"),
                }
            },
        }
    }

    pub async fn prepare_database(&self) -> anyhow::Result<()> {
        ensure_database_exists(&self.database.url).await
    }
}

fn resolve_database_url(mode: &ServerMode) -> String {
    let base = env::var("ROOIAM_DATABASE_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| panic!("ROOIAM_DATABASE_URL is required. Set a full postgres URL like postgres://user:pass@host:5432/rooiam"));

    let target_db = match mode {
        ServerMode::Production => return base,
        ServerMode::Demo => "rooiam_demo",
        ServerMode::Test => "rooiam_test",
    };

    swap_database_name(&base, target_db)
}

fn swap_database_name(raw_url: &str, db_name: &str) -> String {
    let mut url = Url::parse(raw_url)
        .unwrap_or_else(|_| panic!("Invalid ROOIAM_DATABASE_URL. Use a full postgres URL like postgres://user:pass@host:5432/rooiam"));
    url.set_path(&format!("/{}", db_name));
    url.to_string()
}

async fn ensure_database_exists(database_url: &str) -> anyhow::Result<()> {
    let url = Url::parse(database_url)
        .unwrap_or_else(|_| panic!("Invalid ROOIAM_DATABASE_URL. Use a full postgres URL like postgres://user:pass@host:5432/rooiam"));
    let db_name = url.path().trim_start_matches('/').to_string();
    if db_name.is_empty() {
        anyhow::bail!("ROOIAM_DATABASE_URL is missing a database name");
    }

    let mut admin_url = url.clone();
    admin_url.set_path("/postgres");
    admin_url.set_query(None);
    admin_url.set_fragment(None);

    let mut conn = sqlx::postgres::PgConnection::connect(admin_url.as_str()).await?;
    let quoted_db = db_name.replace('"', "\"\"");
    let create_sql = format!("CREATE DATABASE \"{}\"", quoted_db);
    match conn.execute(create_sql.as_str()).await {
        Ok(_) => tracing::info!("Created database `{}` for current server mode.", db_name),
        Err(err) => {
            let message = err.to_string();
            let already_exists = message.contains("already exists")
                || message.contains("duplicate_database")
                || message.contains("42P04");
            if !already_exists {
                return Err(err.into());
            }
        }
    }
    Ok(())
}

fn load_trusted_proxy_cidrs() -> Vec<IpNet> {
    env::var("ROOIAM_TRUSTED_PROXY_CIDRS")
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            value.parse::<IpNet>().unwrap_or_else(|_| {
                panic!(
                    "Invalid ROOIAM_TRUSTED_PROXY_CIDRS entry `{}`. Use CIDR values like `10.0.0.0/8` or `127.0.0.1/32`.",
                    value
                )
            })
        })
        .collect()
}

/// Read an env var and strip any trailing \r (Windows line endings from .env files).
fn env_str(key: &str, default: &str) -> String {
    std::env::var(key)
        .unwrap_or_else(|_| default.to_string())
        .trim_end_matches('\r')
        .to_string()
}

fn normalize_public_media_base(raw: String) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed == "/" {
        return "/media".to_string();
    }

    // A full URL (e.g. https://api.example.com/media) is kept verbatim — only the
    // trailing slash is trimmed. A bare path gets a leading slash. The bug this
    // guards against: blindly prepending "/" to a full URL produced
    // "/https://api.example.com/media", which then doubled into the asset URL.
    // Semantics:
    // - "/media" stores root-relative URLs like /media/uploads/...
    // - "https://api.example.com/media" stores fully-qualified URLs
    //
    // Important: this affects future stored URLs only. It does not rewrite
    // stale absolute media URLs already present in the database.
    let is_absolute = trimmed.starts_with("http://") || trimmed.starts_with("https://");
    let mut normalized = if is_absolute || trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{}", trimmed)
    };

    while normalized.len() > 1 && normalized.ends_with('/') {
        normalized.pop();
    }

    normalized
}

fn load_public_url(var: &str) -> String {
    let raw = match env::var(var) {
        Ok(value) if !value.trim().is_empty() => value,
        Ok(_) => panic!(
            "{} is set but empty. Use a full URL like https://auth.example.com",
            var
        ),
        Err(_) => {
            panic!(
                "{} is not set. Set ROOIAM_SERVER_URL, ROOIAM_APP_URL, and ROOIAM_ADMIN_URL.",
                var
            )
        }
    };
    let trimmed = raw.trim();
    let parsed = Url::parse(trimmed).unwrap_or_else(|_| {
        panic!(
            "Invalid {}. Use a full URL like https://auth.example.com",
            var
        )
    });

    let mut normalized = parsed.to_string();
    while normalized.ends_with('/') {
        normalized.pop();
    }
    normalized
}

/// Look up a rate-limit value with a mode-specific prefix fallback.
///
/// Resolution order:
///   1. `ROOIAM_RATE_{MODE_PREFIX}_{SUFFIX}` — mode-specific override (e.g. `ROOIAM_RATE_DEMO_AUTH_PER_ENDPOINT`)
///   2. `ROOIAM_RATE_{SUFFIX}`               — generic override       (e.g. `ROOIAM_RATE_AUTH_PER_ENDPOINT`)
///   3. `hardcoded_default`                  — compiled-in fallback
fn env_rate(mode_prefix: &str, suffix: &str, hardcoded_default: u64) -> u64 {
    let mode_key = format!("ROOIAM_RATE_{}_{}", mode_prefix, suffix);
    let generic_key = format!("ROOIAM_RATE_{}", suffix);
    std::env::var(&mode_key)
        .ok()
        .or_else(|| std::env::var(&generic_key).ok())
        .and_then(|v| v.trim().parse::<u64>().ok())
        .unwrap_or(hardcoded_default)
}

fn check_local_target_url(key: &str) {
    match env::var(key) {
        Ok(value) if !value.trim().is_empty() => {
            if !is_local_url(value.trim()) {
                println!("  [ WARN    ]  {} = {}", key, value.trim());
                println!(
                    "               → ROOIAM_DEPLOY_TARGET=local usually expects localhost/loopback URLs"
                );
            }
        }
        _ => {}
    }
}

fn check_public_target_url(key: &str, bad: &mut bool) {
    match env::var(key) {
        Ok(value) if !value.trim().is_empty() => {
            if !is_public_url(value.trim()) {
                println!(
                    "  [ MISSING ]  {} — public deployments must use non-local HTTPS URLs",
                    key
                );
                *bad = true;
            }
        }
        _ => {}
    }
}

fn check_expected_bool(key: &str, expected: bool, reason: &str) {
    if let Ok(value) = env::var(key) {
        if let Some(parsed) = parse_bool_like(&value) {
            if parsed != expected {
                println!("  [ WARN    ]  {} = {}", key, value.trim());
                println!("               → expected {} because {}", expected, reason);
            }
        }
    }
}

fn check_expected_bool_strict(key: &str, expected: bool, bad: &mut bool) {
    if let Ok(value) = env::var(key) {
        if parse_bool_like(&value) != Some(expected) {
            println!(
                "  [ MISSING ]  {} — expected {} for this deploy target",
                key, expected
            );
            *bad = true;
        }
    }
}

fn check_expected_empty_or_loopback_domain(key: &str) {
    if let Ok(value) = env::var(key) {
        let trimmed = value.trim().trim_start_matches('.');
        if !trimmed.is_empty() && !is_loopback_host(trimmed) {
            println!("  [ WARN    ]  {} = {}", key, value.trim());
            println!("               → local deployments should usually omit ROOIAM_COOKIE_DOMAIN");
        }
    }
}

fn parse_bool_like(value: &str) -> Option<bool> {
    match value.trim().to_ascii_lowercase().as_str() {
        "1" | "true" | "yes" | "on" => Some(true),
        "0" | "false" | "no" | "off" => Some(false),
        _ => None,
    }
}

fn is_public_url(value: &str) -> bool {
    let Ok(parsed) = Url::parse(value) else {
        return false;
    };
    parsed.scheme() == "https"
        && parsed
            .host_str()
            .map(|host| !is_loopback_host(host))
            .unwrap_or(false)
}

fn is_local_url(value: &str) -> bool {
    let Ok(parsed) = Url::parse(value) else {
        return false;
    };
    parsed.host_str().map(is_loopback_host).unwrap_or(false)
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

fn load_pem(value_var: &str, path_var: &str) -> Option<String> {
    if let Ok(value) = env::var(value_var) {
        if !value.trim().is_empty() {
            return Some(value);
        }
    }

    let path = env::var(path_var).ok()?;
    let content = fs::read_to_string(path).ok()?;
    if content.trim().is_empty() {
        None
    } else {
        Some(content)
    }
}

// ── check_env helpers ────────────────────────────────────────────────────────

fn section(name: &str) {
    println!();
    println!("  ── {} ", name);
}

/// Required var — shows actual value or [ MISSING ]. Sets missing flag if absent.
fn check_required_val(key: &str, hint: &str, missing: &mut bool) {
    match std::env::var(key) {
        Ok(val) if !val.trim().is_empty() => {
            println!("  [ OK      ]  {} = {}", key, val.trim());
        }
        Ok(_) => {
            eprintln!("  [ MISSING ]  {} — {}", key, hint);
            *missing = true;
        }
        Err(_) => {
            eprintln!("  [ MISSING ]  {} — {}", key, hint);
            *missing = true;
        }
    }
}

/// Required secret var — shows masked value (***) or [ MISSING ]. Sets missing flag if absent.
fn check_required_secret(key: &str, hint: &str, missing: &mut bool) {
    match std::env::var(key) {
        Ok(val) if !val.trim().is_empty() => {
            println!("  [ OK      ]  {} = ***", key);
        }
        Ok(_) => {
            eprintln!("  [ MISSING ]  {} — {}", key, hint);
            *missing = true;
        }
        Err(_) => {
            eprintln!("  [ MISSING ]  {} — {}", key, hint);
            *missing = true;
        }
    }
}

/// Optional var — shows value if set, skips otherwise (no noise for truly optional vars).
fn check_optional_val(key: &str, hint: &str) {
    match std::env::var(key) {
        Ok(val) if !val.trim().is_empty() => {
            println!("  [ OK      ]  {} = {}", key, val.trim());
        }
        _ => {
            println!("  [ -       ]  {} not set  ({})", key, hint);
        }
    }
}

/// Optional secret var — shows masked value if set, skips otherwise.
fn check_optional_secret(key: &str, hint: &str) {
    match std::env::var(key) {
        Ok(val) if !val.trim().is_empty() => {
            println!("  [ OK      ]  {} = ***", key);
        }
        _ => {
            println!("  [ -       ]  {} not set  ({})", key, hint);
        }
    }
}

/// Optional-but-important var — shows value or [ WARN ] with a reason.
fn check_warn_val(key: &str, reason: &str) {
    match std::env::var(key) {
        Ok(val) if !val.trim().is_empty() => {
            println!("  [ OK      ]  {} = {}", key, val.trim());
        }
        _ => {
            println!("  [ WARN    ]  {} not set — {}", key, reason);
        }
    }
}

/// Prints [ IGNORE ] if a var from another mode is present, so the user knows it's harmless.
fn check_not_used(key: &str, bad: &mut bool) {
    if std::env::var(key)
        .map(|v| !v.trim().is_empty())
        .unwrap_or(false)
    {
        eprintln!("  [ UNEXPECTED ]  {} is set but not used in this mode", key);
        *bad = true;
    }
}

fn validate_unexpected_rooiam_vars(mode: &ServerMode, bad: &mut bool) {
    let allowed = allowed_rooiam_env_vars(mode);
    let allowed_prefixes = [
        "ROOIAM_RATE_",
        "ROOIAM_OIDC_PRIVATE_KEY_",
        "ROOIAM_OIDC_PUBLIC_KEY_",
    ];

    let mut unexpected: Vec<String> = std::env::vars()
        .map(|(key, _)| key)
        .filter(|key| key.starts_with("ROOIAM_"))
        .filter(|key| !allowed.contains(key.as_str()))
        .filter(|key| {
            !allowed_prefixes
                .iter()
                .any(|prefix| key.starts_with(prefix))
        })
        .collect();

    unexpected.sort();
    unexpected.dedup();

    if unexpected.is_empty() {
        return;
    }

    section("Strict env contract");
    for key in unexpected {
        eprintln!(
            "  [ UNEXPECTED ]  {} is not a recognized server env variable",
            key
        );
        *bad = true;
    }
}

fn maybe_load_default_dotenv() {
    let has_explicit_mode = std::env::var_os("ROOIAM_MODE").is_some();
    let has_explicit_target = std::env::var_os("ROOIAM_DEPLOY_TARGET").is_some();
    if has_explicit_mode || has_explicit_target {
        return;
    }

    let _ = dotenvy::dotenv();
}

fn allowed_rooiam_env_vars(mode: &ServerMode) -> HashSet<&'static str> {
    let mut keys = HashSet::from([
        "ROOIAM_MODE",
        "ROOIAM_DEPLOY_TARGET",
        "ROOIAM_SERVER_URL",
        "ROOIAM_APP_URL",
        "ROOIAM_ADMIN_URL",
        "ROOIAM_ENDUSER_URL",
        "ROOIAM_LANDING_URL",
        "ROOIAM_DOCS_URL",
        "ROOIAM_HOST",
        "ROOIAM_PORT",
        "ROOIAM_ALLOWED_ORIGINS",
        "ROOIAM_TRUSTED_PROXY_CIDRS",
        "ROOIAM_MAX_LOGO_BYTES",
        "ROOIAM_COOKIE_SECURE",
        "ROOIAM_COOKIE_DOMAIN",
        "ROOIAM_DATABASE_URL",
        "ROOIAM_DB_POOL_SIZE",
        "ROOIAM_REDIS_URL",
        "ROOIAM_STORAGE_ROOT",
        "ROOIAM_PUBLIC_MEDIA_BASE",
        "ROOIAM_MINIO_ENDPOINT",
        "ROOIAM_MINIO_BUCKET",
        "ROOIAM_MINIO_USER",
        "ROOIAM_MINIO_PASSWORD",
        "ROOIAM_GOOGLE_CLIENT_ID",
        "ROOIAM_GOOGLE_CLIENT_SECRET",
        "ROOIAM_GOOGLE_REDIRECT_URI",
        "ROOIAM_MICROSOFT_CLIENT_ID",
        "ROOIAM_MICROSOFT_CLIENT_SECRET",
        "ROOIAM_MICROSOFT_REDIRECT_URI",
        "ROOIAM_MICROSOFT_TENANT_ID",
        "ROOIAM_APPLE_APP_ID_PREFIX",
        "ROOIAM_GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL",
        "ROOIAM_GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY_PEM",
        "ROOIAM_GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY_PATH",
        "ROOIAM_GOOGLE_PLAY_TOKEN_URI",
        "ROOIAM_OIDC_PRIVATE_KEY_PEM",
        "ROOIAM_OIDC_PRIVATE_KEY_PATH",
        "ROOIAM_OIDC_PUBLIC_KEY_PEM",
        "ROOIAM_OIDC_PUBLIC_KEY_PATH",
        "ROOIAM_OIDC_SIGNING_SECRET",
        "ROOIAM_JWT_SECRET",
        "ROOIAM_OIDC_KEY_ID",
        "ROOIAM_WEBAUTHN_RP_ID",
        "ROOIAM_WEBAUTHN_RP_NAME",
        "ROOIAM_WEBAUTHN_ORIGIN",
        "ROOIAM_WEBAUTHN_EXTRA_ORIGINS",
        "ROOIAM_WEBAUTHN_ALLOW_ANY_PORT",
        "ROOIAM_SERVER_ASSETS_DIR",
        "ROOIAM_BUILD_TIME_UTC",
        "ROOIAM_GIT_SHA",
        "ROOIAM_GIT_BRANCH",
        "ROOIAM_MEERKATEER_ENABLED",
        "ROOIAM_MEERKATEER_INGEST_URL",
        "ROOIAM_MEERKATEER_SERVICE_KEY",
        "ROOIAM_MEERKATEER_TIMEOUT_MS",
        "ROOIAM_MEERKATEER_HEARTBEAT_INTERVAL_SECONDS",
        "ROOIAM_METRICS_ENABLED",
        "ROOIAM_METRICS_TOKEN",
        "ROOIAM_MKS1_FORCE_CHECK_FAILURES",
        "ROOIAM_REQUIRE_EXPLICIT_EMBED_ORIGINS",
        "ROOIAM_TIMING_LOGS",
        "ROOIAM_RESET_DEMO_DATA",
        "ROOIAM_FROM_EMAIL",
        "ROOIAM_SMTP_INSECURE_TLS",
    ]);

    match mode {
        ServerMode::Production => {
            keys.extend([
                "ROOIAM_SETUP_TOKEN",
                "ROOIAM_SMTP_HOST",
                "ROOIAM_SMTP_PORT",
                "ROOIAM_SMTP_SECURITY",
                "ROOIAM_SMTP_FROM",
                "ROOIAM_SMTP_USER",
                "ROOIAM_SMTP_PASS",
                "ROOIAM_MAILBOX_URL",
            ]);
        }
        ServerMode::Demo => {
            keys.extend([
                "ROOIAM_DEMO_SMTP_HOST",
                "ROOIAM_DEMO_SMTP_PORT",
                "ROOIAM_DEMO_SMTP_FROM",
                "ROOIAM_DEMO_SMTP_SECURITY",
                "ROOIAM_DEMO_MAILBOX_URL",
                "ROOIAM_DEMO_APP_URL",
                "ROOIAM_DEMO_PORTAL_URL",
                "ROOIAM_DEMO_ADMIN_URL",
                "ROOIAM_ENABLE_DEMO_SEED",
            ]);
        }
        ServerMode::Test => {
            keys.extend([
                "ROOIAM_SETUP_TOKEN",
                "ROOIAM_SMTP_HOST",
                "ROOIAM_SMTP_PORT",
                "ROOIAM_SMTP_SECURITY",
                "ROOIAM_SMTP_FROM",
                "ROOIAM_SMTP_USER",
                "ROOIAM_SMTP_PASS",
                "ROOIAM_DEMO_SMTP_HOST",
                "ROOIAM_DEMO_SMTP_PORT",
                "ROOIAM_DEMO_SMTP_FROM",
                "ROOIAM_DEMO_SMTP_SECURITY",
                "ROOIAM_DEMO_MAILBOX_URL",
                "ROOIAM_DEMO_APP_URL",
                "ROOIAM_DEMO_PORTAL_URL",
                "ROOIAM_DEMO_ADMIN_URL",
                "ROOIAM_ENABLE_DEMO_SEED",
            ]);
        }
    }

    keys
}
