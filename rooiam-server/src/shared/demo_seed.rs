use sqlx::{PgPool, Row};
use uuid::Uuid;

use crate::modules::identity::repository::IdentityRepository;
use crate::modules::organization::models::Organization;
use crate::modules::organization::repository::OrganizationRepository;

const DEMO_OWNER_EMAIL: &str = "owner@rooiam.demo";
const DEMO_OWNER_NAME: &str = "Roo Owner";
const DEMO_OWNER_AVATAR_URL: &str = "/assets/demo/rooiam-avatar1.png";
const DEMO_ADMIN_EMAIL: &str = "admin@rooiam.demo";
const DEMO_ADMIN_NAME: &str = "Roo Admin";
const DEMO_ADMIN_AVATAR_URL: &str = "/assets/demo/rooiam-avatar2.png";
const DEMO_TENANT_EMAIL: &str = "rooroo@sweetfactory.demo";
const DEMO_TENANT_NAME: &str = "rooroo";
const DEMO_TENANT_AVATAR_URL: &str = "/assets/demo/rooiam-avatar3.png";
const DEMO_ROOCHOCO_CUSTOMER_EMAIL: &str = "minmin@lovechocolate.user";
const DEMO_ROOCHOCO_CUSTOMER_NAME: &str = "Minmin Customer";
const DEMO_ROOCHOCO_CUSTOMER_AVATAR_URL: &str = "/assets/demo/rooiam-avatar4.png";
const DEMO_MINTMALLOW_CUSTOMER_EMAIL: &str = "lulu@softmallow.user";
const DEMO_MINTMALLOW_CUSTOMER_NAME: &str = "Lulu Customer";
const DEMO_MINTMALLOW_CUSTOMER_AVATAR_URL: &str = "/assets/demo/rooiam-avatar5.png";
const DEMO_MELONHONEYTOAST_CUSTOMER_EMAIL: &str = "sunny@toastgarden.user";
const DEMO_MELONHONEYTOAST_CUSTOMER_NAME: &str = "Sunny Customer";
const DEMO_MELONHONEYTOAST_CUSTOMER_AVATAR_URL: &str = "/assets/demo/rooiam-avatar4.png";
const DEMO_BERRYBURGER_CUSTOMER_EMAIL: &str = "poppy@jamdiner.user";
const DEMO_BERRYBURGER_CUSTOMER_NAME: &str = "Poppy Customer";
const DEMO_BERRYBURGER_CUSTOMER_AVATAR_URL: &str = "/assets/demo/rooiam-avatar5.png";
const DEMO_MOOPIZZA_CUSTOMER_EMAIL: &str = "mozza@cheesetown.user";
const DEMO_MOOPIZZA_CUSTOMER_NAME: &str = "Mozza Customer";
const DEMO_MOOPIZZA_CUSTOMER_AVATAR_URL: &str = "/assets/demo/rooiam-avatar4.png";
const DEMO_MOOMOO_EMAIL: &str = "moomoo@whitebakery.demo";
const DEMO_MOOMOO_NAME: &str = "Moo Moo";
const DEMO_MOOMOO_AVATAR_URL: &str = "/assets/demo/rooiam-avatar6.png";
const DEMO_ROOCHOCO_ADMIN_1_EMAIL: &str = "fondue@honeychoco.demo";
const DEMO_ROOCHOCO_ADMIN_1_NAME: &str = "Fondue";
const DEMO_ROOCHOCO_ADMIN_1_AVATAR_URL: &str = "/assets/demo/rooiam-avatar4.png";
const DEMO_ROOCHOCO_ADMIN_2_EMAIL: &str = "bonbon@waferchoco.demo";
const DEMO_ROOCHOCO_ADMIN_2_NAME: &str = "Bonbon";
const DEMO_ROOCHOCO_ADMIN_2_AVATAR_URL: &str = "/assets/demo/rooiam-avatar5.png";
const DEMO_MINTMALLOW_ADMIN_1_EMAIL: &str = "peppermint@mintmallow.demo";
const DEMO_MINTMALLOW_ADMIN_1_NAME: &str = "Peppermint";
const DEMO_MINTMALLOW_ADMIN_1_AVATAR_URL: &str = "/assets/demo/rooiam-avatar4.png";
const DEMO_MINTMALLOW_ADMIN_2_EMAIL: &str = "spearmint@mintmallow.demo";
const DEMO_MINTMALLOW_ADMIN_2_NAME: &str = "Spearmint";
const DEMO_MINTMALLOW_ADMIN_2_AVATAR_URL: &str = "/assets/demo/rooiam-avatar5.png";

const DEMO_TOFFEE_EMAIL: &str = "toffee@rooiam.demo";
const DEMO_TOFFEE_NAME: &str = "Toffee";
const DEMO_TOFFEE_AVATAR_URL: &str = "/assets/demo/rooiam-avatar2.png";

const DEMO_ROOCHOCO_TRUFFLE_EMAIL: &str = "truffle@roochoco.demo";
const DEMO_ROOCHOCO_TRUFFLE_NAME: &str = "Truffle";
const DEMO_ROOCHOCO_TRUFFLE_AVATAR_URL: &str = "/assets/demo/rooiam-avatar3.png";

const DEMO_ROOCHOCO_PRALINE_EMAIL: &str = "praline@roochoco.demo";
const DEMO_ROOCHOCO_PRALINE_NAME: &str = "Praline";
const DEMO_ROOCHOCO_PRALINE_AVATAR_URL: &str = "/assets/demo/rooiam-avatar4.png";

const DEMO_ROOCHOCO_GANACHE_EMAIL: &str = "ganache@roochoco.demo";
const DEMO_ROOCHOCO_GANACHE_NAME: &str = "Ganache";
const DEMO_ROOCHOCO_GANACHE_AVATAR_URL: &str = "/assets/demo/rooiam-avatar5.png";

struct DemoCompany {
    name: &'static str,
    slug: &'static str,
    login_display_name: &'static str,
    login_title: &'static str,
    login_subtitle: &'static str,
    icon_url: &'static str,
    login_logo_url: &'static str,
    // Workspace icon only supports container/shape. There is no separate stored icon size field.
    icon_container: &'static str,
    // Login logo supports both container/shape and size.
    login_logo_container: &'static str,
    login_logo_size: &'static str,
    brand_color: &'static str,
    show_login_logo: bool,
    show_login_title: bool,
    show_login_subtitle: bool,
    show_powered_by: bool,
    widget_radius: &'static str,
    widget_shadow: &'static str,
    login_method_order: &'static [&'static str],
    allow_magic_link: bool,
    allow_google: bool,
    allow_microsoft: bool,
    allow_passkey: bool,
    require_mfa: bool,
}

enum RedirectTarget {
    Callback,
    AdminLogin,
    AdminVerify,
}

