/// Test seed — mirrors the demo persona structure with `.test` TLD.
///
/// Two layers:
/// 1. `seed_test_data()` — runs at startup in test mode. Seeds a full cast of
///    platform + org personas (owner, admin, tenant, members) so test scripts
///    have a predictable, role-complete environment without demo data.
/// 2. `TEST_IDENTITIES` — cute `.test` emails created on-demand via
///    `POST /v1/test/login`, wiped by `DELETE /v1/test/cleanup`.
///
/// Rules:
/// - All emails MUST end in `.test` (RFC 2606 reserved TLD — can never be real)
/// - Only active when `ROOIAM_MODE=test`
/// - No runtime privilege escalation — roles are set at seed time only
/// - Org slugs mirror demo slugs so test scripts can reuse the same slug names

use sqlx::{PgPool, Row};
use uuid::Uuid;
use crate::modules::identity::repository::IdentityRepository;
use crate::modules::organization::repository::OrganizationRepository;

// ── Platform accounts ─────────────────────────────────────────────────────────
const TEST_OWNER_EMAIL: &str    = "owner@rooiam.test";
const TEST_OWNER_NAME: &str     = "Test Owner";

const TEST_ADMIN_EMAIL: &str    = "admin@rooiam.test";
const TEST_ADMIN_NAME: &str     = "Test Admin";

const TEST_TOFFEE_EMAIL: &str   = "toffee@rooiam.test";
const TEST_TOFFEE_NAME: &str    = "Test Toffee";

// ── Tenant (owns roochoco-test + mintmallow-test) ────────────────────────────
const TEST_TENANT_EMAIL: &str   = "rooroo@sweetfactory.test";
const TEST_TENANT_NAME: &str    = "Test Rooroo";

// ── RooChoco workspace members (chocolate theme) ─────────────────────────────
const TEST_ROOCHOCO_TRUFFLE_EMAIL: &str   = "truffle@roochoco.test";
const TEST_ROOCHOCO_TRUFFLE_NAME: &str    = "Test Truffle";

const TEST_ROOCHOCO_PRALINE_EMAIL: &str   = "praline@roochoco.test";
const TEST_ROOCHOCO_PRALINE_NAME: &str    = "Test Praline";

const TEST_ROOCHOCO_GANACHE_EMAIL: &str   = "ganache@roochoco.test";
const TEST_ROOCHOCO_GANACHE_NAME: &str    = "Test Ganache";

// ── MintMallow workspace members (mint theme) ────────────────────────────────
const TEST_MINTMALLOW_ADMIN_1_EMAIL: &str  = "peppermint@mintmallow.test";
const TEST_MINTMALLOW_ADMIN_1_NAME: &str   = "Test Peppermint";

const TEST_MINTMALLOW_ADMIN_2_EMAIL: &str  = "spearmint@mintmallow.test";
const TEST_MINTMALLOW_ADMIN_2_NAME: &str   = "Test Spearmint";

// Regular member — used by IDOR and permission-denial tests
const TEST_MINTMALLOW_LULU_EMAIL: &str     = "lulu@softmallow.test";
const TEST_MINTMALLOW_LULU_NAME: &str      = "Test Lulu";

// ── Org slugs ─────────────────────────────────────────────────────────────────
const TEST_PLATFORM_ORG_SLUG: &str  = "rooiam-test";
const TEST_ROOCHOCO_SLUG: &str      = "roochoco-test";
const TEST_MINTMALLOW_SLUG: &str    = "mintmallow-test";

/// Returns true only in test mode (`ROOIAM_MODE=test`).
pub fn test_mode_enabled() -> bool {
    crate::bootstrap::config::ServerMode::from_env() == crate::bootstrap::config::ServerMode::Test
}

pub fn test_owner_email() -> &'static str { TEST_OWNER_EMAIL }
pub fn test_admin_email() -> &'static str { TEST_ADMIN_EMAIL }
pub fn test_tenant_email() -> &'static str { TEST_TENANT_EMAIL }
pub fn test_roochoco_slug() -> &'static str { TEST_ROOCHOCO_SLUG }
pub fn test_mintmallow_slug() -> &'static str { TEST_MINTMALLOW_SLUG }
pub fn test_platform_org_slug() -> &'static str { TEST_PLATFORM_ORG_SLUG }

