//! Operator access policy hierarchy.
//!
//! Rooiam distinguishes two policy domains:
//!
//! **Operator domain** — people who operate Rooiam itself (platform admins, tenant owners,
//! workspace admins). Their login is governed by this module's hierarchical policy chain.
//! Each level sets policy for the level below. Child can only tighten, never loosen.
//!
//! **End-user domain** — tenant end users. Their login is configured freely by the tenant
//! (workspace owner / workspace admin). Rooiam has no say. Not governed here.
//!
//! ## Hierarchy
//!
//! ```text
//! Platform Owner  →  controls Platform Admin login      (platform_to_admin)
//! Platform Admin  →  controls Tenant Owner login        (admin_to_tenant)
//! Tenant Owner    →  controls Workspace Admin login     (tenant_to_workspace, Phase 2)
//! ```
//!
//! ## Inheritance rules
//! - **Auth methods + MFA**: inherited — child can only tighten, never loosen.
//! - **IP allowlist/blocklist**: NOT inherited — each level configures independently.
//!   Platform may lock to its internal network; tenants have no obligation to follow that.
//! - **Email domain allowlist/blocklist**: NOT inherited — per-level configuration.
//!
//! ## Phase 1 scope
//! - Auth method restrictions (magic link, Google, Microsoft, passkey)
//! - MFA requirement (policy + personal opt-in)
//! - IP allowlist / blocklist (per-level, independent)
//! - Email domain allowlist / blocklist (per-level, independent)

use std::net::IpAddr;

use sqlx::PgPool;
use uuid::Uuid;

use crate::shared::error::AppError;
use crate::shared::ip_policy::{
    access_denied_message, evaluate_ip_access, EffectiveIpPolicy, IpAccessDecision,
};

/// Which operator login surface is being evaluated.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OperatorLoginLevel {
    /// A platform admin (`is_superuser = true`) logging into the admin console.
    /// Governed by the `platform_to_admin` policy row.
    PlatformAdmin,
    /// A tenant owner/admin logging into the tenant portal.
    /// Governed by the `admin_to_tenant` policy row.
    TenantPortalAdmin,
}

/// A single operator policy row from the `operator_policies` table.
#[derive(Debug, Clone)]
pub struct OperatorPolicy {
    pub id: Uuid,
    pub level: String,
    pub organization_id: Option<Uuid>,
    pub allow_magic_link: bool,
    pub allow_google: bool,
    pub allow_microsoft: bool,
    pub allow_passkey: bool,
    pub require_mfa: bool,
    pub ip_allowlist: String,
    pub ip_blocklist: String,
    pub allowed_email_domains: String,
    pub blocked_email_domains: String,
}

/// The resolved effective policy applied at login time.
/// Computed from the DB policy row, then folded with the user's personal MFA status.
#[derive(Debug, Clone)]
pub struct EffectiveOperatorPolicy {
    pub allow_magic_link: bool,
    pub allow_google: bool,
    pub allow_microsoft: bool,
    pub allow_passkey: bool,
    /// True if policy requires MFA OR user has personally enrolled TOTP.
    pub require_mfa: bool,
    pub ip_allowlist: String,
    pub ip_blocklist: String,
    pub allowed_email_domains: String,
    pub blocked_email_domains: String,
}

impl Default for EffectiveOperatorPolicy {
    fn default() -> Self {
        Self {
            allow_magic_link: true,
            allow_google: true,
            allow_microsoft: true,
            allow_passkey: true,
            require_mfa: false,
            ip_allowlist: String::new(),
            ip_blocklist: String::new(),
            allowed_email_domains: String::new(),
            blocked_email_domains: String::new(),
        }
    }
}

/// Loads the operator policy row for a given level.
/// Returns `None` if the row doesn't exist (treat as maximally permissive).
pub async fn load_operator_policy(
    db: &PgPool,
    level: &str,
    org_id: Option<Uuid>,
) -> Result<Option<OperatorPolicy>, AppError> {
    // Use a single query with IS NOT DISTINCT FROM to handle both NULL and non-NULL org_id.
    let row = sqlx::query_as!(
        OperatorPolicy,
        r#"
        SELECT id, level::TEXT AS "level!", organization_id,
               allow_magic_link, allow_google, allow_microsoft, allow_passkey,
               require_mfa, ip_allowlist, ip_blocklist,
               allowed_email_domains, blocked_email_domains
        FROM operator_policies
        WHERE level::TEXT = $1
          AND organization_id IS NOT DISTINCT FROM $2
        "#,
        level,
        org_id,
    )
    .fetch_optional(db)
    .await
    .map_err(|e| {
        AppError::Internal(format!("Failed to load operator policy '{}': {}", level, e))
    })?;

    Ok(row)
}