struct DemoApp {
    app_name: &'static str,
    app_type: &'static str,
    owner_email: &'static str,
    org_slug: Option<&'static str>,
    redirect_targets: &'static [RedirectTarget],
}

fn build_redirect_uri(base_url: &str, target: &RedirectTarget) -> String {
    let base = base_url.trim_end_matches('/');
    match target {
        RedirectTarget::Callback => format!("{}/callback", base),
        RedirectTarget::AdminLogin => format!("{}/login", base),
        RedirectTarget::AdminVerify => format!("{}/verify", base),
    }
}

fn extract_origin(url: &str) -> Option<String> {
    if let Some(without_scheme) = url.strip_prefix("http://").or_else(|| url.strip_prefix("https://")) {
        let host_port = without_scheme.split('/').next().unwrap_or("");
        let scheme = if url.starts_with("https://") { "https" } else { "http" };
        Some(format!("{}://{}", scheme, host_port))
    } else {
        None
    }
}

const DEMO_COMPANIES: [DemoCompany; 5] = [
    DemoCompany {
        name: "RooChoco",
        slug: "roochoco",
        login_display_name: "RooChoco",
        login_title: "Welcome to RooChoco",
        login_subtitle: "Sign in to access your company portal.",
        icon_url: "/assets/demo/rooiam-logo-roochoco.png",
        login_logo_url: "/assets/demo/rooiam-logo-roochoco.png",
        icon_container: "square",
        login_logo_container: "square",
        login_logo_size: "medium",
        brand_color: "#c96b8a",
        show_login_logo: true,
        show_login_title: true,
        show_login_subtitle: true,
        show_powered_by: true,
        widget_radius: "rounded",
        widget_shadow: "soft",
        login_method_order: &["magic_link", "passkey", "google"],
        allow_magic_link: true,
        allow_google: true,
        allow_microsoft: false,
        allow_passkey: true,
        require_mfa: false,
    },
    DemoCompany {
        name: "MintMallow",
        slug: "mintmallow",
        login_display_name: "MintMallow",
        login_title: "MintMallow Login",
        login_subtitle: "",
        icon_url: "/assets/demo/rooiam-logo-mintmallow.png",
        login_logo_url: "/assets/demo/rooiam-logo-mintmallow-wide.png",
        icon_container: "circle",
        login_logo_container: "wide",
        login_logo_size: "large",
        brand_color: "#5bbda6",
        show_login_logo: true,
        show_login_title: true,
        show_login_subtitle: false,
        show_powered_by: true,
        widget_radius: "pill",
        widget_shadow: "soft",
        login_method_order: &["magic_link", "microsoft", "google"],
        allow_magic_link: true,
        allow_google: true,
        allow_microsoft: true,
        allow_passkey: false,
        require_mfa: false,
    },
    // ── moomoo@whitebakery.demo workspaces ───────────────────────────────────
    DemoCompany {
        name: "MelonHoneyToast",
        slug: "melonhoneytoast",
        login_display_name: "MelonHoneyToast",
        login_title: "Welcome to MelonHoneyToast",
        login_subtitle: "Sign in to your workspace.",
        icon_url: "/assets/demo/rooiam-melonhoneytoast.jpg",
        login_logo_url: "/assets/demo/rooiam-melonhoneytoast.jpg",
        icon_container: "square",
        login_logo_container: "square",
        login_logo_size: "medium",
        brand_color: "#f5a623",
        show_login_logo: true,
        show_login_title: true,
        show_login_subtitle: true,
        show_powered_by: true,
        widget_radius: "rounded",
        widget_shadow: "soft",
        login_method_order: &["magic_link", "passkey", "google"],
        allow_magic_link: true,
        allow_google: true,
        allow_microsoft: false,
        allow_passkey: true,
        require_mfa: false,
    },
    DemoCompany {
        name: "BerryBurger",
        slug: "berryburger",
        login_display_name: "BerryBurger",
        login_title: "BerryBurger",
        login_subtitle: "Sign in to continue.",
        icon_url: "/assets/demo/rooiam-berryburger.jpg",
        login_logo_url: "/assets/demo/rooiam-berryburger.jpg",
        icon_container: "circle",
        login_logo_container: "circle",
        login_logo_size: "medium",
        brand_color: "#c0392b",
        show_login_logo: true,
        show_login_title: true,
        show_login_subtitle: true,
        show_powered_by: false,
        widget_radius: "sharp",
        widget_shadow: "none",
        login_method_order: &["magic_link", "google"],
        allow_magic_link: true,
        allow_google: true,
        allow_microsoft: false,
        allow_passkey: false,
        require_mfa: false,
    },
    DemoCompany {
        name: "MooPizza",
        slug: "moopizza",
        login_display_name: "MooPizza",
        login_title: "Welcome to MooPizza",
        login_subtitle: "",
        icon_url: "/assets/demo/rooiam-moopizza.jpg",
        login_logo_url: "/assets/demo/rooiam-moopizza.jpg",
        icon_container: "circle",
        login_logo_container: "wide",
        login_logo_size: "large",
        brand_color: "#8e44ad",
        show_login_logo: true,
        show_login_title: true,
        show_login_subtitle: false,
        show_powered_by: true,
        widget_radius: "pill",
        widget_shadow: "soft",
        login_method_order: &["passkey", "magic_link"],
        allow_magic_link: true,
        allow_google: false,
        allow_microsoft: false,
        allow_passkey: true,
        require_mfa: false,
    },
];

const DEMO_APPS: [DemoApp; 6] = [
    DemoApp {
        app_name: "RooChoco Portal",
        app_type: "spa",
        owner_email: DEMO_TENANT_EMAIL,
        org_slug: Some("roochoco"),
        redirect_targets: &[
            RedirectTarget::Callback,
        ],
    },
    DemoApp {
        app_name: "MintMallow Portal",
        app_type: "spa",
        owner_email: DEMO_TENANT_EMAIL,
        org_slug: Some("mintmallow"),
        redirect_targets: &[
            RedirectTarget::Callback,
        ],
    },
    DemoApp {
        app_name: "Rooiam Admin Console",
        app_type: "spa",
        owner_email: DEMO_ADMIN_EMAIL,
        org_slug: Some("roochoco"),
        redirect_targets: &[
            RedirectTarget::AdminLogin,
            RedirectTarget::AdminVerify,
        ],
    },
    DemoApp {
        app_name: "MelonHoneyToast Portal",
        app_type: "spa",
        owner_email: DEMO_MOOMOO_EMAIL,
        org_slug: Some("melonhoneytoast"),
        redirect_targets: &[
            RedirectTarget::Callback,
        ],
    },
    DemoApp {
        app_name: "BerryBurger Portal",
        app_type: "spa",
        owner_email: DEMO_MOOMOO_EMAIL,
        org_slug: Some("berryburger"),
        redirect_targets: &[
            RedirectTarget::Callback,
        ],
    },
    DemoApp {
        app_name: "MooPizza Portal",
        app_type: "spa",
        owner_email: DEMO_MOOMOO_EMAIL,
        org_slug: Some("moopizza"),
        redirect_targets: &[
            RedirectTarget::Callback,
        ],
    },
];

