# Current Status — 2026-03-20

This document supersedes [22_current_status_2026-03-17b.md](./22_current_status_2026-03-17b.md) as the latest practical status note.

It records the current state of the Rooiam control plane and tenant portal after the latest March 20 UX, naming, and operator-flow cleanup pass.

This status note now also includes the current state of the downstream demo app (`rooiam-demo`, `5174`) after the real OIDC demo and end-user self-service pass.

---

## Product Direction

- Rooiam is a multi-tenant identity platform and OIDC provider
- The protocol layer, security architecture, and core control plane are in strong shape
- `rooiam-admin` and `rooiam-app` now share a much more consistent:
  - page naming system
  - route scope model
  - card / save-action pattern
  - clickable entity navigation pattern
- Current work is now less about basic capability and more about:
  - operator discoverability
  - detail-surface completeness
  - maintainable frontend structure

---

## Current Phase Read

- Phase 1–4 foundations remain complete
- Phase 5 (Control Plane Maturity) is substantially advanced
- Phase 6 (Developer Ecosystem) has not started in earnest yet
- The biggest current gaps are no longer protocol bugs; they are product-surface completeness and maintainability

---

## What Changed Today

### Control-Plane UX and Navigation

- `Tenant` and `Tenant Workspace` are now separated more clearly in `rooiam-admin`
- Tenant-wide operator policy now has its own real surface:
  - `Tenant > Session Policy`
- Workspace-scoped policy is now correctly named and separated:
  - `Tenant Workspace > Session Policy`
- Page titles and file names now follow the same scope-first naming rule across both frontends
- Sidebar and page copy now explain scope more clearly:
  - tenant operators vs. workspace end-users
  - tenant governance vs. workspace management

### App Entity Maturity

- Apps are now much closer to a first-class entity
- `rooiam-admin` now has a dedicated app detail page under:
  - `Tenant Workspace > Apps`
- `rooiam-app` now has a stronger app-info surface from the workspace apps area
- App rows, app cards, and workspace app lists now navigate more naturally to app information

### Ownership Transfer and Danger Zones

- Workspace ownership transfer now has a real operator-facing flow in `rooiam-app`
- Danger-zone grouping is now clearer for destructive or irreversible actions
- App deletion now has stronger explanation and grouping
- Workspace danger actions are more clearly separated from normal management actions

### Clickable Entity Pattern

- The interaction pattern is much more consistent now:
  - person in a member-style UI → person detail
  - workspace in a workspace-style UI → workspace detail / overview
  - actor in audit logs → filtered audit history
  - app in app lists → app info / app detail

### Frontend Consistency

- Shared UI primitives were expanded across both frontends:
  - save buttons and save footers
  - tab bars
  - toggle rows
  - inline messages
  - help labels
  - empty states
  - read-only notices
  - form-field wrappers
- High-volume admin inventory pages now use denser defaults more suitable for real operations
- Page-size defaults for large admin list pages are now tuned toward operational use instead of low-volume demos

### Demo App and Hosted Login

- `rooiam-demo` is now a real downstream app surface instead of a fake HTML jump page
- `5174` now:
  - fetches workspace/app branding and auth config from the server
  - embeds the hosted login widget from `5172`
  - runs a real OIDC authorization-code + PKCE flow against `5170`
  - exchanges the code for tokens
  - calls `userinfo`
  - lands on a real downstream app dashboard
- Demo app/workspace identity is now more stable:
  - `workspace_id` is the canonical workspace identity in demo/system-to-system flows
  - `workspace_slug` remains secondary/human-friendly
- Seeded demo app icons now come from the server asset/config path rather than local `5174` assets
- The demo login and dashboard now explain the difference between:
  - hosted widget login
  - downstream app login / redirect / token flow
- The demo now includes an inline API inspector with live GET examples for:
  - widget bootstrap
  - app config
  - userinfo
- `5174` now handles token material more carefully:
  - raw access tokens are no longer shown in the dashboard UI
  - persisted demo state keeps token metadata instead of exposing more token detail than needed

### End-User Self-Service

- `5174` now has a real end-user self-service surface after sign-in
- The downstream app dashboard includes:
  - `Account`
    - display-name editing
    - primary email visibility
    - email-change request
    - linked sign-in-method visibility
  - `Security`
    - passkey registration / removal
    - TOTP MFA enrollment / disable
    - backup code regeneration
  - `Sessions`
    - list active sessions
    - revoke one session
    - revoke all other sessions
  - `Activity`
    - recent personal audit log entries
- This uses existing server endpoints rather than a separate demo-only model:
  - `/identity/me`
  - `/identity/me/profile`
  - `/identity/me/linked-accounts`
  - `/identity/me/email-change/request`
  - `/webauthn/*`
  - `/mfa/*`
  - `/identity/me/sessions*`
  - `/identity/me/audit-logs`

### Demo Workspace Scenarios

