use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use super::models::SessionCreateContext;
use super::repository::SessionRepository;
use crate::shared::error::AppError;

pub use crate::shared::request_ip::parse_client_ip;

async fn list_org_operator_emails(db: &PgPool, org_id: Uuid) -> Vec<String> {
    sqlx::query_scalar::<_, Option<String>>(
        r#"
        SELECT DISTINCT ue.email
        FROM organization_members om
        JOIN users u ON u.id = om.user_id
        JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
        JOIN member_roles mr ON mr.member_id = om.id
        JOIN roles r ON r.id = mr.role_id
        WHERE om.organization_id = $1
          AND om.status = 'active'
          AND u.status = 'active'
          AND r.code IN ('owner', 'admin')
        "#,
    )
    .bind(org_id)
    .fetch_all(db)
    .await
    .unwrap_or_default()
    .into_iter()
    .flatten()
    .collect()
}

async fn list_platform_operator_emails(db: &PgPool) -> Vec<String> {
    sqlx::query_scalar::<_, Option<String>>(
        r#"
        SELECT DISTINCT ue.email
        FROM users u
        JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
        WHERE u.status = 'active'
          AND (u.is_platform_owner = true OR u.is_superuser = true)
        "#,
    )
    .fetch_all(db)
    .await
    .unwrap_or_default()
    .into_iter()
    .flatten()
    .collect()
}

async fn send_high_severity_operator_alerts(
    db: PgPool,
    org_id: Option<Uuid>,
    user_email: &str,
    app_name: Option<String>,
    workspace_slug: Option<String>,
    ip: Option<String>,
    user_agent: Option<String>,
    reason: &str,
) {
    use crate::infra::email::send_notification_email;

    let recipients = if let Some(org_id) = org_id {
        list_org_operator_emails(&db, org_id).await
    } else {
        list_platform_operator_emails(&db).await
    };

    if recipients.is_empty() {
        return;
    }

    let scope = workspace_slug
        .clone()
        .unwrap_or_else(|| "platform".to_string());
    let subject = format!("High-severity suspicious sign-in detected for {}", scope);
    let ip_text = ip.unwrap_or_else(|| "unknown".to_string());
    let ua_text = user_agent.unwrap_or_else(|| "unknown device".to_string());
    let app_line = app_name
        .as_deref()
        .map(|value| format!("\nApp: {value}"))
        .unwrap_or_default();
    let workspace_line = workspace_slug
        .as_deref()
        .map(|value| format!("\nWorkspace: {value}"))
        .unwrap_or_default();
    let text = format!(
        "Rooiam detected a high-severity suspicious sign-in.\n\nUser: {user_email}\nReason: {reason}\nIP address: {ip}\nDevice: {ua}{app}{workspace}\n\nReview the suspicious-auth alerts and audit logs immediately.",
        user_email = user_email,
        reason = reason,
        ip = ip_text,
        ua = ua_text,
        app = app_line,
        workspace = workspace_line,
    );
    let app_html = app_name
        .as_deref()
        .map(|value| format!("<tr><td style='padding:6px 0;color:#64748b;font-weight:600'>App</td><td style='padding:6px 0;color:#1e293b'>{value}</td></tr>"))
        .unwrap_or_default();
    let workspace_html = workspace_slug
        .as_deref()
        .map(|value| format!("<tr><td style='padding:6px 0;color:#64748b;font-weight:600'>Workspace</td><td style='padding:6px 0;color:#1e293b'>{value}</td></tr>"))
        .unwrap_or_default();
    let html = format!(
        "<div style='font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px'>\
        <h2 style='color:#7f1d1d;margin-bottom:8px'>High-severity suspicious sign-in</h2>\
        <p style='color:#475569'>Rooiam detected a sign-in that needs operator review.</p>\
        <table style='width:100%;border-collapse:collapse;margin:16px 0;font-size:13px'>\
        <tr><td style='padding:6px 0;color:#64748b;font-weight:600'>User</td><td style='padding:6px 0;color:#1e293b'>{user_email}</td></tr>\
        <tr><td style='padding:6px 0;color:#64748b;font-weight:600'>Reason</td><td style='padding:6px 0;color:#1e293b'>{reason}</td></tr>\
        <tr><td style='padding:6px 0;color:#64748b;font-weight:600'>IP address</td><td style='padding:6px 0;color:#1e293b'>{ip}</td></tr>\
        <tr><td style='padding:6px 0;color:#64748b;font-weight:600'>Device</td><td style='padding:6px 0;color:#1e293b'>{ua}</td></tr>\
        {app_html}{workspace_html}\
        </table>\
        <p style='color:#475569'>Review the suspicious-auth alerts and audit logs immediately.</p>\
        </div>",
        user_email = user_email,
        reason = reason,
        ip = ip_text,
        ua = ua_text,
        app_html = app_html,
        workspace_html = workspace_html,
    );

    for recipient in recipients {
        if recipient.eq_ignore_ascii_case(user_email) {
            continue;
        }
        if let Err(e) = send_notification_email(&db, &recipient, &subject, &text, &html).await {
            tracing::warn!(
                "High-severity operator suspicious-login email to {} failed: {}",
                recipient,
                e
            );
        }
    }
}

