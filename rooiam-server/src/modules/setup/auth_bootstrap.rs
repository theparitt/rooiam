use actix_web::{web, HttpResponse};
use std::time::Instant;
use url::Url;

use crate::bootstrap::state::AppState;
use crate::modules::setup::settings::{get_setting, has_setting_or_env};
use crate::modules::setup::support::{demo_mailbox_url, resolve_workspace};
use crate::modules::setup::timing::log_timing;
use crate::modules::setup::types::{
    LoginBootstrapAppResponse,
    LoginBootstrapAppRow,
    LoginBootstrapBrandingResponse,
    LoginBootstrapResponse,
    PublicAuthMethodsQuery,
    PublicAuthMethodsResponse,
};
use crate::shared::auth_policy::admin_console_passkey_allowed;
use crate::shared::demo_seed::demo_seed_enabled;
use crate::shared::error::AppError;
use crate::shared::tenant_access::load_tenant_access_policy;
use crate::shared::widget_login_context::create_widget_login_context;
use crate::shared::widget_login_context::WidgetLoginContextPayload;





fn redirect_origin(redirect_uri: &str) -> Option<String> 
{
    Url::parse(redirect_uri).ok().map(|url| url.origin().ascii_serialization())
}



fn is_root_redirect_uri( redirect_uri: &str ) -> bool
{
    if let Ok( url ) = Url::parse( redirect_uri )
    {
        let is_root_path = url.path() == "/" || url.path().is_empty();
        let has_no_query = url.query().is_none();
        return is_root_path && has_no_query;
    }

    false
}



fn redirect_rank
(
    redirect_uri  : &str,
    workspace_slug: Option<&str>,
) 
-> i32
{
    if let Some( slug ) = workspace_slug
    {
        let org_query = format!( "org={}", slug );

        if redirect_uri.contains( &org_query )
        {
            return 0;
        }
    }

    if redirect_uri.contains( "/callback" )
    {
        return 1;
    }

    if is_root_redirect_uri( redirect_uri )
    {
        return 9;
    }

    5
}



// fn select_login_bootstrap_redirect_uri
// (
//     client_id             : &str,
//     requested_embed_origin: Option<&str>,
//     workspace_slug        : Option<&str>,
//     rows                  : Vec<LoginBootstrapAppRow>,
// ) 
// -> Option<LoginBootstrapAppRow> 
// {
//     if rows.is_empty() 
//     {
//         tracing::warn!(
//             client_id = %client_id,
//             requested_embed_origin = requested_embed_origin.unwrap_or("(none)"),
//             "login bootstrap found no active redirect URIs for client"
//         );
//         return None;
//     }


//     if let Some(embed_origin) = requested_embed_origin 
//     {
//         if let Some(row) = rows
//             .iter()
//             .find(|row| redirect_origin(&row.redirect_uri).as_deref() == Some(embed_origin))
//         {
//             tracing::info!(
//                 client_id = %client_id,
//                 requested_embed_origin = %embed_origin,
//                 selected_redirect_uri = %row.redirect_uri,
//                 selection = "matched_embed_origin",
//                 "login bootstrap selected redirect URI matching widget embed origin"
//             );

//             return Some(LoginBootstrapAppRow 
//             {
//                 client_id   : row.client_id.clone(),
//                 app_name    : row.app_name.clone(),
//                 redirect_uri: row.redirect_uri.clone(),
//             });
//         }


//         tracing::warn!(
//             client_id = %client_id,
//             requested_embed_origin = %embed_origin,
//             available_redirect_uris = ?rows.iter().map(|row| row.redirect_uri.clone()).collect::<Vec<_>>(),
//             selection = "fallback_first_redirect_uri",
//             "login bootstrap could not match widget embed origin to any registered redirect URI; falling back to the first redirect URI"
//         );
//     }

//     let row = rows.into_iter().next()?;
//     tracing::info!(
//         client_id = %client_id,
//         requested_embed_origin = requested_embed_origin.unwrap_or("(none)"),
//         selected_redirect_uri = %row.redirect_uri,
//         selection = "first_registered_redirect_uri",
//         "login bootstrap selected the first registered redirect URI"
//     );
//     Some(row)
// }




