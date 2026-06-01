# Callback And Redirect Doctrine

Date: 2026-03-20

This note defines the difference between:

- provider callbacks
- app callbacks
- hosted login redirects

These are not the same thing and should not be configured in the same place.

## 1. Provider Callbacks

Provider callbacks are the OAuth callback URLs used by Rooiam itself when talking to Google or Microsoft.

Examples:

- `http://localhost:5170/api/v1/auth/google/callback`
- `http://localhost:5170/api/v1/auth/microsoft/callback`

Properties:

- configured once at the platform level
- owned by `rooiam-server`
- not per workspace
- not per app
- not configured in the login widget

Meaning:

- Google or Microsoft sends the user back to Rooiam here
- Rooiam completes the external provider login

## 2. App Callbacks

App callbacks are the OIDC redirect URIs for downstream apps registered in Rooiam.

Examples:

- `http://localhost:5174/callback`
- `https://app.example.com/callback`

Properties:

- configured per app/client
- stored in `oauth_client_redirect_uris`
- exact allowlist, not broad domain matching
- this is the real callback list for downstream applications

Meaning:

- Rooiam sends the authorization code back to the downstream app here
- the app later exchanges that code at `/v1/oidc/token`

Rule:

- app callbacks must be exact
- full scheme + host + port + path must match

## 3. Hosted Login Redirects

Hosted login redirects are the redirect targets passed into the Rooiam login UI on `5172`.

Examples:

- a downstream app authorize URL on `5170`
- a trusted frontend path such as `/app?...`

Properties:

- this is not a separate app callback registry
- this is the login continuation target after the user finishes login on `5172`
- current validation is origin-based for trusted frontend/server surfaces

Meaning:

- the login widget does not need its own callback list
- it only needs a trusted redirect target to continue the sign-in flow

Rule:

- do not invent a separate “widget callback” concept
- the login widget is an entry point, not an OAuth client

## 4. What The Login Widget Needs

The login widget should receive context, not its own callback registry.

Canonical context:

- `workspace_id`
- `client_id`

Optional display context:

- `workspace_slug`
- app display name

What happens next:

1. `5174` sends `workspace_id` and `client_id`
2. Rooiam loads workspace branding and auth policy
3. Rooiam loads the app config for that exact client
4. login continues into the app OIDC flow

## 5. Recommended Defaults

For provider callbacks:

- one Google callback
- one Microsoft callback

For app callbacks:

- exact localhost callback URLs for development
- exact production callback URLs for real domains

Good examples:

- `http://localhost:5174/callback`
- `https://portal.example.com/callback`

Avoid:

- wildcard callback domains
- arbitrary ports
- arbitrary paths
- user-provided callback values not already registered

## 6. Workspace Identity

Do not rely on workspace slug as the canonical identity for system-to-system flows.

Use:

- `workspace_id` as canonical identity

Treat as secondary:

- `workspace_slug`

Reason:

- slugs can collide
- slugs can be renamed
- multiple tenants and many workspaces make slug-based routing fragile

## 7. Final Doctrine

Use this split:

- provider callback = platform OAuth callback for Rooiam itself
- app callback = exact per-app OIDC redirect URI
- hosted login redirect = trusted continuation target, not a separate callback registry

Use these identifiers for embedded login and demo/app flows:

- `workspace_id`
- `client_id`

Use these only as secondary display or UX aids:

- `workspace_slug`
- app name

This keeps the protocol correct and avoids future slug-collision and naming confusion.
