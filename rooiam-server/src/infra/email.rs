use crate::modules::organization::repository::OrganizationRepository;
use crate::shared::auth_context::inspect_login_context;
use crate::shared::demo_seed::demo_seed_enabled;
use askama::Template;
use lettre::{
    message::{MultiPart, SinglePart},
    transport::smtp::authentication::Credentials,
    transport::smtp::client::{Tls, TlsParameters},
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};
use sqlx::PgPool;
use url::Url;

#[derive(Template)]
#[template(path = "magic_link.html")]
struct MagicLinkTemplate<'a> {
    magic_link_url: &'a str,
    heading: &'a str,
    intro_text: &'a str,
    action_label: &'a str,
    brand_color: &'a str,
    logo_url: Option<&'a str>,
    workspace_name: Option<&'a str>,
    trusted_host: &'a str,
    sender_email: &'a str,
}

#[derive(Clone)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub password: Option<String>,
    pub from_email: String,
    pub security: String,
    pub insecure_tls: bool,
}

#[derive(Clone, Debug)]
pub struct SmtpRuntimeSummary {
    pub mode_label: String,
    pub host: String,
    pub port: u16,
    pub from_email: String,
    pub security: String,
    pub username_present: bool,
    pub password_present: bool,
}

#[derive(Clone, Debug)]
struct MagicLinkEmailViewModel {
    subject: String,
    from_display_name: String,
    heading: String,
    intro_text: String,
    action_label: String,
    brand_color: String,
    logo_url: Option<String>,
    workspace_name: Option<String>,
    trusted_host: String,
}

pub async fn send_magic_link_email(
    pool: &PgPool,
    to_email: &str,
    magic_link_url: &str,
    redirect_uri: Option<&str>,
    surface: Option<&str>,
) -> Result<(), String> {
    let config = match load_smtp_config(pool).await? {
        Some(config) => config,
        None => {
            tracing::warn!("SMTP host not configured. Magic link email delivery skipped.");
            return Ok(());
        }
    };

    let email_view = build_magic_link_email_view(
        pool,
        magic_link_url,
        redirect_uri,
        surface,
        &config.from_email,
    )
    .await?;
    let from_formatted = format!("{} <{}>", email_view.from_display_name, config.from_email);

    let html_content = MagicLinkTemplate {
        magic_link_url,
        heading: &email_view.heading,
        intro_text: &email_view.intro_text,
        action_label: &email_view.action_label,
        brand_color: &email_view.brand_color,
        logo_url: email_view.logo_url.as_deref(),
        workspace_name: email_view.workspace_name.as_deref(),
        trusted_host: &email_view.trusted_host,
        sender_email: &config.from_email,
    }
    .render()
    .map_err(|e| format!("Askama error: {}", e))?;

    let text_content = format!(
        "{heading}\n\n{intro}\n\nSign-in link:\n{link}\n\nFor safety, only continue if your browser opens {trusted_host}.\nThis link is single-use and expires in 15 minutes.\nSent by {sender_email}.\nIf you did not request this, you can safely ignore this email.",
        heading = email_view.heading,
        intro = email_view.intro_text,
        link = magic_link_url,
        trusted_host = email_view.trusted_host,
        sender_email = config.from_email,
    );

    // 3. Construct Message
    let email_msg = Message::builder()
        .from(from_formatted.parse().map_err(|_| "Invalid from email")?)
        .to(to_email.parse().map_err(|_| "Invalid to email")?)
        .subject(&email_view.subject)
        .multipart(
            MultiPart::alternative()
                .singlepart(SinglePart::plain(text_content))
                .singlepart(SinglePart::html(html_content)),
        )
        .map_err(|e| format!("Failed to build email: {}", e))?;

    // 4. Configure Mailer
    let mut mailer_builder = smtp_builder(&config)?;

    if let (Some(u), Some(p)) = (&config.username, &config.password) {
        if !u.is_empty() && !p.is_empty() {
            let creds = Credentials::new(u.clone(), p.clone());
            mailer_builder = mailer_builder.credentials(creds);
        }
    }

    let mailer = mailer_builder.build();

    // 5. Send
    tracing::info!(
        "Sending magic link email to {} via {}:{} ({}, insecure_tls={})",
        to_email,
        config.host,
        config.port,
        config.security,
        config.insecure_tls,
    );
    mailer
        .send(email_msg)
        .await
        .map_err(|e| format!("SMTP failed: {}", e))?;

    tracing::info!("Email delivered successfully to {}", to_email);

    Ok(())
}

