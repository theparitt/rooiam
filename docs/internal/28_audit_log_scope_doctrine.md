# Audit Log Scope Doctrine

**Date**: 2026-03-20
**Status**: Active

## Purpose

Rooiam has multiple audit-log pages. They must not behave like one giant mixed feed.

The rule is simple:

- each audit-log page must represent one scope only
- the page header must say what that scope includes
- the page header must also make clear what it excludes

This doctrine applies to both:

- `rooiam-admin`
- `rooiam-app`

---

## Scope Model

### 1. Platform Audit Logs

Used in:

- `rooiam-admin > Admin > Audit Logs`

Includes:

- platform owner activity
- platform admin activity
- platform settings changes
- platform-wide security events
- global operator events that are not tenant-only or workspace-only

Excludes:

- tenant-only operator history
- single-workspace detail streams
- personal account-only history

---

### 2. Tenant Audit Logs

Used in:

- `rooiam-admin > Tenant > Audit Logs`
- `rooiam-app > Tenant > Audit Logs`

Includes:

- tenant-wide operator history
- workspace owner activity in `5172`
- workspace admin activity in `5172`
- cross-workspace actions
- tenant-scoped security events
- events that are not limited to one workspace detail stream

Excludes:

- platform-only history
- pure single-workspace detail streams
- personal account-only history

Important:

- tenant audit is the right place for operator sign-ins to `5172`
- tenant audit is the right place for cross-workspace management actions

---

### 3. Workspace Audit Logs

Used in:

- `rooiam-admin > Workspace > Workspaces > Workspace Audit Logs`
- `rooiam-app > Workspace > Audit Logs`

Includes:

- workspace member events
- workspace settings changes
- workspace app events
- workspace-scoped authentication events
- workspace-targeted security events

Excludes:

- tenant-wide operator sign-ins to `5172`
- cross-workspace operator activity
- platform-only history
- personal account-only history

Important:

- workspace audit must stay about that workspace as an entity
- it must not become a general feed for everything a workspace owner/admin does everywhere

Current implementation rule:

- workspace audit is scoped by `audit_logs.organization_id = current workspace`
- raw operator auth rows must not pollute the workspace stream unless they are tied to a real app/workspace event

---

### 4. App Audit Logs

Used in:

- app overview/detail surfaces

Includes:

- app creation
- app secret rotation
- app deletion
- app-specific auth events
- app-specific token and redirect-related events when audited

Excludes:

- unrelated workspace events
- tenant-wide operator history
- platform-only history

Important:

- app audit is narrower than workspace audit
- if an event is clearly about one app, the app detail page is the best home for it

---

### 5. My Audit Logs

Used in:

- `rooiam-admin > My > Audit Logs`
- `rooiam-app > My > Audit Logs`

Includes:

- sign-ins
- MFA changes
- passkey changes
- linked-account changes
- session events
- personal account security events

Excludes:

- tenant-wide history
- workspace-wide history
- platform-wide history

Important:

- this page is personal account history only
- it is not a substitute for tenant or workspace audit pages

---

## Navigation Doctrine

### Actor click behavior

On audit-log pages:

- actor click filters or opens that actor's audit history

It should not jump to normal member detail from an audit row by default.

### Workspace click behavior

On audit-log pages:

- workspace click opens the workspace detail/overview page

### App click behavior

On audit-log pages:

- app click opens the app detail/overview page

---

## UI Wording Doctrine

Every audit-log page should make scope explicit.

Recommended pattern:

- page title = scope + `Audit Logs`
- page description = what the scope includes
- section subtitle = what it excludes or where to look instead

Examples:

- `Workspace Audit Logs`
  - includes workspace members, workspace settings, apps, and workspace-scoped auth events
  - excludes tenant-wide operator sign-ins

- `Tenant Audit Logs`
  - includes workspace owner/admin activity and cross-workspace actions
  - excludes single-workspace detail streams

---

## Product Rules

When deciding where a new event should appear:

1. if the event is platform-governed, put it in platform audit
2. if the event is tenant-operator or cross-workspace, put it in tenant audit
3. if the event is clearly about one workspace entity, put it in workspace audit
4. if the event is clearly about one app, also expose it in app audit
5. if the event is personal-account-only, put it in my audit

If an event fits multiple scopes:

- broader page may include it
- narrower detail page may also include it
- but the narrower page must still remain coherent and not become a general mixed stream

---

## Current UX Goal

Users should be able to answer these questions immediately:

- `What happened across the tenant?`
- `What happened in this workspace?`
- `What happened to this app?`
- `What happened to me?`

If a page cannot answer one of those cleanly, its scope is wrong.
