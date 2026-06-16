use actix_web::{web, HttpResponse};

use crate::bootstrap::state::AppState;
use crate::modules::setup::diagnostics::normalized_url_or_error;
use crate::modules::setup::support::{demo_app_icon_url, resolve_workspace};
use crate::modules::setup::types::{DemoAppCatalogItem, DemoAppConfigQuery, DemoAppConfigResponse};
use crate::shared::demo_seed::{
    demo_end_user_email_for_org, demo_seed_enabled, seeded_demo_org_slugs,
};
use crate::shared::error::AppError;
use crate::shared::runtime_config::effective_public_urls;

pub async fn get_demo_app_config(
    state: web::Data<AppState>,
    query: web::Query<DemoAppConfigQuery>,
) -> Result<HttpResponse, AppError> {
    if !demo_seed_enabled() {
        return Err(AppError::NotFound("Demo mode is not enabled.".into()));
    }

    let workspace_id = query
        .workspace_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let workspace_slug = query
        .workspace
        .as_deref()
        .or(query.org.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let workspace = resolve_workspace(&state, workspace_id, workspace_slug)
        .await?
        .ok_or_else(|| AppError::NotFound("Workspace not found.".into()))?;
    let app_id = query
        .app_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let origin = query
        .origin
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("http://localhost:5183");
    let origin = normalized_url_or_error(origin, "origin")?;
    let redirect_uri = format!("{}/callback", origin.trim_end_matches('/'));

    let row = sqlx::query!(
        r#"
        SELECT c.client_id, c.app_name
        FROM oauth_clients c
        JOIN organizations o ON o.id = c.org_id
        JOIN oauth_client_redirect_uris r ON r.oauth_client_id = c.id
        WHERE o.id = $1
          AND c.app_type = 'spa'
          AND r.redirect_uri = $2
          AND ($3::text IS NULL OR c.client_id = $3)
        ORDER BY c.app_name ASC
        LIMIT 1
        "#,
        workspace.id,
        redirect_uri,
        app_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load demo app config: {}", e)))?
    .ok_or_else(|| {
        AppError::NotFound("No seeded demo app matches that workspace and origin.".into())
    })?;

    let urls = effective_public_urls(&state.db, state.config.as_ref()).await?;
    let app_icon_url = demo_app_icon_url(&row.app_name).map(str::to_string);
    Ok(HttpResponse::Ok().json(DemoAppConfigResponse {
        workspace_slug: workspace.slug.clone(),
        workspace_id: workspace.id,
        app_id: row.client_id,
        app_name: row.app_name,
        app_icon_url,
        redirect_uri: redirect_uri.clone(),
        authorization_endpoint: format!(
            "{}/v1/oidc/authorize",
            urls.issuer_url.trim_end_matches('/')
        ),
        token_endpoint: format!("{}/v1/oidc/token", urls.issuer_url.trim_end_matches('/')),
        userinfo_endpoint: format!("{}/v1/oidc/userinfo", urls.issuer_url.trim_end_matches('/')),
        scopes: vec!["openid".into(), "profile".into(), "email".into()],
        demo_email: demo_end_user_email_for_org(&workspace.slug)
            .ok_or_else(|| {
                AppError::NotFound("No seeded end-user demo account matches that workspace.".into())
            })?
            .to_string(),
    }))
}

pub async fn get_demo_app_catalog(state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    if !demo_seed_enabled() {
        return Err(AppError::NotFound("Demo mode is not enabled.".into()));
    }

    let slugs = seeded_demo_org_slugs();
    let rows = sqlx::query!(
        r#"
        SELECT o.id, o.slug, o.name, c.app_name, c.client_id
        FROM organizations o
        JOIN oauth_clients c ON c.org_id = o.id
        WHERE o.slug = ANY($1)
          AND c.app_type = 'spa'
          AND c.org_id IS NOT NULL
          AND c.app_name != 'Rooiam Admin Console'
        ORDER BY o.name ASC
        "#,
        slugs as &[&str]
    )
    .fetch_all(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to load demo app catalog: {}", e)))?;

    let items = rows
        .into_iter()
        .map(|row| {
            let app_icon_url = demo_app_icon_url(&row.app_name).map(str::to_string);
            DemoAppCatalogItem {
                workspace_id: row.id,
                workspace_slug: row.slug.clone(),
                app_id: row.client_id,
                label: row.name,
                app_name: row.app_name,
                app_icon_url,
                demo_email: demo_end_user_email_for_org(&row.slug)
                    .unwrap_or_default()
                    .to_string(),
            }
        })
        .collect::<Vec<_>>();

    Ok(HttpResponse::Ok().json(items))
}