async fn build_magic_link_email_view(
    pool: &PgPool,
    magic_link_url: &str,
    redirect_uri: Option<&str>,
    surface: Option<&str>,
    _sender_email: &str,
) -> Result<MagicLinkEmailViewModel, String> {
    let trusted_host = Url::parse(magic_link_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
        .unwrap_or_else(|| "your Rooiam sign-in domain".to_string());
    let default_brand = "#C026D3".to_string();
    let is_admin_surface = matches!(surface, Some("admin"));

    if is_admin_surface {
        return Ok(MagicLinkEmailViewModel {
            subject: "Your admin sign-in link for Rooiam".to_string(),
            from_display_name: "Rooiam Security".to_string(),
            heading: "Sign in to Rooiam Admin".to_string(),
            intro_text: "Use this one-time link to securely access your Rooiam admin console."
                .to_string(),
            action_label: "Open admin sign-in".to_string(),
            brand_color: default_brand,
            logo_url: None,
            workspace_name: None,
            trusted_host,
        });
    }

    let context = inspect_login_context(redirect_uri);
    let workspace = match context.workspace_slug {
        Some(slug) => OrganizationRepository::new(pool.clone())
            .get_organization_by_slug(&slug)
            .await
            .map_err(|e| e.to_string())?,
        None => None,
    };

    let Some(workspace) = workspace else {
        return Ok(MagicLinkEmailViewModel {
            subject: "Your sign-in link for Rooiam".to_string(),
            from_display_name: "Rooiam Security".to_string(),
            heading: "Sign in securely".to_string(),
            intro_text: "Use this one-time link to continue with your Rooiam sign-in request."
                .to_string(),
            action_label: "Open sign-in link".to_string(),
            brand_color: default_brand,
            logo_url: None,
            workspace_name: None,
            trusted_host,
        });
    };

    let workspace_name = sanitize_display_name(
        workspace
            .login_display_name
            .as_deref()
            .unwrap_or(&workspace.name),
        80,
    )
    .unwrap_or_else(|| "Workspace".to_string());

    let logo_url = resolve_safe_email_logo_url(
        pool,
        workspace
            .login_logo_url
            .as_deref()
            .or(workspace.icon_url.as_deref()),
        magic_link_url,
    )
    .await?;

    Ok(MagicLinkEmailViewModel {
        subject: format!("Your sign-in link for {}", workspace_name),
        from_display_name: format!("{} via Rooiam", workspace_name),
        heading: format!("Sign in to {}", workspace_name),
        intro_text: format!(
            "Use this one-time link to continue with your {} sign-in request.",
            workspace_name
        ),
        action_label: format!("Continue to {}", workspace_name),
        brand_color: sanitize_brand_color(workspace.brand_color.as_deref())
            .unwrap_or(default_brand),
        logo_url,
        workspace_name: Some(workspace_name),
        trusted_host,
    })
}

async fn resolve_safe_email_logo_url(
    pool: &PgPool,
    candidate: Option<&str>,
    magic_link_url: &str,
) -> Result<Option<String>, String> {
    let Some(candidate) = candidate.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };

    let magic_link = match Url::parse(magic_link_url) {
        Ok(url) => url,
        Err(_) => return Ok(None),
    };

    let mut allowed_hosts = Vec::new();
    if let Some(host) = magic_link.host_str() {
        allowed_hosts.push(host.to_string());
    }

    if let Some(issuer_url) = get_setting(pool, "issuer_url", &["ROOIAM_SERVER_URL"]).await? {
        if let Ok(url) = Url::parse(&issuer_url) {
            if let Some(host) = url.host_str() {
                if !allowed_hosts.iter().any(|item| item == host) {
                    allowed_hosts.push(host.to_string());
                }
            }
        }
    }

    let resolved = if candidate.starts_with('/') {
        let base = if let Some(issuer_url) =
            get_setting(pool, "issuer_url", &["ROOIAM_SERVER_URL"]).await?
        {
            Url::parse(&issuer_url).ok().unwrap_or(magic_link.clone())
        } else {
            magic_link.clone()
        };
        match base.join(candidate) {
            Ok(url) => url,
            Err(_) => return Ok(None),
        }
    } else {
        match Url::parse(candidate) {
            Ok(url) => url,
            Err(_) => return Ok(None),
        }
    };

    if !matches!(resolved.scheme(), "http" | "https") {
        return Ok(None);
    }

    let Some(host) = resolved.host_str() else {
        return Ok(None);
    };

    if !allowed_hosts.iter().any(|item| item == host) {
        return Ok(None);
    }

    Ok(Some(resolved.to_string()))
}