/// Returns true when demo seed should run at startup (demo mode only).
/// Also true if legacy `ROOIAM_ENABLE_DEMO_SEED=true` is set.
pub fn demo_seed_enabled() -> bool {
    crate::bootstrap::config::ServerMode::from_env().seed_on_startup()
}

/// Returns true when demo routes (e.g. `/v1/demo/login`) are active.
/// True in both demo mode and test mode.
pub fn demo_routes_enabled() -> bool {
    crate::bootstrap::config::ServerMode::from_env().demo_routes_enabled()
}


pub fn demo_reset_enabled() -> bool {
    matches!(
        std::env::var("ROOIAM_RESET_DEMO_DATA")
            .unwrap_or_default()
            .trim()
            .to_ascii_lowercase()
            .as_str(),
        "1" | "true" | "yes" | "on"
    )
}

pub fn demo_tenant_email() -> &'static str {
    DEMO_TENANT_EMAIL
}

pub fn demo_admin_email() -> &'static str {
    DEMO_ADMIN_EMAIL
}

pub fn demo_owner_email() -> &'static str {
    DEMO_OWNER_EMAIL
}

pub fn demo_toffee_email() -> &'static str { DEMO_TOFFEE_EMAIL }
pub fn demo_roochoco_truffle_email() -> &'static str { DEMO_ROOCHOCO_TRUFFLE_EMAIL }
pub fn demo_roochoco_praline_email() -> &'static str { DEMO_ROOCHOCO_PRALINE_EMAIL }
pub fn demo_roochoco_ganache_email() -> &'static str { DEMO_ROOCHOCO_GANACHE_EMAIL }

pub fn demo_customer_email_for_org(org_slug: &str) -> Option<&'static str> {
    match org_slug.trim().to_ascii_lowercase().as_str() {
        "roochoco" => Some(DEMO_ROOCHOCO_CUSTOMER_EMAIL),
        "mintmallow" => Some(DEMO_MINTMALLOW_CUSTOMER_EMAIL),
        "melonhoneytoast" => Some(DEMO_MELONHONEYTOAST_CUSTOMER_EMAIL),
        "berryburger" => Some(DEMO_BERRYBURGER_CUSTOMER_EMAIL),
        "moopizza" => Some(DEMO_MOOPIZZA_CUSTOMER_EMAIL),
        _ => None,
    }
}

pub fn demo_end_user_email_for_org(org_slug: &str) -> Option<&'static str> {
    demo_customer_email_for_org(org_slug)
}

/// Returns the default demo email for a login attempt, given the surface and workspace slug.
/// - surface="admin", no workspace → platform admin (admin@rooiam.demo)
/// - surface="admin", with workspace → tenant admin for that org
/// - surface="user" or anything else, with workspace → tenant admin for that org
/// - no surface, no workspace → platform owner (owner@rooiam.demo)
/// This is the single authoritative place for demo email selection. Do not duplicate this logic.
pub fn demo_default_email_for_context(surface: Option<&str>, workspace_slug: Option<&str>) -> &'static str {
    match (surface, workspace_slug.map(str::trim).filter(|s| !s.is_empty())) {
        (Some("admin"), None) => DEMO_ADMIN_EMAIL,
        (_, Some(slug)) => demo_tenant_admin_email_for_org(slug),
        (_, None) => DEMO_OWNER_EMAIL,
    }
}

/// Returns the tenant-admin (portal owner) email for a given org slug.
/// Use this when there is no end-user customer — i.e. for the portal sign-in demo hint.
pub fn demo_tenant_admin_email_for_org(org_slug: &str) -> &'static str {
    match org_slug.trim().to_ascii_lowercase().as_str() {
        "melonhoneytoast" | "berryburger" | "moopizza" => DEMO_MOOMOO_EMAIL,
        _ => DEMO_TENANT_EMAIL,
    }
}

pub fn is_seeded_demo_org_slug(slug: &str) -> bool {
    matches!(
        slug.trim().to_ascii_lowercase().as_str(),
        "roochoco" | "mintmallow" | "melonhoneytoast" | "berryburger" | "moopizza"
    )
}

pub fn seeded_demo_org_slugs() -> &'static [&'static str] {
    &["roochoco", "mintmallow", "melonhoneytoast", "berryburger", "moopizza"]
}

pub fn seeded_demo_emails() -> &'static [&'static str] {
    &[
        DEMO_OWNER_EMAIL,
        DEMO_ADMIN_EMAIL,
        DEMO_TENANT_EMAIL,
        DEMO_ROOCHOCO_CUSTOMER_EMAIL,
        DEMO_MINTMALLOW_CUSTOMER_EMAIL,
        DEMO_MELONHONEYTOAST_CUSTOMER_EMAIL,
        DEMO_BERRYBURGER_CUSTOMER_EMAIL,
        DEMO_MOOPIZZA_CUSTOMER_EMAIL,
        DEMO_MOOMOO_EMAIL,
        DEMO_ROOCHOCO_ADMIN_1_EMAIL,
        DEMO_ROOCHOCO_ADMIN_2_EMAIL,
        DEMO_MINTMALLOW_ADMIN_1_EMAIL,
        DEMO_MINTMALLOW_ADMIN_2_EMAIL,
        DEMO_TOFFEE_EMAIL,
        DEMO_ROOCHOCO_TRUFFLE_EMAIL,
        DEMO_ROOCHOCO_PRALINE_EMAIL,
        DEMO_ROOCHOCO_GANACHE_EMAIL,
    ]
}

pub fn is_seeded_demo_email(email: &str) -> bool {
    matches!(
        email.trim().to_ascii_lowercase().as_str(),
        DEMO_OWNER_EMAIL
            | DEMO_ADMIN_EMAIL
            | DEMO_TENANT_EMAIL
            | DEMO_ROOCHOCO_CUSTOMER_EMAIL
            | DEMO_MINTMALLOW_CUSTOMER_EMAIL
            | DEMO_MELONHONEYTOAST_CUSTOMER_EMAIL
            | DEMO_BERRYBURGER_CUSTOMER_EMAIL
            | DEMO_MOOPIZZA_CUSTOMER_EMAIL
            | DEMO_MOOMOO_EMAIL
            | DEMO_ROOCHOCO_ADMIN_1_EMAIL
            | DEMO_ROOCHOCO_ADMIN_2_EMAIL
            | DEMO_MINTMALLOW_ADMIN_1_EMAIL
            | DEMO_MINTMALLOW_ADMIN_2_EMAIL
            | DEMO_TOFFEE_EMAIL
            | DEMO_ROOCHOCO_TRUFFLE_EMAIL
            | DEMO_ROOCHOCO_PRALINE_EMAIL
            | DEMO_ROOCHOCO_GANACHE_EMAIL
    )
}

