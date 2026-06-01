use actix_web::web;
use uuid::Uuid;

use crate::bootstrap::state::AppState;
use crate::modules::organization::repository::OrganizationRepository;
use crate::shared::demo_seed::demo_seed_enabled;
use crate::shared::error::AppError;

pub fn demo_app_icon_url(app_name: &str) -> Option<&'static str> {
    match app_name {
        "RooChoco Portal" => Some("/assets/demo/rooiam-logo-roochoco.png"),
        "MintMallow Portal" => Some("/assets/demo/rooiam-logo-mintmallow.png"),
        "MelonHoneyToast Portal" => Some("/assets/demo/rooiam-melonhoneytoast.jpg"),
        "BerryBurger Portal" => Some("/assets/demo/rooiam-berryburger.jpg"),
        "MooPizza Portal" => Some("/assets/demo/rooiam-moopizza.jpg"),
        _ => None,
    }
}

pub fn demo_mailbox_url() -> Option<String> {
    std::env::var("ROOIAM_MAILBOX_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
    std::env::var("ROOIAM_DEMO_MAILBOX_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .or_else(|| {
            if demo_seed_enabled() {
                Some("http://localhost:8025".to_string())
            } else {
                None
            }
        })
    })
}

pub async fn resolve_workspace(
    state: &web::Data<AppState>,
    workspace_id: Option<&str>,
    workspace_slug: Option<&str>,
) -> Result<Option<crate::modules::organization::models::Organization>, AppError> {
    let repo = OrganizationRepository::new(state.db.clone());

    if let Some(raw_id) = workspace_id.map(str::trim).filter(|value| !value.is_empty()) {
        let parsed = Uuid::parse_str(raw_id)
            .map_err(|_| AppError::Validation("Workspace ID is invalid.".into()))?;
        if let Some(org) = repo.get_organization_by_id(parsed).await? {
            return Ok(Some(org));
        }
        return Ok(None);
    }

    if let Some(slug) = workspace_slug.map(str::trim).filter(|value| !value.is_empty()) {
        return repo.get_organization_by_slug(slug).await;
    }

    Ok(None)
}
