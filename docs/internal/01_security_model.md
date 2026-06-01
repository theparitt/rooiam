# Security Model

This document describes the cryptographic design, session security, auth policy enforcement, and demo mode security boundaries for the Rooiam server.

---

## Token Hashing

All sensitive short-lived tokens and session secrets are stored **only as SHA-256 hex digests** in the database. The raw value is never persisted — it is transmitted once (in an email link, a cookie, or an HTTP response) and immediately discarded server-side.

### Magic Link Tokens

| Step | What happens |
|------|-------------|
| Generation | 32 bytes from `OsRng` → base64url-encoded → `raw_token` |
| Storage | `SHA-256(raw_token)` → stored in `magic_links.token_hash` as hex |
| Email | `raw_token` is embedded in the verify URL sent via SMTP |
| Verification | Incoming `raw_token` is hashed with SHA-256, compared to the stored hash |
| Replay protection | Row is marked `used_at = NOW()` immediately on successful verify |
| Expiry | 15 minutes (`expiry` column checked before marking used) |

Source: `modules/auth/service.rs` — `start_magic_link` / `verify_magic_link`.

### Invite Tokens

Same SHA-256 hashing scheme as magic links.

| Step | What happens |
|------|-------------|
| Generation | 32 bytes from `OsRng` → base64url → `raw_token` |
| Storage | `SHA-256(raw_token)` → stored in `organization_invites.token_hash` |
| Verification | `accept_invite` re-hashes the incoming token and compares |
| Expiry | 48-hour window (`expires_at` column) |

Source: `modules/organization/service.rs` — `send_invite` / `accept_invite`.

**Known issue:** See `docs/internal/05_known_issues.md` — the raw invite token is currently also written to `tracing::info!` logs.

### Opaque Session Tokens

| Step | What happens |
|------|-------------|
| Generation | 32 bytes from `OsRng` → base64url → `raw_secret` |
| Cookie format | `"{session_uuid}.{raw_secret}"` stored as an HttpOnly cookie |
| Storage | `SHA-256(raw_secret)` → stored in `sessions.session_secret_hash` |
| Verification | Cookie is split on `.`, the raw secret part is hashed and compared using `subtle::ConstantTimeEq` |
| Timing-attack resistance | Constant-time comparison prevents secret extraction via response-time measurement |

Source: `modules/session/service.rs` — `create_opaque_session_with_context` / `verify_opaque_session`.

### OIDC Authorization Codes

| Step | What happens |
|------|-------------|
| Generation | 32 bytes from `OsRng` → base64url → `raw_code` |
| Storage | `SHA-256(raw_code)` → stored in `oauth_authorization_codes.code_hash` |
| Expiry | 5 minutes |
| Replay protection | `used_at` set on first use; second use returns an error |
| PKCE | S256: `BASE64URL(SHA-256(code_verifier))` compared to stored `code_challenge`; plain: direct string comparison |

Source: `modules/oidc/service.rs` — `create_authorization_code` / `exchange_code_for_tokens`.

### OIDC Refresh Tokens

Same SHA-256 hashing scheme, stored in `oauth_refresh_tokens.token_hash`. Expire after 30 days. Each token is assigned a `family_id` for rotation tracking.

### OIDC Client Secrets

Client secrets are SHA-256 hashed (same pattern) and compared in `validate_client_secret`. This is weaker than Argon2id; suitable for machine-to-machine secrets but consider upgrading for production deployments storing many clients.

---

## OIDC Signing Algorithm

OIDC tokens (access tokens and ID tokens) are signed using one of two modes, determined at startup:

| Mode | Condition | Algorithm |
|------|-----------|-----------|
| RS256 (production) | `ROOIAM_OIDC_PRIVATE_KEY_PEM` and `ROOIAM_OIDC_PUBLIC_KEY_PEM` are both set and non-empty | RS256 with the configured key pair; `kid` from `ROOIAM_OIDC_KEY_ID` |
| HS256 (development fallback) | RSA keys not configured | HS256 with `ROOIAM_OIDC_SIGNING_SECRET`; a warning is emitted if the secret begins with the default prefix `dev-oidc-signing-secret-` |

In HS256 mode, `GET /.well-known/jwks.json` returns an empty `keys` array because symmetric keys cannot be published.

Source: `modules/oidc/service.rs` — `oidc_signing_material`.

---

## OIDC Authorize: Direct Session Cookie Verification

The `GET /v1/oidc/authorize` endpoint intentionally does **not** use the `RequireAuth` middleware. Because unauthenticated users must receive a redirect to `/login` rather than a 401, the handler replicates session verification inline:

1. Read the `rooiam_session` HttpOnly cookie.
2. Call `SessionService::verify_opaque_session` directly.
3. On failure or missing cookie: redirect to `{frontend_url}/login?return_to={current_url}`.
4. On success: proceed to validate the OIDC client and issue an authorization code.

This design means the OIDC scope is not wrapped by `RequireAuth`; the security guarantee is equivalent but the failure mode is a redirect instead of a 401.

---

## Auth Policy Enforcement

Every login method (magic link, Google, Microsoft, passkey) is checked against the workspace's auth policy before a session is issued.

