# UI System Rules

This note locks the current UI system for `rooiam-admin` and `rooiam-app` so page layouts and component styling do not drift again.

Use this as the internal source of truth for:

- page width
- page header structure
- section card structure
- overview card patterns
- pills and status badges
- audit event styling
- naming consistency across sidebar, page title, and section title

For file and module naming, also follow:

- [Frontend File Naming And Modules](./25_frontend_file_naming_and_modules.md)

## Core Rule

`rooiam-admin` and `rooiam-app` are separate surfaces, but they should feel like the same product family.

That means:

- same layout rhythm
- same card shell language
- same badge language
- same audit-event color semantics
- same spacing philosophy

Only the information scope should differ:

- `rooiam-admin` = platform scope
- `rooiam-app` = tenant/workspace scope

## Layout Width

Default content pages should use the shared shell width.

Do:

- let the page content fill the normal app content area
- use inner `max-w-*` only for small forms or narrow content inside a page

Do not:

- wrap an entire normal page in `max-w-lg` or `max-w-2xl`
- create a one-off narrower page shell unless the page is intentionally form-centric

Valid narrow exceptions:

- small setup forms
- profile forms
- auth/bootstrap screens

Normal admin and tenant pages should visually align on the same left edge.

## Page Headers

Use the shared page-header pattern instead of ad hoc top titles.

Admin:

- [PageHeader.tsx](/home/theparitt/work/rooiam/rooiam-admin/src/components/ui/PageHeader.tsx)

Rules:

- title uses the main large page-title scale
- subtitle stays short and calm
- actions, if any, stay on the right

Page-title wording must match the left nav scope.

Examples:

- `Workspace > Branding` -> `Workspace Branding`
- `Workspace > Audit Logs` -> `Workspace Audit Logs`
- `My > Profile` -> `My Profile`
- `Tenant > Workspaces` -> `Tenant Workspaces`

Do not let navbar label and page title drift into different terminology unless there is a clear product reason.

## Section Cards

Use the shared section-card shell for normal page sections.

Tenant:

- [PortalSectionCard.tsx](/home/theparitt/work/rooiam/rooiam-app/src/components/portal/PortalSectionCard.tsx)
- [PortalSectionHeader.tsx](/home/theparitt/work/rooiam/rooiam-app/src/components/portal/PortalSectionHeader.tsx)

Admin:

- [SectionHeader.tsx](/home/theparitt/work/rooiam/rooiam-admin/src/components/ui/SectionHeader.tsx)

Rules:

- rounded large shell
- padded header band
- subtle border and muted header background
- icon chip on the left
- optional action or badge on the right
- subtitle should stay one line if possible

Subtitle rule:

- keep subtitle short enough to fit one line on normal desktop width
- shorten copy first
- truncation is only a fallback, not the main design solution

## Overview Cards

Overview uses two card sizes:

- top KPI cards
- large overview panels

Shared patterns already exist and should be reused.

Admin:

- [OverviewStatCard.tsx](/home/theparitt/work/rooiam/rooiam-admin/src/components/ui/OverviewStatCard.tsx)
- [OverviewInfoCard.tsx](/home/theparitt/work/rooiam/rooiam-admin/src/components/ui/OverviewInfoCard.tsx)
- [OverviewPanel.tsx](/home/theparitt/work/rooiam/rooiam-admin/src/components/ui/OverviewPanel.tsx)

Tenant:

- [PortalOverviewStatCard.tsx](/home/theparitt/work/rooiam/rooiam-app/src/components/portal/PortalOverviewStatCard.tsx)
- [PortalOverviewInfoCard.tsx](/home/theparitt/work/rooiam/rooiam-app/src/components/portal/PortalOverviewInfoCard.tsx)
- [PortalOverviewPanel.tsx](/home/theparitt/work/rooiam/rooiam-app/src/components/portal/PortalOverviewPanel.tsx)

Rules:

- use the shared components instead of custom JSX blocks
- admin and tenant overview panels should use the same visual shell
- differences should come from data and scope, not from arbitrary styling drift

Top KPI cards should show fast, high-signal information only.

Do not use top KPI cards for:

