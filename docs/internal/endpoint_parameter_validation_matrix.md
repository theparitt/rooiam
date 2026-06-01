# Rooiam Server Endpoint Parameter Validation Matrix

This matrix was generated from the current `rooiam-server` route registrations and handler extractors.

## Global Validation Rules

| Layer | Applies To | Validation |
|---|---|---|
| `ParameterGuard` middleware | all requests | rejects duplicate query keys, empty query keys, bracket-style query pollution, unsupported query-key chars, control chars in values, overlong query strings, overlong keys/values, and too many query parameters |
| `JsonConfig` | `web::Json<T>` | enforces body size limit, returns clear validation errors, logs rejection |
| `QueryConfig` | `web::Query<T>` | returns clear validation errors, logs rejection |
| `PathConfig` | `web::Path<T>` | rejects malformed path params, logs rejection |
| `FormConfig` | `web::Form<T>` | returns clear validation errors, logs rejection |
| `#[serde(deny_unknown_fields)]` | endpoint request/query/form DTOs | rejects extra JSON/form/query fields instead of silently ignoring them |
| `AppError::Validation` | all explicit validation failures | logs server-side and returns a clear client error message |

Legend:

- `Strict DTO`: typed extractor + `deny_unknown_fields`.
- `Typed`: typed extractor, no arbitrary map.
- `Business`: handler/service validates semantic rules.
- `Multipart strict`: one `file` part, image content type, supported extension, non-empty, max size, no extra file.
- `Global only`: no endpoint-specific params; still covered by query guard/path/form/json extractor config.

## Root And Hosted UI

| Method | Endpoint | Parameters | Validation Status |
|---|---|---|---|
| GET | `/health` | none | Global only |
| GET | `/server-info` | none | Global only |
| GET | `/widget-assets/login-widget.css` | none | Global only + rate limit |
| GET | `/login-widget` | query: `preview?`, `workspace_id?`, `workspace?`, `org?`, `client_id?` | Strict DTO + business validation for workspace/client/embed origin |
| GET | `/login` | same as `/login-widget` | Strict DTO + business validation |
| GET | `/verify` | query handled by hosted verify page | Global query guard; page-level validation |

## Auth

| Method | Endpoint | Parameters | Validation Status |
|---|---|---|---|
| POST | `/v1/auth/magic-link/start` | JSON: `email`, `redirect_uri?`, `widget_login_context?`, `widget_embed_origin?`, `surface?` | Strict DTO + email/domain/redirect/widget policy validation |
| POST | `/v1/auth/magic-link/verify` | JSON: `token` | Strict DTO + token validity validation |
| GET | `/v1/auth/magic-link/verify` | query: `token` | Strict DTO + token validity validation |
| POST | `/v1/auth/logout` | none | Global only + session validation |

## OAuth

| Method | Endpoint | Parameters | Validation Status |
|---|---|---|---|
| GET | `/v1/oauth/login` | query: `provider`, `redirect_uri?`, `widget_login_context?`, `widget_embed_origin?`, `surface?`, `intent?`, `workspace_id?`, `workspace?`, `org?`, `client_id?`, `app?` | Strict DTO + provider/redirect/widget/state validation |
| GET | `/v1/oauth/demo` | query: `provider`, `redirect_uri?`, `state?`, `surface?`, `email?`, `widget_login_context?` | Strict DTO + production-like provider query. Direct demo flow uses `redirect_uri`; hosted-widget demo flow uses `widget_login_context`. |
| POST | `/v1/oauth/demo/{provider}/continue` | path: `provider`; query: `redirect_uri?`, `state?`, `surface?`, `email?`, `widget_login_context?`; form: `state?` | Typed path + Strict DTO form/query + provider/state validation |
| GET | `/v1/oauth/{provider}/callback` | path: `provider`; query: `code`, `state` | Typed path + Strict DTO + OAuth state/code/provider/IP/UA validation |
| GET | `/api/v1/auth/{provider}/callback` | path: `provider`; query same as callback | Typed path + Strict DTO + legacy callback validation |

## OIDC

