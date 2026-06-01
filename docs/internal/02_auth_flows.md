# Authentication Flows

This document describes every authentication flow in Rooiam with step-by-step detail. All flows ultimately produce an opaque session cookie or a pending MFA challenge response.

---

## Common Post-Auth Pattern

Every successful primary-credential verification follows the same finishing sequence before a session cookie is issued:

1. **Auth policy check** — verify the method is enabled for the workspace (`ensure_auth_method_allowed`).
2. **Resolve login context** — look up `current_org_id`, `app_name`, `workspace_slug` for the session record.
3. **MFA enrollment gate** — if `workspace.require_mfa = true` and user has no TOTP, start an enrollment challenge and return `{ mfa_enrollment_required: true, challenge_id }`. No session is created yet.
4. **MFA login gate** — if user has TOTP enabled, start a login challenge and return `{ mfa_required: true, challenge_id }`. No session is created yet.
5. **Session creation** — `SessionService::create_opaque_session_with_context` generates the opaque cookie token and persists the hashed secret.
6. **Audit log** — success event is written.
7. **Response** — cookie is set with `HttpOnly; SameSite=None; Secure` (7-day expiry). The raw session string is never returned in the JSON body.

---

## Magic Link Flow

**Endpoints:** `POST /v1/auth/magic-link/start`, `POST /v1/auth/magic-link/verify`

### Start

```
Client → POST /v1/auth/magic-link/start
  body: { email, redirect_uri?, surface? }

1. Normalize email (trim + lowercase)
2. Call ensure_auth_method_allowed(redirect_uri, MagicLink)
   → if workspace found and allow_magic_link = false → 422 Validation error
3. Generate 32-byte OsRng token → base64url → raw_token
4. SHA-256(raw_token) → store in magic_links table (expiry = +15 min)
5. Build verify URL:
   → surface="admin" → {admin_url}/verify?token={raw_token}&redirect_uri=...
   → otherwise    → {frontend_url}/verify?token={raw_token}&redirect_uri=...
6. Send HTML email via SMTP infra
7. Return { ok: true, message: "If the email is valid..." }
   (intentionally vague — no user enumeration)
```

### Verify

```
Client → POST /v1/auth/magic-link/verify
  body: { token }

1. SHA-256(token) → look up magic_links WHERE token_hash = hash AND used_at IS NULL AND expiry > NOW()
   → not found → 401 + audit log auth.login.failed + suspicious-IP counter
2. Mark magic_links.used_at = NOW()
3. ensure_auth_method_allowed(redirect_uri, MagicLink)
4. identity lookup: get_user_id_by_email OR create_user_with_email (auto-provision)
5. resolve_login_context → get current_org_id, app_name, workspace_slug
6. MFA enrollment gate (if workspace requires_mfa and user has no TOTP)
   → return { mfa_enrollment_required: true, challenge_id }
7. MFA login gate (if user has TOTP)
   → audit log auth.mfa.required
   → return { mfa_required: true, challenge_id }
8. Create opaque session (7-day cookie)
9. Audit log auth.login.success
10. Return 200 + Set-Cookie + { ok, user_id, redirect_uri }
```

### Suspicious IP Rate Limiting

Failed magic link verifications increment a Redis counter keyed on `security:failed_login:{ip}` with a 600-second TTL. When the counter reaches 5 or more, an `auth.login.suspicious` audit event is written.

---

## Google / Microsoft OAuth Flow

**Endpoints:** `GET /v1/oauth/login`, `GET /v1/oauth/{provider}/callback`

### Step 1 — Initiate

```
Client → GET /v1/oauth/login?provider=google&redirect_uri=...&surface=user&intent=login

1. Validate provider (google | microsoft)
2. If intent=login: ensure_auth_method_allowed(redirect_uri, Google/Microsoft)
3. If surface=admin and intent=login: check system_settings.google_admin_login_enabled
4. Generate 32-byte OsRng state token → base64url
5. Store in Redis: oauth_state:{token} = JSON{ intent, final_redirect, provider, surface, link_user_id }
   TTL = 600 seconds
6. Build authorization URL with client_id, redirect_uri, state, scopes
7. Redirect 302 to provider authorization URL
```

### Step 2 — Callback

