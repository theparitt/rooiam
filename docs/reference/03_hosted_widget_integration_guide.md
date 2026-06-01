# Hosted Widget Integration Guide

This is the practical developer guide for the hosted login widget.

For the full downstream app callback pattern, including PKCE ownership and what your callback page must do after the widget returns, also read:

- [Downstream Hosted Widget Callback Flow](./11_downstream_hosted_widget_callback_flow.md)

## Minimal Widget URL

Use app identity only:

```text
https://auth.example.com/login-widget?workspace_id=<workspace-id>&client_id=<client-id>&app=Acme%20Portal
```

Do not pass a browser-chosen `redirect_uri` to `/login-widget`.

Also do not pass:

- `state`
- `code_challenge`
- `code_challenge_method`

to `/login-widget`.

Those belong to the downstream app's own `/oidc/authorize` request, not to the widget URL.

## What Must Be Registered

On the workspace app, register:
- `Redirect URIs`
- `Allowed Embed Origins`

Example:
- redirect URI:
  - `https://app.example.com/callback`
- allowed embed origin:
  - `https://app.example.com`

## Runtime Flow

1. your site embeds `/login-widget`
2. Rooiam reads the current embedding site origin
3. Rooiam checks that origin against `Allowed Embed Origins`
4. Rooiam matches that site origin to the registered callback with the same origin
5. Rooiam mints a short-lived `widget_login_context`
6. the user signs in
7. Rooiam redirects to the app's registered `redirect_uri`

Important:

- the widget is not your OIDC callback handler
- your downstream app callback page still owns PKCE state validation and token exchange
- the reference behavior is the `candycloud-web` callback flow

## Widget Lifetime And Expiry

The hosted widget login transaction is intentionally short-lived.

Current `0.1` behavior:
- `widget_login_context` lifetime: about 15 minutes
- auth-start consumes or rotates the context
- stale or replayed contexts are rejected

User-facing effect:
- an expired widget should ask the user to refresh
- it should not silently continue with stale login state

Operator-facing effect:
- expiry or replay problems appear in audit logs as:
  - `auth.widget.expired`
  - `auth.widget.context_invalid`

## Multiple Origins

One app can support multiple sites, but it should be intentional.

Example:
- embed origins:
  - `https://app.example.com`
  - `https://staging.example.com`
- redirect URIs:
  - `https://app.example.com/callback`
  - `https://staging.example.com/callback`

Rooiam routes:
- `https://app.example.com` -> `https://app.example.com/callback`
- `https://staging.example.com` -> `https://staging.example.com/callback`

Recommended rule:
- prefer one app per site or environment when possible

## Production Checklist

- use `https://` outside localhost
- register every exact callback URL
- register every exact embed origin
- keep the host page free of XSS
- use a strict CSP on the host app
- avoid one app spanning many unrelated sites

## Common Problems

### Widget blocked
- current site is not in `Allowed Embed Origins`
- or there is no matching callback origin

### Wrong redirect destination
- callback/origin lists drifted
- one shared app has multiple callbacks and is misconfigured
- or the current embedding site does not have a same-origin callback yet

### PKCE or callback exchange fails in the downstream app
- the app generated PKCE state but never used that same authorize request
- the app treated the widget as if it were the final OIDC client
- the callback page lost its stored auth request
- or the app tried to pass browser-chosen callback data into `/login-widget`

### Widget expired
- expected when `widget_login_context` times out or is already consumed
- current `0.1` target lifetime is about 15 minutes
- refresh the page to mint a fresh hosted login session