async fn should_send_high_severity_operator_alert(
    db: &PgPool,
    user_id: Uuid,
    org_id: Option<Uuid>,
    reason: &str,
) -> bool {
    let recent_count: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM audit_logs
        WHERE actor_user_id = $1
          AND action = 'auth.login.suspicious'
          AND ($2::uuid IS NULL OR organization_id IS NOT DISTINCT FROM $2)
          AND metadata->>'reason' = $3
          AND created_at >= NOW() - INTERVAL '30 minutes'
        "#,
    )
    .bind(user_id)
    .bind(org_id)
    .bind(reason)
    .fetch_one(db)
    .await
    .unwrap_or(0);

    recent_count <= 1
}

pub struct SessionService {
    repo: SessionRepository,
    db: PgPool,
}

impl SessionService {
    pub fn new(repo: SessionRepository, db: PgPool) -> Self {
        Self { repo, db }
    }

    /// Generate a brand new Opaque HTTP Session
    ///
    /// Returns the active DB `Session` record, and the RAW token value to build the HTTP cookie.
    pub async fn create_opaque_session(
        &self,
        user_id: Uuid,
    ) -> Result<(super::models::Session, String), AppError> {
        self.create_opaque_session_with_context(user_id, SessionCreateContext::default())
            .await
    }

