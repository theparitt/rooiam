# Phase 4 Tenant Admin Checklist

This checklist tracks the work needed to turn Rooiam from a shared instance-level auth system into a real tenant-facing B2B product.

Phase 4 focus:

- `rooiam-admin` = platform/operator console
- `rooiam-app` = tenant auth and tenant-admin portal
- tenant/company branding and login policy

## Phase 4 Execution Plan

### Phase 4A: Tenant Portal Foundation

- [x] tenant portal shell in `rooiam-app`
- [x] tenant onboarding / create workspace flow
- [x] workspace switching
- [x] company branding editor
- [x] company login preview page
- [x] company login widget style controls
- [x] clean split between operator admin and tenant portal in docs

### Phase 4B: Company Admin Controls

- [x] company sign-in method toggles
- [x] company member list
- [x] company invite flow
- [x] company role switching
- [x] company activity view
- [x] company OAuth clients
- [x] company API keys
- [x] company-scoped roles beyond the current basic role switching
- [x] company MFA requirement policy

### Phase 4C: Multi-Tenant Context And Isolation

- [x] login preserves workspace/company intent
- [x] login preserves app/client intent
- [x] post-login redirect respects tenant/company context
- [x] session and audit views show `user + app + workspace`
- [x] tenant-scoped API access fully matches what tenant admins can do in UI
- [x] validation that one tenant cannot see or affect another tenant

### Phase 4D: Tenant UX Cleanup

- [x] remove remaining duplicated onboarding/layout paths
- [x] extract shared tenant shell/components from `PortalHome.tsx`
- [x] reuse admin-like card/header components consistently in tenant pages
- [x] tighten empty/loading/error states
- [x] validate final tenant portal flow before handing off to `rooiam-demo`

## Product Model

- [x] `rooiam-admin` wording and docs clearly describe operator/system admin only
- [x] `rooiam-app` wording and docs clearly describe tenant/company auth portal
- [x] `rooiam-demo` is described as the downstream customer-facing app

## Tenant Identity Boundary

- [x] tenant admins can only see their own company data
- [x] tenant admins cannot access system-wide users, workspaces, or infrastructure settings
- [x] tenant admins have a dedicated company-scoped role model
- [x] tenant admins can see company member roles
- [x] tenant admins with `roles:manage` can switch members between the available company roles
- [x] company-scoped auth settings are separated from instance-wide settings

## Branding

- [x] tenant/company display name
- [x] tenant/company logo
- [x] tenant/company brand color
- [x] tenant/company login title and subtitle
- [x] tenant/company widget radius and shadow style
- [x] tenant/company login method order
- [x] branded login screen in `rooiam-app`
- [x] fallback to instance defaults when tenant branding is not set

## Auth Policy

- [ ] client/app-level allowed methods
  - [x] magic link
  - [x] Google
  - [x] Microsoft
  - [x] passkey
  - [x] MFA requirement
- [x] tenant/company policy uses platform defaults for provider credentials and email infrastructure
- [ ] clear inheritance model:
  - [x] instance defaults
  - [ ] client overrides

## Tenant Admin UI

- [x] company branding page in `rooiam-app`
- [x] live company login widget preview in `rooiam-app`
- [x] company auth-method policy page in `rooiam-app`
- [x] company member visibility appropriate for tenant admins
- [x] company invite flow from `rooiam-app`
- [x] company activity view in `rooiam-app`
- [x] company role catalog in `rooiam-app`
- [x] tenant navbar is organized around real company-admin tasks
- [x] no system-wide controls visible in tenant UI
- [x] raw OAuth / SMTP credential editing is not exposed in tenant UI by default

## Context Carrying

- [x] login can preserve company/workspace intent
- [x] login can preserve client/app intent
- [x] post-login redirect respects tenant/company context
- [x] session and audit views can show user + app + workspace context
- [x] tenant-scoped API access matches what tenant admins can see in `rooiam-app`

Reference:
- [client_workspace_context.md](/home/theparitt/work/rooiam/docs/client_workspace_context.md)
- [tenant_ui_plan.md](/home/theparitt/work/rooiam/docs/tenant_ui_plan.md)

## Validation

- [x] tenant admin can customize only their own company login
- [x] another company does not see those customizations
- [x] tenant admin changes do not affect operator/system console
- [x] branded login flows are validated in `rooiam-demo`
- [ ] tenant/company login works with chosen methods only across all supported methods on the current live stack
- [ ] tenant credential override flows are validated once tenant UI for custom credentials lands
- [ ] tenant isolation regression checks are repeated after major auth changes

## Completion Rule

Phase 4 is complete when:

- Rooiam supports tenant/company-specific branding and auth policy
- tenant admins manage only their own company-facing auth
- tenant admins rely on platform-managed provider/email infrastructure by default
- operator/system admin remains separate and global
- `rooiam-app` clearly acts as the tenant portal rather than a generic shared login shell

Current status:

- 4A is complete
- 4A includes tenant-controlled login styling: title, subtitle, color, logo, method order, radius, and shadow
- 4B is complete
- 4C is complete
- 4D is complete
- follow-on tenant additions now belong to Phase 8 product hardening, not Phase 4 completion
