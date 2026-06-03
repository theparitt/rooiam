// ── NO FALLBACK RULE ──────────────────────────────────────────────────────────
// Every caller-supplied parameter (redirect_uri, client_id, workspace_id,
// widget_login_context, etc.) must be validated explicitly.
// If a required parameter is missing or invalid: tracing::error! + return Err.
// NEVER use unwrap_or("some_default") or silent defaults for routing values.
// Two distinct flows (widget embed vs direct app) are explicit branches —
// neither is a fallback for the other. Both must error if their required
// params are absent.
// ─────────────────────────────────────────────────────────────────────────────

use actix_web::{web, HttpRequest, HttpResponse};
use url::Url;
use rand::{rngs::OsRng, RngCore};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use sqlx::PgPool;
use crate::bootstrap::config::AppConfig;

use crate::bootstrap::state::AppState;
use crate::shared::error::AppError;
use crate::shared::auth_policy::{admin_console_requires_mfa, ensure_auth_method_allowed, ensure_email_domain_allowed, get_workspace_policy_for_redirect, AuthMethod};
use crate::shared::operator_policy::{enforce_operator_login_policy, AuthMethod as OpAuthMethod};
use crate::shared::ip_policy::{access_denied_message, evaluate_ip_access, resolve_effective_ip_policy_for_redirect};
use crate::shared::redirect::validate_redirect_uri;
use crate::shared::auth_context::{is_registered_oauth_redirect_uri, resolve_login_context};
use crate::shared::request_ip::{client_ip_from_http_request, client_ip_string_from_http_request};
use crate::shared::runtime_config::{effective_admin_url, effective_enduser_url, effective_public_urls, get_setting, load_runtime_app_config};
use crate::shared::widget_login_context::{consume_widget_login_context, resolve_widget_login_context, is_widget_login_context_invalid_error, WIDGET_LOGIN_CONTEXT_INVALID_MESSAGE};
use crate::shared::demo_seed::{demo_seed_enabled, demo_default_email_for_context};
use crate::modules::audit::service::{AuditEvent, AuditService};
use crate::modules::identity::repository::IdentityRepository;
use crate::modules::mfa::{repository::MfaRepository, service::MfaService};
use crate::modules::organization::repository::OrganizationRepository;
use crate::modules::session::{
    service::SessionService,
    repository::SessionRepository,
    cookie::{build_session_cookie, ROOIAM_SESSION_COOKIE},
};
use uuid::Uuid;

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AuthRequest {
    pub provider: String,
    pub redirect_uri: Option<String>,
    pub widget_login_context: Option<String>,
    pub widget_embed_origin: Option<String>,
    pub surface: Option<String>,
    pub intent: Option<String>,
    pub workspace_id: Option<String>,
    pub workspace: Option<String>,
    pub org: Option<String>,
    pub client_id: Option<String>,
    pub app: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DemoOAuthQuery {
    pub provider: String,
    pub redirect_uri: Option<String>,
    pub state: Option<String>,
    pub surface: Option<String>,
    pub email: Option<String>,
    pub widget_login_context: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DemoOAuthPathQuery {
    pub redirect_uri: Option<String>,
    pub state: Option<String>,
    pub surface: Option<String>,
    pub email: Option<String>,
    pub widget_login_context: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DemoOAuthContinueForm {
    pub state: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct DemoOAuthContinueStatePayload {
    provider: String,
    redirect_uri: String,
    surface: Option<String>,
    email: Option<String>,
    initiated_ip: Option<String>,
    initiated_ua: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub state: String,
    // Explicit allowlist for provider callbacks.
    // Google can include `iss`, `scope`, `authuser`, `prompt`, and `hd`.
    // Microsoft can include `session_state`.
    pub iss: Option<String>,
    pub scope: Option<String>,
    pub authuser: Option<String>,
    pub prompt: Option<String>,
    pub hd: Option<String>,
    pub session_state: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
    pub error_subtype: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub(crate) struct OAuthStatePayload {
    intent: String,
    final_redirect: String,
    provider: String,
    surface: Option<String>,
    link_user_id: Option<Uuid>,
    pending_oauth_key: Option<String>,
    // Browser binding: used to detect state token theft/CSRF replay across different clients
    initiated_ip: Option<String>,
    initiated_ua: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct PendingOAuthVerificationPayload {
    provider: String,
    client_id: String,
    client_secret: String,
    tenant_id: Option<String>,
    save_scope: Option<String>,
    organization_id: Option<Uuid>,
    actor_user_id: Option<Uuid>,
}

async fn set_system_setting(db: &PgPool, key: &str, value: &str) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO system_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()"
    )
    .bind(key)
    .bind(value)
    .execute(db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to save system setting '{}': {}", key, e)))?;
    Ok(())
}

async fn is_platform_staff(db: &PgPool, user_id: uuid::Uuid) -> Result<bool, AppError> {
    let is_staff: Option<bool> = sqlx::query_scalar(
        "SELECT (is_platform_owner OR is_superuser) FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_optional(db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to check platform admin access for OAuth settings: {}", e)))?;

    Ok(is_staff.unwrap_or(false))
}

fn mark_oauth_test_result(final_redirect: &str, provider: &str, result: &str) -> String {
    let Ok(mut url) = Url::parse(final_redirect) else {
        return final_redirect.to_string();
    };

    let matches_provider = url
        .query_pairs()
        .find(|(key, _)| key == "oauth_test_provider")
        .map(|(_, value)| value == provider)
        .unwrap_or(false);

    if !matches_provider {
        return final_redirect.to_string();
    }

    let existing_pairs: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(key, _)| key != "oauth_test_result")
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect();

    {
        let mut pairs = url.query_pairs_mut();
        pairs.clear();
        for (key, value) in existing_pairs {
            pairs.append_pair(&key, &value);
        }
        pairs.append_pair("oauth_test_result", result);
    }

    url.to_string()
}

fn mark_oauth_link_result(final_redirect: &str, provider: &str, result: &str, message: &str) -> String {
    let Ok(mut url) = Url::parse(final_redirect) else {
        return final_redirect.to_string();
    };

    {
        let mut pairs = url.query_pairs_mut();
        pairs.append_pair("link_provider", provider);
        pairs.append_pair("link_result", result);
        pairs.append_pair("link_message", message);
    }

    url.to_string()
}

fn encode_query_value(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect()
}

fn demo_provider_label(provider: &str) -> &'static str {
    match provider {
        "google" => "Google",
        "microsoft" => "Microsoft",
        _ => "OAuth",
    }
}

fn demo_provider_method(provider: &str) -> &'static str {
    match provider {
        "google" => "demo_google",
        "microsoft" => "demo_microsoft",
        _ => "demo_oauth",
    }
}

fn resolve_final_redirect_uri_from_validation(
    trimmed_redirect_uri: &str,
    validation_result: Result<String, AppError>,
    is_registered_redirect: bool,
) -> Result<String, AppError> {
    match validation_result {
        Ok(validated) => Ok(validated),
        Err(AppError::Validation(message)) if message == "redirect_uri is not allowed" => {
            if is_registered_redirect {
                Ok(trimmed_redirect_uri.to_string())
            } else {
                Err(AppError::Validation(message))
            }
        }
        Err(err) => Err(err),
    }
}


fn normalize_demo_email(email: Option<&str>) -> Option<String> {
    email
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_lowercase())
}

fn demo_provider_icon_svg(provider: &str) -> &'static str {
    match provider {
        "google" => r##"
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
</svg>"##,
        "microsoft" => r##"
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path fill="#F25022" d="M1 1h10v10H1z"/>
  <path fill="#7FBA00" d="M13 1h10v10H13z"/>
  <path fill="#00A4EF" d="M1 13h10v10H1z"/>
  <path fill="#FFB900" d="M13 13h10v10H13z"/>
</svg>"##,
        _ => r#"
<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <rect x="4" y="4" width="16" height="16" rx="5" fill="currentColor"/>
</svg>"#,
    }
}

fn escape_html(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            _ => escaped.push(ch),
        }
    }
    escaped
}

// Inlined from assets/rooiam-app-white.svg — white mascot on orange rounded-square background.
// Kept as a const so it can be injected into the format! string without brace-escaping issues.
const ROOIAM_MASCOT_SVG: &str = include_str!("../../../assets/rooiam-app-white.svg");