| Method | Endpoint | Parameters | Validation Status |
|---|---|---|---|
| GET | `/v1/oidc/authorize` | query: `response_type`, `client_id`, `redirect_uri`, `scope?`, `state?`, `code_challenge?`, `code_challenge_method?` | Strict DTO + client/redirect/PKCE/session validation |
| POST | `/v1/oidc/token` | form: `grant_type`, `code?`, `redirect_uri?`, `client_id`, `client_secret?`, `code_verifier?`, `refresh_token?` | Strict DTO + grant/client secret/code/redirect/PKCE/refresh-token validation |
| POST | `/v1/oidc/revoke` | form: `token`, `token_type_hint?`, `client_id`, `client_secret?` | Strict DTO + client secret/token validation |
| POST | `/v1/oidc/introspect` | form: `token`, `token_type_hint?`, `client_id`, `client_secret?` | Strict DTO + client secret/token validation |
| GET | `/v1/oidc/userinfo` | bearer token | Header token validation |
| GET | `/v1/oidc/end-session` | query: `id_token_hint?`, `post_logout_redirect_uri?`, `state?`, `client_id?` | Strict DTO + client/post-logout redirect validation |
| GET | `/v1/.well-known/openid-configuration` | none | Global only |
| GET | `/v1/.well-known/jwks.json` | none | Global only |

## WebAuthn And MFA

| Method | Endpoint | Parameters | Validation Status |
|---|---|---|---|
| POST | `/v1/webauthn/login/start` | JSON: `email?`, `redirect_uri?`, `widget_login_context?`, `widget_embed_origin?`, `surface?` | Strict DTO + auth policy/widget/email validation |
| POST | `/v1/webauthn/login/finish` | JSON: `challenge_id`, `credential` | Strict DTO + WebAuthn assertion validation |
| POST | `/v1/webauthn/login/demo` | JSON: `email`, `redirect_uri?`, `widget_login_context?`, `widget_embed_origin?`, `surface?` | Strict DTO + demo-account validation |
| POST | `/v1/webauthn/login/report-failure` | JSON: `email?`, `stage`, `reason` | Strict DTO + event validation |
| POST | `/v1/webauthn/register/start` | none | Session validation |
| POST | `/v1/webauthn/register/finish` | JSON: `challenge_id`, `name?`, `credential` | Strict DTO + WebAuthn attestation validation |
| GET | `/v1/webauthn/passkeys` | none | Session validation |
| DELETE | `/v1/webauthn/passkeys/{id}` | path: `id` UUID | Typed path + ownership validation |
| PATCH | `/v1/webauthn/passkeys/{id}` | path: `id`; JSON: `name` | Typed path + Strict DTO + name length validation |
| GET | `/v1/mfa/status` | none | Session validation |
| POST | `/v1/mfa/totp/start` | none | Session validation |
| POST | `/v1/mfa/totp/finish` | JSON: `challenge_id`, `code` | Strict DTO + challenge/code validation |
| POST | `/v1/mfa/recovery-codes/regenerate` | none | Session validation |
| DELETE | `/v1/mfa/totp` | none | Session validation |
| POST | `/v1/mfa/login/enroll/start` | JSON: `challenge_id` | Strict DTO + challenge validation |
| POST | `/v1/mfa/login/enroll/finish` | JSON: `challenge_id`, `code` | Strict DTO + challenge/code validation |
| POST | `/v1/mfa/login/verify` | JSON: `challenge_id`, `code` | Strict DTO + challenge/code validation |

## Identity

| Method | Endpoint | Parameters | Validation Status |
|---|---|---|---|
| GET | `/v1/identity/me` | none | Session validation |
| PATCH | `/v1/identity/me/profile` | JSON: `display_name?`, `avatar_url?` | Strict DTO + URL/name service validation |
| POST | `/v1/identity/me/avatar/upload` | multipart: exactly one `file` image | Multipart strict + max image size |
| GET | `/v1/identity/me/sessions` | none | Session validation |
| POST | `/v1/identity/me/sessions/revoke-all` | none | Session validation |
| DELETE | `/v1/identity/me/sessions/{id}` | path: `id` UUID | Typed path + ownership validation |
| GET | `/v1/identity/me/linked-accounts` | none | Session validation |
| POST | `/v1/identity/me/linked-accounts/{provider}/start` | path: `provider`; JSON: `redirect_uri?` | Typed path + Strict DTO + provider/recent-admin-reauth validation |
| DELETE | `/v1/identity/me/linked-accounts/{provider}` | path: `provider` | Typed path + provider/recent-admin-reauth validation |
| GET | `/v1/identity/me/audit-logs` | query: `page?`, `page_size?`, `date_from?`, `date_to?` | Strict DTO + page/page_size bounds |
| POST | `/v1/identity/me/email-change/request` | JSON: `new_email`, `redirect_uri?` | Strict DTO + email/domain validation |
| POST | `/v1/identity/me/email-change/verify` | JSON: `token` | Strict DTO + token validation |
| POST | `/v1/identity/me/delete/request` | none | Session validation |
| DELETE | `/v1/identity/me/delete/confirm` | JSON: `token` | Strict DTO + token validation |

