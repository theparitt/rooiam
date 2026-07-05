# Hosted Login Widget Integration Guide

This document describes how the hosted login widget works, how to embed it correctly, and how to troubleshoot common issues.

---

## Overview

The hosted login widget is an iframe-embeddable login UI served by `rooiam-server`. It supports two modes:

| Mode | Environment Variable | OAuth Flow |
|------|---------------------|------------|
| **Production** | Normal server startup | Real Google/Microsoft OAuth |
| **Demo** | `ROOIAM_ENABLE_DEMO_SEED=true` | Simulated (fake) OAuth pages |

---

## Widget URL

```
{server_origin}/login-widget?workspace_id={uuid}&workspace={slug}&client_id={client_id}
```

### Required Parameters

| Parameter | Description |
|-----------|-------------|
| `workspace_id` | Workspace UUID (from Rooiam admin) |
| `workspace` | Workspace slug (alternative to workspace_id) |
| `client_id` | OAuth client ID registered in the workspace |
### Optional Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `widget_embed_origin` | - | Origin of the embedding page for validation |
| `surface` | `user` | Login surface: `user` or `admin` |
| `preview` | `0` | Preview mode with query param overrides |

---

## How the Widget Works

### 1. Widget Initialization Flow

```
1. Browser loads iframe: /login-widget?workspace_id=...&client_id=...
2. Server validates:
   - client_id exists and belongs to workspace
   - embed_origin is in Allowed Embed Origins
   - a matching redirect_uri exists for the embed origin
3. Server creates widget_login_context (stored in Redis, 15 min TTL)
4. Server returns HTML with embedded JavaScript
5. Widget JavaScript loads /v1/setup/login-bootstrap for branding + auth methods
6. Widget renders login UI (magic link, Google, Microsoft, passkey buttons)
```

### 2. widget_login_context

This is a short-lived server-side token that holds:

```rust
struct WidgetLoginContextPayload {
    redirect_uri: String,      // Final app callback from registered OAuth client
    workspace_id: Option<Uuid>,
    client_id: String,
    app_name: String,
    embed_origin: String,
}
```

**Important Rules:**
- Widget URL must NOT include `redirect_uri` (security rule)
- `redirect_uri` always comes from database (registered OAuth client)
- `widget_login_context` TTL is 15 minutes

### 3. Security Validation

Before rendering the widget, server validates:

1. `client_id` is a valid workspace app
2. App belongs to the requested workspace
3. Embed origin is in `Allowed Embed Origins`
4. A registered `redirect_uri` matches the embed origin

If any check fails, the widget is blocked.

---

## Production Mode Integration

### Environment

```bash
ROOIAM_ENABLE_DEMO_SEED=false   # or not set
ROOIAM_SERVER_URL=https://api.rooiam.com
```

### Widget URL Example

```
https://api.rooiam.com/login-widget?workspace_id=7089049f-48e6-4e66-a6f1-a3aca5ddeb1c&workspace=myworkspace&client_id=ckk366a21YO9nLAqOP5NHhakGvCGbcZz0m9TYXcN3DA
```

### OAuth Flow (Production)

```
1. User clicks "Continue with Google"
2. Widget redirects to: /v1/oauth/login?provider=google&widget_login_context=...
3. Server validates widget_login_context, then redirects to real Google OAuth
4. Google returns to: /v1/oauth/callback?code=...
5. Server exchanges code for tokens, creates session
6. Server redirects to the registered redirect_uri from widget_login_context
```

### Required OAuth Client Configuration

In Rooiam Admin → Workspace → Apps → Your App:

```
Redirect URIs:
  https://www.example.com/callback
  https://www.example.com/app

Allowed Embed Origins:
  https://www.example.com
```

---

## Demo Mode Integration

### Environment

```bash
ROOIAM_ENABLE_DEMO_SEED=true
ROOIAM_MODE=demo
ROOIAM_SERVER_URL=https://demo-api.rooiam.com
ROOIAM_APP_URL=https://demo-app.rooiam.com          # rooiam-app tenant portal
ROOIAM_ENDUSER_URL=https://candycloud.rooiam.com    # downstream demo end-user app
```

### Widget URL Example

```
https://demo-api.rooiam.com/login-widget?workspace_id=65fac08e-7488-4e77-918f-52a6ed9d25c0&workspace=mintmallow&client_id=demo-mintmallow-portal-spa
```

### OAuth Flow (Demo)

