use dialoguer::{theme::ColorfulTheme, Confirm, Input, Password, Select};
use rand::{rngs::OsRng, RngCore};
use redis::cmd;
use sqlx::Connection;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
use url::Url;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum SetupMode {
    Production,
    Demo,
}

impl SetupMode {
    fn label(self) -> &'static str {
        match self {
            SetupMode::Production => "production",
            SetupMode::Demo => "demo",
        }
    }

    fn display_label(self) -> &'static str {
        match self {
            SetupMode::Production => "Production",
            SetupMode::Demo => "Demo (predefined seed)",
        }
    }

    fn output_segment(self) -> &'static str {
        match self {
            SetupMode::Production => "prod",
            SetupMode::Demo => "demo",
        }
    }

    fn default_port(self) -> &'static str {
        match self {
            SetupMode::Production => "5170",
            SetupMode::Demo => "5180",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum DeployTarget {
    Local,
    Public,
}

impl DeployTarget {
    fn label(self) -> &'static str {
        match self {
            DeployTarget::Local => "local",
            DeployTarget::Public => "public",
        }
    }
}

#[derive(Debug)]
struct SmtpConfig {
    host: String,
    port: String,
    security: String,
    username: String,
    password: String,
    from: String,
}

#[derive(Debug)]
struct DemoMailboxConfig {
    host: String,
    port: String,
    from: String,
    mailbox_url: String,
}

#[derive(Debug)]
struct WizardConfig {
    mode: SetupMode,
    target: DeployTarget,
    output_path: String,
    host: String,
    port: String,
    server_url: String,
    admin_url: String,
    app_url: String,
    landing_url: Option<String>,
    enduser_url: Option<String>,
    docs_url: Option<String>,
    allowed_origins: String,
    cookie_secure: bool,
    cookie_domain: Option<String>,
    trusted_proxy_cidrs: Option<String>,
    setup_token: Option<String>,
    database_url: String,
    redis_url: String,
    storage_root: Option<String>,
    public_media_base: String,
    service_environment: String,
    minio_endpoint: String,
    minio_bucket: String,
    minio_user: String,
    minio_password: String,
    smtp: Option<SmtpConfig>,
    demo_mailbox: Option<DemoMailboxConfig>,
}

#[derive(Clone, Debug)]
struct EnvEntry {
    key: &'static str,
    value: String,
}

#[derive(Clone, Debug)]
struct PostgresDraft {
    host: String,
    port: String,
    database: String,
    username: String,
    password: String,
}

#[derive(Clone, Debug)]
struct RedisDraft {
    host: String,
    port: String,
    username: String,
    password: String,
}

#[derive(Clone, Debug)]
struct MinioDraft {
    scheme: String,
    host: String,
    port: String,
    bucket: String,
    access_key: String,
    secret_key: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ProbeFailureAction {
    Retest,
    SkipForNow,
}

/// Run the interactive setup wizard in the terminal.
pub async fn run_setup_wizard(preferred_output_path: Option<&str>) {
    let theme = ColorfulTheme::default();

    println!();
    println!("╔══════════════════════════════════════════════════════════════╗");
    println!("║                 Rooiam Setup Wizard                        ║");
    println!("╚══════════════════════════════════════════════════════════════╝");
    println!();
    println!("This wizard generates a named env file for a Rooiam server run.");
    println!("Use Enter to accept defaults. Use Ctrl+C to cancel.");
    println!();

    let mode = prompt_mode(&theme);
    let target = prompt_target(&theme);
    let config = collect_config(&theme, mode, target, preferred_output_path).await;
    let env_entries = build_env_entries(&config);

    println!();
    println!("Review");
    println!("  Mode:          {}", config.mode.label());
    println!("  Deploy target: {}", config.target.label());
    println!("  Output file:   {}", config.output_path);
    println!(
        "  Start command: cargo run -- --env-file {}",
        config.output_path
    );
    println!();
    print_env_preview(&env_entries);

    if !Confirm::with_theme(&theme)
        .with_prompt("Write this env file?")
        .default(true)
        .interact()
        .unwrap()
    {
        println!();
        println!("Configuration not written.");
        return;
    }

    if Path::new(&config.output_path).exists() {
        let overwrite = Confirm::with_theme(&theme)
            .with_prompt(format!(
                "{} already exists. Overwrite it?",
                config.output_path
            ))
            .default(false)
            .interact()
            .unwrap();
        if !overwrite {
            println!();
            println!("Configuration not written.");
            return;
        }
    }

    write_env_file(&config.output_path, &env_entries);

    println!();
    println!("Configuration written to {}", config.output_path);
    println!();
    println!("Next steps:");
    println!("  1. Start the server:");
    println!("     cargo run -- --env-file {}", config.output_path);
    println!("  2. Open the setup/admin flow after the server is up.");
    println!();
}

async fn collect_config(
    theme: &ColorfulTheme,
    mode: SetupMode,
    target: DeployTarget,
    preferred_output_path: Option<&str>,
) -> WizardConfig {
    let output_path = preferred_output_path
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| format!(".env.{}.{}", target.label(), mode.output_segment()));

