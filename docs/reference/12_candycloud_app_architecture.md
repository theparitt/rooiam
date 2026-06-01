# Candycloud App Architecture

Candycloud is the canonical example of a downstream app built on Rooiam. It demonstrates the correct way to integrate the login widget, handle OIDC callbacks, and manage app sessions independently from the IAM session.

---

## The Three Services

```
candycloud.rooiam.com       = Candycloud frontend   (end-user SPA, Cloudflare Pages)
candycloud-api.rooiam.com   = Candycloud backend    (app session + API proxy, Node.js)
demo-api.rooiam.com         = Rooiam IAM server     (identity, login widget, OIDC)
```

These three services have distinct, non-overlapping responsibilities.

---

## Widget vs OIDC — The Most Important Distinction

People often confuse the login widget with the OIDC protocol. They are two different things.

### Login Widget

The widget is a **UI surface** hosted by Rooiam at `/login-widget`.

It handles:
- Showing the branded login form (logo, colors, buttons)
- Accepting user input (email, passkey, social login buttons)
- Running the authentication interaction (magic link, TOTP challenge, MFA)
- Establishing a Rooiam IAM session (`rooiam_sid`) once the user authenticates

The widget does **not** issue tokens. It does **not** complete the OIDC flow. It is the door, not the destination.

```
Widget = UI layer / user interaction
```

### OIDC Protocol

OIDC is the **identity protocol** running behind the widget. It handles:
- Validating the client app (`client_id`, `redirect_uri`, PKCE)
- Checking the IAM session after the user authenticates
- Issuing an authorization code
- Exchanging the code for tokens (`access_token`, `id_token`, `refresh_token`)
- Providing identity claims via `/userinfo`

```
OIDC = identity protocol / machine-to-machine contract
```

### How They Connect

```
Widget (user authenticates)
    ↓
  rooiam_sid is set on demo-api.rooiam.com
    ↓
Widget navigates browser to /v1/oidc/authorize
    ↓
OIDC reads rooiam_sid, issues authorization code
    ↓
Browser redirects to /callback?code=...
    ↓
Candycloud backend exchanges code for tokens
```

The widget starts the journey. OIDC completes the identity handoff.

---

## Role of Each Service

### `demo-api.rooiam.com` — Rooiam IAM

Owns **identity**. Answers the question: *"who is this user?"*

Responsibilities:
- Serves `/login-widget` (HTML + JS, the login UI)
- Manages `rooiam_sid` session cookie (HttpOnly, set on `demo-api.rooiam.com`)
- Handles all authentication methods: magic link, passkeys, TOTP, Google, Microsoft
- Runs OIDC: `/v1/oidc/authorize`, `/v1/oidc/token`, `/v1/oidc/userinfo`
- Provides SSO — if a user is already logged in to Rooiam, other apps can authorize them without a new login prompt

### `candycloud-api.rooiam.com` — Candycloud Backend

Owns the **app session**. Answers the question: *"is this user logged in to Candycloud?"*

Responsibilities:
- Receives the OIDC code from the frontend callback
- Exchanges the code with Rooiam server-to-server (no browser involved)
- Fetches userinfo from Rooiam using the access token
- Stores `{ accessToken, refreshToken, userinfo, workspace }` in Redis
- Sets the `candycloud_session` cookie (first-party on `candycloud-api.rooiam.com`)
- Validates `candycloud_session` on every subsequent request
- Proxies Rooiam API calls using the stored access token (frontend never holds the token)

### `candycloud.rooiam.com` — Candycloud Frontend

Owns the **UI**. Responsible for rendering and user interaction.

Responsibilities:
- Checks `GET /v1/auth/session` on `candycloud-api` at boot — shows login or dashboard
- Embeds the Rooiam login widget in an `<iframe>`
- Listens for `rooiam:navigate` postMessage from the widget, then navigates the top window
- Handles the `/callback` route (receives the OIDC code, forwards to `candycloud-api`)
- Calls `candycloud-api` for all data using `candycloud_session` cookie
- Never calls `demo-api.rooiam.com` directly after login

---

## Candycloud Backend — What It Handles

Every request the frontend makes goes to `candycloud-api`. Here is what each endpoint does and whether it needs a session.

### Auth Routes (`src/routes/auth.js`)

These are the three session management endpoints. They do **not** proxy to Rooiam — they own the app session directly.

