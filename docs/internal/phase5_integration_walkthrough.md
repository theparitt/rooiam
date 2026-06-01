# Phase 5: Integration Walkthrough

How to wire a downstream app into Rooiam as its identity provider.
Copy this pattern from `rooiam-demo` — it is a working reference implementation.

---

## Overview

Rooiam acts as a hosted identity layer. Your app:

1. Redirects users to the Rooiam-hosted login page (scoped to your org slug)
2. Receives users back at the app callback registered on the workspace app
3. Starts the OIDC authorize step after the hosted login session is established
4. Exchanges the authorization code and loads the signed-in user context

---

## Prerequisites

- Rooiam server running at `http://localhost:5170`
- Rooiam login app running at `http://localhost:5172`
- Your app running at any other port (e.g. `http://localhost:5174`)
- A tenant workspace slug (e.g. `roochoco`)
- CORS: your app's origin must be in the server's `ALLOWED_ORIGINS` list

---

## Step 1 — Environment

Create `.env` in your app:

```env
VITE_API_URL=http://localhost:5170/v1
VITE_LOGIN_URL=http://localhost:5172
```

```ts
// lib/config.ts
export const getApiBase = () => import.meta.env.VITE_API_URL.replace(/\/+$/, '')
export const getLoginBase = () => import.meta.env.VITE_LOGIN_URL.replace(/\/+$/, '')
```

---

## Step 2 — Build the hosted widget URL

```ts
function buildLoginUrl(workspaceId: string, clientId: string, appName: string): string {
  const url = new URL(`${getLoginBase()}/login-widget`)
  url.searchParams.set('workspace_id', workspaceId)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('app', appName)
  return url.toString()
}
```

Do not pass a browser-chosen `redirect_uri` into the widget URL. Rooiam resolves the final app callback from the workspace app registration.

---

## Step 3 — Load public branding (optional but recommended)

Display the tenant's branding on your landing page before the user even clicks sign in:

```ts
const res = await fetch(`${getApiBase()}/orgs/public/branding?slug=${orgSlug}`)
const branding = await res.json()
// branding.brand_color, branding.logo_url, branding.login_display_name,
// branding.widget_radius, branding.widget_shadow, branding.login_method_order
```

No auth required — this endpoint is public.

---

## Step 4 — Handle the callback

After hosted login, Rooiam redirects to your registered app callback. On the first landing, your app should start the OIDC authorize step using the same registered callback and PKCE state. On the second landing, your app receives the authorization `code`.

```ts
// /callback route
function Callback() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    const auth = readOidcAuth()

    if (!auth) {
      setError('Missing OIDC state')
      return
    }

    if (!code) {
      window.location.replace(buildAuthorizeUrl(appConfig, auth))
      return
    }

    void exchangeCodeAndContinue(code, state, auth)
  }, [])

  return <p>Signing you in…</p>
}
```

---

## Step 5 — Read session in your app

All Rooiam API calls use `credentials: 'include'` — no tokens, no headers needed.

```ts
// Current signed-in user
const meRes = await fetch(`${getApiBase()}/identity/me`, { credentials: 'include' })
// { id, email, display_name }

// Current org/workspace context
const portalRes = await fetch(`${getApiBase()}/orgs/current/portal`, { credentials: 'include' })
// { current_org: { id, slug, name, brand_color, ... }, organizations: [...], permissions: [...] }
```

If either returns `401`, the session has expired — send the user back through the hosted widget URL again.

---

## Step 6 — Logout

```ts
await fetch(`${getApiBase()}/auth/logout`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
})
window.location.href = '/'  // back to your landing page
```

---

## Step 7 — (Demo only) Bypass email for local testing

In demo mode the server exposes a shortcut login that creates a real session without sending email:

```ts
await fetch(`${getApiBase()}/setup/demo-login`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ org_slug: 'roochoco', app_name: 'My App' }),
})
// session is now active — same as a real login
```

This only works when `ROOIAM_DEMO_MODE=true` in the server env. Never expose in production.

---

## CORS requirement

Your app's origin must be allowed. In `rooiam-server/.env`:

```env
ROOIAM_ALLOWED_ORIGINS=http://localhost:5171,http://localhost:5172,http://localhost:5173,http://localhost:5174,http://localhost:5175
```

Add your port to this list and restart the server.

---

## Reference: working demo

See `rooiam-demo/src/App.tsx` for the complete working implementation:

| Function/Component | What it does |
|---|---|
| `buildLoginUrl()` | Constructs the hosted widget URL with app identity only |
| `fetchPublicBranding()` | Loads tenant branding without auth |
| `fetchPublicAuthMethods()` | Checks which sign-in methods are enabled for the org |
| `useDemoSession()` | Polls `/identity/me` and `/orgs/current/portal` on mount |
| `Landing` component | Shows branded login widget, redirects to Rooiam |
| `Callback` component | Starts OIDC authorize on first callback landing, then exchanges code and routes to dashboard |
| `Dashboard` component | Displays user + org context, logout button |

---

## Validated endpoints (2026-03-10)

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /orgs/public/branding?slug=<slug>` | None | Tenant branding for your UI |
| `GET /setup/auth-methods?org=<slug>` | None | Which sign-in methods are enabled |
| `POST /setup/demo-login` | None (demo only) | Create real session without email |
| `GET /identity/me` | Session cookie | Current user |
| `GET /orgs/current/portal` | Session cookie | Current org + all orgs + permissions |
| `POST /auth/logout` | Session cookie | End session |
| `GET /.well-known/openid-configuration` | None | OIDC discovery (for OAuth clients) |
| `GET /.well-known/jwks.json` | None | Public keys (for verifying tokens) |