```
Provider → GET /v1/oauth/{provider}/callback?code=...&state=...

1. Look up Redis key oauth_state:{state}
   → not found → audit log oauth.login.failed, return 422
2. Parse OAuthStatePayload (intent, final_redirect, surface, link_user_id)
3. DELETE Redis key (one-time use)
4. If intent != link: ensure_auth_method_allowed(final_redirect, provider)
5. Exchange code for provider access token (POST to token endpoint)
6. Fetch user profile from provider userinfo endpoint
7. Branch on intent:
   a. oauth_test: store google/microsoft_oauth_verified_at timestamp, redirect to final_redirect?oauth_test_result=success
   b. link: verify active session, check user match, check no existing link, insert external_identity, redirect with link_result
   c. login (default): get_or_create_user_from_identity → user_id
8. If surface=admin: verify user is superuser (email matches system_settings.superuser_email)
9. MFA enrollment gate, MFA login gate (same as magic link flow)
10. Create opaque session, set cookie
11. Audit log oauth.login.success
12. Redirect 302 to final_redirect with Set-Cookie
```

**OAuth config** (client_id, client_secret, tenant_id) is loaded from `system_settings` table first, falling back to env vars `ROOIAM_GOOGLE_CLIENT_ID` etc.

---

## Demo OAuth Flow

**Endpoints:** `GET /v1/oauth/demo/{provider}`, `POST /v1/oauth/demo/{provider}/continue`

Only available when `ROOIAM_ENABLE_DEMO_SEED=true`. Returns 404 otherwise.

```
Client → GET /v1/oauth/demo/google?redirect_uri=...

1. Guard: demo_seed_enabled() or 404
2. Validate provider (google | microsoft)
3. ensure_auth_method_allowed(redirect_uri, provider)
4. Inspect login context to determine workspace and app_name
5. Choose demo email:
   → app_name == "Rooiam Demo" and workspace known → demo customer email (e.g. coco@roochoco.demo)
   → otherwise → rooroo@sweetfactory.demo (default tenant)
6. Build continue URL: /v1/oauth/demo/{provider}/continue?redirect_uri=...
7. Return HTML page (styled, provider-branded) with a POST form to continue_url
   + Cancel link back to login

Client submits the form (POST /v1/oauth/demo/{provider}/continue?redirect_uri=...)

1. Same demo email selection logic
2. Look up user_id by email in DB (must exist — created by seed)
3. MFA enrollment gate, MFA login gate
4. Create opaque session, set cookie
5. Audit log demo.oauth.login.success with demo_mode: true
6. Redirect 302 to redirect_uri with Set-Cookie
```

---

## Passkey / WebAuthn Flow

**Endpoints:**
- Registration: `POST /v1/webauthn/register/start`, `POST /v1/webauthn/register/finish`
- Login: `POST /v1/webauthn/login/start`, `POST /v1/webauthn/login/finish`

### Registration (requires active session)

```
Client → POST /v1/webauthn/register/start  (RequireAuth)

1. Extract session (user must already be logged in)
2. WebauthnService::start_registration(user_id)
   → look up existing passkeys for user
   → generate WebAuthn registration options (excludeCredentials set)
   → persist challenge in webauthn_challenges table
3. Return { challenge_id, creation_options: { publicKey: ... } }

Client → POST /v1/webauthn/register/finish  (RequireAuth)
  body: { challenge_id, name?, credential }

1. Extract session
2. WebauthnService::finish_registration(user_id, challenge_id, name, credential)
   → retrieve challenge, verify response, store credential
3. Audit log auth.passkey.registered
4. Return { ok, id, name }
```

### Login (no session required)

```
Client → POST /v1/webauthn/login/start
  body: { email, redirect_uri? }

1. WebauthnService::start_authentication(email, redirect_uri)
   → look up user by email, get their passkeys
   → generate WebAuthn authentication options
   → persist challenge
2. On error: audit log auth.passkey.login.failed (stage: start)
3. Return { challenge_id, request_options: { publicKey: ... } }

Client → POST /v1/webauthn/login/finish
  body: { challenge_id, credential }

1. WebauthnService::finish_authentication(challenge_id, credential)
   → retrieve challenge, verify assertion, update sign_count
2. On error: audit log auth.passkey.login.failed (stage: finish)
3. ensure_auth_method_allowed(redirect_uri, Passkey)
4. MFA enrollment gate, MFA login gate
5. Create opaque session, set cookie
6. Audit log auth.passkey.login.success
7. Return { ok, redirect_uri } + Set-Cookie
```

Clients can also call `POST /v1/webauthn/login/report-failure` to write a client-side failure event to the audit log (tagged `source: client_reported`).

---

## TOTP MFA Flow

TOTP integrates into each login method as a gate, not a separate flow. Once TOTP is enabled for a user, every login (magic link, OAuth, passkey) pauses before session creation and returns a challenge.

### Enabling TOTP (management, requires session)

