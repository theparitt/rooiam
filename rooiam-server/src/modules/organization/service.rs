use super::models::Organization;
use super::repository::OrganizationRepository;
use crate::infra::email::send_action_email;
use crate::modules::identity::repository::IdentityRepository;
use crate::shared::error::AppError;
use crate::shared::runtime_config::effective_app_url;
use crate::shared::workspace_governance::load_platform_workspace_governance;
use sqlx::PgPool;
use uuid::Uuid;

pub struct OrganizationService {
    repo: OrganizationRepository,
    db: PgPool,
}

impl OrganizationService {
    pub fn new(repo: OrganizationRepository, db: PgPool) -> Self {
        Self { repo, db }
    }

    pub async fn create_tenant(
        &self,
        owner_user_id: Uuid,
        name: &str,
        slug: &str,
    ) -> Result<Organization, AppError> {
        let governance = load_platform_workspace_governance(&self.db).await?;
        let workspace_limit = governance.effective_max_workspaces();
        let existing = self.repo.count_user_organizations(owner_user_id).await?;
        if existing >= i64::from(workspace_limit) {
            return Err(AppError::Validation(format!(
                "Workspace limit reached. This account can create up to {} workspaces.",
                workspace_limit
            )));
        }

        let clean_slug = slug.trim().to_lowercase();

        // Reserved slugs — these are top-level path segments used by the rooiam-app
        // router and the Rooiam server itself.  If a workspace were allowed to take
        // one of these slugs, its portal URL (e.g. /tenant/overview) would silently
        // shadow the real route, breaking navigation for every user of that account.
        //
        // When to update this list:
        //   • You add a new top-level route to rooiam-app's App.tsx  → add the
        //     :context value here.
        //   • You add a new server-side path prefix under /v1/ that could collide
        //     with the SPA's catch-all (depends on deployment topology) → add it.
        //   • You remove a route permanently → you MAY remove the slug, but keeping
        //     it reserved avoids confusion if old links still circulate.
        //
        // Keep this list in sync with:
        //   • rooiam-app/src/pages/AppHome.tsx  (RESERVED_SLUGS constant)
        //   • docs/internal/23_reserved_slugs.md
        const RESERVED_SLUGS: &[&str] = &[
            // rooiam-app SPA routing keywords (:context path segment)
            "tenant", // /tenant/:section  — tenant-scoped views (workspaces, audit logs, access)
            "me",     // /me/:section      — user-scoped views (profile, my-access)
            "app",    // /app              — legacy redirect kept for old links
            // rooiam-app auth flow routes (top-level pages, no :context)
            "verify",  // /verify           — magic-link token verification page
            "success", // /success          — post-auth success / redirect landing page
            "oauth",   // /oauth/callback   — OAuth2 callback receiver
            // Server-side path prefixes that share the same origin as the SPA
            "api",    // reserved for future /api/* gateway prefix
            "admin",  // reserved — avoid colliding with any /admin/* paths
            "health", // /health           — server health-check endpoint
        ];
        if RESERVED_SLUGS.contains(&clean_slug.as_str()) {
            return Err(AppError::Validation(format!(
                "The slug '{}' is reserved and cannot be used for a workspace.",
                clean_slug
            )));
        }

        self.repo
            .create_organization(owner_user_id, name, &clean_slug)
            .await
    }

    pub async fn get_my_organizations(&self, user_id: Uuid) -> Result<Vec<Organization>, AppError> {
        self.repo.get_user_organizations(user_id).await
    }