- The seeded workspaces now demonstrate meaningfully different end-user auth setups:
  - `RooChoco`
    - passkey enabled
    - MFA optional
    - Google enabled
  - `MintMallow`
    - passkey disabled
    - MFA required
    - Google + Microsoft enabled
  - `MelonHoneyToast`
    - passkey enabled
    - MFA optional
  - `BerryBurger`
    - simple baseline
    - no passkey
    - no required MFA
  - `MooPizza`
    - passkey enabled
    - MFA required
- `5174` now surfaces workspace-specific demo guidance before sign-in and after sign-in so a user can test:
  - magic link
  - social login
  - passkey
  - MFA enrollment
  - sessions
  - personal activity

---

## Current Strengths

### rooiam-server

- OIDC / OAuth2 provider surface is stable
- Health checks are working
- Demo mode is now better controlled:
  - normal demo startup keeps live demo activity
  - destructive reset requires explicit reset intent
- Tenant operator session policy now has a real backend surface
- End-user self-service endpoints are real and reusable:
  - passkeys
  - TOTP MFA
  - sessions
  - personal audit logs

### rooiam-admin

- Naming, routing, and section scope are much clearer than before
- `Platform`, `Admin`, `Tenant`, `Tenant Workspace`, and `My` now read more like intentional product domains
- Member and workspace navigation is much more natural
- App inventory pages are closer to the quality of people/workspace management

### rooiam-app

- Workspace and tenant surfaces now follow clearer scope boundaries
- Personal security pages are cleaner and more maintainable
- Workspace overview and apps/member flows are more natural for real operators
- Ownership transfer now exists as a real visible flow instead of only a backend capability

### rooiam-demo

- The login/demo surface is now much closer to a real downstream app:
  - widget column
  - guide/API column
  - real callback/dashboard handoff
- Demo hints now use end-user accounts instead of workspace owner/admin accounts
- The demo no longer stores seeded app branding assets locally
- The dashboard is now useful for testing the whole end-user auth lifecycle instead of only showing token/debug output
- The dashboard now also covers:
  - profile basics
  - email-change request
  - linked sign-in method visibility
  - recovery guidance

---

## Still Incomplete or Weak

### App Entity Still Not Fully Symmetric Everywhere

- `rooiam-admin` now has a dedicated app detail page
- `rooiam-app` still uses a strong app-info surface rather than a full dedicated app route
- This is acceptable for now, but apps are still slightly weaker than people and workspaces in overall entity design

### Ownership Transfer UX Is Real but Not Yet Polished

- The flow now exists in the UI
- It is still more functional than elegant
- A later pass should make it friendlier and more explicit without weakening the authority model

### Last-Admin Protection Needs Stronger Backend Finality

- The portal now protects some dangerous role changes in the UI
- This should still be enforced as a hard backend invariant where appropriate

### Large Frontend Files Still Exist

- The biggest structural risk now is maintainability, not basic capability
- The most important remaining files to split are:
  - `rooiam-admin/src/pages/PlatformSettings.tsx`
  - `rooiam-app/src/pages/PortalHome.tsx`
  - `rooiam-demo/src/App.tsx`

### End-User Demo Is Real but Not Yet a Full Product

- `5174` is now useful as a real downstream app demo
- It is still intentionally a thin demo shell, not a fully productized customer application
- The remaining work there is mostly:
  - better task grouping / routing inside the dashboard
  - more polished post-login information architecture
  - fuller provider link / unlink demo flow
  - stronger dedicated end-user pages if Rooiam wants to demo a fuller application surface

---

## Recommended Next Order

1. Split the three large frontend files:
   - `PlatformSettings.tsx`
   - `PortalHome.tsx`
   - `rooiam-demo/src/App.tsx`
2. Add a short dedicated internal validation note for the new demo end-user and OIDC flows
3. Extract more feature hooks for:
   - access policy
   - branding
   - workspace apps
   - tenant workspaces
4. Reconcile older docs that still mention pre-rename frontend files and routes
5. Add small regression tests for the critical operator flows:
   - route navigation
   - member click behavior
   - audit-log click behavior
   - access / session-policy save flows
6. Add regression coverage for the new downstream demo flows:
   - callback state handling
   - passkey demo login
   - MFA enrollment handoff
   - self-session revoke
7. Consider code-splitting once the structural cleanup is in better shape

---

## Build and Runtime State

- `SQLX_OFFLINE=true cargo check` passes
- `npm run build` passes in `rooiam-admin`
- `npm run build` passes in `rooiam-app`
- `npm run build` passes in `rooiam-demo`
- `rooiam-server` is running and healthy on `5170`

---

## Bottom Line

Rooiam is now past the stage where the main risk is missing core identity capability.

The main work has shifted to:
- control-plane clarity
- detail-surface completeness
- maintainable frontend structure
- operator confidence in real workflows
- end-user demo realism and full-flow validation

The current system is materially more coherent than it was on March 17, 2026.
