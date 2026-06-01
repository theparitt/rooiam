//! # Login Risk Assessment (Level 1)
//!
//! Evaluates a small set of cheap, observable signals after a user's credentials
//! are verified but before a session is issued.  At Level 1 the module **never
//! blocks** a login — it only emits `auth.login.suspicious` audit events so
//! operators can investigate.  Blocking / step-up MFA based on risk score is
//! planned for Level 2.
//!
//! ## Signals
//!
//! | Signal | Reason | Audit reason key |
//! |---|---|---|
//! | `new_ip` | IP not seen in this user's last N successful logins | `new_ip` |
//! | `rapid_ip_change` | Same user logged in from a different IP within the last N minutes | `rapid_ip_change` |
//! | `new_user_agent` | User-agent not seen in this user's last N successful logins | `new_user_agent` |
//!
//! ## Configuration
//!
//! Thresholds are loaded from `system_settings` at evaluation time:
//!
//! | Key | Default | Meaning |
//! |---|---|---|
//! | `risk_enabled` | `1` | Master switch — `0` disables all signals |
//! | `risk_new_ip_enabled` | `1` | Enable new-IP signal |
//! | `risk_new_ip_lookback` | `10` | How many recent logins to check |
//! | `risk_rapid_ip_change_enabled` | `1` | Enable rapid-IP-change signal |
//! | `risk_rapid_ip_change_window_minutes` | `10` | Time window in minutes |
//! | `risk_new_user_agent_enabled` | `1` | Enable new-user-agent signal |
//! | `risk_new_user_agent_lookback` | `10` | How many recent logins to check for a known user-agent |
//! | `risk_operator_email_enabled` | `1` | Send high-severity suspicious-login email to operators |
//!
//! ## Adding signals
//!
//! 1. Add a variant to [`RiskSignal`].
//! 2. Add detection logic inside [`evaluate`].
//! 3. Document it in the table above and in `docs/internal/36_audit_log_color_system.md`.

use sqlx::PgPool;
use uuid::Uuid;

/// A single risk signal detected during login evaluation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RiskSignal {
    /// The login IP has not been seen in this user's recent login history.
    NewIp { ip: String },
    /// The user logged in from a different IP address within a short time window.
    RapidIpChange { previous_ip: String, current_ip: String, window_minutes: i64 },
    /// The login user-agent has not been seen in this user's recent login history.
    NewUserAgent { user_agent: String },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RiskSeverity {
    Medium,
    High,
}

impl RiskSignal {
    /// Short key used as the `reason` field in the audit log metadata.
    pub fn reason_key(&self) -> &'static str {
        match self {
            RiskSignal::NewIp { .. } => "new_ip",
            RiskSignal::RapidIpChange { .. } => "rapid_ip_change",
            RiskSignal::NewUserAgent { .. } => "new_user_agent",
        }
    }

    pub fn severity(&self) -> RiskSeverity {
        match self {
            RiskSignal::RapidIpChange { .. } => RiskSeverity::High,
            RiskSignal::NewIp { .. } | RiskSignal::NewUserAgent { .. } => RiskSeverity::Medium,
        }
    }

    /// JSON metadata blob for the audit event.
    pub fn metadata(&self) -> serde_json::Value {
        match self {
            RiskSignal::NewIp { ip } => serde_json::json!({
                "reason": self.reason_key(),
                "ip": ip,
            }),
            RiskSignal::RapidIpChange { previous_ip, current_ip, window_minutes } => serde_json::json!({
                "reason": self.reason_key(),
                "previous_ip": previous_ip,
                "current_ip": current_ip,
                "window_minutes": window_minutes,
                "severity": match self.severity() { RiskSeverity::High => "high", RiskSeverity::Medium => "medium" },
            }),
            RiskSignal::NewUserAgent { user_agent } => serde_json::json!({
                "reason": self.reason_key(),
                "user_agent": user_agent,
                "severity": match self.severity() { RiskSeverity::High => "high", RiskSeverity::Medium => "medium" },
            }),
        }
    }
}

/// Risk policy loaded from system_settings.
/// All fields have defaults so missing keys behave safely.
pub struct RiskPolicy {
    pub enabled: bool,
    pub new_ip_enabled: bool,
    /// How many recent successful logins to check for known IPs.
    pub new_ip_lookback: i64,
    pub rapid_ip_change_enabled: bool,
    /// Time window in minutes for rapid IP change detection.
    pub rapid_ip_change_window_minutes: i64,
    pub new_user_agent_enabled: bool,
    /// How many recent successful logins to check for known user-agents.
    pub new_user_agent_lookback: i64,
    /// Whether high-severity suspicious-login events should notify operators.
    pub operator_email_enabled: bool,
}

impl Default for RiskPolicy {
    fn default() -> Self {
        Self {
            enabled: true,
            new_ip_enabled: true,
            new_ip_lookback: 10,
            rapid_ip_change_enabled: true,
            rapid_ip_change_window_minutes: 10,
            new_user_agent_enabled: true,
            new_user_agent_lookback: 10,
            operator_email_enabled: true,
        }
    }
}