    section("Server");
    let host = prompt_required(theme, "Listen host", "0.0.0.0");
    let port = prompt_port(theme, "Listen port", mode.default_port());

    let server_url_default = default_server_url(mode, target, &port);
    let admin_url_default = default_admin_url(mode, target);
    let app_url_default = default_app_url(mode, target);
    let landing_url_default = default_landing_url(mode, target);
    let enduser_url_default = default_enduser_url(mode, target);
    let docs_url_default = default_docs_url(target);

    let server_url = prompt_url(theme, "Server URL", &server_url_default);
    let admin_url = prompt_url(theme, "Admin URL", &admin_url_default);
    let app_url = prompt_url(theme, "App URL", &app_url_default);

    let landing_url = if mode == SetupMode::Production {
        let value = prompt_optional(
            theme,
            "Landing URL",
            landing_url_default.as_deref().unwrap_or(""),
        );
        normalize_optional(value)
    } else {
        None
    };

    let enduser_url = if mode == SetupMode::Demo {
        let value = prompt_url(
            theme,
            "End-user app URL",
            enduser_url_default
                .as_deref()
                .unwrap_or("http://localhost:5184"),
        );
        Some(value)
    } else {
        None
    };

    let docs_url = if target == DeployTarget::Public {
        let value = prompt_optional(theme, "Docs URL", docs_url_default.as_deref().unwrap_or(""));
        normalize_optional(value)
    } else {
        None
    };

    let allowed_origins_default = default_allowed_origins(
        mode,
        &admin_url,
        &app_url,
        landing_url.as_deref(),
        enduser_url.as_deref(),
    );
    let allowed_origins = prompt_required(
        theme,
        "Allowed origins (comma-separated)",
        &allowed_origins_default,
    );

    let cookie_secure = matches!(target, DeployTarget::Public);
    let cookie_domain = match target {
        DeployTarget::Local => None,
        DeployTarget::Public => {
            let default_domain = default_cookie_domain(mode);
            let value = prompt_required(theme, "Cookie domain", default_domain);
            Some(value)
        }
    };
    let trusted_proxy_cidrs = match target {
        DeployTarget::Local => None,
        DeployTarget::Public => {
            let value = prompt_optional(
                theme,
                "Trusted proxy CIDRs",
                "127.0.0.1/32,172.16.0.0/12,10.0.0.0/8",
            );
            normalize_optional(value)
        }
    };

    section("PostgreSQL");
    let database_url = prompt_postgres_database_url(theme, mode, target).await;

    section("Redis");
    let redis_url = prompt_redis_url(theme, target).await;

    section("MinIO");
    let minio = prompt_minio_config(theme, mode, target).await;
    let minio_endpoint = build_http_endpoint(minio.scheme.clone(), &minio.host, &minio.port);
    let minio_bucket = minio.bucket;
    let minio_user = minio.access_key;
    let minio_password = minio.secret_key;

    let storage_root = match target {
        DeployTarget::Local => {
            let value = prompt_required(theme, "Storage root", default_storage_root(mode));
            Some(value)
        }
        DeployTarget::Public => None,
    };
    let public_media_base = match target {
        DeployTarget::Local => "/media".to_string(),
        DeployTarget::Public => format!("{}/media", server_url.trim_end_matches('/')),
    };

    let service_environment = default_service_environment(mode, target).to_string();
    let setup_token = if mode == SetupMode::Production {
        section("Production");
        let generated_token = generate_setup_token();
        let token = prompt_required(theme, "Setup token", &generated_token);
        Some(token)
    } else {
        None
    };

