# Hosted Login Widget Loading Stuck

## Problem

The hosted login widget embedded in a downstream app page shows a loading spinner forever and never renders the login UI.

This affects the `candycloud-web` app when deployed to Cloudflare Pages.

## Diagnosis

1. **Check browser console for errors**
   - If you see `429 (Too Many Requests)` - server rate limiting is active
   - Wait for `retry-after` seconds before retrying

2. **Check Network tab**
   - Verify `/login-widget` returns HTTP 200 with HTML content
   - Verify `/v1/setup/login-bootstrap` returns HTTP 200
   - Verify `/widget-assets/login-widget.css` returns HTTP 200

3. **Check server logs**
   - All widget-related endpoints should return 200 status
   - If `/login-widget` returns 403, the embed origin is not in the allowed list

4. **Verify environment variables**
   - `VITE_API_URL` should point to the backend API (e.g., `https://demo-api.rooiam.com/v1`)
   - `VITE_LOGIN_WIDGET_URL` should point to the backend API origin (e.g., `https://demo-api.rooiam.com`)
   - **Note:** `VITE_LOGIN_WIDGET_URL` must point to the backend server that serves `/login-widget`, NOT to the static frontend domain

## Root Causes

### Cause 1: Wrong VITE_LOGIN_WIDGET_URL Configuration

The `VITE_LOGIN_WIDGET_URL` environment variable was pointing to the static frontend (`https://demo.rooiam.com`) instead of the backend server (`https://demo-api.rooiam.com`).

Cloudflare Pages cannot serve the `/login-widget` endpoint - it serves static files and uses SPA fallback routing. The widget endpoint must be served by `rooiam-server`.

### Cause 2: Missing iframe onLoad Handler

The `candycloud-web` app was waiting for a `rooiam:widget-ready` postMessage event from the widget to show the login UI. However, the widget HTML sends `rooiam-login-widget:size` messages, not `rooiam:widget-ready`.

This mismatch caused the demo app to never transition out of the loading state.

## Solutions

### Solution 1: Fix VITE_LOGIN_WIDGET_URL

Update `candycloud-web/.env.production`:

```diff
- VITE_LOGIN_WIDGET_URL=https://demo.rooiam.com
+ VITE_LOGIN_WIDGET_URL=https://demo-api.rooiam.com
```

Rebuild and redeploy.

### Solution 2: Add onLoad Handler to iframe

In `candycloud-web/src/App.tsx`, add `onLoad` handler to the iframe:

```tsx
<iframe
  ref={iframeRef}
  key={loginUrl}
  src={loginUrl}
  className="login-widget-iframe"
  title={`${tenantName} Login`}
  allow="publickey-credentials-get *"
  style={{ opacity: iframeVisible ? 1 : 0, minHeight: 520, transition: 'opacity 0.18s ease' }}
  onLoad={() => {
    setIframeReady(true)
    setWidgetReady(true)
  }}
/>
```

This ensures the widget renders as soon as the iframe loads, regardless of postMessage events.

## Related Configuration

### Required Environment Variables for Demo Deployment

| Variable | Value | Purpose |
|----------|-------|---------|
| `VITE_API_URL` | `https://demo-api.rooiam.com/v1` | Backend API base |
| `VITE_LOGIN_WIDGET_URL` | `https://demo-api.rooiam.com` | Backend server origin (for `/login-widget`) |

### OAuth Client Requirements

The workspace app (OAuth client) must have:

1. **Redirect URIs** - Exact callback URLs including the production domain
   ```
   https://demo.rooiam.com/callback
   https://demo.rooiam.com/app?org=<workspace>
   ```

2. **Allowed Embed Origins** - The origin allowed to embed the widget
   ```
   https://demo.rooiam.com
   ```

## Prevention

When deploying a downstream app that embeds the hosted login widget:

1. Always point `VITE_LOGIN_WIDGET_URL` to the backend server, not the static frontend
2. Always add an `onLoad` handler on the iframe as a fallback
3. Test the widget with debug parameters: `?debug_widget=1`
4. Verify all endpoints return 200 in the Network tab before deployment