## Identity Token API

| Method | Endpoint | Parameters | Validation Status |
|---|---|---|---|
| GET | `/v1/identity/token` | bearer token | Bearer token validation |
| PATCH | `/v1/identity/token/profile` | JSON: `display_name?`, `avatar_url?` | Strict DTO + bearer token + URL/name validation |
| GET | `/v1/identity/token/audit-logs` | query: `page?`, `page_size?`, `date_from?`, `date_to?` | Strict DTO + bearer token + page/page_size bounds |
| GET | `/v1/identity/token/security-capabilities` | bearer token | Bearer token validation |
| GET | `/v1/identity/token/sessions` | bearer token | Bearer token validation |
| POST | `/v1/identity/token/sessions/revoke-all` | bearer token | Bearer token validation |
| DELETE | `/v1/identity/token/sessions/{id}` | path: `id` UUID; bearer token | Typed path + bearer token + ownership validation |
| GET | `/v1/identity/token/linked-accounts` | bearer token | Bearer token validation |
| POST | `/v1/identity/token/linked-accounts/{provider}/start` | path: `provider`; JSON: `redirect_uri?`; bearer token | Typed path + Strict DTO + provider validation |
| DELETE | `/v1/identity/token/linked-accounts/{provider}` | path: `provider`; bearer token | Typed path + provider validation |
| GET | `/v1/identity/token/passkeys` | bearer token | Bearer token validation |
| POST | `/v1/identity/token/passkeys/register/start` | bearer token | Bearer token validation |
| POST | `/v1/identity/token/passkeys/register/finish` | JSON: `challenge_id`, `name?`, `credential`; bearer token | Strict DTO + WebAuthn validation |
| PATCH | `/v1/identity/token/passkeys/{id}` | path: `id`; JSON: `name`; bearer token | Typed path + Strict DTO + name validation |
| DELETE | `/v1/identity/token/passkeys/{id}` | path: `id`; bearer token | Typed path + ownership validation |
| GET | `/v1/identity/token/mfa` | bearer token | Bearer token validation |
| POST | `/v1/identity/token/mfa/totp/start` | bearer token | Bearer token validation |
| POST | `/v1/identity/token/mfa/totp/finish` | JSON: `challenge_id`, `code`; bearer token | Strict DTO + challenge/code validation |
| POST | `/v1/identity/token/mfa/recovery-codes/regenerate` | bearer token | Bearer token validation |
| DELETE | `/v1/identity/token/mfa/totp` | bearer token | Bearer token validation |

## Clients

| Method | Endpoint | Parameters | Validation Status |
|---|---|---|---|
| GET | `/v1/clients` | none | Session validation |
| POST | `/v1/clients` | JSON: `app_name`, `app_type`, `redirect_uris` | Strict DTO + app type/name/client policy validation |
| POST | `/v1/clients/{id}/rotate-secret` | path: `id` UUID | Typed path + client ownership/status/type validation |
| PATCH | `/v1/clients/{id}/status` | path: `id`; JSON: `status` | Typed path + Strict DTO + status enum validation |

## Admin