    let smtp = if mode == SetupMode::Production {
        let enable_smtp = Confirm::with_theme(theme)
            .with_prompt("Configure SMTP now?")
            .default(false)
            .interact()
            .unwrap();
        if enable_smtp {
            let smtp_host = prompt_required(theme, "SMTP host", default_smtp_host(target));
            let smtp_port = prompt_port(theme, "SMTP port", default_smtp_port(target));
            let smtp_security = prompt_select(
                theme,
                "SMTP security",
                &["starttls", "none", "tls"],
                default_smtp_security_index(target),
            );
            let smtp_from = prompt_required(theme, "SMTP from address", default_smtp_from(target));
            let smtp_username =
                prompt_optional(theme, "SMTP username (optional)", default_smtp_user(target));
            let smtp_password =
                prompt_password(theme, "SMTP password / API key (optional)", true, "");
            Some(SmtpConfig {
                host: smtp_host,
                port: smtp_port,
                security: smtp_security,
                username: smtp_username,
                password: smtp_password,
                from: smtp_from,
            })
        } else {
            None
        }
    } else {
        None
    };

    let demo_mailbox = if mode == SetupMode::Demo {
        section("Demo Mailbox");
        let host = prompt_required(theme, "Demo SMTP host", default_demo_smtp_host(target));
        let port = prompt_port(theme, "Demo SMTP port", "1025");
        let from = prompt_required(theme, "Demo from address", default_demo_smtp_from(target));
        let mailbox_url = prompt_url(theme, "Mailbox UI URL", default_demo_mailbox_url(target));
        Some(DemoMailboxConfig {
            host,
            port,
            from,
            mailbox_url,
        })
    } else {
        None
    };

    WizardConfig {
        mode,
        target,
        output_path,
        host,
        port,
        server_url,
        admin_url,
        app_url,
        landing_url,
        enduser_url,
        docs_url,
        allowed_origins,
        cookie_secure,
        cookie_domain,
        trusted_proxy_cidrs,
        setup_token,
        database_url,
        redis_url,
        storage_root,
        public_media_base,
        service_environment,
        minio_endpoint,
        minio_bucket,
        minio_user,
        minio_password,
        smtp,
        demo_mailbox,
    }
}

fn prompt_mode(theme: &ColorfulTheme) -> SetupMode {
    match Select::with_theme(theme)
        .with_prompt("Choose a Rooiam mode")
        .items(&[
            SetupMode::Production.display_label(),
            SetupMode::Demo.display_label(),
        ])
        .default(0)
        .interact()
        .unwrap()
    {
        0 => SetupMode::Production,
        _ => SetupMode::Demo,
    }
}

fn prompt_target(theme: &ColorfulTheme) -> DeployTarget {
    match Select::with_theme(theme)
        .with_prompt("Choose a deploy target")
        .items(&["Local", "Public"])
        .default(0)
        .interact()
        .unwrap()
    {
        0 => DeployTarget::Local,
        _ => DeployTarget::Public,
    }
}

fn prompt_required(theme: &ColorfulTheme, label: &str, default: &str) -> String {
    Input::<String>::with_theme(theme)
        .with_prompt(label)
        .default(default.to_string())
        .validate_with(|value: &String| -> Result<(), &str> {
            if value.trim().is_empty() {
                Err("value is required")
            } else {
                Ok(())
            }
        })
        .interact_text()
        .unwrap()
        .trim()
        .to_string()
}

fn prompt_optional(theme: &ColorfulTheme, label: &str, default: &str) -> String {
    Input::<String>::with_theme(theme)
        .with_prompt(label)
        .default(default.to_string())
        .interact_text()
        .unwrap()
        .trim()
        .to_string()
}

fn prompt_port(theme: &ColorfulTheme, label: &str, default: &str) -> String {
    Input::<String>::with_theme(theme)
        .with_prompt(label)
        .default(default.to_string())
        .validate_with(|value: &String| -> Result<(), &str> {
            if value.trim().parse::<u16>().is_ok() {
                Ok(())
            } else {
                Err("enter a valid port number")
            }
        })
        .interact_text()
        .unwrap()
        .trim()
        .to_string()
}

fn prompt_url(theme: &ColorfulTheme, label: &str, default: &str) -> String {
    Input::<String>::with_theme(theme)
        .with_prompt(label)
        .default(default.to_string())
        .validate_with(|value: &String| -> Result<(), &str> {
            match Url::parse(value.trim()) {
                Ok(url) if url.scheme() == "http" || url.scheme() == "https" => Ok(()),
                _ => Err("enter a valid http:// or https:// URL"),
            }
        })
        .interact_text()
        .unwrap()
        .trim()
        .trim_end_matches('/')
        .to_string()
}

