# Rooiam IAM Server — API Reference

All endpoints are served by the Rust/Actix-web backend (default port **5170**). Unless noted,
all paths begin with `/v1`. Request and response bodies are JSON (`Content-Type: application/json`).

---

## Authentication Schemes

| Code | Meaning |
|------|---------|
| `none` | No authentication required |
| `session` | `rooiam_sid` opaque session cookie (set by any login endpoint) |
| `bearer` | `Authorization: Bearer <access_token>` JWT issued by `/v1/oidc/token` |
| `client_auth` | `client_id` + `client_secret` (form body; public clients omit secret) |
| `platform_staff` | `session` + user has `is_superuser = true` OR `is_platform_owner = true` |
| `platform_owner` | `session` + user has `is_platform_owner = true` |
| `setup_trust` | Loopback IP (127.x / ::1) **or** `X-Setup-Token` header matching `ROOIAM_SETUP_TOKEN` env var |

---

## Rate Limits

| Scope | Limit |
|-------|-------|
| `/v1/auth/*` | 10 req / 60 s |
| `/v1/oidc/*` | 30 req / 60 s |
| `/v1/oauth/*` | 20 req / 60 s |
| `/v1/webauthn/login/*` | 10 req / 60 s |
| `/v1/mfa/login/*` (enroll + verify) | 10 req / 60 s |

---

## Common Error Format

All errors return a JSON body:

```json
{ "error": "string", "message": "string" }
```

OIDC/token endpoints follow RFC 6749:

```json
{ "error": "invalid_grant", "error_description": "string" }
```

Common OIDC error codes: `invalid_grant`, `invalid_client`, `unsupported_grant_type`,
`invalid_request`, `unauthorized_client`.

---

## RBAC Permission Codes (workspace-level)

| Code | Grants |
|------|--------|
| `org:update` | Update org settings |
| `branding:manage` | Update branding, upload assets |
| `auth_policy:manage` | Update auth policy |
| `members:read` | List members |
| `members:manage` | Invite, remove, change roles |
| `roles:manage` | Create / delete custom roles |
| `activity:read` | Read audit logs |

---

## 1. Health Check

### **GET /health**

Verifies that the server, database, and Redis are reachable.

- **Auth:** none
- **Response 200 (all healthy):**

```json
{
  "status": "ok",
  "version": "0.1.0",
  "checks": {
    "database": { "ok": true },
    "redis": { "ok": true }
  }
}
```

- **Response 503 (degraded):** Same shape with `"status": "degraded"` and an `"error"` string inside the failing check.

---

## 2. OIDC Discovery (Well-Known)

### **GET /.well-known/openid-configuration**

Standard OIDC Discovery document. Used by downstream apps to auto-configure their OIDC client.