fn sanitize_brand_color(value: Option<&str>) -> Option<String> {
    let value = value?.trim();
    if value.len() != 7 || !value.starts_with('#') {
        return None;
    }

    if value.chars().skip(1).all(|ch| ch.is_ascii_hexdigit()) {
        Some(value.to_string())
    } else {
        None
    }
}

fn sanitize_display_name(value: &str, max_len: usize) -> Option<String> {
    let cleaned = value
        .chars()
        .filter(|ch| *ch != '\r' && *ch != '\n')
        .collect::<String>()
        .trim()
        .chars()
        .take(max_len)
        .collect::<String>();

    if cleaned.is_empty() {
        None
    } else {
        Some(cleaned)
    }
}

/// Send a plain notification email (no template — just text + HTML paragraphs).
/// Used for security notifications like email change confirmations.
pub async fn send_notification_email(
    pool: &PgPool,
    to_email: &str,
    subject: &str,
    text_body: &str,
    html_body: &str,
) -> Result<(), String> {
    let config = match load_smtp_config(pool).await? {
        Some(config) => config,
        None => {
            tracing::warn!(
                "SMTP not configured — notification email to {} skipped.",
                to_email
            );
            return Ok(());
        }
    };

    let from_formatted = format!("Rooiam Security <{}>", config.from_email);
    let email_msg = Message::builder()
        .from(from_formatted.parse().map_err(|_| "Invalid from email")?)
        .to(to_email.parse().map_err(|_| "Invalid to email")?)
        .subject(subject)
        .multipart(
            MultiPart::alternative()
                .singlepart(SinglePart::plain(text_body.to_string()))
                .singlepart(SinglePart::html(html_body.to_string())),
        )
        .map_err(|e| format!("Failed to build email: {}", e))?;

    let mut mailer_builder = smtp_builder(&config)?;
    if let (Some(u), Some(p)) = (&config.username, &config.password) {
        if !u.is_empty() && !p.is_empty() {
            mailer_builder = mailer_builder.credentials(Credentials::new(u.clone(), p.clone()));
        }
    }
    let mailer = mailer_builder.build();
    mailer
        .send(email_msg)
        .await
        .map_err(|e| format!("SMTP failed: {}", e))?;
    tracing::info!(
        "Notification email ({:?}) delivered to {}",
        subject,
        to_email
    );
    Ok(())
}