| Endpoint | Session required | What it does |
|----------|-----------------|--------------|
| `POST /v1/auth/exchange` | No | Receives `{ code, redirect_uri, client_id, code_verifier, workspace, ... }` from the frontend after OIDC callback. Calls Rooiam `/oidc/token` server-to-server, fetches `/oidc/userinfo`, stores `{ accessToken, refreshToken, userinfo, workspace }` in Redis, sets `candycloud_session` cookie. |
| `GET  /v1/auth/session`  | No (checks cookie, returns 401 if missing) | Reads `candycloud_session` cookie → looks up Redis → returns `{ ok, userinfo, workspace, app_id, app_name }` or 401. Used by the frontend on every boot to decide: show login or dashboard. |
| `POST /v1/auth/logout`   | Yes | Deletes session from Redis, clears `candycloud_session` cookie, returns `{ ok: true }`. |

### Proxy Routes (`src/routes/proxy.js`)

These forward requests to Rooiam using the access token stored in Redis. The frontend never holds the token.

#### Public endpoints — no session required

Called **before login** to render the login page. These are explicitly registered before the catch-all so they bypass `requireSession`.

| Endpoint | What it does |
|----------|--------------|
| `GET /v1/demo/app-catalog` | Lists available workspaces and apps. Used to build the workspace switcher and find the matching `workspace_id` and `app_id`. |
| `GET /v1/demo/app-config`  | Returns OIDC config for a specific workspace+app: `redirect_uri`, `client_id`, `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `scopes`, and `demo_email`. |
| `GET /v1/orgs/public/branding` | Returns workspace logo URL and brand color. Used to style the login page before the widget loads. |
| `GET /v1/setup/auth-methods` | Returns which login methods are enabled for the workspace: magic link, passkey, Google, Microsoft, MFA required. Used to populate the right-hand panel (WORKSPACE / METHODS). |

#### Protected endpoints — session required

Called **after login** from the dashboard. The catch-all proxy handles all of these — it loads the `candycloud_session` cookie, reads the access token from Redis, and forwards to Rooiam with `Authorization: Bearer <token>`.

| Endpoint | What it does |
|----------|--------------|
| `GET /v1/me` | Alias for `/identity/me`. |
| `GET /v1/identity/me` | User profile. Also polled every 30s to detect session revocation. |
| `PATCH /v1/identity/me/profile` | Update display name / avatar. |
| `GET /v1/identity/me/linked-accounts` | OAuth providers and passkey count linked to the account. |
| `POST /v1/identity/me/email-change/request` | Request an email address change. |
| `GET /v1/identity/me/sessions` | List active sessions. |
| `DELETE /v1/identity/me/sessions/:id` | Revoke a specific session. |
| `POST /v1/identity/me/sessions/revoke-all` | Revoke all other sessions. |
| `GET /v1/identity/me/audit-logs` | User activity log. |
| `GET /v1/orgs/current/portal` | Workspace portal config for the logged-in user's org. |
| `GET /v1/webauthn/passkeys` | List registered passkeys. |
| `POST /v1/webauthn/register/start` | Begin passkey registration. |
| `POST /v1/webauthn/register/finish` | Complete passkey registration. |
| `DELETE /v1/webauthn/passkeys/:id` | Remove a passkey. |
| `GET /v1/mfa/status` | Whether TOTP is enabled and backup codes remaining. |
| `POST /v1/mfa/totp/start` | Begin TOTP enrollment. |
| `POST /v1/mfa/totp/finish` | Confirm TOTP enrollment. |
| `DELETE /v1/mfa/totp` | Disable TOTP. |
| `POST /v1/mfa/recovery-codes/regenerate` | Regenerate backup codes. |

### Rule: public vs protected

```
Public    (no session) = called BEFORE login to render the login page and widget
Protected (session)    = called AFTER login from the dashboard
```

Four endpoints are public: `app-catalog`, `app-config`, `orgs/public/branding`, `setup/auth-methods`. Everything else requires `candycloud_session`.

### How the proxy works

```
Frontend → GET /v1/identity/me
                │
                ▼
         candycloud-server
           1. Read candycloud_session cookie
           2. Load session from Redis → { accessToken, ... }
           3. GET demo-api.rooiam.com/v1/identity/me
              Authorization: Bearer <accessToken>
           4. Return response to frontend
```

The frontend sends only a cookie. Candycloud-backend translates it into a Bearer token call to Rooiam. The access token never touches the browser.

---

## Full Login Flow — Step by Step

### Phase A: App Boot

```
Browser → GET https://candycloud.rooiam.com
Frontend loads → calls GET https://candycloud-api.rooiam.com/v1/auth/session
  candycloud-api reads candycloud_session cookie → not found or expired
  → 401 Unauthorized