fn select_login_bootstrap_redirect_uri
(
    client_id             : &str,
    requested_embed_origin: Option<&str>,
    workspace_slug        : Option<&str>,
    rows                  : Vec<LoginBootstrapAppRow>,
)
-> Option<LoginBootstrapAppRow>
{
    if rows.is_empty()
    {
        tracing::warn!(
            client_id = %client_id,
            requested_embed_origin = requested_embed_origin.unwrap_or( "(none)" ),
            workspace_slug = workspace_slug.unwrap_or( "(none)" ),
            "login bootstrap found no active redirect URIs for client"
        );

        return None;
    }


    let mut candidates = rows;


    if let Some( embed_origin ) = requested_embed_origin
    {
        let same_origin_candidates = candidates.clone()
            .into_iter()
            .filter( |row| redirect_origin( &row.redirect_uri ).as_deref() == Some( embed_origin ) )
            .collect::<Vec<_>>();


        if same_origin_candidates.is_empty()
        {
            tracing::warn!(
                client_id = %client_id,
                requested_embed_origin = %embed_origin,
                workspace_slug = workspace_slug.unwrap_or( "(none)" ),
                available_redirect_uris = ?candidates.iter().map( |row| row.redirect_uri.clone() ).collect::<Vec<_>>(),
                selection = "no_same_origin_match",
                "login bootstrap could not match widget embed origin to any registered redirect URI"
            );

            return None;
        }


        candidates = same_origin_candidates;
    }


    candidates.sort_by_key( |row| redirect_rank( &row.redirect_uri, workspace_slug ) );


    let row = candidates.into_iter().next()?;


    tracing::info!(
        client_id = %client_id,
        requested_embed_origin = requested_embed_origin.unwrap_or( "(none)" ),
        workspace_slug = workspace_slug.unwrap_or( "(none)" ),
        selected_redirect_uri = %row.redirect_uri,
        selection = "ranked_same_origin_match",
        "login bootstrap selected redirect URI using ranked workspace-aware match"
    );


    Some( row )
}




#[utoipa::path(
    get,
    path = "/v1/setup/auth-methods",
    tag = "browser",
    params(PublicAuthMethodsQuery),
    responses(
        (status = 200, description = "Login methods enabled for the resolved workspace (public; no auth)"),
        (status = 400, description = "Validation error"),
    ),
)]
pub async fn get_public_auth_methods
(
    state: web::Data<AppState>,
    query: web::Query<PublicAuthMethodsQuery>,
)
-> Result<HttpResponse, AppError>
{
    Ok(HttpResponse::Ok().json(load_public_auth_methods(&state, &query).await?))
}



