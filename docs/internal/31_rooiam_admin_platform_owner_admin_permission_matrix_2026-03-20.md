# Rooiam Admin Platform Owner vs Platform Admin Permission Matrix — 2026-03-20

This document describes the **current implemented behavior** of `rooiam-admin` (`5171`) for the built-in platform roles:

- `Platform Owner`
- `Platform Admin`

This is not a wishlist.
It is meant to answer:

- what can a platform admin see?
- what can a platform admin edit or delete?
- what is still owner-only?
- where does the current implementation still have role overlap?

---

## Scope

This document is only about `rooiam-admin` (`5171`).

It does **not** describe:

- `rooiam-app` (`5172`)
- downstream end-user login/widget behavior on `5173` / `5174`
- future role models not fully implemented in the current admin console

Important current reality:

- `Platform Owner` is `is_platform_owner = true`
- `Platform Admin` is `is_superuser = true`
- both are treated as `platform_staff` for most admin routes
- owner-only surfaces are enforced separately where higher authority is needed

---

## Current Role Baseline

### Platform Owner

Current baseline:

- can enter all normal platform-admin surfaces
- can enter `Platform Settings`
- can change platform-admin login policy
- can grant or revoke `Platform Admin`
- is the highest platform authority in the current control plane

### Platform Admin

Current baseline:

- can enter normal admin-console operational surfaces
- can manage tenant and workspace inventory/governance pages
- can view admin access settings
- cannot change owner-only settings or platform role hierarchy

---

## Owner-only hard guards currently enforced

These are not just UI suggestions.
They are currently enforced as owner-only in route guards, page behavior, or handlers:

- `Platform > Settings`
- editing `Admin > Access`
- granting or revoking `Platform Admin`

In the current codebase, these are the clearest owner-only boundaries inside `5171`.

---

## Summary Rule

Use this rule first:

- `Platform Admin` = can run the control plane
- `Platform Owner` = can run the control plane **and** control platform authority and setup-critical settings

So the real difference is not normal operations.
The real difference is **platform authority ceiling**.

---

## Differences At A Glance

If you only need the real split, read this section first.

### Shared between Platform Owner and Platform Admin

Both can currently do normal control-plane operations such as:

- sign in to `5171`
- use platform overview
- inspect platform members and member detail
- inspect and manage tenant governance pages
- inspect and manage workspace governance pages
- use admin, tenant, and workspace audit surfaces
- use their personal `My` pages

### Owner-only in `5171`

These are the clearest practical differences today:

- open and edit `Platform > Settings`
- edit `Admin > Access`
- grant `Platform Admin`
- revoke `Platform Admin`

### Operational overlap that still exists

Current `Platform Admin` is still a strong role.
It can already manage a large amount of tenant and workspace governance, so the owner-only difference is real but narrower than many products would make it.

---

## Matrix