fn render_demo_oauth_page(
    provider: &str,
    demo_email: &str,
    workspace_slug: Option<&str>,
    app_name: Option<&str>,
    continue_url: &str,
    continue_state: &str,
    cancel_url: &str,
) -> String {
    let title = match provider {
        "google" => "Demo Google Sign-In",
        "microsoft" => "Demo Microsoft Sign-In",
        _ => "Demo Sign-In",
    };

    let workspace = workspace_slug.unwrap_or("root-login");
    let app = app_name.unwrap_or("Rooiam");
    let provider_label = demo_provider_label(provider);
    let provider_icon = demo_provider_icon_svg(provider);
    let mascot = ROOIAM_MASCOT_SVG;
    let demo_email = escape_html(demo_email);
    let workspace = escape_html(workspace);
    let app = escape_html(app);
    let continue_url = escape_html(continue_url);
    let continue_state = escape_html(continue_state);
    let cancel_url = escape_html(cancel_url);

    format!(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; }}

    body {{
      font-family: 'Nunito', system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      min-height: 100vh;
      padding: 24px;
      color: hsl(240 10% 20%);
      background-color: hsl(0 0% 98%);
      background-image:
        radial-gradient(circle at 20% 20%, hsl(252 80% 96%) 0%, transparent 50%),
        radial-gradient(circle at 80% 80%, hsl(260 60% 96%) 0%, transparent 50%);
      background-attachment: fixed;
      display: grid;
      place-items: center;
    }}

    /* ── Card ── */
    .card {{
      width: min(100%, 420px);
      padding: 28px;
      border-radius: 24px;
      background: rgba(255, 255, 255, 0.72);
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.55);
      box-shadow: 0 4px 24px rgba(119, 79, 203, 0.08), 0 1px 3px rgba(0,0,0,0.04);
      animation: slideUp 0.45s cubic-bezier(0.16, 1, 0.3, 1);
    }}

    /* ── Top bar: brand + demo badge ── */
    .topbar {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
    }}
    .brand {{
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .brand-mark {{
      width: 32px;
      height: 32px;
      border-radius: 10px;
      overflow: hidden;
      flex: none;
    }}
    .brand-mark svg {{
      width: 32px;
      height: 32px;
      display: block;
    }}
    .brand-name {{
      font-size: 13px;
      font-weight: 900;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: hsl(257 23% 43%);
    }}
    .demo-badge {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 9999px;
      background: rgba(127, 99, 198, 0.10);
      border: 1px solid rgba(127, 99, 198, 0.18);
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: hsl(257 40% 45%);
    }}
    .demo-badge svg {{ width: 13px; height: 13px; flex: none; }}

    /* ── Provider icon row ── */
    .provider-header {{
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      margin-bottom: 22px;
      text-align: center;
    }}
    .provider-icon-wrap {{
      width: 52px;
      height: 52px;
      border-radius: 16px;
      background: white;
      border: 1.5px solid hsl(240 10% 92%);
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      display: flex;
      align-items: center;
      justify-content: center;
    }}
    .provider-icon-wrap svg {{
      width: 26px;
      height: 26px;
    }}
    .provider-title {{
      font-size: 18px;
      font-weight: 900;
      letter-spacing: -0.02em;
      color: hsl(240 10% 20%);
    }}
    .provider-subtitle {{
      font-size: 12px;
      font-weight: 600;
      color: hsl(240 5% 55%);
      margin-top: 2px;
    }}

    /* ── Info rows ── */
    .info-grid {{
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 22px;
    }}
    .info-row {{
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 11px 14px;
      border-radius: 14px;
      background: white;
      border: 1px solid hsl(240 10% 92%);
    }}
    .info-row-icon {{
      width: 30px;
      height: 30px;
      border-radius: 8px;
      background: hsl(252 80% 96%);
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
    }}
    .info-row-icon svg {{ width: 15px; height: 15px; color: hsl(252 60% 55%); }}
    .info-row-text {{ flex: 1; min-width: 0; }}
    .info-row-label {{
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: hsl(240 5% 60%);
      margin-bottom: 1px;
    }}
    .info-row-value {{
      font-size: 13px;
      font-weight: 800;
      color: hsl(240 10% 20%);
      overflow-wrap: anywhere;
      line-height: 1.3;
    }}

    /* ── Buttons ── */
    .actions {{ display: flex; flex-direction: column; gap: 10px; }}
    form {{ margin: 0; }}

    .btn-primary, .btn-secondary {{
      width: 100%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 13px 18px;
      border-radius: 14px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 900;
      cursor: pointer;
      border: none;
      text-decoration: none;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }}
    .btn-primary:hover, .btn-secondary:hover {{
      transform: translateY(-1px);
    }}
    .btn-primary:active, .btn-secondary:active {{
      transform: translateY(0);
    }}

    .btn-primary {{
      background: linear-gradient(135deg, #af9af5 0%, #d5c0ff 100%);
      color: #41246f;
      box-shadow: 0 4px 14px -2px rgba(175, 154, 245, 0.5);
    }}
    .btn-primary svg {{ width: 18px; height: 18px; flex: none; }}

    .btn-secondary {{
      background: white;
      color: hsl(240 10% 40%);
      border: 1.5px solid hsl(240 10% 88%);
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
    }}
    .btn-secondary:hover {{
      background: hsl(240 10% 98%);
    }}

    @keyframes slideUp {{
      from {{ opacity: 0; transform: translateY(20px); }}
      to   {{ opacity: 1; transform: translateY(0); }}
    }}

    @media (max-width: 480px) {{
      body {{ padding: 16px; }}
      .card {{ padding: 20px; border-radius: 20px; }}
    }}
  </style>
</head>
<body>
  <div class="card" role="main" aria-label="{title}">

    <div class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">{mascot}</div>
        <span class="brand-name">Rooiam</span>
      </div>
      <span class="demo-badge">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <rect x="3" y="11" width="18" height="11" rx="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        Demo
      </span>
    </div>

    <div class="provider-header">
      <div class="provider-icon-wrap">
        {provider_icon}
      </div>
      <div>
        <div class="provider-title">{title}</div>
        <div class="provider-subtitle">Sandbox only — not a real {provider_label} login</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-row">
        <div class="info-row-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
        </div>
        <div class="info-row-text">
          <div class="info-row-label">Account</div>
          <div class="info-row-value">{demo_email}</div>
        </div>
      </div>

      <div class="info-row">
        <div class="info-row-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="3" y="9" width="18" height="12" rx="2"/><path d="M8 9V6a4 4 0 0 1 8 0v3"/>
          </svg>
        </div>
        <div class="info-row-text">
          <div class="info-row-label">Workspace</div>
          <div class="info-row-value">{workspace}</div>
        </div>
      </div>

      <div class="info-row">
        <div class="info-row-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
            <path d="M9 9h6M9 12h6M9 15h4"/>
          </svg>
        </div>
        <div class="info-row-text">
          <div class="info-row-label">App</div>
          <div class="info-row-value">{app}</div>
        </div>
      </div>
    </div>

    <div class="actions">
      <form method="post" action="{continue_url}">
        <input type="hidden" name="state" value="{continue_state}" />
        <button class="btn-primary" type="submit">
          {provider_icon}
          Continue as {provider_label}
        </button>
      </form>
      <a class="btn-secondary" href="{cancel_url}">Back to login</a>
    </div>

  </div>
</body>
</html>"#
    )
}

async fn create_demo_continue_state(
    state: &web::Data<AppState>,
    provider: &str,
    redirect_uri: &str,
    surface: Option<&str>,
    email: Option<&str>,
    initiated_ip: Option<String>,
    initiated_ua: Option<String>,
) -> Result<String, AppError> {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let state_token = URL_SAFE_NO_PAD.encode(bytes);
    let redis_key = format!("demo_oauth_state:{}", state_token);
    let mut redis_conn = state.redis.clone();

    let _: () = redis::cmd("SETEX")
        .arg(&redis_key)
        .arg(600)
        .arg(
            serde_json::to_string(&DemoOAuthContinueStatePayload {
                provider: provider.to_string(),
                redirect_uri: redirect_uri.to_string(),
                surface: surface.map(str::to_string),
                email: normalize_demo_email(email),
                initiated_ip,
                initiated_ua,
            })
            .map_err(|e| AppError::Internal(format!("Failed to encode demo OAuth state payload: {}", e)))?,
        )
        .query_async(&mut redis_conn)
        .await
        .map_err(|e| AppError::Internal(format!("Redis demo auth state failure: {}", e)))?;

    Ok(state_token)
}