**Entry point:** `shared/auth_policy.rs` — `ensure_auth_method_allowed`.

**Logic:**

```
redirect_uri → parse workspace slug → load organization row
if organization found:
    check org.allow_{method}
    if false → return Err(AppError::Validation("... disabled for workspace '{slug}'"))
return Ok(Some(org))   // org returned for MFA policy check
```

**Workspace slug extraction:** The workspace slug is parsed from the `redirect_uri` query parameter. The exact parsing is in `shared/auth_context.rs` — `parse_workspace_slug_from_redirect`.

**Where it's called:**

| Location | Method checked |
|----------|---------------|
| `auth/service.rs` start_magic_link | MagicLink |
| `auth/handlers.rs` verify_magic_link | MagicLink |
| `oauth/handlers.rs` start_oauth_flow | Google / Microsoft |
| `oauth/handlers.rs` callback (re-check) | Google / Microsoft |
| `webauthn/handlers.rs` finish_login | Passkey |
| `oauth/handlers.rs` complete_demo_oauth_login | Google / Microsoft |

If no workspace slug is found in the redirect URI (root login), all methods are allowed by default.

---

## MFA Policy Enforcement

After the primary credential is verified and the workspace policy is loaded, all login handlers check:

```
workspace_requires_mfa = org.require_mfa  (false if no workspace)
(totp_enabled, _) = mfa_service.totp_status(user_id)

if workspace_requires_mfa && !totp_enabled:
    → start MFA enrollment challenge
    → return { mfa_enrollment_required: true, challenge_id }

if totp_enabled:
    → start MFA login challenge
    → return { mfa_required: true, challenge_id }
```

This pattern is applied identically in:
- `auth/handlers.rs` (magic link)
- `oauth/handlers.rs` (Google/Microsoft/demo OAuth)
- `webauthn/handlers.rs` (passkey)

---

## RequireAuth Middleware

`http/middleware/auth.rs` implements the Actix-web `Transform` pattern:

1. Read the `rooiam_session` cookie.
2. Verify via `SessionService::verify_opaque_session`.
3. On success: inject `ActiveSession` into request extensions + call `session_repo.touch_session` (updates last-seen UA and IP).
4. On failure: return 401 immediately.

Handlers retrieve the session with `extract_session(&req)`.

**Scopes wrapped by RequireAuth:**

- `/v1/identity/*` (profile, sessions, linked accounts)
- `/v1/orgs/*` (all organization management)
- `/v1/webauthn/register/*`, `/v1/webauthn/passkeys`
- `/v1/mfa/status`, `/v1/mfa/totp/*`, `/v1/mfa/recovery-codes/*`
- `/v1/admin/*`
- `/v1/clients/*`

**Not wrapped by RequireAuth** (intentional):
- `/v1/oidc/*` (authorize redirects to login; token and userinfo use Bearer tokens)
- `/v1/auth/*` (magic link flows are pre-authentication)
- `/v1/oauth/*` (redirect-based; OAuth callback validates state from Redis)
- `/v1/setup/*` (public status and bootstrap; privileged endpoints check `ensure_superuser_user` internally)
- `/v1/webauthn/login/*` (pre-authentication by definition)
- `/v1/mfa/verify`, `/v1/mfa/enroll/*` (called with a `challenge_id` before a session exists)

---

## Session Lifecycle

Sessions are stored in a `sessions` table. Key fields:

| Field | Description |
|-------|-------------|
| `id` | UUID, primary key |
| `user_id` | FK to `users` |
| `session_secret_hash` | SHA-256 hex of the raw secret |
| `expires_at` | 7 days from creation |
| `revoked_at` | NULL if active; set to NOW() on logout/revoke |
| `current_org_id` | Active workspace context (nullable) |
| `login_app_name` | App name captured at login |
| `login_workspace_slug` | Workspace slug captured at login |
| `last_seen_user_agent` | Updated by `touch_session` on each request |
| `last_seen_ip` | Updated by `touch_session` on each request |

`get_valid_session` filters on `revoked_at IS NULL AND expires_at > NOW()`.

---

## Demo Mode Security Boundaries

Demo mode is activated by `ROOIAM_ENABLE_DEMO_SEED=true`. Its security properties:

| Property | Behaviour |
|----------|-----------|
| Real email | Not sent. A demo SMTP (Mailhog) is used if present; magic links may not be deliverable |
| Real OAuth tokens | Not issued. Demo OAuth pages at `/v1/oauth/demo/{provider}` simulate the consent screen without contacting Google or Microsoft |
| Auth policy | Demo OAuth flows still enforce `ensure_auth_method_allowed` — workspace policies apply in demo mode |
| MFA | MFA enrollment and login challenges are enforced in demo mode (e.g., `mintmallow` has `require_mfa: true`) |
| Audit events | All demo login events are tagged with `demo_mode: true` in the metadata JSON |
| Superuser bootstrap | `seed_demo_data` inserts `admin@rooiam.demo` as the `superuser_email` system setting if it is not already set |
| Session issuance | Real opaque session cookies are created for demo users — they are full sessions in the database |

Demo mode does **not** disable any security mechanism except substituting the OAuth provider redirect with a local HTML page. All session hashing, constant-time comparison, and audit logging remain active.
