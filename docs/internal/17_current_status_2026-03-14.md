# Current Status — 2026-03-14

This note records the current practical state of the Rooiam codebase after the latest admin/app restructuring, demo-mode cleanup, and Phase 2 server work.

Use this as the short internal status document for:

- current role model
- current navigation/scope model
- what is already completed
- what is intentionally locked or deferred
- what remains next

## Product Direction

Current working direction:

- Rooiam stays a multi-tenant identity platform
- demo mode should be stable, believable, and safe
- `rooiam-admin` and `rooiam-app` should feel like the same product family
- Phase 2 priority is the developer identity platform layer
- do not overbuild breadth before fundamentals are complete

Related doctrine:

- [product_policy.md](../product_policy.md)

## Current Role Model

The current intended role model is now:

Platform:

- `Platform Owner`
- `Platform Admin`

Workspace:

- `Workspace Owner`
- `Workspace Admin`
- `User`

Removed for now:

- `Platform Staff`
- `Workspace Staff`

Reason:

- those extra roles do not yet have a strong enough permission model to justify product complexity

## Current Scope Model

### `rooiam-admin`

The left-nav scope model is now:

- `Platform`
  - `Overview`
  - `Access`
  - `Settings` (owner only)
- `Tenant`
  - `Members`
  - `Workspaces`
  - `Apps`
  - `Audit Logs`
  - `Access`
- `My`
  - `Profile`

Meaning:

- `Platform > Access`
  - how platform operators log into `5171`
- `Tenant > Access`
  - how tenant admins log into `5172`
- `My`
  - personal profile only

Important nuance:

- `Platform Access` still contains personal session/security tabs, but those are now labeled explicitly as:
  - `My Sign-In Methods`
  - `My Linked Accounts`
  - `My Sessions`
  - `My Security`

### `rooiam-app`

The left-nav scope model is now:

- `Workspace`
- `Tenant`
- `My`

Current naming intent:

- `Workspace > Access`
  - end-user/workspace login policy
- `Tenant > Access`
  - tenant-admin/operator access scope
- `My > Access`
  - personal sign-in settings

## Demo Mode Status

### Admin Demo

Current seeded admin demo accounts:

- `owner@rooiam.demo`
- `admin@rooiam.demo`

Current intended meaning:

- `owner@rooiam.demo`
  - `Platform Owner`
- `admin@rooiam.demo`
  - `Platform Admin`

Current admin demo login behavior:

- admin login hint supports both owner and admin demo roles
- hint is compact and no longer repeats long instructions
- MailHog helper stays in the sent/check-inbox state, not in the hint card

Current owner/admin split:

- `Settings`
  - owner only
- `Platform Access`
  - owner and admin
- `Tenant` operational pages
  - owner and admin

Related notes:

- [14_rooiam_admin_demo_validation_2026-03-13.md](./14_rooiam_admin_demo_validation_2026-03-13.md)
- [13_demo_governance.md](./13_demo_governance.md)

### App Demo

Tenant/app demo mode is currently in good working shape:

- root tenant login and workspace login surfaces are separated conceptually
- seeded workspaces, member avatars, and logos render correctly
- workspace overview is cleaner and less redundant than before
- demo locks remain on sensitive areas

Related note:

- [16_rooiam_app_demo_validation_2026-03-14.md](./16_rooiam_app_demo_validation_2026-03-14.md)

## UI System Status

Current UI direction is now more stable than before:

- admin and app use the same general visual language
- page headers are standardized
- section shells are standardized
- overview shells and stat cards are standardized
- pill/badge treatment is standardized
- audit-event colors are standardized

Important rule:

- keep admin/app visually aligned
- do not force overly aggressive shared code between the two apps unless the component is truly simple and presentational

Canonical UI note:

- [15_ui_system_rules.md](./15_ui_system_rules.md)

## Phase 2 Status

Phase 2 target:

- Rooiam as a usable developer identity platform

Server/protocol work that is now in much better shape:

- OIDC authorization code flow
- refresh token grant
- revoke endpoint
- introspection endpoint
- PKCE enforcement for public clients
- client secret rotation
- client pause/resume
- better negative-path API coverage

Still not “fully finished forever,” but practically much stronger:

- core protocol correctness is now good enough to continue into validation and DX

Related docs:

- [phase2_developer_platform_checklist.md](../phase2_developer_platform_checklist.md)
- [phase2_rest_api_test_checklist.md](../phase2_rest_api_test_checklist.md)

## Scalability Status For Admin Lists

The major admin list pages were not safe for `10000+` items before because they fetched full datasets and paginated client-side.

That has now been improved for:

- `Tenant > Members`
- `Tenant > Workspaces`
- `Tenant > Apps`
- `Tenant > Audit Logs`

Current improvements:

- server-side pagination added
- server-side search/filter support added on the main admin list endpoints
- admin apps list switched to a denser table/list pattern

What is still not fully finished in this area:

- `Workspace Detail` sublists still rely on one detail payload and client-side slicing
- server-side sorting is still limited
- apps scope filter options are still derived from loaded data rather than a dedicated metadata endpoint

## Infrastructure Status

Current server storage status:

- the previous `/data` CIFS/network mount failed
- local recovery was performed by unmounting the dead share and recreating:
  - `/data/rooiam`
  - `/data/rooiam/uploads`

Current consequence:

- `rooiam-server` works again
- `/data` is now local on this machine, not the old remote share

MinIO/S3 direction:

- valid future direction
- not implemented yet
- current storage remains filesystem-based

## What Is Done

High-signal completed items:

- demo admin split into owner/admin accounts
- owner-only settings in admin
- admin/app terminology tightened substantially
- admin nav regrouped into `Platform / Tenant / My`
- tenant app nav regrouped into `Workspace / Tenant / My`
- login surface confusion reduced
- admin/apps/member/workspace/audit list scalability started properly
- Phase 2 core server protocol layer improved materially

## What Still Needs Work

### Admin

- make `Platform Access` and `Tenant Access` feel fully parallel in UI and control language
- tighten actual permission boundaries between:
  - `Platform Owner`
  - `Platform Admin`
- decide whether `Workspace Owner` and `Workspace Admin` need any real product-visible permission split yet

### App

- continue clarifying `Tenant Access` vs workspace access model
- keep root portal login, workspace login, and downstream login widget clearly separated in implementation and naming

### Scalability

- add backend pagination for workspace detail sublists
- improve large-list metadata/filter sources
- add server-side sort controls where useful

### Phase 2

- public developer docs
- first integration guide
- first SDK/helper package

## Recommended Next Order

The clean next sequence is:

1. finish admin access-page cleanup
2. tighten role permissions around owner vs admin
3. finish scalable pagination on workspace detail sublists
4. move into Phase 2 developer docs/examples/SDK

That is the best current path without reopening broad UI churn again.