/// Saves (upserts) an operator policy row.
/// Uses non-macro sqlx::query to avoid PG enum type mapping issues with operator_policy_level.
pub async fn save_operator_policy(
    db: &PgPool,
    level: &str,
    org_id: Option<Uuid>,
    policy: &OperatorPolicy,
) -> Result<(), AppError> {
    if let Some(org_id) = org_id {
        sqlx::query(
            r#"
            INSERT INTO operator_policies
                (level, organization_id, allow_magic_link, allow_google, allow_microsoft, allow_passkey,
                 require_mfa, ip_allowlist, ip_blocklist, allowed_email_domains, blocked_email_domains, updated_at)
            VALUES ($1::operator_policy_level, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
            ON CONFLICT (level, organization_id) WHERE organization_id IS NOT NULL
            DO UPDATE SET
                allow_magic_link = EXCLUDED.allow_magic_link,
                allow_google = EXCLUDED.allow_google,
                allow_microsoft = EXCLUDED.allow_microsoft,
                allow_passkey = EXCLUDED.allow_passkey,
                require_mfa = EXCLUDED.require_mfa,
                ip_allowlist = EXCLUDED.ip_allowlist,
                ip_blocklist = EXCLUDED.ip_blocklist,
                allowed_email_domains = EXCLUDED.allowed_email_domains,
                blocked_email_domains = EXCLUDED.blocked_email_domains,
                updated_at = NOW()
            "#
        )
        .bind(level)
        .bind(org_id)
        .bind(policy.allow_magic_link)
        .bind(policy.allow_google)
        .bind(policy.allow_microsoft)
        .bind(policy.allow_passkey)
        .bind(policy.require_mfa)
        .bind(&policy.ip_allowlist)
        .bind(&policy.ip_blocklist)
        .bind(&policy.allowed_email_domains)
        .bind(&policy.blocked_email_domains)
        .execute(db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to save organization-scoped operator policy '{}': {}", level, e)))?;
    } else {
        sqlx::query(
            r#"
            INSERT INTO operator_policies
                (level, organization_id, allow_magic_link, allow_google, allow_microsoft, allow_passkey,
                 require_mfa, ip_allowlist, ip_blocklist, allowed_email_domains, blocked_email_domains, updated_at)
            VALUES ($1::operator_policy_level, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
            ON CONFLICT (level) WHERE organization_id IS NULL
            DO UPDATE SET
                allow_magic_link = EXCLUDED.allow_magic_link,
                allow_google = EXCLUDED.allow_google,
                allow_microsoft = EXCLUDED.allow_microsoft,
                allow_passkey = EXCLUDED.allow_passkey,
                require_mfa = EXCLUDED.require_mfa,
                ip_allowlist = EXCLUDED.ip_allowlist,
                ip_blocklist = EXCLUDED.ip_blocklist,
                allowed_email_domains = EXCLUDED.allowed_email_domains,
                blocked_email_domains = EXCLUDED.blocked_email_domains,
                updated_at = NOW()
            "#
        )
        .bind(level)
        .bind(policy.allow_magic_link)
        .bind(policy.allow_google)
        .bind(policy.allow_microsoft)
        .bind(policy.allow_passkey)
        .bind(policy.require_mfa)
        .bind(&policy.ip_allowlist)
        .bind(&policy.ip_blocklist)
        .bind(&policy.allowed_email_domains)
        .bind(&policy.blocked_email_domains)
        .execute(db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to save platform-scoped operator policy '{}': {}", level, e)))?;
    }
    Ok(())
}

/// Determines which operator login level applies to a user logging in.
/// Returns `None` if this is an end-user login (not governed by operator policy).
pub async fn resolve_operator_login_level(
    db: &PgPool,
    user_id: Uuid,
    current_org_id: Option<Uuid>,
) -> Result<Option<OperatorLoginLevel>, AppError> {
    let row = sqlx::query!(
        "SELECT is_superuser, is_platform_owner FROM users WHERE id = $1",
        user_id
    )
    .fetch_optional(db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to resolve operator login level: {}", e)))?;

    let Some(row) = row else {
        return Ok(None);
    };

    // Platform owner and platform admins (superusers) → PlatformAdmin level
    if row.is_platform_owner || row.is_superuser {
        return Ok(Some(OperatorLoginLevel::PlatformAdmin));
    }

    // If logging into tenant portal (has org context), check if user is org owner/admin
    if let Some(org_id) = current_org_id {
        let is_org_operator: bool = sqlx::query_scalar!(
            r#"
            SELECT EXISTS (
                SELECT 1 FROM organization_members om
                JOIN member_roles mr ON mr.member_id = om.id
                JOIN roles r ON r.id = mr.role_id
                WHERE om.organization_id = $1
                  AND om.user_id = $2
                  AND om.status = 'active'
                  AND r.code IN ('owner', 'admin')
            ) AS "exists!"
            "#,
            org_id,
            user_id,
        )
        .fetch_one(db)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Failed to check workspace operator membership: {}",
                e
            ))
        })?;

        if is_org_operator {
            return Ok(Some(OperatorLoginLevel::TenantPortalAdmin));
        }
    }

    Ok(None)
}

/// Computes the effective operator policy for a given login level and user.
/// Folds in personal MFA opt-in (user enrolled TOTP → require_mfa = true regardless of policy).
pub async fn compute_effective_operator_policy(
    db: &PgPool,
    level: OperatorLoginLevel,
    org_id: Option<Uuid>,
    user_id: Uuid,
) -> Result<EffectiveOperatorPolicy, AppError> {
    let db_level = match level {
        OperatorLoginLevel::PlatformAdmin => "platform_to_admin",
        OperatorLoginLevel::TenantPortalAdmin => "admin_to_tenant",
    };

    let policy = load_operator_policy(db, db_level, None).await?;
    let mut effective = match policy {
        Some(p) => EffectiveOperatorPolicy {
            allow_magic_link: p.allow_magic_link,
            allow_google: p.allow_google,
            allow_microsoft: p.allow_microsoft,
            allow_passkey: p.allow_passkey,
            require_mfa: p.require_mfa,
            ip_allowlist: p.ip_allowlist,
            ip_blocklist: p.ip_blocklist,
            allowed_email_domains: p.allowed_email_domains,
            blocked_email_domains: p.blocked_email_domains,
        },
        None => EffectiveOperatorPolicy::default(),
    };

    // Fold in personal MFA opt-in:
    // if user has personally enrolled TOTP, they must always complete MFA regardless of policy
    let totp_enrolled: bool = sqlx::query_scalar!(
        r#"
        SELECT EXISTS (
            SELECT 1 FROM user_mfa_methods
            WHERE user_id = $1 AND method_type = 'totp' AND verified_at IS NOT NULL
        ) AS "exists!"
        "#,
        user_id,
    )
    .fetch_one(db)
    .await
    .map_err(|e| {
        AppError::Internal(format!(
            "Failed to load personal MFA enrollment state: {}",
            e
        ))
    })?;

    effective.require_mfa = effective.require_mfa || totp_enrolled;

    // Note: IP and email domain are NOT inherited across levels — each level configures
    // independently. The per-org override (Phase 2) only applies auth method + MFA merging.
    // IP and email domain from `org_id` override row replaces the global row entirely.
    if let Some(org_id) = org_id {
        if let Some(org_policy) = load_operator_policy(db, db_level, Some(org_id)).await? {
            // Auth methods + MFA: inherit strictness (AND for allow, OR for require)
            effective.allow_magic_link = effective.allow_magic_link && org_policy.allow_magic_link;
            effective.allow_google = effective.allow_google && org_policy.allow_google;
            effective.allow_microsoft = effective.allow_microsoft && org_policy.allow_microsoft;
            effective.allow_passkey = effective.allow_passkey && org_policy.allow_passkey;
            effective.require_mfa = effective.require_mfa || org_policy.require_mfa;
            // IP and email: per-level override replaces global (not inherited)
            effective.ip_allowlist = org_policy.ip_allowlist;
            effective.ip_blocklist = org_policy.ip_blocklist;
            effective.allowed_email_domains = org_policy.allowed_email_domains;
            effective.blocked_email_domains = org_policy.blocked_email_domains;
        }
    }

    Ok(effective)
}

/// Enforces operator login policy for auth method, IP, and email domain.
/// Call this after the user is identified but before session creation.
/// MFA enforcement is handled separately by the caller via `effective.require_mfa`.
///
/// Returns the effective policy so the caller can use `require_mfa`.
pub async fn enforce_operator_login_policy(
    db: &PgPool,
    user_id: Uuid,
    email: &str,
    method: AuthMethod,
    current_org_id: Option<Uuid>,
    client_ip: Option<IpAddr>,
) -> Result<Option<EffectiveOperatorPolicy>, AppError> {
    let Some(level) = resolve_operator_login_level(db, user_id, current_org_id).await? else {
        return Ok(None); // End-user login — not governed by operator policy
    };

    let effective = compute_effective_operator_policy(db, level, current_org_id, user_id).await?;

    // 1. Auth method check
    let method_allowed = match method {
        AuthMethod::MagicLink => effective.allow_magic_link,
        AuthMethod::Google => effective.allow_google,
        AuthMethod::Microsoft => effective.allow_microsoft,
        AuthMethod::Passkey => effective.allow_passkey,
    };
    if !method_allowed {
        return Err(AppError::Forbidden(format!(
            "{} sign-in is not permitted by your organisation's access policy.",
            method.label()
        )));
    }

    // 2. IP check
    let ip_policy = EffectiveIpPolicy {
        source: "operator_policy".into(),
        allowlist: effective.ip_allowlist.clone(),
        blocklist: effective.ip_blocklist.clone(),
    };
    let decision = evaluate_ip_access(&ip_policy, client_ip)?;
    if decision != IpAccessDecision::Allowed {
        return Err(AppError::Forbidden(access_denied_message(&decision).into()));
    }

    // 3. Email domain checks
    ensure_operator_email_domain_allowed(email, &effective)?;

    Ok(Some(effective))
}

fn ensure_operator_email_domain_allowed(
    email: &str,
    effective: &EffectiveOperatorPolicy,
) -> Result<(), AppError> {
    let domain = extract_email_domain(email)?;

    // Blocked domains (union — any match blocks)
    if !effective.blocked_email_domains.is_empty() {
        let blocked = effective
            .blocked_email_domains
            .split(',')
            .map(str::trim)
            .filter(|d| !d.is_empty());
        for blocked_domain in blocked {
            if domain.eq_ignore_ascii_case(blocked_domain) {
                return Err(AppError::Forbidden(
                    "Sign-in from this email domain is blocked by access policy.".into(),
                ));
            }
        }
    }

    // Allowed domains (non-empty = restrictive allowlist)
    if !effective.allowed_email_domains.is_empty() {
        let allowed = effective
            .allowed_email_domains
            .split(',')
            .map(str::trim)
            .filter(|d| !d.is_empty());
        let domain_allowed = allowed.into_iter().any(|d| domain.eq_ignore_ascii_case(d));
        if !domain_allowed {
            return Err(AppError::Forbidden(format!(
                "Sign-in is restricted to approved email domains: {}",
                effective.allowed_email_domains
            )));
        }
    }

    Ok(())
}

fn extract_email_domain(email: &str) -> Result<String, AppError> {
    let parts: Vec<&str> = email.split('@').collect();
    if parts.len() != 2 || parts[1].is_empty() {
        return Err(AppError::Forbidden("Invalid email address.".into()));
    }
    Ok(parts[1].to_lowercase())
}

/// Auth method enum mirrored from auth_policy for use in operator policy enforcement.
#[derive(Debug, Clone, Copy)]
pub enum AuthMethod {
    MagicLink,
    Google,
    Microsoft,
    Passkey,
}

impl AuthMethod {
    pub fn label(self) -> &'static str {
        match self {
            Self::MagicLink => "Magic link",
            Self::Google => "Google",
            Self::Microsoft => "Microsoft",
            Self::Passkey => "Passkey",
        }
    }
}

