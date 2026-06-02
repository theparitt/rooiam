use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Serialize)]
pub struct SetupStatus {
    pub initialized: bool,
    pub has_admin_user: bool,
    pub has_smtp: bool,
    pub has_google_oauth: bool,
    pub has_microsoft_oauth: bool,
    pub demo_mode: bool,
}

#[derive(Serialize)]
pub struct PublicUrlsResponse {
    pub issuer_url: String,
    pub frontend_url: String,
    pub admin_url: String,
    pub google_callback_url: String,
    pub microsoft_callback_url: String,
}

#[derive(Serialize)]
pub struct SetupConfigResponse {
    pub admin_email: String,
    pub admin_display_name: String,
    pub platform_owner_exists: bool,
    pub smtp_verified_email: String,
    pub smtp_verified_at: String,
    pub issuer_url: String,
    pub frontend_url: String,
    pub admin_url: String,
    pub demo_mailbox_url: Option<String>,
    pub redis_url: String,
    pub redis_url_masked: String,
    pub database_url_masked: String,
    pub database_name: String,
    pub database_host: String,
    pub database_port: u16,
    pub database_username: String,
    pub database_mode_target: String,
    pub database_connection_ready: bool,
    pub database_migration_count: i64,
    pub database_latest_migration: String,
    pub google_callback_url: String,
    pub microsoft_callback_url: String,
    pub smtp_host: String,
    pub smtp_port: String,
    pub smtp_security: String,
    pub smtp_insecure_tls: bool,
    pub smtp_username: String,
    pub smtp_password: String,
    pub smtp_password_configured: bool,
    pub smtp_from_email: String,
    pub google_client_id: String,
    pub google_client_secret: String,
    pub google_client_secret_configured: bool,
    pub google_oauth_verified_at: String,
    pub google_admin_login_enabled: bool,
    pub microsoft_client_id: String,
    pub microsoft_client_secret: String,
    pub microsoft_client_secret_configured: bool,
    pub microsoft_tenant_id: String,
    pub microsoft_oauth_verified_at: String,
    pub microsoft_admin_login_enabled: bool,
    pub admin_passkey_allowed: bool,
    pub admin_require_mfa: bool,
    pub setup_access_mode: String,
    pub rate_limit_window_seconds: u64,
    pub rate_limit_auth_per_endpoint: u64,
    pub rate_limit_auth_per_ip: u64,
    pub rate_limit_identity_per_endpoint: u64,
    pub rate_limit_identity_per_ip: u64,
    pub rate_limit_orgs_per_endpoint: u64,
    pub rate_limit_orgs_per_ip: u64,
    pub rate_limit_oauth_per_endpoint: u64,
    pub rate_limit_oauth_per_ip: u64,
    pub rate_limit_webauthn_per_endpoint: u64,
    pub rate_limit_webauthn_per_ip: u64,
}

#[derive(Serialize)]
pub struct DatabaseStatusResponse {
    pub ok: bool,
    pub message: String,
    pub database_url_masked: String,
    pub database_name: String,
    pub database_host: String,
    pub database_port: u16,
    pub database_username: String,
    pub database_mode_target: String,
    pub database_connection_ready: bool,
    pub database_migration_count: i64,
    pub database_latest_migration: String,
}

#[derive(Serialize)]
pub struct PublicAuthMethodsResponse {
    pub magic_link_enabled: bool,
    pub google_enabled: bool,
    pub microsoft_enabled: bool,
    pub passkey_enabled: bool,
    pub mfa_required: bool,
    pub demo_mode: bool,
    pub demo_mailbox_url: Option<String>,
    pub google_admin_login_enabled: bool,
    pub microsoft_admin_login_enabled: bool,
    pub admin_passkey_allowed: bool,
}

#[derive(Serialize)]
pub struct AdminAccessPolicyResponse {
    pub demo_mode: bool,
    pub google_admin_login_enabled: bool,
    pub microsoft_admin_login_enabled: bool,
    pub admin_passkey_allowed: bool,
    pub admin_require_mfa: bool,
}