pub async fn load_public_auth_methods
(
    state: &web::Data<AppState>,
    query: &PublicAuthMethodsQuery,
) 
-> Result<PublicAuthMethodsResponse, AppError> 
{
    let total_start    = Instant::now();
    let workspace_id   = query.workspace_id.as_deref().map(str::trim).filter(|value| !value.is_empty());
    let workspace_slug = query.org.as_deref().or(query.workspace.as_deref()).map(str::trim).filter(|value| !value.is_empty());


    let oauth_start = Instant::now();
    let runtime_oauth = crate::modules::oauth::handlers::load_runtime_oauth_config(&state).await?;
    log_timing(
        "setup.auth_methods.load_runtime_oauth_config",
        oauth_start.elapsed().as_millis(),
        format!("workspace={}", workspace_id.or(workspace_slug).unwrap_or("(root)")),
    );


    let smtp_start = Instant::now();
    let magic_link_enabled = if demo_seed_enabled() 
    {
        crate::infra::email::demo_smtp_present()
    } 
    else 
    {
        has_setting_or_env(&state.db, "smtp_host", &["ROOIAM_SMTP_HOST"]).await
            && has_setting_or_env(
                &state.db,
                "smtp_from_email",
                &["ROOIAM_SMTP_FROM", "ROOIAM_FROM_EMAIL", "FROM_EMAIL"],
            )
            .await
    };
    log_timing(
        "setup.auth_methods.resolve_magic_link",
        smtp_start.elapsed().as_millis(),
        format!("workspace={}", workspace_id.or(workspace_slug).unwrap_or("(root)")),
    );


    let google_enabled = if demo_seed_enabled() 
    {
        true
    } 
    else 
    {
        !runtime_oauth.oauth.google_client_id.trim().is_empty()
            && !runtime_oauth.oauth.google_client_secret.trim().is_empty()
    };


    let microsoft_enabled = if demo_seed_enabled() 
    {
        true
    } 
    else 
    {
        !runtime_oauth.oauth.microsoft_client_id.trim().is_empty()
            && !runtime_oauth.oauth.microsoft_client_secret.trim().is_empty()
    };


    let passkey_enabled =
        !state.config.webauthn.rp_id.trim().is_empty()
            && !state.config.webauthn.origin.trim().is_empty();

    let org_lookup_start = Instant::now();
    let org_policy = resolve_workspace(state, workspace_id, workspace_slug).await?;
    log_timing(
        "setup.auth_methods.load_org_policy",
        org_lookup_start.elapsed().as_millis(),
        format!("workspace={}", workspace_id.or(workspace_slug).unwrap_or("(root)")),
    );

    let tenant_access_policy = if workspace_id.is_none() && workspace_slug.is_none() {
        Some(load_tenant_access_policy(&state.db).await?)
    } else {
        None
    };

    let google_admin_login_enabled = if demo_seed_enabled() 
    {
        true
    } 
    else
    {
        google_enabled && get_setting(&state.db, "google_admin_login_enabled").await.as_deref() == Some("true")
    };


    let microsoft_admin_login_enabled = if demo_seed_enabled() 
    {
        true
    } 
    else 
    {
        microsoft_enabled && get_setting(&state.db, "microsoft_admin_login_enabled").await.as_deref() == Some("true")
    };
    let admin_passkey_allowed = admin_console_passkey_allowed(&state.db).await.unwrap_or(true);



    let response = PublicAuthMethodsResponse 
    {
        magic_link_enabled: magic_link_enabled
            && tenant_access_policy.as_ref().map(|policy| policy.allow_magic_link).unwrap_or(true)
            && org_policy.as_ref().map(|org| org.allow_magic_link).unwrap_or(true),
        google_enabled: google_enabled
            && tenant_access_policy.as_ref().map(|policy| policy.allow_google).unwrap_or(true)
            && org_policy.as_ref().map(|org| org.allow_google).unwrap_or(true),
        microsoft_enabled: microsoft_enabled
            && tenant_access_policy.as_ref().map(|policy| policy.allow_microsoft).unwrap_or(true)
            && org_policy.as_ref().map(|org| org.allow_microsoft).unwrap_or(true),
        passkey_enabled: passkey_enabled
            && tenant_access_policy.as_ref().map(|policy| policy.allow_passkey).unwrap_or(true)
            && org_policy.as_ref().map(|org| org.allow_passkey).unwrap_or(true),
        mfa_required: org_policy.as_ref().map(|org| org.require_mfa).unwrap_or(false),
        demo_mode: demo_seed_enabled(),
        demo_mailbox_url: demo_mailbox_url(),
        google_admin_login_enabled,
        microsoft_admin_login_enabled,
        admin_passkey_allowed,
    };


    log_timing(
        "setup.auth_methods.total",
        total_start.elapsed().as_millis(),
        format!(
            "workspace={}, enabled=magic_link:{} google:{} microsoft:{} passkey:{}",
            workspace_id.or(workspace_slug).unwrap_or("(root)"),
            response.magic_link_enabled,
            response.google_enabled,
            response.microsoft_enabled,
            response.passkey_enabled,
        ),
    );

    Ok(response)
}



