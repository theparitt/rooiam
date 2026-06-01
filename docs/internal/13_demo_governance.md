# Demo Governance

This note defines how demo mode should behave across `rooiam-admin` and `rooiam-app`.

## Rule

Demo mode should stay useful for product exploration, but it must not let visitors rewrite real deployment, security, or durable identity state.

Use this split:

- `demo-editable`
  - branding and visual preview
  - navigation, filtering, search, pagination
  - safe test actions that stay inside demo infrastructure
- `demo-locked`
  - infrastructure settings
  - secrets and provider credentials
  - security and access policy changes
  - durable identity changes
  - API keys
  - member invites and role changes
  - app creation or deletion
  - workspace creation

## UX Rule

When a screen is locked in demo mode:

- keep the page readable
- disable the mutating controls
- show a short inline reason near the controls
- explain what fixed demo behavior is being used instead
- still allow safe test actions only when they stay inside the demo environment

Do not silently no-op a mutation without telling the user why.

## Current Demo Policy

### `rooiam-admin`

- `Settings > Email / SMTP`
  - locked to MailHog
  - test email remains enabled
- `Settings > Redis`
  - locked to demo Redis
  - connection test remains enabled
- `Settings > Public URLs`
  - locked
- `Settings > OAuth Providers`
  - locked
- `Settings > Workspace`
  - locked
- `Access`
  - locked
- `Apps`
  - create locked
- `Linked Accounts`
  - link/unlink locked
- `Sign-In Methods`
  - provider toggles, passkeys, and TOTP changes locked

### `rooiam-app`

- `Workspace > Branding`
  - editable in demo
- `Workspace > Login Widget`
  - readable in demo
- `Workspace > Members`
  - invite and role changes locked
- `Workspace > Access`
  - policy, IP, and advanced credentials locked
- `Workspace > Apps`
  - create/delete locked
- `Workspace > API Keys`
  - create/revoke locked
- `Tenant > Workspaces`
  - workspace creation locked
- `Tenant > Access`
  - readable guidance only in demo
- `My > Profile`
  - editable in demo
- `My > Access`
  - passkey, TOTP, and provider linking locked

## Terminology

Use these words consistently in demo notices too:

- `Workspace`
- `App`
- `Login`
- `Members`
- `Admins`
- `Users`

Do not switch to alternate wording like `tenant users`, `staff`, or `end users` in demo-only UI.