    pub async fn get_organization_if_member(
        &self,
        organization_id: Uuid,
        user_id: Uuid,
    ) -> Result<Organization, AppError> {
        if !self.repo.is_member(organization_id, user_id).await? {
            return Err(AppError::Forbidden(
                "You are not a member of this organization".into(),
            ));
        }

        self.repo
            .get_organization_by_id(organization_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Organization not found".into()))
    }

    pub async fn switch_organization_context(
        &self,
        session_id: Uuid,
        user_id: Uuid,
        target_org_id: Uuid,
    ) -> Result<(), AppError> {
        if !self.repo.is_member(target_org_id, user_id).await? {
            return Err(AppError::Forbidden(
                "You are not a member of this organization".into(),
            ));
        }

        self.repo
            .update_session_org_context(session_id, target_org_id)
            .await
    }

    pub async fn get_organization_members(
        &self,
        organization_id: Uuid,
        current_user_id: Uuid,
    ) -> Result<Vec<crate::modules::organization::models::OrganizationMember>, AppError> {
        // Enforce visibility: Only members can see other members in the tenant.
        if !self
            .repo
            .is_member(organization_id, current_user_id)
            .await?
        {
            return Err(AppError::Forbidden(
                "You are not a member of this organization".into(),
            ));
        }

        self.repo.get_organization_members(organization_id).await
    }

    pub async fn get_organization_member_views(
        &self,
        organization_id: Uuid,
        current_user_id: Uuid,
    ) -> Result<Vec<crate::modules::organization::models::OrganizationMemberView>, AppError> {
        if !self
            .repo
            .is_member(organization_id, current_user_id)
            .await?
        {
            return Err(AppError::Forbidden(
                "You are not a member of this organization".into(),
            ));
        }

        self.repo
            .get_organization_member_views(organization_id)
            .await
    }

    pub async fn get_organization_activity(
        &self,
        organization_id: Uuid,
        current_user_id: Uuid,
        page: i64,
        page_size: i64,
        search: &str,
        action_filter: &str,
        date_from: Option<&str>,
        date_to: Option<&str>,
    ) -> Result<
        (
            Vec<crate::modules::organization::models::OrganizationActivityItem>,
            i64,
        ),
        AppError,
    > {
        if !self
            .repo
            .is_member(organization_id, current_user_id)
            .await?
        {
            return Err(AppError::Forbidden(
                "You are not a member of this organization".into(),
            ));
        }

        self.repo
            .get_organization_activity(
                organization_id,
                page,
                page_size,
                search,
                action_filter,
                date_from,
                date_to,
            )
            .await
    }

    pub async fn update_member_role(
        &self,
        organization_id: Uuid,
        current_user_id: Uuid,
        member_id: Uuid,
        role_code: &str,
    ) -> Result<(), AppError> {
        if !self
            .repo
            .is_member(organization_id, current_user_id)
            .await?
        {
            return Err(AppError::Forbidden(
                "You are not a member of this organization".into(),
            ));
        }

        let allowed_roles = ["admin", "member", "manager", "viewer"];
        if !allowed_roles.contains(&role_code) {
            return Err(AppError::Validation(
                "Only assignable workspace roles can be set from the tenant portal.".into(),
            ));
        }

        self.repo
            .update_member_role(organization_id, member_id, role_code)
            .await
    }

    pub async fn send_invite(
        &self,
        organization_id: Uuid,
        inviter_user_id: Uuid,
        email: &str,
    ) -> Result<String, AppError> {
        // Enforce permission:
        if !self
            .repo
            .is_member(organization_id, inviter_user_id)
            .await?
        {
            return Err(AppError::Forbidden(
                "You are not a member of this organization".into(),
            ));
        }

        use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
        use rand::RngCore;
        use sha2::{Digest, Sha256};

        let mut raw_bytes = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut raw_bytes);
        let raw_token = URL_SAFE_NO_PAD.encode(raw_bytes);

        // Security: hash the token
        let mut hasher = Sha256::new();
        hasher.update(&raw_token);
        let token_hash = hex::encode(hasher.finalize());

        let expires_at = chrono::Utc::now() + chrono::Duration::hours(48); // 48-hour invite window

        self.repo
            .create_invite(
                organization_id,
                email,
                &token_hash,
                inviter_user_id,
                expires_at,
            )
            .await?;
        tracing::info!("Invite created for org {}", organization_id);

        // Send invitation email
        let org = self
            .repo
            .get_organization_by_id(organization_id)
            .await
            .ok()
            .flatten();
        let org_name = org
            .as_ref()
            .map(|o| o.name.as_str())
            .unwrap_or("a workspace");
        let inviter_name = IdentityRepository::new(self.db.clone())
            .get_user_by_id(inviter_user_id)
            .await
            .ok()
            .and_then(|u| u.display_name)
            .map(|n| n.trim().to_string())
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| "Someone".to_string());
        let app_url = effective_app_url(&self.db).await?;
        let accept_url = format!(
            "{}/accept-invite?token={}",
            app_url.trim_end_matches('/'),
            raw_token
        );

        if let Err(err) = send_action_email(
            &self.db,
            email,
            &format!("You've been invited to join {}", org_name),
            &format!("You're invited to join {}", org_name),
            &format!("{} invited you to join {} on Rooiam. Click the button below to accept the invitation. This link expires in 48 hours.", inviter_name, org_name),
            "Accept Invitation",
            &accept_url,
        ).await {
            tracing::warn!("Invite email to {} failed (invite still created): {}", email, err);
        }