async fn ensure_user(
    identity_repo: &IdentityRepository,
    pool: &PgPool,
    email: &str,
    display_name: &str,
    avatar_url: &str,
) -> Result<Uuid, anyhow::Error> {
    let user_id = match identity_repo.get_user_id_by_email(email).await? {
        Some(existing) => existing,
        None => identity_repo.create_user_with_email(email).await?,
    };

    let _ = identity_repo
        .update_user_profile(
            user_id,
            Some(display_name.to_string()),
            Some(avatar_url.to_string()),
        )
        .await;

    // Always reset demo users to active — tests may have suspended them
    let _ = sqlx::query("UPDATE users SET status = 'active' WHERE id = $1")
        .bind(user_id)
        .execute(pool)
        .await;

    Ok(user_id)
}

async fn ensure_owner_membership(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), anyhow::Error> {
    ensure_membership_with_role(pool, organization_id, user_id, "owner").await
}

async fn ensure_member_membership(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), anyhow::Error> {
    ensure_membership_with_role(pool, organization_id, user_id, "member").await
}

async fn ensure_admin_membership(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), anyhow::Error> {
    ensure_membership_with_role(pool, organization_id, user_id, "admin").await
}

async fn ensure_membership_with_role(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
    role_code: &str,
) -> Result<(), anyhow::Error> {
    let member_id: Uuid = if let Some(existing_member) = sqlx::query(
        "SELECT id FROM organization_members WHERE organization_id = $1 AND user_id = $2",
    )
    .bind(organization_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    {
        existing_member.get("id")
    } else {
        sqlx::query(
            "INSERT INTO organization_members (organization_id, user_id, status) VALUES ($1, $2, 'active') RETURNING id",
        )
        .bind(organization_id)
        .bind(user_id)
        .fetch_one(pool)
        .await?
        .get("id")
    };

    sqlx::query(
        r#"
        INSERT INTO member_roles (member_id, role_id)
        SELECT $1, id
        FROM roles
        WHERE code = $2 AND is_system = true
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(member_id)
    .bind(role_code)
    .execute(pool)
    .await?;

    Ok(())
}

async fn ensure_demo_rbac_baseline(pool: &PgPool) -> Result<(), anyhow::Error> {
    for (code, description) in [
        ("org:update", "Can update organization settings"),
        ("org:delete", "Can delete the organization"),
        ("members:read", "Can view members"),
        ("members:invite", "Can invite new members"),
        ("members:remove", "Can remove members"),
        ("roles:manage", "Can manage custom roles and assign them"),
        ("branding:manage", "Can manage workspace branding"),
        ("auth_policy:manage", "Can manage workspace sign-in policy"),
        ("activity:read", "Can view workspace activity"),
    ] {
        sqlx::query(
            r#"
            INSERT INTO permissions (code, description)
            VALUES ($1, $2)
            ON CONFLICT (code) DO NOTHING
            "#,
        )
        .bind(code)
        .bind(description)
        .execute(pool)
        .await?;
    }

    for (id, code, name) in [
        ("00000000-0000-0000-0000-000000000001", "owner", "Owner"),
        ("00000000-0000-0000-0000-000000000002", "admin", "Admin"),
        ("00000000-0000-0000-0000-000000000003", "member", "Member"),
        ("00000000-0000-0000-0000-000000000004", "manager", "Manager"),
        ("00000000-0000-0000-0000-000000000005", "viewer", "Viewer"),
    ] {
        sqlx::query(
            r#"
            INSERT INTO roles (id, code, name, is_system)
            VALUES ($1::uuid, $2, $3, true)
            ON CONFLICT (id) DO NOTHING
            "#,
        )
        .bind(id)
        .bind(code)
        .bind(name)
        .execute(pool)
        .await?;
    }

    for (role_id, permission_codes) in [
        (
            "00000000-0000-0000-0000-000000000001",
            vec![
                "org:update",
                "org:delete",
                "members:read",
                "members:invite",
                "members:remove",
                "roles:manage",
                "branding:manage",
                "auth_policy:manage",
                "activity:read",
            ],
        ),
        (
            "00000000-0000-0000-0000-000000000002",
            vec![
                "org:update",
                "members:read",
                "members:invite",
                "members:remove",
                "roles:manage",
                "branding:manage",
                "auth_policy:manage",
                "activity:read",
            ],
        ),
        (
            "00000000-0000-0000-0000-000000000003",
            vec!["members:read"],
        ),
        (
            "00000000-0000-0000-0000-000000000004",
            vec!["members:read", "members:invite", "activity:read"],
        ),
        (
            "00000000-0000-0000-0000-000000000005",
            vec!["members:read", "activity:read"],
        ),
    ] {
        for permission_code in permission_codes {
            sqlx::query(
                r#"
                INSERT INTO role_permissions (role_id, permission_id)
                SELECT $1::uuid, id
                FROM permissions
                WHERE code = $2
                ON CONFLICT DO NOTHING
                "#,
            )
            .bind(role_id)
            .bind(permission_code)
            .execute(pool)
            .await?;
        }
    }

    Ok(())
}

async fn ensure_company(
    pool: &PgPool,
    organization_repo: &OrganizationRepository,
    owner_user_id: Uuid,
    company: &DemoCompany,
) -> Result<Organization, anyhow::Error> {
    let organization = match organization_repo.get_organization_by_slug(company.slug).await? {
        Some(org) => org,
        None => organization_repo
            .create_organization(owner_user_id, company.name, company.slug)
            .await?,
    };

    ensure_owner_membership(pool, organization.id, owner_user_id).await?;

    sqlx::query(
        r#"
        UPDATE organizations
        SET
            name = $2,
            login_display_name = $3,
            login_title = $4,
            login_subtitle = $5,
            icon_url = $6,
            login_logo_url = $7,
            brand_color = $8,
            show_login_logo = $9,
            show_login_title = $10,
            show_login_subtitle = $11,
            show_powered_by = $12,
            widget_radius = $13,
            widget_shadow = $14,
            icon_container = $15,
            login_logo_container = $16,
            login_logo_size = $17,
            login_method_order = $18,
            allow_magic_link = $19,
            allow_google = $20,
            allow_microsoft = $21,
            allow_passkey = $22,
            require_mfa = $23,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(organization.id)
    .bind(company.name)
    .bind(company.login_display_name)
    .bind(company.login_title)
    .bind(company.login_subtitle)
    .bind(company.icon_url)
    .bind(company.login_logo_url)
    .bind(company.brand_color)
    .bind(company.show_login_logo)
    .bind(company.show_login_title)
    .bind(company.show_login_subtitle)
    .bind(company.show_powered_by)
    .bind(company.widget_radius)
    .bind(company.widget_shadow)
    .bind(company.icon_container)
    .bind(company.login_logo_container)
    .bind(company.login_logo_size)
    .bind(company.login_method_order)
    .bind(company.allow_magic_link)
    .bind(company.allow_google)
    .bind(company.allow_microsoft)
    .bind(company.allow_passkey)
    .bind(company.require_mfa)
    .execute(pool)
    .await?;

    Ok(organization)
}

async fn upsert_system_setting(
    pool: &PgPool,
    key: &str,
    value: &str,
) -> Result<(), anyhow::Error> {
    sqlx::query(
        r#"
        INSERT INTO system_settings (key, value)
        VALUES ($1, $2)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        "#,
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await?;

    Ok(())
}

async fn ensure_demo_app(
    pool: &PgPool,
    app: &DemoApp,
    owner_user_id: Uuid,
    org_id: Option<Uuid>,
) -> Result<(), anyhow::Error> {
    let client_id = format!(
        "demo-{}-{}",
        app.app_name.to_ascii_lowercase().replace([' ', '.'], "-"),
        app.app_type
    );

    let client_row = sqlx::query(
        r#"
        INSERT INTO oauth_clients (client_id, client_secret_hash, app_name, app_type, owner_user_id, org_id, is_first_party)
        VALUES ($1, NULL, $2, $3, $4, $5, false)
        ON CONFLICT (client_id) DO UPDATE
        SET app_name = EXCLUDED.app_name,
            app_type = EXCLUDED.app_type,
            owner_user_id = EXCLUDED.owner_user_id,
            org_id = EXCLUDED.org_id,
            is_first_party = EXCLUDED.is_first_party
        RETURNING id
        "#,
    )
    .bind(&client_id)
    .bind(app.app_name)
    .bind(app.app_type)
    .bind(owner_user_id)
    .bind(org_id)
    .fetch_one(pool)
    .await?;

    let oauth_client_id: Uuid = client_row.get("id");

    // Build redirect URIs from config - no hardcoded localhost.
    // ROOIAM_ENDUSER_URL is the downstream demo customer app (candycloud-web).
    // ROOIAM_ADMIN_URL is the demo admin console.
    // ROOIAM_APP_URL is rooiam-app tenant portal and must not be used for downstream app callbacks.
    let enduser_url = std::env::var("ROOIAM_ENDUSER_URL")
        .map_err(|_| anyhow::anyhow!("ROOIAM_ENDUSER_URL is required in demo mode for downstream demo app callbacks"))?;
    let admin_url = std::env::var("ROOIAM_ADMIN_URL")
        .map_err(|_| anyhow::anyhow!("ROOIAM_ADMIN_URL is required in demo mode for admin console callbacks"))?;

    let mut all_uris: Vec<String> = Vec::new();
    let mut embed_origins: Vec<String> = Vec::new();

    for target in app.redirect_targets {
        let uri = match target {
            RedirectTarget::Callback => {
                if !enduser_url.trim().is_empty() {
                    build_redirect_uri(&enduser_url, target)
                } else {
                    return Err(anyhow::anyhow!("ROOIAM_ENDUSER_URL cannot be empty in demo mode"));
                }
            }
            RedirectTarget::AdminLogin | RedirectTarget::AdminVerify => {
                if !admin_url.trim().is_empty() {
                    build_redirect_uri(&admin_url, target)
                } else {
                    return Err(anyhow::anyhow!("ROOIAM_ADMIN_URL cannot be empty in demo mode"));
                }
            }
        };

        if !all_uris.contains(&uri) {
            all_uris.push(uri.clone());
        }

        // Extract origin from URI
        if let Some(origin) = extract_origin(&uri) {
            if !embed_origins.contains(&origin) {
                embed_origins.push(origin);
            }
        }
    }

    // Replace redirect URIs cleanly so stale URLs from old deployments are removed.
    sqlx::query("DELETE FROM oauth_client_redirect_uris WHERE oauth_client_id = $1")
        .bind(oauth_client_id)
        .execute(pool)
        .await?;
    for redirect_uri in &all_uris {
        sqlx::query(
            "INSERT INTO oauth_client_redirect_uris (oauth_client_id, redirect_uri) VALUES ($1, $2) ON CONFLICT DO NOTHING"
        )
        .bind(oauth_client_id)
        .bind(redirect_uri)
        .execute(pool)
        .await?;
    }

    // Replace allowed embed origins cleanly for the same reason.
    sqlx::query("DELETE FROM oauth_client_allowed_embed_origins WHERE oauth_client_id = $1")
        .bind(oauth_client_id)
        .execute(pool)
        .await?;
    // Extract unique origins (scheme+host+port) from all_uris.
    let mut embed_origins: Vec<String> = Vec::new();
    for uri in &all_uris {
        if let Some(without_scheme) = uri.strip_prefix("http://").or_else(|| uri.strip_prefix("https://")) {
            let host_port = without_scheme.split('/').next().unwrap_or("");
            let scheme = if uri.starts_with("https://") { "https" } else { "http" };
            let origin = format!("{}://{}", scheme, host_port);
            if !embed_origins.contains(&origin) {
                embed_origins.push(origin);
            }
        }
    }
    for origin in &embed_origins {
        sqlx::query(
            "INSERT INTO oauth_client_allowed_embed_origins (oauth_client_id, origin) VALUES ($1, $2) ON CONFLICT DO NOTHING"
        )
        .bind(oauth_client_id)
        .bind(origin)
        .execute(pool)
        .await?;
    }

    Ok(())
}

async fn reset_demo_runtime_state(pool: &PgPool) -> Result<(), anyhow::Error> {
    // Demo mode should be deterministic: wipe operator-created/runtime data, then seed
    // only the predefined demo entities back in.
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

    Ok(())
}

pub async fn reconcile_superuser_for_mode(pool: &PgPool) -> Result<(), anyhow::Error> {
    if !demo_seed_enabled() {
        // Leaving demo mode: strip platform flags from demo-only accounts.
        sqlx::query(
            r#"
            UPDATE users
            SET is_platform_owner = false, is_superuser = false
            WHERE id IN (
                SELECT u.id FROM users u
                JOIN user_emails e ON e.user_id = u.id AND e.is_primary = true
                WHERE e.email IN ($1, $2)
            )
            "#,
        )
        .bind(DEMO_OWNER_EMAIL)
        .bind(DEMO_ADMIN_EMAIL)
        .execute(pool)
        .await?;

        sqlx::query(
            r#"
            DELETE FROM system_settings
            WHERE key = 'superuser_email' AND value = $1
            "#,
        )
        .bind(DEMO_OWNER_EMAIL)
        .execute(pool)
        .await?;
    }

    Ok(())
}

async fn seed_demo_audit_logs(
    pool: &PgPool,
    demo_org_ids: &[(String, Uuid)],
    roochoco_customer_id: Uuid,
    mintmallow_customer_id: Uuid,
    tenant_admin_id: Uuid,
) -> Result<(), anyhow::Error> {
    let find_org = |slug: &str| demo_org_ids.iter().find(|(s, _)| s == slug).map(|(_, id)| *id);

    let roochoco_id = match find_org("roochoco") { Some(id) => id, None => return Ok(()) };
    let mintmallow_id = match find_org("mintmallow") { Some(id) => id, None => return Ok(()) };

    sqlx::query(
        "DELETE FROM audit_logs WHERE organization_id = ANY($1) AND metadata->>'demo_mode' = 'true'"
    )
    .bind(&[roochoco_id, mintmallow_id] as &[Uuid])
    .execute(pool)
    .await?;

    struct DemoLogEntry {
        actor_user_id: Option<Uuid>,
        organization_id: Uuid,
        action: &'static str,
        target_type: &'static str,
        target_id: Option<String>,
        ip: Option<&'static str>,
        metadata: serde_json::Value,
        offset_hours: i64,
    }

    let entries: Vec<DemoLogEntry> = vec![
        DemoLogEntry {
            actor_user_id: Some(roochoco_customer_id),
            organization_id: roochoco_id,
            action: "auth.login.success",
            target_type: "user",
            target_id: Some(roochoco_customer_id.to_string()),
            ip: Some("118.174.55.21"),
            metadata: serde_json::json!({ "method": "magic_link", "app_name": "RooChoco Portal", "workspace_slug": "roochoco", "demo_mode": "true" }),
            offset_hours: 1,
        },
        DemoLogEntry {
            actor_user_id: Some(roochoco_customer_id),
            organization_id: roochoco_id,
            action: "auth.login.success",
            target_type: "user",
            target_id: Some(roochoco_customer_id.to_string()),
            ip: Some("118.174.55.21"),
            metadata: serde_json::json!({ "method": "demo_google", "app_name": "RooChoco Portal", "workspace_slug": "roochoco", "demo_mode": "true" }),
            offset_hours: 5,
        },
        DemoLogEntry {
            actor_user_id: None,
            organization_id: roochoco_id,
            action: "auth.login.failed",
            target_type: "magic_link",
            target_id: None,
            ip: Some("203.150.10.9"),
            metadata: serde_json::json!({ "error": "Token expired or already used", "demo_mode": "true" }),
            offset_hours: 8,
        },
        DemoLogEntry {
            actor_user_id: Some(roochoco_customer_id),
            organization_id: roochoco_id,
            action: "auth.magic_link.requested",
            target_type: "email",
            target_id: Some(DEMO_ROOCHOCO_CUSTOMER_EMAIL.to_string()),
            ip: Some("118.174.55.21"),
            metadata: serde_json::json!({ "surface": "portal", "redirect_uri": "http://localhost:5172/app?org=roochoco", "demo_mode": "true" }),
            offset_hours: 12,
        },
        DemoLogEntry {
            actor_user_id: Some(tenant_admin_id),
            organization_id: roochoco_id,
            action: "auth.login.success",
            target_type: "user",
            target_id: Some(tenant_admin_id.to_string()),
            ip: Some("118.174.55.21"),
            metadata: serde_json::json!({
                "method": "magic_link",
                "app_name": "RooChoco Portal",
                "workspace_slug": "roochoco",
                "demo_mode": "true"
            }),
            offset_hours: 24,
        },
        DemoLogEntry {
            actor_user_id: Some(mintmallow_customer_id),
            organization_id: mintmallow_id,
            action: "auth.login.success",
            target_type: "user",
            target_id: Some(mintmallow_customer_id.to_string()),
            ip: Some("49.49.212.100"),
            metadata: serde_json::json!({ "method": "totp", "app_name": "MintMallow Portal", "workspace_slug": "mintmallow", "demo_mode": "true" }),
            offset_hours: 3,
        },
        DemoLogEntry {
            actor_user_id: Some(mintmallow_customer_id),
            organization_id: mintmallow_id,
            action: "auth.mfa.required",
            target_type: "mfa_method",
            target_id: Some("totp".into()),
            ip: Some("49.49.212.100"),
            metadata: serde_json::json!({ "method": "magic_link", "workspace_slug": "mintmallow", "demo_mode": "true" }),
            offset_hours: 6,
        },
        DemoLogEntry {
            actor_user_id: Some(mintmallow_customer_id),
            organization_id: mintmallow_id,
            action: "auth.login.failed",
            target_type: "magic_link",
            target_id: None,
            ip: Some("95.211.43.77"),
            metadata: serde_json::json!({ "error": "IP address not in allowlist", "demo_mode": "true" }),
            offset_hours: 30,
        },
        DemoLogEntry {
            actor_user_id: None,
            organization_id: mintmallow_id,
            action: "auth.login.suspicious",
            target_type: "ip",
            target_id: Some("95.211.43.77".into()),
            ip: Some("95.211.43.77"),
            metadata: serde_json::json!({ "reason": "repeated_failed_magic_link_verification", "failed_attempts": 7, "window_seconds": 600, "demo_mode": "true" }),
            offset_hours: 48,
        },
    ];

    let count = entries.len();
    for entry in entries {
        sqlx::query(
            r#"
            INSERT INTO audit_logs (actor_user_id, organization_id, action, target_type, target_id, ip, metadata, created_at)
            VALUES ($1, $2, $3, $4, $5, $6::inet, $7, NOW() - ($8 || ' hours')::interval)
            "#
        )
        .bind(entry.actor_user_id)
        .bind(entry.organization_id)
        .bind(entry.action)
        .bind(entry.target_type)
        .bind(entry.target_id)
        .bind(entry.ip)
        .bind(entry.metadata)
        .bind(entry.offset_hours.to_string())
        .execute(pool)
        .await?;
    }

    tracing::info!("Demo seed: seeded {} audit log entries for tenant orgs", count);

    Ok(())
}

pub async fn seed_demo_data(pool: &PgPool) -> Result<(), anyhow::Error> {
    if !demo_seed_enabled() {
        return Ok(());
    }

    let db_url = std::env::var("ROOIAM_DATABASE_URL").unwrap_or_default();
    let ok = db_url.ends_with("rooiam_demo") || db_url.contains("/rooiam_demo?");
    if !ok {
        panic!(
            "SAFETY ABORT: ROOIAM_MODE=demo must use the dedicated 'rooiam_demo' database.\n\
             Refusing to seed fake data into: {}\n\
             Expected: postgres://.../rooiam_demo",
            db_url
        );
    }

    if demo_reset_enabled() {
        tracing::warn!("Demo reset requested: wiping demo runtime data before reseeding.");
        reset_demo_runtime_state(pool).await?;
    }

    ensure_demo_rbac_baseline(pool).await?;

    // Purge non-seeded OAuth clients from demo orgs on every startup.
    // Test runs create clients in roochoco/mintmallow; this keeps the 10-app limit from
    // blocking tests. Seeded clients have client_id starting with "demo-".
    sqlx::query(
        r#"
        DELETE FROM oauth_clients
        WHERE org_id IN (
            SELECT id FROM organizations WHERE slug IN ('roochoco', 'mintmallow', 'rooiam',
                'melonhoneytoast', 'berryburger', 'moopizza')
        )
        AND client_id NOT LIKE 'demo-%'
        "#
    )
    .execute(pool)
    .await?;

    let identity_repo = IdentityRepository::new(pool.clone());
    let organization_repo = OrganizationRepository::new(pool.clone());

    let demo_owner_id = ensure_user(
        &identity_repo,
        pool,
        DEMO_OWNER_EMAIL,
        DEMO_OWNER_NAME,
        DEMO_OWNER_AVATAR_URL,
    )
    .await?;
    let demo_admin_id = ensure_user(
        &identity_repo,
        pool,
        DEMO_ADMIN_EMAIL,
        DEMO_ADMIN_NAME,
        DEMO_ADMIN_AVATAR_URL,
    )
    .await?;
    let demo_tenant_id = ensure_user(
        &identity_repo,
        pool,
        DEMO_TENANT_EMAIL,
        DEMO_TENANT_NAME,
        DEMO_TENANT_AVATAR_URL,
    )
    .await?;
    let demo_roochoco_customer_id = ensure_user(
        &identity_repo,
        pool,
        DEMO_ROOCHOCO_CUSTOMER_EMAIL,
        DEMO_ROOCHOCO_CUSTOMER_NAME,
        DEMO_ROOCHOCO_CUSTOMER_AVATAR_URL,
    )
    .await?;
    let demo_mintmallow_customer_id = ensure_user(
        &identity_repo,
        pool,
        DEMO_MINTMALLOW_CUSTOMER_EMAIL,
        DEMO_MINTMALLOW_CUSTOMER_NAME,
        DEMO_MINTMALLOW_CUSTOMER_AVATAR_URL,
    )
    .await?;
    let demo_melonhoneytoast_customer_id = ensure_user(
        &identity_repo,
        pool,
        DEMO_MELONHONEYTOAST_CUSTOMER_EMAIL,
        DEMO_MELONHONEYTOAST_CUSTOMER_NAME,
        DEMO_MELONHONEYTOAST_CUSTOMER_AVATAR_URL,
    )
    .await?;
    let demo_berryburger_customer_id = ensure_user(
        &identity_repo,
        pool,
        DEMO_BERRYBURGER_CUSTOMER_EMAIL,
        DEMO_BERRYBURGER_CUSTOMER_NAME,
        DEMO_BERRYBURGER_CUSTOMER_AVATAR_URL,
    )
    .await?;
    let demo_moopizza_customer_id = ensure_user(
        &identity_repo,
        pool,
        DEMO_MOOPIZZA_CUSTOMER_EMAIL,
        DEMO_MOOPIZZA_CUSTOMER_NAME,
        DEMO_MOOPIZZA_CUSTOMER_AVATAR_URL,
    )
    .await?;
    let demo_moomoo_id = ensure_user(
        &identity_repo,
        pool,
        DEMO_MOOMOO_EMAIL,
        DEMO_MOOMOO_NAME,
        DEMO_MOOMOO_AVATAR_URL,
    )
    .await?;
    let demo_roochoco_admin_1_id = ensure_user(
        &identity_repo,
        pool,
        DEMO_ROOCHOCO_ADMIN_1_EMAIL,
        DEMO_ROOCHOCO_ADMIN_1_NAME,
        DEMO_ROOCHOCO_ADMIN_1_AVATAR_URL,
    )
    .await?;
    let demo_roochoco_admin_2_id = ensure_user(
        &identity_repo,
        pool,
        DEMO_ROOCHOCO_ADMIN_2_EMAIL,
        DEMO_ROOCHOCO_ADMIN_2_NAME,
        DEMO_ROOCHOCO_ADMIN_2_AVATAR_URL,
    )
    .await?;
    let demo_mintmallow_admin_1_id = ensure_user(
        &identity_repo,
        pool,
        DEMO_MINTMALLOW_ADMIN_1_EMAIL,
        DEMO_MINTMALLOW_ADMIN_1_NAME,
        DEMO_MINTMALLOW_ADMIN_1_AVATAR_URL,
    )
    .await?;
    let demo_mintmallow_admin_2_id = ensure_user(
        &identity_repo,
        pool,
        DEMO_MINTMALLOW_ADMIN_2_EMAIL,
        DEMO_MINTMALLOW_ADMIN_2_NAME,
        DEMO_MINTMALLOW_ADMIN_2_AVATAR_URL,
    )
    .await?;
    let demo_toffee_id = ensure_user(
        &identity_repo,
        pool,
        DEMO_TOFFEE_EMAIL,
        DEMO_TOFFEE_NAME,
        DEMO_TOFFEE_AVATAR_URL,
    )
    .await?;
    let demo_roochoco_truffle_id = ensure_user(
        &identity_repo,
        pool,
        DEMO_ROOCHOCO_TRUFFLE_EMAIL,
        DEMO_ROOCHOCO_TRUFFLE_NAME,
        DEMO_ROOCHOCO_TRUFFLE_AVATAR_URL,
    )
    .await?;
    let demo_roochoco_praline_id = ensure_user(
        &identity_repo,
        pool,
        DEMO_ROOCHOCO_PRALINE_EMAIL,
        DEMO_ROOCHOCO_PRALINE_NAME,
        DEMO_ROOCHOCO_PRALINE_AVATAR_URL,
    )
    .await?;
    let demo_roochoco_ganache_id = ensure_user(
        &identity_repo,
        pool,
        DEMO_ROOCHOCO_GANACHE_EMAIL,
        DEMO_ROOCHOCO_GANACHE_NAME,
        DEMO_ROOCHOCO_GANACHE_AVATAR_URL,
    )
    .await?;

    let mut company_summaries = Vec::new();
    let mut demo_org_ids = Vec::new();
    for company in &DEMO_COMPANIES {
        let owner_user_id = match company.slug {
            "melonhoneytoast" | "berryburger" | "moopizza" => demo_moomoo_id,
            _ => demo_tenant_id,
        };
        let organization = ensure_company(pool, &organization_repo, owner_user_id, company).await?;
        let customer_user_id = match company.slug {
            "roochoco" => Some(demo_roochoco_customer_id),
            "mintmallow" => Some(demo_mintmallow_customer_id),
            "melonhoneytoast" => Some(demo_melonhoneytoast_customer_id),
            "berryburger" => Some(demo_berryburger_customer_id),
            "moopizza" => Some(demo_moopizza_customer_id),
            _ => None,
        };
        if let Some(customer_id) = customer_user_id {
            ensure_member_membership(pool, organization.id, customer_id).await?;
        }
        match company.slug {
            "roochoco" => {
                ensure_admin_membership(pool, organization.id, demo_roochoco_admin_1_id).await?;
                ensure_admin_membership(pool, organization.id, demo_roochoco_admin_2_id).await?;
                ensure_admin_membership(pool, organization.id, demo_roochoco_truffle_id).await?;
                ensure_member_membership(pool, organization.id, demo_roochoco_praline_id).await?;
                ensure_member_membership(pool, organization.id, demo_roochoco_ganache_id).await?;
            }
            "mintmallow" => {
                ensure_admin_membership(pool, organization.id, demo_mintmallow_admin_1_id).await?;
                ensure_admin_membership(pool, organization.id, demo_mintmallow_admin_2_id).await?;
            }
            _ => {}
        }
        company_summaries.push(format!("{} ({})", organization.name, company.slug));
        demo_org_ids.push((organization.slug.clone(), organization.id));
    }

    for app in &DEMO_APPS {
        let owner_user_id = match app.owner_email {
            DEMO_OWNER_EMAIL => demo_owner_id,
            DEMO_ADMIN_EMAIL => demo_admin_id,
            DEMO_TENANT_EMAIL => demo_tenant_id,
            DEMO_ROOCHOCO_CUSTOMER_EMAIL => demo_roochoco_customer_id,
            DEMO_MINTMALLOW_CUSTOMER_EMAIL => demo_mintmallow_customer_id,
            DEMO_MELONHONEYTOAST_CUSTOMER_EMAIL => demo_melonhoneytoast_customer_id,
            DEMO_BERRYBURGER_CUSTOMER_EMAIL => demo_berryburger_customer_id,
            DEMO_MOOPIZZA_CUSTOMER_EMAIL => demo_moopizza_customer_id,
            DEMO_MOOMOO_EMAIL => demo_moomoo_id,
            _ => continue,
        };
        let org_id = app.org_slug.and_then(|slug| demo_org_ids.iter().find(|(org_slug, _)| org_slug == slug).map(|(_, org_id)| *org_id));
        ensure_demo_app(pool, app, owner_user_id, org_id).await?;
    }

    // Clear platform owner from any other user first (constraint allows only one).
    sqlx::query(
        "UPDATE users SET is_platform_owner = false WHERE id != $1"
    )
    .bind(demo_owner_id)
    .execute(pool)
    .await?;

    // Set platform owner role on owner demo account.
    sqlx::query(
        "UPDATE users SET is_platform_owner = true, is_superuser = true WHERE id = $1"
    )
    .bind(demo_owner_id)
    .execute(pool)
    .await?;

    // Set platform admin role on admin demo account (superuser only, not owner).
    sqlx::query(
        "UPDATE users SET is_platform_owner = false, is_superuser = true WHERE id = $1"
    )
    .bind(demo_admin_id)
    .execute(pool)
    .await?;

    // Set platform admin role on toffee demo account.
    sqlx::query(
        "UPDATE users SET is_platform_owner = false, is_superuser = true WHERE id = $1"
    )
    .bind(demo_toffee_id)
    .execute(pool)
    .await?;

    // Ensure platform org exists and add owner + admin as members
    let platform_org_id: Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO organizations (name, slug, is_platform_org)
        VALUES ('Rooiam', 'rooiam', true)
        ON CONFLICT (slug) DO UPDATE SET is_platform_org = true
        RETURNING id
        "#
    )
    .fetch_one(pool)
    .await?;

    ensure_member_membership(pool, platform_org_id, demo_owner_id).await?;
    ensure_member_membership(pool, platform_org_id, demo_admin_id).await?;
    ensure_member_membership(pool, platform_org_id, demo_toffee_id).await?;

    // Seed demo audit logs for tenant orgs so the Tenant Audit Logs page shows sample data.
    seed_demo_audit_logs(
        pool,
        &demo_org_ids,
        demo_roochoco_customer_id,
        demo_mintmallow_customer_id,
        demo_tenant_id,
    ).await?;

    upsert_system_setting(pool, "superuser_email", DEMO_OWNER_EMAIL).await?;
    upsert_system_setting(pool, "setup_completed", "true").await?;

    // Storage: default to MinIO in demo mode using env-provided credentials.
    // Only set if not already configured (preserves any manual changes).
    let current_backend = sqlx::query_scalar::<_, String>(
        "SELECT value FROM system_settings WHERE key = 'storage_backend'"
    )
    .fetch_optional(pool).await.ok().flatten().unwrap_or_default();

    if current_backend.is_empty() || current_backend == "local" {
        let endpoint  = std::env::var("ROOIAM_MINIO_ENDPOINT").unwrap_or_else(|_| "http://localhost:9000".into());
        let bucket    = std::env::var("ROOIAM_MINIO_BUCKET").unwrap_or_else(|_| "rooiam".into());
        let access_key = std::env::var("ROOIAM_MINIO_USERNAME").unwrap_or_else(|_| "rooiam".into());
        let secret_key = std::env::var("ROOIAM_MINIO_PASSWORD").unwrap_or_default();

        if !secret_key.is_empty() {
            upsert_system_setting(pool, "storage_backend",          "minio").await?;
            upsert_system_setting(pool, "storage_minio_endpoint",   &endpoint).await?;
            upsert_system_setting(pool, "storage_minio_bucket",     &bucket).await?;
            upsert_system_setting(pool, "storage_minio_access_key", &access_key).await?;
            upsert_system_setting(pool, "storage_minio_secret_key", &secret_key).await?;
            upsert_system_setting(pool, "storage_minio_use_ssl",    "false").await?;
            tracing::info!("Demo seed: storage configured → MinIO at {}/{}", endpoint, bucket);

            // Auto-create the bucket if it doesn't exist yet.
            match crate::shared::storage_config::ensure_minio_bucket_exists(
                &endpoint, &bucket, &access_key, &secret_key,
            ).await {
                Ok(()) => tracing::info!("Demo seed: MinIO bucket '{}' ready", bucket),
                Err(e) => tracing::warn!("Demo seed: could not create MinIO bucket '{}': {}", bucket, e),
            }
        }
    }

    tracing::info!(
        "Demo seed ready: owner={} admin={} tenant={} moomoo={} customers=[{}, {}] companies={} apps={}",
        DEMO_OWNER_EMAIL,
        DEMO_ADMIN_EMAIL,
        DEMO_TENANT_EMAIL,
        DEMO_MOOMOO_EMAIL,
        DEMO_ROOCHOCO_CUSTOMER_EMAIL,
        DEMO_MINTMALLOW_CUSTOMER_EMAIL,
        company_summaries.join(", "),
        DEMO_APPS.iter().map(|app| app.app_name).collect::<Vec<_>>().join(", ")
    );

    Ok(())
}