Frontend shows login page
```

### Phase B: Fetch App Config, Branding, and Auth Methods

The frontend needs to know the OAuth config, workspace branding, and enabled login methods before it can render the login page. All four calls go to **candycloud-server** (public — no session required). Candycloud-server proxies them to Rooiam without a token.

```
Browser → GET https://candycloud-api.rooiam.com/v1/demo/app-catalog
candycloud-api → GET https://demo-api.rooiam.com/v1/demo/app-catalog  (no token)
Response: [
  { workspace_id: "uuid-1", workspace_slug: "roochoco", app_id: "demo-abc", ... },
  { workspace_id: "uuid-2", workspace_slug: "mintmallow", app_id: "demo-xyz", ... }
]

Browser → GET https://candycloud-api.rooiam.com/v1/demo/app-config
          ?workspace_id=uuid-1&app_id=demo-abc&origin=https://candycloud.rooiam.com
candycloud-api → GET https://demo-api.rooiam.com/v1/demo/app-config?...  (no token)
Response: {
  workspace_id: "uuid-1",
  workspace_slug: "roochoco",
  app_id: "demo-abc",
  redirect_uri: "https://candycloud.rooiam.com/callback",
  authorization_endpoint: "https://demo-api.rooiam.com/v1/oidc/authorize",
  token_endpoint: "https://demo-api.rooiam.com/v1/oidc/token",
  userinfo_endpoint: "https://demo-api.rooiam.com/v1/oidc/userinfo",
  scopes: ["openid", "profile", "email"],
  demo_email: "minmin@lovechocolate.user"
}

Browser → GET https://candycloud-api.rooiam.com/v1/orgs/public/branding
          ?workspace_id=uuid-1
candycloud-api → GET https://demo-api.rooiam.com/v1/orgs/public/branding?...  (no token)
Response: { name: "RooChoco", login_display_name: "Welcome to RooChoco", brand_color: "#c96b8a", logo_url: "..." }

Browser → GET https://candycloud-api.rooiam.com/v1/setup/auth-methods
          ?workspace_id=uuid-1
candycloud-api → GET https://demo-api.rooiam.com/v1/setup/auth-methods?...  (no token)
Response: { magic_link_enabled: true, passkey_enabled: true, google_enabled: true, mfa_required: false, demo_mode: true, ... }
```

With these four responses the frontend has everything it needs: which iframe URL to load, how to style the page, which login methods to show in the right-hand panel, and the demo email to prefill.

### Phase C: Build PKCE Auth Request

The frontend creates a PKCE request and stores it in `localStorage` (survives page navigation).

```
code_verifier  = random 48-byte base64url string
code_challenge = SHA-256(code_verifier) as base64url
state          = random 24-byte base64url string

Stored in localStorage:
{
  appId: "demo-abc",
  redirectUri: "https://candycloud.rooiam.com/callback",
  authorizationEndpoint: "https://demo-api.rooiam.com/v1/oidc/authorize",
  tokenEndpoint: "https://demo-api.rooiam.com/v1/oidc/token",
  state: "...",
  codeVerifier: "...",
  codeChallenge: "...",
  workspace: "roochoco",
  workspaceId: "uuid-1"
}
```

### Phase D: Render Login Widget

Frontend renders an iframe pointing to the Rooiam server.

```html
<iframe src="https://demo-api.rooiam.com/login-widget
              ?workspace_id=uuid-1
              &client_id=demo-abc
              &app=RooChoco%20Portal">
</iframe>
```

Rooiam server validates:
- `client_id` exists and belongs to `workspace_id`
- `Origin` header (`https://candycloud.rooiam.com`) is in the registered embed origins
- A matching `redirect_uri` exists for this origin

Rooiam renders the branded login form (logo, color, magic link / passkey / social buttons).

### Phase E: User Authenticates in Widget

User interacts with the widget (e.g., enters email, receives magic link, clicks verify).

On successful authentication:
```
Rooiam sets on demo-api.rooiam.com:
  Set-Cookie: rooiam_sid=<session-id>.<secret>
              HttpOnly; Secure; SameSite=None; Domain=rooiam.com

Widget sends postMessage to parent window:
  { type: "rooiam:navigate", url: "https://demo-api.rooiam.com/v1/oidc/authorize?..." }
```