| Method | Endpoint | Parameters | Validation Status |
|---|---|---|---|
| GET | `/v1/admin/users` | query: `page?`, `page_size?`, `search?`, `role?`, `scope?`, `action?`, `date_from?`, `date_to?` | Strict DTO + listing bounds/business validation |
| GET | `/v1/admin/users/{user_id}` | path: `user_id` UUID | Typed path + admin auth |
| PATCH | `/v1/admin/users/{user_id}/status` | path: `user_id`; JSON: `status` | Typed path + Strict DTO + status validation |
| PATCH | `/v1/admin/users/{user_id}/role` | path: `user_id`; JSON: `role` | Typed path + Strict DTO + role validation |
| GET | `/v1/admin/users/{user_id}/sessions` | path: `user_id` | Typed path + admin auth |
| DELETE | `/v1/admin/users/{user_id}/sessions` | path: `user_id` | Typed path + admin auth |
| GET | `/v1/admin/users/{user_id}/audit-logs` | path: `user_id`; query: `page?`, `page_size?`, `search?`, `role?`, `scope?`, `action?`, `date_from?`, `date_to?` | Typed path + Strict DTO listing |
| GET | `/v1/admin/organizations` | query: `page?`, `page_size?`, `search?`, `role?`, `scope?`, `action?`, `date_from?`, `date_to?` | Strict DTO listing |
| GET | `/v1/admin/organizations/{organization_id}` | path: `organization_id` UUID | Typed path |
| PATCH | `/v1/admin/organizations/{organization_id}/status` | path + JSON: `status` | Typed path + Strict DTO + status validation |
| GET | `/v1/admin/organizations/{organization_id}/audit-logs` | path: `organization_id`; query: `page?`, `page_size?`, `search?`, `role?`, `scope?`, `action?`, `date_from?`, `date_to?` | Typed path + Strict DTO listing |
| GET/PATCH | `/v1/admin/organizations/{organization_id}/session-policy` | path: `organization_id`; JSON on PATCH: `session_duration_days?`, `magic_link_expiry_minutes?`, `oidc_access_token_ttl_minutes?`, `refresh_token_ttl_days?`, `idle_timeout_minutes?` | Typed path + Strict DTO + session-policy bounds |
| GET/PATCH | `/v1/admin/organizations/{organization_id}/app-governance` | path: `organization_id`; JSON on PATCH: `max_redirect_uris_per_app?`, `max_allowed_embed_origins_per_app?` | Typed path + Strict DTO + governance bounds |
| GET | `/v1/admin/clients` | query: `page?`, `page_size?`, `search?`, `role?`, `scope?`, `action?`, `date_from?`, `date_to?` | Strict DTO listing |
| GET | `/v1/admin/clients/{client_id}` | path: `client_id` UUID | Typed path |
| POST | `/v1/admin/clients/{client_id}/rotate-secret` | path: `client_id` | Typed path + client status/type validation |
| PATCH | `/v1/admin/clients/{client_id}/status` | path + JSON: `status` | Typed path + Strict DTO + status validation |
| DELETE | `/v1/admin/clients/{client_id}` | path: `client_id` | Typed path + admin auth |
| GET | `/v1/admin/audit-logs` | query: `page?`, `page_size?`, `search?`, `role?`, `scope?`, `action?`, `date_from?`, `date_to?` | Strict DTO listing |
| GET | `/v1/admin/tenant/members` | query: `page?`, `page_size?`, `search?`, `role?`, `scope?`, `action?`, `date_from?`, `date_to?` | Strict DTO listing |
| GET | `/v1/admin/tenant/audit-logs` | query: `page?`, `page_size?`, `search?`, `role?`, `scope?`, `action?`, `date_from?`, `date_to?` | Strict DTO listing |
| GET/PATCH | `/v1/admin/tenant-session-policy` | JSON on PATCH: `session_duration_days?`, `magic_link_expiry_minutes?`, `idle_timeout_minutes?` | Strict DTO + session-policy bounds |
| GET/PATCH | `/v1/admin/tenant-access` | JSON on PATCH: `allow_magic_link`, `allow_google`, `allow_microsoft`, `allow_passkey` | Strict DTO + tenant-access validation |
| GET/PATCH | `/v1/admin/client-governance` | JSON on PATCH: `tenant_client_management_enabled`, `tenant_web_clients_enabled`, `tenant_spa_clients_enabled`, `tenant_native_clients_enabled` | Strict DTO + governance bounds |
| GET/PATCH | `/v1/admin/ip-policy` | JSON on PATCH: `tenant_ip_policy_editable`, `default_allowlist`, `default_blocklist` | Strict DTO + CIDR/IP validation |
| GET/PATCH | `/v1/admin/ip-policy/admin` | JSON on PATCH: `allowlist`, `blocklist` | Strict DTO + CIDR/IP validation |
| GET/PATCH | `/v1/admin/workspace-governance` | JSON on PATCH: `max_workspaces_per_user?`, `max_apps_per_workspace?`, `max_redirect_uris_per_app_default?`, `max_redirect_uris_per_app_limit?`, `max_allowed_embed_origins_per_app_default?`, `max_allowed_embed_origins_per_app_limit?` | Strict DTO + workspace governance bounds |
| GET/PATCH | `/v1/admin/session-policy` | JSON on PATCH: `session_duration_days?`, `magic_link_expiry_minutes?`, `oidc_access_token_ttl_minutes?`, `refresh_token_ttl_days?`, `idle_timeout_minutes?` | Strict DTO + session-policy bounds |
| GET/PATCH | `/v1/admin/storage-config` | JSON on PATCH: `backend`, `local_path`, `minio_endpoint`, `minio_bucket`, `minio_access_key`, `minio_secret_key?`, `minio_use_ssl` | Strict DTO + storage config validation |
| POST | `/v1/admin/storage-config/test` | JSON: `backend`, `local_path?`, `minio_endpoint?`, `minio_bucket?`, `minio_access_key?`, `minio_secret_key?`, `minio_use_ssl?` | Strict DTO + storage backend validation |
| GET | `/v1/admin/signing-keys` | none | Admin auth |
| POST | `/v1/admin/signing-keys/rotate` | none | Admin auth + key rotation policy |
| GET | `/v1/admin/sessions` | query: `page?`, `page_size?`, `search?`, `role?`, `scope?`, `action?`, `date_from?`, `date_to?` | Strict DTO listing |
| GET/PATCH | `/v1/admin/risk-policy` | JSON on PATCH: `enabled?`, `new_ip_enabled?`, `new_ip_lookback?`, `rapid_ip_change_enabled?`, `rapid_ip_change_window_minutes?`, `new_user_agent_enabled?`, `new_user_agent_lookback?`, `operator_email_enabled?` | Strict DTO + risk bounds |
| GET/POST/DELETE | `/v1/admin/security-alert-reviews` | JSON: `alert_key` on POST | Strict DTO + required alert key |