fn prompt_password(
    theme: &ColorfulTheme,
    label: &str,
    allow_empty: bool,
    fallback: &str,
) -> String {
    let prompt_label = if fallback.is_empty() {
        label.to_string()
    } else {
        format!("{} [leave blank for default]", label)
    };
    let value = Password::with_theme(theme)
        .with_prompt(prompt_label)
        .allow_empty_password(allow_empty)
        .interact()
        .unwrap();
    if value.is_empty() {
        fallback.to_string()
    } else {
        value
    }
}

fn prompt_select(theme: &ColorfulTheme, label: &str, items: &[&str], default: usize) -> String {
    let index = Select::with_theme(theme)
        .with_prompt(label)
        .items(items)
        .default(default)
        .interact()
        .unwrap();
    items[index].to_string()
}

async fn prompt_postgres_database_url(
    theme: &ColorfulTheme,
    mode: SetupMode,
    target: DeployTarget,
) -> String {
    let mut draft = PostgresDraft {
        host: default_postgres_host(target).to_string(),
        port: "5432".to_string(),
        database: default_database_name(mode, target).to_string(),
        username: "rooiam".to_string(),
        password: default_database_password(mode, target).to_string(),
    };

    loop {
        draft.host = prompt_required(theme, "PostgreSQL host / IP", &draft.host);
        draft.port = prompt_port(theme, "PostgreSQL port", &draft.port);
        draft.database = prompt_required(theme, "Database name", &draft.database);
        draft.username = prompt_required(theme, "Database username", &draft.username);
        draft.password = prompt_password(theme, "Database password", true, &draft.password);

        let database_url = build_postgres_url(
            &draft.host,
            &draft.port,
            &draft.database,
            &draft.username,
            &draft.password,
        );

        println!("  Testing PostgreSQL...");
        match test_postgres_connection(&database_url).await {
            Ok(message) => {
                print_probe_ok("PostgreSQL", &message);
                return database_url;
            }
            Err(error) => {
                print_probe_fail("PostgreSQL", &error);
                match prompt_probe_failure_action(theme, "PostgreSQL") {
                    ProbeFailureAction::Retest => continue,
                    ProbeFailureAction::SkipForNow => return database_url,
                }
            }
        }
    }
}

async fn prompt_redis_url(theme: &ColorfulTheme, target: DeployTarget) -> String {
    let mut draft = RedisDraft {
        host: default_redis_host(target).to_string(),
        port: "6379".to_string(),
        username: String::new(),
        password: String::new(),
    };

    loop {
        draft.host = prompt_required(theme, "Redis host / IP", &draft.host);
        draft.port = prompt_port(theme, "Redis port", &draft.port);
        draft.username = prompt_optional(theme, "Redis username (optional)", &draft.username);
        draft.password = prompt_password(theme, "Redis password (optional)", true, &draft.password);

        let redis_url = build_redis_url(&draft.host, &draft.port, &draft.username, &draft.password);

        println!("  Testing Redis...");
        match test_redis_connection(&redis_url).await {
            Ok(message) => {
                print_probe_ok("Redis", &message);
                return redis_url;
            }
            Err(error) => {
                print_probe_fail("Redis", &error);
                match prompt_probe_failure_action(theme, "Redis") {
                    ProbeFailureAction::Retest => continue,
                    ProbeFailureAction::SkipForNow => return redis_url,
                }
            }
        }
    }
}

async fn prompt_minio_config(
    theme: &ColorfulTheme,
    mode: SetupMode,
    target: DeployTarget,
) -> MinioDraft {
    let mut draft = MinioDraft {
        scheme: "http".to_string(),
        host: default_minio_host(target).to_string(),
        port: "9000".to_string(),
        bucket: default_minio_bucket(mode, target).to_string(),
        access_key: "rooiam".to_string(),
        secret_key: default_minio_password(target).to_string(),
    };

    loop {
        let protocol_index = if draft.scheme == "https" { 1 } else { 0 };
        draft.scheme = prompt_select(theme, "MinIO protocol", &["http", "https"], protocol_index);
        draft.host = prompt_required(theme, "MinIO host / IP", &draft.host);
        draft.port = prompt_port(theme, "MinIO port", &draft.port);
        draft.bucket = prompt_required(theme, "MinIO bucket", &draft.bucket);
        draft.access_key = prompt_required(theme, "MinIO access key", &draft.access_key);
        draft.secret_key = prompt_password(theme, "MinIO secret key", true, &draft.secret_key);

        let endpoint = build_http_endpoint(draft.scheme.clone(), &draft.host, &draft.port);
        let use_ssl = draft.scheme == "https";

        println!("  Testing MinIO...");
        match crate::shared::storage_config::test_minio_storage(
            &endpoint,
            &draft.bucket,
            &draft.access_key,
            &draft.secret_key,
            use_ssl,
        )
        .await
        {
            Ok(message) => {
                print_probe_ok("MinIO", &message);
                return draft;
            }
            Err(error) => {
                print_probe_fail("MinIO", &error);
                match prompt_probe_failure_action(theme, "MinIO") {
                    ProbeFailureAction::Retest => continue,
                    ProbeFailureAction::SkipForNow => return draft,
                }
            }
        }
    }
}

