# Downstream Hosted Widget Callback Flow

This is the canonical downstream-app flow for Rooiam `0.1`.

If you are building an app that embeds `/login-widget`, this page is the exact doctrine to follow.

The reference implementation is the **Candycloud** example app:

- `candycloud-web/` — the end-user SPA
- `candycloud-server/` — the app's own backend (Node.js/Express)

---

## Core Principle: Two Separate Sessions

The most important rule in this integration:

| Session | Cookie | Owned by | Purpose |
|---------|--------|----------|---------|
| IAM session | `rooiam_sid` | `api.rooiam.com` | Who you are (identity) |
| App session | `candycloud_session` | `candycloud-api.rooiam.com` | Are you logged into this app |

Your app must **never** use `rooiam_sid` as its application session. The IAM session is Rooiam's internal state. Your app creates its own session after OIDC code exchange.

This separation solves:
- Cross-origin / third-party cookie issues — your cookie is first-party on your own domain
- Session lifetime independence — your app controls its own session TTL
- Clean logout — clearing your app session does not log the user out of Rooiam SSO

---

## Three Services

```
candycloud.rooiam.com       = frontend SPA (Cloudflare Pages or static)
candycloud-api.rooiam.com   = app backend  (Node.js, port 4000)
api.rooiam.com              = Rooiam IAM   (Rust server, port 5170/5180)
```

---

## Full Login Flow

```
1. User opens candycloud.rooiam.com
   └─ frontend loads, calls GET /v1/auth/session on candycloud-api
      └─ no session yet → show login page

2. Frontend fetches app catalog + config from Rooiam:
   GET api.rooiam.com/v1/demo/app-catalog
   GET api.rooiam.com/v1/demo/app-config?workspace_id=...&origin=candycloud.rooiam.com

3. Frontend builds PKCE auth request (state, code_verifier, code_challenge)
   Stores it in localStorage

4. Frontend renders iframe:
   <iframe src="api.rooiam.com/login-widget?workspace_id=...&client_id=...">

5. User logs in inside the iframe
   └─ Rooiam sets rooiam_sid on api.rooiam.com domain
   └─ Widget sends postMessage: { type: 'rooiam:navigate', url: '/v1/oidc/authorize?...' }

6. Frontend navigates top window to:
   api.rooiam.com/v1/oidc/authorize?client_id=...&code_challenge=...
                                    &redirect_uri=candycloud.rooiam.com/callback&...
   └─ Rooiam reads rooiam_sid, validates session
   └─ Rooiam creates authorization code
   └─ Rooiam redirects to: candycloud.rooiam.com/callback?code=...&state=...

7. /callback page on candycloud.rooiam.com receives code + state
   └─ Reads stored PKCE auth from localStorage
   └─ Verifies state matches
   └─ POSTs to candycloud-api:
      POST candycloud-api.rooiam.com/v1/auth/exchange
      { code, redirect_uri, client_id, code_verifier, workspace, workspace_id, app_name, app_id }

8. candycloud-api exchanges code with Rooiam server-side:
   POST api.rooiam.com/v1/oidc/token   (server-to-server — no browser, no CORS, no cookie)
   └─ Gets access_token, refresh_token, id_token
   └─ Calls GET api.rooiam.com/v1/oidc/userinfo with access_token
   └─ Stores { accessToken, userinfo, workspace, ... } in Redis
   └─ Sets candycloud_session cookie (HttpOnly, Secure, SameSite=None, Domain=rooiam.com)
   └─ Returns { ok: true, userinfo, workspace, workspace_id }

9. /callback stores lightweight session in sessionStorage, navigates to /dashboard

10. /dashboard on boot:
    GET candycloud-api.rooiam.com/v1/auth/session (via candycloud_session cookie)
    └─ Returns userinfo from Redis session
    └─ Renders dashboard

11. All subsequent API calls:
    candycloud-web → candycloud-api (candycloud_session cookie)
    candycloud-api → api.rooiam.com (Bearer access_token, server-side)
```

---

## Why Server-Side Code Exchange

The OIDC code exchange happens in `candycloud-api`, not in the browser. This is intentional:

1. **No CORS issue.** Server-to-server calls to `api.rooiam.com/v1/oidc/token` need no browser origin header.
2. **No third-party cookie issue.** `candycloud_session` is set by `candycloud-api.rooiam.com` — a first-party cookie for `candycloud.rooiam.com`. The browser never needs to send `rooiam_sid` for app API calls.
3. **Access token stays server-side.** The frontend never sees the Rooiam access token.