async fn complete_demo_oauth_login(
    req: HttpRequest,
    state: web::Data<AppState>,
    provider: &str,
    redirect_uri: &str,
    surface: Option<&str>,
    selected_email: Option<&str>,
) -> Result<HttpResponse, AppError> {
    if !demo_seed_enabled() {
        return Err(AppError::NotFound("Demo mode is not enabled.".into()));
    }

    let auth_method = match provider {
        "google" => AuthMethod::Google,
        "microsoft" => AuthMethod::Microsoft,
        _ => return Err(AppError::Validation("Unsupported provider".into())),
    };
    let (_, effective_ip_policy) = resolve_effective_ip_policy_for_redirect(&state.db, Some(redirect_uri)).await?;
    let decision = evaluate_ip_access(
        &effective_ip_policy,
        client_ip_from_http_request(&req, state.config.as_ref()),
    )?;
    if decision != crate::shared::ip_policy::IpAccessDecision::Allowed {
        return Err(AppError::Forbidden(access_denied_message(&decision).into()));
    }

    let workspace_policy = ensure_auth_method_allowed(&state.db, Some(redirect_uri), auth_method).await?;
    let context = crate::shared::auth_context::inspect_login_context(Some(redirect_uri));
    if let Some(workspace_slug) = context.workspace_slug.as_deref() {
        if workspace_policy.is_none() {
            return Err(AppError::Validation(format!("Workspace '{}' was not found.", workspace_slug)));
        }
    }
    let demo_email = normalize_demo_email(selected_email)
        .unwrap_or_else(|| demo_default_email_for_context(surface, context.workspace_slug.as_deref()).to_string());

    let identity_repo = IdentityRepository::new(state.db.clone());
    let user_id = identity_repo
        .get_user_id_by_email(&demo_email)
        .await?
        .ok_or_else(|| AppError::NotFound("Seeded demo user was not found.".into()))?;

    let login_context = resolve_login_context(&state.db, user_id, Some(redirect_uri)).await?;
    if let Some(workspace_slug) = context.workspace_slug.as_deref() {
        if login_context.current_org_id != workspace_policy.as_ref().map(|org| org.id) {
            return Err(AppError::Forbidden(format!(
                "Demo user does not have access to workspace '{}'.",
                workspace_slug
            )));
        }
    }
    let mfa_service = MfaService::new(
        MfaRepository::new(state.db.clone()),
        IdentityRepository::new(state.db.clone()),
        state.config.as_ref().clone(),
    );
    let ip = client_ip_string_from_http_request(&req, state.config.as_ref());
    let ua = req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from);
    let (totp_enabled, _) = mfa_service.totp_status(user_id).await?;
    let org_repo = OrganizationRepository::new(state.db.clone());
    let workspace_requires_mfa = match workspace_policy.as_ref() {
        Some(org) => {
            org.require_mfa
                || (org.require_mfa_for_admins
                    && org_repo.is_org_admin_or_owner(org.id, user_id).await.unwrap_or(false))
        }
        None => {
            if let Some(org_id) = login_context.current_org_id {
                // Tenant portal login — check if the org requires MFA for portal access
                org_repo.get_organization_by_id(org_id).await?
                    .map(|org| org.tenant_portal_require_mfa)
                    .unwrap_or(false)
            } else {
                // Admin console login — check platform admin_require_mfa policy
                admin_console_requires_mfa(&state.db, user_id).await?
            }
        }
    };
    let audit_org_id = login_context.current_org_id.or_else(|| workspace_policy.as_ref().map(|org| org.id));

    if workspace_requires_mfa && !totp_enabled {
        let enrollment = mfa_service
            .start_login_enrollment(
                user_id,
                Some(redirect_uri.to_string()),
                demo_provider_method(provider),
                Some(provider),
            )
            .await?;

        AuditService::new(state.db.clone()).log(AuditEvent {
            actor_user_id: Some(user_id),
            organization_id: login_context.current_org_id.or_else(|| workspace_policy.as_ref().map(|org| org.id)),
            action: "auth.mfa.enrollment.required".into(),
            target_type: "mfa_method".into(),
            target_id: Some("totp".into()),
            ip: ip.clone(),
            user_agent: ua.clone(),
            metadata: serde_json::json!({
                "reason": "workspace_requires_mfa_but_user_has_no_totp",
                "provider": provider,
                "method": demo_provider_method(provider),
                "workspace_slug": workspace_policy.as_ref().map(|org| org.slug.clone()),
                "demo_mode": true,
            }),
        }).await;

        let hosted_auth = effective_public_urls(&state.db, state.config.as_ref()).await?.issuer_url;
        let mut url = Url::parse(&format!("{}/verify", hosted_auth.trim_end_matches('/')))
            .map_err(|e| AppError::Internal(format!("Invalid login UI URL: {}", e)))?;
        url.query_pairs_mut()
            .append_pair("mfa_enrollment_challenge", &enrollment.challenge.id.to_string())
            .append_pair("redirect_uri", redirect_uri);
        return Ok(HttpResponse::Found()
            .insert_header(("Location", url.to_string()))
            .finish());
    }

    if totp_enabled {
        let challenge = mfa_service
            .start_login_challenge(
                user_id,
                Some(redirect_uri.to_string()),
                demo_provider_method(provider),
                Some(provider),
            )
            .await?;
        let hosted_auth = effective_public_urls(&state.db, state.config.as_ref()).await?.issuer_url;
        let mut login_url = Url::parse(&format!("{}/verify", hosted_auth.trim_end_matches('/')))
            .map_err(|e| AppError::Internal(format!("Invalid hosted verify URL: {}", e)))?;
        login_url
            .query_pairs_mut()
            .append_pair("mfa_challenge", &challenge.challenge.id.to_string())
            .append_pair("redirect_uri", redirect_uri);

        AuditService::new(state.db.clone()).log(AuditEvent {
            actor_user_id: Some(user_id),
            organization_id: audit_org_id,
            action: "auth.mfa.required".into(),
            target_type: "mfa_method".into(),
            target_id: Some("totp".into()),
            ip: ip.clone(),
            user_agent: ua.clone(),
            metadata: serde_json::json!({
                "method": demo_provider_method(provider),
                "provider": provider,
                "redirect_to": redirect_uri,
                "app_name": login_context.app_name,
                "workspace_slug": login_context.workspace_slug,
                "demo_mode": true,
            }),
        }).await;

        return Ok(HttpResponse::Found()
            .insert_header(("Location", login_url.to_string()))
            .finish());
    }

    let session_repo = SessionRepository::new(state.db.clone());
    let session_service = SessionService::new(session_repo, state.db.clone());
    let (_session, opaque_string) = session_service.create_opaque_session_with_context(
        user_id,
        crate::modules::session::models::SessionCreateContext {
            user_agent: ua.clone(),
            ip: client_ip_from_http_request(&req, state.config.as_ref()),
            current_org_id: login_context.current_org_id,
            login_surface: surface.map(str::to_string),
            login_app_name: login_context.app_name.clone(),
            login_workspace_slug: login_context.workspace_slug.clone(),
        },
    ).await?;

    let cookie = build_session_cookie(opaque_string, &state.config, 7 * 24 * 3600);

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(user_id),
        organization_id: audit_org_id,
        action: "demo.oauth.login.success".into(),
        target_type: "oauth_provider".into(),
        target_id: Some(provider.to_string()),
        ip,
        user_agent: ua,
        metadata: serde_json::json!({
            "provider": provider,
            "method": demo_provider_method(provider),
            "redirect_to": redirect_uri,
            "app_name": login_context.app_name,
            "workspace_slug": login_context.workspace_slug,
            "demo_user_email": demo_email,
            "demo_mode": true,
        }),
    }).await;

    Ok(HttpResponse::Found()
        .cookie(cookie)
        .insert_header(("Location", redirect_uri.to_string()))
        .finish())
}

async fn demo_provider_page_from_query(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<DemoOAuthQuery>,
) -> Result<HttpResponse, AppError> {
    let query = query.into_inner();
    start_demo_provider_page(
        req,
        state,
        query.provider.clone(),
        DemoOAuthPathQuery {
            redirect_uri: query.redirect_uri,
            state: query.state,
            surface: query.surface,
            email: query.email,
            widget_login_context: query.widget_login_context,
        },
    ).await
}

async fn start_demo_provider_page(
    req: HttpRequest,
    state: web::Data<AppState>,
    provider: String,
    query: DemoOAuthPathQuery,
) -> Result<HttpResponse, AppError> {
    if !demo_seed_enabled() {
        return Err(AppError::NotFound("Demo mode is not enabled.".into()));
    }

    let provider = provider.to_lowercase();
    if provider != "google" && provider != "microsoft" {
        return Err(AppError::Validation("Unsupported provider".into()));
    }

    // Two explicit flows — exactly one must be present, no fallback between them:
    //   Widget embed: caller sends widget_login_context; redirect_uri comes from the DB.
    //   Direct app:   caller sends redirect_uri explicitly; widget_login_context must be absent.
    if query.widget_login_context.is_some() && query.redirect_uri.is_some() {
        tracing::error!("demo_provider_page: both widget_login_context and redirect_uri provided — only one is allowed");
        return Err(AppError::Validation(
            "Provide either widget_login_context or redirect_uri, not both".into(),
        ));
    }
    let redirect_uri = if let Some(ref ctx_token) = query.widget_login_context {
        let ctx = resolve_widget_login_context(&state, Some(ctx_token)).await?
            .ok_or_else(|| AppError::Validation(WIDGET_LOGIN_CONTEXT_INVALID_MESSAGE.into()))?;
        ctx.redirect_uri
    } else if let Some(ref uri) = query.redirect_uri {
        let uri = uri.trim();
        if uri.is_empty() {
            tracing::error!("demo_provider_page: redirect_uri is empty");
            return Err(AppError::Validation("redirect_uri is required".into()));
        }
        if url::Url::parse(uri).is_err() {
            tracing::error!("demo_provider_page: redirect_uri is not a valid URL: {}", uri);
            return Err(AppError::Validation("redirect_uri is not a valid URL".into()));
        }
        uri.to_string()
    } else {
        tracing::error!("demo_provider_page: neither widget_login_context nor redirect_uri provided");
        return Err(AppError::Validation(
            "redirect_uri is required (direct app flow) or widget_login_context (widget embed flow)".into(),
        ));
    };
    let (_, effective_ip_policy) = resolve_effective_ip_policy_for_redirect(&state.db, Some(&redirect_uri)).await?;
    let decision = evaluate_ip_access(
        &effective_ip_policy,
        client_ip_from_http_request(&req, state.config.as_ref()),
    )?;
    if decision != crate::shared::ip_policy::IpAccessDecision::Allowed {
        return Err(AppError::Forbidden(access_denied_message(&decision).into()));
    }
    let auth_method = match provider.as_str() {
        "google" => AuthMethod::Google,
        "microsoft" => AuthMethod::Microsoft,
        _ => unreachable!(),
    };
    let workspace_policy = ensure_auth_method_allowed(&state.db, Some(&redirect_uri), auth_method).await?;

    let context = crate::shared::auth_context::inspect_login_context(Some(&redirect_uri));
    if let Some(workspace_slug) = context.workspace_slug.as_deref() {
        if workspace_policy.is_none() {
            return Err(AppError::Validation(format!("Workspace '{}' was not found.", workspace_slug)));
        }
    }
    let app_name = context.app_name.clone().unwrap_or_else(|| "Rooiam".to_string());
    let demo_email = normalize_demo_email(query.email.as_deref())
        .unwrap_or_else(|| demo_default_email_for_context(query.surface.as_deref(), context.workspace_slug.as_deref()).to_string());
    let continue_state = create_demo_continue_state(
        &state,
        &provider,
        &redirect_uri,
        query.surface.as_deref(),
        Some(&demo_email),
        client_ip_string_from_http_request(&req, state.config.as_ref()),
        req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
    ).await?;

    let continue_url = format!("/v1/oauth/demo/{}/continue", provider);
    let frontend_url = effective_enduser_url(&state.db).await?;
    let cancel_url = format!(
        "{}?redirect_uri={}",
        frontend_url.trim_end_matches('/'),
        encode_query_value(&redirect_uri),
    );

    Ok(HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(render_demo_oauth_page(
            &provider,
            &demo_email,
            context.workspace_slug.as_deref(),
            Some(&app_name),
            &continue_url,
            &continue_state,
            &cancel_url,
        )))
}

pub async fn demo_provider_continue(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<String>,
    query: web::Query<DemoOAuthPathQuery>,
    form: Option<web::Form<DemoOAuthContinueForm>>,
) -> Result<HttpResponse, AppError> {
    let provider = path.into_inner().to_lowercase();
    let state_token = query
        .state
        .as_deref()
        .or_else(|| form.as_ref().and_then(|body| body.state.as_deref()))
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::Validation("Invalid or expired demo OAuth state".into()))?;
    let redis_key = format!("demo_oauth_state:{}", state_token);
    let mut redis_conn = state.redis.clone();
    let payload_raw: String = redis::cmd("GET")
        .arg(&redis_key)
        .query_async(&mut redis_conn)
        .await
        .map_err(|_| AppError::Validation("Invalid or expired demo OAuth state".into()))?;
    let _: () = redis::cmd("DEL").arg(&redis_key).query_async(&mut redis_conn).await.unwrap_or(());
    let payload = serde_json::from_str::<DemoOAuthContinueStatePayload>(&payload_raw)
        .map_err(|_| AppError::Validation("Invalid or expired demo OAuth state".into()))?;
    if payload.provider != provider {
        return Err(AppError::Validation("Invalid demo OAuth provider state".into()));
    }
    let callback_ip = client_ip_string_from_http_request(&req, state.config.as_ref());
    if let (Some(stored_ip), Some(current_ip)) = (&payload.initiated_ip, &callback_ip) {
        if stored_ip != current_ip {
            return Err(AppError::Validation("Demo OAuth state validation failed".into()));
        }
    }
    let callback_ua = req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from);
    if let (Some(stored_ua), Some(current_ua)) = (&payload.initiated_ua, &callback_ua) {
        if stored_ua != current_ua {
            return Err(AppError::Validation("Demo OAuth state validation failed".into()));
        }
    }
    let redirect_uri = validate_redirect_uri(&payload.redirect_uri)?;
    let (_, effective_ip_policy) = resolve_effective_ip_policy_for_redirect(&state.db, Some(&redirect_uri)).await?;
    let decision = evaluate_ip_access(
        &effective_ip_policy,
        client_ip_from_http_request(&req, state.config.as_ref()),
    )?;
    if decision != crate::shared::ip_policy::IpAccessDecision::Allowed {
        return Err(AppError::Forbidden(access_denied_message(&decision).into()));
    }
    complete_demo_oauth_login(
        req,
        state,
        &provider,
        &redirect_uri,
        payload.surface.as_deref(),
        payload.email.as_deref(),
    ).await
}