## Organizations And Workspace Portal

| Method | Endpoint | Parameters | Validation Status |
|---|---|---|---|
| GET | `/v1/orgs/public/branding` | query: `slug?`, `workspace_id?` | Strict DTO + workspace resolution |
| POST | `/v1/orgs` | JSON: `name`, `slug` | Strict DTO + slug/name validation |
| GET | `/v1/orgs` | none | Session validation |
| GET | `/v1/orgs/current/portal` | none | Session/workspace validation |
| PATCH | `/v1/orgs/current/branding` | JSON: `name?`, `login_display_name?`, `login_title?`, `login_subtitle?`, `icon_url?`, `login_logo_url?`, `brand_color?`, `show_login_logo?`, `show_login_title?`, `show_login_subtitle?`, `show_powered_by?`, `widget_radius?`, `widget_shadow?`, `icon_container?`, `login_logo_container?`, `login_logo_size?`, `card_radius?`, `button_style?`, `card_bg_style?`, `card_bg_color2?`, `card_border_width?`, `card_border_color?`, `login_method_order?` | Strict DTO + URL/color/domain validation |
| POST | `/v1/orgs/current/branding/upload` | query: `kind`; multipart: one `file` image | Strict DTO query + Multipart strict + max image size |
| PATCH | `/v1/orgs/current/auth-policy` | JSON: `allow_magic_link`, `allow_google`, `allow_microsoft`, `allow_passkey`, `require_mfa`, `require_mfa_for_admins?`, `tenant_portal_require_mfa?`, `allowed_email_domains?`, `max_session_age_hours?`, `max_concurrent_sessions?` | Strict DTO + auth-policy validation |
| GET/PATCH | `/v1/orgs/current/client-policy` | JSON on PATCH: `allow_client_management`, `allow_web_clients`, `allow_spa_clients`, `allow_native_clients` | Strict DTO + policy validation |
| GET/PATCH | `/v1/orgs/current/ip-policy` | JSON on PATCH: `use_custom_ip_policy`, `allowlist`, `blocklist` | Strict DTO + CIDR/IP validation |
| GET/PATCH | `/v1/orgs/current/auth-config` | JSON on PATCH: `google_client_id?`, `google_client_secret?`, `google_admin_login_enabled?`, `microsoft_client_id?`, `microsoft_client_secret?`, `microsoft_tenant_id?`, `microsoft_admin_login_enabled?` | Strict DTO + provider credential validation |
| POST | `/v1/orgs/current/auth-config/prepare-oauth-verification` | JSON: `provider`, `client_id`, `client_secret`, `tenant_id?`, `redirect_uri` | Strict DTO + provider validation |
| PATCH | `/v1/orgs/current/status` | JSON: `status` | Strict DTO + status validation |
| GET/POST | `/v1/orgs/current/clients` | query none; JSON on POST: `app_name`, `app_type`, `redirect_uris`, `allowed_embed_origins?`, `confirm_multi_origin?` | Strict DTO + client validation |
| PATCH/DELETE | `/v1/orgs/current/clients/{client_id}` | path: `client_id`; JSON on PATCH: `app_name`, `redirect_uris`, `allowed_embed_origins?`, `confirm_multi_origin?` | Typed path + Strict DTO + client validation |
| POST | `/v1/orgs/current/clients/{client_id}/rotate-secret` | path: `client_id` | Typed path + client status/type validation |
| PATCH | `/v1/orgs/current/clients/{client_id}/status` | path + JSON: `status` | Typed path + Strict DTO + status validation |
| GET | `/v1/orgs/current/members` | none | Session/workspace validation |
| GET/POST | `/v1/orgs/current/invites` | JSON on POST: `email` | Strict DTO + email/role validation |
| DELETE | `/v1/orgs/current/invites/{invite_id}` | path: invite path | Typed path + ownership validation |
| PATCH | `/v1/orgs/current/members/{member_id}/role` | path + JSON: `role` | Typed path + Strict DTO + role validation |
| DELETE | `/v1/orgs/current/members/{member_id}` | path: `member_id` UUID | Typed path + role/self-removal validation |
| GET | `/v1/orgs/workspace/activity` | query: `page?`, `page_size?`, `search?`, `q?`, `action?`, `date_from?`, `date_to?`, `sort_by?`, `sort_order?` | Strict DTO + search/date/page validation |
| GET | `/v1/orgs/workspace/activity/export` | query: `format?`, `search?`, `action?`, `date_from?`, `date_to?` | Strict DTO + search/date validation |
| GET/POST/DELETE | `/v1/orgs/current/security-alert-reviews` | JSON: `alert_key` on POST | Strict DTO + alert key validation |
| GET | `/v1/orgs/tenant/activity` | query: `page?`, `page_size?`, `search?`, `q?`, `action?`, `date_from?`, `date_to?`, `sort_by?`, `sort_order?` | Strict DTO + search/date/page validation |
| GET/POST | `/v1/orgs/current/api-keys` | JSON on POST: `label`, `expires_at?`, `permission_preset?` | Strict DTO + label/scope validation |
| DELETE | `/v1/orgs/current/api-keys/{key_id}` | path: `key_id` UUID | Typed path + ownership validation |
| GET | `/v1/orgs/current/effective-policy` | none | Session/workspace validation |
| POST | `/v1/orgs/current/auth-policy/preview` | JSON: `allow_magic_link`, `allow_google`, `allow_microsoft`, `allow_passkey` | Strict DTO + policy validation |
| POST | `/v1/orgs/current/auth-policy/self-check` | JSON: `allow_magic_link`, `allow_google`, `allow_microsoft`, `allow_passkey` | Strict DTO + lockout validation |
| GET | `/v1/orgs/current/policy-snapshots` | none | Session/workspace validation |
| POST | `/v1/orgs/current/policy-snapshots/{id}/restore` | path: `id` integer | Typed path + snapshot validation |
| GET | `/v1/orgs/current/role-templates` | none | Session/workspace validation |
| GET | `/v1/orgs/current/role-diff` | query: `from_role`, `to_role` | Strict DTO + role validation |
| POST | `/v1/orgs/current/owner-transfer` | JSON: `to_user_id` | Strict DTO + ownership/member validation |
| POST | `/v1/orgs/current/owner-transfer/accept` | JSON: `token` | Strict DTO + transfer token validation |
| POST | `/v1/orgs/switch` | JSON: `organization_id` | Strict DTO + membership validation |
| GET | `/v1/orgs/{org_id}/members` | path: `org_id` UUID | Typed path + membership validation |
| POST | `/v1/orgs/{org_id}/invites` | path: `org_id`; JSON: `email` | Typed path + Strict DTO + email/role validation |
| POST | `/v1/orgs/invites/accept` | JSON: `token` | Strict DTO + token validation |

