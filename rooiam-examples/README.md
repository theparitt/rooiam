# rooiam-example

Rooiam examples root.

Structure:

- `example-1-widget`
  - minimal hosted login widget embed
  - target local port: `5180`
- `example-2-account`
  - fuller app with callback, `My` area, linked accounts, passkeys, MFA, sessions, and audit logs
  - target local port: `5181`
- `example-3-backend`
  - backend-heavy integration example
  - target local port: `5182`

Recommended doctrine:

- `5180`
  - easiest first example
- `5181`
  - richer account example
- `5182`
  - advanced backend / server-side integration

This keeps the examples progressive instead of overloading one app with every concept at once.

Shared terms:

- `widget_login_context`
  - temporary hosted-widget login transaction owned by Rooiam
- `redirect_uri`
  - final app callback after login
- `post_logout_redirect_uri`
  - final app callback after logout

Flow boundary:

- OIDC authorize
  - app authorization flow
  - ends at the app's registered `redirect_uri`
- hosted login widget
  - sign-in surface only
  - used when Rooiam needs the user to authenticate before resuming another flow, such as OIDC authorize

Security notes:

- `Redirect URIs` and `Allowed Embed Origins` are separate controls.
  - redirect URIs are exact app callbacks
  - allowed embed origins are the sites allowed to load the hosted widget
- if one app supports multiple sites, Rooiam matches the current embedding site origin to the registered callback with the same origin
- plain `http://` should only be used for localhost or loopback development
- customer apps hosting the widget still need their own XSS and CSP protections
  - Rooiam can protect the widget boundary and app callback selection
  - Rooiam cannot protect a compromised host page that already executes attacker-controlled script

Port map:

- `5180`
  - `example-1-widget`
- `5181`
  - `example-2-account`
- `5182`
  - `example-3-backend`

## Real Product Path

Use this path when you want to wire the examples against a real Rooiam setup instead of demo seed data.

Recommended order:

1. run `rooiam-server` in production mode
2. run `rooiam-admin`
3. create the first platform owner through the setup wizard
4. finish the minimum platform setup
5. run `rooiam-app`
6. register the tenant owner account
7. sign in to `rooiam-app`
8. create a workspace
9. create a workspace app
10. register exact callback URLs and allowed embed origins
11. generate a workspace API key for backend examples if needed
12. run the examples and point them at the real workspace/app values

What to copy from Rooiam into the examples:

- `workspace_id`
- `workspace_slug`
- `client_id`
- `app_name`
- hosted widget base URL
- workspace API key for examples 2 and 3 when you want real workspace API calls

Example usage:

- `example-1-widget`
  - minimal hosted widget test
  - best first integration check
- `example-2-account`
  - richer account-style downstream app
  - callback, sessions, passkeys, MFA, and audit activity
- `example-3-backend`
  - backend / API-key integration example

If you use Docker:

- `docker compose up -d`
- then provide the real example values with env vars:
  - `EXAMPLE_1_WORKSPACE_ID`
  - `EXAMPLE_1_CLIENT_ID`
  - `EXAMPLE_1_APP_NAME`
  - `EXAMPLE_2_WORKSPACE_ID`
  - `EXAMPLE_2_CLIENT_ID`
  - `EXAMPLE_2_APP_NAME`
  - `EXAMPLE_2_API_KEY`
  - `EXAMPLE_3_WORKSPACE_ID`
  - `EXAMPLE_3_CLIENT_ID`
  - `EXAMPLE_3_APP_NAME`
  - `EXAMPLE_3_API_KEY`