/// Validates that a proposed policy update does not loosen relative to the parent level.
/// Returns an error describing what cannot be relaxed.
pub fn validate_policy_not_looser_than_parent(
    parent: &OperatorPolicy,
    proposed: &OperatorPolicyUpdate,
) -> Result<(), AppError> {
    if let Some(false) = proposed.allow_magic_link {
        // tightening — ok
    } else if proposed.allow_magic_link == Some(true) && !parent.allow_magic_link {
        return Err(AppError::Validation(
            "Cannot enable magic link: parent policy has it disabled.".into(),
        ));
    }
    if proposed.allow_google == Some(true) && !parent.allow_google {
        return Err(AppError::Validation(
            "Cannot enable Google login: parent policy has it disabled.".into(),
        ));
    }
    if proposed.allow_microsoft == Some(true) && !parent.allow_microsoft {
        return Err(AppError::Validation(
            "Cannot enable Microsoft login: parent policy has it disabled.".into(),
        ));
    }
    if proposed.allow_passkey == Some(true) && !parent.allow_passkey {
        return Err(AppError::Validation(
            "Cannot enable passkey login: parent policy has it disabled.".into(),
        ));
    }
    if proposed.require_mfa == Some(false) && parent.require_mfa {
        return Err(AppError::Validation(
            "Cannot disable MFA requirement: parent policy requires MFA.".into(),
        ));
    }
    Ok(())
}

