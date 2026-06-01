# Rooiam App Owner vs Admin Permission Matrix — 2026-03-20

This document describes the **current implemented behavior** of `rooiam-app` (`5172`) for the built-in workspace roles:

- `owner`
- `admin`

This is not a generic product wishlist. It is meant to answer:

- what can a workspace admin see?
- what can a workspace admin edit or delete?
- what is still owner-only?
- where does the current implementation still have structural overlap?

---

## Scope

This document is only about `rooiam-app` (`5172`).

It does **not** describe:

- `rooiam-admin` (`5171`)
- downstream end-user login/widget behavior on `5173` / `5174`
- future tenant-wide admin models that are not fully implemented in `5172`

Important current reality:

- `5172` currently operates on **workspace operator roles**
- the meaningful built-in comparison in code today is `owner` vs `admin`
- a distinct tenant-wide admin authority model is still not fully separated inside `5172`

---

## Current Role Baseline

### Workspace Owner

Current baseline:

- has all normal admin/operator capabilities
- can do owner-only actions enforced separately in handlers and portal UX

### Workspace Admin

Current baseline from seeded system-role permissions:

- `org:update`
- `branding:manage`
- `auth_policy:manage`
- `activity:read`
- `members:read`
- `members:invite`
- `members:remove`
- `roles:manage`

This makes the current built-in `admin` role a strong operational role.

### Permission verb meanings

These permission codes use short action verbs.
The important meanings are:

- `read`
  - can view/list/detail
  - does not imply create, edit, or delete

- `invite`
  - can create an invitation flow for a person to join
  - narrower than full member management

- `remove`
  - can remove or revoke access from the target scope
  - usually destructive compared with `read`

- `update`
  - can change an existing object or operate its lifecycle
  - in current workspace app flows this often includes:
  - edit settings
  - rotate secrets
  - suspend / resume
  - delete in the same managed scope

- `manage`
  - broader than `update`
  - usually means control the full settings/policy surface for that domain
  - for example:
  - `branding:manage`
  - `auth_policy:manage`
  - `roles:manage`

So, in plain language:

- `org:update` = operate the workspace-level object and its managed resources
- `branding:manage` = control workspace branding and widget presentation
- `auth_policy:manage` = control workspace login/access/session rules in the current model
- `activity:read` = view audit/activity history
- `members:read` = view members
- `members:invite` = invite members
- `members:remove` = remove members
- `roles:manage` = change workspace roles

### Owner-only hard guards currently enforced

These are not just “better UX”. They are currently enforced as owner-only in the product model:

- workspace ownership transfer initiation
- workspace lifecycle status change in `Danger Zone`
- `Tenant > Access` editing in `5172`

---

## Summary Rule

Use this rule first:

- `Workspace Admin` = can run the workspace
- `Workspace Owner` = can run the workspace **and** do ownership / higher-authority actions

So the real difference is not ordinary operation.
The real difference is **authority ceiling**.

---

## Differences At A Glance

If you only need the real split, read this section first.

### Shared between Workspace Owner and Workspace Admin

Both can currently do normal workspace operations such as:

- view the workspace operator portal
- manage members and invitations
- manage roles
- manage workspace access and session policy
- manage branding and login widget settings
- manage apps
- manage workspace API keys
- view workspace and tenant-scoped audit history available to that workspace operator

### Owner-only in `5172`

These are the clearest practical differences today:

- edit `Tenant > Access`
- initiate workspace ownership transfer
- suspend or resume the workspace from `Workspace Danger Zone`
- use the full danger-zone authority surface

### Not available to either role in `5172`

- delete workspace from the portal
- use a true tenant-wide admin role model that is fully separate from workspace roles

---

## Matrix

