# Hosted Login Widget Integration

The widget is served by `rooiam-server` at `/login-widget`. `rooiam-app` is the tenant portal and can preview the widget; it does not host the widget implementation.

Use the [Hosted Widget Integration Guide](./03_hosted_widget_integration_guide.md) for the embedding contract and [Downstream Hosted Widget Callback Flow](./11_downstream_hosted_widget_callback_flow.md) for the app's callback and PKCE handling.

## Minimal embed

```html
<iframe
  title="Sign in"
  src="https://auth.example.com/login-widget?workspace_id=WORKSPACE_UUID&amp;client_id=CLIENT_ID"
></iframe>
```

Register the site's origin under `Allowed Embed Origins` and its full callback under `Redirect URIs`. The client must belong to the workspace. Rooiam selects a registered callback matching the embedding origin and creates a 15-minute `widget_login_context`.

Use `workspace_id` or the supported `workspace` slug alternative, plus `client_id`. The SDK's `buildHostedLoginUrl` takes `apiOrigin`, `workspaceId`, and `clientId` and encodes the URL safely.

Do not put `app`, `redirect_uri`, `state`, `code_challenge`, or `code_challenge_method` on `/login-widget`. App display names come from registration. State and PKCE belong to the app's later OIDC authorization flow.

## Runtime modes

`ROOIAM_MODE=production` selects production behavior. `ROOIAM_MODE=demo` selects seeded demo behavior, including simulated provider flows. `ROOIAM_ENABLE_DEMO_SEED` is a legacy accepted name in demo configuration, not the current switch that determines runtime mode or startup seeding.

Real provider callbacks normally use `{ROOIAM_SERVER_URL}/api/v1/auth/google/callback` and the equivalent Microsoft path. Provider start routes are under `/v1/oauth/google` and `/v1/oauth/microsoft`; there is no generic `/v1/oauth/login?provider=...` contract.

## Troubleshooting

- Missing client: register an app in the workspace and use its actual client ID.
- Blocked embed: verify the page's origin against `Allowed Embed Origins`.
- Missing callback: register a redirect URI whose origin matches the embedding site.
- Expired context: reload the widget to start a new transaction.
- Callback loop: check the app's state/PKCE ownership and token exchange using the callback guide.

For deployment instructions, see the [Docker Quickstart](../getting-started/05_quickstart_with_docker.md).
