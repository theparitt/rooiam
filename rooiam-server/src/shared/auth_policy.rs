use sqlx::PgPool;
use sqlx::Row;
use uuid::Uuid;

use crate::modules::organization::{models::Organization, repository::OrganizationRepository};
use crate::shared::auth_context::parse_workspace_slug_from_redirect;
use crate::shared::error::AppError;
use crate::shared::runtime_config::get_setting;

#[derive(Clone, Copy, Debug)]
pub enum AuthMethod {
    MagicLink,
    Google,
    Microsoft,
    Passkey,
}

impl AuthMethod {
    fn label(self) -> &'static str {
        match self {
            Self::MagicLink => "magic link",
            Self::Google => "Google",
            Self::Microsoft => "Microsoft",
            Self::Passkey => "passkey",
        }
    }
}

pub async fn get_workspace_policy_for_redirect(
    db: &PgPool,
    redirect_uri: Option<&str>,
) -> Result<Option<Organization>, AppError> {
    let normalized_redirect = redirect_uri
        .map(str::trim)
        .filter(|value| !value.is_empty());

    if let Some(redirect_uri) = normalized_redirect {
        let org_id = sqlx::query(
            r#"
            SELECT c.org_id
            FROM oauth_client_redirect_uris r
            JOIN oauth_clients c ON c.id = r.oauth_client_id
            WHERE r.redirect_uri = $1
            LIMIT 1
            "#,
        )
        .bind(redirect_uri)
        .fetch_optional(db)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Failed to resolve workspace policy for redirect URI: {}",
                e
            ))
        })?
        .map(|row| row.get::<Uuid, _>("org_id"));

        if let Some(org_id) = org_id {
            let org = OrganizationRepository::new(db.clone())
                .get_organization_by_id(org_id)
                .await?;
            if org.is_some() {
                return Ok(org);
            }
        }
    }

    let Some(workspace_slug) = parse_workspace_slug_from_redirect(normalized_redirect) else {
        return Ok(None);
    };

    OrganizationRepository::new(db.clone())
        .get_organization_by_slug(&workspace_slug)
        .await
}

pub async fn ensure_auth_method_allowed(
    db: &PgPool,
    redirect_uri: Option<&str>,
    method: AuthMethod,
) -> Result<Option<Organization>, AppError> {
    ensure_auth_method_allowed_for_org(
        get_workspace_policy_for_redirect(db, redirect_uri).await?,
        method,
    )
}

pub async fn ensure_auth_method_allowed_for_workspace_id(
    db: &PgPool,
    workspace_id: Option<Uuid>,
    redirect_uri: Option<&str>,
    method: AuthMethod,
) -> Result<Option<Organization>, AppError> {
    let org = if let Some(workspace_id) = workspace_id {
        OrganizationRepository::new(db.clone())
            .get_organization_by_id(workspace_id)
            .await?
    } else {
        get_workspace_policy_for_redirect(db, redirect_uri).await?
    };

    ensure_auth_method_allowed_for_org(org, method)
}

fn ensure_auth_method_allowed_for_org(
    org: Option<Organization>,
    method: AuthMethod,
) -> Result<Option<Organization>, AppError> {
    if let Some(org) = org.as_ref() {
        let allowed = match method {
            AuthMethod::MagicLink => org.allow_magic_link,
            AuthMethod::Google => org.allow_google,
            AuthMethod::Microsoft => org.allow_microsoft,
            AuthMethod::Passkey => org.allow_passkey,
        };

        if !allowed {
            return Err(AppError::Validation(format!(
                "{} sign-in is disabled for workspace '{}'.",
                method.label(),
                org.slug
            )));
        }
    }

    Ok(org)
}

/// Check that a user's email domain is allowed by the workspace's domain restriction policy.
/// Call this after the user is identified (post magic-link verify / post OAuth callback)
/// but before creating the session, passing the workspace org loaded from the redirect_uri.
pub fn ensure_email_domain_allowed(org: &Organization, email: &str) -> Result<(), AppError> {
    if org.allowed_email_domains.is_empty() {
        return Ok(());
    }
    // Reject malformed emails (multiple '@' is never valid per RFC 5321)
    let at_count = email.chars().filter(|&c| c == '@').count();
    if at_count != 1 {
        return Err(AppError::Forbidden(
            "This workspace only allows sign-in from approved email domains.".into(),
        ));
    }
    let domain = email.split('@').nth(1).unwrap_or("").to_lowercase();
    if domain.is_empty() {
        return Err(AppError::Forbidden(
            "This workspace only allows sign-in from approved email domains.".into(),
        ));
    }
    let allowed = org
        .allowed_email_domains
        .split(',')
        .any(|d| d.trim().eq_ignore_ascii_case(&domain));
    if !allowed {
        return Err(AppError::Forbidden(format!(
            "This workspace only allows sign-in from: {}",
            org.allowed_email_domains
        )));
    }
    Ok(())
}

/// Returns true if passkey sign-in is allowed on the admin console.
/// When false, passkey login must be blocked at the admin login page.
pub async fn admin_console_passkey_allowed(db: &PgPool) -> Result<bool, AppError> {
    Ok(get_setting(db, "admin_passkey_allowed")
        .await?
        .map(|v| v == "true")
        .unwrap_or(true)) // default true — allow passkeys unless explicitly disabled
}

/// Returns true if the platform admin console requires MFA.
/// Only applies when the user is logging into the admin console directly
/// (no workspace context, no org context).
pub async fn admin_console_requires_mfa(db: &PgPool, user_id: Uuid) -> Result<bool, AppError> {
    // Check the platform-level admin_require_mfa setting
    let require = get_setting(db, "admin_require_mfa")
        .await?
        .map(|v| v == "true")
        .unwrap_or(false);
    if !require {
        return Ok(false);
    }
    // Only enforce on actual platform admins / owners
    let is_admin: bool =
        sqlx::query_scalar("SELECT (is_superuser OR is_platform_owner) FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_optional(db)
            .await
            .map_err(|e| {
                AppError::Internal(format!("Failed to load platform admin MFA policy: {}", e))
            })?
            .unwrap_or(false);

    Ok(is_admin)
}