```
GET  /v1/mfa/status          → { totp_enabled, backup_codes_count }
POST /v1/mfa/totp/start      → { qr_code_url, secret, challenge_id }
POST /v1/mfa/totp/finish     → { ok, backup_codes: [...] }
DELETE /v1/mfa/totp          → disables TOTP
POST /v1/mfa/recovery-codes/regenerate → new set of backup codes
```

### MFA Login Challenge (mid-login, no session yet)

When a login flow detects `totp_enabled`, it calls `mfa_service.start_login_challenge` and returns:

```json
{
  "ok": true,
  "mfa_required": true,
  "challenge_id": "uuid",
  "method": "totp"
}
```

The client then calls:

```
POST /v1/mfa/verify
  body: { challenge_id, code }

1. Look up challenge by ID (must not be expired/used)
2. Validate TOTP code (or backup code)
3. Mark challenge used
4. Retrieve user_id and redirect_uri from challenge
5. Resolve login context, create opaque session
6. Audit log auth.mfa.verified
7. Return { ok } + Set-Cookie
```

### MFA Enrollment Challenge (workspace requires MFA, user has none)

When `workspace.require_mfa = true` and the user has no TOTP, a login enrollment challenge is created:

```json
{
  "ok": true,
  "mfa_enrollment_required": true,
  "challenge_id": "uuid"
}
```

The client calls:

```
POST /v1/mfa/enroll/start
  body: { challenge_id }
→ returns TOTP QR code + secret

POST /v1/mfa/enroll/finish
  body: { challenge_id, code }
→ verifies code, activates TOTP, issues session
```

---

## OIDC Authorization Code Flow

**Endpoints:** `GET /v1/oidc/authorize`, `POST /v1/oidc/token`, `GET /v1/oidc/userinfo`

This flow is used by downstream applications (OIDC Relying Parties) to obtain tokens.

```
Downstream app → GET /v1/oidc/authorize
  ?response_type=code&client_id=...&redirect_uri=...&scope=openid email profile
   &state=...&nonce=...&code_challenge=...&code_challenge_method=S256

1. Read rooiam_session cookie
   → missing or invalid → redirect to {frontend_url}/login?return_to={current_url}
2. Validate response_type = "code"
3. OIDCService::get_client(client_id) → must exist
4. OIDCService::validate_redirect_uri(client_id, redirect_uri) → must be registered
5. OIDCService::create_authorization_code(...)
   → 32-byte random code → SHA-256 stored; raw code returned
   → expires in 5 minutes
6. Redirect to redirect_uri?code={raw_code}&state={state}
```

```
Downstream app → POST /v1/oidc/token
  body (form): grant_type=authorization_code&code=...&redirect_uri=...
               &client_id=...&client_secret=...&code_verifier=...

1. Validate grant_type = "authorization_code"
2. OIDCService::get_client(client_id)
3. If app_type = "web" (confidential): validate client_secret (SHA-256 comparison)
4. OIDCService::exchange_code_for_tokens(code, client_id, redirect_uri, code_verifier)
   a. Hash code → look up authorization_codes
   b. Validate: client match, redirect_uri match, not used, not expired
   c. PKCE: if S256 → BASE64URL(SHA-256(verifier)) must equal stored challenge
   d. Mark code used
   e. Issue access token JWT (1 hour, signed RS256 or HS256)
   f. If scope includes "openid": issue ID token JWT (same expiry)
   g. Issue refresh token (30-day, stored as SHA-256 hash)
   h. Audit log oauth.token.issued
5. Return { access_token, token_type, expires_in, refresh_token, id_token }
```

```
Downstream app → GET /v1/oidc/userinfo
  Authorization: Bearer {access_token}

1. OIDCService::validate_access_token(token)
   → JWT signature verified, issuer checked
2. Look up user by sub claim
3. Return claims filtered by token scopes:
   → "email" scope: email, email_verified
   → "profile" scope: name, picture
   → always: sub
```

**Discovery document:** `GET /.well-known/openid-configuration` — returns issuer, endpoint URLs, supported algorithms, scopes, and claims.

**JWKS:** `GET /.well-known/jwks.json` — returns RSA public key in JWK format (empty array in HS256 mode).

---

## Session Lifecycle

| Event | Action |
|-------|--------|
| Login success (any method) | `create_opaque_session_with_context` → row inserted, 7-day TTL |
| Any authenticated request | `touch_session` updates `last_seen_user_agent`, `last_seen_ip`, `last_seen_at` |
| Logout | `POST /v1/auth/logout` → verify cookie, set `revoked_at = NOW()`, clear cookie, audit log |
| Revoke specific session | `DELETE /v1/identity/sessions/{id}` → set `revoked_at = NOW()` |
| Revoke all sessions | `POST /v1/identity/sessions/revoke-all` → set `revoked_at = NOW()` for all user sessions |
| OIDC authorize | Session verified inline (not via middleware); `sid` claim embedded in access token |
| Switch org | `POST /v1/orgs/switch` → updates `sessions.current_org_id` for the current session |
| Expiry | `get_valid_session` filters `expires_at > NOW()` — no background cleanup required at query time |

