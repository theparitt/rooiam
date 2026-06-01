use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::shared::error::AppError;

// Hard caps — absolute ceilings enforced in code regardless of operator settings.
// To raise these, change the constant and redeploy. Intentional friction.
pub const HARD_CAP_WORKSPACES_PER_USER: i32 = 10;
pub const HARD_CAP_APPS_PER_WORKSPACE: i32 = 20;
pub const HARD_CAP_REDIRECT_URIS_PER_APP: i32 = 25;
pub const HARD_CAP_ALLOWED_EMBED_ORIGINS_PER_APP: i32 = 25;

// Fallback defaults applied when the operator has not configured a limit.
pub const DEFAULT_MAX_WORKSPACES_PER_USER: i32 = 3;
pub const DEFAULT_MAX_APPS_PER_WORKSPACE: i32 = 5;
pub const DEFAULT_MAX_REDIRECT_URIS_PER_APP: i32 = 5;
pub const DEFAULT_MAX_ALLOWED_EMBED_ORIGINS_PER_APP: i32 = 5;
pub const DEFAULT_MAX_REDIRECT_URIS_PER_APP_LIMIT: i32 = 10;
pub const DEFAULT_MAX_ALLOWED_EMBED_ORIGINS_PER_APP_LIMIT: i32 = 10;

