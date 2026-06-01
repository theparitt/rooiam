# Known Issues

This file tracks confirmed bugs and design limitations found in the Rooiam server codebase. Each entry includes location, severity, and status.

---

## Issue 1 — Raw Invite Token Logged to stdout/tracing

**Status:** ✅ Fixed (2026-03-12)
**Severity:** High
**File:** `rooiam-server/src/modules/organization/service.rs`

### Description

The raw (unhashed) invite token was written to `tracing::info!` after invite creation. Anyone with log access could replay the token and join the workspace as a different user.

### Fix Applied

Replaced with a log line that only shows the email, org ID, and first 8 characters of the token hash — enough to correlate in logs without exposing a usable credential:

```rust
tracing::info!("Invite created for {} in org {} (token_hash_prefix={})", email, organization_id, &token_hash[..8]);
```

---

## Issue 2 — OIDC Client Secret Comparison Not Constant-Time

**Status:** ✅ Fixed (2026-03-12)
**Severity:** High (timing side-channel)
**File:** `rooiam-server/src/modules/oidc/service.rs` — `validate_client_secret`

### Description

The token endpoint compared client secrets using Rust's default `==` operator on strings. This exits on the first mismatched byte and allows an attacker to measure response time differences to progressively guess valid client secrets.

### Fix Applied

Replaced with `subtle::ConstantTimeEq` (already in `Cargo.toml`):

```rust
use subtle::ConstantTimeEq;
if computed_hash.as_bytes().ct_eq(hash.as_bytes()).unwrap_u8() == 1 {
    Ok(())
} else {
    Err(AppError::Validation("Invalid client_secret".into()))
}
```

---

## Issue 3 — Invite Accept Not Bound to Invited Email

**Status:** ✅ Fixed (2026-03-12)
**Severity:** High (privilege escalation)
**File:** `rooiam-server/src/modules/organization/service.rs` — `accept_invite`

### Description

Any authenticated user could call `POST /orgs/invites/accept` with a valid token and join the organization, even if the invite was sent to a different email address. The `organization_invites` table stores the target email, but it was never compared to the authenticated user's email.

### Fix Applied

`accept_invite` now fetches the user's primary email via `IdentityRepository` and rejects the request if it does not match `invite.email` (case-insensitive):

```rust
let user = identity_repo.get_user_by_id(user_id).await?;
let user_email = user.email.ok_or_else(|| AppError::Validation("Your account has no verified email address".into()))?;
if !user_email.eq_ignore_ascii_case(&invite.email) {
    return Err(AppError::Forbidden("This invitation was sent to a different email address".into()));
}
```

---

## Issue 4 — OAuth State Token Not Bound to Initiating Browser

**Status:** ✅ Fixed (2026-03-12)
**Severity:** High (CSRF / state token theft)
**File:** `rooiam-server/src/modules/oauth/handlers.rs`

### Description

The OAuth state token stored in Redis had no binding to the browser that initiated the flow (no IP, no user-agent). An attacker who obtained the state token (e.g. via Referer header leak) could complete the OAuth callback from a different browser and hijack the session.

### Fix Applied

`OAuthStatePayload` now stores `initiated_ip` and `initiated_ua`. On callback, if the request IP differs from the stored IP the request is rejected and an audit event is logged. UA mismatch is logged as a warning only (non-fatal, because mobile browsers can change UA across redirects):

```rust
if let (Some(stored_ip), Some(callback_ip)) = (&state_payload.initiated_ip, &ip) {
    if stored_ip != callback_ip {
        // audit log + return Err
    }
}
```

---

## Issue 5 — OIDC Client Secret Hashed with SHA-256, Not Argon2id

**Status:** ✅ Fixed (2026-03-12)
**Severity:** Medium
**Files:** `rooiam-server/src/modules/clients/handlers.rs`, `rooiam-server/src/modules/oidc/service.rs`

### Why SHA-256 Was Wrong

SHA-256 is designed to be fast — billions of hashes per second on a GPU. That is the right property for checksums and data integrity, but completely wrong for storing secrets that could be brute-forced after a database breach.

If an attacker leaked the `oauth_clients` table while it still held SHA-256 hashes, they could crack even moderately strong 64-character random secrets orders of magnitude faster than with a password-hashing algorithm. An OAuth `client_secret` grants the ability to exchange authorization codes for ID tokens on behalf of any user who has authorized that client, so leaking one is a serious privilege escalation.

Argon2id (already used everywhere else in the codebase for passwords and API keys) is memory-hard and deliberately slow (~100 ms, configurable). That turns a GPU brute-force attack from hours into years. The cost is acceptable for machine-to-machine token exchange, which happens once per authorization flow, not on every request.

