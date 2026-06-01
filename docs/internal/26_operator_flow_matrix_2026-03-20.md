# Operator Flow Matrix — 2026-03-20

This document simulates the real operator and tenant flows across `rooiam-admin` (`5171`) and `rooiam-app` (`5172`).

The goal is to answer:

- does each real-world task have a clear place?
- can the operator find the data they expect?
- do entity links behave naturally?
- what is complete, awkward, or still missing?

Status meanings:

- `Works` = the flow exists and is placed correctly
- `Awkward` = possible, but the UX or navigation is still weaker than it should be
- `Missing` = no proper flow yet

---

## Navigation Rules

These are the current intended interaction rules and should stay consistent:

- person in member-style UI -> person detail
- workspace in workspace-style UI -> workspace detail / overview
- actor in audit logs -> filtered audit history
- app in workspace overview -> app info on that page

This is now mostly correct in both apps.

---

## Platform Owner / Platform Admin (`5171`)

### 1. Sign in to the admin console

- entry: `5171 /login`
- methods: magic link, passkey, provider login, MFA if required
- status: `Works`

Notes:

- admin login policy is managed under `Admin > Access`
- admin operator session policy is managed under `Admin > Session Policy`

### 2. See platform state quickly

- entry: `Platform > Overview`
- expected tasks:
  - check platform activity
  - check own activity
  - see high-level counts
- status: `Works`

Notes:

- overview is now correctly restricted to platform owner/admin

### 3. Manage platform operators

- entry: `Admin > Members`
- expected tasks:
  - open a platform operator
  - grant/revoke platform admin
  - suspend/resume
  - inspect sessions and activity
- status: `Works`

Notes:

- member rows open member detail
- member detail includes platform roles, sessions, memberships, and activity

### 4. Manage tenant operators and tenant-wide people

- entry: `Tenant > Members`
- expected tasks:
  - find tenant owner/admin/user
  - open their profile
  - inspect workspace affiliation
  - inspect tenant audit trail
- status: `Works`

Notes:

- member rows open member detail
- workspace name opens workspace overview

### 5. Control how platform admins log in

- entry: `Admin > Access`
- expected tasks:
  - allow/disable Google
  - allow/disable Microsoft
  - allow/disable passkeys
  - require MFA
- status: `Works`

### 6. Control platform-admin session policy

- entry: `Admin > Session Policy`
- expected tasks:
  - configure session lifetime
  - configure magic-link expiry
  - configure token lifetime
  - configure idle timeout
- status: `Works`

### 7. Control tenant-operator login methods

- entry: `Tenant > Access`
- expected tasks:
  - configure how tenant owners/admins sign into `5172`
- status: `Works`

Notes:

- this is now correctly separated from workspace end-user access

### 8. Control tenant-operator session policy

- entry: `Tenant > Session Policy`
- expected tasks:
  - configure session lifetime
  - configure magic-link expiry
  - configure idle timeout
  - affect tenant operators on `5172`, not end-user workspace sessions
- status: `Works`

### 9. See tenant-wide audit history

- entry: `Tenant > Audit Logs`
- expected tasks:
  - search by actor
  - search by workspace
  - search by IP
  - open workspace from workspace target
  - pivot to actor history
- status: `Works`

Notes:

- current click behavior is natural

### 10. Manage workspaces

- entry: `Tenant Workspace > Workspaces`
- expected tasks:
  - search workspace
  - open workspace overview
  - inspect status and counts
- status: `Works`

### 11. Inspect a workspace deeply

- entry: `Tenant Workspace > Workspaces > workspace detail`
- expected tasks:
  - see owner/admins/users
  - open person detail
  - inspect app list
  - inspect recent activity
  - inspect session policy
- status: `Works`

Notes:

- owner/admin/user names now open member detail
- app list now opens in-page `App Info`

### 12. Manage workspace apps at platform level

- entry: `Tenant Workspace > Apps`
- expected tasks:
  - search by app / owner / client ID / workspace
  - open workspace from scope
  - open owner from owner email
  - rotate secret
  - pause/resume
  - delete
- status: `Works`

### 13. Understand one app fully

- current place:
  - app list row in `Tenant Workspace > Apps`
  - in-page `App Info` inside workspace detail
- status: `Awkward`

Notes:

- the app entity is still weaker than person/workspace
- there is not yet a full dedicated app detail page in admin
- current behavior is acceptable, but not ideal

### 14. Configure workspace rules

- entry: `Tenant Workspace > Rules`
- expected tasks:
  - platform-level workspace governance
- status: `Works`

### 15. View workspace session policy

- entry: `Tenant Workspace > Session Policy`
- expected tasks:
  - inspect workspace-scoped policy
- status: `Works`

Notes:

- currently view-only, which matches the current authority model

### 16. Configure deep platform settings