| Surface / action | Platform Owner | Platform Admin | Notes |
|---|---|---|---|
| Sign in to `5171` admin console | Yes | Yes | Both are valid admin-console operators. |
| Platform Overview | View | View | Both pass the normal platform-staff guard. |
| Platform Settings | Full | No | Route is owner-only. This is the clearest owner-only page in the UI. |
| Public URLs | Edit | No | Lives inside `Platform Settings`. |
| SMTP config | Edit | No | Lives inside `Platform Settings`. |
| Redis config | Edit | No | Lives inside `Platform Settings`. |
| OAuth provider credentials and tests | Edit | No | Lives inside `Platform Settings`. |
| Storage config | Edit | No | Lives inside `Platform Settings`. |
| Workspace rules in settings | Edit | No | Lives inside `Platform Settings`. |
| Linked accounts / personal settings tabs inside Platform Settings | Edit | No | Same owner-only route boundary. |
| Admin Members list | View | View | Both can inspect platform operators. |
| Admin member detail | View | View | Both can inspect operator details. |
| Grant platform admin | Edit | No | Owner-only in UI and handler. |
| Revoke platform admin | Edit | No | Owner-only in UI and handler. |
| Suspend / resume a platform operator | Edit | Edit | Available from member detail unless the target is the platform owner. |
| View Admin Access | View | View | Page is readable by both roles. |
| Edit Admin Access | Edit | No | Page copy and controls explicitly restrict changes to platform owner. |
| View Admin Session Policy | View | View | Both can access the page. |
| Edit Admin Session Policy | Edit | Edit | Current route/page model treats this as normal platform-staff policy management. |
| View Admin Audit Logs | View | View | Both can access admin audit history. |
| My Profile / Account / Security / Sessions / Audit Logs | Edit own / View own | Edit own / View own | Personal surfaces only. |
| Tenant Members list | View | View | Both can inspect tenant-side operators and users. |
| Tenant member detail | View | View | Shared detail surface. |
| Tenant Access | Edit | Edit | Current admin model treats this as normal platform-staff governance. |
| Tenant Session Policy | Edit | Edit | Current admin model treats this as normal platform-staff governance. |
| Tenant Audit Logs | View | View | Both can inspect tenant-wide operator history. |
| Workspace > Workspaces list | View | View | Shared inventory surface. |
| Workspace detail | View | View | Shared detail surface. |
| Workspace-specific member/app links from detail | View | View | Shared navigation surface. |
| Workspace > Apps list | View | View | Shared inventory surface. |
| Workspace app detail | View | View | Shared detail surface. |
| Workspace > Rules | Edit | Edit | Current admin model treats this as normal platform-staff governance. |
| Workspace > Session Policy | Edit | Edit | Current admin model treats this as normal platform-staff governance. |
| Workspace Audit Logs | View | View | Shared workspace-scoped audit surface. |

---

## What This Means In Practice

### A Platform Admin is already a strong role

Current `Platform Admin` is not a lightweight helper role.
It is closer to a real operations role:

- can run the main control-plane inventory pages
- can inspect platform, tenant, and workspace detail surfaces
- can manage tenant access/session policy
- can manage workspace rules/session policy
- can inspect audit history across admin, tenant, and workspace scopes

This is why `Platform Admin` and `Platform Owner` can feel similar in daily usage.

### The real owner-only area is platform authority and setup-critical control

Current owner-only ceiling is:

- `Platform Settings`
- `Admin Access` edits
- grant/revoke platform admin

That is the cleanest actual difference in today’s admin product.

---

## Audit Logging Rule

Role and policy changes should still be visible in audit logs.

Use this doctrine:

### 1. Audit logs are the source of truth

When a platform operator changes platform, tenant, or workspace configuration, the authoritative record should live in audit logs.

That includes things like:

- operator role changes
- access-policy changes
- session-policy changes
- workspace-governance changes
- other platform-controlled configuration updates

### 2. Config pages may still show convenient change attribution

It is still valid to show small inline notes like:

- `Last updated by Alice on 2026-03-20`

But that is a convenience layer only.
It should not replace audit logs.

---

## Current Structural Caveat

The biggest remaining role-model caveat in `5171` is this:

- a `Platform Admin` can already do a large amount of tenant and workspace governance
- the truly owner-only set is still fairly small

So the system does have a real authority split,
but the operational overlap is still large.

That is fine if your intended doctrine is:

- `Platform Admin` = strong platform operator
- `Platform Owner` = final authority

If you later want a sharper split, the next likely owner-only candidates would be:

- some higher-risk tenant governance actions
- some higher-risk workspace governance actions
- setup-critical secrets and signing-key management if exposed more visibly in UI

---

## Recommended Doctrine Going Forward

If you keep the current product direction, the intended long-term rule should be:

- `Platform Admin`
  - can run normal control-plane operations
  - can inspect and manage tenant/workspace governance
  - can use audit, inventory, and operational policy pages

- `Platform Owner`
  - can do everything a platform admin can do
  - plus platform bootstrap/config authority
  - plus platform role hierarchy control
  - plus highest-authority admin login policy control

That keeps `Platform Owner` meaningful without making `Platform Admin` too weak to be useful.