### Fix Applied

**At creation** (`clients/handlers.rs`): SHA-256 replaced with Argon2id using a random salt per secret.

```rust
let salt = SaltString::generate(&mut OsRng);
let hash = Argon2::default()
    .hash_password(secret.as_bytes(), &salt)?
    .to_string();  // PHC string format: "$argon2id$v=19$m=..."
```

**At validation** (`oidc/service.rs`): direct string comparison replaced with `Argon2::verify_password`. Argon2 performs constant-time comparison internally, so the earlier `subtle::ConstantTimeEq` workaround is also replaced.

```rust
let parsed = PasswordHash::new(hash)?;
Argon2::default().verify_password(secret.as_bytes(), &parsed)?;
```

**Note:** Existing OAuth clients whose secrets were hashed with SHA-256 will fail validation and must regenerate their secret. This is intentional — there is no safe migration path for SHA-256 hashes.

---

## Issue 6 — OIDC Refresh Token Grant Not Implemented

**Status:** ✅ Fixed (2026-03-12)
**Severity:** Low (feature gap)
**File:** `rooiam-server/src/modules/oidc/service.rs` — `exchange_refresh_token`

### Fix Applied

Implemented `grant_type=refresh_token` in the token endpoint. Key behaviours:

- **Token rotation**: each refresh issues a new refresh token and immediately revokes the old one. The new token carries the same `family_id` and `rotated_from_id` lineage.
- **Reuse detection**: if a token that was already revoked is presented again, the entire token family (all tokens from that authorization grant) is revoked immediately. This contains damage from a stolen refresh token.
- **Client binding**: refresh token is rejected if presented by a different `client_id` than the one it was issued to.
- **Expiry**: refresh tokens expire after 30 days.
- **ID token**: not re-issued on refresh (correct per OIDC spec — ID tokens are issued only at authorization time).
- **Audit log**: `oauth.token.refreshed` event recorded on every successful rotation.

---

## Issue 7 — OIDC ID Token Missing Profile Claims

**Status:** ✅ Fixed (2026-03-12)
**Severity:** Low
**File:** `rooiam-server/src/modules/oidc/service.rs` — `exchange_code_for_tokens`

### Fix Applied

The ID token now includes profile claims based on the scopes that were requested at authorization time:

| Scope requested | Claims added to ID token |
|-----------------|--------------------------|
| `email` | `email`, `email_verified` |
| `profile` | `name`, `picture` |
| neither | only `iss sub aud exp iat nonce` |

Claims are omitted (not serialized as `null`) when their scope was not requested. The lookup reuses the same query pattern as the userinfo endpoint.

---

## Issue 8 — Demo Branding Overwritten on Every Restart

**Status:** Informational / By design
**Severity:** Informational
**File:** `rooiam-server/src/shared/demo_seed.rs` — `ensure_company`

### Description

`ensure_company` issues an `UPDATE organizations SET ...` on every server restart, reverting any branding changes made to demo workspaces via the tenant portal.

### Workaround

Disable demo mode after the initial seed (`ROOIAM_ENABLE_DEMO_SEED=false`) or use a non-demo workspace.

---

---

## Issue 9 — Admin Logout Shows Another User Before Redirecting to Login

**Status:** ✅ Fixed (2026-03-23)
**Severity:** Medium (confusing UX, not a security hole)
**File:** `rooiam-admin/src/components/layout/DashboardLayout.tsx`

### What Happened

Clicking **Logout** in the admin panel (port 5171) would briefly flash another platform operator's name and role before finally landing on the login page. The user had to log out twice to get a clean session.

### Root Cause

Three compounding problems:

**1. SPA navigation kept the app alive.**
The original logout used React Router's `navigate('/login', { replace: true })`. This is a client-side route change — it does not reload the page or unmount the React tree. The `DashboardLayout` component stayed mounted with its 45-second `checkSession` interval still running.

**2. The interval fired immediately after logout.**
`checkSession` calls `GET /v1/identity/me`. The server uses opaque session cookies. When multiple platform operators are logged in (e.g. in different tabs or from a previous login), the browser still holds the *next* operator's cookie after the first one is cleared. The interval fired before the page navigated away, got a successful `200 me` response for the second operator, and called `setUser(me)` — rehydrating the store with a different user's data.

**3. `apiFetch` has a 401 handler that also navigates.**
`apiFetch` (in `api-base.ts`) calls `window.location.href = '/login'` on any 401. During the post-logout race, if the interval's `me` call returned 401 instead of 200, this handler fired *before* the `finally` block completed — creating a second, competing navigation. The result was unpredictable depending on network timing.

