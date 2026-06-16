use std::net::IpAddr;

use ipnet::IpNet;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::modules::organization::repository::OrganizationRepository;
use crate::shared::auth_context::parse_workspace_slug_from_redirect;
use crate::shared::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformIpPolicy {
    pub tenant_ip_policy_editable: bool,
    pub default_allowlist: String,
    pub default_blocklist: String,
}

/// Separate IP policy applied exclusively to platform admins (is_superuser = true).
/// Superusers should be governed by platform-level rules, not tenant IP policy,
/// because their current_org_id changes as they navigate between workspaces.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformAdminIpPolicy {
    pub allowlist: String,
    pub blocklist: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenantIpPolicy {
    pub use_custom_ip_policy: bool,
    pub allowlist: String,
    pub blocklist: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EffectiveIpPolicy {
    pub source: String,
    pub allowlist: String,
    pub blocklist: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IpAccessDecision {
    Allowed,
    Blocked {
        reason: &'static str,
        matched_entry: Option<String>,
    },
}

pub async fn load_platform_ip_policy(db: &PgPool) -> Result<PlatformIpPolicy, AppError> {
    Ok(PlatformIpPolicy {
        tenant_ip_policy_editable: get_system_bool(db, "tenant_ip_policy_editable", true).await?,
        default_allowlist: get_system_string(db, "default_ip_allowlist").await?,
        default_blocklist: get_system_string(db, "default_ip_blocklist").await?,
    })
}

pub async fn load_platform_admin_ip_policy(db: &PgPool) -> Result<PlatformAdminIpPolicy, AppError> {
    Ok(PlatformAdminIpPolicy {
        allowlist: get_system_string(db, "platform_admin_ip_allowlist").await?,
        blocklist: get_system_string(db, "platform_admin_ip_blocklist").await?,
    })
}

pub async fn save_platform_admin_ip_policy(
    db: &PgPool,
    policy: &PlatformAdminIpPolicy,
) -> Result<(), AppError> {
    let allowlist = normalize_policy_text(&policy.allowlist)?;
    let blocklist = normalize_policy_text(&policy.blocklist)?;

    // Saving empty allowlist+blocklist is allowed for the admin policy — it means "no restriction"
    // (open to all IPs). This is the default state. The distinction from tenant policy is intentional:
    // admins can choose to leave admin access unrestricted, but that must be an explicit choice
    // surfaced clearly in the UI.

    set_system_string(db, "platform_admin_ip_allowlist", &allowlist).await?;
    set_system_string(db, "platform_admin_ip_blocklist", &blocklist).await?;
    Ok(())
}

/// Resolves the effective IP policy for a given user.
/// Superusers use the dedicated platform admin IP policy — never tenant policy —
/// because their current_org_id varies as they browse different workspaces.
pub async fn resolve_effective_ip_policy_for_user(
    db: &PgPool,
    is_superuser: bool,
    org_id: Option<uuid::Uuid>,
) -> Result<EffectiveIpPolicy, AppError> {
    if is_superuser {
        let admin_policy = load_platform_admin_ip_policy(db).await?;
        return Ok(EffectiveIpPolicy {
            source: "platform_admin".into(),
            allowlist: admin_policy.allowlist,
            blocklist: admin_policy.blocklist,
        });
    }
    resolve_effective_ip_policy(db, org_id).await
}

pub async fn save_platform_ip_policy(
    db: &PgPool,
    policy: &PlatformIpPolicy,
) -> Result<(), AppError> {
    let allowlist = normalize_policy_text(&policy.default_allowlist)?;
    let blocklist = normalize_policy_text(&policy.default_blocklist)?;

    set_system_bool(
        db,
        "tenant_ip_policy_editable",
        policy.tenant_ip_policy_editable,
    )
    .await?;
    set_system_string(db, "default_ip_allowlist", &allowlist).await?;
    set_system_string(db, "default_ip_blocklist", &blocklist).await?;
    Ok(())
}

pub async fn load_tenant_ip_policy(db: &PgPool, org_id: Uuid) -> Result<TenantIpPolicy, AppError> {
    let row = sqlx::query(
        r#"
        SELECT use_custom_ip_policy, COALESCE(ip_allowlist, '') AS ip_allowlist, COALESCE(ip_blocklist, '') AS ip_blocklist
        FROM organizations
        WHERE id = $1
        "#
    )
    .bind(org_id)
    .fetch_optional(db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load tenant IP policy: {}", e)))?
    .ok_or_else(|| AppError::NotFound("Organization not found".into()))?;

    Ok(TenantIpPolicy {
        use_custom_ip_policy: row.get("use_custom_ip_policy"),
        allowlist: row.get("ip_allowlist"),
        blocklist: row.get("ip_blocklist"),
    })
}

pub async fn save_tenant_ip_policy(
    db: &PgPool,
    org_id: Uuid,
    policy: &TenantIpPolicy,
) -> Result<(), AppError> {
    let allowlist = normalize_policy_text(&policy.allowlist)?;
    let blocklist = normalize_policy_text(&policy.blocklist)?;

    // Guard: enabling a custom policy with empty allowlist AND empty blocklist is a misconfiguration —
    // it creates the appearance of a custom policy while actually allowing all IPs.
    if policy.use_custom_ip_policy && allowlist.is_empty() && blocklist.is_empty() {
        return Err(AppError::Validation(
            "Custom IP policy must have at least one allowlist or blocklist entry.".into(),
        ));
    }

    sqlx::query(
        r#"
        UPDATE organizations
        SET use_custom_ip_policy = $2,
            ip_allowlist = NULLIF($3, ''),
            ip_blocklist = NULLIF($4, ''),
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(org_id)
    .bind(policy.use_custom_ip_policy)
    .bind(allowlist)
    .bind(blocklist)
    .execute(db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to save tenant IP policy: {}", e)))?;

    Ok(())
}

pub async fn resolve_effective_ip_policy(
    db: &PgPool,
    org_id: Option<Uuid>,
) -> Result<EffectiveIpPolicy, AppError> {
    let platform = load_platform_ip_policy(db).await?;
    let tenant = match org_id {
        Some(org_id) => Some(load_tenant_ip_policy(db, org_id).await?),
        None => None,
    };

    Ok(effective_ip_policy(&platform, tenant.as_ref()))
}

pub async fn resolve_effective_ip_policy_for_redirect(
    db: &PgPool,
    redirect_uri: Option<&str>,
) -> Result<(Option<Uuid>, EffectiveIpPolicy), AppError> {
    let org_id = match parse_workspace_slug_from_redirect(redirect_uri) {
        Some(slug) => OrganizationRepository::new(db.clone())
            .get_organization_by_slug(&slug)
            .await?
            .map(|org| org.id),
        None => None,
    };

    let effective = resolve_effective_ip_policy(db, org_id).await?;
    Ok((org_id, effective))
}

pub fn effective_ip_policy(
    platform: &PlatformIpPolicy,
    tenant: Option<&TenantIpPolicy>,
) -> EffectiveIpPolicy {
    if platform.tenant_ip_policy_editable
        && tenant
            .map(|value| value.use_custom_ip_policy)
            .unwrap_or(false)
    {
        let tenant = tenant.expect("checked above");
        EffectiveIpPolicy {
            source: "tenant".into(),
            allowlist: tenant.allowlist.clone(),
            blocklist: tenant.blocklist.clone(),
        }
    } else {
        EffectiveIpPolicy {
            source: "platform".into(),
            allowlist: platform.default_allowlist.clone(),
            blocklist: platform.default_blocklist.clone(),
        }
    }
}

pub fn evaluate_ip_access(
    policy: &EffectiveIpPolicy,
    ip: Option<IpAddr>,
) -> Result<IpAccessDecision, AppError> {
    let allowlist = parse_policy_entries(&policy.allowlist)?;
    let blocklist = parse_policy_entries(&policy.blocklist)?;

    let Some(ip) = ip else {
        if !allowlist.is_empty() {
            return Ok(IpAccessDecision::Blocked {
                reason: "allowlist_requires_resolved_ip",
                matched_entry: None,
            });
        }
        return Ok(IpAccessDecision::Allowed);
    };

    if let Some(entry) = blocklist.iter().find(|entry| entry.contains(&ip)) {
        return Ok(IpAccessDecision::Blocked {
            reason: "blocklist_match",
            matched_entry: Some(entry.to_string()),
        });
    }

    if !allowlist.is_empty() && !allowlist.iter().any(|entry| entry.contains(&ip)) {
        return Ok(IpAccessDecision::Blocked {
            reason: "allowlist_miss",
            matched_entry: None,
        });
    }

    Ok(IpAccessDecision::Allowed)
}

pub fn access_denied_message(decision: &IpAccessDecision) -> &'static str {
    match decision {
        IpAccessDecision::Allowed => "Access allowed.",
        IpAccessDecision::Blocked { reason: "allowlist_requires_resolved_ip", .. } => {
            "Access is restricted to an allowlisted IP range, but your client IP could not be verified."
        }
        IpAccessDecision::Blocked { .. } => "Access from this IP address is blocked by policy.",
    }
}

fn normalize_policy_text(raw: &str) -> Result<String, AppError> {
    Ok(parse_policy_entries(raw)?
        .into_iter()
        .map(|entry| entry.to_string())
        .collect::<Vec<_>>()
        .join("\n"))
}

fn parse_policy_entries(raw: &str) -> Result<Vec<IpNet>, AppError> {
    split_policy_entries(raw).map(parse_policy_entry).collect()
}

fn parse_policy_entry(value: &str) -> Result<IpNet, AppError> {
    if let Ok(net) = value.parse::<IpNet>() {
        return Ok(net);
    }

    if let Ok(addr) = value.parse::<IpAddr>() {
        return Ok(IpNet::from(addr));
    }

    Err(AppError::Validation(format!(
        "Invalid IP or CIDR entry: {}",
        value
    )))
}

fn split_policy_entries(raw: &str) -> impl Iterator<Item = &str> {
    raw.split(|char| matches!(char, ',' | '\n' | '\r' | ';'))
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

async fn get_system_bool(db: &PgPool, key: &str, default: bool) -> Result<bool, AppError> {
    let value: Option<String> =
        sqlx::query_scalar("SELECT value FROM system_settings WHERE key = $1")
            .bind(key)
            .fetch_optional(db)
            .await
            .map_err(|e| {
                AppError::Internal(format!("Failed to load IP policy setting '{}': {}", key, e))
            })?;

    Ok(value
        .map(|raw| {
            matches!(
                raw.trim(),
                "1" | "true" | "TRUE" | "yes" | "YES" | "on" | "ON"
            )
        })
        .unwrap_or(default))
}

async fn set_system_bool(db: &PgPool, key: &str, value: bool) -> Result<(), AppError> {
    set_system_string(db, key, if value { "true" } else { "false" }).await
}

async fn get_system_string(db: &PgPool, key: &str) -> Result<String, AppError> {
    let value: Option<String> =
        sqlx::query_scalar("SELECT value FROM system_settings WHERE key = $1")
            .bind(key)
            .fetch_optional(db)
            .await
            .map_err(|e| {
                AppError::Internal(format!("Failed to load IP policy setting '{}': {}", key, e))
            })?;

    Ok(value.unwrap_or_default())
}

async fn set_system_string(db: &PgPool, key: &str, value: &str) -> Result<(), AppError> {
    sqlx::query(
        r#"
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        "#,
    )
    .bind(key)
    .bind(value)
    .execute(db)
    .await
    .map_err(|e| {
        AppError::Internal(format!("Failed to save IP policy setting '{}': {}", key, e))
    })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn policy(allowlist: &str, blocklist: &str) -> EffectiveIpPolicy {
        EffectiveIpPolicy {
            source: "platform".into(),
            allowlist: allowlist.into(),
            blocklist: blocklist.into(),
        }
    }

    #[test]
    fn allows_when_no_entries_match() {
        let decision =
            evaluate_ip_access(&policy("", ""), Some("198.51.100.12".parse().unwrap())).unwrap();
        assert_eq!(decision, IpAccessDecision::Allowed);
    }

    #[test]
    fn blocks_on_blocklist_match() {
        let decision = evaluate_ip_access(
            &policy("", "198.51.100.0/24"),
            Some("198.51.100.12".parse().unwrap()),
        )
        .unwrap();

        assert_eq!(
            decision,
            IpAccessDecision::Blocked {
                reason: "blocklist_match",
                matched_entry: Some("198.51.100.0/24".into()),
            }
        );
    }

    #[test]
    fn blocks_when_allowlist_misses() {
        let decision = evaluate_ip_access(
            &policy("203.0.113.0/24", ""),
            Some("198.51.100.12".parse().unwrap()),
        )
        .unwrap();

        assert_eq!(
            decision,
            IpAccessDecision::Blocked {
                reason: "allowlist_miss",
                matched_entry: None,
            }
        );
    }

    #[test]
    fn blocks_when_allowlist_exists_but_ip_missing() {
        let decision = evaluate_ip_access(&policy("203.0.113.0/24", ""), None).unwrap();

        assert_eq!(
            decision,
            IpAccessDecision::Blocked {
                reason: "allowlist_requires_resolved_ip",
                matched_entry: None,
            }
        );
    }

    #[test]
    fn normalizes_policy_text() {
        let normalized =
            normalize_policy_text("198.51.100.1, 203.0.113.0/24\n\n198.51.100.1").unwrap();
        assert_eq!(
            normalized,
            "198.51.100.1/32\n203.0.113.0/24\n198.51.100.1/32"
        );
    }
}