pub(crate) async fn start_oauth_flow(
    state: &web::Data<AppState>,
    provider: &str,
    redirect_uri: Option<&str>,
    surface: Option<&str>,
    intent: &str,
    link_user_id: Option<Uuid>,
    initiated_ip: Option<String>,
    initiated_ua: Option<String>,
    pending_oauth_key: Option<String>,
) -> Result<String, AppError> {
    let runtime_config = load_runtime_oauth_config_with_pending(state, pending_oauth_key.as_deref()).await?;
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let state_token = URL_SAFE_NO_PAD.encode(bytes);

    let redis_key = format!("oauth_state:{}", state_token);
    let mut redis_conn = state.redis.clone();

    let final_redirect = match redirect_uri {
        Some(value) => {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                tracing::error!(
                    provider = %provider,
                    surface = ?surface,
                    intent = %intent,
                    "start_oauth_flow: empty redirect_uri — cannot store final_redirect"
                );
                return Err(AppError::Validation(
                    "redirect_uri is required to start an OAuth flow. \
                     For embedded widget flows, provide widget_login_context instead.".into()
                ));
            }
            let is_registered_redirect = is_registered_oauth_redirect_uri(&state.db, trimmed).await?;
            let resolved = resolve_final_redirect_uri_from_validation(
                trimmed,
                validate_redirect_uri(trimmed),
                is_registered_redirect,
            )?;
            tracing::info!(
                provider = %provider,
                surface = ?surface,
                intent = %intent,
                final_redirect = %resolved,
                is_registered = %is_registered_redirect,
                "start_oauth_flow: final_redirect resolved"
            );
            resolved
        }
        None => {
            tracing::error!(
                provider = %provider,
                surface = ?surface,
                intent = %intent,
                "start_oauth_flow: redirect_uri is None — cannot store final_redirect"
            );
            return Err(AppError::Validation(
                "redirect_uri is required to start an OAuth flow. \
                 For embedded widget flows, provide widget_login_context instead.".into()
            ));
        }
    };
    let normalized_provider = provider.to_lowercase();
    let normalized_surface = surface.unwrap_or("user").to_lowercase();
    let auth_method = match normalized_provider.as_str() {
        "google" => AuthMethod::Google,
        "microsoft" => AuthMethod::Microsoft,
        _ => return Err(AppError::Validation(format!("Unsupported provider: {}", normalized_provider))),
    };

    if intent == "login" {
        ensure_auth_method_allowed(&state.db, Some(&final_redirect), auth_method).await?;
    }

    if normalized_surface == "admin" && intent == "login" && pending_oauth_key.is_none() {
        let setting_key = match normalized_provider.as_str() {
            "google" => "google_admin_login_enabled",
            "microsoft" => "microsoft_admin_login_enabled",
            _ => "",
        };
        if setting_key.is_empty() {
            return Err(AppError::Validation("Unsupported provider".into()));
        }
        // DEMO MODE: always allow Google/Microsoft on admin login — real OAuth is replaced
        // by the fake demo OAuth flow so no real credentials
        // are needed. Never remove this bypass or admin demo login will break with
        // "This provider is not enabled for admin sign-in yet."
        let enabled = crate::shared::demo_seed::demo_seed_enabled()
            || get_setting(&state.db, setting_key).await?.unwrap_or_default() == "true";
        if !enabled {
            return Err(AppError::Validation(
                "This provider is not enabled for admin sign-in yet. Verify it first in Settings > OAuth.".into()
            ));
        }
    }

    let _: () = redis::cmd("SETEX")
        .arg(&redis_key)
        .arg(600)
        .arg(
            serde_json::to_string(&OAuthStatePayload {
                intent: intent.to_string(),
                final_redirect: final_redirect.clone(),
                provider: normalized_provider.clone(),
                surface: Some(normalized_surface.clone()),
                link_user_id,
                pending_oauth_key: pending_oauth_key.clone(),
                initiated_ip,
                initiated_ua,
            })
            .map_err(|e| AppError::Internal(format!("Failed to encode OAuth state payload: {}", e)))?,
        )
        .query_async(&mut redis_conn)
        .await
        .map_err(|e| AppError::Internal(format!("Redis auth state failure: {}", e)))?;

    let auth_url = match normalized_provider.as_str() {
        "google" => {
            let mut url = Url::parse("https://accounts.google.com/o/oauth2/v2/auth").unwrap();
            url.query_pairs_mut()
                .append_pair("client_id", &runtime_config.oauth.google_client_id)
                .append_pair("redirect_uri", &runtime_config.oauth.google_redirect_uri)
                .append_pair("response_type", "code")
                .append_pair("scope", "openid email profile")
                .append_pair("state", &state_token)
                .append_pair("access_type", "offline");
            url.to_string()
        }
        "microsoft" => {
            let mut url = Url::parse(
                &format!(
                    "https://login.microsoftonline.com/{}/oauth2/v2.0/authorize",
                    runtime_config.oauth.microsoft_tenant_id
                )
            )
            .unwrap();
            url.query_pairs_mut()
                .append_pair("client_id", &runtime_config.oauth.microsoft_client_id)
                .append_pair("redirect_uri", &runtime_config.oauth.microsoft_redirect_uri)
                .append_pair("response_type", "code")
                .append_pair("scope", "openid email profile User.Read offline_access")
                .append_pair("state", &state_token)
                .append_pair("response_mode", "query");
            url.to_string()
        }
        _ => unreachable!("provider validated above"),
    };

    Ok(auth_url)
}

async fn admin_login_error_redirect(state: &web::Data<AppState>, message: &str) -> Result<HttpResponse, AppError> {
    let admin_url = effective_admin_url(&state.db).await?;
    let mut url = Url::parse(&format!("{}/login", admin_url.trim_end_matches('/')))
        .map_err(|e| AppError::Internal(format!("Invalid ROOIAM_ADMIN_URL: {}", e)))?;
    url.query_pairs_mut().append_pair("error", message);
    Ok(HttpResponse::Found()
        .insert_header(("Location", url.to_string()))
        .finish())
}

async fn user_login_error_redirect(
    state: &web::Data<AppState>,
    redirect_uri: Option<&str>,
    message: &str,
) -> Result<HttpResponse, AppError> {
    let frontend_url = effective_enduser_url(&state.db).await?;
    let mut url = Url::parse(&frontend_url)
        .map_err(|e| AppError::Internal(format!("Invalid ROOIAM_APP_URL: {}", e)))?;
    url.query_pairs_mut().append_pair("error", message);
    if let Some(redirect_uri) = redirect_uri.filter(|value| !value.trim().is_empty()) {
        url.query_pairs_mut().append_pair("redirect_uri", redirect_uri);
    }
    Ok(HttpResponse::Found()
        .insert_header(("Location", url.to_string()))
        .finish())
}

async fn widget_expired_error_redirect(
    state: &web::Data<AppState>,
    query: &AuthRequest,
) -> Result<Option<HttpResponse>, AppError> {
    let client_id = query.client_id.as_deref().map(str::trim).filter(|value| !value.is_empty());
    let embed_origin = query.widget_embed_origin.as_deref().map(str::trim).filter(|value| !value.is_empty());
    let Some(client_id) = client_id else {
        return Ok(None);
    };
    let Some(embed_origin) = embed_origin else {
        return Ok(None);
    };

    let workspace_id = query.workspace_id.as_deref().map(str::trim).filter(|value| !value.is_empty());
    let workspace = query
        .workspace
        .as_deref()
        .or(query.org.as_deref())
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let allowed = sqlx::query_scalar::<_, i32>(
        r#"
        SELECT 1
        FROM oauth_clients c
        JOIN oauth_client_allowed_embed_origins ae ON ae.oauth_client_id = c.id
        WHERE c.client_id = $1
          AND c.status = 'active'
          AND ae.origin = $2
          AND (
            $3::uuid IS NULL
            OR c.org_id = $3
            OR EXISTS (
                SELECT 1
                FROM organizations o
                WHERE o.id = c.org_id
                  AND o.slug = $4
            )
          )
        LIMIT 1
        "#,
    )
    .bind(client_id)
    .bind(embed_origin)
    .bind(workspace_id.and_then(|value| Uuid::parse_str(value).ok()))
    .bind(workspace)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(format!("Failed to validate hosted login widget app access: {}", e)))?
    .is_some();

    if !allowed {
        return Ok(None);
    }

    let issuer_url = effective_public_urls(&state.db, state.config.as_ref()).await?.issuer_url;
    let mut url = Url::parse(&format!("{}/login-widget", issuer_url.trim_end_matches('/')))
        .map_err(|e| AppError::Internal(format!("Invalid issuer URL: {}", e)))?;
    {
        let mut pairs = url.query_pairs_mut();
        pairs.append_pair("widget_error", "expired");
        pairs.append_pair("client_id", client_id);
        if let Some(value) = workspace_id {
            pairs.append_pair("workspace_id", value);
        }
        if let Some(value) = workspace {
            pairs.append_pair("workspace", value);
        }
        if let Some(value) = query.app.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
            pairs.append_pair("app", value);
        }
        if let Some(value) = query.surface.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
            pairs.append_pair("surface", value);
        }
    }

    Ok(Some(
        HttpResponse::Found()
            .insert_header(("Location", url.to_string()))
            .finish(),
    ))
}