pub const DEMO_MAX_WORKSPACES_PER_USER: i32 = 5;
pub const DEMO_MAX_APPS_PER_WORKSPACE: i32 = 10;
pub const DEMO_MAX_REDIRECT_URIS_PER_APP: i32 = 5;
pub const DEMO_MAX_ALLOWED_EMBED_ORIGINS_PER_APP: i32 = 5;
pub const DEMO_MAX_REDIRECT_URIS_PER_APP_LIMIT: i32 = 10;
pub const DEMO_MAX_ALLOWED_EMBED_ORIGINS_PER_APP_LIMIT: i32 = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformWorkspaceGovernance {
    /// Operator-configured default limit for new tenants. None means use DEFAULT_MAX_* fallback.
    pub max_workspaces_per_user: Option<i32>,
    pub max_apps_per_workspace: Option<i32>,
    pub max_redirect_uris_per_app_default: Option<i32>,
    pub max_redirect_uris_per_app_limit: Option<i32>,
    pub max_allowed_embed_origins_per_app_default: Option<i32>,
    pub max_allowed_embed_origins_per_app_limit: Option<i32>,
    /// Hard caps returned to the frontend so the UI can show them.
    pub hard_cap_workspaces_per_user: i32,
    pub hard_cap_apps_per_workspace: i32,
    pub hard_cap_redirect_uris_per_app: i32,
    pub hard_cap_allowed_embed_origins_per_app: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TenantWorkspaceAppRegistrationGovernance {
    pub max_redirect_uris_per_app: Option<i32>,
    pub max_allowed_embed_origins_per_app: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EffectiveWorkspaceAppRegistrationGovernance {
    pub max_redirect_uris_per_app: i32,
    pub max_allowed_embed_origins_per_app: i32,
}

impl PlatformWorkspaceGovernance {
    /// Effective workspace limit — operator setting clamped to hard cap, or default fallback.
    pub fn effective_max_workspaces(&self) -> i32 {
        self.max_workspaces_per_user
            .unwrap_or(DEFAULT_MAX_WORKSPACES_PER_USER)
            .min(HARD_CAP_WORKSPACES_PER_USER)
    }

    /// Effective app limit — operator setting clamped to hard cap, or default fallback.
    pub fn effective_max_apps(&self) -> i32 {
        self.max_apps_per_workspace
            .unwrap_or(DEFAULT_MAX_APPS_PER_WORKSPACE)
            .min(HARD_CAP_APPS_PER_WORKSPACE)
    }

    pub fn effective_max_redirect_uris_per_app_limit(&self) -> i32 {
        self.max_redirect_uris_per_app_limit
            .unwrap_or(DEFAULT_MAX_REDIRECT_URIS_PER_APP_LIMIT)
            .clamp(1, HARD_CAP_REDIRECT_URIS_PER_APP)
    }

    pub fn effective_default_max_redirect_uris_per_app(&self) -> i32 {
        self.max_redirect_uris_per_app_default
            .unwrap_or(DEFAULT_MAX_REDIRECT_URIS_PER_APP)
            .clamp(1, self.effective_max_redirect_uris_per_app_limit())
    }

    pub fn effective_max_allowed_embed_origins_per_app_limit(&self) -> i32 {
        self.max_allowed_embed_origins_per_app_limit
            .unwrap_or(DEFAULT_MAX_ALLOWED_EMBED_ORIGINS_PER_APP_LIMIT)
            .clamp(1, HARD_CAP_ALLOWED_EMBED_ORIGINS_PER_APP)
    }

    pub fn effective_default_max_allowed_embed_origins_per_app(&self) -> i32 {
        self.max_allowed_embed_origins_per_app_default
            .unwrap_or(DEFAULT_MAX_ALLOWED_EMBED_ORIGINS_PER_APP)
            .clamp(1, self.effective_max_allowed_embed_origins_per_app_limit())
    }
}

pub async fn load_platform_workspace_governance(db: &PgPool) -> Result<PlatformWorkspaceGovernance, AppError> {
    if crate::shared::demo_seed::demo_seed_enabled() {
        return Ok(PlatformWorkspaceGovernance {
            max_workspaces_per_user: Some(DEMO_MAX_WORKSPACES_PER_USER),
            max_apps_per_workspace: Some(DEMO_MAX_APPS_PER_WORKSPACE),
            max_redirect_uris_per_app_default: Some(DEMO_MAX_REDIRECT_URIS_PER_APP),
            max_redirect_uris_per_app_limit: Some(DEMO_MAX_REDIRECT_URIS_PER_APP_LIMIT),
            max_allowed_embed_origins_per_app_default: Some(DEMO_MAX_ALLOWED_EMBED_ORIGINS_PER_APP),
            max_allowed_embed_origins_per_app_limit: Some(DEMO_MAX_ALLOWED_EMBED_ORIGINS_PER_APP_LIMIT),
            hard_cap_workspaces_per_user: HARD_CAP_WORKSPACES_PER_USER,
            hard_cap_apps_per_workspace: HARD_CAP_APPS_PER_WORKSPACE,
            hard_cap_redirect_uris_per_app: HARD_CAP_REDIRECT_URIS_PER_APP,
            hard_cap_allowed_embed_origins_per_app: HARD_CAP_ALLOWED_EMBED_ORIGINS_PER_APP,
        });
    }

    Ok(PlatformWorkspaceGovernance {
        max_workspaces_per_user: get_system_i32(db, "max_workspaces_per_user").await?,
        max_apps_per_workspace: get_system_i32(db, "max_apps_per_workspace").await?,
        max_redirect_uris_per_app_default: get_system_i32(db, "max_redirect_uris_per_app_default").await?,
        max_redirect_uris_per_app_limit: get_system_i32(db, "max_redirect_uris_per_app_limit").await?,
        max_allowed_embed_origins_per_app_default: get_system_i32(db, "max_allowed_embed_origins_per_app_default").await?,
        max_allowed_embed_origins_per_app_limit: get_system_i32(db, "max_allowed_embed_origins_per_app_limit").await?,
        hard_cap_workspaces_per_user: HARD_CAP_WORKSPACES_PER_USER,
        hard_cap_apps_per_workspace: HARD_CAP_APPS_PER_WORKSPACE,
        hard_cap_redirect_uris_per_app: HARD_CAP_REDIRECT_URIS_PER_APP,
        hard_cap_allowed_embed_origins_per_app: HARD_CAP_ALLOWED_EMBED_ORIGINS_PER_APP,
    })
}

pub async fn save_platform_workspace_governance(
    db: &PgPool,
    policy: &PlatformWorkspaceGovernance,
) -> Result<PlatformWorkspaceGovernance, AppError> {
    if crate::shared::demo_seed::demo_seed_enabled() {
        set_system_optional_i32(db, "max_workspaces_per_user", Some(DEMO_MAX_WORKSPACES_PER_USER)).await?;
        set_system_optional_i32(db, "max_apps_per_workspace", Some(DEMO_MAX_APPS_PER_WORKSPACE)).await?;
        set_system_optional_i32(db, "max_redirect_uris_per_app_default", Some(DEMO_MAX_REDIRECT_URIS_PER_APP)).await?;
        set_system_optional_i32(db, "max_redirect_uris_per_app_limit", Some(DEMO_MAX_REDIRECT_URIS_PER_APP_LIMIT)).await?;
        set_system_optional_i32(db, "max_allowed_embed_origins_per_app_default", Some(DEMO_MAX_ALLOWED_EMBED_ORIGINS_PER_APP)).await?;
        set_system_optional_i32(db, "max_allowed_embed_origins_per_app_limit", Some(DEMO_MAX_ALLOWED_EMBED_ORIGINS_PER_APP_LIMIT)).await?;
        return load_platform_workspace_governance(db).await;
    }

    if let Some(limit) = policy.max_workspaces_per_user {
        if limit < 1 {
            return Err(AppError::Validation("Workspace limit must be at least 1 when set.".into()));
        }
        if limit > HARD_CAP_WORKSPACES_PER_USER {
            return Err(AppError::Validation(format!(
                "Workspace limit cannot exceed the hard cap of {}.",
                HARD_CAP_WORKSPACES_PER_USER
            )));
        }
    }
    if let Some(limit) = policy.max_apps_per_workspace {
        if limit < 1 {
            return Err(AppError::Validation("App limit must be at least 1 when set.".into()));
        }
        if limit > HARD_CAP_APPS_PER_WORKSPACE {
            return Err(AppError::Validation(format!(
                "App limit cannot exceed the hard cap of {}.",
                HARD_CAP_APPS_PER_WORKSPACE
            )));
        }
    }
    if let Some(limit) = policy.max_redirect_uris_per_app_limit {
        if limit < 1 {
            return Err(AppError::Validation("App redirect URI max limit must be at least 1 when set.".into()));
        }
        if limit > HARD_CAP_REDIRECT_URIS_PER_APP {
            return Err(AppError::Validation(format!(
                "App redirect URI max limit cannot exceed the hard cap of {}.",
                HARD_CAP_REDIRECT_URIS_PER_APP
            )));
        }
    }
    if let Some(default_value) = policy.max_redirect_uris_per_app_default {
        if default_value < 1 {
            return Err(AppError::Validation("Default app redirect URI limit must be at least 1 when set.".into()));
        }
        let max_limit = policy
            .max_redirect_uris_per_app_limit
            .unwrap_or(DEFAULT_MAX_REDIRECT_URIS_PER_APP_LIMIT)
            .clamp(1, HARD_CAP_REDIRECT_URIS_PER_APP);
        if default_value > max_limit {
            return Err(AppError::Validation(format!(
                "Default app redirect URI limit cannot exceed the platform max of {}.",
                max_limit
            )));
        }
    }
    if let Some(limit) = policy.max_allowed_embed_origins_per_app_limit {
        if limit < 1 {
            return Err(AppError::Validation("App embed origin max limit must be at least 1 when set.".into()));
        }
        if limit > HARD_CAP_ALLOWED_EMBED_ORIGINS_PER_APP {
            return Err(AppError::Validation(format!(
                "App embed origin max limit cannot exceed the hard cap of {}.",
                HARD_CAP_ALLOWED_EMBED_ORIGINS_PER_APP
            )));
        }
    }
    if let Some(default_value) = policy.max_allowed_embed_origins_per_app_default {
        if default_value < 1 {
            return Err(AppError::Validation("Default app embed origin limit must be at least 1 when set.".into()));
        }
        let max_limit = policy
            .max_allowed_embed_origins_per_app_limit
            .unwrap_or(DEFAULT_MAX_ALLOWED_EMBED_ORIGINS_PER_APP_LIMIT)
            .clamp(1, HARD_CAP_ALLOWED_EMBED_ORIGINS_PER_APP);
        if default_value > max_limit {
            return Err(AppError::Validation(format!(
                "Default app embed origin limit cannot exceed the platform max of {}.",
                max_limit
            )));
        }
    }

    set_system_optional_i32(db, "max_workspaces_per_user", policy.max_workspaces_per_user).await?;
    set_system_optional_i32(db, "max_apps_per_workspace", policy.max_apps_per_workspace).await?;
    set_system_optional_i32(db, "max_redirect_uris_per_app_default", policy.max_redirect_uris_per_app_default).await?;
    set_system_optional_i32(db, "max_redirect_uris_per_app_limit", policy.max_redirect_uris_per_app_limit).await?;
    set_system_optional_i32(db, "max_allowed_embed_origins_per_app_default", policy.max_allowed_embed_origins_per_app_default).await?;
    set_system_optional_i32(db, "max_allowed_embed_origins_per_app_limit", policy.max_allowed_embed_origins_per_app_limit).await?;
    load_platform_workspace_governance(db).await
}

pub async fn load_tenant_workspace_app_registration_governance(
    db: &PgPool,
    org_id: Uuid,
) -> Result<TenantWorkspaceAppRegistrationGovernance, AppError> {
    Ok(TenantWorkspaceAppRegistrationGovernance {
        max_redirect_uris_per_app: get_system_i32(db, &format!("org:{}:max_redirect_uris_per_app", org_id)).await?,
        max_allowed_embed_origins_per_app: get_system_i32(db, &format!("org:{}:max_allowed_embed_origins_per_app", org_id)).await?,
    })
}

pub async fn save_tenant_workspace_app_registration_governance(
    db: &PgPool,
    org_id: Uuid,
    policy: &TenantWorkspaceAppRegistrationGovernance,
) -> Result<TenantWorkspaceAppRegistrationGovernance, AppError> {
    let platform = load_platform_workspace_governance(db).await?;
    let max_redirect_limit = platform.effective_max_redirect_uris_per_app_limit();
    let max_embed_limit = platform.effective_max_allowed_embed_origins_per_app_limit();

    if let Some(limit) = policy.max_redirect_uris_per_app {
        if !(1..=max_redirect_limit).contains(&limit) {
            return Err(AppError::Validation(format!(
                "Tenant app redirect URI limit must be between 1 and {}.",
                max_redirect_limit
            )));
        }
    }
    if let Some(limit) = policy.max_allowed_embed_origins_per_app {
        if !(1..=max_embed_limit).contains(&limit) {
            return Err(AppError::Validation(format!(
                "Tenant app embed origin limit must be between 1 and {}.",
                max_embed_limit
            )));
        }
    }

    set_system_optional_i32(db, &format!("org:{}:max_redirect_uris_per_app", org_id), policy.max_redirect_uris_per_app).await?;
    set_system_optional_i32(
        db,
        &format!("org:{}:max_allowed_embed_origins_per_app", org_id),
        policy.max_allowed_embed_origins_per_app,
    )
    .await?;

    load_tenant_workspace_app_registration_governance(db, org_id).await
}

pub async fn load_effective_workspace_app_registration_governance(
    db: &PgPool,
    org_id: Uuid,
) -> Result<EffectiveWorkspaceAppRegistrationGovernance, AppError> {
    let platform = load_platform_workspace_governance(db).await?;
    let tenant = load_tenant_workspace_app_registration_governance(db, org_id).await?;

    Ok(EffectiveWorkspaceAppRegistrationGovernance {
        max_redirect_uris_per_app: tenant
            .max_redirect_uris_per_app
            .unwrap_or(platform.effective_default_max_redirect_uris_per_app())
            .clamp(1, platform.effective_max_redirect_uris_per_app_limit()),
        max_allowed_embed_origins_per_app: tenant
            .max_allowed_embed_origins_per_app
            .unwrap_or(platform.effective_default_max_allowed_embed_origins_per_app())
            .clamp(1, platform.effective_max_allowed_embed_origins_per_app_limit()),
    })
}

async fn get_system_i32(db: &PgPool, key: &str) -> Result<Option<i32>, AppError> {
    let value: Option<String> = sqlx::query_scalar("SELECT value FROM system_settings WHERE key = $1")
        .bind(key)
        .fetch_optional(db)
        .await
        .map_err(|e| AppError::Internal(format!("Failed to load workspace governance setting '{}': {}", key, e)))?;

    let Some(value) = value.map(|value| value.trim().to_string()).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };

    let parsed = value
        .parse::<i32>()
        .map_err(|_| AppError::Validation(format!("Invalid integer value for {}", key)))?;

    Ok(Some(parsed))
}

async fn set_system_optional_i32(db: &PgPool, key: &str, value: Option<i32>) -> Result<(), AppError> {
    sqlx::query(
        r#"
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
        "#
    )
    .bind(key)
    .bind(value.map(|value| value.to_string()).unwrap_or_default())
    .execute(db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to save workspace governance setting '{}': {}", key, e)))?;

    Ok(())
}