The `rooiam_sid` cookie is now set on the browser for `demo-api.rooiam.com`.

### Phase F: OIDC Authorize

The frontend receives the `rooiam:navigate` postMessage and navigates the top window.

```
window.location.href = "https://demo-api.rooiam.com/v1/oidc/authorize
  ?client_id=demo-abc
  &redirect_uri=https://candycloud.rooiam.com/callback
  &response_type=code
  &scope=openid profile email
  &state=<stored-state>
  &code_challenge=<stored-challenge>
  &code_challenge_method=S256"
```

Rooiam server at `/v1/oidc/authorize`:
1. Reads `rooiam_sid` cookie → finds the valid IAM session
2. Validates `client_id` and `redirect_uri`
3. Verifies `state` and PKCE parameters
4. Issues an authorization code (stored in Postgres, TTL 5 min)
5. Redirects to the callback:

```
302 → https://candycloud.rooiam.com/callback?code=auth-code-xyz&state=<stored-state>
```

### Phase G: Callback — Frontend Receives the Code

Browser lands on `https://candycloud.rooiam.com/callback?code=auth-code-xyz&state=...`

Frontend `/callback` page:
1. Reads stored PKCE auth from `localStorage`
2. Verifies `state` matches
3. POSTs to `candycloud-api` — **never calls Rooiam token endpoint directly**:

```
POST https://candycloud-api.rooiam.com/v1/auth/exchange
Content-Type: application/json

{
  "code": "auth-code-xyz",
  "redirect_uri": "https://candycloud.rooiam.com/callback",
  "client_id": "demo-abc",
  "code_verifier": "<stored-verifier>",
  "workspace": "roochoco",
  "workspace_id": "uuid-1",
  "app_name": "RooChoco Portal",
  "app_id": "demo-abc"
}
```

### Phase H: candycloud-api Exchanges Code (Server-to-Server)

`candycloud-api` calls Rooiam directly — no browser, no CORS, no cookie needed:

```
POST https://demo-api.rooiam.com/v1/oidc/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=auth-code-xyz
&redirect_uri=https://candycloud.rooiam.com/callback
&client_id=demo-abc
&code_verifier=<stored-verifier>
```

Rooiam responds:
```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 900,
  "refresh_token": "rt-...",
  "id_token": "eyJ..."
}
```

Then `candycloud-api` fetches userinfo:
```
GET https://demo-api.rooiam.com/v1/oidc/userinfo
Authorization: Bearer eyJ...

Response:
{
  "sub": "user-uuid",
  "email": "minmin@lovechocolate.user",
  "name": "Minmin Customer",
  "email_verified": true
}
```

### Phase I: candycloud-api Creates App Session

```
Redis SET candycloud:session:<session-id> → {
  "accessToken": "eyJ...",
  "refreshToken": "rt-...",
  "idToken": "eyJ...",
  "userinfo": { "sub": "user-uuid", "email": "minmin@lovechocolate.user", ... },
  "workspace": "roochoco",
  "workspaceId": "uuid-1",
  "appId": "demo-abc",
  "appName": "RooChoco Portal",
  "createdAt": 1744000000000
}
EX 86400  (24 hours)

Response to frontend:
Set-Cookie: candycloud_session=<session-id>
            HttpOnly; Secure; SameSite=None; Domain=rooiam.com; Max-Age=86400

{
  "ok": true,
  "userinfo": { "sub": "...", "email": "minmin@lovechocolate.user", "name": "Minmin Customer" },
  "workspace": "roochoco",
  "workspace_id": "uuid-1"
}
```

### Phase J: Frontend Navigates to Dashboard

```
/callback stores lightweight session in sessionStorage:
{
  workspace: "roochoco",
  workspaceId: "uuid-1",
  userinfo: { ... },
  appName: "RooChoco Portal",
  ...
}

navigate("/dashboard?workspace=roochoco&workspace_id=uuid-1")
```

### Phase K: Dashboard — Normal App Operation

From this point, the frontend uses only `candycloud_session`. The Rooiam access token never leaves `candycloud-api`.

```
GET https://candycloud-api.rooiam.com/v1/auth/session
Cookie: candycloud_session=<session-id>

candycloud-api reads Redis → returns session info
→ 200 { ok: true, userinfo: {...}, workspace: "roochoco", ... }

GET https://candycloud-api.rooiam.com/v1/identity/me
Cookie: candycloud_session=<session-id>

candycloud-api → GET https://demo-api.rooiam.com/v1/identity/me
                     Authorization: Bearer eyJ...  (from Redis)
→ proxies response back to frontend
```