fn prompt_probe_failure_action(theme: &ColorfulTheme, service: &str) -> ProbeFailureAction {
    let prompt = format!("{} test failed. What do you want to do?", service);
    match Select::with_theme(theme)
        .with_prompt(prompt)
        .items(&["Retest", "Skip for now"])
        .default(0)
        .interact()
        .unwrap()
    {
        0 => ProbeFailureAction::Retest,
        _ => ProbeFailureAction::SkipForNow,
    }
}

async fn test_postgres_connection(database_url: &str) -> Result<String, String> {
    let mut conn = sqlx::postgres::PgConnection::connect(database_url)
        .await
        .map_err(|error| {
            format!(
                "Cannot connect to {}: {}",
                mask_url_password(database_url),
                error
            )
        })?;

    sqlx::query_scalar::<_, i32>("SELECT 1")
        .fetch_one(&mut conn)
        .await
        .map_err(|error| format!("Connected, but probe query failed: {}", error))?;

    Ok(format!("Connected to {}", mask_url_password(database_url)))
}

async fn test_redis_connection(redis_url: &str) -> Result<String, String> {
    let client = redis::Client::open(redis_url).map_err(|error| {
        format!(
            "Invalid Redis URL {}: {}",
            mask_url_password(redis_url),
            error
        )
    })?;
    let mut connection = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|error| {
            format!(
                "Cannot connect to {}: {}",
                mask_url_password(redis_url),
                error
            )
        })?;

    let response: String = cmd("PING")
        .query_async(&mut connection)
        .await
        .map_err(|error| format!("Connected, but Redis PING failed: {}", error))?;

    if response.eq_ignore_ascii_case("PONG") {
        Ok(format!("Connected to {}", mask_url_password(redis_url)))
    } else {
        Err(format!("Unexpected Redis PING response: {}", response))
    }
}

fn print_probe_ok(service: &str, message: &str) {
    println!("  [ OK ] {} {}", service, message);
}

fn print_probe_fail(service: &str, message: &str) {
    println!("  [ FAIL ] {} {}", service, message);
}