/// Initiates the OAuth2 flow by redirecting the user to the provider
async fn login(
    req: HttpRequest,
    state: web::Data<AppState>,
    query: web::Query<AuthRequest>,
) -> Result<HttpResponse, AppError> {
    // Validate required params up front — no silent fallbacks.
    {
        let provider = query.provider.trim();
        if provider.is_empty() {
            return Err(AppError::Validation("Missing required parameter: provider".into()));
        }
        match provider {
            "google" | "microsoft" => {}
            other => return Err(AppError::Validation(format!(
                "Invalid provider '{}'. Must be 'google' or 'microsoft'.", other
            ))),
        }

        let has_widget_context = query.widget_login_context.as_deref().map(str::trim).filter(|v| !v.is_empty()).is_some();
        let has_redirect_uri   = query.redirect_uri.as_deref().map(str::trim).filter(|v| !v.is_empty()).is_some();
        let has_embed_origin   = query.widget_embed_origin.as_deref().map(str::trim).filter(|v| !v.is_empty()).is_some();

        // Widget flows must send widget_login_context + widget_embed_origin, never redirect_uri.
        // Non-widget flows must send redirect_uri, never widget_login_context.
        if has_embed_origin && !has_widget_context {
            return Err(AppError::Validation(
                "widget_embed_origin requires widget_login_context. \
                 Call GET /setup/login-bootstrap with client_id and widget_embed_origin first.".into()
            ));
        }
        if has_widget_context && has_redirect_uri {
            return Err(AppError::Validation(
                "Provide either widget_login_context or redirect_uri, not both.".into()
            ));
        }
        if !has_widget_context && !has_redirect_uri {
            return Err(AppError::Validation(
                "Missing required parameter: provide widget_login_context (for embedded widget flows) \
                 or redirect_uri (for direct flows).".into()
            ));
        }

        // Validate redirect_uri format when provided directly.
        if let Some(uri) = query.redirect_uri.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
            if Url::parse(uri).is_err() && !uri.starts_with('/') {
                return Err(AppError::Validation(format!(
                    "redirect_uri is not a valid URL: '{}'", uri
                )));
            }
        }
    }

    let widget_login_context = match consume_widget_login_context(&state, query.widget_login_context.as_deref()).await {
        Ok(value) => value,
        Err(AppError::Validation(message)) if is_widget_login_context_invalid_error(&message) => {
            AuditService::new(state.db.clone()).log(AuditEvent {
                actor_user_id: None,
                organization_id: crate::shared::platform_org::get_platform_org_id(&state.db).await,
                action: "auth.widget.context_invalid".into(),
                target_type: "widget_login_context".into(),
                target_id: query.widget_login_context.clone(),
                ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
                metadata: serde_json::json!({
                    "reason": "expired_or_replayed",
                    "embed_origin": query.widget_embed_origin,
                    "surface": query.surface,
                    "stage": "oauth_start",
                    "provider": query.provider,
                }),
            }).await;
            AuditService::new(state.db.clone()).log(AuditEvent {
                actor_user_id: None,
                organization_id: crate::shared::platform_org::get_platform_org_id(&state.db).await,
                action: "auth.widget.expired".into(),
                target_type: "widget_login_context".into(),
                target_id: query.widget_login_context.clone(),
                ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
                metadata: serde_json::json!({
                    "embed_origin": query.widget_embed_origin,
                    "surface": query.surface,
                    "stage": "oauth_start",
                    "provider": query.provider,
                }),
            }).await;
            if let Some(response) = widget_expired_error_redirect(&state, &query).await? {
                return Ok(response);
            }
            return Err(AppError::Validation(message));
        }
        Err(err) => return Err(err),
    };
    if let Some(ctx) = widget_login_context.as_ref() {
        let supplied_embed_origin = query.widget_embed_origin.as_deref().map(str::trim).filter(|value| !value.is_empty());
        if supplied_embed_origin != Some(ctx.embed_origin.as_str()) {
            return Err(AppError::Forbidden(
                "Hosted login session mismatch: this widget session was issued for a different site. Refresh the widget on the current site and try again.".into()
            ));
        }
    }

    // If widget_embed_origin is present, this request comes from an embedded widget.
    // widget_login_context is mandatory in that case — it is the only source of the
    // registered redirect_uri. Falling back to query.redirect_uri is not allowed because
    // the widget never sends a redirect_uri (it has no access to the registered callback).
    let widget_embed_origin = query.widget_embed_origin.as_deref().map(str::trim).filter(|value| !value.is_empty());
    if widget_embed_origin.is_some() && widget_login_context.is_none() {
        tracing::error!(
            provider = %query.provider,
            embed_origin = ?widget_embed_origin,
            client_id = ?query.client_id,
            surface = ?query.surface,
            "oauth/login rejected: widget_embed_origin present but widget_login_context missing or expired"
        );
        return Err(AppError::Validation(
            "widget_login_context is required for embedded widget OAuth. \
             The login session may have expired — refresh the login widget and try again.".into()
        ));
    }

    let effective_redirect_uri = widget_login_context
        .as_ref()
        .map(|ctx| {
            tracing::info!(
                provider = %query.provider,
                redirect_uri = %ctx.redirect_uri,
                client_id = %ctx.client_id,
                embed_origin = %ctx.embed_origin,
                "oauth/login: using redirect_uri from widget_login_context"
            );
            ctx.redirect_uri.as_str()
        })
        .or(query.redirect_uri.as_deref());

    // For non-widget, non-admin OAuth flows redirect_uri must be present.
    // Admin and link flows always pass Some(...) from their handlers.
    if effective_redirect_uri.is_none() && widget_embed_origin.is_none() {
        tracing::error!(
            provider = %query.provider,
            surface = ?query.surface,
            intent = %query.intent.as_deref().unwrap_or("login"),
            "oauth/login rejected: no redirect_uri and no widget_login_context"
        );
        return Err(AppError::Validation(
            "redirect_uri is required. For embedded widget flows, provide widget_login_context instead.".into()
        ));
    }
    let intent = query.intent.as_deref().unwrap_or("login").to_lowercase();
    if intent == "login" {
        let (_, effective_ip_policy) =
            resolve_effective_ip_policy_for_redirect(&state.db, effective_redirect_uri).await?;
        let decision = evaluate_ip_access(
            &effective_ip_policy,
            client_ip_from_http_request(&req, state.config.as_ref()),
        )?;
        if decision != crate::shared::ip_policy::IpAccessDecision::Allowed {
            return match query.surface.as_deref() {
                Some("admin") => admin_login_error_redirect(&state, access_denied_message(&decision)).await,
                _ => user_login_error_redirect(&state, effective_redirect_uri, access_denied_message(&decision)).await,
            };
        }
    }
    let initiated_ip = client_ip_string_from_http_request(&req, state.config.as_ref());
    let initiated_ua = req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from);
    let auth_url = match start_oauth_flow(
        &state,
        &query.provider,
        effective_redirect_uri,
        query.surface.as_deref(),
        &intent,
        None,
        initiated_ip,
        initiated_ua,
        None,
    )
    .await
    {
        Ok(url) => url,
        Err(AppError::Validation(message)) if query.surface.as_deref() == Some("admin") && intent == "login" => {
            if message.contains("redirect_uri") {
                AuditService::new(state.db.clone()).log(AuditEvent {
                    actor_user_id: None,
                    organization_id: crate::shared::platform_org::get_platform_org_id(&state.db).await,
                    action: "auth.app_callback_rejected".into(),
                    target_type: "redirect_uri".into(),
                    target_id: effective_redirect_uri.map(str::to_string),
                    ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                    user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
                    metadata: serde_json::json!({
                        "method": query.provider,
                        "surface": query.surface,
                        "intent": intent,
                    }),
                }).await;
            }
            return admin_login_error_redirect(&state, &message).await;
        }
        Err(AppError::Validation(message)) if intent == "login" => {
            if message.contains("redirect_uri") {
                AuditService::new(state.db.clone()).log(AuditEvent {
                    actor_user_id: None,
                    organization_id: crate::shared::platform_org::get_platform_org_id(&state.db).await,
                    action: "auth.app_callback_rejected".into(),
                    target_type: "redirect_uri".into(),
                    target_id: effective_redirect_uri.map(str::to_string),
                    ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
                    user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
                    metadata: serde_json::json!({
                        "method": query.provider,
                        "surface": query.surface,
                        "intent": intent,
                    }),
                }).await;
            }
            return user_login_error_redirect(&state, effective_redirect_uri, &message).await;
        }
        Err(err) => return Err(err),
    };

    // Redirect the user to the Authorization URL
    Ok(actix_web::HttpResponse::Found()
        .insert_header(("Location", auth_url))
        .finish())
}