    pub async fn create_opaque_session_with_context(
        &self,
        user_id: Uuid,
        context: SessionCreateContext,
    ) -> Result<(super::models::Session, String), AppError> {
        self.repo.ensure_user_active(user_id).await?;
        let session_id = Uuid::new_v4();

        // 1. Generate Raw Session Secret
        let mut bytes = [0u8; 32];
        OsRng.fill_bytes(&mut bytes);
        let raw_secret = URL_SAFE_NO_PAD.encode(bytes);

        // 2. Hash it for the database (Same logic as magic links)
        let mut hasher = Sha256::new();
        hasher.update(raw_secret.as_bytes());
        let secret_hash_hex = hex::encode(hasher.finalize());

        // 3. Set expiry — org override (max_session_age_hours → days) first,
        //    then platform system_settings, default 7 days.
        let platform_days: i64 = sqlx::query_scalar(
            "SELECT value::bigint FROM system_settings WHERE key = 'session_duration_days'",
        )
        .fetch_optional(&self.db)
        .await
        .ok()
        .flatten()
        .unwrap_or(7);

        let tenant_days: i64 = sqlx::query_scalar(
            "SELECT value::bigint FROM system_settings WHERE key = 'tenant_session_duration_days'",
        )
        .fetch_optional(&self.db)
        .await
        .ok()
        .flatten()
        .unwrap_or(platform_days);

        let duration_days: i64 = if matches!(context.login_surface.as_deref(), Some("tenant")) {
            tenant_days
        } else if let Some(org_id) = context.current_org_id {
            use crate::modules::organization::repository::OrganizationRepository;
            let org_days = OrganizationRepository::new(self.db.clone())
                .get_organization_by_id(org_id)
                .await
                .ok()
                .flatten()
                .and_then(|o| o.max_session_age_hours)
                // Convert hours→days using ceiling so e.g. 12h → 1 day (not 0 = unlimited)
                .map(|h| (i64::from(h) + 23) / 24);
            // Use org override only if it is stricter than the platform limit
            match org_days {
                Some(d) if d > 0 && d < platform_days => d,
                _ => platform_days,
            }
        } else {
            platform_days
        };

        let expiry = chrono::Utc::now() + chrono::Duration::days(duration_days);

        // 4. Save hash to DB
        let session = self
            .repo
            .create_session(
                session_id,
                user_id,
                &secret_hash_hex,
                expiry,
                context.current_org_id,
                context.login_surface.as_deref(),
                context.login_app_name.as_deref(),
                context.login_workspace_slug.as_deref(),
                context.user_agent.as_deref(),
                context.ip,
            )
            .await?;

        // 5. Enforce per-workspace concurrent session limit (if applicable)
        if let Some(org_id) = context.current_org_id {
            use crate::modules::organization::repository::OrganizationRepository;
            if let Ok(Some(org)) = OrganizationRepository::new(self.db.clone())
                .get_organization_by_id(org_id)
                .await
            {
                if let Some(max) = org.max_concurrent_sessions {
                    // Keep the `max` most recent sessions; the new session is already in the DB.
                    // Revoke any that exceed the limit (oldest first).
                    let _ = self
                        .repo
                        .revoke_oldest_sessions_for_org(user_id, org_id, i64::from(max))
                        .await;
                }
            }
        }

        // 6. Suspicious login detection: new device class triggers audit + security email
        {
            use crate::shared::session_fingerprint::device_class;
            let current_class = device_class(context.user_agent.as_deref());
            if let Ok(prior_uas) = self
                .repo
                .get_recent_session_user_agents(user_id, session_id)
                .await
            {
                if !prior_uas.is_empty() {
                    let seen_this_class = prior_uas
                        .iter()
                        .any(|ua| device_class(ua.as_deref()) == current_class);
                    if !seen_this_class {
                        use crate::modules::audit::service::{AuditEvent, AuditService};
                        AuditService::new(self.db.clone())
                            .log(AuditEvent {
                                actor_user_id: Some(user_id),
                                organization_id: context.current_org_id,
                                action: "auth.login.suspicious".into(),
                                target_type: "session".into(),
                                target_id: Some(session_id.to_string()),
                                ip: context.ip.map(|ip| ip.to_string()),
                                user_agent: context.user_agent.clone(),
                                metadata: serde_json::json!({
                                    "reason": "new_device_class",
                                    "device_class": current_class,
                                    "session_id": session_id,
                                }),
                            })
                            .await;

                        // Fire-and-forget security email — never blocks or fails the login
                        {
                            use crate::infra::email::send_notification_email;
                            use crate::modules::identity::repository::IdentityRepository;

                            let db_clone = self.db.clone();
                            let ip_str = context
                                .ip
                                .map(|ip| ip.to_string())
                                .unwrap_or_else(|| "unknown".to_string());
                            let ua_str = context
                                .user_agent
                                .clone()
                                .unwrap_or_else(|| "unknown device".to_string());

                            tokio::spawn(async move {
                                let email = IdentityRepository::new(db_clone.clone())
                                    .get_primary_email_by_user_id(user_id)
                                    .await
                                    .ok()
                                    .flatten()
                                    .unwrap_or_default();

                                if email.is_empty() {
                                    return;
                                }

                                let subject = "New sign-in from an unrecognized device";
                                let text = format!(
                                    "A new sign-in to your account was detected from an unrecognized device.\n\nIP address: {ip}\nDevice: {ua}\n\nIf this was you, no action is needed.\n\nIf you do not recognize this sign-in, go to My Sessions in your account portal and revoke the session immediately.",
                                    ip = ip_str, ua = ua_str,
                                );
                                let html = format!(
                                    "<div style='font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px'>\
                                    <h2 style='color:#1e293b;margin-bottom:8px'>New sign-in detected</h2>\
                                    <p style='color:#475569'>A sign-in to your account was detected from an unrecognized device.</p>\
                                    <table style='width:100%;border-collapse:collapse;margin:16px 0;font-size:13px'>\
                                    <tr><td style='padding:6px 0;color:#64748b;font-weight:600'>IP address</td>\
                                    <td style='padding:6px 0;color:#1e293b'>{ip}</td></tr>\
                                    <tr><td style='padding:6px 0;color:#64748b;font-weight:600'>Device</td>\
                                    <td style='padding:6px 0;color:#1e293b'>{ua}</td></tr>\
                                    </table>\
                                    <p style='color:#475569'>If this was you, no action is needed.</p>\
                                    <p style='color:#475569'>If you do not recognize this sign-in, \
                                    <strong>go to My Sessions and revoke the session immediately.</strong></p>\
                                    </div>",
                                    ip = ip_str, ua = ua_str,
                                );

                                if let Err(e) = send_notification_email(
                                    &db_clone, &email, subject, &text, &html,
                                )
                                .await
                                {
                                    tracing::warn!(
                                        "Suspicious login notification to {} failed: {}",
                                        email,
                                        e,
                                    );
                                }
                            });
                        }
                    }
                }
            }
        }

        // 7. Risk assessment: evaluate login signals and log any suspicious ones.
        //    Fire-and-forget — never blocks or fails the login.
        {
            use crate::infra::email::send_notification_email;
            use crate::modules::audit::service::{AuditEvent, AuditService};
            use crate::modules::identity::repository::IdentityRepository;
            use crate::shared::risk;

            let ip_str = context.ip.map(|ip| ip.to_string());
            let policy = risk::load_policy(&self.db).await;
            let signals = risk::evaluate(
                &self.db,
                user_id,
                ip_str.as_deref(),
                context.user_agent.as_deref(),
            )
            .await;
            let ua_str = context
                .user_agent
                .clone()
                .unwrap_or_else(|| "unknown device".to_string());
            let login_app_name = context.login_app_name.clone();
            let login_workspace_slug = context.login_workspace_slug.clone();
            let user_email = IdentityRepository::new(self.db.clone())
                .get_primary_email_by_user_id(user_id)
                .await
                .ok()
                .flatten()
                .unwrap_or_default();

            for signal in signals {
                AuditService::new(self.db.clone())
                    .log(AuditEvent {
                        actor_user_id: Some(user_id),
                        organization_id: context.current_org_id,
                        action: "auth.login.suspicious".into(),
                        target_type: "session".into(),
                        target_id: Some(session_id.to_string()),
                        ip: ip_str.clone(),
                        user_agent: context.user_agent.clone(),
                        metadata: signal.metadata(),
                    })
                    .await;

                if policy.operator_email_enabled
                    && signal.severity() == risk::RiskSeverity::High
                    && !user_email.is_empty()
                    && should_send_high_severity_operator_alert(
                        &self.db,
                        user_id,
                        context.current_org_id,
                        signal.reason_key(),
                    )
                    .await
                {
                    let db_clone = self.db.clone();
                    let app_name = login_app_name.clone();
                    let workspace_slug = login_workspace_slug.clone();
                    let operator_ip = ip_str.clone();
                    let operator_ua = context.user_agent.clone();
                    let reason = signal.reason_key().to_string();
                    let operator_org_id = context.current_org_id;
                    let operator_user_email = user_email.clone();
                    tokio::spawn(async move {
                        send_high_severity_operator_alerts(
                            db_clone,
                            operator_org_id,
                            &operator_user_email,
                            app_name,
                            workspace_slug,
                            operator_ip,
                            operator_ua,
                            &reason,
                        )
                        .await;
                    });
                }

                if let risk::RiskSignal::NewIp { ip } = signal {
                    let db_clone = self.db.clone();
                    let login_app_name = login_app_name.clone();
                    let login_workspace_slug = login_workspace_slug.clone();
                    let ip_for_email = ip.clone();
                    let ua_for_email = ua_str.clone();

                    tokio::spawn(async move {
                        let email = IdentityRepository::new(db_clone.clone())
                            .get_primary_email_by_user_id(user_id)
                            .await
                            .ok()
                            .flatten()
                            .unwrap_or_default();

                        if email.is_empty() {
                            return;
                        }

                        let app_line = login_app_name
                            .as_deref()
                            .map(|value| format!("\nApp: {value}"))
                            .unwrap_or_default();
                        let workspace_line = login_workspace_slug
                            .as_deref()
                            .map(|value| format!("\nWorkspace: {value}"))
                            .unwrap_or_default();
                        let subject = "New sign-in from a new IP address";
                        let text = format!(
                            "We detected a sign-in to your Rooiam account from a new IP address.\n\nIP address: {ip}\nDevice: {ua}{app}{workspace}\n\nIf this was you, no action is needed.\n\nIf you do not recognize this sign-in, go to My Sessions and revoke the session immediately.",
                            ip = ip_for_email,
                            ua = ua_for_email,
                            app = app_line,
                            workspace = workspace_line,
                        );
                        let app_html = login_app_name
                            .as_deref()
                            .map(|value| format!("<tr><td style='padding:6px 0;color:#64748b;font-weight:600'>App</td><td style='padding:6px 0;color:#1e293b'>{value}</td></tr>"))
                            .unwrap_or_default();
                        let workspace_html = login_workspace_slug
                            .as_deref()
                            .map(|value| format!("<tr><td style='padding:6px 0;color:#64748b;font-weight:600'>Workspace</td><td style='padding:6px 0;color:#1e293b'>{value}</td></tr>"))
                            .unwrap_or_default();
                        let html = format!(
                            "<div style='font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px'>\
                            <h2 style='color:#1e293b;margin-bottom:8px'>New IP address detected</h2>\
                            <p style='color:#475569'>We detected a sign-in to your account from a new IP address.</p>\
                            <table style='width:100%;border-collapse:collapse;margin:16px 0;font-size:13px'>\
                            <tr><td style='padding:6px 0;color:#64748b;font-weight:600'>IP address</td><td style='padding:6px 0;color:#1e293b'>{ip}</td></tr>\
                            <tr><td style='padding:6px 0;color:#64748b;font-weight:600'>Device</td><td style='padding:6px 0;color:#1e293b'>{ua}</td></tr>\
                            {app_html}{workspace_html}\
                            </table>\
                            <p style='color:#475569'>If this was you, no action is needed.</p>\
                            <p style='color:#475569'>If you do not recognize this sign-in, <strong>go to My Sessions and revoke the session immediately.</strong></p>\
                            </div>",
                            ip = ip_for_email,
                            ua = ua_for_email,
                            app_html = app_html,
                            workspace_html = workspace_html,
                        );

                        if let Err(e) =
                            send_notification_email(&db_clone, &email, subject, &text, &html).await
                        {
                            tracing::warn!(
                                "New-IP suspicious login notification to {} failed: {}",
                                email,
                                e
                            );
                        }
                    });
                }
            }
        }

        // 8. Update legacy last-login markers after a successful session issue.
        {
            let ua_hash = context.user_agent.as_ref().map(|s| {
                let mut hasher = Sha256::new();
                hasher.update(s.as_bytes());
                hex::encode(hasher.finalize())
            });

            let _ = sqlx::query(
                "UPDATE users SET last_login_ip = $1, last_login_ua_hash = $2 WHERE id = $3",
            )
            .bind(context.ip.map(|ip| ip.to_string()))
            .bind(ua_hash)
            .bind(user_id)
            .execute(&self.db)
            .await;
        }

        // 9. Build raw cookie string (e.g. "uuid.raw_secret_value")
        let opaque_token_string = super::cookie::format_session_token(session_id, &raw_secret);

        Ok((session, opaque_token_string))
    }