fn build_env_entries(config: &WizardConfig) -> Vec<EnvEntry> {
    let mut entries = Vec::new();

    push_entry(&mut entries, "ROOIAM_MODE", config.mode.label());
    push_entry(&mut entries, "ROOIAM_DEPLOY_TARGET", config.target.label());
    push_entry(&mut entries, "ROOIAM_HOST", &config.host);
    push_entry(&mut entries, "ROOIAM_PORT", &config.port);
    push_entry(&mut entries, "ROOIAM_SERVER_URL", &config.server_url);
    push_entry(&mut entries, "ROOIAM_ADMIN_URL", &config.admin_url);
    push_entry(&mut entries, "ROOIAM_APP_URL", &config.app_url);

    if let Some(value) = &config.landing_url {
        push_entry(&mut entries, "ROOIAM_LANDING_URL", value);
    }
    if let Some(value) = &config.enduser_url {
        push_entry(&mut entries, "ROOIAM_ENDUSER_URL", value);
    }
    if let Some(value) = &config.docs_url {
        push_entry(&mut entries, "ROOIAM_DOCS_URL", value);
    }

    push_entry(
        &mut entries,
        "ROOIAM_ALLOWED_ORIGINS",
        &config.allowed_origins,
    );
    push_entry(
        &mut entries,
        "ROOIAM_COOKIE_SECURE",
        if config.cookie_secure {
            "true"
        } else {
            "false"
        },
    );
    if let Some(value) = &config.cookie_domain {
        push_entry(&mut entries, "ROOIAM_COOKIE_DOMAIN", value);
    }
    if let Some(value) = &config.trusted_proxy_cidrs {
        push_entry(&mut entries, "ROOIAM_TRUSTED_PROXY_CIDRS", value);
    }

    push_entry(&mut entries, "ROOIAM_DATABASE_URL", &config.database_url);
    push_entry(&mut entries, "ROOIAM_REDIS_URL", &config.redis_url);

    if let Some(value) = &config.storage_root {
        push_entry(&mut entries, "ROOIAM_STORAGE_ROOT", value);
    }
    push_entry(
        &mut entries,
        "ROOIAM_PUBLIC_MEDIA_BASE",
        &config.public_media_base,
    );
    push_entry(
        &mut entries,
        "ROOIAM_SERVICE_ENVIRONMENT",
        &config.service_environment,
    );

    push_entry(&mut entries, "ROOIAM_MEERKATEER_ENABLED", "false");
    push_entry(
        &mut entries,
        "ROOIAM_MEERKATEER_INGEST_URL",
        "https://www.meerkateer.com",
    );
    push_entry(&mut entries, "ROOIAM_MEERKATEER_SERVICE_KEY", "");
    push_entry(&mut entries, "ROOIAM_MEERKATEER_TIMEOUT_MS", "3000");
    push_entry(
        &mut entries,
        "ROOIAM_MEERKATEER_HEARTBEAT_INTERVAL_SECONDS",
        "60",
    );
    push_entry(&mut entries, "ROOIAM_METRICS_ENABLED", "true");
    push_entry(&mut entries, "ROOIAM_METRICS_TOKEN", "");

    push_entry(
        &mut entries,
        "ROOIAM_MINIO_ENDPOINT",
        &config.minio_endpoint,
    );
    push_entry(&mut entries, "ROOIAM_MINIO_BUCKET", &config.minio_bucket);
    push_entry(&mut entries, "ROOIAM_MINIO_USER", &config.minio_user);
    push_entry(
        &mut entries,
        "ROOIAM_MINIO_PASSWORD",
        &config.minio_password,
    );

    match config.mode {
        SetupMode::Production => {
            push_entry(
                &mut entries,
                "ROOIAM_SETUP_TOKEN",
                config.setup_token.as_deref().unwrap_or(""),
            );
            if let Some(smtp) = &config.smtp {
                push_entry(&mut entries, "ROOIAM_SMTP_HOST", &smtp.host);
                push_entry(&mut entries, "ROOIAM_SMTP_PORT", &smtp.port);
                push_entry(&mut entries, "ROOIAM_SMTP_SECURITY", &smtp.security);
                push_entry(&mut entries, "ROOIAM_SMTP_FROM", &smtp.from);
                if !smtp.username.trim().is_empty() {
                    push_entry(&mut entries, "ROOIAM_SMTP_USER", &smtp.username);
                }
                if !smtp.password.trim().is_empty() {
                    push_entry(&mut entries, "ROOIAM_SMTP_PASS", &smtp.password);
                }
            }
        }
        SetupMode::Demo => {
            if let Some(mailbox) = &config.demo_mailbox {
                push_entry(&mut entries, "ROOIAM_DEMO_SMTP_HOST", &mailbox.host);
                push_entry(&mut entries, "ROOIAM_DEMO_SMTP_PORT", &mailbox.port);
                push_entry(&mut entries, "ROOIAM_DEMO_SMTP_FROM", &mailbox.from);
                push_entry(
                    &mut entries,
                    "ROOIAM_DEMO_MAILBOX_URL",
                    &mailbox.mailbox_url,
                );
            }
        }
    }

    entries
}

fn print_env_preview(entries: &[EnvEntry]) {
    println!("Generated env preview:");
    for entry in entries {
        println!("  {}={}", entry.key, preview_value(entry));
    }
}

fn preview_value(entry: &EnvEntry) -> String {
    match entry.key {
        "ROOIAM_DATABASE_URL" | "ROOIAM_REDIS_URL" => mask_url_password(&entry.value),
        _ if is_secret_key(entry.key) => {
            if entry.value.is_empty() {
                String::new()
            } else {
                "********".to_string()
            }
        }
        _ => entry.value.clone(),
    }
}

fn mask_url_password(raw: &str) -> String {
    match Url::parse(raw) {
        Ok(mut url) => {
            if url.password().is_some() {
                let _ = url.set_password(Some("********"));
            }
            url.to_string()
        }
        Err(_) => raw.to_string(),
    }
}

fn is_secret_key(key: &str) -> bool {
    matches!(
        key,
        "ROOIAM_MINIO_PASSWORD"
            | "ROOIAM_SETUP_TOKEN"
            | "ROOIAM_SMTP_PASS"
            | "ROOIAM_MEERKATEER_SERVICE_KEY"
            | "ROOIAM_METRICS_TOKEN"
    )
}

fn push_entry(entries: &mut Vec<EnvEntry>, key: &'static str, value: impl Into<String>) {
    entries.push(EnvEntry {
        key,
        value: value.into(),
    });
}