/// Receives the authorization code from the provider
async fn callback(
    req: HttpRequest,
    state: web::Data<AppState>,
    path: web::Path<String>, // provider
    query: web::Query<CallbackQuery>,
) -> Result<HttpResponse, AppError> {
    let provider = path.into_inner().to_lowercase();
    if let Some(error) = query.error.as_deref() {
        AuditService::new(state.db.clone()).log(AuditEvent {
            actor_user_id: None,
            organization_id: None,
            action: "oauth.login.failed".into(),
            target_type: "oauth_provider".into(),
            target_id: Some(provider.clone()),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
            metadata: serde_json::json!({
                "error": "oauth_provider_error",
                "provider_error": error,
                "error_description": query.error_description,
                "error_subtype": query.error_subtype,
            }),
        }).await;
        return Err(AppError::Validation(
            query.error_description.clone().unwrap_or_else(|| "OAuth sign-in was cancelled or denied.".to_string())
        ));
    }

    let code = query.code.clone().ok_or_else(|| AppError::Validation("Missing OAuth authorization code".into()))?;
    let state_token = query.state.clone();
    let ip = client_ip_string_from_http_request(&req, state.config.as_ref());
    let ua = req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from);

    // Verify state token from Redis
    let redis_key = format!("oauth_state:{}", state_token);
    let mut redis_conn = state.redis.clone();
    
    let state_payload_raw: String = match redis::cmd("GET")
        .arg(&redis_key)
        .query_async(&mut redis_conn)
        .await
    {
        Ok(it) => it,
        Err(_) => {
            AuditService::new(state.db.clone()).log(AuditEvent {
                actor_user_id: None,
                organization_id: None,
                action: "oauth.login.failed".into(),
                target_type: "oauth_provider".into(),
                target_id: Some(provider.clone()),
                ip: ip.clone(),
                user_agent: ua.clone(),
                metadata: serde_json::json!({ "error": "invalid_or_expired_oauth_state" }),
            }).await;
            return Err(AppError::Validation("Invalid or expired OAuth state".into()));
        }
    };
    let state_payload = serde_json::from_str::<OAuthStatePayload>(&state_payload_raw)
        .unwrap_or(OAuthStatePayload {
            intent: "login".to_string(),
            final_redirect: state_payload_raw.clone(),
            provider: provider.clone(),
            surface: None,
            link_user_id: None,
            pending_oauth_key: None,
            initiated_ip: None,
            initiated_ua: None,
        });
    let final_redirect = state_payload.final_redirect;
    let intent = state_payload.intent;
    let surface = state_payload.surface.unwrap_or_else(|| "user".to_string());
    if state_payload.provider != provider {
        AuditService::new(state.db.clone()).log(AuditEvent {
            actor_user_id: None,
            organization_id: None,
            action: "oauth.login.failed".into(),
            target_type: "oauth_provider".into(),
            target_id: Some(provider.clone()),
            ip: ip.clone(),
            user_agent: ua.clone(),
            metadata: serde_json::json!({
                "error": "oauth_state_provider_mismatch",
                "state_provider": state_payload.provider,
                "callback_provider": provider,
            }),
        }).await;
        let _: () = redis::cmd("DEL").arg(&redis_key).query_async(&mut redis_conn).await.unwrap_or(());
        return Err(AppError::Validation("OAuth state validation failed".into()));
    }
    let auth_method = match provider.as_str() {
        "google" => AuthMethod::Google,
        "microsoft" => AuthMethod::Microsoft,
        _ => return Err(AppError::Validation("Unsupported provider".into())),
    };
    let is_provider_test = Url::parse(&final_redirect)
        .ok()
        .and_then(|url| {
            url.query_pairs()
                .find(|(key, _)| key == "oauth_test_provider")
                .map(|(_, value)| value == provider)
        })
        .unwrap_or(false);

    // Delete state token to prevent reuse
    let _: () = redis::cmd("DEL").arg(&redis_key).query_async(&mut redis_conn).await.unwrap_or(());

    // Browser binding: reject if IP differs from the one that initiated the flow.
    // This detects state token theft (e.g. via Referer header) and CSRF replay from a different client.
    // UA check is advisory-only (logged) because mobile browsers can change UA on redirect.
    //
    // If IP was captured at flow initiation (initiated_ip = Some), the callback IP must match.
    // If IP was not captured at initiation (initiated_ip = None), we reject the callback to prevent
    // a bypass where an attacker deliberately triggers an IP-less initiation and replays the state.
    match (&state_payload.initiated_ip, &ip) {
        (Some(stored_ip), Some(callback_ip)) => {
            if stored_ip != callback_ip {
                tracing::warn!(
                    stored_ip = %stored_ip,
                    callback_ip = %callback_ip,
                    provider = %provider,
                    "OAuth state IP mismatch — possible CSRF token theft"
                );
                AuditService::new(state.db.clone()).log(AuditEvent {
                    actor_user_id: None,
                    organization_id: None,
                    action: "oauth.login.failed".into(),
                    target_type: "oauth_provider".into(),
                    target_id: Some(provider.clone()),
                    ip: ip.clone(),
                    user_agent: ua.clone(),
                    metadata: serde_json::json!({ "error": "oauth_state_ip_mismatch", "stored_ip": stored_ip, "callback_ip": callback_ip }),
                }).await;
                return Err(AppError::Validation("OAuth state validation failed".into()));
            }
        }
        (None, _) => {
            // IP was not captured when the flow started — reject to prevent None-bypass attacks.
            tracing::warn!(provider = %provider, "OAuth callback rejected: IP not captured at flow initiation");
            AuditService::new(state.db.clone()).log(AuditEvent {
                actor_user_id: None,
                organization_id: None,
                action: "oauth.login.failed".into(),
                target_type: "oauth_provider".into(),
                target_id: Some(provider.clone()),
                ip: ip.clone(),
                user_agent: ua.clone(),
                metadata: serde_json::json!({ "error": "oauth_state_ip_missing" }),
            }).await;
            return Err(AppError::Validation("OAuth state validation failed".into()));
        }
        (Some(_), None) => {
            // IP was recorded at initiation but cannot be resolved at callback (proxy misconfiguration).
            // Reject — cannot verify binding.
            tracing::warn!(provider = %provider, "OAuth callback rejected: IP unresolvable at callback");
            AuditService::new(state.db.clone()).log(AuditEvent {
                actor_user_id: None,
                organization_id: None,
                action: "oauth.login.failed".into(),
                target_type: "oauth_provider".into(),
                target_id: Some(provider.clone()),
                ip: None,
                user_agent: ua.clone(),
                metadata: serde_json::json!({ "error": "oauth_callback_ip_unresolvable" }),
            }).await;
            return Err(AppError::Validation("OAuth state validation failed".into()));
        }
    }
    if let (Some(stored_ua), Some(callback_ua)) = (&state_payload.initiated_ua, &ua) {
        if stored_ua != callback_ua {
            tracing::warn!(
                provider = %provider,
                "OAuth state UA mismatch — browser may have changed user-agent on redirect (non-fatal)"
            );
        }
    }

    if code.trim().is_empty() {
        AuditService::new(state.db.clone()).log(AuditEvent {
            actor_user_id: None,
            organization_id: None,
            action: "oauth.login.failed".into(),
            target_type: "oauth_provider".into(),
            target_id: Some(provider.clone()),
            ip: ip.clone(),
            user_agent: ua.clone(),
            metadata: serde_json::json!({ "error": "oauth_callback_missing_code" }),
        }).await;
        return Err(AppError::Validation("OAuth callback missing provider code".into()));
    }

    if !is_provider_test && intent != "link" {
        let (_, effective_ip_policy) = resolve_effective_ip_policy_for_redirect(&state.db, Some(&final_redirect)).await?;
        let decision = evaluate_ip_access(
            &effective_ip_policy,
            client_ip_from_http_request(&req, state.config.as_ref()),
        )?;
        if decision != crate::shared::ip_policy::IpAccessDecision::Allowed {
            return match surface.as_str() {
                "admin" => admin_login_error_redirect(&state, access_denied_message(&decision)).await,
                _ => user_login_error_redirect(&state, Some(&final_redirect), access_denied_message(&decision)).await,
            };
        }
        if let Err(AppError::Validation(message)) =
            ensure_auth_method_allowed(&state.db, Some(&final_redirect), auth_method).await
        {
            return match surface.as_str() {
                "admin" => admin_login_error_redirect(&state, &message).await,
                _ => user_login_error_redirect(&state, Some(&final_redirect), &message).await,
            };
        }
    }

    let runtime_config = load_runtime_oauth_config_with_pending(
        &state,
        state_payload.pending_oauth_key.as_deref(),
    ).await?;

    // Phase 4.2 Logic
    let identity_repo = IdentityRepository::new(state.db.clone());
    let oauth_service = super::service::OAuthService::new(identity_repo, runtime_config);
    let identity = match oauth_service.fetch_provider_identity(&provider, &code).await {
        Ok(identity) => identity,
        Err(e) => {
            tracing::error!("OAuth Callback Error: {}", e);
            if is_provider_test {
                AuditService::new(state.db.clone()).log(AuditEvent {
                    actor_user_id: None,
                    organization_id: None,
                    action: format!("setup.oauth.{}.verification_failed", provider),
                    target_type: "system_setting".into(),
                    target_id: Some(format!("{}_oauth", provider)),
                    ip: ip.clone(),
                    user_agent: ua.clone(),
                    metadata: serde_json::json!({ "error": e.to_string(), "provider": provider }),
                }).await;
                return Err(e);
            }
            AuditService::new(state.db.clone()).log(AuditEvent {
                actor_user_id: None,
                organization_id: None,
                action: "oauth.login.failed".into(),
                target_type: "oauth_provider".into(),
                target_id: Some(provider.clone()),
                ip: ip.clone(),
                user_agent: ua.clone(),
                metadata: serde_json::json!({ "error": e.to_string() }),
            }).await;
            if intent == "login" {
                return match surface.as_str() {
                    "admin" => admin_login_error_redirect(&state, &e.to_string()).await,
                    _ => user_login_error_redirect(&state, Some(&final_redirect), &e.to_string()).await,
                };
            }
            return Err(e);
        }
    };

    if is_provider_test {
        if let Some(pending_key) = state_payload.pending_oauth_key.as_deref().filter(|value| !value.trim().is_empty()) {
            let redis_key = format!("pending_oauth_verify:{}", pending_key);
            let mut redis_conn = state.redis.clone();
            let payload: Option<String> = redis::cmd("GET")
                .arg(&redis_key)
                .query_async(&mut redis_conn)
                .await
                .map_err(|e| AppError::Internal(format!("Redis auth state failure: {}", e)))?;

            let Some(raw_payload) = payload else {
                AuditService::new(state.db.clone()).log(AuditEvent {
                    actor_user_id: None,
                    organization_id: None,
                    action: format!("setup.oauth.{}.verification_failed", provider),
                    target_type: "system_setting".into(),
                    target_id: Some(format!("{}_oauth", provider)),
                    ip: ip.clone(),
                    user_agent: ua.clone(),
                    metadata: serde_json::json!({ "error": "verification draft expired", "provider": provider }),
                }).await;
                return Err(AppError::Validation("OAuth verification draft expired. Start the provider test again.".into()));
            };

            let pending: PendingOAuthVerificationPayload = serde_json::from_str(&raw_payload)
                .map_err(|e| AppError::Internal(format!("Invalid pending OAuth verification payload: {}", e)))?;

            match pending.save_scope.as_deref() {
                Some("organization") => {
                    let org_id = pending.organization_id
                        .ok_or_else(|| AppError::Validation("Missing tenant target for OAuth verification.".into()))?;
                    sqlx::query(
                        "INSERT INTO tenant_auth_config (org_id) VALUES ($1) ON CONFLICT (org_id) DO NOTHING"
                    )
                    .bind(org_id)
                    .execute(&state.db)
                    .await
                    .map_err(|e| AppError::Internal(format!("Failed to initialize tenant OAuth configuration: {}", e)))?;

                    match pending.provider.as_str() {
                        "google" => {
                            let enc = crate::modules::organization::handlers::encrypt_secret(
                                pending.client_secret.trim(),
                                &state.config,
                            )?;
                            sqlx::query(
                                "UPDATE tenant_auth_config SET google_client_id = $1, google_client_secret = $2, updated_at = NOW() WHERE org_id = $3"
                            )
                            .bind(pending.client_id.trim())
                            .bind(&enc)
                            .bind(org_id)
                            .execute(&state.db)
                            .await
                            .map_err(|e| AppError::Internal(format!("Failed to save tenant Google OAuth settings: {}", e)))?;
                        }
                        "microsoft" => {
                            let enc = crate::modules::organization::handlers::encrypt_secret(
                                pending.client_secret.trim(),
                                &state.config,
                            )?;
                            sqlx::query(
                                "UPDATE tenant_auth_config SET microsoft_client_id = $1, microsoft_client_secret = $2, microsoft_tenant_id = $3, updated_at = NOW() WHERE org_id = $4"
                            )
                            .bind(pending.client_id.trim())
                            .bind(&enc)
                            .bind(pending.tenant_id.as_deref().unwrap_or("common").trim())
                            .bind(org_id)
                            .execute(&state.db)
                            .await
                            .map_err(|e| AppError::Internal(format!("Failed to save tenant Microsoft OAuth settings: {}", e)))?;
                        }
                        _ => return Err(AppError::Validation("Unsupported provider".into())),
                    }

                    AuditService::new(state.db.clone()).log(AuditEvent {
                        actor_user_id: pending.actor_user_id,
                        organization_id: Some(org_id),
                        action: format!("tenant_auth_config.{}.verified", pending.provider),
                        target_type: "organization".into(),
                        target_id: Some(org_id.to_string()),
                        ip: ip.clone(),
                        user_agent: ua.clone(),
                        metadata: serde_json::json!({
                            "provider": pending.provider,
                            "client_id": pending.client_id,
                            "tenant_id": pending.tenant_id,
                            "source": "tenant_oauth_verification",
                        }),
                    }).await;
                }
                _ => match pending.provider.as_str() {
                    "google" => {
                        set_system_setting(&state.db, "google_client_id", pending.client_id.trim()).await?;
                        set_system_setting(&state.db, "google_client_secret", pending.client_secret.trim()).await?;
                        set_system_setting(&state.db, "google_admin_login_enabled", "false").await?;
                    }
                    "microsoft" => {
                        set_system_setting(&state.db, "microsoft_client_id", pending.client_id.trim()).await?;
                        set_system_setting(&state.db, "microsoft_client_secret", pending.client_secret.trim()).await?;
                        set_system_setting(
                            &state.db,
                            "microsoft_tenant_id",
                            pending.tenant_id.as_deref().unwrap_or("common").trim(),
                        ).await?;
                        set_system_setting(&state.db, "microsoft_admin_login_enabled", "false").await?;
                    }
                    _ => return Err(AppError::Validation("Unsupported provider".into())),
                }
            }

            let _: () = redis::cmd("DEL")
                .arg(&redis_key)
                .query_async(&mut redis_conn)
                .await
                .unwrap_or(());
        }

        let timestamp = chrono::Utc::now().to_rfc3339();
        let key = match provider.as_str() {
            "google" => "google_oauth_verified_at",
            "microsoft" => "microsoft_oauth_verified_at",
            _ => "",
        };
        if !key.is_empty() {
            set_system_setting(&state.db, key, &timestamp).await?;
        }

        AuditService::new(state.db.clone()).log(AuditEvent {
            actor_user_id: None,
            organization_id: None,
            action: format!("setup.oauth.{}.verified", provider),
            target_type: "system_setting".into(),
            target_id: Some(format!("{}_oauth", provider)),
            ip: client_ip_string_from_http_request(&req, state.config.as_ref()),
            user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
            metadata: serde_json::json!({ "verified_at": timestamp, "provider": provider }),
        }).await;

        let final_redirect = mark_oauth_test_result(&final_redirect, &provider, "success");
        return Ok(HttpResponse::Found()
            .insert_header(("Location", final_redirect))
            .finish());
    }

    if intent == "link" {
        let Some(target_user_id) = state_payload.link_user_id else {
            let final_redirect = mark_oauth_link_result(&final_redirect, &provider, "error", "Missing link target.");
            return Ok(HttpResponse::Found()
                .insert_header(("Location", final_redirect))
                .finish());
        };

        let session_cookie = req.cookie(ROOIAM_SESSION_COOKIE);
        let Some(session_cookie) = session_cookie else {
            let final_redirect = mark_oauth_link_result(&final_redirect, &provider, "error", "Sign in again before linking accounts.");
            return Ok(HttpResponse::Found()
                .insert_header(("Location", final_redirect))
                .finish());
        };

        let session_repo = SessionRepository::new(state.db.clone());
        let session_service = SessionService::new(session_repo, state.db.clone());
        let active_session = match session_service.verify_opaque_session(session_cookie.value()).await {
            Ok(session) => session,
            Err(_) => {
                let final_redirect = mark_oauth_link_result(&final_redirect, &provider, "error", "Sign in again before linking accounts.");
                return Ok(HttpResponse::Found()
                    .insert_header(("Location", final_redirect))
                    .finish());
            }
        };

        if active_session.user_id != target_user_id {
            let final_redirect = mark_oauth_link_result(&final_redirect, &provider, "error", "The active session does not match the account being linked.");
            return Ok(HttpResponse::Found()
                .insert_header(("Location", final_redirect))
                .finish());
        }

        if let Some(owner_user_id) = IdentityRepository::new(state.db.clone())
            .get_user_id_by_external_identity(&provider, &identity.provider_user_id)
            .await?
        {
            if owner_user_id == target_user_id {
                let final_redirect = mark_oauth_link_result(&final_redirect, &provider, "success", "This provider is already linked to your account.");
                return Ok(HttpResponse::Found()
                    .insert_header(("Location", final_redirect))
                    .finish());
            }

            let final_redirect = mark_oauth_link_result(
                &final_redirect,
                &provider,
                "error",
                "This provider account is already linked to another Rooiam account in this instance. That can still be one of your own other sign-in records.",
            );
            return Ok(HttpResponse::Found()
                .insert_header(("Location", final_redirect))
                .finish());
        }

        IdentityRepository::new(state.db.clone())
            .link_external_identity(
                target_user_id,
                &provider,
                &identity.provider_user_id,
                identity.email.clone(),
            )
            .await?;

        AuditService::new(state.db.clone()).log(AuditEvent {
            actor_user_id: Some(target_user_id),
            organization_id: None,
            action: format!("identity.link.{}", provider),
            target_type: "external_identity".into(),
            target_id: Some(identity.provider_user_id.clone()),
            ip,
            user_agent: ua,
            metadata: serde_json::json!({
                "provider": provider,
                "linked_email": identity.email,
                "intent": "link"
            }),
        }).await;

        let final_redirect = mark_oauth_link_result(&final_redirect, &provider, "success", &format!("{} linked successfully.", if provider == "google" { "Google" } else { "Microsoft" }));
        return Ok(HttpResponse::Found()
            .insert_header(("Location", final_redirect))
            .finish());
    }

    let oauth_email = identity.email.clone().unwrap_or_default();
    let logged_in_user_id = oauth_service.get_or_create_user_from_identity(identity).await?;
    tracing::info!("OAuth login successful for user: {}", logged_in_user_id);
    let login_context = resolve_login_context(&state.db, logged_in_user_id, Some(&final_redirect)).await?;
    let workspace_policy = get_workspace_policy_for_redirect(&state.db, Some(&final_redirect)).await?;

    // Enforce domain restriction before creating a session
    if let Some(ref org) = workspace_policy {
        if let Err(e) = ensure_email_domain_allowed(org, &oauth_email) {
            let msg: String = url::form_urlencoded::byte_serialize(e.to_string().as_bytes()).collect();
            let base = effective_enduser_url(&state.db).await.unwrap_or_default();
            let redirect = format!("{}?error=domain_not_allowed&message={}", base, msg);
            return Ok(HttpResponse::Found().insert_header(("Location", redirect)).finish());
        }
    }

    if surface == "admin" && !is_platform_staff(&state.db, logged_in_user_id).await? {
        return admin_login_error_redirect(
            &state,
            "This account does not have platform admin access."
        ).await;
    }

    // Operator policy gate: enforces auth method, IP, email domain for operator logins.
    let op_method = if provider == "google" { OpAuthMethod::Google } else { OpAuthMethod::Microsoft };
    let op_policy = enforce_operator_login_policy(
        &state.db,
        logged_in_user_id,
        &oauth_email,
        op_method,
        login_context.current_org_id,
        client_ip_from_http_request(&req, state.config.as_ref()),
    ).await?;

    let mfa_service = MfaService::new(
        MfaRepository::new(state.db.clone()),
        IdentityRepository::new(state.db.clone()),
        state.config.as_ref().clone(),
    );
    let (totp_enabled, _) = mfa_service.totp_status(logged_in_user_id).await?;
    let org_repo_mfa = OrganizationRepository::new(state.db.clone());
    let workspace_requires_mfa = match workspace_policy.as_ref() {
        Some(org) => {
            org.require_mfa
                || (org.require_mfa_for_admins
                    && org_repo_mfa.is_org_admin_or_owner(org.id, logged_in_user_id).await.unwrap_or(false))
        }
        None => {
            if let Some(org_id) = login_context.current_org_id {
                let portal_mfa = org_repo_mfa.get_organization_by_id(org_id).await?
                    .map(|org| org.tenant_portal_require_mfa)
                    .unwrap_or(false);
                portal_mfa || op_policy.as_ref().map(|p| p.require_mfa).unwrap_or(false)
            } else {
                // Admin console login — operator policy governs
                op_policy.as_ref().map(|p| p.require_mfa).unwrap_or(false)
            }
        }
    };
    let audit_org_id = login_context.current_org_id.or_else(|| workspace_policy.as_ref().map(|org| org.id));
    if workspace_requires_mfa && !totp_enabled {
        let enrollment = mfa_service
            .start_login_enrollment(
                logged_in_user_id,
                Some(final_redirect.clone()),
                "oauth",
                Some(&provider),
            )
            .await?;
        AuditService::new(state.db.clone()).log(AuditEvent {
            actor_user_id: Some(logged_in_user_id),
            organization_id: login_context.current_org_id.or_else(|| workspace_policy.as_ref().map(|org| org.id)),
            action: "auth.mfa.enrollment.required".into(),
            target_type: "mfa_method".into(),
            target_id: Some("totp".into()),
            ip: ip.clone(),
            user_agent: ua.clone(),
            metadata: serde_json::json!({
                "reason": "workspace_requires_mfa_but_user_has_no_totp",
                "provider": provider,
                "workspace_slug": workspace_policy.as_ref().map(|org| org.slug.clone()),
            }),
        }).await;

        let hosted_auth = effective_public_urls(&state.db, state.config.as_ref()).await?.issuer_url;
        let mut url = Url::parse(&format!("{}/verify", hosted_auth.trim_end_matches('/')))
            .map_err(|e| AppError::Internal(format!("Invalid login UI URL: {}", e)))?;
        url.query_pairs_mut()
            .append_pair("mfa_enrollment_challenge", &enrollment.challenge.id.to_string())
            .append_pair("redirect_uri", &final_redirect);
        return Ok(HttpResponse::Found()
            .insert_header(("Location", url.to_string()))
            .finish());
    }

    if totp_enabled {
        let mut metadata = serde_json::Map::new();
        metadata.insert("method".into(), serde_json::json!("oauth"));
        metadata.insert("provider".into(), serde_json::json!(provider.clone()));
        metadata.insert("redirect_to".into(), serde_json::json!(final_redirect.clone()));
        if let Some(app_name) = login_context.app_name.clone() {
            metadata.insert("app_name".into(), serde_json::json!(app_name));
        }
        if let Some(workspace_slug) = login_context.workspace_slug.clone() {
            metadata.insert("workspace_slug".into(), serde_json::json!(workspace_slug));
        }

        let challenge = mfa_service
            .start_login_challenge(
                logged_in_user_id,
                Some(final_redirect.clone()),
                "oauth",
                Some(&provider),
            )
            .await?;
        let hosted_auth = effective_public_urls(&state.db, state.config.as_ref()).await?.issuer_url;
        let mut login_url = Url::parse(&format!("{}/verify", hosted_auth.trim_end_matches('/')))
            .map_err(|e| AppError::Internal(format!("Invalid hosted verify URL: {}", e)))?;
        login_url
            .query_pairs_mut()
            .append_pair("mfa_challenge", &challenge.challenge.id.to_string())
            .append_pair("redirect_uri", &final_redirect);

        AuditService::new(state.db.clone()).log(AuditEvent {
            actor_user_id: Some(logged_in_user_id),
            organization_id: audit_org_id,
            action: "auth.mfa.required".into(),
            target_type: "mfa_method".into(),
            target_id: Some("totp".into()),
            ip,
            user_agent: ua,
            metadata: serde_json::Value::Object(metadata),
        }).await;

        return Ok(HttpResponse::Found()
            .insert_header(("Location", login_url.to_string()))
            .finish());
    }

    let session_repo = SessionRepository::new(state.db.clone());
    let session_service = SessionService::new(session_repo, state.db.clone());
    let (_session, opaque_string) = session_service.create_opaque_session_with_context(
        logged_in_user_id,
        crate::modules::session::models::SessionCreateContext {
            user_agent: req.headers().get("user-agent").and_then(|h| h.to_str().ok()).map(String::from),
            ip: client_ip_from_http_request(&req, state.config.as_ref()),
            current_org_id: login_context.current_org_id,
            login_surface: Some(surface.clone()),
            login_app_name: login_context.app_name.clone(),
            login_workspace_slug: login_context.workspace_slug.clone(),
        },
    ).await?;

    let cookie = build_session_cookie(opaque_string, &state.config, 7 * 24 * 3600);

    let mut metadata = serde_json::Map::new();
    metadata.insert("provider".into(), serde_json::json!(provider.clone()));
    metadata.insert("redirect_to".into(), serde_json::json!(final_redirect));
    if let Some(app_name) = login_context.app_name {
        metadata.insert("app_name".into(), serde_json::json!(app_name));
    }
    if let Some(workspace_slug) = login_context.workspace_slug {
        metadata.insert("workspace_slug".into(), serde_json::json!(workspace_slug));
    }

    AuditService::new(state.db.clone()).log(AuditEvent {
        actor_user_id: Some(logged_in_user_id),
        organization_id: audit_org_id,
        action: "oauth.login.success".into(),
        target_type: "oauth_provider".into(),
        target_id: Some(provider.clone()),
        ip,
        user_agent: ua,
        metadata: serde_json::Value::Object(metadata),
    }).await;

    // Redirect user back to the frontend app, dropping the cookie along the way
    Ok(HttpResponse::Found()
        .cookie(cookie)
        .insert_header(("Location", final_redirect))
        .finish())
}