## Workspace Integration API

| Method | Endpoint | Parameters | Validation Status |
|---|---|---|---|
| GET | `/v1/orgs/integrations/workspace` | workspace API key | API key validation |
| GET/PATCH | `/v1/orgs/integrations/branding` | JSON on PATCH: same as `/v1/orgs/current/branding` | API key + Strict DTO + URL/color validation |
| GET/PATCH | `/v1/orgs/integrations/auth-config` | JSON on PATCH: same as `/v1/orgs/current/auth-config` | API key + Strict DTO + provider validation |
| GET/POST | `/v1/orgs/integrations/clients` | query: `page?`, `page_size?`, `q?`, `status?`, `app_type?`, `sort_by?`, `sort_order?`; JSON on POST: `app_name`, `app_type`, `redirect_uris`, `allowed_embed_origins?`, `confirm_multi_origin?` | API key + Strict DTO + client validation |
| GET/PATCH/DELETE | `/v1/orgs/integrations/clients/{client_id}` | path: `client_id`; JSON on PATCH: `app_name`, `redirect_uris`, `allowed_embed_origins?`, `confirm_multi_origin?` | API key + Typed path + Strict DTO |
| PATCH | `/v1/orgs/integrations/clients/{client_id}/status` | path + JSON: `status` | API key + Typed path + Strict DTO + status validation |
| GET | `/v1/orgs/integrations/clients/{client_id}/secret-metadata` | path | API key + Typed path |
| POST | `/v1/orgs/integrations/clients/{client_id}/rotate-secret` | path | API key + Typed path + client status/type validation |
| GET | `/v1/orgs/integrations/members` | query: `page?`, `page_size?`, `q?`, `role?`, `status?`, `sort_by?`, `sort_order?` | API key + Strict DTO listing |
| GET | `/v1/orgs/integrations/members/{member_id}` | path | API key + Typed path |
| GET | `/v1/orgs/integrations/members/{member_id}/activity` | path: `member_id`; query: `page?`, `page_size?`, `search?`, `q?`, `action?`, `date_from?`, `date_to?`, `sort_by?`, `sort_order?` | API key + Typed path + Strict DTO |
| PATCH | `/v1/orgs/integrations/members/{member_id}/profile` | path: `member_id`; JSON: `display_name` | API key + Typed path + Strict DTO |
| GET/DELETE | `/v1/orgs/integrations/members/{member_id}/sessions` | path | API key + Typed path |
| PATCH | `/v1/orgs/integrations/members/{member_id}/role` | path: `member_id`; JSON: `role_code` | API key + Typed path + Strict DTO + role validation |
| DELETE | `/v1/orgs/integrations/members/{member_id}` | path | API key + Typed path |
| GET/POST | `/v1/orgs/integrations/invites` | query: `page?`, `page_size?`, `q?`, `sort_by?`, `sort_order?`; JSON on POST: `email` | API key + Strict DTO + email/role validation |
| GET/DELETE | `/v1/orgs/integrations/invites/{invite_id}` | path | API key + Typed path |
| GET | `/v1/orgs/integrations/activity` | query: `page?`, `page_size?`, `search?`, `q?`, `action?`, `date_from?`, `date_to?`, `sort_by?`, `sort_order?` | API key + Strict DTO |
| GET | `/v1/orgs/integrations/audit/actions` | none | API key |
| GET | `/v1/orgs/integrations/effective-policy` | none | API key |
| GET | `/v1/orgs/integrations/policy-summary` | none | API key |
| GET | `/v1/orgs/integrations/roles` | none | API key |
| GET | `/v1/orgs/integrations/permissions` | none | API key |
| GET | `/v1/orgs/integrations/api-keys/me` | workspace API key | API key validation |
| GET | `/v1/orgs/integrations/widget-preview-config` | workspace API key | API key validation |