fn write_env_file(path: &str, entries: &[EnvEntry]) {
    let mut output = String::new();
    output.push_str("# Rooiam configuration generated by setup wizard\n\n");
    for entry in entries {
        output.push_str(entry.key);
        output.push('=');
        output.push_str(&format_env_value(&entry.value));
        output.push('\n');
    }

    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(path)
        .expect("Cannot write env file");

    file.write_all(output.as_bytes())
        .expect("Failed to write env file");
}

fn format_env_value(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }

    let escaped = value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
        .replace('$', "\\$");

    format!("\"{}\"", escaped)
}

fn build_postgres_url(host: &str, port: &str, db_name: &str, user: &str, password: &str) -> String {
    let mut url = Url::parse("postgres://localhost").expect("valid postgres URL base");
    let _ = url.set_host(Some(host.trim()));
    let _ = url.set_port(Some(port.trim().parse::<u16>().expect("validated port")));
    let _ = url.set_username(user.trim());
    if password.trim().is_empty() {
        let _ = url.set_password(None);
    } else {
        let _ = url.set_password(Some(password));
    }
    url.set_path(&format!("/{}", db_name.trim().trim_start_matches('/')));
    url.to_string()
}

fn build_redis_url(host: &str, port: &str, username: &str, password: &str) -> String {
    let mut url = Url::parse("redis://localhost").expect("valid redis URL base");
    let _ = url.set_host(Some(host.trim()));
    let _ = url.set_port(Some(port.trim().parse::<u16>().expect("validated port")));

    if username.trim().is_empty() && password.trim().is_empty() {
        return url.to_string().trim_end_matches('/').to_string();
    }

    let _ = url.set_username(username.trim());
    if password.trim().is_empty() {
        let _ = url.set_password(None);
    } else {
        let _ = url.set_password(Some(password));
    }

    url.to_string().trim_end_matches('/').to_string()
}

fn build_http_endpoint(scheme: String, host: &str, port: &str) -> String {
    let mut url = Url::parse(&format!("{}://localhost", scheme)).expect("valid URL base");
    let _ = url.set_host(Some(host.trim()));
    let _ = url.set_port(Some(port.trim().parse::<u16>().expect("validated port")));
    url.to_string().trim_end_matches('/').to_string()
}

fn generate_setup_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{:02x}", byte)).collect()
}

fn normalize_optional(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn section(title: &str) {
    println!();
    println!("{}:", title);
}

fn default_server_url(mode: SetupMode, target: DeployTarget, port: &str) -> String {
    match target {
        DeployTarget::Local => format!("http://localhost:{}", port),
        DeployTarget::Public => match mode {
            SetupMode::Production => "https://api.rooiam.com".to_string(),
            SetupMode::Demo => "https://demo-api.rooiam.com".to_string(),
        },
    }
}

fn default_admin_url(mode: SetupMode, target: DeployTarget) -> String {
    match (mode, target) {
        (SetupMode::Production, DeployTarget::Local) => "http://localhost:5171".to_string(),
        (SetupMode::Production, DeployTarget::Public) => "https://admin.rooiam.com".to_string(),
        (SetupMode::Demo, DeployTarget::Local) => "http://localhost:5181".to_string(),
        (SetupMode::Demo, DeployTarget::Public) => "https://demo-admin.rooiam.com".to_string(),
    }
}

fn default_app_url(mode: SetupMode, target: DeployTarget) -> String {
    match (mode, target) {
        (SetupMode::Production, DeployTarget::Local) => "http://localhost:5172".to_string(),
        (SetupMode::Production, DeployTarget::Public) => "https://app.rooiam.com".to_string(),
        (SetupMode::Demo, DeployTarget::Local) => "http://localhost:5182".to_string(),
        (SetupMode::Demo, DeployTarget::Public) => "https://demo-app.rooiam.com".to_string(),
    }
}

fn default_landing_url(mode: SetupMode, target: DeployTarget) -> Option<String> {
    match (mode, target) {
        (SetupMode::Production, DeployTarget::Local) => Some("http://localhost:5173".to_string()),
        (SetupMode::Production, DeployTarget::Public) => Some("https://rooiam.com".to_string()),
        _ => None,
    }
}

fn default_enduser_url(mode: SetupMode, target: DeployTarget) -> Option<String> {
    match (mode, target) {
        (SetupMode::Demo, DeployTarget::Local) => Some("http://localhost:5184".to_string()),
        (SetupMode::Demo, DeployTarget::Public) => {
            Some("https://candycloud.rooiam.com".to_string())
        }
        _ => None,
    }
}

fn default_docs_url(target: DeployTarget) -> Option<String> {
    match target {
        DeployTarget::Local => None,
        DeployTarget::Public => Some("https://docs.rooiam.com".to_string()),
    }
}

fn default_allowed_origins(
    mode: SetupMode,
    admin_url: &str,
    app_url: &str,
    landing_url: Option<&str>,
    enduser_url: Option<&str>,
) -> String {
    match mode {
        SetupMode::Production => {
            let third = landing_url.unwrap_or(app_url);
            format!("{},{},{}", admin_url, app_url, third)
        }
        SetupMode::Demo => {
            let third = enduser_url.unwrap_or(app_url);
            format!("{},{},{}", admin_url, app_url, third)
        }
    }
}

fn default_cookie_domain(mode: SetupMode) -> &'static str {
    match mode {
        SetupMode::Production | SetupMode::Demo => "rooiam.com",
    }
}