---

## Callback Page Logic

```ts
const code = params.get('code')
const state = params.get('state')
const auth = readOidcAuth()  // from localStorage

// No OIDC state stored — bad state
if (!auth) { setError('Missing OIDC state'); return }

// No code yet — first landing before authorize redirect
if (!code || !state) {
  if (!readOidcAuthorizeStarted()) {
    markOidcAuthorizeStarted(auth.state)
    window.location.replace(buildAuthorizeUrl(config, auth))
  } else {
    setError('Missing authorization code')
  }
  return
}

// State mismatch
if (state !== auth.state) { setError('State mismatch'); return }

// Exchange code via candycloud-api (server-side)
const result = await demoApi.authExchange({
  code,
  redirect_uri: auth.redirectUri,
  client_id: auth.appId,
  code_verifier: auth.codeVerifier,
  workspace: auth.workspace,
  workspace_id: auth.workspaceId,
  app_name: auth.appName,
  app_id: auth.appId,
})

// Save lightweight session to sessionStorage (no tokens — those are server-side)
persistDemoSession({ userinfo: result.userinfo, workspace: result.workspace, ... })
navigate('/dashboard')
```

---

## Dashboard Session Check

On `/dashboard` boot, if no session in sessionStorage:

```ts
demoApi.authSession()  // GET /v1/auth/session on candycloud-api
  .then(result => {
    // candycloud_session cookie is valid — reconstruct local session
    setSession({ userinfo: result.userinfo, workspace: result.workspace, ... })
  })
  .catch(() => {
    // No valid app session — redirect to login
    navigate('/')
  })
```

This handles page refreshes, new tabs, and returning users — all via the `candycloud_session` cookie, with no dependency on `rooiam_sid`.

---

## candycloud-api Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/auth/exchange` | Exchange OIDC code server-side, create `candycloud_session` |
| `GET` | `/v1/auth/session` | Return current session info (401 if missing/expired) |
| `POST` | `/v1/auth/logout` | Clear `candycloud_session` from Redis and browser |
| `GET` | `/v1/me` | Alias → proxies to `/identity/me` on Rooiam |
| `*` | `/v1/*` | Proxy to Rooiam using stored access token |

All proxy routes require a valid `candycloud_session` cookie.

---

## Environment Variables

### candycloud-server

```env
CANDYCLOUD_PORT=4000
ROOIAM_API_URL=https://demo-api.rooiam.com/v1   # Rooiam server (server-to-server)
CANDYCLOUD_REDIS_URL=redis://redis:6379
CANDYCLOUD_COOKIE_SECURE=true
CANDYCLOUD_COOKIE_DOMAIN=rooiam.com              # scope to *.rooiam.com
CANDYCLOUD_ALLOWED_ORIGINS=https://candycloud.rooiam.com
```

### candycloud-web

```env
VITE_API_URL=https://candycloud-api.rooiam.com/v1   # app backend
VITE_LOGIN_WIDGET_URL=https://demo-api.rooiam.com    # Rooiam server (serves /login-widget)
```

`VITE_LOGIN_WIDGET_URL` points to the Rooiam server because `/login-widget` is served by Rooiam, not by the app backend.

---

## Anti-Patterns

### Do not exchange the OIDC code in the browser

Calling `POST /v1/oidc/token` from the browser requires CORS from the app origin to the Rooiam server and exposes the access token to JavaScript. Use the app backend for token exchange.

### Do not use `rooiam_sid` as the app session

`rooiam_sid` is an IAM-internal cookie. It is not stable across domains, not under your control, and not meant to be read by downstream apps.

### Do not pass `redirect_uri` to `/login-widget`

The widget resolves the callback URL from the registered OAuth client and the current embed origin. Passing `redirect_uri` in the widget URL breaks the hosted-widget security contract.

### Do not pass `app` to `/login-widget`

The canonical downstream contract does not require a browser-composed `app`
query parameter on the widget URL. The hosted widget should derive display
context from the registered OAuth client and workspace branding instead.

### Do not store the access token in the browser

The Rooiam access token should live in your app backend's session store (Redis). The frontend only holds the lightweight `candycloud_session` cookie.