#[utoipa::path(
    get,
    path = "/v1/setup/login-bootstrap",
    tag = "browser",
    params(PublicAuthMethodsQuery),
    responses(
        (status = 200, description = "Everything the hosted login widget needs to render: auth methods + workspace branding (public; no auth)"),
        (status = 400, description = "Validation error"),
    ),
)]
pub async fn get_login_bootstrap
(
    state: web::Data<AppState>,
    query: web::Query<PublicAuthMethodsQuery>,
)
-> Result<HttpResponse, AppError>
{
    let total_start = Instant::now();
    let auth = load_public_auth_methods(&state, &query).await?;
    let workspace_id = query.workspace_id.as_deref().map(str::trim).filter(|value| !value.is_empty());
    let workspace_slug = query.org.as_deref().or(query.workspace.as_deref()).map(str::trim).filter(|value| !value.is_empty());

    let branding_start = Instant::now();
    let resolved_workspace = resolve_workspace(&state, workspace_id, workspace_slug).await?;
    let workspace = resolved_workspace
        .as_ref()
        .map(|org| LoginBootstrapBrandingResponse 
        {
            id                  : org.id,
            slug                : org.slug.clone(),
            name                : org.name.clone(),
            login_display_name  : org.login_display_name.clone(),
            login_title         : org.login_title.clone(),
            login_subtitle      : org.login_subtitle.clone(),
            icon_url            : org.icon_url.clone(),
            icon_container      : org.icon_container.clone(),
            login_logo_url      : org.login_logo_url.clone(),
            brand_color         : org.brand_color.clone(),
            show_login_logo     : org.show_login_logo,
            show_login_title    : org.show_login_title,
            show_login_subtitle : org.show_login_subtitle,
            show_powered_by     : org.show_powered_by,
            widget_radius       : org.widget_radius.clone(),
            widget_shadow       : org.widget_shadow.clone(),
            login_logo_container: org.login_logo_container.clone(),
            login_logo_size     : org.login_logo_size.clone(),
            card_radius         : org.card_radius.clone(),
            button_style        : org.button_style.clone(),
            card_bg_style       : org.card_bg_style.clone(),
            card_bg_color2      : org.card_bg_color2.clone(),
            card_border_width   : org.card_border_width.clone(),
            card_border_color   : org.card_border_color.clone(),
            login_method_order  : org.login_method_order.clone(),
        });

    let requested_embed_origin = query
        .widget_embed_origin
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    // widget_embed_origin requires client_id — without it we cannot look up the registered
    // redirect_uri or create a widget_login_context. Fail early with a clear error.
    if requested_embed_origin.is_some() {
        let client_id_present = query.client_id.as_deref().map(str::trim).filter(|value| !value.is_empty()).is_some();
        if !client_id_present {
            tracing::error!(
                embed_origin = ?requested_embed_origin,
                workspace_id = ?workspace_id,
                workspace_slug = ?workspace_slug,
                "login-bootstrap: widget_embed_origin provided without client_id — cannot create widget_login_context"
            );
            return Err(AppError::Validation(
                "client_id is required when widget_embed_origin is provided".into()
            ));
        }
    }

    let app = if let Some(client_id) = query.client_id.as_deref().map(str::trim).filter(|value| !value.is_empty()) 
    {
        let org_id = resolved_workspace.as_ref().map(|org| org.id);
        let rows = sqlx::query_as::<_, LoginBootstrapAppRow>(
            r#"
            SELECT c.client_id, c.app_name, r.redirect_uri
            FROM oauth_clients c
            JOIN oauth_client_redirect_uris r ON r.oauth_client_id = c.id
            WHERE c.client_id = $1
              AND c.status = 'active'
              AND ($2::uuid IS NULL OR c.org_id = $2)
            ORDER BY r.redirect_uri
            "#,
        )
        .bind(client_id)
        .bind(org_id)
        .fetch_all(&state.db)
        .await?;



        if let Some(row) = select_login_bootstrap_redirect_uri(client_id, requested_embed_origin, workspace_slug, rows)
        {
            let widget_login_context = if let Some(embed_origin) = requested_embed_origin
            {
                let payload = WidgetLoginContextPayload
                {
                    redirect_uri: row.redirect_uri.clone(),
                    workspace_id: org_id,
                    client_id   : row.client_id.clone(),
                    app_name    : row.app_name.clone(),
                    embed_origin: embed_origin.to_string(),
                };

                tracing::info!(
                    client_id = %row.client_id,
                    embed_origin = %embed_origin,
                    redirect_uri = %row.redirect_uri,
                    "login-bootstrap: created widget_login_context"
                );

                Some(create_widget_login_context(&state, payload).await?)
            }
            else
            {
                None
            };


            Some(LoginBootstrapAppResponse
            {
                client_id   : row.client_id,
                app_name    : row.app_name,
                redirect_uri: row.redirect_uri,
                widget_login_context,
            })
        }
        else
        {
            // No redirect URI matched the embed origin — client may not have this origin in
            // allowed_embed_origins, or no redirect URI shares the same origin.
            if let Some(embed_origin) = requested_embed_origin {
                tracing::error!(
                    client_id = %client_id,
                    embed_origin = %embed_origin,
                    workspace_slug = ?workspace_slug,
                    "login-bootstrap: no redirect URI matched embed origin — widget_login_context not created. \
                     Check client allowed_embed_origins and redirect_uri registration."
                );
            }
            None
        }
    } 
    else 
    {
        None
    };


    log_timing(
        "setup.login_bootstrap.load_workspace_branding",
        branding_start.elapsed().as_millis(),
        format!("workspace={}", workspace_id.or(workspace_slug).unwrap_or("(root)")),
    );


    log_timing(
        "setup.login_bootstrap.total",
        total_start.elapsed().as_millis(),
        format!(
            "workspace={}, has_workspace={}",
            workspace_id.or(workspace_slug).unwrap_or("(root)"),
            workspace.is_some()
        ),
    );


    Ok(HttpResponse::Ok().json(LoginBootstrapResponse { auth, workspace, app }))
}