/// Send a beautifully styled action email using the MagicLinkTemplate.
/// Used for emails that have a clear primary call to action (like Verify Email, Reset Password).
pub async fn send_action_email(
    pool: &PgPool,
    to_email: &str,
    subject: &str,
    heading: &str,
    intro_text: &str,
    action_label: &str,
    action_url: &str,
) -> Result<(), String> {
    let config = match load_smtp_config(pool).await? {
        Some(config) => config,
        None => {
            tracing::warn!(
                "SMTP not configured — action email to {} skipped.",
                to_email
            );
            return Ok(());
        }
    };

    let trusted_host = Url::parse(action_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
        .unwrap_or_else(|| "your Rooiam domain".to_string());

    let html_content = MagicLinkTemplate {
        magic_link_url: action_url,
        heading,
        intro_text,
        action_label,
        brand_color: "#C026D3",
        logo_url: None,
        workspace_name: None,
        trusted_host: &trusted_host,
        sender_email: &config.from_email,
    }
    .render()
    .map_err(|e| format!("Askama error: {}", e))?;

    let text_content = format!(
        "{heading}\n\n{intro}\n\nLink:\n{link}\n\nFor safety, only continue if your browser opens {trusted_host}.\nSent by {sender_email}.\nIf you did not request this, you can safely ignore this email.",
        heading = heading,
        intro = intro_text,
        link = action_url,
        trusted_host = trusted_host,
        sender_email = config.from_email,
    );

    let from_formatted = format!("Rooiam Security <{}>", config.from_email);
    let email_msg = Message::builder()
        .from(from_formatted.parse().map_err(|_| "Invalid from email")?)
        .to(to_email.parse().map_err(|_| "Invalid to email")?)
        .subject(subject)
        .multipart(
            MultiPart::alternative()
                .singlepart(SinglePart::plain(text_content))
                .singlepart(SinglePart::html(html_content)),
        )
        .map_err(|e| format!("Failed to build email: {}", e))?;

    let mut mailer_builder = smtp_builder(&config)?;
    if let (Some(u), Some(p)) = (&config.username, &config.password) {
        if !u.is_empty() && !p.is_empty() {
            mailer_builder = mailer_builder.credentials(Credentials::new(u.clone(), p.clone()));
        }
    }
    let mailer = mailer_builder.build();
    mailer
        .send(email_msg)
        .await
        .map_err(|e| format!("SMTP failed: {}", e))?;
    tracing::info!("Action email ({:?}) delivered to {}", subject, to_email);
    Ok(())
}

pub async fn send_test_email(
    pool: &PgPool,
    config_override: SmtpConfig,
    to_email: &str,
) -> Result<(), String> {
    let email_msg = Message::builder()
        .from(format!("Rooiam Security <{}>", config_override.from_email)
            .parse()
            .map_err(|_| "Invalid from email".to_string())?)
        .to(to_email.parse().map_err(|_| "Invalid to email".to_string())?)
        .subject("Rooiam SMTP Test")
        .multipart(
            MultiPart::alternative()
                .singlepart(SinglePart::plain(format!(
                    "This is a test email from Rooiam.\n\nSMTP host: {}\nPort: {}\nSecurity: {}",
                    config_override.host, config_override.port, config_override.security
                )))
                .singlepart(SinglePart::html(format!(
                    "<p>This is a test email from <strong>Rooiam</strong>.</p><p>SMTP host: <code>{}</code><br/>Port: <code>{}</code><br/>Security: <code>{}</code></p>",
                    config_override.host, config_override.port, config_override.security
                ))),
        )
        .map_err(|e| format!("Failed to build email: {}", e))?;

    let mut mailer_builder = smtp_builder(&config_override)?;
    if let (Some(username), Some(password)) = (&config_override.username, &config_override.password)
    {
        if !username.is_empty() && !password.is_empty() {
            mailer_builder =
                mailer_builder.credentials(Credentials::new(username.clone(), password.clone()));
        }
    }

    let mailer = mailer_builder.build();
    tracing::info!(
        "Sending SMTP test email to {} via {}:{} ({}, insecure_tls={})",
        to_email,
        config_override.host,
        config_override.port,
        config_override.security,
        config_override.insecure_tls,
    );
    let _ = pool;
    mailer
        .send(email_msg)
        .await
        .map_err(|e| format!("SMTP failed: {}", e))?;
    Ok(())
}

pub async fn send_custom_email(
    config: &SmtpConfig,
    to_email: &str,
    subject: &str,
    body_text: &str,
) -> Result<(), String> {
    let email_msg = Message::builder()
        .from(
            format!("Rooiam <{}>", config.from_email)
                .parse()
                .map_err(|_| "Invalid from email".to_string())?,
        )
        .to(to_email
            .parse()
            .map_err(|_| "Invalid to email".to_string())?)
        .subject(subject)
        .singlepart(SinglePart::plain(body_text.to_string()))
        .map_err(|e| format!("Failed to build email: {}", e))?;

    let mut mailer_builder = smtp_builder(config)?;
    if let (Some(username), Some(password)) = (&config.username, &config.password) {
        if !username.is_empty() && !password.is_empty() {
            mailer_builder =
                mailer_builder.credentials(Credentials::new(username.clone(), password.clone()));
        }
    }
    mailer_builder
        .build()
        .send(email_msg)
        .await
        .map_err(|e| format!("SMTP failed: {}", e))?;
    Ok(())
}

async fn get_setting(
    pool: &PgPool,
    key: &str,
    env_keys: &[&str],
) -> Result<Option<String>, String> {
    let db_value: Option<String> =
        sqlx::query_scalar("SELECT value FROM system_settings WHERE key = $1")
            .bind(key)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

    if db_value
        .as_deref()
        .is_some_and(|value| !value.trim().is_empty())
    {
        return Ok(db_value);
    }

    Ok(env_keys.iter().find_map(|key| std::env::var(key).ok()))
}

fn env_value(keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| std::env::var(key).ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

async fn legacy_setting(pool: &PgPool, key: &str) -> Result<Option<String>, String> {
    let value: Option<String> =
        sqlx::query_scalar("SELECT value FROM system_settings WHERE key = $1")
            .bind(key)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

    Ok(value.filter(|value| !value.trim().is_empty()))
}

async fn load_smtp_config(pool: &PgPool) -> Result<Option<SmtpConfig>, String> {
    if demo_seed_enabled() {
        let host = env_value(&["ROOIAM_DEMO_SMTP_HOST"]).unwrap_or_else(|| "127.0.0.1".to_string());
        let port = env_value(&["ROOIAM_DEMO_SMTP_PORT"])
            .and_then(|value| value.parse().ok())
            .unwrap_or(1025);
        let from_email = env_value(&["ROOIAM_DEMO_SMTP_FROM"])
            .unwrap_or_else(|| "demo@rooiam.local".to_string());

        return Ok(Some(SmtpConfig {
            host,
            port,
            username: None,
            password: None,
            from_email,
            security: "none".to_string(),
            insecure_tls: false,
        }));
    }

    let host = get_setting(pool, "smtp_host", &["ROOIAM_SMTP_HOST"]).await?;
    let host = match host {
        Some(host) if !host.trim().is_empty() => host,
        _ => return Ok(None),
    };

    let port = get_setting(pool, "smtp_port", &["ROOIAM_SMTP_PORT"])
        .await?
        .or_else(|| std::env::var("SMTP_PORT").ok())
        .or_else(|| Some("587".to_string()))
        .and_then(|value| value.parse().ok())
        .unwrap_or(587);

    let username =
        match get_setting(pool, "smtp_username", &["ROOIAM_SMTP_USER", "SMTP_USER"]).await? {
            some @ Some(_) => some,
            None => legacy_setting(pool, "smtp_user").await?,
        };
    let password =
        match get_setting(pool, "smtp_password", &["ROOIAM_SMTP_PASS", "SMTP_PASS"]).await? {
            some @ Some(_) => some,
            None => legacy_setting(pool, "smtp_pass").await?,
        };
    let from_email = get_setting(
        pool,
        "smtp_from_email",
        &["ROOIAM_SMTP_FROM", "ROOIAM_FROM_EMAIL", "FROM_EMAIL"],
    )
    .await?
    .unwrap_or_else(|| "auth@rooiam.local".to_string());
    let security = get_setting(
        pool,
        "smtp_security",
        &["ROOIAM_SMTP_SECURITY", "SMTP_SECURITY"],
    )
    .await?
    .unwrap_or_else(|| {
        if port == 465 {
            "tls".to_string()
        } else {
            "starttls".to_string()
        }
    })
    .trim()
    .to_lowercase();
    let insecure_tls = get_setting(
        pool,
        "smtp_insecure_tls",
        &["ROOIAM_SMTP_INSECURE_TLS", "MAIL_INSECURE_TLS"],
    )
    .await?
    .map(|value| {
        matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "on"
        )
    })
    .unwrap_or(false);

    Ok(Some(SmtpConfig {
        host,
        port,
        username,
        password,
        from_email,
        security,
        insecure_tls,
    }))
}

pub fn demo_smtp_present() -> bool {
    let host = env_value(&["ROOIAM_DEMO_SMTP_HOST"]).unwrap_or_else(|| "127.0.0.1".to_string());
    let from_email =
        env_value(&["ROOIAM_DEMO_SMTP_FROM"]).unwrap_or_else(|| "demo@rooiam.local".to_string());
    !host.trim().is_empty() && !from_email.trim().is_empty()
}

pub async fn smtp_runtime_summary(pool: &PgPool) -> Result<Option<SmtpRuntimeSummary>, String> {
    let Some(config) = load_smtp_config(pool).await? else {
        return Ok(None);
    };

    Ok(Some(SmtpRuntimeSummary {
        mode_label: if demo_seed_enabled() {
            "demo-mailhog".to_string()
        } else {
            "normal-smtp".to_string()
        },
        host: config.host,
        port: config.port,
        from_email: config.from_email,
        security: config.security,
        username_present: config
            .username
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty()),
        password_present: config
            .password
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty()),
    }))
}

