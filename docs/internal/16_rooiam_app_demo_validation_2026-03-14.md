# Rooiam App Demo Validation — 2026-03-14

This note records the tenant-portal demo validation completed on `rooiam-app` on March 14, 2026.

Scope:

- demo tenant/root login behavior
- workspace-scoped portal behavior
- demo lock behavior in tenant surfaces
- seeded workspace data, assets, and activity visibility
- current tenant/workspace navigation model

Mode under test:

- `ROOIAM_ENABLE_DEMO_SEED=true`

Validated demo accounts:

- `rooroo@sweetfactory.demo`
- `coco@roochoco.demo`
- `minty@mintmallow.demo`

## Confirmed Good

- Root tenant login is usable for the shared workspace owner path
- Workspace-specific login hints are present for seeded demo workspaces
- Shared-owner root login hint now explains how to switch between demo workspaces
- Root tenant login no longer drops a tenant user onto an unhelpful permission error when no active workspace is selected
- Workspace switching belongs under `Tenant > Workspaces` and the current nav grouping is clear:
  - `Workspace`
  - `Tenant`
  - `My`
- `Workspace > Overview` follows the same dashboard philosophy as `rooiam-admin`, but scoped to the selected workspace
- Tenant overview no longer repeats redundant counts and duplicate quick links
- `Members` card on overview shows total members plus `+N new / 24h`
- `Security Attention` is treated as a workspace signal rather than generic filler
- `Recent Workspace Activity` uses the same success / failure / info color semantics as admin audit events
- Workspace member list styling is aligned much more closely with the admin member rows
- Workspace member detail is available from both:
  - overview new-member chips
  - workspace member rows
- Workspace audit logs now show workspace login/auth events correctly
- Workspace logos render correctly in tenant workspace surfaces
- Member avatars render correctly in tenant member surfaces
- Tenant workspace apps use the same padded card direction as admin app items
- `My > Profile` now follows the same profile-card language as `rooiam-admin`
- Demo tenants can change display name and avatar in `My > Profile`
- Demo lock behavior is clear and intentional on tenant surfaces:
  - `Workspace > Access` is locked
  - `Workspace > Members` invites and role changes are locked
  - `Workspace > Apps` create/delete is locked
  - `Workspace > API Keys` create/revoke is locked
  - `Tenant > Workspaces` creation is locked
  - `My > Access` personal sign-in changes are locked

## Demo Expectations Locked By This Pass

- Root tenant login is the stable operator path for tenant owners/admins across multiple workspaces
- Workspace-specific access policy is for end-user/client login behavior, not the primary mental model for shared tenant operators
- Demo tenant mode should remain useful for exploration, but mutating controls must stay locked where they would rewrite durable identity, policy, keys, or workspace topology
- Tenant overview should focus on:
  - selected workspace context
  - member count
  - security attention
  - recent sign-ins/activity
  and avoid redundant navigation shortcuts or repeated counts

## Remaining Manual Tenant Demo Checks

- Google demo sign-in from the tenant surface if intentionally enabled
- Microsoft demo sign-in from the tenant surface if intentionally enabled
- explicit passkey login recheck on the current local stack
- invite acceptance flow outside demo-locked mode
- API key lifecycle outside demo-locked mode
- create/register workspace app flow outside demo-locked mode

## Notes

- Tenant demo validation here is intentionally separate from both:
  - admin demo validation
  - production-mode tenant validation
- Demo convenience must remain gated by demo mode only.