- **Auth:** none
- **Response:** Standard OIDC metadata object (issuer, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri`, `response_types_supported`, etc.)

### **GET /.well-known/jwks.json**

JSON Web Key Set containing the server's public signing key.

- **Auth:** none
- **Response:** `{ "keys": [...] }` — RSA public key(s) when RS256 is active; empty array in HS256 dev mode.

---

## 3. Auth — Magic Link & Logout

Rate limit: **10 req / 60 s** per IP.

### **POST /v1/auth/magic-link/start**

Begin the magic link login flow. Sends an email if the address is known; always returns success to prevent user enumeration.

- **Auth:** none
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | yes | Email address to send the link to |
| `redirect_uri` | string | no | OIDC `redirect_uri` to carry through the login; used to scope workspace auth policy |
| `surface` | string | no | Hint for the email template (`"admin"`, `"app"`, etc.) |

- **Response 200:**

```json
{ "ok": true, "message": "If that email is registered, a magic link has been sent." }
```

- **Notes:** IP policy is evaluated before sending. If the caller's IP is blocked, a 403 is returned. Unknown emails silently succeed.

---

### **POST /v1/auth/magic-link/verify**

Verify the token from a magic link email. Issues a session cookie or returns an MFA challenge.

- **Auth:** none
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | yes | Opaque token from the email link |

- **Response 200 (login success):** Sets `rooiam_sid` cookie. Body:

```json
{ "ok": true, "redirect_uri": "https://..." }
```

- **Response 200 (MFA required):** No cookie set. Body:

```json
{ "mfa_required": true, "challenge_id": "uuid", "redirect_uri": "https://..." }
```

- **Response 200 (MFA enrollment required):** No cookie. Body:

```json
{ "mfa_enrollment_required": true, "challenge_id": "uuid" }
```

---

### **POST /v1/auth/logout**

Revoke the current session and clear the session cookie.

- **Auth:** none (reads cookie if present; safe to call when already logged out)
- **Request body:** none
- **Response 200:** `{ "ok": true }`

---

## 4. OAuth — Social Login (Google / Microsoft)

Rate limit: **20 req / 60 s**.

### **GET /v1/oauth/login**

Initiate an OAuth2 social login or account-linking flow. Redirects the browser to the upstream provider.

- **Auth:** none (for login); `session` required when `intent=link`
- **Query parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `provider` | string | yes | `google` or `microsoft` |
| `redirect_uri` | string | no | Final destination after login |
| `surface` | string | no | UI hint (`"admin"`, `"app"`, etc.) |
| `intent` | string | no | `"login"` (default) or `"link"` (attach to existing account) |

- **Response:** HTTP 302 redirect to provider authorization URL.

---

### **GET /v1/oauth/{provider}/callback**

OAuth2 callback. Exchanges the authorization code for identity, then issues a session cookie or MFA challenge. Redirects the browser to the final destination.

- **Auth:** none (verified via state parameter)
- **Path params:** `provider` = `google` or `microsoft`
- **Query params:** `code`, `state` (set by provider; opaque to caller)
- **Response:** HTTP 302 redirect. On MFA requirement, redirects to the MFA challenge page with `?challenge_id=...`.

---

### **GET /api/v1/auth/{provider}/callback**

Legacy alias for the callback above. Same behavior.

---

### **GET /v1/oauth/demo/{provider}** *(demo mode only)*

Show a fake consent page for a demo OAuth provider. Only available when `ROOIAM_ENABLE_DEMO_SEED=true`.

- **Auth:** none
- **Path params:** `provider` = `google` or `microsoft`
- **Query params:** `redirect_uri` (optional)
- **Response:** HTML consent page.

---

### **POST /v1/oauth/demo/{provider}/continue** *(demo mode only)*

Submit the demo consent form and complete login for the selected demo user.

- **Auth:** none
- **Path params:** `provider` = `google` or `microsoft`
- **Query params:** `redirect_uri` (optional)
- **Request body:** form-encoded demo user selection
- **Response:** HTTP 302 redirect with session cookie set.

---

## 5. OIDC — Authorization & Token Endpoints

Rate limit: **30 req / 60 s**.

### **GET /v1/oidc/authorize**

Standard OIDC Authorization Endpoint. If no valid session cookie is present, redirects to the workspace login page. On success, redirects to `redirect_uri` with an authorization code.

- **Auth:** `session` (reads cookie directly; no middleware)
- **Query parameters (standard OIDC):**

| Param | Required | Description |
|-------|----------|-------------|
| `response_type` | yes | Must be `code` |
| `client_id` | yes | Registered OAuth client ID |
| `redirect_uri` | yes | Must match a registered redirect URI |
| `scope` | yes | Space-separated; e.g. `openid email profile` |
| `state` | recommended | CSRF token; echoed back |
| `code_challenge` | yes (PKCE) | Base64url-encoded SHA-256 hash of verifier |
| `code_challenge_method` | yes (PKCE) | Must be `S256` |
| `nonce` | no | For implicit/hybrid — returned in `id_token` |

- **Notes:** Public clients (`spa`, `native`) **must** use PKCE. Confidential `web` clients may omit PKCE. Authorization codes expire after **5 minutes**.

---

### **POST /v1/oidc/token**

Exchange an authorization code or refresh token for access/ID/refresh tokens.

- **Auth:** `client_auth` (form body)
- **Content-Type:** `application/x-www-form-urlencoded`
- **Request fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `grant_type` | yes | `authorization_code` or `refresh_token` |
| `client_id` | yes | OAuth client ID |
| `client_secret` | confidential only | Client secret (omit for public clients) |
| `code` | for `authorization_code` | Authorization code from `/authorize` |
| `redirect_uri` | for `authorization_code` | Must match the one used in `/authorize` |
| `code_verifier` | for PKCE clients | PKCE code verifier |
| `refresh_token` | for `refresh_token` | Valid refresh token |

- **Response 200:**

```json
{
  "access_token": "string",
  "token_type": "Bearer",
  "expires_in": 3600,
  "id_token": "string",
  "refresh_token": "string",
  "scope": "openid email profile"
}
```

- **Token lifetimes:** access token 1 hour (configurable), refresh token 30 days (configurable), authorization code 5 minutes.
- **Error response:** RFC 6749 `{ "error": "...", "error_description": "..." }`

---

### **POST /v1/oidc/revoke**

Revoke a refresh token. Access tokens are short-lived and not tracked server-side.

- **Auth:** `client_auth`
- **Content-Type:** `application/x-www-form-urlencoded`
- **Request fields:**

| Field | Required | Description |
|-------|----------|-------------|
| `token` | yes | The refresh token to revoke |
| `token_type_hint` | no | `refresh_token` (hint only) |
| `client_id` | yes | OAuth client ID |
| `client_secret` | confidential only | Client secret |

- **Response 200:** `{}` (RFC 7009 — always succeeds even if token is already revoked)

---

### **POST /v1/oidc/introspect**

Check whether a token is active and return its claims.

- **Auth:** `client_auth`
- **Content-Type:** `application/x-www-form-urlencoded`
- **Request fields:** `token`, `token_type_hint` (optional), `client_id`, `client_secret` (confidential clients)
- **Response 200 (active token):**

```json
{
  "active": true,
  "sub": "uuid",
  "email": "user@example.com",
  "scope": "openid email profile",
  "exp": 1700000000,
  "iat": 1699996400,
  "client_id": "string"
}
```

- **Response 200 (inactive/unknown):** `{ "active": false }`

---

### **GET /v1/oidc/end-session**

RP-Initiated Logout (OIDC Session Management). Revokes the session cookie and redirects to the caller-provided URI or the frontend root.

- **Auth:** none (best-effort — works even without a valid session)
- **Query parameters:**

| Param | Required | Description |
|-------|----------|-------------|
| `id_token_hint` | no | Previously issued ID token (informational; not required) |
| `post_logout_redirect_uri` | no | Redirect destination after logout |
| `state` | no | Opaque value echoed back to the redirect URI |

- **Response:** HTTP 302 redirect. Sets `rooiam_sid` cookie to expired (clears it).
- **Security:** `post_logout_redirect_uri` is validated against `configured_public_origins()`. An unrecognized URI is silently rejected and the redirect falls back to the frontend root — **logout always succeeds**.
- **Notes:** The `state` param, if provided, is appended to the redirect URL as-is.

---

### **GET /v1/oidc/userinfo**

Return user claims for the authenticated access token, filtered by granted scopes.

- **Auth:** `bearer`
- **Response 200:**

```json
{
  "sub": "uuid",
  "email": "user@example.com",
  "email_verified": true,
  "name": "Display Name",
  "picture": "https://..."
}
```

Fields are omitted when the corresponding scope (`email`, `profile`) was not granted.

---

## 6. Identity — My Account

All endpoints require `session` auth. Base path: `/v1/identity/me`.

> **Note:** the correct base path is `/v1/identity/me` (not `/v1/identity`).

### **GET /v1/identity/me**

Get the current user's full profile.

- **Auth:** `session`
- **Response 200:**

```json
{
  "id": "uuid",
  "email": "user@example.com",
  "display_name": "string | null",
  "avatar_url": "string | null",
  "is_platform_owner": false,
  "is_superuser": false,
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

---

### **PATCH /v1/identity/me/profile**

Update display name or avatar URL.

- **Auth:** `session`
- **Request body (all fields optional):**

| Field | Type | Description |
|-------|------|-------------|
| `display_name` | string\|null | New display name (max 100 chars) |
| `avatar_url` | string\|null | URL of avatar image (max 2048 chars, must be HTTPS or relative path) |

- **Response 200:** Updated profile object (same shape as `GET /v1/identity/me`).
- **Errors:** 400 if display name exceeds 100 chars or avatar URL fails validation.

---

### **POST /v1/identity/me/avatar/upload**

Upload an avatar image (multipart). Returns the stored URL.

- **Auth:** `session`
- **Content-Type:** `multipart/form-data`
- **Request:** Single `file` field. Supported: PNG, JPG, JPEG, WEBP, GIF, SVG. Max size: `ROOIAM_MAX_LOGO_BYTES`.
- **Response 200:** `{ "url": "https://...", "user": { ...full user object... } }`
- **Errors:** 400 for unsupported type, file too large, or no file provided.

---

### **POST /v1/identity/me/email-change/request**

Initiate an email address change. Sends a verification link to the new address.

- **Auth:** `session`
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `new_email` | string | yes | New email address |
| `surface` | string | no | `"admin"` or omit for tenant UI |

- **Response 200:** `{ "ok": true, "message": "Verification email sent to the new address..." }`
- **Errors:** 400 if new email is same as current, already taken by another user, or invalid format.
- **Notes:** Verification token expires in 24 hours. If the user does not confirm, their email stays unchanged. Sending a new request cancels any previous pending token.

---

### **POST /v1/identity/me/email-change/verify**

Confirm an email change by submitting the token from the verification link.

- **Auth:** `session` (must be same user who initiated)
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | yes | Raw token from the verification link |

- **Response 200:** `{ "ok": true, "message": "Email address updated successfully.", "new_email": "user@newdomain.com" }`
- **Errors:**
  - 404 — token not found, expired, or already used
  - 403 — token belongs to a different user
  - 409 — the new email was claimed by another account in the meantime

---

### **GET /v1/identity/me/sessions**

List all active (non-expired, non-revoked) sessions for the current user.

- **Auth:** `session`
- **Response 200:** Array of session objects:

```json
[
  {
    "id": "uuid",
    "current_org_id": "uuid | null",
    "login_app_name": "string",
    "login_workspace_slug": "string | null",
    "created_at": "ISO8601",
    "last_seen_at": "ISO8601",
    "expires_at": "ISO8601",
    "ip": "string | null",
    "user_agent": "string | null",
    "is_current": true
  }
]
```

---

### **POST /v1/identity/me/sessions/revoke-all**

Revoke all sessions except the currently active one.

- **Auth:** `session`
- **Response 200:** `{ "ok": true, "message": "Other active sessions revoked.", "revoked_count": 3 }`

---

### **DELETE /v1/identity/me/sessions/{id}**

Revoke a specific session by UUID.

- **Auth:** `session`
- **Path params:** `id` (UUID of the session to revoke)
- **Response 200:** `{ "ok": true, "message": "Session locally revoked." }`
- **Errors:** 403 if the session belongs to a different user.

---

### **GET /v1/identity/me/audit-logs**

List the current user's own audit log entries. Paginated.

- **Auth:** `session`
- **Query params:** `page` (default 1), `page_size` (default 25, max 100)
- **Response 200:**

```json
{
  "items": [
    {
      "id": 1234,
      "action": "auth.magic_link.login",
      "target_type": "string | null",
      "target_id": "uuid | null",
      "ip": "string | null",
      "user_agent": "string | null",
      "metadata": {},
      "created_at": "ISO8601"
    }
  ],
  "total": 42,
  "page": 1,
  "page_size": 25
}
```

---

### **DELETE /v1/identity/me**

Permanently delete the current user's account (GDPR right-to-erasure).

- **Auth:** `session`
- **Response 200:** `{ "ok": true, "message": "Your account has been permanently deleted." }` — also clears the session cookie.
- **Errors:** 400 if the user is the **last owner** of one or more organizations. The error message lists the affected organization names. Transfer ownership first.

---

### **GET /v1/identity/me/linked-accounts**

List all login methods and linked external OAuth providers for the current user.

- **Auth:** `session`
- **Response 200:**

```json
{
  "primary_email": "user@example.com",
  "magic_link": { "enabled": true },
  "providers": [
    { "provider": "google", "linked": true, "linked_email": "user@gmail.com" },
    { "provider": "microsoft", "linked": false, "linked_email": null }
  ],
  "passkeys": 2,
  "totp_enabled": false
}
```

---

### **POST /v1/identity/me/linked-accounts/{provider}/start**

Begin linking a social provider to the current account. Returns a redirect URL for the OAuth flow.

- **Auth:** `session`
- **Path params:** `provider` = `google` or `microsoft`
- **Request body (optional):**

| Field | Type | Description |
|-------|------|-------------|
| `redirect_uri` | string | Where to send the user after linking |

- **Response 200:** `{ "authorization_url": "https://accounts.google.com/o/oauth2/..." }`
- **Errors:** 403 if the user is a platform staff member whose session is older than 10 minutes (re-authentication required).

---

### **DELETE /v1/identity/me/linked-accounts/{provider}**

Unlink a social provider from the current account.

- **Auth:** `session`
- **Path params:** `provider` = `google` or `microsoft`
- **Response 200:** `{ "ok": true, "message": "Provider unlinked successfully." }`
- **Errors:**
  - 403 — platform staff requires recent re-auth (session < 10 min), or unlinking would leave the account with no usable sign-in method
  - 404 — provider not linked

---

## 7. MFA — TOTP

### Mid-Login MFA (no session — challenge-based)

Rate limit: **10 req / 60 s**.

#### **POST /v1/mfa/verify**

Submit a TOTP code or backup code to complete a pending MFA challenge. Issues a session cookie on success.

- **Auth:** none
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge_id` | UUID | yes | From a login response that returned `mfa_required: true` |
| `code` | string | yes | 6-digit TOTP code or 8-character backup code |

- **Response 200:** Sets `rooiam_sid` cookie. Body: `{ "ok": true, "redirect_uri": "https://..." }`
- **Notes:** Backup code usage is recorded in the audit log.

---

#### **POST /v1/mfa/enroll/start**

Begin TOTP enrollment during an in-progress login challenge (when the org requires MFA but the user has none configured).

- **Auth:** none
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge_id` | UUID | yes | Active login challenge ID |

- **Response 200:**

```json
{
  "challenge_id": "uuid",
  "secret": "BASE32SECRET",
  "otpauth_uri": "otpauth://totp/..."
}
```

---

#### **POST /v1/mfa/enroll/finish**

Verify the TOTP code and activate TOTP. Issues a session cookie on success.

- **Auth:** none
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge_id` | UUID | yes | Challenge ID from `enroll/start` |
| `code` | string | yes | 6-digit TOTP code to confirm enrollment |

- **Response 200:** Sets `rooiam_sid` cookie. Body: `{ "ok": true, "redirect_uri": "https://..." }`

---

### Authenticated TOTP Management (session required)

#### **GET /v1/mfa/status**

Return TOTP status for the current user.

- **Auth:** `session`
- **Response 200:** `{ "totp_enabled": true, "backup_codes_remaining": 8 }`

---

#### **POST /v1/mfa/totp/start**

Begin TOTP enrollment for an already-logged-in user.

- **Auth:** `session`
- **Response 200:**

```json
{
  "challenge_id": "uuid",
  "secret": "BASE32SECRET",
  "otpauth_uri": "otpauth://totp/Rooiam:user@example.com?secret=...&issuer=Rooiam"
}
```

---

#### **POST /v1/mfa/totp/finish**

Confirm the TOTP code and activate TOTP. Returns backup codes.

- **Auth:** `session`
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge_id` | UUID | yes | From `totp/start` |
| `code` | string | yes | 6-digit TOTP code |

- **Response 200:** `{ "ok": true }`

---

#### **DELETE /v1/mfa/totp**

Disable TOTP for the current user (removes authenticator and backup codes).

- **Auth:** `session`
- **Response 200:** `{ "ok": true, "disabled": true }`

---

#### **POST /v1/mfa/recovery-codes/regenerate**

Generate a new set of backup codes, invalidating all previous codes.

- **Auth:** `session`
- **Response 200:** `{ "codes": ["ABCD1234", ...], "remaining": 10 }`

---

## 8. WebAuthn — Passkeys

### Login (no auth required)

Rate limit: **10 req / 60 s**.

#### **POST /v1/webauthn/login/start**

Begin a passkey authentication ceremony.

- **Auth:** none
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | yes | User's email address |
| `redirect_uri` | string | no | Final redirect after login |

- **Response 200:** `{ "challenge_id": "uuid", "request_options": { ... } }` — `request_options` is a WebAuthn `PublicKeyCredentialRequestOptions` object to pass to `navigator.credentials.get()`.

---

#### **POST /v1/webauthn/login/finish**

Complete the passkey authentication ceremony. Issues a session cookie or MFA challenge.

- **Auth:** none
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge_id` | UUID | yes | From `login/start` |
| `credential` | object | yes | `PublicKeyCredential` assertion from the browser |

- **Response 200 (success):** Sets `rooiam_sid` cookie. Body: `{ "ok": true, "redirect_uri": "https://..." }`
- **Response 200 (MFA required):** `{ "mfa_required": true, "challenge_id": "uuid" }`

---

#### **POST /v1/webauthn/login/report-failure**

Log a client-side passkey failure to the audit log (e.g., user cancelled or browser error).

- **Auth:** none
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | no | User's email (if known) |
| `stage` | string | yes | Failure stage (e.g., `"get"`, `"assertion"`) |
| `reason` | string | yes | Human-readable reason |

- **Response 200:** `{ "ok": true }`

---

### Registration (session required)

#### **POST /v1/webauthn/register/start**

Begin a new passkey registration for the logged-in user.

- **Auth:** `session`
- **Response 200:** `{ "challenge_id": "uuid", "creation_options": { ... } }` — `creation_options` is a `PublicKeyCredentialCreationOptions` object.

---

#### **POST /v1/webauthn/register/finish**

Complete the passkey registration and save the credential.

- **Auth:** `session`
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `challenge_id` | UUID | yes | From `register/start` |
| `name` | string | no | Human-friendly passkey name (e.g., `"MacBook Touch ID"`) |
| `credential` | object | yes | `PublicKeyCredential` attestation from the browser |

- **Response 200:** `{ "ok": true }`

---

#### **GET /v1/webauthn/passkeys**

List the current user's registered passkeys.

- **Auth:** `session`
- **Response 200:** Array of passkey objects:

```json
[
  {
    "id": "uuid",
    "name": "MacBook Touch ID",
    "aaguid": "string",
    "transports": ["internal"],
    "sign_count": 42,
    "last_used_at": "ISO8601 | null",
    "created_at": "ISO8601"
  }
]
```

---

#### **PATCH /v1/webauthn/passkeys/{id}**

Rename a registered passkey.

- **Auth:** `session`
- **Path params:** `id` (UUID of the passkey; must belong to the current user)
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | New name (1–100 chars, whitespace trimmed) |

- **Response 200:** `{ "ok": true, "name": "New Name" }`
- **Errors:** 400 if name is empty or exceeds 100 chars; 404 if passkey not found or not owned by current user.

---

#### **DELETE /v1/webauthn/passkeys/{id}**

Delete a specific passkey.

- **Auth:** `session`
- **Path params:** `id` (UUID of the passkey)
- **Response 200:** `{ "ok": true }`

---

## 9. Organizations (Workspaces)

### Public

#### **GET /v1/orgs/public/branding**

Get public branding configuration for a workspace. Used by the login UI before the user authenticates.

- **Auth:** none
- **Query params:** `slug` (required) — workspace slug
- **Response 200:**

```json
{
  "slug": "acme",
  "name": "Acme Corp",
  "login_display_name": "Acme Login",
  "login_title": "Welcome back",
  "login_subtitle": "Sign in to continue",
  "icon_url": "https://...",
  "icon_container": "square | circle",
  "login_logo_url": "https://...",
  "brand_color": "#0066FF",
  "show_login_logo": true,
  "show_login_title": true,
  "show_login_subtitle": false,
  "show_powered_by": true,
  "widget_radius": "rounded | sharp",
  "widget_shadow": "soft | none",
  "login_logo_container": "square | circle",
  "login_logo_size": "small | medium | large",
  "card_radius": "rounded | sharp",
  "button_style": "filled | outline",
  "card_bg_style": "auto | custom",
  "card_bg_color2": "#FFFFFF",
  "card_border_width": "1px | 2px",
  "card_border_color": "#DDDDDD",
  "login_method_order": ["magic_link", "passkey", "google", "microsoft"]
}
```

---

### Authenticated Workspace Endpoints

All require `session`. Workspace is determined by `current_org_id` on the session.

#### **GET /v1/orgs/current/portal**

Get the full tenant portal state: current workspace, all workspaces the user belongs to, permissions, available roles, and demo mode flag.

- **Auth:** `session`
- **Response 200:**

```json
{
  "current_org": { "id": "uuid", "name": "string", "slug": "string", ... },
  "organizations": [...],
  "permissions": ["branding:manage", "members:read", ...],
  "current_user_role_codes": ["owner"],
  "available_roles": [{ "id": "uuid", "name": "string", "code": "string", "description": "string | null" }],
  "max_logo_bytes": 2097152,
  "demo_mode": false,
  "max_workspaces_allowed": 5,
  "max_apps_per_workspace": 10
}
```

- **`current_user_role_codes`** — role codes the authenticated user holds in `current_org`. Use this to show/hide owner-level UI (e.g., ownership transfer, delete workspace). Different from `permissions` which lists individual capability codes.

---

#### **PATCH /v1/orgs/current/branding**

Update workspace branding fields. All fields are optional; omitted fields are unchanged.

- **Auth:** `session` + `branding:manage` permission
- **Request body (all optional):**

| Field | Type | Description |
|-------|------|-------------|
| `login_display_name` | string | Org name shown on login page |
| `login_title` | string | Title text |
| `login_subtitle` | string | Subtitle text |
| `icon_url` | string | Workspace icon URL |
| `login_logo_url` | string | Larger login-page logo URL |
| `brand_color` | string | CSS hex color |
| `show_login_logo` | bool | |
| `show_login_title` | bool | |
| `show_login_subtitle` | bool | |
| `show_powered_by` | bool | |
| `widget_radius` | string | `rounded` or `sharp` |
| `widget_shadow` | string | `soft` or `none` |
| `icon_container` | string | `square` or `circle` |
| `login_logo_container` | string | `square` or `circle` |
| `login_logo_size` | string | `small`, `medium`, or `large` |
| `card_radius` | string | `rounded` or `sharp` |
| `button_style` | string | `filled` or `outline` |
| `card_bg_style` | string | `auto` or `custom` |
| `card_bg_color2` | string | Secondary card background color |
| `card_border_width` | string | `1px` or `2px` |
| `card_border_color` | string | CSS hex color |
| `login_method_order` | string[] | Ordered list of login methods |

- **Response 200:** Updated organization object.

---

#### **POST /v1/orgs/current/branding/upload**

Upload a branding image (icon or login logo). Multipart form data.

- **Auth:** `session` + `branding:manage` permission
- **Content-Type:** `multipart/form-data`
- **Query params:**

| Param | Values | Description |
|-------|--------|-------------|
| `kind` | `icon` or `login-logo` | Which slot to upload to |

- **Response 200:** `{ "url": "https://...", "kind": "icon" }`
- **Notes:** Maximum file size is configured server-side (`ROOIAM_MAX_LOGO_BYTES`). Accepts JPEG and PNG.

---

#### **PATCH /v1/orgs/current/auth-policy**

Update login methods and MFA policy for the workspace.

- **Auth:** `session` + `auth_policy:manage` permission
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `allow_magic_link` | bool | yes | |
| `allow_google` | bool | yes | |
| `allow_microsoft` | bool | yes | |
| `allow_passkey` | bool | yes | |
| `require_mfa` | bool | yes | All members must enroll TOTP |
| `require_mfa_for_admins` | bool | no (default false) | Only admins must enroll TOTP |
| `allowed_email_domains` | string | no | Comma-separated domain allowlist |
| `max_session_age_hours` | integer | no | Override platform session duration |
| `max_concurrent_sessions` | integer | no | Limit concurrent sessions per user |

- **Response 200:** Updated organization object.

---

#### **POST /v1/orgs/current/auth-policy/preview**

Preview the impact of a proposed auth-policy change before applying it. Returns a count of members who would lose all login methods.

- **Auth:** `session` + `auth_policy:manage` permission
- **Request body:**

| Field | Type | Required |
|-------|------|----------|
| `allow_magic_link` | bool | yes |
| `allow_google` | bool | yes |
| `allow_microsoft` | bool | yes |
| `allow_passkey` | bool | yes |

- **Response 200:**

```json
{
  "would_lock_out_users": true,
  "warnings": ["3 members use magic link only and would be locked out."],
  "affected": [
    { "reason": "magic_link_only", "count": 3 },
    { "reason": "google_only", "count": 1 }
  ]
}
```

- **Errors:** 400 if no workspace selected; 403 if missing `auth_policy:manage`.

---

#### **POST /v1/orgs/current/auth-policy/self-check**

Check whether the **requesting user themselves** would lose access if the proposed policy were applied. Use this to warn the admin before they lock themselves out.

- **Auth:** `session` + `auth_policy:manage` permission
- **Request body:** Same as preview endpoint.
- **Response 200:**

```json
{
  "would_lock_out_self": false,
  "your_login_methods": {
    "magic_link": true,
    "google": false,
    "microsoft": false,
    "passkey": true
  }
}
```

- **Errors:** 400 if no workspace selected; 403 if missing `auth_policy:manage`.

---

#### **GET /v1/orgs/current/policy-snapshots**

List the last 10 saved auth-policy snapshots (created automatically when `PATCH auth-policy` succeeds).

- **Auth:** `session` + `auth_policy:manage` permission
- **Response 200:**

```json
{
  "snapshots": [
    {
      "id": 42,
      "snapshot": {
        "allow_magic_link": true,
        "allow_google": false,
        "allow_microsoft": false,
        "allow_passkey": true,
        "require_mfa": false,
        "require_mfa_for_admins": false,
        "allowed_email_domains": "",
        "max_session_age_hours": null,
        "max_concurrent_sessions": null
      },
      "created_by": "uuid | null",
      "created_at": "ISO8601"
    }
  ]
}
```

---

#### **POST /v1/orgs/current/policy-snapshots/{id}/restore**

Restore a previously saved auth-policy snapshot.

- **Auth:** `session` + `auth_policy:manage` permission
- **Path params:** `id` (integer snapshot ID)
- **Response 200:** `{ "ok": true, "message": "Policy restored from snapshot." }`
- **Errors:** 404 if snapshot does not exist or belongs to a different workspace.

---

#### **GET /v1/orgs/current/client-policy**

Get OAuth client management policy for the current workspace (platform governance + tenant overrides + effective combined).

- **Auth:** `session`
- **Response 200:**

```json
{
  "platform": { "tenant_client_management_enabled": true, "tenant_web_clients_enabled": true, ... },
  "tenant": { "allow_client_management": true, "allow_web_clients": true, ... },
  "effective": { ... }
}
```

---

#### **PATCH /v1/orgs/current/client-policy**

Update which OAuth client types the workspace is allowed to create.

- **Auth:** `session` + admin role
- **Request body:**

| Field | Type | Description |
|-------|------|-------------|
| `allow_client_management` | bool | Enable/disable client creation for this workspace |
| `allow_web_clients` | bool | Allow creating confidential web clients |
| `allow_spa_clients` | bool | Allow creating SPA (public) clients |
| `allow_native_clients` | bool | Allow creating native app clients |

- **Response 200:** Same shape as `GET /v1/orgs/current/client-policy`.

---

#### **GET /v1/orgs/current/ip-policy**

Get IP access policy for the workspace (platform defaults + tenant overrides + effective merged policy).

- **Auth:** `session`
- **Response 200:** `{ "platform": {...}, "tenant": {...}, "effective": {...} }`

---

#### **PATCH /v1/orgs/current/ip-policy**

Update the workspace IP allowlist/blocklist.

- **Auth:** `session` + admin role
- **Request body:**

| Field | Type | Description |
|-------|------|-------------|
| `use_custom_ip_policy` | bool | If false, inherits platform defaults |
| `allowlist` | string | Newline-separated CIDR blocks / IPs |
| `blocklist` | string | Newline-separated CIDR blocks / IPs |

- **Response 200:** Same shape as `GET /v1/orgs/current/ip-policy`.

---

#### **GET /v1/orgs/current/auth-config**

Get OIDC / Client Login configuration (issuer, allowed callback URLs, etc.).

- **Auth:** `session`
- **Response 200:** Auth configuration object.

---

#### **PATCH /v1/orgs/current/auth-config**

Update OIDC / Client Login configuration.

- **Auth:** `session` + admin role
- **Request body:** Auth config fields (varies; mirrors response shape from GET).
- **Response 200:** Updated auth config object.

---

#### **PATCH /v1/orgs/current/status**

Suspend or reactivate the current workspace (self-service; limited to owner).

- **Auth:** `session` + owner role
- **Request body:** `{ "status": "active | suspended" }`
- **Response 200:** Updated organization object.

---

#### **GET /v1/orgs/current/members**

List all members of the current workspace with their roles and user info.

- **Auth:** `session` + `members:read` permission
- **Response 200:** Array of member objects:

```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "email": "user@example.com",
    "display_name": "string | null",
    "avatar_url": "string | null",
    "role_names": ["Admin"],
    "role_codes": ["admin"],
    "status": "active"
  }
]
```

---

#### **PATCH /v1/orgs/current/members/{member_id}/role**

Change a member's role.

- **Auth:** `session` + `members:manage` permission
- **Path params:** `member_id` (UUID of the membership record)
- **Request body:** `{ "role": "admin | manager | member | viewer" }`
- **Response 200:** `{ "ok": true }`
- **Notes:** Cannot change the role of the workspace owner.

---

#### **GET /v1/orgs/current/role-templates**

List built-in role templates available for creating custom roles. No permission check — any authenticated member can view.

- **Auth:** `session`
- **Response 200:**

```json
{
  "templates": [
    {
      "name": "Billing Admin",
      "code": "billing_admin",
      "description": "Can manage billing and subscription settings.",
      "permissions": ["org:update"]
    },
    {
      "name": "Support Agent",
      "code": "support_agent",
      "description": "Can view member list and audit logs.",
      "permissions": ["members:read", "activity:read"]
    },
    {
      "name": "Auditor",
      "code": "auditor",
      "description": "Read-only access to audit logs.",
      "permissions": ["activity:read"]
    },
    {
      "name": "Security Admin",
      "code": "security_admin",
      "description": "Can manage auth policy, IP policy, and MFA settings.",
      "permissions": ["auth_policy:manage", "roles:manage"]
    }
  ]
}
```

---

#### **GET /v1/orgs/current/role-diff**

Compare permissions of two roles side by side.

- **Auth:** `session` + `roles:manage` permission
- **Query params:** `role_a` (UUID), `role_b` (UUID) — both required
- **Response 200:**

```json
{
  "role_a_id": "uuid",
  "role_b_id": "uuid",
  "only_in_a": ["branding:manage"],
  "only_in_b": ["activity:read"],
  "in_both": ["members:read", "org:update"]
}
```

- **Errors:** 400 if workspace not selected or role_a/role_b missing; 403 if no `roles:manage`.

---

#### **POST /v1/orgs/current/owner-transfer**

Initiate an ownership transfer to another active member. The current owner remains owner until the target accepts (via `/orgs/invites/accept` with the transfer token, or a dedicated confirmation step).

- **Auth:** `session` + must be workspace owner
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `to_user_id` | UUID | yes | Must be an active member of the workspace, cannot be self |

- **Response 200:**

```json
{
  "ok": true,
  "token": "base64-encoded-transfer-token",
  "expires_at": "ISO8601 (48 hours from now)",
  "message": "Ownership transfer initiated. The target user must confirm with the provided token within 48 hours."
}
```

- **Errors:** 400 if targeting self or target is not an active member; 403 if not workspace owner.

---

#### **GET /v1/orgs/current/activity**

Get the workspace audit log. Paginated.

- **Auth:** `session` + `activity:read` permission
- **Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `page_size` | integer | 30 | Entries per page |
| `search` | string | — | Filter by actor email or action |
| `action` | string | — | Filter by exact action code |

- **Response 200:**

```json
{
  "items": [
    {
      "id": 1234,
      "actor_user_id": "uuid | null",
      "actor_display_name": "string | null",
      "actor_email": "string | null",
      "action": "auth.magic_link.login",
      "target_type": "user",
      "target_id": "uuid | null",
      "ip": "string | null",
      "metadata": {},
      "created_at": "ISO8601"
    }
  ],
  "total": 150,
  "page": 1,
  "page_size": 30
}
```

---

#### **GET /v1/orgs/current/activity/export**

Export the workspace audit log as CSV or JSON (max 10,000 rows).

- **Auth:** `session` + `activity:read` permission
- **Query params:**

| Param | Default | Description |
|-------|---------|-------------|
| `format` | `csv` | `csv` or `json` |
| `search` | — | Filter by text across all fields (max 256 chars) |
| `action` | `all` | `all`, `success`, `failed`, or `suspicious` |

- **Response 200 (CSV):** `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="activity.csv"`
  - Columns: `id`, `actor_user_id`, `actor_email`, `actor_display_name`, `action`, `target_type`, `target_id`, `ip`, `metadata`, `created_at`
  - String values are double-quote escaped; values starting with `=`, `+`, `-`, `@` are prefixed with a tab (formula-injection protection).
- **Response 200 (JSON):** `Content-Type: application/json`, `Content-Disposition: attachment; filename="activity.json"` — array of objects with the same fields.
- **Errors:** 400 if workspace not selected or search > 256 chars; 403 if missing `activity:read`.

---

#### **POST /v1/orgs/current/invites**

Send a membership invitation email to a new user.

- **Auth:** `session` + `members:manage` permission
- **Request body:** `{ "email": "invitee@example.com" }`
- **Response 200:** `{ "ok": true, "message": "Invite sent." }`

---

#### **GET /v1/orgs/current/clients**

List OAuth clients scoped to the current workspace.

- **Auth:** `session`
- **Response 200:** Array of `OrgClientResponse` objects:

```json
[
  {
    "client": {
      "id": "uuid",
      "client_id": "roo_client_...",
      "app_name": "My App",
      "app_type": "spa",
      "status": "active",
      "org_id": "uuid",
      "is_first_party": false,
      "created_at": "ISO8601"
    },
    "redirect_uris": ["https://app.example.com/callback"],
    "client_secret": null
  }
]
```

---

#### **POST /v1/orgs/current/clients**

Create an OAuth client scoped to the current workspace.

- **Auth:** `session`
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `app_name` | string | yes | Human-readable name |
| `app_type` | string | yes | `web`, `spa`, or `native` |
| `redirect_uris` | string[] | yes | Allowed redirect URIs |

- **Response 201:** `OrgClientResponse` — `client_secret` included in body **once** for `web` (confidential) clients.

---

#### **POST /v1/orgs/current/clients/{client_id}/rotate-secret**

Rotate the client secret for a confidential (`web`) workspace client.

- **Auth:** `session`
- **Path params:** `client_id` (UUID)
- **Response 200:** `{ "client_id": "roo_client_...", "client_secret": "new-secret-shown-once" }`
- **Notes:** The new secret is shown **only once**. The old secret is immediately invalidated.

---

#### **PATCH /v1/orgs/current/clients/{client_id}/status**

Pause or resume a workspace-scoped client.

- **Auth:** `session`
- **Path params:** `client_id` (UUID)
- **Request body:** `{ "status": "active | paused" }`
- **Response 200:** Updated client object.

---

#### **DELETE /v1/orgs/current/clients/{client_id}**

Permanently delete a workspace-scoped OAuth client and all associated tokens.

- **Auth:** `session`
- **Path params:** `client_id` (UUID)
- **Response 200:** `{ "ok": true }`

---

#### **GET /v1/orgs/current/api-keys**

List API keys for the current workspace.

- **Auth:** `session`
- **Response 200:** Array of API key objects (key values are not returned).

---

#### **POST /v1/orgs/current/api-keys**

Create a new API key for the current workspace.

- **Auth:** `session`
- **Response 200:** API key object — the raw key value is returned **only once**.

---

#### **DELETE /v1/orgs/current/api-keys/{key_id}**

Revoke an API key.

- **Auth:** `session`
- **Path params:** `key_id` (UUID)
- **Response 200:** `{ "ok": true }`

---

### Multi-Org / Cross-Workspace

#### **POST /v1/orgs**

Create a new organization/workspace.

- **Auth:** `session`
- **Request body:** `{ "name": "Acme Corp", "slug": "acme" }`
- **Response 201:** Created organization object.
- **Notes:** Disabled in demo mode. Subject to `max_workspaces_per_user` governance limit.

---

#### **GET /v1/orgs**

List all organizations the current user is a member of.

- **Auth:** `session`
- **Response 200:** Array of organization objects.

---

#### **POST /v1/orgs/switch**

Switch the session's `current_org_id` to a different workspace.

- **Auth:** `session`
- **Request body:** `{ "organization_id": "uuid" }`
- **Response 200:** `{ "ok": true, "current_org_id": "uuid" }`

---

#### **GET /v1/orgs/{org_id}/members**

List members of any specific organization the current user belongs to.

- **Auth:** `session` (must be a member of `org_id`)
- **Path params:** `org_id` (UUID)
- **Response 200:** Array of member objects.

---

#### **POST /v1/orgs/{org_id}/invites**

Send an invite to a specific organization.

- **Auth:** `session` + `members:manage` in that org
- **Path params:** `org_id` (UUID)
- **Request body:** `{ "email": "invitee@example.com" }`
- **Response 200:** `{ "ok": true, "message": "Invite sent." }`

---

#### **POST /v1/orgs/invites/accept**

Accept a pending workspace invitation. User must be logged in.

- **Auth:** `session`
- **Request body:** `{ "token": "invite-token-from-email" }`
- **Response 200:** `{ "ok": true, "organization_id": "uuid", "organization_name": "Acme Corp" }`

---

## 10. RBAC — Roles & Permissions

### Built-in roles

| Code | Display Name |
|------|-------------|
| `owner` | Owner |
| `admin` | Admin |
| `manager` | Manager |
| `member` | Member |
| `viewer` | Viewer |

Custom roles can be created per workspace. The `PATCH /v1/orgs/current/members/{member_id}/role` endpoint accepts any valid role code visible in `GET /v1/orgs/current/portal` under `available_roles`.

### Custom role endpoints

#### **GET /v1/orgs/current/custom-roles**

List custom roles defined for the current workspace.

- **Auth:** `session`
- **Response 200:** Array of `{ "id": "uuid", "name": "string", "code": "string", "description": "string | null", "permissions": ["string"] }`

---

#### **POST /v1/orgs/current/custom-roles**

Create a new custom role.

- **Auth:** `session` + `roles:manage` permission
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | yes | Display name |
| `code` | string | yes | Unique code within workspace (snake_case) |
| `description` | string | no | Optional description |
| `permissions` | string[] | yes | Permission codes to grant |

- **Response 201:** Created role object.

---

#### **DELETE /v1/orgs/current/custom-roles/{id}**

Delete a custom role. Members with that role must be reassigned first.

- **Auth:** `session` + `roles:manage` permission
- **Path params:** `id` (UUID)
- **Response 200:** `{ "ok": true }`
- **Errors:** 400 if role still has active members; 404 if not found.

---

## 11. OAuth Clients (Personal / Platform-Level)

These endpoints manage OAuth clients owned by the authenticated user (not scoped to a workspace).

### **GET /v1/clients**

List OAuth clients created by the current user.

- **Auth:** `session`
- **Response 200:** Array of `ClientResponse`:

```json
[
  {
    "client": {
      "id": "uuid",
      "client_id": "roo_client_...",
      "app_name": "My Personal App",
      "app_type": "spa",
      "status": "active",
      "owner_user_id": "uuid",
      "is_first_party": false,
      "created_at": "ISO8601"
    },
    "redirect_uris": ["https://myapp.example.com/callback"],
    "client_secret": null
  }
]
```

---

### **POST /v1/clients**

Create a personal OAuth client.

- **Auth:** `session`
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `app_name` | string | yes | Human-readable application name |
| `app_type` | string | yes | `web`, `spa`, or `native` |
| `redirect_uris` | string[] | yes | Allowed redirect URIs (max 25) |

- **Response 201:** `ClientResponse` — `client_secret` included **once** for `web` clients.

---

### **POST /v1/clients/{id}/rotate-secret**

Rotate the client secret for a personal confidential client.

- **Auth:** `session`
- **Path params:** `id` (UUID)
- **Response 200:** `{ "client_id": "roo_client_...", "client_secret": "new-secret" }`

---

### **PATCH /v1/clients/{id}/status**

Pause or resume a personal OAuth client.

- **Auth:** `session`
- **Path params:** `id` (UUID)
- **Request body:** `{ "status": "active | paused" }`
- **Response 200:** Updated client object.

---

## 12. Admin — Platform Management

All admin endpoints require `platform_staff` auth (`is_superuser OR is_platform_owner`).
Endpoints marked **owner-only** additionally require `is_platform_owner = true`.

### Users

#### **GET /v1/admin/users**

List all users in the system. Paginated.

- **Auth:** `platform_staff`
- **Query params:** `page`, `page_size`, `search` (email / display name)
- **Response 200:**

```json
{
  "items": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "display_name": "string | null",
      "avatar_url": "string | null",
      "created_at": "ISO8601",
      "status": "active | suspended",
      "is_platform_owner": false,
      "is_superuser": false,
      "workspace_count": 2,
      "primary_workspace_name": "Acme Corp",
      "primary_workspace_slug": "acme",
      "primary_workspace_icon_url": "string | null",
      "primary_workspace_icon_container": "square",
      "highest_workspace_role": "admin"
    }
  ],
  "total": 42,
  "page": 1,
  "page_size": 25
}
```

---

#### **GET /v1/admin/users/{user_id}**

Get detailed user information including workspace memberships and recent activity.

- **Auth:** `platform_staff`
- **Path params:** `user_id` (UUID)
- **Response 200:**

```json
{
  "user": { ... },
  "workspace_memberships": [
    {
      "membership_id": "uuid",
      "organization_id": "uuid",
      "organization_name": "Acme Corp",
      "organization_slug": "acme",
      "organization_icon_url": "string | null",
      "organization_icon_container": "square",
      "membership_status": "active",
      "role_names": ["Admin"],
      "role_codes": ["admin"]
    }
  ],
  "recent_activity": [...]
}
```

---

#### **PATCH /v1/admin/users/{user_id}/status**

Suspend or reactivate a user account.

- **Auth:** `platform_staff`
- **Path params:** `user_id` (UUID)
- **Request body:** `{ "status": "active | suspended" }`
- **Response 200:** Updated user object.
- **Notes:** Suspending a user immediately revokes all their sessions.

---

#### **GET /v1/admin/users/{user_id}/sessions**

List all active sessions for a specific user.

- **Auth:** `platform_staff`
- **Response 200:** Array of session objects.

---

#### **DELETE /v1/admin/users/{user_id}/sessions**

Revoke all sessions for a specific user.

- **Auth:** `platform_staff`
- **Response 200:** `{ "ok": true, "revoked": 3 }`

---

### Organizations

#### **GET /v1/admin/organizations**

List all workspaces/organizations. Paginated.

- **Auth:** `platform_staff`
- **Query params:** `page`, `page_size`, `search`
- **Response 200:** `{ "items": [AdminOrganizationSummary], "total": int, "page": int, "page_size": int }`

`AdminOrganizationSummary` fields: `id`, `name`, `slug`, `status`, `platform_locked`, `member_count`, `app_count`, `allow_magic_link`, `allow_google`, `allow_microsoft`, `allow_passkey`, `require_mfa`, `created_at`.

---

#### **GET /v1/admin/organizations/{organization_id}**

Get full organization details including members, clients, and recent activity.

- **Auth:** `platform_staff`
- **Path params:** `organization_id` (UUID)
- **Response 200:**

```json
{
  "organization": { "id": "uuid", "name": "string", "slug": "string", "status": "active", "platform_locked": false, "member_count": 5, "app_count": 2, ... },
  "owner": { ... },
  "admins": [...],
  "members": [...],
  "clients": [...],
  "recent_activity": [...]
}
```

---

#### **PATCH /v1/admin/organizations/{organization_id}/status**

Suspend, reactivate, or platform-lock an organization.

- **Auth:** `platform_staff`
- **Request body:** `{ "status": "active | suspended", "platform_locked": true }`
- **Response 200:** `{ "id": "uuid", "status": "suspended", "platform_locked": true }`

---

#### **GET /v1/admin/organizations/{organization_id}/session-policy**

Get per-org session policy overrides (relative to platform defaults).

- **Auth:** `platform_staff`
- **Response 200:**

```json
{
  "platform_session_duration_days": 7,
  "platform_magic_link_expiry_minutes": 15,
  "platform_oidc_access_token_ttl_minutes": 60,
  "platform_refresh_token_ttl_days": 30,
  "platform_idle_timeout_minutes": 0,
  "session_duration_days": null,
  "magic_link_expiry_minutes": null,
  "oidc_access_token_ttl_minutes": null,
  "refresh_token_ttl_days": null,
  "idle_timeout_minutes": null
}
```

`null` values mean the org inherits the platform default.

---

#### **PATCH /v1/admin/organizations/{organization_id}/session-policy**

Override session timings for a specific organization.

- **Auth:** `platform_staff`
- **Request body:** Any subset of `session_duration_days`, `magic_link_expiry_minutes`, `oidc_access_token_ttl_minutes`, `refresh_token_ttl_days`, `idle_timeout_minutes` (all `integer | null`; null clears override).
- **Response 200:** Updated session policy.

---

### Clients

#### **GET /v1/admin/clients**

List all OAuth clients across the platform.

- **Auth:** `platform_staff`
- **Query params:** `page`, `page_size`, `search`
- **Response 200:** Paginated list of `AdminClient`:

```json
{
  "items": [
    {
      "id": "uuid",
      "client_id": "roo_client_...",
      "app_name": "My App",
      "app_type": "spa",
      "status": "active",
      "owner_user_id": "uuid | null",
      "owner_email": "string | null",
      "org_id": "uuid | null",
      "organization_name": "string | null",
      "organization_slug": "string | null",
      "is_first_party": false,
      "created_at": "ISO8601",
      "redirect_uris": ["https://..."]
    }
  ],
  "total": 10, "page": 1, "page_size": 25
}
```

---

#### **POST /v1/admin/clients/{client_id}/rotate-secret**

Rotate the client secret for any confidential web client in the platform.

- **Auth:** `platform_staff`
- **Path params:** `client_id` (UUID)
- **Response 200:** `{ "client_id": "roo_client_...", "client_secret": "new-secret-shown-once" }`

---

#### **PATCH /v1/admin/clients/{client_id}/status**

Pause or resume any OAuth client.

- **Auth:** `platform_staff`
- **Path params:** `client_id` (UUID)
- **Request body:** `{ "status": "active | paused" }`
- **Response 200:** Updated client object.

---

### Audit Logs

#### **GET /v1/admin/audit-logs**

Platform-wide audit log. Paginated.

- **Auth:** `platform_staff`
- **Query params:** `page`, `page_size`, `search`
- **Response 200:** Paginated list of `AdminAuditLog`:

```json
{
  "items": [
    {
      "id": 1234,
      "actor_user_id": "uuid | null",
      "actor_email": "string | null",
      "actor_display_name": "string | null",
      "organization_id": "uuid | null",
      "action": "auth.magic_link.login",
      "target_type": "user",
      "target_id": "uuid | null",
      "ip": "192.168.1.1",
      "user_agent": "string | null",
      "metadata": {},
      "created_at": "ISO8601"
    }
  ],
  "total": 500, "page": 1, "page_size": 25
}
```

---

#### **GET /v1/admin/tenant/members**

List all workspace members across the entire platform.

- **Auth:** `platform_staff`
- **Query params:** `page`, `page_size`, `search`, `role` (filter by role code)
- **Response 200:** Paginated member list.

---

#### **GET /v1/admin/tenant/audit-logs**

Workspace-scoped audit logs across all organizations.

- **Auth:** `platform_staff`
- **Query params:** `page`, `page_size`, `search`
- **Response 200:** Paginated audit log list.

---

### Platform Governance Policies

#### **GET /v1/admin/tenant-access**

Get platform-level tenant auth method defaults (which login methods are allowed for new workspaces).

- **Auth:** `platform_staff`
- **Response 200:** `{ "allow_magic_link": bool, "allow_google": bool, "allow_microsoft": bool, "allow_passkey": bool }`

#### **PATCH /v1/admin/tenant-access**

Update the platform-level tenant auth method defaults.

- **Auth:** `platform_staff`
- **Request body:** Same fields as `GET` response.
- **Response 200:** Updated policy.

---

#### **GET /v1/admin/client-governance**

Get platform-wide OAuth client governance rules.

- **Auth:** `platform_staff`
- **Response 200:** `{ "tenant_client_management_enabled": bool, "tenant_web_clients_enabled": bool, "tenant_spa_clients_enabled": bool, "tenant_native_clients_enabled": bool, "max_workspace_clients_per_tenant": int | null }`

#### **PATCH /v1/admin/client-governance**

Update platform-wide OAuth client governance rules.

- **Auth:** `platform_staff`
- **Request body:** Same fields as `GET` response.
- **Response 200:** Updated policy.

---

#### **GET /v1/admin/ip-policy**

Get platform IP access policy (applied to all tenant login flows by default).

- **Auth:** `platform_staff`
- **Response 200:** `{ "tenant_ip_policy_editable": bool, "default_allowlist": "...", "default_blocklist": "..." }`

#### **PATCH /v1/admin/ip-policy**

Update platform IP access policy.

- **Auth:** `platform_staff`
- **Request body:** `{ "tenant_ip_policy_editable": bool, "default_allowlist": "...", "default_blocklist": "..." }`
- **Response 200:** Updated policy.

---

#### **GET /v1/admin/ip-policy/admin**

Get IP access policy for the admin console itself.

- **Auth:** `platform_staff`
- **Response 200:** `{ "allowlist": "...", "blocklist": "..." }`

#### **PATCH /v1/admin/ip-policy/admin**

Update the admin console IP access policy.

- **Auth:** `platform_staff`
- **Request body:** `{ "allowlist": "...", "blocklist": "..." }`
- **Response 200:** Updated policy.

---

#### **GET /v1/admin/workspace-governance**

Get workspace creation governance (e.g., max workspaces per user).

- **Auth:** `platform_staff`
- **Response 200:** `{ "max_workspaces_per_user": int | null }`

#### **PATCH /v1/admin/workspace-governance**

Update workspace creation governance.

- **Auth:** `platform_staff`
- **Request body:** `{ "max_workspaces_per_user": int | null }`
- **Response 200:** Updated policy.

---

#### **GET /v1/admin/session-policy**

Get platform-wide session and token lifetime settings.

- **Auth:** `platform_staff`
- **Response 200:**

```json
{
  "session_duration_days": 7,
  "magic_link_expiry_minutes": 15,
  "oidc_access_token_ttl_minutes": 60,
  "refresh_token_ttl_days": 30,
  "idle_timeout_minutes": 0
}
```

#### **PATCH /v1/admin/session-policy**

Update platform session and token lifetime settings.

- **Auth:** `platform_staff`
- **Request body:** Any subset of the fields above (all optional integers).
- **Response 200:** Updated policy.

---

#### **GET /v1/admin/storage-config**

Get object storage configuration (MinIO / S3).

- **Auth:** `platform_staff`
- **Response 200:** Storage config object (bucket, endpoint, credentials masked).

#### **PATCH /v1/admin/storage-config**

Update object storage configuration.

- **Auth:** `platform_staff`
- **Request body:** Storage config fields.
- **Response 200:** Updated config.

#### **POST /v1/admin/storage-config/test**

Test connectivity to the configured object storage.

- **Auth:** `platform_staff`
- **Response 200:** `{ "ok": true }` or error message.

---

## 13. Setup Wizard

The setup wizard endpoints are used during initial server configuration. Most write endpoints are
guarded by `setup_trust` (loopback IP or `X-Setup-Token` header), not a user session.

### **GET /v1/setup/status**

Check initialization state. Safe to poll; used by the wizard UI to determine which steps remain.

- **Auth:** none
- **Response 200:**

```json
{
  "initialized": false,
  "has_admin_user": false,
  "has_smtp": false,
  "has_google_oauth": false,
  "has_microsoft_oauth": false,
  "demo_mode": false
}
```

---

### **GET /v1/setup/public-urls**

Return the currently configured public URLs (issuer, frontend, admin console, OAuth callback URLs).

- **Auth:** none
- **Response 200:**

```json
{
  "issuer_url": "https://auth.example.com",
  "frontend_url": "https://app.example.com",
  "admin_url": "https://admin.example.com",
  "google_callback_url": "https://auth.example.com/v1/oauth/google/callback",
  "microsoft_callback_url": "https://auth.example.com/v1/oauth/microsoft/callback"
}
```

---

### **GET /v1/setup/auth-methods**

Return which auth methods are enabled, optionally scoped to a workspace slug.

- **Auth:** none
- **Query params:**

| Param | Description |
|-------|-------------|
| `org` | Workspace slug to scope the response |
| `workspace` | Alias for `org` |

- **Response 200:**

```json
{
  "magic_link_enabled": true,
  "google_enabled": false,
  "microsoft_enabled": false,
  "passkey_enabled": true,
  "mfa_required": false,
  "demo_mode": false
}
```

---

### **GET /v1/setup/login-bootstrap**

Combined auth methods + workspace branding for the login UI. Single request to hydrate the login page.

- **Auth:** none
- **Query params:** `org` or `workspace` (workspace slug)
- **Response 200:**

```json
{
  "auth": { "magic_link_enabled": true, ... },
  "workspace": { "slug": "acme", "name": "Acme Corp", ... }
}
```

`workspace` is `null` when no matching workspace slug is provided.

---

### **POST /v1/setup/create-admin**

Create the first admin user. Only allowed before setup is complete and when no users exist.

- **Auth:** `setup_trust`
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | yes | Admin email address |
| `display_name` | string | yes | Admin display name |

- **Response 200:** `{ "ok": true }` — a magic link is sent to the email to complete sign-in.
- **Notes:** Blocked once any user exists. After setup is complete, returns 403.

---

### **GET /v1/setup/config**

Get full setup configuration (SMTP, OAuth credentials, URLs). Sensitive values are masked.

- **Auth:** `setup_trust`
- **Response 200:** `SetupConfigResponse` — all configuration fields with masked secrets.

---

### **POST /v1/setup/configure-public-urls**

Set or update the issuer URL, frontend URL, and admin URL. Changing the issuer resets OAuth verification.

- **Auth:** `setup_trust`
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `issuer_url` | string | yes | OIDC issuer (must be HTTPS in production) |
| `frontend_url` | string | yes | Tenant app frontend |
| `admin_url` | string | yes | Admin console URL |

- **Response 200:** Updated `PublicUrlsResponse`.

---

### **POST /v1/setup/configure-smtp**

Save SMTP settings for sending emails (magic links, invites).

- **Auth:** `setup_trust`
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `host` | string | yes | SMTP hostname |
| `port` | integer | yes | SMTP port (e.g., 587) |
| `username` | string | yes | SMTP username |
| `password` | string | yes | SMTP password |
| `from_email` | string | yes | Sender address |

- **Response 200:** `{ "ok": true }`

---

### **POST /v1/setup/test-smtp**

Send a test email to verify SMTP settings without saving them.

- **Auth:** `setup_trust`
- **Request body:** All SMTP fields (same as `configure-smtp`) **plus** `test_email` (string, required).
- **Response 200:** `{ "ok": true }` or an error with detail.

---

### **POST /v1/setup/test-redis**

Test a Redis connection by URL.

- **Auth:** `setup_trust`
- **Request body:** `{ "url": "redis://localhost:6379" }`
- **Response 200:** `{ "ok": true }` or error.

---

### **POST /v1/setup/configure-oauth**

Save Google and/or Microsoft OAuth2 credentials for social login.

- **Auth:** `setup_trust`
- **Request body (all fields optional):**

| Field | Type | Description |
|-------|------|-------------|
| `google_client_id` | string | Google OAuth2 client ID |
| `google_client_secret` | string | Google OAuth2 client secret |
| `google_admin_login_enabled` | bool | Allow Google login on the admin console |
| `microsoft_client_id` | string | Microsoft OAuth2 client ID |
| `microsoft_client_secret` | string | Microsoft OAuth2 client secret |
| `microsoft_tenant_id` | string | Microsoft Azure tenant ID (`common` for multi-tenant) |
| `microsoft_admin_login_enabled` | bool | Allow Microsoft login on the admin console |

- **Response 200:** `{ "ok": true }`

---

### **GET /v1/setup/storage-config**

Get object storage configuration (setup wizard variant, pre-auth).

- **Auth:** `setup_trust`
- **Response 200:** Storage config object.

### **POST /v1/setup/storage-config**

Save object storage configuration.

- **Auth:** `setup_trust`
- **Response 200:** `{ "ok": true }`

### **POST /v1/setup/test-storage**

Test connectivity to the provided storage configuration.

- **Auth:** `setup_trust`
- **Response 200:** `{ "ok": true }` or error.

---

### **POST /v1/setup/demo-login** *(demo mode only)*

Issue a session for a demo user without going through the normal login flow. Only available when `ROOIAM_ENABLE_DEMO_SEED=true`.

- **Auth:** none
- **Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `org_slug` | string | yes | Demo workspace slug (e.g., `"roochoco"`) |
| `app_name` | string | no | Application name hint |
| `email` | string | no | Demo user email; defaults to the seeded user for the workspace |

- **Response 200:** Sets `rooiam_sid` cookie. Body: `{ "ok": true }`

---

### **POST /v1/setup/complete**

Mark setup as completed. Subsequent calls to guarded setup endpoints will require proper platform staff auth.

- **Auth:** `setup_trust`
- **Response 200:** `{ "ok": true }`

---

*Document updated 2026-03-23. Reflects Rooiam server migrations 0001–0016 plus security fixes: `FOR UPDATE` on OIDC auth code exchange, `post_logout_redirect_uri` validation on `end_session`, auth middleware idle-timeout fail-safe, PII removed from magic link and invite logs.*