fn default_postgres_host(target: DeployTarget) -> &'static str {
    match target {
        DeployTarget::Local => "localhost",
        DeployTarget::Public => "postgres",
    }
}

fn default_redis_host(target: DeployTarget) -> &'static str {
    match target {
        DeployTarget::Local => "127.0.0.1",
        DeployTarget::Public => "redis",
    }
}

fn default_database_name(mode: SetupMode, _target: DeployTarget) -> &'static str {
    match mode {
        SetupMode::Production => "rooiam",
        SetupMode::Demo => "rooiam_demo",
    }
}

fn default_database_password(mode: SetupMode, target: DeployTarget) -> &'static str {
    match (mode, target) {
        (SetupMode::Production, DeployTarget::Local) => "rooiam_local",
        (SetupMode::Demo, DeployTarget::Local) => "rooiam_local",
        _ => "",
    }
}

fn default_minio_host(target: DeployTarget) -> &'static str {
    match target {
        DeployTarget::Local => "localhost",
        DeployTarget::Public => "minio",
    }
}

fn default_minio_bucket(mode: SetupMode, _target: DeployTarget) -> &'static str {
    match mode {
        SetupMode::Production => "rooiam",
        SetupMode::Demo => "rooiam-demo",
    }
}

fn default_minio_password(target: DeployTarget) -> &'static str {
    match target {
        DeployTarget::Local => "rooiam_local_minio",
        DeployTarget::Public => "",
    }
}

fn default_storage_root(mode: SetupMode) -> &'static str {
    match mode {
        SetupMode::Production => "/data/rooiam",
        SetupMode::Demo => "/data/rooiam_demo",
    }
}

fn default_service_environment(mode: SetupMode, target: DeployTarget) -> &'static str {
    match (mode, target) {
        (SetupMode::Production, DeployTarget::Local) => "local",
        (SetupMode::Production, DeployTarget::Public) => "production",
        (SetupMode::Demo, DeployTarget::Local) => "development",
        (SetupMode::Demo, DeployTarget::Public) => "staging",
    }
}

fn default_smtp_host(target: DeployTarget) -> &'static str {
    match target {
        DeployTarget::Local => "localhost",
        DeployTarget::Public => "smtp.example.com",
    }
}

fn default_smtp_port(target: DeployTarget) -> &'static str {
    match target {
        DeployTarget::Local => "1025",
        DeployTarget::Public => "587",
    }
}

fn default_smtp_security_index(target: DeployTarget) -> usize {
    match target {
        DeployTarget::Local => 1,
        DeployTarget::Public => 0,
    }
}

fn default_smtp_from(target: DeployTarget) -> &'static str {
    match target {
        DeployTarget::Local => "noreply@rooiam.local",
        DeployTarget::Public => "noreply@example.com",
    }
}

fn default_smtp_user(target: DeployTarget) -> &'static str {
    match target {
        DeployTarget::Local => "",
        DeployTarget::Public => "apikey",
    }
}

fn default_demo_smtp_host(target: DeployTarget) -> &'static str {
    match target {
        DeployTarget::Local => "localhost",
        DeployTarget::Public => "mailhog",
    }
}

fn default_demo_smtp_from(target: DeployTarget) -> &'static str {
    match target {
        DeployTarget::Local => "demo@rooiam.local",
        DeployTarget::Public => "demo@rooiam.com",
    }
}

fn default_demo_mailbox_url(target: DeployTarget) -> &'static str {
    match target {
        DeployTarget::Local => "http://localhost:8025",
        DeployTarget::Public => "https://demo-mail.rooiam.com",
    }
}