/// Partial update fields for an operator policy (all optional — PATCH semantics).
#[derive(Debug, serde::Deserialize)]
pub struct OperatorPolicyUpdate {
    pub allow_magic_link: Option<bool>,
    pub allow_google: Option<bool>,
    pub allow_microsoft: Option<bool>,
    pub allow_passkey: Option<bool>,
    pub require_mfa: Option<bool>,
    pub ip_allowlist: Option<String>,
    pub ip_blocklist: Option<String>,
    pub allowed_email_domains: Option<String>,
    pub blocked_email_domains: Option<String>,
}

impl OperatorPolicyUpdate {
    /// Apply this patch to an existing policy row, returning the merged result.
    pub fn apply_to(&self, base: OperatorPolicy) -> OperatorPolicy {
        OperatorPolicy {
            allow_magic_link: self.allow_magic_link.unwrap_or(base.allow_magic_link),
            allow_google: self.allow_google.unwrap_or(base.allow_google),
            allow_microsoft: self.allow_microsoft.unwrap_or(base.allow_microsoft),
            allow_passkey: self.allow_passkey.unwrap_or(base.allow_passkey),
            require_mfa: self.require_mfa.unwrap_or(base.require_mfa),
            ip_allowlist: self.ip_allowlist.clone().unwrap_or(base.ip_allowlist),
            ip_blocklist: self.ip_blocklist.clone().unwrap_or(base.ip_blocklist),
            allowed_email_domains: self
                .allowed_email_domains
                .clone()
                .unwrap_or(base.allowed_email_domains),
            blocked_email_domains: self
                .blocked_email_domains
                .clone()
                .unwrap_or(base.blocked_email_domains),
            ..base
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_policy(overrides: impl FnOnce(&mut OperatorPolicy)) -> OperatorPolicy {
        let mut p = OperatorPolicy {
            id: Uuid::new_v4(),
            level: "platform_to_admin".into(),
            organization_id: None,
            allow_magic_link: true,
            allow_google: true,
            allow_microsoft: true,
            allow_passkey: true,
            require_mfa: false,
            ip_allowlist: String::new(),
            ip_blocklist: String::new(),
            allowed_email_domains: String::new(),
            blocked_email_domains: String::new(),
        };
        overrides(&mut p);
        p
    }

    fn update(overrides: impl FnOnce(&mut OperatorPolicyUpdate)) -> OperatorPolicyUpdate {
        let mut u = OperatorPolicyUpdate {
            allow_magic_link: None,
            allow_google: None,
            allow_microsoft: None,
            allow_passkey: None,
            require_mfa: None,
            ip_allowlist: None,
            ip_blocklist: None,
            allowed_email_domains: None,
            blocked_email_domains: None,
        };
        overrides(&mut u);
        u
    }

    // ── validate_policy_not_looser_than_parent ────────────────────────────

    #[test]
    fn allows_tightening_auth_methods() {
        let parent = base_policy(|_| {});
        // child wants to disable Google — this is tightening, must be allowed
        let proposed = update(|u| u.allow_google = Some(false));
        assert!(validate_policy_not_looser_than_parent(&parent, &proposed).is_ok());
    }

    #[test]
    fn blocks_enabling_google_when_parent_disabled() {
        let parent = base_policy(|p| p.allow_google = false);
        let proposed = update(|u| u.allow_google = Some(true));
        let err = validate_policy_not_looser_than_parent(&parent, &proposed);
        assert!(
            err.is_err(),
            "Should reject loosening Google when parent disabled it"
        );
    }

    #[test]
    fn blocks_enabling_microsoft_when_parent_disabled() {
        let parent = base_policy(|p| p.allow_microsoft = false);
        let proposed = update(|u| u.allow_microsoft = Some(true));
        assert!(validate_policy_not_looser_than_parent(&parent, &proposed).is_err());
    }

    #[test]
    fn blocks_enabling_passkey_when_parent_disabled() {
        let parent = base_policy(|p| p.allow_passkey = false);
        let proposed = update(|u| u.allow_passkey = Some(true));
        assert!(validate_policy_not_looser_than_parent(&parent, &proposed).is_err());
    }

    #[test]
    fn blocks_enabling_magic_link_when_parent_disabled() {
        let parent = base_policy(|p| p.allow_magic_link = false);
        let proposed = update(|u| u.allow_magic_link = Some(true));
        assert!(validate_policy_not_looser_than_parent(&parent, &proposed).is_err());
    }

    #[test]
    fn blocks_disabling_mfa_when_parent_requires_it() {
        let parent = base_policy(|p| p.require_mfa = true);
        let proposed = update(|u| u.require_mfa = Some(false));
        assert!(validate_policy_not_looser_than_parent(&parent, &proposed).is_err());
    }

    #[test]
    fn allows_enabling_mfa_when_parent_does_not_require() {
        let parent = base_policy(|_| {});
        let proposed = update(|u| u.require_mfa = Some(true));
        assert!(validate_policy_not_looser_than_parent(&parent, &proposed).is_ok());
    }

    #[test]
    fn allows_all_nones_unchanged() {
        let parent = base_policy(|_| {});
        let proposed = update(|_| {});
        assert!(validate_policy_not_looser_than_parent(&parent, &proposed).is_ok());
    }

    // ── ensure_operator_email_domain_allowed ─────────────────────────────

    #[test]
    fn blocks_email_on_blocked_domain() {
        let effective = EffectiveOperatorPolicy {
            blocked_email_domains: "gmail.com, yahoo.com".into(),
            ..Default::default()
        };
        let result = ensure_operator_email_domain_allowed("user@gmail.com", &effective);
        assert!(result.is_err());
    }

    #[test]
    fn allows_email_not_on_blocked_domain() {
        let effective = EffectiveOperatorPolicy {
            blocked_email_domains: "gmail.com".into(),
            ..Default::default()
        };
        assert!(ensure_operator_email_domain_allowed("user@company.com", &effective).is_ok());
    }

    #[test]
    fn blocks_email_not_in_allowlist() {
        let effective = EffectiveOperatorPolicy {
            allowed_email_domains: "company.com".into(),
            ..Default::default()
        };
        assert!(ensure_operator_email_domain_allowed("user@other.com", &effective).is_err());
    }

    #[test]
    fn allows_email_in_allowlist() {
        let effective = EffectiveOperatorPolicy {
            allowed_email_domains: "company.com, corp.io".into(),
            ..Default::default()
        };
        assert!(ensure_operator_email_domain_allowed("admin@corp.io", &effective).is_ok());
    }

    #[test]
    fn email_domain_check_is_case_insensitive() {
        let effective = EffectiveOperatorPolicy {
            blocked_email_domains: "Gmail.COM".into(),
            ..Default::default()
        };
        assert!(ensure_operator_email_domain_allowed("user@GMAIL.com", &effective).is_err());
    }

    #[test]
    fn empty_policy_allows_any_email() {
        let effective = EffectiveOperatorPolicy::default();
        assert!(ensure_operator_email_domain_allowed("anyone@anywhere.net", &effective).is_ok());
    }

    // ── apply_to (OperatorPolicyUpdate) ──────────────────────────────────

    #[test]
    fn apply_to_patches_only_specified_fields() {
        let base = base_policy(|_| {});
        let patch = update(|u| {
            u.allow_google = Some(false);
            u.require_mfa = Some(true);
        });
        let result = patch.apply_to(base);
        assert!(!result.allow_google);
        assert!(result.require_mfa);
        assert!(result.allow_microsoft); // untouched
        assert!(result.allow_magic_link); // untouched
    }
}
