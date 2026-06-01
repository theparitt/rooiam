# Data Flow Doctrine

**Date**: 2026-03-20
**Status**: Active

This note defines how data, pages, and actions should be organized across:

- `rooiam-admin`
- `rooiam-app`

The goal is to stop scope confusion, entity drift, and page-purpose drift.

Use this before adding:

- a new page
- a new list
- a new detail page
- a new action
- a new audit-log surface

---

## Core Rule

Every page must answer these questions clearly:

1. what scope does this page belong to?
2. what entity does this page represent?
3. is this a list page, a detail page, a create page, or a danger page?
4. where is the source of truth for this data?

If those are not obvious, the page is wrong.

---

## Scope Doctrine

Rooiam has five real data scopes:

### 1. Platform

Used for:

- platform operators
- platform settings
- platform-wide security and audit

Should appear in:

- `rooiam-admin`

Should not appear in:

- tenant/workspace pages
- personal pages

### 2. Tenant

Used for:

- tenant operator data
- cross-workspace operator activity
- tenant-wide governance

Should appear in:

- `rooiam-admin > Tenant`
- `rooiam-app > Tenant`

Should not be mixed with:

- one-workspace detail pages

### 3. Workspace

Used for:

- one workspace entity
- workspace members
- workspace apps
- workspace settings
- workspace audit

Should appear in:

- `rooiam-admin > Workspace`
- `rooiam-app > Workspace`

Should not be mixed with:

- tenant-wide cross-workspace history
- personal account history

### 4. App

Used for:

- one app entity
- app info
- app-specific audit
- app lifecycle actions

Should appear in:

- app list -> app detail flow

Should not be reduced to:

- a random list row with no real detail surface

### 5. My

Used for:

- personal account
- personal sessions
- personal security
- personal audit logs

Should never be used for:

- tenant-wide governance
- workspace-wide governance

---

## Page-Type Doctrine

Each page should be one of these:

### 1. List / Inventory Page

Purpose:

- browse
- search
- filter
- sort
- select an entity

Examples:

- members list
- workspaces list
- apps list
- audit log list

Rules:

- list page should not try to be the final detail page
- creation forms should not dominate the inventory page
- item click should open a real detail or scoped view

### 2. Detail / Overview Page

Purpose:

- represent one real entity
- show the main information
- show scoped audit
- show scoped actions

Examples:

- member detail
- workspace detail
- app overview

Rules:

- one page = one entity
- use this page as the hub for that entity
- do not mix unrelated list logic into it

### 3. Create / Invite Page

Purpose:

- complete a creation or invitation task

Examples:

- register app
- create workspace
- invite member

Rules:

- separate from inventory when the form is not tiny
- inventory page can link to it with a button
- success should return naturally to the inventory or new detail page

### 4. Settings / Policy Page

Purpose:

- configure policy or behavior for a scope or entity

Examples:

- admin access
- tenant session policy
- workspace access
- workspace session policy
- branding

Rules:

- page must say what it controls
- page must say what it does not control if confusion is likely

### 5. Danger Page / Danger Zone

Purpose:

- destructive or authority-changing actions

Examples:

- delete app
- transfer ownership
- revoke sensitive credentials

Rules:

- do not bury these in overview pages
- group them clearly
- explain irreversible effects

---

## Entity Flow Doctrine

### Member Flow

Canonical flow:

- invite by email
- accept invite
- join as normal member
- promote later if needed

Rules:

- invite is email-based
- invite does not directly create admin authority
- role elevation is a separate action

### Workspace Flow

Canonical flow:

- workspace list
- workspace detail
- workspace members / apps / audit / settings

Rules:

- workspace list is inventory
- workspace detail is the entity hub

### App Flow

Canonical flow:

- apps list
- register app
- app overview
- app audit
- app lifecycle actions

Rules:

- apps list should stay inventory-first
- register app should be a separate create surface
- app click should go to app overview/detail

### Audit Flow

Canonical flow:

- platform audit
- tenant audit
- workspace audit
- app audit
- my audit

Rules:

- each audit page owns one scope only
- do not mix scopes into one feed
- see `28_audit_log_scope_doctrine.md`

---

## Source-of-Truth Doctrine

The backend must be the real source of truth.

UI should help users before they fail, but must not be the final enforcer.

Use this pattern:

### 1. Server Rule

The backend enforces the real rule.

Examples:

- max apps per workspace
- permission to invite members
- permission to rotate app secrets

### 2. Admin UI or Settings UI

Where the rule is configured.

Examples:

- platform workspace rules
- tenant session policy
- workspace access policy

### 3. Portal Enforcement / UX Hint

The frontend explains and prevents obvious misuse early.

Examples:

- disable register button when workspace app limit is reached
- show invitation permissions
- show read-only state

### 4. User-Facing Error

If the backend rejects the action, the error must be clear.

Rules:

- never rely on UI only
- never hide the real backend rule

---

## Navigation Doctrine

Navigation should follow the entity.

### Person

- member list click -> person detail
- audit actor click -> actor audit history

### Workspace

- workspace list click -> workspace detail
- workspace label in detail lists -> workspace detail

### App

- app list click -> app overview/detail

### Audit

- audit page stays inside audit intent
- do not mix audit clicks with normal profile navigation unless the click target is not the actor

---

## UI Scope Doctrine

Short labels are fine in the UI.

But the meaning must still be explicit somewhere:

- page title
- page description
- section subtitle
- tooltip / hint

Examples:

- `Workspace`
  - short label is okay
  - hint must explain this means tenant workspaces in admin context

- `Workspace Settings`
  - short label is okay
  - page copy must explain whether the setting affects:
    - tenant operators
    - workspace end users
    - one workspace entity

---

## Anti-Patterns

Do not do these:

- one page that is half inventory and half unrelated creation flow
- workspace audit page showing tenant-wide operator history
- invite action that silently creates admin authority
- page title saying one scope while file/path/data mean another scope
- entity list row with no real detail surface
- danger actions inside overview pages without a danger zone

---

## Review Checklist

Before shipping a new page or feature, verify:

1. scope is clear
2. entity is clear
3. page type is clear
4. source of truth is backend-enforced
5. click behavior matches entity type
6. audit scope is correct
7. destructive actions are grouped correctly

If any answer is unclear, the flow should be revised before more code is added.