### Fix Applied

**`handleLogout` now works in this order:**

```typescript
const handleLogout = async () => {
    setLoggingOut(true)   // 1. immediately hide all UI — show spinner
    logout()              // 2. wipe Zustand store synchronously
    try {
        await authApi.logout()  // 3. call DELETE /v1/auth/session
    } catch {
        // ignore — we are leaving regardless
    } finally {
        window.location.replace(adminRoutes.login())  // 4. hard reload
    }
}
```

**`loggingOut` state triggers an early return** that renders a blank spinner screen instead of the dashboard, so even if the `checkSession` interval fires in the 100–300 ms gap between step 1 and step 4, there is nothing visible to flash:

```tsx
if (loggingOut) {
    return (
        <div className="h-screen flex items-center justify-center bg-white">
            <div className="w-8 h-8 rounded-full border-4 border-rose-200 border-t-rose-500 animate-spin" />
            <p>Signing out…</p>
        </div>
    )
}
```

**`window.location.replace()` (not `navigate()`)** forces a full page reload. This tears down the entire React tree, kills the interval, and reinitializes the app from scratch — so there is no mounted component left to race against cookie state.

### Why This Was Not a Security Issue

The second operator's session data shown was already accessible in that browser (their own session cookie). No cross-user data was leaked — it was the same machine's own session history. The bug was purely a confusing UX problem.

---

## Issue 10 — Demo OAuth (Google/Microsoft) Broken in Embedded Widget

**Status:** ✅ Fixed (2026-03-23)
**Severity:** High (demo unusable)
**Files:** `rooiam-server/src/http/middleware/security_headers.rs`, `rooiam-app/src/pages/MagicLink.tsx`, `rooiam-demo/src/App.tsx`

### What Happened

Clicking "Continue with Google" or "Continue with Microsoft" in the demo login widget (embedded as an iframe on port 5174) either showed a CSP console error and did nothing, or caused the request to fail with "connection refused."

### Root Cause

Three separate problems compounded together:

**1. `form-action 'self'` in the HTML Content Security Policy.**
The demo OAuth flow uses a server-rendered HTML `<form>` that POSTs to `/v1/oauth/demo/google`. The CSP header on that HTML response included `form-action 'self'`, which browsers enforce on the form submission — not just on the page load. Even though the target is same-origin, some browsers apply a stricter interpretation in iframe contexts and blocked the submission silently.

**2. `X-Frame-Options: DENY` applied to all responses.**
The CSP middleware applied `X-Frame-Options: DENY` unconditionally to every response, including the HTML login pages. When the demo widget tried to load the fake Google/Microsoft OAuth page inside the iframe, the browser rejected it with a frame-ancestors violation.

**3. Cross-origin iframe cannot use `window.top.location.href`.**
Port 5172 (rooiam-app) is embedded inside port 5174 (rooiam-demo). Different ports = different origins. Chrome and Firefox block cross-origin iframes from accessing `window.top.location.href`, throwing a `SecurityError`. The original OAuth button handler tried to navigate the top window from inside the iframe, which silently failed.

### Fix Applied

**`security_headers.rs`:**
- Moved `is_html` check to the top of the handler (used in two places — must be computed once, at the top)
- Removed `form-action 'self'` from the HTML CSP entirely
- Made `X-Frame-Options: DENY` conditional — only applied to non-HTML (API/JSON) responses; HTML pages use `frame-ancestors 'none'` in CSP instead, which is the modern equivalent and does not conflict with iframe embedding of specific paths

**`MagicLink.tsx`:**
- Changed the OAuth button handler to use `postMessage` when running inside an iframe (`isEmbedded === true`):
```typescript
if (isEmbedded) {
    window.parent.postMessage({ type: 'rooiam:navigate', url: endpoint }, '*')
} else {
    window.location.href = endpoint
}
```

**`rooiam-demo/src/App.tsx`:**
- Added a `message` event listener that handles `rooiam:navigate` from the embedded widget and navigates the top-level window:
```typescript
window.addEventListener('message', (e) => {
    if (e.data?.type === 'rooiam:navigate' && typeof e.data.url === 'string') {
        window.location.href = e.data.url
    }
})
```

### Why `postMessage` Is the Correct Pattern

Cross-origin iframes cannot directly manipulate the parent's `location`. `postMessage` is the browser-standard mechanism for safe cross-origin communication between a frame and its parent. The parent decides whether to act on the message — the iframe cannot force navigation.

---

Notes:

- Demo branding reset on restart remains an intentional demo-mode limitation.
- Historical fixed issues are kept above for security/change history.