| Surface / action | Workspace Owner | Workspace Admin | Notes |
|---|---|---|---|
| Root login on `5172` | Yes | Yes | Both are valid operator roles for the portal. |
| Workspace-specific login on `5172` | Yes | Yes | Both can enter if they operate that workspace. |
| Workspace overview | View | View | Overview is informational. |
| Members list | View | View | Backed by `members:read`. |
| Member detail | View | View | Includes profile + recent activity if allowed. |
| Member audit activity | View | View | Backed by `activity:read`. |
| Invite member | Create | Create | Backed by `members:invite`. |
| Resend invitation | Edit | Edit | Same invite-management flow. |
| Revoke invitation | Delete | Delete | Same invite-management flow. |
| Change member role | Edit | Edit | Backed by `roles:manage`. |
| Remove member | Partial | Partial | Backend permission exists; portal lifecycle surface is still weaker than it should be. |
| Workspace access | Edit | Edit | Backed by `auth_policy:manage`. |
| Workspace session policy | Edit | Edit | Same auth-policy authority path. |
| Workspace branding | Edit | Edit | Backed by `branding:manage`. |
| Workspace login widget | Edit | Edit | Same branding authority path. |
| Workspace apps list | View | View | App inventory surface. |
| Register app | Create | Create | Backed by `org:update`. |
| App overview | View | View | Includes app info and app audit. |
| Rotate app secret | Edit | Edit | Backed by `org:update`. |
| Suspend / resume app | Edit | Edit | Backed by `org:update`. |
| Delete app | Delete | Delete | Backed by `org:update`. |
| Workspace API keys list | View | View | Backed by `org:update`. |
| Create workspace API key | Create | Create | Backed by `org:update`. |
| Revoke workspace API key | Delete | Delete | Backed by `org:update`. |
| Workspace audit logs | View | View | Backed by `activity:read`. |
| Tenant > Workspaces | View | View | Both can see the workspaces they operate. |
| Tenant > Audit Logs | View | View | Both can see tenant-scoped operator history if they have activity access. |
| Tenant > Access | Edit | No | In current portal model this is owner-only. The nav is hidden for admins and direct access is read-only. |
| Workspace Danger Zone page | Full | Limited | Owner gets the real control surface. Admin is not treated as a normal operator for danger actions there. |
| Initiate ownership transfer | Edit | No | Owner-only by server and UI. |
| Accept ownership transfer | If targeted | If targeted | Acceptance is token-target based, not role-based. |
| Suspend / resume workspace | Edit | No | Owner-only by server and UI. |
| Delete workspace from `5172` | No | No | Not exposed in `rooiam-app`. |
| My Profile | Edit own | Edit own | Personal only. |
| My Account | Edit own | Edit own | Personal only. |
| My Security | Edit own | Edit own | Personal only. |
| My Sessions | Edit own | Edit own | Personal only. |
| My Audit Logs | View own | View own | Personal only. |

---

## What This Means In Practice

### A Workspace Admin can currently do a lot

Current `admin` is not a weak helper role.
It is closer to an operations manager role:

- can manage members
- can manage roles
- can manage branding
- can manage workspace sign-in policy
- can manage apps
- can manage workspace API keys
- can read audit logs

This is why `Workspace Admin` and `Workspace Owner` can feel similar in daily usage.

### The real owner-only area is authority transfer and lifecycle control

Current owner-only ceiling is:

- tenant access policy in `5172`
- ownership transfer
- workspace suspend / resume

That is the cleanest actual difference in today’s product.

---

## Audit Logging Rule

Changes should be visible in two ways:

### 1. Audit logs are the source of truth

The following are written into audit logs today:

- workspace auth-policy updates
- workspace auth-policy snapshot restores
- workspace API key create / revoke
- workspace ownership transfer initiated / accepted
- workspace lifecycle status update

### 2. Config pages can show the latest matching change inline

The portal now shows a small `Last Change` note on relevant config pages.

That is **not** a second history system.
It is just a convenience view over the same audit stream.

---

## Current Structural Caveat

The biggest remaining model problem in `5172` is this:

- `Tenant > Access`
- `Workspace > Access`
- `Workspace > Session Policy`

still share the same underlying auth-policy object in the current implementation.

So while the portal now treats `Tenant > Access` as owner-only in UX and role flow, the data model is not yet fully split into:

- tenant-operator access policy
- workspace end-user access policy
- workspace end-user session policy

This means the permission matrix above is the **current operational behavior**, but the model is still not as clean as the final doctrine should be.

---

## Recommended Doctrine Going Forward

If you keep the current product direction, the intended long-term rule should be:

- `Workspace Admin`
  - can manage normal workspace operations
  - can manage apps, members, branding, access, and audit

- `Workspace Owner`
  - can do everything an admin can do
  - plus ownership, lifecycle, and highest-authority workspace controls

And if a true tenant-wide admin role is later made first-class inside `5172`, it should be documented separately rather than overloaded into the workspace admin matrix.