    /// Inbound middleware validation logic
    pub async fn verify_opaque_session(
        &self,
        token_string: &str,
    ) -> Result<super::models::ActiveSession, AppError> {
        // Parse token format "uuid.rawsecret"
        let parts: Vec<&str> = token_string.split('.').collect();
        if parts.len() != 2 {
            return Err(AppError::Unauthorized);
        }

        let session_id = Uuid::parse_str(parts[0]).map_err(|_| AppError::Unauthorized)?;
        let raw_secret = parts[1];

        // Retrieve valid session from DB (also returns is_superuser flag)
        let (db_session, is_superuser) = self.repo.get_valid_session(session_id).await?;

        // Hash the incoming raw_secret to compare against DB
        let mut hasher = Sha256::new();
        hasher.update(raw_secret.as_bytes());
        let hash_hex = hex::encode(hasher.finalize());

        // Secure constant-time string comparison avoids basic timing attacks
        use subtle::ConstantTimeEq;
        if db_session
            .session_secret_hash
            .as_bytes()
            .ct_eq(hash_hex.as_bytes())
            .unwrap_u8()
            == 0
        {
            // Hash didn't match. It's an invalid cookie or session hijacking attempt.
            return Err(AppError::Unauthorized);
        }

        Ok(super::models::ActiveSession {
            session_id: db_session.id,
            user_id: db_session.user_id,
            current_org_id: db_session.current_org_id,
            login_surface: db_session.login_surface,
            is_superuser,
            created_at: db_session.created_at,
            last_seen_at: db_session.last_seen_at,
            session_fingerprint: db_session.session_fingerprint,
        })
    }
}