pub fn routes(rl: crate::bootstrap::config::RateLimitConfig) -> impl Fn(&mut web::ServiceConfig) {
    move |cfg: &mut web::ServiceConfig| {
        cfg.service(
            web::scope("/oauth")
                .wrap(crate::http::middleware::rate_limit::RateLimit::per_endpoint(rl.oauth_per_endpoint, 60))
                .wrap(crate::http::middleware::rate_limit::RateLimit::global_per_ip("oauth", rl.oauth_per_ip, 60))
                .route("/login", web::get().to(login))
                .route("/demo", web::get().to(demo_provider_page_from_query))
                .route("/demo/{provider}/continue", web::post().to(demo_provider_continue))
                .route("/{provider}/callback", web::get().to(callback))
        );
    }
}

pub fn routes_global(rl: crate::bootstrap::config::RateLimitConfig) -> impl Fn(&mut web::ServiceConfig) {
    routes(rl)
}

pub fn legacy_callback_routes(cfg: &mut web::ServiceConfig) {
    cfg.service(
        web::scope("/api/v1/auth")
            .wrap(crate::http::middleware::rate_limit::RateLimit::new(20, 60))
            .route("/{provider}/callback", web::get().to(callback))
    );
}

pub async fn load_runtime_oauth_config(state: &web::Data<AppState>) -> Result<AppConfig, AppError> {
    load_runtime_oauth_config_with_pending(state, None).await
}