Session tokens are never returned in API response bodies (only via `Set-Cookie`). The `user_id` field is returned in the verify response for the client to use, but not the session token itself.

---

## Frontend Session Models

Server-side authentication flows (Magic Link, OAuth, Demo OAuth, Passkey) all set the `rooiam_sid` cookie on successful login. However, **downstream frontend applications have two different ways to handle the resulting session**:

### Model A: Cookie-Based Session (Widget Flows)

Used when the app embeds the hosted login widget or redirects to it. After login:

1. Server sets `rooiam_sid` cookie
2. Server redirects to `redirect_uri` (your app URL)
3. **Your app must validate the cookie** by calling `GET /v1/identity/me` with `credentials: 'include'`
4. If valid, your app creates a local session representation
5. If invalid/missing, redirect to login

```ts
// Dashboard or protected route bootstrap
useEffect(() => {
  // First: check if we have a local session from a previous OIDC flow
  const local = readLocalSession()
  if (local) {
    setSession(local)
    return
  }

  // Second: validate the server-side cookie session
  // This is required for widget-based flows where no callback occurs
  fetch('/v1/identity/me', { credentials: 'include' })
    .then(res => {
      if (!res.ok) throw new Error('Invalid session')
      return res.json()
    })
    .then(user => {
      // Cookie is valid — create local representation
      setSession({ user, source: 'cookie' })
    })
    .catch(() => {
      // Cookie missing/invalid — redirect to login
      navigate('/')
    })
}, [])
```

**Widget Flows in the demo:**
- Flow #1 (Embedded): Widget embedded in iframe, login inside iframe, widget does `window.top.location = redirect_uri`
- Flow #2 (Hosted Redirect): Full-page redirect to `/login-widget`, server redirects to `redirect_uri` with cookie set

### Model B: OIDC-Based Session (OIDC Flows)

Used when your app initiates a full OIDC Authorization Code + PKCE flow. After login:

1. App builds PKCE request, stores in localStorage
2. App redirects to `/authorize` (or `/oauth/demo/google` for demo)
3. Server redirects to your callback page with `?code=...`
4. **Callback page exchanges code for tokens** via `POST /v1/oidc/token`
5. Callback stores the tokens/session locally (e.g., sessionStorage)
6. Callback redirects to your app's dashboard
7. Dashboard reads from local storage

```ts
// Callback page
const code = params.get('code')
const state = params.get('state')

const token = await fetch('/v1/oidc/token', {
  method: 'POST',
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: myRedirectUri,
    client_id: myClientId,
    code_verifier: storedCodeVerifier,
  }),
}).then(r => r.json())

// Store session locally
sessionStorage.setItem('myapp_session', JSON.stringify({
  accessToken: token.access_token,
  expiresAt: Date.now() + token.expires_in * 1000,
}))

navigate('/dashboard')
```

```ts
// Dashboard bootstrap
useEffect(() => {
  const local = readLocalSession()
  if (!local) {
    navigate('/')
    return
  }
  // Use local session...
}, [])
```

**OIDC Flows in the demo:**
- Flow #3 (PKCE + Callback): Full OIDC code flow with PKCE, requires callback page for token exchange
- Flow #4 (Demo OAuth): Uses `/oauth/demo/google` which sets cookie directly but follows OIDC URL pattern

### When to Use Which Model

| Model | Use When |
|-------|----------|
| Cookie-Based (Model A) | Simple session auth, SaaS apps, embedded widgets, no API tokens needed |
| OIDC-Based (Model B) | Need API access tokens, mobile apps, third-party integrations, offline access |

### Common Mistake: Mixing Models Without Understanding

The bug that commonly appears:

```
Widget login → success → redirect to /app
/app → checks sessionStorage → empty → redirect to /
/ → shows login widget → user logs in again → loop
```

**Root cause:** App was expecting sessionStorage session (OIDC Model B) but widget flow provides cookie session (Model A) without a callback.

**Fix:** Always implement the cookie validation fallback in your app's protected routes, as shown in Model A above.

See [Downstream Hosted Widget Callback Flow](../reference/11_downstream_hosted_widget_callback_flow.md) for the complete integration guide with 4 demo flows.