/// Load risk policy from system_settings. Missing keys fall back to defaults.
pub async fn load_policy(db: &PgPool) -> RiskPolicy {
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT key, value FROM system_settings WHERE key LIKE 'risk_%'"
    )
    .fetch_all(db)
    .await
    .unwrap_or_default();

    let mut policy = RiskPolicy::default();
    for (key, value) in rows {
        match key.as_str() {
            "risk_enabled"                       => policy.enabled = value != "0",
            "risk_new_ip_enabled"                => policy.new_ip_enabled = value != "0",
            "risk_new_ip_lookback"               => policy.new_ip_lookback = value.parse().unwrap_or(10),
            "risk_rapid_ip_change_enabled"       => policy.rapid_ip_change_enabled = value != "0",
            "risk_rapid_ip_change_window_minutes"=> policy.rapid_ip_change_window_minutes = value.parse().unwrap_or(10),
            "risk_new_user_agent_enabled"        => policy.new_user_agent_enabled = value != "0",
            "risk_new_user_agent_lookback"       => policy.new_user_agent_lookback = value.parse().unwrap_or(10),
            "risk_operator_email_enabled"        => policy.operator_email_enabled = value != "0",
            _ => {}
        }
    }
    policy
}

/// Evaluate login risk for a user and return all triggered signals.
///
/// Reads policy from system_settings. Never returns an error — failures are
/// silently ignored so they cannot block a legitimate login.
pub async fn evaluate(
    db: &PgPool,
    user_id: Uuid,
    ip: Option<&str>,
    user_agent: Option<&str>,
) -> Vec<RiskSignal> {
    let policy = load_policy(db).await;

    // Master switch
    if !policy.enabled {
        return Vec::new();
    }

    // All signals require a known IP
    let Some(current_ip) = ip else {
        return Vec::new();
    };

    let mut signals = Vec::new();

    // --- Signal 1: New IP (not seen in last N successful logins) ---
    if policy.new_ip_enabled {
        let recent_ips: Vec<Option<String>> = sqlx::query_scalar(
            r#"
            SELECT ip::text
            FROM audit_logs
            WHERE actor_user_id = $1
              AND action = 'auth.login.success'
              AND ip IS NOT NULL
            ORDER BY created_at DESC
            LIMIT $2
            "#,
        )
        .bind(user_id)
        .bind(policy.new_ip_lookback)
        .fetch_all(db)
        .await
        .unwrap_or_default();

        let known_ips: Vec<String> = recent_ips.into_iter().flatten().collect();

        // Only flag if the user has prior logins — skip on first-ever login
        if !known_ips.is_empty() && !known_ips.iter().any(|k| k == current_ip) {
            signals.push(RiskSignal::NewIp { ip: current_ip.to_string() });
        }
    }

    // --- Signal 2: Rapid IP change (different IP from same user within N minutes) ---
    if policy.rapid_ip_change_enabled {
        let window = policy.rapid_ip_change_window_minutes;
        let recent_other_ip: Option<String> = sqlx::query_scalar(
            r#"
            SELECT ip::text
            FROM audit_logs
            WHERE actor_user_id = $1
              AND action = 'auth.login.success'
              AND ip IS NOT NULL
              AND ip::text <> $2
              AND created_at >= NOW() - ($3 || ' minutes')::interval
            ORDER BY created_at DESC
            LIMIT 1
            "#,
        )
        .bind(user_id)
        .bind(current_ip)
        .bind(window)
        .fetch_optional(db)
        .await
        .unwrap_or(None)
        .flatten();

        if let Some(prev_ip) = recent_other_ip {
            signals.push(RiskSignal::RapidIpChange {
                previous_ip: prev_ip,
                current_ip: current_ip.to_string(),
                window_minutes: window,
            });
        }
    }

    // --- Signal 3: New user agent (not seen in last N successful logins) ---
    if policy.new_user_agent_enabled {
        if let Some(current_user_agent) = user_agent.map(str::trim).filter(|value| !value.is_empty()) {
            let recent_uas: Vec<Option<String>> = sqlx::query_scalar(
                r#"
                SELECT user_agent
                FROM audit_logs
                WHERE actor_user_id = $1
                  AND action = 'auth.login.success'
                  AND user_agent IS NOT NULL
                ORDER BY created_at DESC
                LIMIT $2
                "#,
            )
            .bind(user_id)
            .bind(policy.new_user_agent_lookback)
            .fetch_all(db)
            .await
            .unwrap_or_default();

            let known_uas: Vec<String> = recent_uas.into_iter().flatten().collect();
            if !known_uas.is_empty() && !known_uas.iter().any(|known| known == current_user_agent) {
                signals.push(RiskSignal::NewUserAgent {
                    user_agent: current_user_agent.to_string(),
                });
            }
        }
    }

    signals
}
