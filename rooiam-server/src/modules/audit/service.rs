use sqlx::PgPool;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct AuditEvent {
    pub actor_user_id: Option<Uuid>,
    pub organization_id: Option<Uuid>,
    pub action: String,
    pub target_type: String,
    pub target_id: Option<String>,
    pub ip: Option<String>,
    pub user_agent: Option<String>,
    pub metadata: serde_json::Value,
}

pub struct AuditService {
    pool: PgPool,
}

impl AuditService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn log(&self, event: AuditEvent) {
        let row = sqlx::query(
            "INSERT INTO audit_logs (actor_user_id, organization_id, action, target_type, target_id, ip, user_agent, metadata)
             VALUES ($1, $2, $3, $4, $5, $6::inet, $7, $8)
             RETURNING id, created_at"
        )
        .bind(event.actor_user_id)
        .bind(event.organization_id)
        .bind(&event.action)
        .bind(&event.target_type)
        .bind(&event.target_id)
        .bind(&event.ip)
        .bind(&event.user_agent)
        .bind(&event.metadata)
        .fetch_optional(&self.pool)
        .await;

        let (log_id, created_at) = match row {
            Ok(Some(r)) => {
                use sqlx::Row;
                let id: i64 = r.get("id");
                let ts: chrono::DateTime<chrono::Utc> = r.get("created_at");
                (id, ts)
            }
            Ok(None) => return,
            Err(e) => {
                tracing::error!("Failed to write audit log: {}", e);
                return;
            }
        };

        // Fire-and-forget SIEM webhook if configured
        let pool = self.pool.clone();
        let payload = serde_json::json!({
            "id": log_id,
            "actor_user_id": event.actor_user_id,
            "organization_id": event.organization_id,
            "action": event.action,
            "target_type": event.target_type,
            "target_id": event.target_id,
            "ip": event.ip,
            "user_agent": event.user_agent,
            "metadata": event.metadata,
            "created_at": created_at.to_rfc3339(),
        });

        tokio::spawn(async move {
            dispatch_webhook(&pool, payload).await;
        });
    }
}

/// Returns true if the URL is safe to use as a SIEM webhook target.
/// Rejects loopback, link-local, and RFC-1918 private addresses to prevent SSRF.
fn is_safe_webhook_url(url: &str) -> bool {
    let parsed = match url::Url::parse(url) {
        Ok(u) => u,
        Err(_) => return false,
    };
    // Only allow http and https
    if !matches!(parsed.scheme(), "http" | "https") {
        return false;
    }
    let host = match parsed.host_str() {
        Some(h) => h,
        None => return false,
    };
    // Reject localhost variants
    if host.eq_ignore_ascii_case("localhost") || host == "::1" {
        return false;
    }
    // Reject numeric IPv4 in private/loopback ranges
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        if ip.is_loopback() {
            return false;
        }
        if let std::net::IpAddr::V4(v4) = ip {
            let octets = v4.octets();
            // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16
            if octets[0] == 10
                || (octets[0] == 172 && (16..=31).contains(&octets[1]))
                || (octets[0] == 192 && octets[1] == 168)
                || (octets[0] == 169 && octets[1] == 254)
            {
                return false;
            }
        }
        if let std::net::IpAddr::V6(v6) = ip {
            // fc00::/7 (ULA), fe80::/10 (link-local)
            let segs = v6.segments();
            if (segs[0] & 0xfe00) == 0xfc00 || (segs[0] & 0xffc0) == 0xfe80 {
                return false;
            }
        }
    }
    true
}

async fn dispatch_webhook(pool: &PgPool, payload: serde_json::Value) {
    // Read webhook URL from settings
    let url: Option<String> = sqlx::query_scalar(
        "SELECT value FROM system_settings WHERE key = 'siem_webhook_url'"
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let url = match url {
        Some(u) if !u.trim().is_empty() => u.trim().to_string(),
        _ => return, // not configured
    };

    // SSRF protection: reject URLs pointing to loopback or RFC-1918 private ranges
    if !is_safe_webhook_url(&url) {
        tracing::warn!("siem_webhook: blocking unsafe URL (private/loopback SSRF prevention)");
        return;
    }

    let secret: Option<String> = sqlx::query_scalar(
        "SELECT value FROM system_settings WHERE key = 'siem_webhook_secret'"
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();

    let body = match serde_json::to_string(&payload) {
        Ok(b) => b,
        Err(_) => return,
    };

    let mut req = reqwest::Client::new()
        .post(&url)
        .header("Content-Type", "application/json")
        .header("User-Agent", "Rooiam-SIEM/1.0");

    // Attach HMAC-SHA256 signature if a secret is configured
    if let Some(secret) = secret.filter(|s| !s.trim().is_empty()) {
        use hmac::{Hmac, Mac};
        use sha2::Sha256;
        type HmacSha256 = Hmac<Sha256>;
        if let Ok(mut mac) = HmacSha256::new_from_slice(secret.as_bytes()) {
            mac.update(body.as_bytes());
            let sig = hex::encode(mac.finalize().into_bytes());
            req = req.header("X-Rooiam-Signature", format!("sha256={}", sig));
        }
    }

    match req.body(body).timeout(std::time::Duration::from_secs(5)).send().await {
        Ok(resp) if resp.status().is_success() => {
            tracing::debug!("siem_webhook: delivered (status={})", resp.status());
        }
        Ok(resp) => {
            tracing::warn!("siem_webhook: non-success status {}", resp.status());
        }
        Err(e) => {
            tracing::warn!("siem_webhook: delivery failed: {}", e);
        }
    }
}