```
1. User clicks "Continue with Google"
2. Widget redirects to: /v1/oauth/demo?provider=google&widget_login_context=...
3. Server shows simulated Google consent page (no real OAuth)
4. User clicks "Continue" on fake page
5. Server creates session for demo user, redirects to registered redirect_uri
```

### Demo Mode Auth Method Overrides

| Method | Production Check | Demo Override |
|--------|-----------------|---------------|
| Magic link | SMTP configured | Mailhog if running |
| Google | `google_client_id` + `google_client_secret` | Always enabled |
| Microsoft | `microsoft_client_id` + `microsoft_client_secret` | Always enabled |
| Passkey | WebAuthn configured | Always enabled (demo emails only) |

### Demo Users

| Email | Workspace | Role |
|-------|------------|------|
| `admin@rooiam.demo` | platform | Superuser |
| `rooroo@sweetfactory.demo` | - | Owner of all demo workspaces |
| `minmin@lovechocolate.user` | roochoco | Downstream app end user |
| `lulu@softmallow.user` | mintmallow | Downstream app end user |

---

## Troubleshooting

### Widget Shows Loading Forever

**Symptoms:** Widget iframe shows spinner, never renders login UI.

**Causes and Solutions:**

1. **Wrong VITE_LOGIN_WIDGET_URL**
   - Config points to frontend instead of backend API
   - Solution: Set `VITE_LOGIN_WIDGET_URL=https://api.rooiam.com` (not `https://www.example.com`)

2. **Missing onLoad handler**
   - Demo page doesn't handle iframe load event
   - Solution: Add `onLoad={() => { setIframeReady(true); setWidgetReady(true); }}` to iframe

3. **Rate limiting (429)**
   - Too many requests to `/login-widget`
   - Solution: Wait 60 seconds (check `retry-after` header)

### 403 Forbidden on /login-widget

**Cause:** Embed origin not in Allowed Embed Origins

**Solution:** Add your domain to OAuth client configuration:
```
Allowed Embed Origins:
  https://www.example.com
```

### 400 Bad Request: missing field `provider`

**Cause:** Non-demo mode OAuth login URL missing `provider` parameter

**Solution:** Widget JavaScript must include `provider` in query string:
```javascript
url.searchParams.set('provider', provider);
```

### Widget redirects to wrong URL after login

**Cause:** `redirect_uri` mismatch between widget and OAuth client config

**Solution:** 
1. Verify OAuth client's registered redirect_uri matches the expected callback
2. Check that `widget_login_context` hasn't expired (15 min TTL)

### Demo OAuth shows real Google/Microsoft login

**Cause:** Server not running in demo mode

**Solution:** Set `ROOIAM_ENABLE_DEMO_SEED=true` and restart server

---

## Environment Variables Reference

### For Downstream App (Embedding the Widget)

| Variable | Production | Demo | Purpose |
|----------|------------|------|---------|
| `VITE_API_URL` | `https://api.rooiam.com/v1` | `https://demo-api.rooiam.com/v1` | Backend API |
| `VITE_LOGIN_WIDGET_URL` | `https://api.rooiam.com` | `https://demo-api.rooiam.com` | Widget endpoint origin |

### For rooiam-server

| Variable | Production | Demo | Purpose |
|----------|------------|------|---------|
| `ROOIAM_ENABLE_DEMO_SEED` | `false` or unset | `true` | Enable demo seed |
| `ROOIAM_MODE` | - | `demo` | Demo mode flag |
| `ROOIAM_SERVER_URL` | `https://api.rooiam.com` | `https://demo-api.rooiam.com` | OIDC issuer |
| `ROOIAM_APP_URL` | `https://app.rooiam.com` | `https://demo-app.rooiam.com` | Rooiam tenant portal (`rooiam-app`) |
| `ROOIAM_ENDUSER_URL` | not needed | `https://candycloud.rooiam.com` | demo seed only — downstream customer app base URL for demo OAuth client redirect URIs |
| `ROOIAM_COOKIE_SECURE` | `true` | `true` | HTTPS required |

---

## Security Rules Summary

1. **Never pass `redirect_uri` in widget URL** - Server always uses redirect_uri from registered OAuth client
2. **Do not pass `app` in widget URL** - The widget should derive app display context from the registered OAuth client / branding, not from a browser-composed query string
3. **Always validate embed origin** - Embed origin must be in Allowed Embed Origins
4. **widget_login_context is short-lived** - 15 minute TTL, single-use
5. **Demo mode bypasses real OAuth** - No actual Google/Microsoft credentials needed
