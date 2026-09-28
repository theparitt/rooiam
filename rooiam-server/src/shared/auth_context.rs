use sqlx::PgPool;
use sqlx::Row;
use url::Url;
use uuid::Uuid;

use crate::modules::organization::repository::OrganizationRepository;
use crate::shared::error::AppError;
use crate::shared::redirect::normalize_redirect_uri;

#[derive(Debug, Clone, Default)]
pub struct ResolvedLoginContext {
    pub current_org_id: Option<Uuid>,
    pub app_name: Option<String>,
    pub workspace_slug: Option<String>,
}

fn parse_login_context(redirect_uri: Option<&str>) -> ResolvedLoginContext {
    let Some(redirect_uri) = redirect_uri
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return ResolvedLoginContext::default();
    };

    let params = if redirect_uri.starts_with('/') {
        redirect_uri
            .split_once('?')
            .map(|(_, query)| query.to_string())
            .unwrap_or_default()
    } else if let Ok(parsed) = Url::parse(redirect_uri) {
        parsed.query().unwrap_or_default().to_string()
    } else {
        String::new()
    };

    let query = url::form_urlencoded::parse(params.as_bytes());
    let mut app_name = None;
    let mut workspace_slug = None;

    for (key, value) in query {
        if (key == "org" || key == "workspace") && workspace_slug.is_none() {
            let slug = value.trim();
            if !slug.is_empty() {
                workspace_slug = Some(slug.to_lowercase());
            }
        }

        if key == "app" && app_name.is_none() {
            let name = value.trim();
            if !name.is_empty() && name != "Your App" {
                app_name = Some(name.to_string());
            }
        }
    }

    ResolvedLoginContext {
        current_org_id: None,
        app_name,
        workspace_slug,
    }
}

pub fn inspect_login_context(redirect_uri: Option<&str>) -> ResolvedLoginContext {
    parse_login_context(redirect_uri)
}

pub fn parse_workspace_slug_from_redirect(redirect_uri: Option<&str>) -> Option<String> {
    parse_login_context(redirect_uri).workspace_slug
}

pub async fn resolve_login_context(
    db: &PgPool,
    user_id: Uuid,
    redirect_uri: Option<&str>,
) -> Result<ResolvedLoginContext, AppError> {
    let mut context = parse_login_context(redirect_uri);
    let normalized_redirect = redirect_uri
        .map(str::trim)
        .filter(|value| !value.is_empty());

    if let Some(redirect_uri) = normalized_redirect {
        if let Some(row) = sqlx::query(
            r#"
            SELECT
                o.id AS org_id,
                o.slug AS workspace_slug,
                c.app_name
            FROM oauth_client_redirect_uris r
            JOIN oauth_clients c ON c.id = r.oauth_client_id
            JOIN organizations o ON o.id = c.org_id
            WHERE r.redirect_uri = $1
            LIMIT 1
            "#,
        )
        .bind(redirect_uri)
        .fetch_optional(db)
        .await
        .map_err(|e| {
            AppError::Internal(format!(
                "Failed to resolve login context from redirect URI: {}",
                e
            ))
        })? {
            let org_id = row.get::<Uuid, _>("org_id");
            let workspace_slug = row.get::<String, _>("workspace_slug");
            let app_name = row.get::<String, _>("app_name");

            if context.workspace_slug.is_none() {
                context.workspace_slug = Some(workspace_slug);
            }
            if context.app_name.is_none() {
                context.app_name = Some(app_name);
            }

            let org_repo = OrganizationRepository::new(db.clone());
            if let Some(org) = org_repo.get_organization_by_id(org_id).await? {
                if org.status != "active" || org.platform_locked {
                    return Err(AppError::Forbidden(
                        "This workspace is suspended and cannot be accessed.".into(),
                    ));
                }
                if org_repo.is_member(org.id, user_id).await? {
                    context.current_org_id = Some(org.id);
                }
            }
        }
    }

    if let Some(slug) = context.workspace_slug.clone() {
        let org_repo = OrganizationRepository::new(db.clone());
        if let Some(org) = org_repo.get_organization_by_slug(&slug).await? {
            if org.status != "active" || org.platform_locked {
                return Err(AppError::Forbidden(
                    "This workspace is suspended and cannot be accessed.".into(),
                ));
            }
            if org_repo.is_member(org.id, user_id).await? {
                context.current_org_id = Some(org.id);
            }
        }
    }

    Ok(context)
}

pub async fn is_registered_oauth_redirect_uri(
    db: &PgPool,
    redirect_uri: &str,
) -> Result<bool, AppError> {
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM oauth_client_redirect_uris r JOIN oauth_clients c ON c.id = r.oauth_client_id WHERE r.redirect_uri = $1 AND c.status = 'active')",
    )
    .bind(redirect_uri)
    .fetch_one(db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to validate OAuth redirect URI: {}", e)))?;

    Ok(exists)
}

/// Accept a RooIAM redirect or an exact callback registered to an app.
/// Hosted widgets resolve their callback on the server from widget_login_context;
/// the callback must still pass this check before a login challenge is stored.
pub async fn resolve_allowed_login_redirect_uri(
    db: &PgPool,
    redirect_uri: Option<String>,
) -> Result<Option<String>, AppError> {
    let Some(raw_redirect) = redirect_uri
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Ok(None);
    };

    match normalize_redirect_uri(Some(raw_redirect.clone())) {
        Ok(value) => Ok(value),
        Err(AppError::Validation(message)) if message == "redirect_uri is not allowed" => {
            if is_registered_oauth_redirect_uri(db, &raw_redirect).await? {
                Ok(Some(raw_redirect))
            } else {
                Err(AppError::Validation(
                    "This app callback is not allowed. Use a registered app redirect_uri or a first-party Rooiam URL.".into(),
                ))
            }
        }
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::resolve_allowed_login_redirect_uri;
    use sqlx::PgPool;
    use uuid::Uuid;

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "requires isolated local Postgres"]
    async fn external_callback_requires_active_registration(pool: PgPool) {
        let callback = "https://login-regression.example.invalid/auth/callback";
        assert!(resolve_allowed_login_redirect_uri(&pool, Some(callback.into())).await.is_err());

        let org: Uuid = sqlx::query_scalar("INSERT INTO organizations(name,slug) VALUES ('Login Regression','login-regression') RETURNING id")
            .fetch_one(&pool).await.unwrap();
        let client: Uuid = sqlx::query_scalar("INSERT INTO oauth_clients(client_id,app_name,app_type,org_id) VALUES ('login-regression-client','Test App','web',$1) RETURNING id")
            .bind(org).fetch_one(&pool).await.unwrap();
        sqlx::query("INSERT INTO oauth_client_redirect_uris(oauth_client_id,redirect_uri) VALUES ($1,$2)")
            .bind(client).bind(callback).execute(&pool).await.unwrap();

        assert_eq!(resolve_allowed_login_redirect_uri(&pool, Some(callback.into())).await.unwrap().as_deref(), Some(callback));
        assert!(resolve_allowed_login_redirect_uri(&pool, Some(format!("{}?changed=1", callback))).await.is_err());
        sqlx::query("UPDATE oauth_clients SET status='suspended' WHERE id=$1").bind(client).execute(&pool).await.unwrap();
        assert!(resolve_allowed_login_redirect_uri(&pool, Some(callback.into())).await.is_err());
    }
}
