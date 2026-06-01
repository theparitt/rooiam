# Frontend File Naming And Module Rules

This note locks the naming and module-organization rules for `rooiam-admin` and `rooiam-app`.

Use this when creating new pages, renaming pages, or splitting large files.

For page purpose and scope boundaries, also follow:

- `29_data_flow_doctrine.md`

---

## Core Rule

Frontend page files, default component names, route scope, sidebar scope, and page titles should all describe the same thing.

Do not let these drift apart:

- sidebar section
- URL path
- page title
- file name
- default exported page component name

If the UI says `Tenant Workspace Session Policy`, the file should not still be called `Workspaces.tsx` or `Settings.tsx`.

---

## Scope Model

### `rooiam-admin`

The current top-level scopes are:

- `Platform`
- `Admin`
- `Tenant`
- `Tenant Workspace`
- `My`

File and page naming should follow those scopes.

### `rooiam-app`

The current top-level scopes are:

- `Workspace`
- `Tenant`
- `My`

Portal pages should follow those scopes.

---

## Naming Rule

Use:

- `Scope + Page`

Examples:

- `My Account`
- `My Sessions`
- `Admin Access`
- `Tenant Session Policy`
- `Tenant Workspace Rules`
- `Tenant Workspace Session Policy`
- `Workspace Access`
- `Workspace Audit Logs`

Do not shorten file names to generic labels when the page belongs to a scoped section.

Avoid generic file names like:

- `Settings.tsx`
- `Members.tsx`
- `Workspaces.tsx`
- `Profile.tsx`
- `Dashboard.tsx`

unless the page is truly global and unambiguous, which is rare in Rooiam now.

---

## File Naming Rules

### Pages

Page file names should match the scoped page meaning.

Examples in `rooiam-admin/src/pages`:

- `PlatformOverview.tsx`
- `PlatformSettings.tsx`
- `AdminAccess.tsx`
- `AdminMembers.tsx`
- `AdminAuditLogs.tsx`
- `TenantAccess.tsx`
- `TenantMembers.tsx`
- `TenantAuditLogs.tsx`
- `TenantSessionPolicy.tsx`
- `TenantWorkspaceWorkspaces.tsx`
- `TenantWorkspaceRules` is currently exported from `PlatformSettings.tsx`
- `TenantWorkspaceApps.tsx`
- `TenantWorkspaceDetail.tsx`
- `TenantWorkspaceAuditLogs.tsx`
- `TenantWorkspaceSessionPolicyList.tsx`
- `TenantWorkspaceSessionPolicyDetail.tsx`
- `MyProfile.tsx`
- `MyAccount.tsx`
- `MySecurity.tsx`
- `MySessions.tsx`
- `MyAuditLogs.tsx`

Examples in `rooiam-app/src/pages/portal`:

- `PortalWorkspaceOverview.tsx`
- `PortalWorkspaceMembers.tsx`
- `PortalWorkspaceApps.tsx`
- `PortalWorkspaceAuditLogs.tsx`
- `PortalWorkspaceAccess.tsx`
- `PortalWorkspaceBranding.tsx`
- `PortalWorkspaceLoginWidget.tsx`
- `PortalWorkspaceApiKeys.tsx`
- `PortalTenantAccess.tsx`
- `PortalTenantAuditLogs.tsx`
- `PortalTenantWorkspaces.tsx`
- `PortalMyProfile.tsx`
- `PortalMySecurity.tsx`
- `PortalMySessions.tsx`
- `PortalMyAuditLogs.tsx`

### Page Component Names

The default exported component should match the file name.

Examples:

- `PlatformOverview.tsx` -> `export default function PlatformOverview()`
- `MyProfile.tsx` -> `export default function MyProfile()`
- `PortalWorkspaceOverview.tsx` -> `export default function PortalWorkspaceOverview()`

Do not keep old default names after renaming a file.

Bad:

```tsx
// PortalWorkspaceOverview.tsx
export default function PortalOverview() {}
```

Good:

```tsx
// PortalWorkspaceOverview.tsx
export default function PortalWorkspaceOverview() {}
```

---

## Variable And Function Naming Rules

Use the same scope language inside the code that the UI and file system use.

Do not keep historical names after the product meaning has changed.

Examples of good alignment:

- `portalState` instead of `portal` when the state clearly represents the full portal payload
- `workspaceAuditLogs` instead of generic `activity` when the data is audit-log data
- `workspaceApps` instead of generic `clients` when the page is a workspace app inventory
- `workspaceIpPolicy` instead of `orgIpPolicy` when the UI uses `Workspace`
- `updateCurrentWorkspaceInPortalState()` instead of `updateCurrentOrgInPortal()`
- `AdminSessionPolicyTab()` instead of generic `SessionPolicyTab()`
- `TenantWorkspaceRulesTab()` instead of generic `WorkspaceSettingsTab()`