#[derive(Serialize)]
pub struct LoginBootstrapBrandingResponse {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub login_display_name: Option<String>,
    pub login_title: Option<String>,
    pub login_subtitle: Option<String>,
    pub icon_url: Option<String>,
    pub icon_container: String,
    pub login_logo_url: Option<String>,
    pub brand_color: Option<String>,
    pub show_login_logo: bool,
    pub show_login_title: bool,
    pub show_login_subtitle: bool,
    pub show_powered_by: bool,
    pub widget_radius: String,
    pub widget_shadow: String,
    pub login_logo_container: String,
    pub login_logo_size: String,
    pub card_radius: String,
    pub button_style: String,
    pub card_bg_style: String,
    pub card_bg_color2: Option<String>,
    pub card_border_width: String,
    pub card_border_color: Option<String>,
    pub login_method_order: Vec<String>,
}

#[derive(Serialize)]
pub struct LoginBootstrapResponse {
    pub auth: PublicAuthMethodsResponse,
    pub workspace: Option<LoginBootstrapBrandingResponse>,
    pub app: Option<LoginBootstrapAppResponse>,
}

#[derive(Serialize)]
pub struct LoginBootstrapAppResponse {
    pub client_id: String,
    pub app_name: String,
    pub redirect_uri: String,
    pub widget_login_context: Option<String>,
}

#[derive(Clone, sqlx::FromRow)]
pub struct LoginBootstrapAppRow {
    pub client_id: String,
    pub app_name: String,
    pub redirect_uri: String,
}

#[derive(Serialize)]
pub struct DemoAppConfigResponse {
    pub workspace_id: Uuid,
    pub workspace_slug: String,
    pub app_id: String,
    pub app_name: String,
    pub app_icon_url: Option<String>,
    pub redirect_uri: String,
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    pub userinfo_endpoint: String,
    pub scopes: Vec<String>,
    pub demo_email: String,
}

#[derive(Serialize)]
pub struct DemoAppCatalogItem {
    pub workspace_id: Uuid,
    pub workspace_slug: String,
    pub app_id: String,
    pub label: String,
    pub app_name: String,
    pub app_icon_url: Option<String>,
    pub demo_email: String,
}

#[derive(Deserialize, utoipa::IntoParams)]
#[into_params(parameter_in = Query)]
#[serde(deny_unknown_fields)]
pub struct PublicAuthMethodsQuery {
    pub workspace_id: Option<String>,
    pub org: Option<String>,
    pub workspace: Option<String>,
    pub client_id: Option<String>,
    pub widget_embed_origin: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DemoAppConfigQuery {
    pub workspace_id: Option<String>,
    pub workspace: Option<String>,
    pub org: Option<String>,
    pub app_id: Option<String>,
    pub origin: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateAdminRequest {
    pub email: String,
    pub display_name: String,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PendingSmtpVerification {
    pub code: String,
    pub email: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SmtpConfigRequest {
    pub host: String,
    pub port: u16,
    #[serde(default)]
    pub security: String,
    #[serde(default)]
    pub insecure_tls: bool,
    pub username: String,
    pub password: String,
    pub from_email: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TestSmtpRequest {
    pub host: String,
    pub port: u16,
    #[serde(default)]
    pub security: String,
    #[serde(default)]
    pub insecure_tls: bool,
    pub username: String,
    pub password: String,
    pub from_email: String,
    pub test_email: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TestRedisRequest {
    pub url: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OAuthConfigRequest {
    pub google_client_id: Option<String>,
    pub google_client_secret: Option<String>,
    pub google_admin_login_enabled: Option<bool>,
    pub microsoft_client_id: Option<String>,
    pub microsoft_client_secret: Option<String>,
    pub microsoft_tenant_id: Option<String>,
    pub microsoft_admin_login_enabled: Option<bool>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PrepareOAuthVerificationRequest {
    pub provider: String,
    pub client_id: String,
    pub client_secret: String,
    pub tenant_id: Option<String>,
    pub redirect_uri: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AdminAccessRequest {
    pub admin_passkey_allowed: Option<bool>,
    pub admin_require_mfa: Option<bool>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PublicUrlsRequest {
    pub issuer_url: String,
    pub frontend_url: String,
    pub admin_url: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DemoLoginRequest {
    pub org_slug: String,
    pub app_name: Option<String>,
    pub email: Option<String>,
}
