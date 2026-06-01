# Integration API Contract

This page defines the stable integration contract for Rooiam `0.1`.

The goal is simple:
- keep the public surface small
- keep naming consistent
- make the browser contract different from the server contract where needed

## Hosted Login Widget Contract

The hosted widget is loaded with app identity, not a free callback.

Public widget URL inputs:
- `workspace_id`
- `client_id`
- `app`

What Rooiam does with those:
- verifies the app belongs to the workspace
- verifies the current site is in `Allowed Embed Origins`
- chooses the registered `redirect_uri` whose origin matches the current embedding site
- mints a short-lived `widget_login_context`

What the browser should **not** choose:
- final app callback after login

What the browser should also **not** put on `/login-widget`:
- `redirect_uri`
- `state`
- `code_challenge`
- `code_challenge_method`

## OIDC App Contract

The downstream app contract still uses standard OIDC naming.

Important fields:
- `client_id`
- `redirect_uri`
- `state`
- `code_challenge` / `code_verifier` when applicable

Meaning:
- `redirect_uri` is the app callback registered on the Rooiam app
- this is still correct OIDC terminology

## Workspace Integration API Contract

The stable workspace machine-access surface is:

- `/v1/orgs/integrations/members`
- `/v1/orgs/integrations/invites`
- `/v1/orgs/integrations/clients`
- `/v1/orgs/integrations/workspace`
- `/v1/orgs/integrations/activity`

Auth model:
- workspace API key

Purpose:
- server-to-server workspace management

Not intended for:
- end-user browser sign-in
- downstream app OIDC browser redirects

## Naming Rules

### Keep `redirect_uri`

Use it only for:
- final app callback after login

Do not use it for:
- hosted widget identity
- embed origin
- generic browser return paths

### Keep `widget_login_context`

Use it only for:
- temporary hosted-widget login transaction state

Do not use it for:
- long-lived sessions
- machine API auth
- app registration

### Keep `Allowed Embed Origins` separate from `Redirect URIs`

Reason:
- embed origin answers:
  - which site may load the widget
- redirect URI answers:
  - where the app may receive the final login callback

They often overlap by origin, but they are different controls.

## Multi-Origin App Rule

One app may support multiple sites, but that should be intentional.

If one app supports multiple origins:
- list each callback explicitly
- list each embed origin explicitly
- Rooiam matches current embed origin -> callback origin

Recommended operator rule:
- prefer one app per site or environment when possible

## Contract Freeze For `0.1`

Treat these as stable:
- hosted widget identity inputs:
  - `workspace_id`
  - `client_id`
  - `app`
- final app callback term:
  - `redirect_uri`
- hosted widget transaction term:
  - `widget_login_context`
- machine integration auth term:
  - workspace API key

Changing these casually after `0.1` will create unnecessary migration pain for integrators.

See also:

- [Hosted Widget Integration Guide](./03_hosted_widget_integration_guide.md)
- [Downstream Hosted Widget Callback Flow](./11_downstream_hosted_widget_callback_flow.md)