pub async fn load_runtime_oauth_config_with_pending(
    state: &web::Data<AppState>,
    pending_oauth_key: Option<&str>,
) -> Result<AppConfig, AppError> {
    let mut config = load_runtime_app_config(state.get_ref()).await?;

    if let Some(value) = get_setting(&state.db, "google_client_id").await? {
        config.oauth.google_client_id = value;
    }
    if let Some(value) = get_setting(&state.db, "google_client_secret").await? {
        config.oauth.google_client_secret = value;
    }
    if let Some(value) = get_setting(&state.db, "microsoft_client_id").await? {
        config.oauth.microsoft_client_id = value;
    }
    if let Some(value) = get_setting(&state.db, "microsoft_client_secret").await? {
        config.oauth.microsoft_client_secret = value;
    }
    if let Some(value) = get_setting(&state.db, "microsoft_tenant_id").await? {
        config.oauth.microsoft_tenant_id = value;
    }

    if let Some(key) = pending_oauth_key.filter(|value| !value.trim().is_empty()) {
        let redis_key = format!("pending_oauth_verify:{}", key);
        let mut redis_conn = state.redis.clone();
        let payload: Option<String> = redis::cmd("GET")
            .arg(&redis_key)
            .query_async(&mut redis_conn)
            .await
            .map_err(|e| AppError::Internal(format!("Redis auth state failure: {}", e)))?;
        if let Some(raw) = payload {
            let pending: PendingOAuthVerificationPayload = serde_json::from_str(&raw)
                .map_err(|e| AppError::Internal(format!("Invalid pending OAuth verification payload: {}", e)))?;
            match pending.provider.as_str() {
                "google" => {
                    config.oauth.google_client_id = pending.client_id;
                    config.oauth.google_client_secret = pending.client_secret;
                }
                "microsoft" => {
                    config.oauth.microsoft_client_id = pending.client_id;
                    config.oauth.microsoft_client_secret = pending.client_secret;
                    if let Some(tenant_id) = pending.tenant_id.filter(|value| !value.trim().is_empty()) {
                        config.oauth.microsoft_tenant_id = tenant_id;
                    }
                }
                _ => {}
            }
        }
    }

    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::resolve_final_redirect_uri_from_validation;
    use crate::shared::error::AppError;

    #[test]
    fn accepts_registered_redirect_when_first_party_validation_rejects_it() {
        let result = resolve_final_redirect_uri_from_validation(
            "http://localhost:8202/callback",
            Err(AppError::Validation("redirect_uri is not allowed".into())),
            true,
        )
        .expect("registered downstream redirect should be accepted");

        assert_eq!(result, "http://localhost:8202/callback");
    }

    #[test]
    fn still_rejects_unregistered_redirects() {
        let result = resolve_final_redirect_uri_from_validation(
            "http://evil.example/callback",
            Err(AppError::Validation("redirect_uri is not allowed".into())),
            false,
        );

        match result {
            Err(AppError::Validation(message)) => assert_eq!(message, "redirect_uri is not allowed"),
            other => panic!("expected redirect rejection, got {:?}", other),
        }
    }

    #[test]
    fn keeps_original_validation_error_for_malformed_redirects() {
        let result = resolve_final_redirect_uri_from_validation(
            "not a url",
            Err(AppError::Validation(
                "redirect_uri must be a valid URL or relative path".into(),
            )),
            true,
        );

        match result {
            Err(AppError::Validation(message)) => {
                assert_eq!(message, "redirect_uri must be a valid URL or relative path")
            }
            other => panic!("expected malformed redirect rejection, got {:?}", other),
        }
    }
}