---

## Logout Flow

```
POST https://candycloud-api.rooiam.com/v1/auth/logout
Cookie: candycloud_session=<session-id>

candycloud-api:
  1. Deletes session from Redis
  2. Clears candycloud_session cookie (Max-Age=0)
  3. Returns { ok: true }

Frontend redirects to login page.
```

Note: This clears the Candycloud app session only. The `rooiam_sid` IAM session on `demo-api.rooiam.com` is unaffected — the user remains logged in to Rooiam for SSO purposes. If you want to also revoke the IAM session, call `POST /v1/auth/logout` on `demo-api.rooiam.com` separately.

---

## Session Model Summary

| | `rooiam_sid` | `candycloud_session` |
|---|---|---|
| Set by | `demo-api.rooiam.com` | `candycloud-api.rooiam.com` |
| Domain | `rooiam.com` (if `ROOIAM_COOKIE_DOMAIN=rooiam.com`) | `rooiam.com` (if `CANDYCLOUD_COOKIE_DOMAIN=rooiam.com`) |
| Stored in | PostgreSQL (Rooiam) | Redis (Candycloud) |
| Read by | Rooiam server only | Candycloud backend only |
| Contains | Rooiam user session state | `{ accessToken, userinfo, workspace }` |
| Used for | IAM: SSO, OIDC authorize, widget continuity | App: all Candycloud API calls |
| TTL | Configurable in Rooiam (default 7 days) | 24 hours |
| Cleared by | Rooiam `/auth/logout` | Candycloud `/auth/logout` |

---

## Request Flow Summary Diagram

```
                    BROWSER
                      │
         ┌────────────┼────────────────┐
         │            │                │
         ▼            ▼                ▼
candycloud.rooiam  demo-api.rooiam   (iframe)
  (frontend)         (Rooiam IAM)   demo-api.rooiam
                                    /login-widget
         │
         │ 1. boot → GET /v1/auth/session ──────────────────► candycloud-api
         │           ◄── 401
         │
         │ 2. GET /v1/demo/app-catalog ────────────────────► candycloud-api → demo-api
         │    GET /v1/demo/app-config ─────────────────────► candycloud-api → demo-api
         │    GET /v1/orgs/public/branding ────────────────► candycloud-api → demo-api
         │    GET /v1/setup/auth-methods ─────────────────► candycloud-api → demo-api
         │
         │ 3. render iframe ───────────────────────────────► demo-api/login-widget
         │           user logs in inside iframe
         │           rooiam_sid set on demo-api.rooiam.com
         │           postMessage: rooiam:navigate → /v1/oidc/authorize
         │
         │ 4. navigate → demo-api/v1/oidc/authorize ───────► demo-api
         │           Rooiam reads rooiam_sid, issues code
         │           ◄── 302 /callback?code=...&state=...
         │
         │ 5. POST /v1/auth/exchange (code + verifier) ────► candycloud-api
         │           candycloud-api → POST demo-api/v1/oidc/token (server-to-server)
         │           candycloud-api → GET  demo-api/v1/oidc/userinfo
         │           candycloud-api → Redis SET session
         │           ◄── Set-Cookie: candycloud_session + { ok, userinfo }
         │
         │ 6. navigate /dashboard
         │
         │ 7. GET /v1/auth/session ────────────────────────► candycloud-api (Redis)
         │    GET /v1/identity/me ─────────────────────────► candycloud-api → demo-api
         │    GET /v1/... (any Rooiam API) ───────────────► candycloud-api → demo-api
```

---

## Why Code Exchange Must Be Server-Side

If the frontend called `POST /v1/oidc/token` directly:

1. **CORS** — The token endpoint on `demo-api.rooiam.com` would need to allow `candycloud.rooiam.com` as an origin for a `POST` request. This is possible but exposes the token endpoint to browser-level attacks.

2. **Access token in browser** — The `access_token` would be visible to JavaScript. If any XSS exists, the token is compromised.

3. **Unnecessary complexity** — The frontend would need to store the access token and attach it as `Authorization: Bearer` to every Rooiam API call.

By doing the exchange server-side:
- The token never leaves `candycloud-api`
- No CORS needed on the token endpoint
- The browser only holds `candycloud_session` — an opaque identifier, not a token

---

## Why This Solves the Cookie Problem

The original browser-only demo called Rooiam directly from the browser. This failed in production because:

```
demo.rooiam.com (top window)
  embeds iframe from demo-api.rooiam.com

Browser policy: cookies set in an iframe from a different origin
                are "third-party" → blocked or partitioned

Result: rooiam_sid never stored
        /v1/oidc/authorize called without rooiam_sid
        Rooiam redirects back to /login-widget
        → infinite login loop
```

The Candycloud architecture avoids this entirely:

```
candycloud.rooiam.com (top window)
  embeds iframe from demo-api.rooiam.com

rooiam_sid is set during iframe session AND during top-level
navigation to /v1/oidc/authorize (same origin: demo-api.rooiam.com)
→ cookie is sent correctly for both

After /callback, browser only needs candycloud_session
→ set by candycloud-api.rooiam.com (first-party for candycloud.rooiam.com)
→ never involves demo-api.rooiam.com cookies again
```

---

## Environment Variables

### candycloud-server

| Variable | Description | Local | Production |
|----------|-------------|-------|------------|
| `CANDYCLOUD_PORT` | Port | `5185` | `5185` |
| `ROOIAM_API_URL` | Rooiam server (server-to-server) | `http://localhost:5180/v1` | `https://demo-api.rooiam.com/v1` |
| `CANDYCLOUD_REDIS_URL` | Redis | `redis://localhost:6379` | `redis://redis:6379` |
| `CANDYCLOUD_COOKIE_SECURE` | Require HTTPS for cookie | `false` | `true` |
| `CANDYCLOUD_COOKIE_DOMAIN` | Cookie domain scope | _(empty)_ | `rooiam.com` |
| `CANDYCLOUD_ALLOWED_ORIGINS` | CORS allowed origins | `http://localhost:5184` | `https://candycloud.rooiam.com` |

### candycloud-web

| Variable | Description | Local | Production |
|----------|-------------|-------|------------|
| `VITE_API_URL` | Candycloud backend | `http://localhost:5185/v1` | `https://candycloud-api.rooiam.com/v1` |
| `VITE_LOGIN_WIDGET_URL` | Rooiam server (serves `/login-widget`) | `http://localhost:5180` | `https://demo-api.rooiam.com` |

`VITE_LOGIN_WIDGET_URL` always points to the **Rooiam server**, not `candycloud-api`. The widget is served by Rooiam. Only after login does traffic route through `candycloud-api`.

---

## Directory Structure

```
candycloud-server/
  src/
    index.js          — Express server, CORS, route mounting
    session.js        — Redis session store, candycloud_session cookie builder
    rooiam.js         — Server-side Rooiam calls: exchangeCode, fetchUserinfo, proxyToRooiam
    routes/
      auth.js         — POST /v1/auth/exchange
                        GET  /v1/auth/session
                        POST /v1/auth/logout
      proxy.js        — requireSession middleware
                        GET  /v1/me  (alias)
                        *    /v1/*   (catch-all proxy to Rooiam)
  .env.example
  package.json

candycloud-web/
  src/
    App.tsx           — Landing (widget iframe), Callback, Dashboard components
    lib/
      api.ts          — demoApi: authExchange, authSession, me, logout, ...
      config.ts       — getApiBase() → VITE_API_URL, getLoginBase() → VITE_LOGIN_WIDGET_URL
  .env                — base defaults
  .env.local          — local dev overrides (gitignored)
  .env.production     — Cloudflare Pages build values
```

---

## Local Development

```bash
# Terminal 1 — Rooiam demo server (port 5180)
cd rooiam-server
SQLX_OFFLINE=true cargo run -- --env-file .env.local.demo

# Terminal 2 — Candycloud backend (port 5185)
cd candycloud-server
cp .env.example .env   # first time only
npm run dev

# Terminal 3 — Candycloud frontend (port 5184)
cd candycloud-web
npm run dev
```

Port reference:

| Port | Service |
|------|---------|
| `5180` | Rooiam demo server (IAM + widget) |
| `5185` | Candycloud backend |
| `5184` | Candycloud frontend |

---

## Production Deployment

`candycloud-web` → **Cloudflare Pages**:

```bash
cd candycloud-web
VITE_API_URL=https://candycloud-api.rooiam.com/v1 \
VITE_LOGIN_WIDGET_URL=https://demo-api.rooiam.com \
npm run build
npx wrangler pages deploy dist --project-name candycloud
```

`candycloud-server` → **Docker container** on the same server as the Rooiam demo stack, sharing the same Redis instance.
