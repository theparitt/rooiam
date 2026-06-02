//! OpenAPI specification for the Rooiam API.
//!
//! The spec is GENERATED from the code: each handler annotated with
//! `#[utoipa::path(...)]` and each DTO deriving `utoipa::ToSchema` is registered
//! here. The server serves the result at `/openapi.json`, and Swagger UI at
//! `/docs`. The TypeScript (and future) SDKs are generated from `/openapi.json`,
//! so they cannot drift from the server.
//!
//! As endpoints are annotated, add them to `paths(...)` and their DTOs to
//! `components(schemas(...))` below. Start: the `/orgs/integrations/*` surface.

use utoipa::openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme};
use utoipa::{Modify, OpenApi};

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Rooiam API",
        version = "0.1.0",
        description = "Self-hosted passwordless IAM for multi-tenant SaaS.",
    ),
    modifiers(&SecurityAddon),
    paths(
        crate::modules::organization::integration::get_workspace_integration_info,
        // branding
        crate::modules::organization::integration::get_workspace_integration_branding,
        crate::modules::organization::handlers::update_workspace_integration_branding,
        // auth-config
        crate::modules::organization::integration::get_workspace_integration_auth_config,
        crate::modules::organization::handlers::update_workspace_integration_auth_config,
        // clients
        crate::modules::organization::integration::list_workspace_integration_clients,
        crate::modules::organization::handlers::create_workspace_integration_client,
        crate::modules::organization::integration::get_workspace_integration_client_detail,
        crate::modules::organization::handlers::update_workspace_integration_client,
        crate::modules::organization::handlers::delete_workspace_integration_client,
        crate::modules::organization::handlers::update_workspace_integration_client_status,
        crate::modules::organization::integration::get_workspace_integration_client_secret_metadata,
        crate::modules::organization::handlers::rotate_workspace_integration_client_secret,
        // members
        crate::modules::organization::handlers::list_workspace_integration_members,
        crate::modules::organization::handlers::get_workspace_integration_member_detail,
        crate::modules::organization::handlers::list_workspace_integration_member_activity,
        crate::modules::organization::handlers::list_workspace_integration_member_sessions,
        crate::modules::organization::handlers::revoke_workspace_integration_member_sessions,
        crate::modules::organization::handlers::update_workspace_integration_member_role,
        crate::modules::organization::handlers::update_workspace_integration_member_profile,
        crate::modules::organization::handlers::remove_workspace_integration_member,
        // invites
        crate::modules::organization::handlers::list_workspace_integration_invites,
        crate::modules::organization::handlers::send_workspace_integration_invite,
        crate::modules::organization::handlers::get_workspace_integration_invite_detail,
        crate::modules::organization::handlers::revoke_workspace_integration_invite,
        // activity + policy + meta
        crate::modules::organization::handlers::list_workspace_integration_activity,
        crate::modules::organization::handlers::list_workspace_integration_audit_actions,
        crate::modules::organization::handlers::get_workspace_integration_effective_policy,
        crate::modules::organization::handlers::get_workspace_integration_policy_summary,
        crate::modules::organization::handlers::list_workspace_integration_roles,
        crate::modules::organization::handlers::list_workspace_integration_permissions,
        crate::modules::organization::handlers::get_workspace_integration_api_key_me,
        crate::modules::organization::handlers::get_workspace_integration_widget_preview_config,
        // --- browser surface (public login flow + session-cookie self-service) ---
        crate::modules::setup::auth_bootstrap::get_public_auth_methods,
        crate::modules::setup::auth_bootstrap::get_login_bootstrap,
        crate::modules::auth::handlers::start_magic_link,
        crate::modules::auth::handlers::verify_magic_link,
        crate::modules::auth::handlers::logout,
        crate::modules::identity::handlers::get_me,
        crate::modules::identity::handlers::update_me,
        // --- OIDC client flow (discovery + PKCE code exchange) ---
        crate::modules::oidc::handlers::discovery,
        crate::modules::oidc::handlers::jwks_with_state,
        crate::modules::oidc::handlers::authorize,
        crate::modules::oidc::handlers::token,
        crate::modules::oidc::handlers::userinfo,
    ),
    components(
        schemas(
            crate::modules::organization::integration::WorkspaceIntegrationInfoResponse,
            crate::modules::organization::handlers::UpdateMemberRoleRequest,
            crate::modules::organization::handlers::UpdateWorkspaceIntegrationMemberProfileRequest,
            crate::modules::organization::handlers::UpdateCurrentOrganizationBrandingRequest,
            crate::modules::organization::handlers::UpdateTenantAuthConfigRequest,
            crate::modules::organization::handlers::CreateOrgClientRequest,
            crate::modules::organization::handlers::UpdateOrgClientRequest,
            crate::modules::organization::handlers::UpdateOrgClientStatusRequest,
            crate::modules::organization::handlers::SendInviteRequest,
            // browser DTOs
            crate::modules::auth::handlers::StartMagicLinkRequest,
            crate::modules::auth::handlers::VerifyMagicLinkRequest,
            crate::modules::identity::handlers::UpdateProfileRequest,
            // OIDC DTOs
            crate::modules::oidc::handlers::TokenRequest,
        ),
    ),
    tags(
        (name = "integrations", description = "Workspace integration API (workspace API key auth)"),
        (name = "browser", description = "Browser-facing API: public login flow + session-cookie self-service (no secrets)"),
        (name = "oidc", description = "OpenID Connect provider: discovery, JWKS, authorize, token (PKCE), userinfo"),
    ),
)]
pub struct ApiDoc;

/// Registers the security schemes referenced by endpoint `security(...)` attrs:
/// `workspace_api_key` (Bearer, server SDK) and `session_cookie` (browser SDK).
struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        use utoipa::openapi::security::ApiKey;
        use utoipa::openapi::security::ApiKeyValue;
        let components = openapi.components.get_or_insert_with(Default::default);
        components.add_security_scheme(
            "workspace_api_key",
            SecurityScheme::Http(
                HttpBuilder::new()
                    .scheme(HttpAuthScheme::Bearer)
                    .description(Some(
                        "Workspace API key, sent as `Authorization: Bearer <key>`.",
                    ))
                    .build(),
            ),
        );
        components.add_security_scheme(
            "session_cookie",
            SecurityScheme::ApiKey(ApiKey::Cookie(ApiKeyValue::with_description(
                "rooiam_session",
                "Opaque session cookie set on magic-link verify; sent automatically by the browser.",
            ))),
        );
        components.add_security_scheme(
            "oidc_access_token",
            SecurityScheme::Http(
                HttpBuilder::new()
                    .scheme(HttpAuthScheme::Bearer)
                    .description(Some(
                        "OIDC access token from /oidc/token, sent as `Authorization: Bearer <token>`.",
                    ))
                    .build(),
            ),
        );
    }
}
