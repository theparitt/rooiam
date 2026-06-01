# Auth Models By Surface

Rooiam has multiple auth surfaces. They are related, but they are not the same contract.

This page is the short operator and integrator map for `0.1`.

## The Four Surfaces

### 1. Human Session

Used by:
- `rooiam-app`
- `rooiam-admin`
- hosted login widget flows

Purpose:
- sign a real person into Rooiam
- create a browser session
- let that person manage workspaces, branding, apps, members, and policies

Typical methods:
- magic link
- passkey
- Google
- Microsoft

Key point:
- this is passwordless by design

### 2. OIDC App

Used by:
- downstream apps that want Rooiam to act as their identity provider

Purpose:
- let a downstream app send the user to Rooiam
- let Rooiam authenticate that user
- return the browser to the app's registered `redirect_uri`

Key point:
- the app callback is the app's registered `redirect_uri`
- the browser should not choose that callback freely

### 3. Workspace API Key

Used by:
- backend integrations
- automation
- server-to-server workspace management

Purpose:
- call workspace integration endpoints without a browser session
- manage members, invites, apps, branding, and other workspace-scoped resources

Key point:
- this is not a human browser sign-in
- one workspace API key can affect multiple apps inside the same workspace

### 4. Tenant / Platform Key

Status:
- later surface, not the main `0.1` contract

Purpose:
- future platform-wide or tenant-wide machine access

Key point:
- keep this separate from workspace API keys

## Stable Naming

These terms should stay consistent across code, docs, UI, and support notes.

### `widget_login_context`

Meaning:
- temporary hosted-widget login transaction

Used for:
- binding the current hosted widget session to:
  - workspace
  - app / client
  - embed origin
  - resolved app callback

Not used for:
- final app callback
- long-lived browser sessions

### `redirect_uri`

Meaning:
- final app callback after login

Used for:
- OIDC app registration
- final browser handoff back to the downstream app

Not used for:
- identifying the hosted widget
- identifying the embedding site

### `post_logout_redirect_uri`

Meaning:
- final app callback after logout

Used for:
- app-directed logout return flow

## Hosted Widget vs OIDC App

These are easy to mix up, so keep the split clear:

- hosted login widget:
  - sign-in surface
  - rendered by Rooiam
  - identified by workspace app identity
  - protected by allowed embed origins

- OIDC app flow:
  - downstream app authorization flow
  - returns to the app's registered `redirect_uri`

The hosted widget may participate in an OIDC app flow, but they are not the same contract.

## Practical Rule

When deciding which auth model applies, ask:

1. Is a real person signing into Rooiam in the browser?
   - use the human session model
2. Is a downstream app asking Rooiam to authenticate a user?
   - use the OIDC app model
3. Is a backend integration calling workspace management endpoints?
   - use the workspace API key model

That split should remain stable through `1.0`.