- redundant links
- repeated counts already shown again below
- vague labels that require explanation

## Pills And Status Badges

Use shared pill components instead of retyping badge classes.

Admin:

- [Pill.tsx](/home/theparitt/work/rooiam/rooiam-admin/src/components/ui/Pill.tsx)

Tenant:

- [PortalPill.tsx](/home/theparitt/work/rooiam/rooiam-app/src/components/portal/PortalPill.tsx)

Rules:

- `green` = active / success / healthy
- `amber` = paused / warning / needs caution
- `blue` or `sky` = neutral role/info state
- `purple` = elevated platform-level state when needed
- `gray` = passive / default / empty

Do not hand-roll one-off badge colors when an existing pill tone already fits.

### Workspace Role Pills

Workspace role pills must stay consistent across `rooiam-admin` and `rooiam-app`.

Shared role-pill helpers:

Admin:

- [WorkspaceRolePill.tsx](/home/theparitt/work/rooiam/rooiam-admin/src/components/ui/WorkspaceRolePill.tsx)

Tenant:

- [PortalWorkspaceRolePill.tsx](/home/theparitt/work/rooiam/rooiam-app/src/components/portal/PortalWorkspaceRolePill.tsx)

Locked color mapping:

- `Workspace Owner` = `blue` / `sky`
- `Workspace Admin` = `purple`
- `User` = `green`

Rules:

- use the role-pill helper, not raw badge spans or ad hoc pill classes
- keep the same label wording everywhere:
  - `Workspace Owner`
  - `Workspace Admin`
  - `User`
- workspace overviews, member lists, and member detail views should all use the same role-pill mapping
- if platform roles need pills, treat them separately from workspace-role pills

## Audit Events

Audit event appearance must stay consistent across admin and tenant surfaces.

Tenant shared pieces:

- [audit-events.ts](/home/theparitt/work/rooiam/rooiam-app/src/lib/audit-events.ts)
- [PortalAuditEventItem.tsx](/home/theparitt/work/rooiam/rooiam-app/src/components/portal/PortalAuditEventItem.tsx)
- [PortalAuditEventTableRow.tsx](/home/theparitt/work/rooiam/rooiam-app/src/components/portal/PortalAuditEventTableRow.tsx)

Rules:

- success events = green
- failed / blocked / suspicious events = rose
- neutral info events = blue

Compact overview activity and full audit-log table should use the same status semantics.

Do not invent a separate color system for tenant audit logs.

## Identity Images

Compact identity displays should stay simple.

Rules:

- personal avatars are circular
- workspace list/chip images are circular
- login/logo shape rules are only for login surfaces

Do not use `wide` logo behavior for compact workspace list items or avatar-like contexts.

The richer logo-shape system is for login branding, not for list scanning.

## Scrollbars

Global scrollbar style should stay slim and surface-specific.

Rules:

- slim width
- calm tone matched to each surface
- do not force always-visible left-nav scrollbar unless needed

Tenant left nav specifically should only reveal its scrollbar on interaction, not all the time.

## Copy And Naming

Sidebar item, page title, and section naming should stay aligned by scope.

Current scope model in `rooiam-app`:

- `Workspace`
- `Tenant`
- `My`

Naming rule:

- use the scope prefix in page titles where it improves clarity
- avoid repeating the scope word in the nav if the section already makes it obvious

Examples:

- nav: `Workspace > Access`
- page title: `Workspace Access`

- nav: `Tenant > Access`
- page title: `Tenant Access`

- nav: `My > Access`
- page title: `My Access`

## Reuse Rule

Before creating a new styled block, check whether the UI already has a reusable primitive for it.

Check these first:

- page header
- section header
- section card
- overview stat card
- overview info card
- overview panel
- pill
- audit event item / table row

If a new screen needs the same pattern, reuse the shared component and extend it carefully instead of copying classes into the page.

## Do Not Drift

If another engineer or AI changes one of these surfaces, they should preserve:

- same border radius family
- same header padding rhythm
- same badge language
- same audit-event colors
- same page-title hierarchy
- same left-edge alignment

Product scope may differ.
Visual system should not.