## RBAC

| Method | Endpoint | Parameters | Validation Status |
|---|---|---|---|
| GET | `/v1/orgs/current/roles` | none | Session/workspace validation |
| POST | `/v1/orgs/current/roles` | JSON: `name`, `code`, `permissions` | Strict DTO + reserved-code/permission validation |
| GET | `/v1/orgs/current/roles/permissions` | none | Session/workspace validation |
| DELETE | `/v1/orgs/current/roles/{role_id}` | path: `role_id` UUID | Typed path + workspace validation |

## Setup, Demo, And Test

| Method | Endpoint | Parameters | Validation Status |
|---|---|---|---|
| GET | `/v1/setup/status` | none | Global only |
| GET | `/v1/setup/config` | none | Global only |
| GET | `/v1/setup/admin-access` | none | Global only |
| GET | `/v1/setup/public-urls` | none | Global only |
| POST | `/v1/setup/test-database` | none | Setup access validation |
| GET | `/v1/setup/auth-methods` | query: `workspace_id?`, `org?`, `workspace?`, `client_id?`, `widget_embed_origin?` | Strict DTO + workspace resolution |
| GET | `/v1/setup/login-bootstrap` | query: `workspace_id?`, `org?`, `workspace?`, `client_id?`, `widget_embed_origin?` | Strict DTO + workspace/client/widget validation |
| POST | `/v1/setup/create-admin` | JSON: `email`, `display_name` | Strict DTO + email/name validation |
| POST | `/v1/setup/configure-public-urls` | JSON: `issuer_url`, `frontend_url`, `admin_url` | Strict DTO + URL validation |
| POST | `/v1/setup/configure-smtp` | JSON: `host`, `port`, `security?`, `insecure_tls?`, `username`, `password`, `from_email` | Strict DTO + SMTP validation |
| POST | `/v1/setup/test-smtp` | JSON: `host`, `port`, `security?`, `insecure_tls?`, `username`, `password`, `from_email`, `test_email` | Strict DTO + SMTP validation |
| POST | `/v1/setup/send-smtp-verification` | JSON: `host`, `port`, `security?`, `insecure_tls?`, `username`, `password`, `from_email`, `test_email` | Strict DTO + SMTP/email validation |
| POST | `/v1/setup/verify-smtp-code` | JSON: `code`, `email` | Strict DTO + code validation |
| POST | `/v1/setup/test-redis` | JSON: `url` | Strict DTO + Redis URL validation |
| POST | `/v1/setup/configure-oauth` | JSON: `google_client_id?`, `google_client_secret?`, `google_admin_login_enabled?`, `microsoft_client_id?`, `microsoft_client_secret?`, `microsoft_tenant_id?`, `microsoft_admin_login_enabled?` | Strict DTO + provider credential validation |
| POST | `/v1/setup/prepare-oauth-verification` | JSON: `provider`, `client_id`, `client_secret`, `tenant_id?`, `redirect_uri` | Strict DTO + provider validation |
| POST | `/v1/setup/configure-admin-access` | JSON: `admin_passkey_allowed?`, `admin_require_mfa?` | Strict DTO + policy validation |
| GET/POST | `/v1/setup/storage-config` | JSON on POST: `backend`, `local_path`, `minio_endpoint`, `minio_bucket`, `minio_access_key`, `minio_secret_key?`, `minio_use_ssl` | Strict DTO + storage validation |
| POST | `/v1/setup/test-storage` | JSON: `backend`, `local_path?`, `minio_endpoint?`, `minio_bucket?`, `minio_access_key?`, `minio_secret_key?`, `minio_use_ssl?` | Strict DTO + storage validation |
| POST | `/v1/setup/complete` | none | Setup access validation |
| POST | `/v1/demo/login` | JSON: `org_slug`, `app_name?`, `email?` | Strict DTO + demo-mode validation |
| GET | `/v1/demo/app-catalog` | none | demo/test mode only |
| GET | `/v1/demo/app-config` | query: `workspace_id?`, `workspace?`, `org?`, `app_id?`, `origin?` | Strict DTO + demo app validation |
| POST | `/v1/test/login` | JSON: `email?`, `org_slug?` | Strict DTO + test-mode validation |
| DELETE | `/v1/test/cleanup` | none | test-mode validation |

## Remaining Caveats

| Area | Status |
|---|---|
| Response clarity | Validation errors return clear messages; internal/database errors remain intentionally generic |
| Logs | Extractor, validation, forbidden, and unauthorized rejections are logged server-side |
| Unknown parameters | JSON/form/query DTOs reject unknown fields; query middleware rejects duplicate/polluted query keys before handlers |
| Image size | Avatar and workspace branding uploads enforce configured `max_logo_bytes` before storage |
| Non-endpoint internal structs | Some database models and provider-response structs still deserialize without `deny_unknown_fields`; they are not public endpoint request DTOs |