        Ok(raw_token)
    }

    pub async fn list_pending_invites(
        &self,
        organization_id: Uuid,
        viewer_user_id: Uuid,
    ) -> Result<Vec<super::models::OrganizationInviteSummary>, AppError> {
        if !self.repo.is_member(organization_id, viewer_user_id).await? {
            return Err(AppError::Forbidden(
                "You are not a member of this organization".into(),
            ));
        }

        self.repo.list_pending_invites(organization_id).await
    }

    pub async fn revoke_invite(
        &self,
        organization_id: Uuid,
        actor_user_id: Uuid,
        invite_id: Uuid,
    ) -> Result<super::models::OrganizationInvite, AppError> {
        if !self.repo.is_member(organization_id, actor_user_id).await? {
            return Err(AppError::Forbidden(
                "You are not a member of this organization".into(),
            ));
        }

        self.repo.revoke_invite(invite_id, organization_id).await
    }

    pub async fn update_branding(
        &self,
        organization_id: Uuid,
        user_id: Uuid,
        login_display_name: Option<String>,
        login_title: Option<String>,
        login_subtitle: Option<String>,
        icon_url: Option<String>,
        login_logo_url: Option<String>,
        brand_color: Option<String>,
        show_login_logo: Option<bool>,
        show_login_title: Option<bool>,
        show_login_subtitle: Option<bool>,
        show_powered_by: Option<bool>,
        widget_radius: Option<String>,
        widget_shadow: Option<String>,
        icon_container: Option<String>,
        login_logo_container: Option<String>,
        login_logo_size: Option<String>,
        card_radius: Option<String>,
        button_style: Option<String>,
        card_bg_style: Option<String>,
        card_bg_color2: Option<String>,
        card_border_width: Option<String>,
        card_border_color: Option<String>,
        login_method_order: Option<Vec<String>>,
    ) -> Result<Organization, AppError> {
        if !self.repo.is_member(organization_id, user_id).await? {
            return Err(AppError::Forbidden(
                "You are not a member of this organization".into(),
            ));
        }

        let radius = widget_radius
            .filter(|value| matches!(value.as_str(), "sharp" | "compact" | "rounded" | "pill"));
        let shadow =
            widget_shadow.filter(|value| matches!(value.as_str(), "none" | "soft" | "lifted"));
        let container =
            icon_container.filter(|value| matches!(value.as_str(), "circle" | "square" | "wide"));
        let login_container = login_logo_container
            .filter(|value| matches!(value.as_str(), "circle" | "square" | "wide"));
        let logo_size =
            login_logo_size.filter(|value| matches!(value.as_str(), "small" | "medium" | "large"));
        let card =
            card_radius.filter(|value| matches!(value.as_str(), "sharp" | "compact" | "rounded"));
        let btn_style = button_style.filter(|value| matches!(value.as_str(), "filled" | "outline"));
        let bg_style = card_bg_style.filter(|value| {
            matches!(
                value.as_str(),
                "auto" | "solid" | "gradient-lr" | "gradient-tb" | "gradient-tl" | "gradient-tr"
            )
        });
        let bg_color2 = card_bg_color2.filter(|v| !v.is_empty());
        let border_width =
            card_border_width.filter(|value| matches!(value.as_str(), "none" | "1px" | "2px"));
        let border_color = card_border_color.filter(|v| !v.is_empty());
        let order = login_method_order.map(|items| {
            let mut seen = std::collections::BTreeSet::new();
            let mut cleaned = Vec::new();
            for item in items {
                if matches!(
                    item.as_str(),
                    "magic_link" | "passkey" | "google" | "microsoft"
                ) && seen.insert(item.clone())
                {
                    cleaned.push(item);
                }
            }
            for default in ["magic_link", "passkey", "google", "microsoft"] {
                if seen.insert(default.to_string()) {
                    cleaned.push(default.to_string());
                }
            }
            cleaned
        });

        self.repo
            .update_organization_branding(
                organization_id,
                login_display_name,
                login_title,
                login_subtitle,
                icon_url,
                login_logo_url,
                brand_color,
                show_login_logo,
                show_login_title,
                show_login_subtitle,
                show_powered_by,
                radius,
                shadow,
                container,
                login_container,
                logo_size,
                card,
                btn_style,
                bg_style,
                bg_color2,
                border_width,
                border_color,
                order,
            )
            .await
    }

    pub async fn update_auth_policy(
        &self,
        organization_id: Uuid,
        user_id: Uuid,
        allow_magic_link: bool,
        allow_google: bool,
        allow_microsoft: bool,
        allow_passkey: bool,
        require_mfa: bool,
        require_mfa_for_admins: bool,
        tenant_portal_require_mfa: bool,
        allowed_email_domains: &str,
        max_session_age_hours: Option<i32>,
        max_concurrent_sessions: Option<i32>,
    ) -> Result<Organization, AppError> {
        if !self.repo.is_member(organization_id, user_id).await? {
            return Err(AppError::Forbidden(
                "You are not a member of this organization".into(),
            ));
        }

        // Normalize domains: lowercase, trim whitespace, remove empties
        let normalized_domains = allowed_email_domains
            .split(',')
            .map(|d| d.trim().to_lowercase())
            .filter(|d| !d.is_empty())
            .collect::<Vec<_>>()
            .join(",");

        self.repo
            .update_organization_auth_policy(
                organization_id,
                allow_magic_link,
                allow_google,
                allow_microsoft,
                allow_passkey,
                require_mfa,
                require_mfa_for_admins,
                tenant_portal_require_mfa,
                &normalized_domains,
                max_session_age_hours,
                max_concurrent_sessions,
            )
            .await
    }

    pub async fn update_client_policy(
        &self,
        organization_id: Uuid,
        user_id: Uuid,
        allow_client_management: bool,
        allow_web_clients: bool,
        allow_spa_clients: bool,
        allow_native_clients: bool,
    ) -> Result<Organization, AppError> {
        if !self.repo.is_member(organization_id, user_id).await? {
            return Err(AppError::Forbidden(
                "You are not a member of this organization".into(),
            ));
        }

        self.repo
            .update_organization_client_policy(
                organization_id,
                allow_client_management,
                allow_web_clients,
                allow_spa_clients,
                allow_native_clients,
            )
            .await
    }

    pub async fn update_ip_policy(
        &self,
        organization_id: Uuid,
        user_id: Uuid,
        use_custom_ip_policy: bool,
        ip_allowlist: &str,
        ip_blocklist: &str,
    ) -> Result<(), AppError> {
        if !self.repo.is_member(organization_id, user_id).await? {
            return Err(AppError::Forbidden(
                "You are not a member of this organization".into(),
            ));
        }

        self.repo
            .update_organization_ip_policy(
                organization_id,
                use_custom_ip_policy,
                ip_allowlist,
                ip_blocklist,
            )
            .await
    }

    pub async fn accept_invite(&self, user_id: Uuid, token: &str) -> Result<Uuid, AppError> {
        use sha2::{Digest, Sha256};

        let mut hasher = Sha256::new();
        hasher.update(token);
        let hash = hex::encode(hasher.finalize());

        let invite = self.repo.get_valid_invite(&hash).await?;

        // Security: verify the authenticated user's primary email matches the invite email.
        let identity_repo = IdentityRepository::new(self.db.clone());
        let user = identity_repo.get_user_by_id(user_id).await?;
        let user_email = user.email.ok_or_else(|| {
            AppError::Validation("Your account has no verified email address".into())
        })?;
        if !user_email.eq_ignore_ascii_case(&invite.email) {
            return Err(AppError::Forbidden(
                "This invitation was sent to a different email address".into(),
            ));
        }

        // Enforce domain restriction: if the workspace has allowed_email_domains set,
        // the invited email's domain must be in the list.
        let org = self
            .repo
            .get_organization_by_id(invite.organization_id)
            .await?
            .ok_or_else(|| AppError::NotFound("Workspace not found".into()))?;

        if !org.allowed_email_domains.is_empty() {
            let email_domain = user_email.split('@').nth(1).unwrap_or("").to_lowercase();
            let allowed = org
                .allowed_email_domains
                .split(',')
                .any(|d| d.trim().eq_ignore_ascii_case(&email_domain));
            if !allowed {
                return Err(AppError::Forbidden(format!(
                    "This workspace only allows email addresses from: {}",
                    org.allowed_email_domains
                )));
            }
        }

        self.repo
            .mark_invite_used(invite.id, user_id, invite.organization_id)
            .await?;

        Ok(invite.organization_id)
    }
}