- entry: `Platform > Settings`
- expected tasks:
  - URLs
  - SMTP
  - Redis
  - storage
  - OAuth providers
- status: `Works`

---

## Tenant Owner / Tenant Admin (`5172`)

### 1. Sign in to tenant portal

- entry: `5172`
- expected tasks:
  - root portal login
  - tenant-admin/operator login
- status: `Works`

Notes:

- this is not the workspace end-user widget

### 2. See current workspace quickly

- entry: `Workspace > Overview`
- expected tasks:
  - see workspace identity
  - see recent audit logs
  - understand security attention and sign-ins
- status: `Works`

### 3. Manage workspace members

- entry: `Workspace > Members`
- expected tasks:
  - search/filter members
  - open member detail
  - invite members
  - change role if allowed
- status: `Works`

### 4. Inspect one member

- entry: workspace member detail
- expected tasks:
  - see role/status
  - see joined date
  - see member audit logs
  - return to member list
- status: `Works`

Notes:

- member detail now also links workspace field back to workspace overview

### 5. Manage workspace apps

- entry: `Workspace > Apps`
- expected tasks:
  - register app
  - rotate secret
  - pause/resume
  - delete
  - inspect redirect URIs and client ID
- status: `Works`

### 6. Understand one workspace app fully

- current place:
  - app cards themselves
- status: `Awkward`

Notes:

- app cards are already fairly info-rich
- there is still no dedicated app detail route
- acceptable for now, but still weaker than member detail

### 7. Configure end-user workspace login/access

- entry: `Workspace > Access`
- expected tasks:
  - login methods
  - MFA requirements
  - email-domain restriction
  - IP policy
- status: `Works`

### 8. Configure login widget / branding

- entry:
  - `Workspace > Branding`
  - `Workspace > Login Widget`
- status: `Works`

### 9. See workspace audit logs

- entry: `Workspace > Audit Logs`
- expected tasks:
  - search
  - actor filter
  - target / IP filter
- status: `Works`

### 10. Switch between workspaces

- entry: `Tenant > Workspaces`
- expected tasks:
  - search workspace
  - open workspace
  - create workspace if allowed
- status: `Works`

### 11. See tenant-wide audit logs

- entry: `Tenant > Audit Logs`
- expected tasks:
  - search across workspaces
  - click workspace to workspace overview
  - click actor to actor audit history
- status: `Works`

### 12. Manage personal account/security

- entry:
  - `My > Profile`
  - `My > Security`
  - `My > Sessions`
  - `My > Audit Logs`
- status: `Works`

---

## Cross-Entity Navigation

### Person

Expected:

- members list -> person detail
- owner/admin list -> person detail
- app owner in admin app list -> person detail
- audit actor -> audit history

Status:

- `Works`

### Workspace

Expected:

- tenant workspace list -> workspace overview
- workspace name in member detail -> workspace overview
- workspace target in audit logs -> workspace overview
- workspace scope in admin app list -> workspace overview

Status:

- `Works`

### App

Expected:

- workspace overview app list -> app info
- app inventory list -> app info/detail

Status:

- `Awkward`

Notes:

- admin has in-page app info in workspace detail and strong list rows
- app portal cards are already detailed
- a full dedicated app detail page is still not present

---

## Real-World Tasks Still Needing Stronger UX

### 1. App detail as a first-class entity

- status: `Missing / Partial`

Needed:

- dedicated app detail page in `rooiam-admin`
- possibly app detail page or app drawer in `rooiam-app`

Reason:

- people and workspaces already have clear detail surfaces
- apps still rely on list rows or cards

### 2. Ownership transfer UX

- status: `Partial`

Notes:

- backend owner transfer exists
- user-facing control-plane UX still needs a clear final workflow surface

### 3. Irreversible admin actions grouping

- status: `Awkward`

Notes:

- destructive actions exist, but the product still needs a stronger “danger zone” doctrine for:
  - workspace deletion/archive
  - ownership transfer
  - last-admin protection
  - app deletion explanation

### 4. “Where do I do this?” discoverability

- status: `Partial`

Notes:

- the system is much better than before
- the remaining confusion risk is around:
  - `Tenant` vs `Tenant Workspace`
  - tenant-operator policy vs workspace end-user policy
  - app info vs app list

---

## Current Assessment

### Strong

- admin and tenant control planes are now mostly split correctly
- entity linking is much more natural
- audit-log behavior is coherent
- role/policy/scope naming is much clearer

### Weakest Remaining Area

- apps are still not treated as strongly as people and workspaces

### Recommendation

Next product-validation pass should focus on:

1. dedicated app detail flow
2. owner transfer UI flow
3. destructive-action grouping / danger-zone pattern
4. one manual role-play pass per role:
   - Platform Owner
   - Platform Admin
   - Tenant Owner
   - Tenant Admin
   - User

