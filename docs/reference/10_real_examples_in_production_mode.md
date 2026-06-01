# Real Examples In Production Mode

Use this guide when you want to test Rooiam with the real product flow instead of demo seed data.

This is the clean order:

## 1. Platform Bootstrap

1. run `rooiam-server` in production mode
2. run `rooiam-admin`
3. open the setup wizard
4. create the first platform owner
5. finish the minimum platform setup

Minimum platform setup means:

- confirm public URLs
- confirm database and Redis are already working
- save SMTP so magic-link emails can send
- save Google / Microsoft later if you want those methods

## 2. Tenant And Workspace Setup

1. run `rooiam-app`
2. register the tenant owner account
3. sign in to `rooiam-app`
4. create a workspace
5. create a workspace app
6. register:
   - `Redirect URIs`
   - `Allowed Embed Origins`
7. generate a workspace API key if you want backend integration

At this point you should copy:

- `workspace_id`
- `workspace_slug`
- `client_id`
- `app_name`

## 3. Run The Examples

### Example 1

Use for:

- minimal hosted widget integration

Needs:

- `workspace_id` or `workspace_slug`
- `client_id`
- `app_name`
- widget base URL

### Example 2

Use for:

- a richer account-style downstream app
- callback handling
- sessions
- passkeys
- MFA
- audit activity

Needs:

- everything from Example 1
- workspace API key if you want the workspace metadata and operator-facing calls to work

Before copying Example 2 into a real app, read:

- [Downstream Hosted Widget Callback Flow](./11_downstream_hosted_widget_callback_flow.md)

### Example 3

Use for:

- backend/API-key integration

Needs:

- workspace API key
- workspace/app values if you want the example to stay contextual to the real app

## 4. Test Order

Recommended order:

1. run Example 1 first
2. confirm the hosted widget loads correctly
3. confirm login returns to the correct callback
4. run Example 2
5. confirm account/session/passkey/MFA flows
6. run Example 3
7. confirm workspace API-key routes work as expected

## 5. Docker Path

If you use Docker:

```bash
docker compose up -d
```

Then set the real example values:

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

## 6. Mental Model

The production-mode example path is:

- platform owner configures the platform in `rooiam-admin`
- tenant owner configures workspace and app in `rooiam-app`
- the examples consume those real workspace/app values
- backend examples additionally use a real workspace API key

That keeps the examples honest:

- they are not special internal shortcuts
- they are real client apps using the same public product surfaces

The callback behavior in Example 2 is the canonical downstream pattern for hosted widget + OIDC:

- widget URL only carries app identity
- the app owns PKCE state
- the app callback page owns authorize redirect, token exchange, and local session creation
