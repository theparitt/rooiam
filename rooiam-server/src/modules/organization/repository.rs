use super::models::{
    Organization, OrganizationActivityItem, OrganizationInvite, OrganizationMember,
    OrganizationMemberView,
};
use crate::shared::error::AppError;
use sqlx::{PgPool, Row};
use std::sync::OnceLock;
use std::time::Instant;
use uuid::Uuid;

const USER_ORGANIZATION_LIST_LIMIT: i64 = 100;
const ORGANIZATION_MEMBER_VIEW_LIMIT: i64 = 200;

#[derive(Clone)]
pub struct OrganizationRepository {
    pool: PgPool,
}

#[cfg(test)]
mod tenant_boundary_tests {
    use super::*;

    #[sqlx::test(migrations = "./migrations")]
    async fn role_update_cannot_change_owner_or_foreign_member(pool: PgPool) {
        let repo = OrganizationRepository::new(pool.clone());
        let first_owner: Uuid = sqlx::query_scalar("INSERT INTO users DEFAULT VALUES RETURNING id")
            .fetch_one(&pool).await.unwrap();
        let second_owner: Uuid = sqlx::query_scalar("INSERT INTO users DEFAULT VALUES RETURNING id")
            .fetch_one(&pool).await.unwrap();
        let first = repo.create_organization(first_owner, "First", "role-test-first").await.unwrap();
        let second = repo.create_organization(second_owner, "Second", "role-test-second").await.unwrap();
        let first_member: Uuid = sqlx::query_scalar("SELECT id FROM organization_members WHERE organization_id = $1 AND user_id = $2")
            .bind(first.id).bind(first_owner).fetch_one(&pool).await.unwrap();
        let second_member: Uuid = sqlx::query_scalar("SELECT id FROM organization_members WHERE organization_id = $1 AND user_id = $2")
            .bind(second.id).bind(second_owner).fetch_one(&pool).await.unwrap();

        assert!(repo.update_member_role(first.id, first_member, "admin").await.is_err());
        assert!(repo.update_member_role(first.id, second_member, "admin").await.is_err());
        assert!(repo.is_org_owner(first.id, first_owner).await.unwrap());
        assert!(repo.is_org_owner(second.id, second_owner).await.unwrap());
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn audit_search_keeps_workspace_scope(pool: PgPool) {
        let repo = OrganizationRepository::new(pool.clone());
        let first: Uuid = sqlx::query_scalar("INSERT INTO organizations (name, slug) VALUES ('First', 'audit-search-first') RETURNING id")
            .fetch_one(&pool).await.unwrap();
        let second: Uuid = sqlx::query_scalar("INSERT INTO organizations (name, slug) VALUES ('Second', 'audit-search-second') RETURNING id")
            .fetch_one(&pool).await.unwrap();
        for (org, target) in [(first, "shared-term-first"), (second, "shared-term-secret")] {
            sqlx::query("INSERT INTO audit_logs (organization_id, action, target_type, target_id) VALUES ($1, 'workspace.test', 'member', $2)")
                .bind(org).bind(target).execute(&pool).await.unwrap();
        }
        let (items, total) = repo.get_organization_activity(first, 1, 20, "shared-term", "all", None, None)
            .await.unwrap();
        assert_eq!(total, 1);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].target_id.as_deref(), Some("shared-term-first"));
        let (items, total) = repo.get_organization_activity(first, 1, 20, "secret", "all", None, None)
            .await.unwrap();
        assert_eq!(total, 0);
        assert!(items.is_empty());
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn member_directory_searches_beyond_first_200_and_keeps_workspace_scope(pool: PgPool) {
        let repo = OrganizationRepository::new(pool.clone());
        let org: Uuid = sqlx::query_scalar("INSERT INTO organizations (name, slug) VALUES ('Main', 'member-directory-main') RETURNING id")
            .fetch_one(&pool).await.unwrap();
        let foreign: Uuid = sqlx::query_scalar("INSERT INTO organizations (name, slug) VALUES ('Other', 'member-directory-other') RETURNING id")
            .fetch_one(&pool).await.unwrap();
        sqlx::query("WITH new_users AS (INSERT INTO users (display_name) SELECT 'Person ' || lpad(n::text, 3, '0') FROM generate_series(1, 205) n RETURNING id) INSERT INTO organization_members (organization_id, user_id) SELECT $1, id FROM new_users")
            .bind(org).execute(&pool).await.unwrap();
        let outsider: Uuid = sqlx::query_scalar("INSERT INTO users (display_name) VALUES ('Person 999') RETURNING id")
            .fetch_one(&pool).await.unwrap();
        sqlx::query("INSERT INTO organization_members (organization_id, user_id) VALUES ($1, $2)")
            .bind(foreign).bind(outsider).execute(&pool).await.unwrap();

        let (items, total) = repo.search_organization_member_views(org, "", "all", "all", "display_name", "asc", 3, 100).await.unwrap();
        assert_eq!(total, 205);
        assert_eq!(items.len(), 5);
        let (items, total) = repo.search_organization_member_views(org, "Person 205", "all", "all", "created_at", "desc", 1, 20).await.unwrap();
        assert_eq!(total, 1);
        assert_eq!(items[0].display_name.as_deref(), Some("Person 205"));
        let (items, total) = repo.search_organization_member_views(org, "Person 999", "all", "all", "created_at", "desc", 1, 20).await.unwrap();
        assert_eq!(total, 0);
        assert!(items.is_empty());
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn invitation_outcomes_are_single_use_and_keep_history(pool: PgPool) {
        let repo = OrganizationRepository::new(pool.clone());
        let inviter: Uuid = sqlx::query_scalar("INSERT INTO users DEFAULT VALUES RETURNING id")
            .fetch_one(&pool).await.unwrap();
        let invitee: Uuid = sqlx::query_scalar("INSERT INTO users DEFAULT VALUES RETURNING id")
            .fetch_one(&pool).await.unwrap();
        let org: Uuid = sqlx::query_scalar("INSERT INTO organizations (name, slug) VALUES ('Main', 'invite-history-main') RETURNING id")
            .fetch_one(&pool).await.unwrap();
        let foreign: Uuid = sqlx::query_scalar("INSERT INTO organizations (name, slug) VALUES ('Other', 'invite-history-other') RETURNING id")
            .fetch_one(&pool).await.unwrap();
        let first = repo.create_invite(org, "invitee@example.com", "hash-1", inviter, chrono::Utc::now() + chrono::Duration::hours(1)).await.unwrap();
        assert!(repo.revoke_invite(first.id, foreign).await.is_err());
        repo.mark_invite_used(first.id, invitee, org).await.unwrap();
        assert!(repo.mark_invite_used(first.id, invitee, org).await.is_err());
        let first_status: String = sqlx::query_scalar("SELECT status FROM organization_invites WHERE id = $1")
            .bind(first.id).fetch_one(&pool).await.unwrap();
        assert_eq!(first_status, "accepted");

        let second = repo.create_invite(org, "invitee@example.com", "hash-2", inviter, chrono::Utc::now() + chrono::Duration::hours(1)).await.unwrap();
        assert_ne!(first.id, second.id);
        repo.decline_invite(second.id, org).await.unwrap();
        assert!(repo.mark_invite_used(second.id, invitee, org).await.is_err());
        let third = repo.create_invite(org, "invitee@example.com", "hash-3", inviter, chrono::Utc::now() + chrono::Duration::hours(1)).await.unwrap();
        repo.revoke_invite(third.id, org).await.unwrap();
        let outcomes: Vec<String> = sqlx::query_scalar("SELECT status FROM organization_invites WHERE organization_id = $1 ORDER BY created_at, id")
            .bind(org).fetch_all(&pool).await.unwrap();
        assert_eq!(outcomes.len(), 3);
        assert!(outcomes.contains(&"accepted".to_string()));
        assert!(outcomes.contains(&"declined".to_string()));
        assert!(outcomes.contains(&"revoked".to_string()));
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn invitation_send_cooldown_is_scoped_to_recipient_and_workspace(pool: PgPool) {
        let repo = OrganizationRepository::new(pool.clone());
        let first: Uuid = sqlx::query_scalar("INSERT INTO organizations (name, slug) VALUES ('First', 'invite-limit-first') RETURNING id")
            .fetch_one(&pool).await.unwrap();
        let second: Uuid = sqlx::query_scalar("INSERT INTO organizations (name, slug) VALUES ('Second', 'invite-limit-second') RETURNING id")
            .fetch_one(&pool).await.unwrap();
        repo.reserve_invite_send(first, "member@example.com").await.unwrap();
        assert!(matches!(repo.reserve_invite_send(first, "member@example.com").await, Err(AppError::RateLimited)));
        repo.reserve_invite_send(first, "other@example.com").await.unwrap();
        repo.reserve_invite_send(second, "member@example.com").await.unwrap();
        let count: i32 = sqlx::query_scalar("SELECT sends FROM organization_invite_daily_limits WHERE organization_id = $1")
            .bind(first).fetch_one(&pool).await.unwrap();
        assert_eq!(count, 2);
        let existing_user: Uuid = sqlx::query_scalar("INSERT INTO users DEFAULT VALUES RETURNING id")
            .fetch_one(&pool).await.unwrap();
        sqlx::query("INSERT INTO user_emails (user_id, email, is_primary, is_verified) VALUES ($1, 'existing@example.com', true, true)")
            .bind(existing_user).execute(&pool).await.unwrap();
        sqlx::query("INSERT INTO organization_members (organization_id, user_id) VALUES ($1, $2)")
            .bind(first).bind(existing_user).execute(&pool).await.unwrap();
        assert!(matches!(repo.reserve_invite_send(first, "existing@example.com").await, Err(AppError::Conflict(_))));
        for n in 0..98 {
            repo.reserve_invite_send(first, &format!("recipient-{n}@example.com")).await.unwrap();
        }
        assert!(matches!(repo.reserve_invite_send(first, "over-limit@example.com").await, Err(AppError::RateLimited)));
        let count: i32 = sqlx::query_scalar("SELECT sends FROM organization_invite_daily_limits WHERE organization_id = $1")
            .bind(first).fetch_one(&pool).await.unwrap();
        assert_eq!(count, 100);
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn concurrent_accept_and_decline_have_one_terminal_outcome(pool: PgPool) {
        let repo = OrganizationRepository::new(pool.clone());
        let inviter: Uuid = sqlx::query_scalar("INSERT INTO users DEFAULT VALUES RETURNING id")
            .fetch_one(&pool).await.unwrap();
        let invitee: Uuid = sqlx::query_scalar("INSERT INTO users DEFAULT VALUES RETURNING id")
            .fetch_one(&pool).await.unwrap();
        let org: Uuid = sqlx::query_scalar("INSERT INTO organizations (name, slug) VALUES ('Race', 'invite-race') RETURNING id")
            .fetch_one(&pool).await.unwrap();
        let invite = repo.create_invite(org, "race@example.com", "race-hash", inviter, chrono::Utc::now() + chrono::Duration::hours(1)).await.unwrap();
        let (accepted, declined) = tokio::join!(
            repo.mark_invite_used(invite.id, invitee, org),
            repo.decline_invite(invite.id, org),
        );
        assert_ne!(accepted.is_ok(), declined.is_ok());
        let status: String = sqlx::query_scalar("SELECT status FROM organization_invites WHERE id = $1")
            .bind(invite.id).fetch_one(&pool).await.unwrap();
        assert!(status == "accepted" || status == "declined");
        let member_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM organization_members WHERE organization_id = $1 AND user_id = $2")
            .bind(org).bind(invitee).fetch_one(&pool).await.unwrap();
        assert_eq!(member_count, if status == "accepted" { 1 } else { 0 });
    }
}

impl OrganizationRepository {
    fn timing_logs_enabled() -> bool {
        static ENABLED: OnceLock<bool> = OnceLock::new();
        *ENABLED.get_or_init(|| {
            matches!(
                std::env::var("ROOIAM_TIMING_LOGS")
                    .unwrap_or_default()
                    .trim()
                    .to_ascii_lowercase()
                    .as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
    }

    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    pub async fn create_organization(
        &self,
        owner_user_id: Uuid,
        name: &str,
        slug: &str,
    ) -> Result<Organization, AppError> {
        let mut tx = self.pool.begin().await?;

        // 1. Create Organization
        let org = sqlx::query_as::<_, Organization>(
            r#"
            INSERT INTO organizations (name, slug)
            VALUES ($1, $2)
            RETURNING id, name, slug, login_display_name, login_title, login_subtitle, icon_url, login_logo_url, brand_color, show_login_logo, show_login_title, show_login_subtitle, show_powered_by, widget_radius, widget_shadow, icon_container, login_logo_container, login_logo_size, card_radius, button_style, card_bg_style, card_bg_color2, card_border_width, card_border_color, login_method_order, allow_magic_link, allow_google, allow_microsoft, allow_passkey, require_mfa, allow_client_management, allow_web_clients, allow_spa_clients, allow_native_clients, allowed_email_domains, max_session_age_hours, magic_link_expiry_minutes, oidc_access_token_ttl_minutes, refresh_token_ttl_days, idle_timeout_minutes, require_mfa_for_admins, tenant_portal_require_mfa, max_concurrent_sessions, magic_link_rate_limit_admin_override, magic_link_rate_window_admin_override, magic_link_rate_limit_staff_override, magic_link_rate_window_staff_override, status, platform_locked, created_at, updated_at
            "#
        )
        .bind(name)
        .bind(slug)
        .fetch_one(&mut *tx)
        .await
        .map_err(|e| {
            if e.to_string().contains("slug") {
                AppError::Validation("Organization slug already exists".into())
            } else {
                e.into()
            }
        })?;

        // 2. Add as Owner (member)
        let org_member_rec = sqlx::query(
            "INSERT INTO organization_members (organization_id, user_id) VALUES ($1, $2) RETURNING id"
        )
        .bind(org.id)
        .bind(owner_user_id)
        .fetch_one(&mut *tx)
        .await?;

        use sqlx::Row;
        let member_id: Uuid = org_member_rec.get("id");

        // 3. Administer the 'owner' role
        sqlx::query(
            "INSERT INTO member_roles (member_id, role_id) SELECT $1, id FROM roles WHERE code = 'owner' AND is_system = true LIMIT 1"
        )
        .bind(member_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(org)
    }

    pub async fn get_user_organizations(
        &self,
        user_id: Uuid,
    ) -> Result<Vec<Organization>, AppError> {
        let orgs = sqlx::query_as::<_, Organization>(
            r#"
            SELECT o.id, o.name, o.slug, o.login_display_name, o.login_title, o.login_subtitle, o.icon_url, o.login_logo_url, o.brand_color, o.show_login_logo, o.show_login_title, o.show_login_subtitle, o.show_powered_by, o.widget_radius, o.widget_shadow, o.icon_container, o.login_logo_container, o.login_logo_size, o.card_radius, o.button_style, o.card_bg_style, o.card_bg_color2, o.card_border_width, o.card_border_color, o.login_method_order, o.allow_magic_link, o.allow_google, o.allow_microsoft, o.allow_passkey, o.require_mfa, o.allow_client_management, o.allow_web_clients, o.allow_spa_clients, o.allow_native_clients, o.allowed_email_domains, o.max_session_age_hours, o.magic_link_expiry_minutes, o.oidc_access_token_ttl_minutes, o.refresh_token_ttl_days, o.idle_timeout_minutes, o.require_mfa_for_admins, o.tenant_portal_require_mfa, o.max_concurrent_sessions, o.magic_link_rate_limit_admin_override, o.magic_link_rate_window_admin_override, o.magic_link_rate_limit_staff_override, o.magic_link_rate_window_staff_override, o.status, o.platform_locked, o.created_at, o.updated_at
            FROM organizations o
            JOIN organization_members om ON o.id = om.organization_id
            WHERE om.user_id = $1 AND o.status = 'active'
            ORDER BY o.created_at DESC
            LIMIT $2
            "#
        )
        .bind(user_id)
        .bind(USER_ORGANIZATION_LIST_LIMIT)
        .fetch_all(&self.pool)
        .await?;

        Ok(orgs)
    }

    pub async fn count_user_organizations(&self, user_id: Uuid) -> Result<i64, AppError> {
        let count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*)
            FROM organization_members om
            JOIN organizations o ON o.id = om.organization_id
            WHERE om.user_id = $1 AND om.status = 'active' AND o.status = 'active'
            "#,
        )
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(count)
    }

    pub async fn has_any_org_owner_role(&self, user_id: Uuid) -> Result<bool, AppError> {
        let rec = sqlx::query(
            r#"
            SELECT 1
            FROM organization_members om
            JOIN member_roles mr ON mr.member_id = om.id
            JOIN roles r ON r.id = mr.role_id
            JOIN organizations o ON o.id = om.organization_id
            WHERE om.user_id = $1
              AND om.status = 'active'
              AND o.status = 'active'
              AND r.code = 'owner'
            LIMIT 1
            "#,
        )
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(rec.is_some())
    }

    pub async fn get_organization_by_id(
        &self,
        organization_id: Uuid,
    ) -> Result<Option<Organization>, AppError> {
        let org = sqlx::query_as::<_, Organization>(
            r#"
            SELECT id, name, slug, login_display_name, login_title, login_subtitle, icon_url, login_logo_url, brand_color, show_login_logo, show_login_title, show_login_subtitle, show_powered_by, widget_radius, widget_shadow, icon_container, login_logo_container, login_logo_size, card_radius, button_style, card_bg_style, card_bg_color2, card_border_width, card_border_color, login_method_order, allow_magic_link, allow_google, allow_microsoft, allow_passkey, require_mfa, allow_client_management, allow_web_clients, allow_spa_clients, allow_native_clients, allowed_email_domains, max_session_age_hours, magic_link_expiry_minutes, oidc_access_token_ttl_minutes, refresh_token_ttl_days, idle_timeout_minutes, require_mfa_for_admins, tenant_portal_require_mfa, max_concurrent_sessions, magic_link_rate_limit_admin_override, magic_link_rate_window_admin_override, magic_link_rate_limit_staff_override, magic_link_rate_window_staff_override, status, platform_locked, created_at, updated_at
            FROM organizations
            WHERE id = $1
            "#
        )
        .bind(organization_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(org)
    }

    pub async fn get_organization_by_slug(
        &self,
        slug: &str,
    ) -> Result<Option<Organization>, AppError> {
        let start = Instant::now();
        let org = sqlx::query_as::<_, Organization>(
            r#"
            SELECT id, name, slug, login_display_name, login_title, login_subtitle, icon_url, login_logo_url, brand_color, show_login_logo, show_login_title, show_login_subtitle, show_powered_by, widget_radius, widget_shadow, icon_container, login_logo_container, login_logo_size, card_radius, button_style, card_bg_style, card_bg_color2, card_border_width, card_border_color, login_method_order, allow_magic_link, allow_google, allow_microsoft, allow_passkey, require_mfa, allow_client_management, allow_web_clients, allow_spa_clients, allow_native_clients, allowed_email_domains, max_session_age_hours, magic_link_expiry_minutes, oidc_access_token_ttl_minutes, refresh_token_ttl_days, idle_timeout_minutes, require_mfa_for_admins, tenant_portal_require_mfa, max_concurrent_sessions, magic_link_rate_limit_admin_override, magic_link_rate_window_admin_override, magic_link_rate_limit_staff_override, magic_link_rate_window_staff_override, status, platform_locked, created_at, updated_at
            FROM organizations
            WHERE slug = $1 AND status = 'active'
            "#
        )
        .bind(slug)
        .fetch_optional(&self.pool)
        .await?;

        if Self::timing_logs_enabled() {
            let detail = org
                .as_ref()
                .map(|item| {
                    format!(
                        "slug={}, found=true, icon_len={}, login_logo_len={}",
                        slug,
                        item.icon_url.as_ref().map(|v| v.len()).unwrap_or(0),
                        item.login_logo_url.as_ref().map(|v| v.len()).unwrap_or(0),
                    )
                })
                .unwrap_or_else(|| format!("slug={}, found=false", slug));
            tracing::info!(
                "[timing] organization.get_by_slug took {}ms | {}",
                start.elapsed().as_millis(),
                detail
            );
        }

        Ok(org)
    }

    pub async fn is_member(&self, organization_id: Uuid, user_id: Uuid) -> Result<bool, AppError> {
        let rec = sqlx::query(
            "SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active'"
        )
        .bind(organization_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(rec.is_some())
    }

    pub async fn update_session_org_context(
        &self,
        session_id: Uuid,
        org_id: Uuid,
    ) -> Result<(), AppError> {
        sqlx::query("UPDATE sessions SET current_org_id = $1 WHERE id = $2")
            .bind(org_id)
            .bind(session_id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn update_organization_branding(
        &self,
        organization_id: Uuid,
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
        let org = sqlx::query_as::<_, Organization>(
            r#"
            UPDATE organizations
            SET login_display_name = $2,
                login_title = $3,
                login_subtitle = $4,
                icon_url = $5,
                login_logo_url = $6,
                brand_color = $7,
                show_login_logo = COALESCE($8, show_login_logo),
                show_login_title = COALESCE($9, show_login_title),
                show_login_subtitle = COALESCE($10, show_login_subtitle),
                show_powered_by = COALESCE($11, show_powered_by),
                widget_radius = COALESCE($12, widget_radius),
                widget_shadow = COALESCE($13, widget_shadow),
                icon_container = COALESCE($14, icon_container),
                login_logo_container = COALESCE($15, login_logo_container),
                login_logo_size = COALESCE($16, login_logo_size),
                card_radius = COALESCE($17, card_radius),
                button_style = COALESCE($18, button_style),
                card_bg_style = COALESCE($19, card_bg_style),
                card_bg_color2 = $20,
                card_border_width = COALESCE($21, card_border_width),
                card_border_color = $22,
                login_method_order = COALESCE($23, login_method_order),
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, name, slug, login_display_name, login_title, login_subtitle, icon_url, login_logo_url, brand_color, show_login_logo, show_login_title, show_login_subtitle, show_powered_by, widget_radius, widget_shadow, icon_container, login_logo_container, login_logo_size, card_radius, button_style, card_bg_style, card_bg_color2, card_border_width, card_border_color, login_method_order, allow_magic_link, allow_google, allow_microsoft, allow_passkey, require_mfa, allow_client_management, allow_web_clients, allow_spa_clients, allow_native_clients, allowed_email_domains, max_session_age_hours, magic_link_expiry_minutes, oidc_access_token_ttl_minutes, refresh_token_ttl_days, idle_timeout_minutes, require_mfa_for_admins, tenant_portal_require_mfa, max_concurrent_sessions, magic_link_rate_limit_admin_override, magic_link_rate_window_admin_override, magic_link_rate_limit_staff_override, magic_link_rate_window_staff_override, status, platform_locked, created_at, updated_at
            "#
        )
        .bind(organization_id)
        .bind(login_display_name)
        .bind(login_title)
        .bind(login_subtitle)
        .bind(icon_url)
        .bind(login_logo_url)
        .bind(brand_color)
        .bind(show_login_logo)
        .bind(show_login_title)
        .bind(show_login_subtitle)
        .bind(show_powered_by)
        .bind(widget_radius)
        .bind(widget_shadow)
        .bind(icon_container)
        .bind(login_logo_container)
        .bind(login_logo_size)
        .bind(card_radius)
        .bind(button_style)
        .bind(card_bg_style)
        .bind(card_bg_color2)
        .bind(card_border_width)
        .bind(card_border_color)
        .bind(login_method_order)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Organization not found".into()))?;

        Ok(org)
    }

    pub async fn update_organization_auth_policy(
        &self,
        organization_id: Uuid,
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
        let org = sqlx::query_as::<_, Organization>(
            r#"
            UPDATE organizations
            SET allow_magic_link            = $2,
                allow_google                = $3,
                allow_microsoft             = $4,
                allow_passkey               = $5,
                require_mfa                 = $6,
                require_mfa_for_admins      = $7,
                tenant_portal_require_mfa   = $8,
                allowed_email_domains       = $9,
                max_session_age_hours       = $10,
                max_concurrent_sessions     = $11,
                updated_at                  = NOW()
            WHERE id = $1
            RETURNING id, name, slug, login_display_name, login_title, login_subtitle, icon_url, login_logo_url, brand_color, show_login_logo, show_login_title, show_login_subtitle, show_powered_by, widget_radius, widget_shadow, icon_container, login_logo_container, login_logo_size, card_radius, button_style, card_bg_style, card_bg_color2, card_border_width, card_border_color, login_method_order, allow_magic_link, allow_google, allow_microsoft, allow_passkey, require_mfa, allow_client_management, allow_web_clients, allow_spa_clients, allow_native_clients, allowed_email_domains, max_session_age_hours, magic_link_expiry_minutes, oidc_access_token_ttl_minutes, refresh_token_ttl_days, idle_timeout_minutes, require_mfa_for_admins, tenant_portal_require_mfa, max_concurrent_sessions, magic_link_rate_limit_admin_override, magic_link_rate_window_admin_override, magic_link_rate_limit_staff_override, magic_link_rate_window_staff_override, status, platform_locked, created_at, updated_at
            "#
        )
        .bind(organization_id)
        .bind(allow_magic_link)
        .bind(allow_google)
        .bind(allow_microsoft)
        .bind(allow_passkey)
        .bind(require_mfa)
        .bind(require_mfa_for_admins)
        .bind(tenant_portal_require_mfa)
        .bind(allowed_email_domains)
        .bind(max_session_age_hours)
        .bind(max_concurrent_sessions)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Organization not found".into()))?;

        Ok(org)
    }

    pub async fn update_organization_client_policy(
        &self,
        organization_id: Uuid,
        allow_client_management: bool,
        allow_web_clients: bool,
        allow_spa_clients: bool,
        allow_native_clients: bool,
    ) -> Result<Organization, AppError> {
        let org = sqlx::query_as::<_, Organization>(
            r#"
            UPDATE organizations
            SET allow_client_management = $2,
                allow_web_clients = $3,
                allow_spa_clients = $4,
                allow_native_clients = $5,
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, name, slug, login_display_name, login_title, login_subtitle, icon_url, login_logo_url, brand_color, show_login_logo, show_login_title, show_login_subtitle, show_powered_by, widget_radius, widget_shadow, icon_container, login_logo_container, login_logo_size, card_radius, button_style, card_bg_style, card_bg_color2, card_border_width, card_border_color, login_method_order, allow_magic_link, allow_google, allow_microsoft, allow_passkey, require_mfa, allow_client_management, allow_web_clients, allow_spa_clients, allow_native_clients, allowed_email_domains, max_session_age_hours, magic_link_expiry_minutes, oidc_access_token_ttl_minutes, refresh_token_ttl_days, idle_timeout_minutes, require_mfa_for_admins, tenant_portal_require_mfa, max_concurrent_sessions, magic_link_rate_limit_admin_override, magic_link_rate_window_admin_override, magic_link_rate_limit_staff_override, magic_link_rate_window_staff_override, status, platform_locked, created_at, updated_at
            "#
        )
        .bind(organization_id)
        .bind(allow_client_management)
        .bind(allow_web_clients)
        .bind(allow_spa_clients)
        .bind(allow_native_clients)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Organization not found".into()))?;

        Ok(org)
    }

    pub async fn update_organization_ip_policy(
        &self,
        organization_id: Uuid,
        use_custom_ip_policy: bool,
        ip_allowlist: &str,
        ip_blocklist: &str,
    ) -> Result<(), AppError> {
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
        .bind(organization_id)
        .bind(use_custom_ip_policy)
        .bind(ip_allowlist)
        .bind(ip_blocklist)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_organization_members(
        &self,
        organization_id: Uuid,
    ) -> Result<Vec<OrganizationMember>, AppError> {
        let members = sqlx::query_as::<_, OrganizationMember>(
            r#"
            SELECT id, organization_id, user_id, status, created_at
            FROM organization_members
            WHERE organization_id = $1
            ORDER BY created_at ASC
            "#,
        )
        .bind(organization_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(members)
    }

    pub async fn get_organization_member_views(
        &self,
        organization_id: Uuid,
    ) -> Result<Vec<OrganizationMemberView>, AppError> {
        let members = sqlx::query_as::<_, OrganizationMemberView>(
            r#"
            SELECT
                om.id,
                om.organization_id,
                om.user_id,
                om.status,
                om.created_at,
                u.display_name,
                u.avatar_url,
                ue.email,
                COALESCE(array_remove(array_agg(DISTINCT r.name), NULL), ARRAY[]::text[]) AS role_names,
                COALESCE(array_remove(array_agg(DISTINCT r.code), NULL), ARRAY[]::text[]) AS role_codes,
                COALESCE(
                    GREATEST(
                        (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = om.user_id),
                        (SELECT MAX(al.created_at) FROM audit_logs al WHERE al.actor_user_id = om.user_id)
                    ),
                    (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = om.user_id),
                    (SELECT MAX(al.created_at) FROM audit_logs al WHERE al.actor_user_id = om.user_id)
                ) AS last_seen_at
            FROM organization_members om
            JOIN users u ON u.id = om.user_id
            LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
            LEFT JOIN member_roles mr ON mr.member_id = om.id
            LEFT JOIN roles r ON r.id = mr.role_id
            WHERE om.organization_id = $1
            GROUP BY om.id, om.organization_id, om.user_id, om.status, om.created_at, u.display_name, u.avatar_url, ue.email
            ORDER BY om.created_at ASC
            LIMIT $2
            "#
        )
        .bind(organization_id)
        .bind(ORGANIZATION_MEMBER_VIEW_LIMIT)
        .fetch_all(&self.pool)
        .await?;

        Ok(members)
    }

    pub async fn get_organization_member_view_by_user(
        &self,
        organization_id: Uuid,
        user_id: Uuid,
    ) -> Result<Option<OrganizationMemberView>, AppError> {
        sqlx::query_as::<_, OrganizationMemberView>(
            r#"
            SELECT
                om.id, om.organization_id, om.user_id, om.status, om.created_at,
                u.display_name, u.avatar_url, ue.email,
                COALESCE(array_remove(array_agg(DISTINCT r.name), NULL), ARRAY[]::text[]) AS role_names,
                COALESCE(array_remove(array_agg(DISTINCT r.code), NULL), ARRAY[]::text[]) AS role_codes,
                COALESCE(
                    GREATEST(
                        (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = om.user_id),
                        (SELECT MAX(al.created_at) FROM audit_logs al WHERE al.actor_user_id = om.user_id)
                    ),
                    (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = om.user_id),
                    (SELECT MAX(al.created_at) FROM audit_logs al WHERE al.actor_user_id = om.user_id)
                ) AS last_seen_at
            FROM organization_members om
            JOIN users u ON u.id = om.user_id
            LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
            LEFT JOIN member_roles mr ON mr.member_id = om.id
            LEFT JOIN roles r ON r.id = mr.role_id
            WHERE om.organization_id = $1 AND om.user_id = $2
            GROUP BY om.id, om.organization_id, om.user_id, om.status, om.created_at, u.display_name, u.avatar_url, ue.email
            "#,
        )
        .bind(organization_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|error| AppError::Internal(format!("Failed to load workspace member: {error}")))
    }

    pub async fn get_organization_member_view_by_id(
        &self,
        organization_id: Uuid,
        member_id: Uuid,
    ) -> Result<Option<OrganizationMemberView>, AppError> {
        let user_id: Option<Uuid> = sqlx::query_scalar(
            "SELECT user_id FROM organization_members WHERE organization_id = $1 AND id = $2",
        )
        .bind(organization_id)
        .bind(member_id)
        .fetch_optional(&self.pool)
        .await?;
        match user_id {
            Some(user_id) => self.get_organization_member_view_by_user(organization_id, user_id).await,
            None => Ok(None),
        }
    }

    pub async fn search_organization_member_views(
        &self,
        organization_id: Uuid,
        search: &str,
        role: &str,
        status: &str,
        sort_by: &str,
        sort_order: &str,
        page: i64,
        page_size: i64,
    ) -> Result<(Vec<OrganizationMemberView>, i64), AppError> {
        let search = search.trim().to_lowercase();
        let sort_column = match sort_by {
            "display_name" => "lower(u.display_name)",
            "email" => "lower(ue.email::text)",
            "status" => "om.status",
            "role" => "role_codes",
            "created_at" => "om.created_at",
            "last_seen_at" => "last_seen_at",
            _ => return Err(AppError::Validation("Invalid member sort field.".into())),
        };
        let direction = match sort_order {
            "asc" => "ASC",
            "desc" => "DESC",
            _ => return Err(AppError::Validation("Invalid member sort order.".into())),
        };
        let filter = "om.organization_id = $1 AND ($2 = '' OR lower(coalesce(u.display_name, '')) LIKE '%' || $2 || '%' OR lower(coalesce(ue.email::text, '')) LIKE '%' || $2 || '%' OR EXISTS (SELECT 1 FROM member_roles mrq JOIN roles rq ON rq.id = mrq.role_id WHERE mrq.member_id = om.id AND lower(rq.code) LIKE '%' || $2 || '%')) AND ($3 = 'all' OR EXISTS (SELECT 1 FROM member_roles mrf JOIN roles rf ON rf.id = mrf.role_id WHERE mrf.member_id = om.id AND lower(rf.code) = $3)) AND ($4 = 'all' OR lower(om.status) = $4)";
        let total: i64 = sqlx::query_scalar(&format!(
            "SELECT COUNT(*) FROM organization_members om JOIN users u ON u.id = om.user_id LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true WHERE {filter}"
        ))
        .bind(organization_id).bind(&search).bind(role).bind(status)
        .fetch_one(&self.pool).await?;
        let members = sqlx::query_as::<_, OrganizationMemberView>(&format!(
            r#"
            SELECT om.id, om.organization_id, om.user_id, om.status, om.created_at,
                   u.display_name, u.avatar_url, ue.email,
                   COALESCE(array_remove(array_agg(DISTINCT r.name), NULL), ARRAY[]::text[]) AS role_names,
                   COALESCE(array_remove(array_agg(DISTINCT r.code), NULL), ARRAY[]::text[]) AS role_codes,
                   COALESCE(
                       GREATEST(
                           (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = om.user_id),
                           (SELECT MAX(al.created_at) FROM audit_logs al WHERE al.actor_user_id = om.user_id)
                       ),
                       (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = om.user_id),
                       (SELECT MAX(al.created_at) FROM audit_logs al WHERE al.actor_user_id = om.user_id)
                   ) AS last_seen_at
            FROM organization_members om
            JOIN users u ON u.id = om.user_id
            LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
            LEFT JOIN member_roles mr ON mr.member_id = om.id
            LEFT JOIN roles r ON r.id = mr.role_id
            WHERE {filter}
            GROUP BY om.id, om.organization_id, om.user_id, om.status, om.created_at, u.display_name, u.avatar_url, ue.email
            ORDER BY {sort_column} {direction} NULLS LAST, om.id DESC
            LIMIT $5 OFFSET $6
            "#
        ))
        .bind(organization_id).bind(&search).bind(role).bind(status)
        .bind(page_size).bind((page - 1).saturating_mul(page_size))
        .fetch_all(&self.pool).await?;
        Ok((members, total))
    }

    pub async fn get_organization_activity(
        &self,
        organization_id: Uuid,
        page: i64,
        page_size: i64,
        search: &str,
        action_filter: &str,
        date_from: Option<&str>,
        date_to: Option<&str>,
    ) -> Result<(Vec<OrganizationActivityItem>, i64), AppError> {
        let offset = (page - 1) * page_size;

        let total: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*)
            FROM audit_logs al
            LEFT JOIN users u ON u.id = al.actor_user_id
            LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
            WHERE al.organization_id = $1
              AND (
                $2 = '' OR
                al.action ILIKE '%' || $2 || '%' OR
                al.target_type ILIKE '%' || $2 || '%' OR
                COALESCE(al.target_id, '') ILIKE '%' || $2 || '%' OR
                COALESCE(al.ip::text, '') ILIKE '%' || $2 || '%' OR
                COALESCE(ue.email, '') ILIKE '%' || $2 || '%' OR
                COALESCE(u.display_name, '') ILIKE '%' || $2 || '%'
              )
              AND (
                $3 = 'all'
                OR ($3 = 'success' AND al.action LIKE '%success%')
                OR ($3 = 'failed' AND al.action LIKE '%failed%')
                OR ($3 = 'suspicious' AND al.action LIKE '%suspicious%')
              )
              AND ($4::date IS NULL OR al.created_at >= $4::date)
              AND ($5::date IS NULL OR al.created_at < ($5::date + interval '1 day'))
            "#,
        )
        .bind(organization_id)
        .bind(search)
        .bind(action_filter)
        .bind(date_from)
        .bind(date_to)
        .fetch_one(&self.pool)
        .await?;

        let items = sqlx::query_as::<_, OrganizationActivityItem>(
            r#"
            SELECT
                al.id,
                al.actor_user_id,
                u.display_name AS actor_display_name,
                ue.email AS actor_email,
                al.action,
                al.target_type,
                al.target_id,
                al.ip::text AS ip,
                al.user_agent,
                al.metadata,
                al.created_at
            FROM audit_logs al
            LEFT JOIN users u ON u.id = al.actor_user_id
            LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
            WHERE al.organization_id = $1
              AND (
                $2 = '' OR
                al.action ILIKE '%' || $2 || '%' OR
                al.target_type ILIKE '%' || $2 || '%' OR
                COALESCE(al.target_id, '') ILIKE '%' || $2 || '%' OR
                COALESCE(al.ip::text, '') ILIKE '%' || $2 || '%' OR
                COALESCE(ue.email, '') ILIKE '%' || $2 || '%' OR
                COALESCE(u.display_name, '') ILIKE '%' || $2 || '%'
              )
              AND (
                $3 = 'all'
                OR ($3 = 'success' AND al.action LIKE '%success%')
                OR ($3 = 'failed' AND al.action LIKE '%failed%')
                OR ($3 = 'suspicious' AND al.action LIKE '%suspicious%')
              )
              AND ($4::date IS NULL OR al.created_at >= $4::date)
              AND ($5::date IS NULL OR al.created_at < ($5::date + interval '1 day'))
            ORDER BY al.created_at DESC
            LIMIT $6 OFFSET $7
            "#,
        )
        .bind(organization_id)
        .bind(search)
        .bind(action_filter)
        .bind(date_from)
        .bind(date_to)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&self.pool)
        .await?;

        Ok((items, total))
    }

    pub async fn update_member_role(
        &self,
        organization_id: Uuid,
        member_id: Uuid,
        role_code: &str,
    ) -> Result<(), AppError> {
        let mut tx = self.pool.begin().await?;
        // Share the same workspace lock as owner transfer so role changes and
        // ownership handoff cannot make decisions from different snapshots.
        sqlx::query("SELECT id FROM organizations WHERE id = $1 FOR UPDATE")
            .bind(organization_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(|| AppError::NotFound("Workspace not found.".into()))?;

        let member_record = sqlx::query(
            r#"
            SELECT om.id
            FROM organization_members om
            WHERE om.id = $1 AND om.organization_id = $2 AND om.status = 'active'
            "#,
        )
        .bind(member_id)
        .bind(organization_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound("Company member not found.".into()))?;

        let _ = member_record;

        let existing_roles = sqlx::query(
            r#"
            SELECT r.code
            FROM member_roles mr
            JOIN roles r ON r.id = mr.role_id
            WHERE mr.member_id = $1
            "#,
        )
        .bind(member_id)
        .fetch_all(&mut *tx)
        .await?;

        let has_owner_role = existing_roles
            .iter()
            .any(|row| row.get::<String, _>("code") == "owner");

        // Ownership is changed only through the confirmed owner-transfer flow.
        // A normal role update must not leave the owner role in place while
        // reporting a successful demotion, or create an ownerless workspace.
        if has_owner_role {
            return Err(AppError::Validation(
                "Transfer workspace ownership before changing an owner's role.".into(),
            ));
        }

        sqlx::query(
            r#"
            DELETE FROM member_roles mr
            USING roles r
            WHERE mr.role_id = r.id
              AND mr.member_id = $1
              AND r.is_system = true
              AND r.code <> 'owner'
            "#,
        )
        .bind(member_id)
        .execute(&mut *tx)
        .await?;

        sqlx::query(
            r#"
            INSERT INTO member_roles (member_id, role_id)
            SELECT $1, id
            FROM roles
            WHERE is_system = true
              AND code = $2
            LIMIT 1
            "#,
        )
        .bind(member_id)
        .bind(role_code)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(())
    }

    /// Remove a member from an organization. Prevents removing the last owner.
    /// Returns the user_id of the removed member so the caller can revoke sessions.
    pub async fn remove_member(
        &self,
        organization_id: Uuid,
        member_id: Uuid,
    ) -> Result<Uuid, AppError> {
        let mut tx = self.pool.begin().await?;
        sqlx::query("SELECT id FROM organizations WHERE id = $1 FOR UPDATE")
            .bind(organization_id)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(|| AppError::NotFound("Workspace not found.".into()))?;

        // Check member exists and is active
        let user_id: Uuid = sqlx::query_scalar(
            "SELECT user_id FROM organization_members WHERE id = $1 AND organization_id = $2 AND status = 'active'"
        )
        .bind(member_id)
        .bind(organization_id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| AppError::NotFound("Company member not found.".into()))?;

        // Last-owner guard
        let is_owner: bool = sqlx::query_scalar(
            r#"SELECT EXISTS(
                SELECT 1 FROM member_roles mr JOIN roles r ON r.id = mr.role_id
                WHERE mr.member_id = $1 AND r.code = 'owner'
            )"#,
        )
        .bind(member_id)
        .fetch_one(&mut *tx)
        .await?;

        if is_owner {
            let owner_count: i64 = sqlx::query_scalar(
                r#"SELECT COUNT(*) FROM organization_members om
                   JOIN member_roles mr ON mr.member_id = om.id
                   JOIN roles r ON r.id = mr.role_id
                   WHERE om.organization_id = $1 AND om.status = 'active' AND r.code = 'owner'"#,
            )
            .bind(organization_id)
            .fetch_one(&mut *tx)
            .await?;

            if owner_count <= 1 {
                return Err(AppError::Validation(
                    "Cannot remove the last owner. Assign another owner first.".into(),
                ));
            }
        }

        // Delete member_roles then the member row (cascade would also handle it but be explicit)
        sqlx::query("DELETE FROM member_roles WHERE member_id = $1")
            .bind(member_id)
            .execute(&mut *tx)
            .await?;

        sqlx::query("DELETE FROM organization_members WHERE id = $1")
            .bind(member_id)
            .execute(&mut *tx)
            .await?;

        tx.commit().await?;
        Ok(user_id)
    }

    pub async fn create_invite(
        &self,
        organization_id: Uuid,
        email: &str,
        token_hash: &str,
        inviter_user_id: Uuid,
        expires_at: chrono::DateTime<chrono::Utc>,
    ) -> Result<OrganizationInvite, AppError> {
        // Preserve the old expired row before issuing a fresh invitation.
        sqlx::query(
            "UPDATE organization_invites SET status = 'expired', responded_at = expires_at WHERE organization_id = $1 AND email = $2 AND status = 'pending' AND expires_at <= NOW()",
        )
        .bind(organization_id)
        .bind(email)
        .execute(&self.pool)
        .await?;
        let invite = sqlx::query_as::<_, OrganizationInvite>(
            r#"
            INSERT INTO organization_invites (organization_id, email, token_hash, inviter_user_id, expires_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (organization_id, email) WHERE status = 'pending'
            DO UPDATE SET token_hash = EXCLUDED.token_hash, inviter_user_id = EXCLUDED.inviter_user_id, expires_at = EXCLUDED.expires_at, used_at = NULL, created_at = NOW()
            RETURNING id, organization_id, email, token_hash, inviter_user_id, expires_at, used_at, created_at
            "#
        )
        .bind(organization_id)
        .bind(email)
        .bind(token_hash)
        .bind(inviter_user_id)
        .bind(expires_at)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| AppError::Database(e))?;

        Ok(invite)
    }

    pub async fn reserve_invite_send(
        &self,
        organization_id: Uuid,
        email: &str,
    ) -> Result<(), AppError> {
        let mut tx = self.pool.begin().await?;
        let already_member: Option<Uuid> = sqlx::query_scalar(
            "SELECT om.id FROM organization_members om JOIN user_emails ue ON ue.user_id = om.user_id WHERE om.organization_id = $1 AND ue.email = $2 AND om.status = 'active' LIMIT 1",
        )
        .bind(organization_id).bind(email)
        .fetch_optional(&mut *tx).await?;
        if already_member.is_some() {
            return Err(AppError::Conflict("This account is already a workspace member".into()));
        }
        let recipient_reserved: Option<String> = sqlx::query_scalar(
            "INSERT INTO organization_invite_recipient_cooldowns (organization_id, email, next_allowed_at) VALUES ($1, $2, NOW() + INTERVAL '10 minutes') ON CONFLICT (organization_id, email) DO UPDATE SET next_allowed_at = EXCLUDED.next_allowed_at WHERE organization_invite_recipient_cooldowns.next_allowed_at <= NOW() RETURNING email::text",
        )
        .bind(organization_id).bind(email)
        .fetch_optional(&mut *tx).await?;
        if recipient_reserved.is_none() {
            return Err(AppError::RateLimited);
        }
        let daily_reserved: Option<i32> = sqlx::query_scalar(
            "INSERT INTO organization_invite_daily_limits (organization_id, day, sends) VALUES ($1, (NOW() AT TIME ZONE 'UTC')::date, 1) ON CONFLICT (organization_id, day) DO UPDATE SET sends = organization_invite_daily_limits.sends + 1 WHERE organization_invite_daily_limits.sends < 100 RETURNING sends",
        )
        .bind(organization_id)
        .fetch_optional(&mut *tx).await?;
        if daily_reserved.is_none() {
            return Err(AppError::RateLimited);
        }
        tx.commit().await?;
        Ok(())
    }

    pub async fn get_valid_invite(&self, token_hash: &str) -> Result<OrganizationInvite, AppError> {
        let invite = sqlx::query_as::<_, OrganizationInvite>(
            r#"
            SELECT id, organization_id, email, token_hash, inviter_user_id, expires_at, used_at, created_at
            FROM organization_invites
            WHERE token_hash = $1
              AND status = 'pending'
              AND used_at IS NULL
              AND expires_at > NOW()
            "#
        )
        .bind(token_hash)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| AppError::Validation("Invalid or expired invitation".into()))?;

        Ok(invite)
    }

    pub async fn list_pending_invites(
        &self,
        organization_id: Uuid,
    ) -> Result<Vec<super::models::OrganizationInviteSummary>, AppError> {
        let invites = sqlx::query_as::<_, super::models::OrganizationInviteSummary>(
            r#"
            SELECT
                oi.id,
                oi.organization_id,
                oi.email,
                oi.inviter_user_id,
                u.display_name AS inviter_display_name,
                ue.email AS inviter_email,
                oi.expires_at,
                oi.created_at
            FROM organization_invites oi
            LEFT JOIN users u ON u.id = oi.inviter_user_id
            LEFT JOIN user_emails ue ON ue.user_id = u.id AND ue.is_primary = true
            WHERE oi.organization_id = $1
              AND oi.status = 'pending'
              AND oi.used_at IS NULL
              AND oi.expires_at > NOW()
            ORDER BY oi.created_at DESC
            "#,
        )
        .bind(organization_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(invites)
    }

    pub async fn revoke_invite(
        &self,
        invite_id: Uuid,
        organization_id: Uuid,
    ) -> Result<OrganizationInvite, AppError> {
        let invite = sqlx::query_as::<_, OrganizationInvite>(
            r#"
            UPDATE organization_invites
            SET status = 'revoked', responded_at = NOW()
            WHERE id = $1
              AND organization_id = $2
              AND status = 'pending'
              AND used_at IS NULL
              AND expires_at > NOW()
            RETURNING id, organization_id, email, token_hash, inviter_user_id, expires_at, used_at, created_at
            "#
        )
        .bind(invite_id)
        .bind(organization_id)
        .fetch_optional(&self.pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Invitation not found".into()))?;

        Ok(invite)
    }

    pub async fn mark_invite_used(
        &self,
        invite_id: Uuid,
        user_id: Uuid,
        organization_id: Uuid,
    ) -> Result<(), AppError> {
        let mut tx = self.pool.begin().await?;

        // Claim once inside the same transaction as the member grant. A
        // concurrent decline, revoke, or acceptance cannot activate this row.
        let claimed = sqlx::query(
            "UPDATE organization_invites SET used_at = NOW(), status = 'accepted', responded_at = NOW(), accepted_user_id = $2 WHERE id = $1 AND organization_id = $3 AND status = 'pending' AND expires_at > NOW() RETURNING id",
        )
            .bind(invite_id)
            .bind(user_id)
            .bind(organization_id)
            .fetch_optional(&mut *tx)
            .await?;
        if claimed.is_none() {
            return Err(AppError::Validation("Invitation is no longer available".into()));
        }

        // 2. Insert member (ignore conflict if already a member, but set status active)
        let member_rec = sqlx::query(
            r#"
            INSERT INTO organization_members (organization_id, user_id, status)
            VALUES ($1, $2, 'active')
            ON CONFLICT (organization_id, user_id) 
            DO UPDATE SET status = 'active'
            RETURNING id
            "#,
        )
        .bind(organization_id)
        .bind(user_id)
        .fetch_one(&mut *tx)
        .await?;

        use sqlx::Row;
        let member_id: Uuid = member_rec.get("id");

        // 3. Assign default 'member' role safely if they don't have it already
        sqlx::query(
            "INSERT INTO member_roles (member_id, role_id) SELECT $1, id FROM roles WHERE code = 'member' AND is_system = true ON CONFLICT DO NOTHING"
        )
        .bind(member_id)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

        Ok(())
    }

    pub async fn decline_invite(
        &self,
        invite_id: Uuid,
        organization_id: Uuid,
    ) -> Result<(), AppError> {
        let changed = sqlx::query(
            "UPDATE organization_invites SET status = 'declined', responded_at = NOW() WHERE id = $1 AND organization_id = $2 AND status = 'pending' AND expires_at > NOW() RETURNING id",
        )
        .bind(invite_id)
        .bind(organization_id)
        .fetch_optional(&self.pool)
        .await?;
        if changed.is_none() {
            return Err(AppError::Validation("Invitation is no longer available".into()));
        }
        Ok(())
    }

    /// Returns true if the user has the 'owner' or 'admin' role in the given organization.
    pub async fn is_org_admin_or_owner(
        &self,
        organization_id: Uuid,
        user_id: Uuid,
    ) -> Result<bool, AppError> {
        let count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*)
            FROM organization_members om
            JOIN member_roles mr ON mr.member_id = om.id
            JOIN roles r ON r.id = mr.role_id
            WHERE om.organization_id = $1
              AND om.user_id = $2
              AND om.status = 'active'
              AND r.code IN ('owner', 'admin')
            "#,
        )
        .bind(organization_id)
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(count > 0)
    }

    /// Returns true if the user has the 'owner' role in the given organization.
    pub async fn is_org_owner(
        &self,
        organization_id: Uuid,
        user_id: Uuid,
    ) -> Result<bool, AppError> {
        let count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*)
            FROM organization_members om
            JOIN member_roles mr ON mr.member_id = om.id
            JOIN roles r ON r.id = mr.role_id
            WHERE om.organization_id = $1
              AND om.user_id = $2
              AND om.status = 'active'
              AND r.code = 'owner'
            "#,
        )
        .bind(organization_id)
        .bind(user_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(count > 0)
    }

    /// Returns the active role codes for the given user in the given organization.
    pub async fn get_user_role_codes(
        &self,
        organization_id: Uuid,
        user_id: Uuid,
    ) -> Result<Vec<String>, AppError> {
        let role_codes = sqlx::query_scalar(
            r#"
            SELECT DISTINCT r.code
            FROM organization_members om
            JOIN member_roles mr ON mr.member_id = om.id
            JOIN roles r ON r.id = mr.role_id
            WHERE om.organization_id = $1
              AND om.user_id = $2
              AND om.status = 'active'
            ORDER BY r.code
            "#,
        )
        .bind(organization_id)
        .bind(user_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(role_codes)
    }
}