Rules:

- prefer `Workspace` over `Org` in frontend code when the UI language is `Workspace`
- prefer `Audit Logs` / `Audit` over generic `Activity` when the data is truly audit data
- prefer `My Security` over old `My Access` naming
- prefer `PortalHome` over old `AppHome` naming for the tenant portal root

What not to do:

- rename every tiny loop variable just for style
- churn stable local names that are already obvious and not misleading

Priority order:

1. exported component names
2. route helper names
3. top-level page state names
4. page action/helper function names
5. smaller locals only when they are confusing

The goal is not perfect uniformity at all costs.

The goal is:

- no misleading names
- no old concept names surviving after the product model changed
- easy code reading for the next developer

---

## Route Naming Rules

Route paths should also reflect the scope.

### `rooiam-admin`

Use:

- `/platform/...`
- `/admin/...`
- `/tenant/...`
- `/tenant-workspace/...`
- `/my/...`

Examples:

- `/platform/overview`
- `/platform/settings`
- `/admin/access`
- `/admin/members`
- `/tenant/access`
- `/tenant/session-policy`
- `/tenant-workspace/workspaces`
- `/tenant-workspace/rules`
- `/tenant-workspace/session-policy`
- `/my/profile`
- `/my/security`

### `rooiam-app`

Use:

- `/workspace/...`
- `/tenant/...`
- `/my/...`

Examples:

- `/workspace/:orgSlug/overview`
- `/workspace/:orgSlug/access`
- `/workspace/:orgSlug/login-widget`
- `/tenant/workspaces`
- `/tenant/access`
- `/my/profile`
- `/my/security`

---

## When To Keep A Generic Name

Generic names are still acceptable for:

- auth/bootstrap screens:
  - `Login.tsx`
  - `Verify.tsx`
  - `SetupWizard.tsx`
  - `MagicLink.tsx`
  - `OAuthCallback.tsx`
  - `Success.tsx`
- narrow detail pages that are intentionally reused across scopes:
  - `MemberDetail.tsx`
  - `PortalMemberDetail.tsx`

Reason:

- these files are already unambiguous in their local area
- forcing a longer name would not add much clarity

---

## Splitting Large Files

When a file gets too large, do not create vague child files.

Prefer feature-scoped names.

Good examples:

- `PlatformSettings.tsx`
  - `PlatformSettings.PublicUrls.tsx`
  - `PlatformSettings.OAuthProviders.tsx`
  - `PlatformSettings.Storage.tsx`
  - `PlatformSettings.SessionPolicy.tsx`

- `PortalHome.tsx`
  - `PortalHome.WorkspaceData.ts`
  - `PortalHome.TenantData.ts`
  - `PortalHome.Navigation.tsx`

Avoid names like:

- `Tab1.tsx`
- `SectionA.tsx`
- `Helpers.tsx`

Those age badly and hide meaning.

---

## Shared Component Rules

Put reusable primitives under:

- `rooiam-admin/src/components/ui`
- `rooiam-app/src/components/portal`

Do not create page-local mini systems when the same pattern already exists.

Current examples:

- `ContentCard`
- `SettingRowCard`
- `PrimarySaveButton`
- `SaveActionFooter`
- `PrimaryActionButton`
- `InlineMessage`
- `FormField`
- `EmptyState`
- `TabBar`
- `ToggleRow`

Mirror shared primitives across admin and portal when both surfaces need the same pattern, but keep them local to each app rather than creating one cross-app package.

---

## Current Canonical Entry Files

### `rooiam-admin`

- `src/App.tsx`
- `src/components/layout/DashboardLayout.tsx`
- `src/lib/routes.ts`
- `src/pages/PlatformOverview.tsx`
- `src/pages/PlatformSettings.tsx`

### `rooiam-app`

- `src/App.tsx`
- `src/pages/PortalHome.tsx`
- `src/lib/routes.ts`
- `src/pages/MagicLink.tsx`

These are the primary navigation roots. Changes to section naming or route scope should start here.

---

## Practical Check Before Merging

For any new or renamed page, verify:

1. sidebar section matches page title
2. route path matches scope
3. file name matches page meaning
4. default export name matches file name
5. imports were updated
6. route helpers still reflect the same scope naming

If any one of those is out of sync, the naming work is incomplete.