enum TlsMode {
    StartTls,
    Wrapper,
}

fn smtp_builder(
    config: &SmtpConfig,
) -> Result<lettre::transport::smtp::AsyncSmtpTransportBuilder, String> {
    match config.security.as_str() {
        "tls" | "smtps" | "ssl" => smtp_builder_with_tls(
            &config.host,
            config.port,
            TlsMode::Wrapper,
            config.insecure_tls,
        ),
        "none" | "plain" | "plaintext" => Ok(
            AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&config.host).port(config.port),
        ),
        _ => smtp_builder_with_tls(
            &config.host,
            config.port,
            TlsMode::StartTls,
            config.insecure_tls,
        ),
    }
}

fn smtp_builder_with_tls(
    host: &str,
    port: u16,
    mode: TlsMode,
    insecure_tls: bool,
) -> Result<lettre::transport::smtp::AsyncSmtpTransportBuilder, String> {
    let tls = if insecure_tls {
        TlsParameters::builder(host.to_string())
            .dangerous_accept_invalid_certs(true)
            .dangerous_accept_invalid_hostnames(true)
            .build()
            .map_err(|e| format!("Invalid SMTP TLS parameters: {}", e))?
    } else {
        TlsParameters::new(host.to_string())
            .map_err(|e| format!("Invalid SMTP TLS parameters: {}", e))?
    };

    let builder = AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(host).port(port);

    Ok(match mode {
        TlsMode::StartTls => builder.tls(Tls::Required(tls)),
        TlsMode::Wrapper => builder.tls(Tls::Wrapper(tls)),
    })
}

#[cfg(test)]
mod tests {
    use super::{sanitize_brand_color, sanitize_display_name};

    #[test]
    fn accepts_hex_brand_color() {
        assert_eq!(
            sanitize_brand_color(Some("#A1B2C3")).as_deref(),
            Some("#A1B2C3")
        );
    }

    #[test]
    fn rejects_non_hex_brand_color() {
        assert!(sanitize_brand_color(Some("javascript:alert(1)")).is_none());
    }

    #[test]
    fn strips_newlines_from_display_name() {
        assert_eq!(
            sanitize_display_name("MintMallow\r\nSupport", 80).as_deref(),
            Some("MintMallowSupport")
        );
    }
}
