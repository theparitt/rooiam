# Rooiam Demo OIDC And End-User State — 2026-03-20

This note records the current practical state of `rooiam-demo` (`5174`) after the hosted-login, real OIDC, and end-user self-service pass.

It is narrower than the full current-status note. Use this page when you want to answer:

- what `5174` is supposed to be
- what it now demonstrates correctly
- what the seeded workspaces are meant to prove
- what is still thin or intentionally demo-only

---

## Current Demo Model

`5174` is now a downstream app demo, not a fake redirect shell.

The runtime split is:

- `5170`
  - identity server
  - OIDC provider
  - source of truth for widget/app config and assets
- `5172`
  - hosted login UI for workspace/app sign-in
  - operator-managed branding and login experience
- `5174`
  - downstream app UI
  - embeds the hosted login
  - completes the OIDC callback
  - displays the post-login app experience

The source of truth remains server-side:

- widget branding
- auth-method availability
- app config
- workspace/app icons
- OIDC endpoints
- passkeys
- MFA
- sessions
- personal audit logs

`5174` should not own those things locally.

---

## What Works Now

### Hosted Login + App Redirect

- `5174` fetches real app config from the server
- `5174` builds a real OIDC authorization request with PKCE
- the hosted login is embedded from `5172`
- `5170` handles:
  - authorize
  - token
  - userinfo
- after sign-in, `5174` lands on a real downstream app dashboard

### Safer Demo Token Handling

- the demo no longer exposes raw access-token values in the dashboard UI
- persisted demo session state now keeps:
  - app/workspace summary
  - callback summary
  - token metadata
- the raw access token is only kept for the current dashboard tab when needed for the live `userinfo` demo request

This is still a demo, but it is less careless with token material than before.

### Stable Demo Identity

- `workspace_id` is now the canonical demo workspace identity
- `workspace_slug` remains secondary / human-friendly
- app identity is still the OIDC app/client identity underneath

### End-User Demo Identities

`5174` now uses end-user demo accounts, not workspace owner/admin accounts.

Current seeded demo users:

- `RooChoco` → `minmin@lovechocolate.user`
- `MintMallow` → `lulu@softmallow.user`
- `MelonHoneyToast` → `sunny@toastgarden.user`
- `BerryBurger` → `poppy@jamdiner.user`
- `MooPizza` → `mozza@cheesetown.user`

These are intentionally easy to spot in:

- audit logs
- session lists
- callback testing
- MailHog / login debugging

### End-User Self-Service

The signed-in dashboard in `5174` now includes:

- `Account`
  - display-name editing
  - primary email visibility
  - email-change request
  - linked sign-in method visibility
- `Security`
  - passkey registration
  - passkey removal
  - TOTP MFA setup
  - TOTP disable
  - backup-code regeneration
- `Sessions`
  - list active sessions
  - revoke one session
  - revoke all other sessions
- `Activity`
  - recent personal audit events

This uses the real existing server endpoints:

- `/identity/me`
- `/identity/me/profile`
- `/identity/me/linked-accounts`
- `/identity/me/email-change/request`
- `/webauthn/passkeys`
- `/webauthn/register/start`
- `/webauthn/register/finish`
- `/mfa/status`
- `/mfa/totp/start`
- `/mfa/totp/finish`
- `/mfa/recovery-codes/regenerate`
- `/identity/me/sessions`
- `/identity/me/sessions/revoke-all`
- `/identity/me/audit-logs`

### API Visibility

The demo now exposes the system more clearly:

- inline API inspector
- live widget bootstrap request
- live app-config request
- live userinfo request after sign-in

This helps demonstrate:

- hosted widget bootstrap
- app config
- OIDC flow shape
- the difference between widget login and app login

---

## Workspace Scenarios

The seeded workspaces are now intentionally different.

### RooChoco

- passkey enabled
- MFA optional
- Google enabled

Use this workspace to test:

- standard magic-link sign-in
- optional passkey adoption
- post-login passkey registration

### MintMallow

- passkey disabled
- MFA required
- Google + Microsoft enabled

Use this workspace to test:

- MFA-required sign-in
- MFA enrollment during login
- backup-code generation after login

### MelonHoneyToast

- passkey enabled
- MFA optional

Use this workspace to test:

- clean end-user passkey setup
- simple downstream-app sign-in with optional stronger auth

### BerryBurger

- no passkey
- no required MFA
- simple login surface

Use this workspace to test:

- baseline hosted login
- magic-link/social comparison
- user-driven self-service MFA after login even when not required

### MooPizza

- passkey enabled
- MFA required
- stronger auth posture

Use this workspace to test:

- strongest end-to-end demo path
- MFA-required sign-in
- passkey + MFA coexistence

---

## Current UX Shape

Before sign-in:

- left column = hosted login widget
- right column = hint, demo guide, API examples

After sign-in:

- app dashboard
- OIDC/session summary
- account basics and linked sign-in methods
- self-service security/session/activity tools
- recovery guidance

On smaller screens:

- the right guide/API rail is hidden by default
- user can toggle it open

This keeps:

- the widget visually clean
- the technical explanation visible but separate

---

## What Still Remains Weak

### `rooiam-demo/src/App.tsx` is Too Large

The demo behavior is much better, but the implementation is now concentrated in one large file.

This should eventually split into:

- landing page
- callback page
- dashboard page
- self-service components
- API inspector components

### Dashboard Is Still Demo-Oriented

The post-login screen is now useful, but it is still a demo dashboard, not a fully productized downstream app.

That is fine for now.

The next improvement would be:

- clearer route separation inside `5174`
- more intentional page grouping for:
  - overview
  - account
  - security
  - sessions
  - activity

### Linked Provider Management Is Still Thin

- the dashboard now shows linked sign-in methods clearly
- full end-user provider link / unlink actions are still not a polished demo flow yet
- that is the next obvious account-surface improvement if Rooiam wants a fuller self-service demo

### Browser/Device Passkey Variance

Passkey support depends on:

- browser support
- platform authenticator availability
- WebAuthn JSON helpers

So the demo is now real, but passkey behavior still depends on the environment running it.

---

## Bottom Line

`5174` is now good enough to test the actual system, not just present a mock.

It now proves:

- hosted login configuration from the control plane
- real OIDC redirect and token flow
- workspace-specific login differences
- end-user self-service after sign-in
- personal session and activity visibility

The remaining work is mostly:

- code structure
- dashboard polish
- stronger dedicated end-user app routing if Rooiam wants a fuller product demo