/// Seeds a full demo-mirrored cast at startup in test mode.
///
/// Org structure:
/// - `rooiam-test`     — platform org (owner + admin + toffee)
/// - `roochoco-test`   — tenant org (rooroo=owner, truffle=admin, praline+ganache=user)
/// - `mintmallow-test` — tenant org (rooroo=owner, peppermint+spearmint=admin, require_mfa=true)
///
/// Safe to call multiple times — idempotent.
pub async fn seed_test_data(pool: &PgPool) -> Result<(), anyhow::Error> {
    if !test_mode_enabled() {
        return Ok(());
    }

    // Safety guard: test mode must use the local rooiam_test database.
    // It wipes ALL data on startup — must never point at a remote or real database.
    let db_url = std::env::var("ROOIAM_DATABASE_URL").unwrap_or_default();
    let ok = db_url.ends_with("rooiam_test") || db_url.contains("/rooiam_test?");
    if !ok {
        panic!(
            "SAFETY ABORT: ROOIAM_MODE=test must use the dedicated 'rooiam_test' database.\n\
             Refusing to wipe: {}\n\
             Expected: postgres://.../rooiam_test",
            db_url
        );
    }

    // Test mode always wipes and reseeds — guaranteed clean state on every startup.
    tracing::info!("Test mode: wiping all data before reseed...");
    sqlx::query(
        r#"
        TRUNCATE TABLE
            tenant_api_keys,
            tenant_auth_config,
            user_mfa_backup_codes,
            mfa_challenges,
            user_mfa_methods,
            webauthn_challenges,
            user_passkeys,
            oauth_refresh_tokens,
            oauth_authorization_codes,
            oauth_client_redirect_uris,
            oauth_clients,
            member_roles,
            organization_invites,
            organization_members,
            sessions,
            magic_links,
            external_identities,
            user_emails,
            organizations,
            users,
            audit_logs,
            system_settings
        CASCADE
        "#,
    )
    .execute(pool)
    .await?;

    // ── RBAC baseline (wiped by truncate — must reseed) ───────────────────────
    seed_rbac_baseline(pool).await?;

    let identity_repo = IdentityRepository::new(pool.clone());
    let org_repo = OrganizationRepository::new(pool.clone());

    // ── Create users ──────────────────────────────────────────────────────────
    let owner_id   = ensure_user(pool, &identity_repo, TEST_OWNER_EMAIL,   TEST_OWNER_NAME).await?;
    let admin_id   = ensure_user(pool, &identity_repo, TEST_ADMIN_EMAIL,   TEST_ADMIN_NAME).await?;
    let toffee_id  = ensure_user(pool, &identity_repo, TEST_TOFFEE_EMAIL,  TEST_TOFFEE_NAME).await?;
    let tenant_id  = ensure_user(pool, &identity_repo, TEST_TENANT_EMAIL,  TEST_TENANT_NAME).await?;

    let truffle_id = ensure_user(pool, &identity_repo, TEST_ROOCHOCO_TRUFFLE_EMAIL, TEST_ROOCHOCO_TRUFFLE_NAME).await?;
    let praline_id = ensure_user(pool, &identity_repo, TEST_ROOCHOCO_PRALINE_EMAIL, TEST_ROOCHOCO_PRALINE_NAME).await?;
    let ganache_id = ensure_user(pool, &identity_repo, TEST_ROOCHOCO_GANACHE_EMAIL, TEST_ROOCHOCO_GANACHE_NAME).await?;

    let peppermint_id = ensure_user(pool, &identity_repo, TEST_MINTMALLOW_ADMIN_1_EMAIL, TEST_MINTMALLOW_ADMIN_1_NAME).await?;
    let spearmint_id  = ensure_user(pool, &identity_repo, TEST_MINTMALLOW_ADMIN_2_EMAIL, TEST_MINTMALLOW_ADMIN_2_NAME).await?;
    let lulu_id       = ensure_user(pool, &identity_repo, TEST_MINTMALLOW_LULU_EMAIL,    TEST_MINTMALLOW_LULU_NAME).await?;

    // ── Platform roles ────────────────────────────────────────────────────────
    sqlx::query("UPDATE users SET is_platform_owner = false WHERE id != $1")
        .bind(owner_id)
        .execute(pool)
        .await?;
    sqlx::query("UPDATE users SET is_platform_owner = true,  is_superuser = true  WHERE id = $1")
        .bind(owner_id)
        .execute(pool)
        .await?;
    sqlx::query("UPDATE users SET is_platform_owner = false, is_superuser = true  WHERE id = $1")
        .bind(admin_id)
        .execute(pool)
        .await?;
    sqlx::query("UPDATE users SET is_platform_owner = false, is_superuser = true  WHERE id = $1")
        .bind(toffee_id)
        .execute(pool)
        .await?;

    // ── Platform org: rooiam-test ─────────────────────────────────────────────
    let platform_org = ensure_org(pool, &org_repo, owner_id, TEST_PLATFORM_ORG_SLUG, "Rooiam Test").await?;
    // Mark as platform org so admin audit-log queries (is_platform_org = true) include its entries
    sqlx::query("UPDATE organizations SET is_platform_org = true WHERE id = $1")
        .bind(platform_org.id)
        .execute(pool)
        .await?;
    ensure_member_with_role(pool, platform_org.id, admin_id,  "admin").await?;
    ensure_member_with_role(pool, platform_org.id, toffee_id, "admin").await?;

    // ── Tenant org: roochoco-test ─────────────────────────────────────────────
    let roochoco_org = ensure_org(pool, &org_repo, tenant_id, TEST_ROOCHOCO_SLUG, "RooChoco Test").await?;
    ensure_member_with_role(pool, roochoco_org.id, truffle_id, "admin").await?;
    ensure_member_with_role(pool, roochoco_org.id, praline_id, "member").await?;
    ensure_member_with_role(pool, roochoco_org.id, ganache_id, "member").await?;

    // ── Tenant org: mintmallow-test (MFA required) ────────────────────────────
    let mintmallow_org = ensure_org(pool, &org_repo, tenant_id, TEST_MINTMALLOW_SLUG, "MintMallow Test").await?;
    ensure_member_with_role(pool, mintmallow_org.id, peppermint_id, "admin").await?;
    ensure_member_with_role(pool, mintmallow_org.id, spearmint_id,  "admin").await?;
    ensure_member_with_role(pool, mintmallow_org.id, lulu_id,       "member").await?;
    // Enable MFA requirement for mintmallow-test (mirrors demo mintmallow)
    sqlx::query("UPDATE organizations SET require_mfa = true WHERE id = $1")
        .bind(mintmallow_org.id)
        .execute(pool)
        .await?;

    // ── Seed OAuth clients for OIDC tests ─────────────────────────────────────
    for (client_id, org_id) in [
        ("test-roochoco-portal-spa",  roochoco_org.id),
        ("test-mintmallow-portal-spa", mintmallow_org.id),
    ] {
        let client_row = sqlx::query(
            r#"INSERT INTO oauth_clients (client_id, client_secret_hash, app_name, app_type, owner_user_id, org_id, is_first_party)
               VALUES ($1, NULL, $2, 'spa', $3, $4, false)
               ON CONFLICT (client_id) DO UPDATE SET app_name = EXCLUDED.app_name, org_id = EXCLUDED.org_id
               RETURNING id"#,
        )
        .bind(client_id)
        .bind(client_id)
        .bind(tenant_id)
        .bind(org_id)
        .fetch_one(pool).await?;

        let oauth_client_id: uuid::Uuid = client_row.get("id");
        for redirect_uri in &[
            "http://localhost:5191/callback",
            "http://localhost:5172/callback",
            "http://localhost:5172/?org=roochoco-test",
            "http://localhost:5172/?org=mintmallow-test",
        ] {
            sqlx::query(
                "INSERT INTO oauth_client_redirect_uris (oauth_client_id, redirect_uri) VALUES ($1, $2) ON CONFLICT DO NOTHING"
            )
            .bind(oauth_client_id).bind(redirect_uri).execute(pool).await?;
        }
    }

    // Mark setup as completed so setup endpoints require platform_owner (not just loopback)
    for (key, val) in [("setup_completed", "true"), ("superuser_email", TEST_OWNER_EMAIL)] {
        sqlx::query(
            "INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2"
        )
        .bind(key).bind(val).execute(pool).await?;
    }

    tracing::info!(
        "Test seed complete: owner={} admin={} tenant={} roochoco={} mintmallow={}",
        TEST_OWNER_EMAIL, TEST_ADMIN_EMAIL, TEST_TENANT_EMAIL,
        TEST_ROOCHOCO_SLUG, TEST_MINTMALLOW_SLUG,
    );

    Ok(())
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async fn seed_rbac_baseline(pool: &PgPool) -> Result<(), anyhow::Error> {
    for (code, description) in [
        ("org:update",        "Can update organization settings"),
        ("org:delete",        "Can delete the organization"),
        ("members:read",      "Can view members"),
        ("members:invite",    "Can invite new members"),
        ("members:remove",    "Can remove members"),
        ("roles:manage",      "Can manage custom roles and assign them"),
        ("branding:manage",   "Can manage workspace branding"),
        ("auth_policy:manage","Can manage workspace sign-in policy"),
        ("activity:read",     "Can view workspace activity"),
    ] {
        sqlx::query(
            "INSERT INTO permissions (code, description) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING",
        )
        .bind(code).bind(description).execute(pool).await?;
    }

    for (id, code, name) in [
        ("00000000-0000-0000-0000-000000000001", "owner",   "Owner"),
        ("00000000-0000-0000-0000-000000000002", "admin",   "Admin"),
        ("00000000-0000-0000-0000-000000000003", "member",  "Member"),
        ("00000000-0000-0000-0000-000000000004", "manager", "Manager"),
        ("00000000-0000-0000-0000-000000000005", "viewer",  "Viewer"),
    ] {
        sqlx::query(
            "INSERT INTO roles (id, code, name, is_system) VALUES ($1::uuid, $2, $3, true) ON CONFLICT (id) DO NOTHING",
        )
        .bind(id).bind(code).bind(name).execute(pool).await?;
    }

    for (role_id, codes) in [
        ("00000000-0000-0000-0000-000000000001", vec!["org:update","org:delete","members:read","members:invite","members:remove","roles:manage","branding:manage","auth_policy:manage","activity:read"]),
        ("00000000-0000-0000-0000-000000000002", vec!["org:update","members:read","members:invite","members:remove","roles:manage","branding:manage","auth_policy:manage","activity:read"]),
        ("00000000-0000-0000-0000-000000000003", vec!["members:read"]),
        ("00000000-0000-0000-0000-000000000004", vec!["members:read","members:invite","activity:read"]),
        ("00000000-0000-0000-0000-000000000005", vec!["members:read","activity:read"]),
    ] {
        for code in codes {
            sqlx::query(
                r#"INSERT INTO role_permissions (role_id, permission_id)
                   SELECT $1::uuid, id FROM permissions WHERE code = $2
                   ON CONFLICT DO NOTHING"#,
            )
            .bind(role_id).bind(code).execute(pool).await?;
        }
    }

    Ok(())
}

async fn ensure_user(
    pool: &PgPool,
    identity_repo: &IdentityRepository,
    email: &str,
    display_name: &str,
) -> Result<Uuid, anyhow::Error> {
    let user_id = match identity_repo.get_user_id_by_email(email).await? {
        Some(id) => id,
        None => identity_repo.create_user_with_email(email).await?,
    };
    let _ = identity_repo
        .update_user_profile(user_id, Some(display_name.to_string()), None)
        .await;
    // Always reset to active — tests may have suspended them
    let _ = sqlx::query("UPDATE users SET status = 'active' WHERE id = $1")
        .bind(user_id)
        .execute(pool)
        .await;
    Ok(user_id)
}

async fn ensure_org(
    _pool: &PgPool,
    org_repo: &OrganizationRepository,
    owner_id: Uuid,
    slug: &str,
    name: &str,
) -> Result<crate::modules::organization::models::Organization, anyhow::Error> {
    match org_repo.get_organization_by_slug(slug).await? {
        Some(org) => Ok(org),
        None => Ok(org_repo.create_organization(owner_id, name, slug).await?),
    }
}

async fn ensure_member_with_role(
    pool: &PgPool,
    org_id: Uuid,
    user_id: Uuid,
    role_code: &str,
) -> Result<(), anyhow::Error> {
    // Upsert membership
    let member_id: Uuid = if let Some(row) = sqlx::query(
        "SELECT id FROM organization_members WHERE organization_id = $1 AND user_id = $2",
    )
    .bind(org_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    {
        row.get("id")
    } else {
        sqlx::query(
            "INSERT INTO organization_members (organization_id, user_id, status) VALUES ($1, $2, 'active') RETURNING id",
        )
        .bind(org_id)
        .bind(user_id)
        .fetch_one(pool)
        .await?
        .get("id")
    };

    // Ensure member is active
    sqlx::query("UPDATE organization_members SET status = 'active' WHERE id = $1")
        .bind(member_id)
        .execute(pool)
        .await?;

    // Find the role by code — prefer org-specific role, fall back to system role (org_id IS NULL)
    let role_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM roles WHERE (organization_id = $1 OR organization_id IS NULL) AND code = $2 ORDER BY organization_id NULLS LAST LIMIT 1",
    )
    .bind(org_id)
    .bind(role_code)
    .fetch_optional(pool)
    .await?;

    if let Some(role_id) = role_id {
        sqlx::query(
            "INSERT INTO member_roles (member_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        )
        .bind(member_id)
        .bind(role_id)
        .execute(pool)
        .await?;
    }

    Ok(())
}

/// Built-in ephemeral test identities.
/// Used by `POST /v1/test/login` when no email is specified,
/// and as the suggested identities in test scripts.
///
/// Format: (email, display_name, default_org_slug)
pub const TEST_IDENTITIES: &[(&str, &str, &str)] = &[
    ("pixel@neoncat.test",      "Pixel",   "neoncat"),
    ("boba@sweetdrop.test",     "Boba",    "sweetdrop"),
    ("lumi@starjelly.test",     "Lumi",    "starjelly"),
    ("coco@fizzpop.test",       "Coco",    "fizzpop"),
    ("nova@moonpetal.test",     "Nova",    "moonpetal"),
    ("zara@cloudberry.test",    "Zara",    "cloudberry"),
    ("kiki@tinybubble.test",    "Kiki",    "tinybubble"),
    ("luna@pastelwave.test",    "Luna",    "pastelwave"),
    ("remy@sugarbloom.test",    "Remy",    "sugarbloom"),
    ("ivy@dewdrop.test",        "Ivy",     "dewdrop"),
];
