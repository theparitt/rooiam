# Phase 4 Implementation

This document breaks `Phase 4: Tenant Branding And Tenant Admin` into concrete repo work.

## Recommended Build Order

### 4A. Tenant Portal Foundation

1. Tenant branding data model
2. Tenant portal context API
3. Tenant branding update API
4. Tenant login widget styling
5. Tenant portal UI in `rooiam-app`
6. Tenant auth copy

### 4B. Company Admin Controls

6. Tenant sign-in method policy
7. Company activity
8. Company members and invites
9. Company OAuth clients
10. Tenant API keys
11. Company-scoped role controls
12. Company MFA requirement policy

### 4C. Multi-Tenant Context

12. Client and workspace context propagation
13. Tenant-scoped API access
14. Session/audit visibility for `user + app + workspace`
15. Tenant isolation validation

Status:

- client/workspace context propagation is implemented through magic link, OAuth, passkey, and MFA
- session and audit surfaces now carry and display `user + app + workspace` context
- tenant-scoped APIs now match the tenant UI surface and stay scoped to `current_org`
- tenant isolation is enforced through current-workspace endpoints plus workspace-scoped permission checks

### 4D. Tenant UX Cleanup

16. Consolidate onboarding into one implementation
17. Extract shared tenant shell/components
18. Reuse admin-style section/header/card patterns where possible
19. Final tenant-portal validation before `rooiam-demo`

Status:

- onboarding is consolidated
- tenant shell/sidebar/mobile top bar are extracted from `PortalHome.tsx`
- shared portal header/card components are introduced and used across the tenant pages
- tenant portal pages now follow the same admin-like header/card rhythm instead of ad-hoc per-page layouts

## Ticket 1: Tenant Branding Data Model

Goal:

- add workspace/company branding fields that are separate from instance-wide settings

Repo targets:

- `rooiam-server/migrations`
- `src/modules/organization/models.rs`
- `src/modules/organization/repository.rs`

Smallest useful fields:

- `organizations.login_display_name`
- `organizations.brand_color`
- existing `logo_url`

Done when:

- organization records can store company login display name, logo, and color
- create/list/update queries return those values

## Ticket 2: Tenant Portal Context API

Goal:

- let `rooiam-app` load the current workspace, available workspaces, and organization-scoped permissions

Repo targets:

- `src/modules/organization/handlers.rs`
- `src/modules/organization/service.rs`
- `src/modules/rbac`

Minimum endpoint:

- `GET /v1/orgs/current/portal`

Response should include:

- `current_org`
- `organizations`
- `permissions`

Done when:

- tenant-facing UI can tell which workspace is active
- tenant-facing UI can tell whether the user can manage branding

## Ticket 3: Tenant Branding Update API

Goal:

- allow tenant/company admins to change their own workspace branding

Repo targets:

- `src/modules/organization/handlers.rs`
- `src/modules/organization/service.rs`
- `src/modules/organization/repository.rs`

Minimum endpoint:

- `PATCH /v1/orgs/current/branding`

Rules:

- user must have organization membership
- user must have `org:update`
- update only the current active workspace

Done when:

- tenant admins can save company display name, logo URL, and brand color for the active workspace

Status:

- implemented and expanded beyond the first branding slice
- branding now includes:
  - company login display name
  - logo URL
  - brand color
  - login title
  - login subtitle
  - widget radius
  - widget shadow
  - login method order

## Ticket 3.5: Tenant Login Widget Styling

Goal:

- let tenant/company admins shape how their hosted login widget looks without touching platform secrets

Repo targets:

- `rooiam-server/migrations`
- `src/modules/organization/models.rs`
- `src/modules/organization/repository.rs`
- `src/modules/organization/service.rs`
- `src/modules/organization/handlers.rs`
- `rooiam-app/src/pages/portal/PortalWorkspaceBranding.tsx`
- `rooiam-app/src/pages/portal/PortalPreview.tsx`
- `rooiam-app/src/components/portal/LoginWidgetPreview.tsx`
- `rooiam-app/src/pages/MagicLink.tsx`

Done when:

- tenant admins can control:
  - login title
  - login subtitle
  - widget radius
  - widget shadow
  - login method order
- the hosted tenant login page uses those values live
- the preview page renders the same order and style the real login page uses

Status:

- implemented
- widget preview is now a reusable component shared between tenant settings and the real login page
- login methods in `rooiam-app` render in the configured company order

## Ticket 4: Tenant Portal UI In `rooiam-app`

Goal:

- turn the default signed-in page into the first tenant-facing portal

Repo targets:

- `rooiam-app/src/pages/PortalHome.tsx`

Minimum UI:

- signed-in tenant view
- current workspace card
- workspace switcher
- branding form for users with `org:update`
- branding preview

Done when:

- `rooiam-app` feels like a tenant/company portal instead of a generic fallback landing page

## Ticket 5: Tenant Auth Copy

Goal:

- make `rooiam-app` read as company-facing auth, not a generic B2C login box

Repo targets:

- `rooiam-app/src/pages/MagicLink.tsx`
- `rooiam-app/src/pages/Verify.tsx`

Done when:

- login copy and follow-up screens feel tenant/company aware
- future client/workspace hints can fit naturally into the UI

Status:

- implemented for the first tenant-facing slice
- `rooiam-app` now supports company branding lookup by workspace slug on the login page
- falls back cleanly to instance-level branding when no tenant branding is provided

## Ticket 6: Client And Workspace Context Propagation

Goal:

- preserve app/client and workspace intent across auth flows

Reference:

- [client_workspace_context.md](/docs/client_workspace_context.md)

Repo targets:

- `auth`
- `oauth`
- `webauthn`
- `mfa`
- `rooiam-app`

Done when:

- auth flows can preserve app intent and workspace hint through magic link, OAuth, passkey, and MFA

Status:

- implemented as the first tenant-context slice
- `rooiam-app` now preserves `org` and `app` intent in its default redirect path
- the tenant portal auto-switches into the requested workspace when the signed-in user belongs to it
- the portal URL keeps tenant context visible instead of falling back to a generic signed-in page

## Ticket 5.5: Tenant Sign-In Method Policy

Goal:

- let tenant/company admins choose which sign-in methods their company login page can show

Repo targets:

- `rooiam-server/migrations`
- `src/modules/organization/models.rs`
- `src/modules/organization/repository.rs`
- `src/modules/organization/service.rs`
- `src/modules/organization/handlers.rs`
- `src/modules/setup/handlers.rs`
- `rooiam-app/src/pages/PortalHome.tsx`
- `rooiam-app/src/pages/MagicLink.tsx`

Done when:

- tenant admins can update company-level policy for:
  - magic link
  - Google
  - Microsoft
  - passkey
- `rooiam-app` login respects those company settings when a workspace slug is provided

Status:

- implemented as the current Phase 4 auth-policy slice
- full instance/client/tenant inheritance is still later work
- tenant portal now follows the simpler default model:
  - operator-managed Google, Microsoft, and SMTP stay in `rooiam-admin`
  - tenant admins only control company-visible sign-in policy in `rooiam-app`
 - tenant policy now includes a company-scoped `require_mfa` flag for tenant login policy

## Ticket 10.5: Company-Scoped Roles And MFA Policy

Goal:

- move tenant company administration beyond the original hardcoded `Admin` / `Member` switch
- give tenant admins a company-scoped MFA requirement control

Repo targets:

- `rooiam-server/migrations`
- `src/modules/organization/*`
- `src/modules/setup/handlers.rs`
- `rooiam-app/src/pages/PortalHome.tsx`
- `rooiam-app/src/pages/portal/PortalWorkspaceMembers.tsx`
- `rooiam-app/src/pages/portal/PortalSignIn.tsx`
- `rooiam-app/src/pages/portal/PortalPreview.tsx`

Done when:

- tenant portal loads an available role catalog for the current workspace
- tenant admins with `roles:manage` can assign supported company roles from that catalog
- tenant sign-in policy includes a company-scoped `require_mfa` flag
- preview and overview surfaces show the effective company policy cleanly

Status:

- implemented
- workspace role catalog now includes the system tenant roles exposed to the current tenant portal
- tenant member role switching is no longer hardcoded to only `Admin` / `Member`
- tenant sign-in policy now stores and previews `Require MFA`

## Ticket 7: Tenant Isolation Validation

Goal:

- prove one company cannot see or change another company’s branding or portal settings

Validation areas:

- `rooiam-app`
- workspace switching
- org permission checks

Done when:

- tenant admins only affect their own workspace context
- operator/system controls remain outside the tenant portal

Status:

- still pending as a validation and access-boundary pass across multiple companies

## Ticket 5.75: Tenant Company Activity

Goal:

- give tenant admins a company-scoped activity feed without exposing platform-wide audit logs

Repo targets:

- `src/modules/organization/models.rs`
- `src/modules/organization/repository.rs`
- `src/modules/organization/service.rs`
- `src/modules/organization/handlers.rs`
- `rooiam-app/src/pages/PortalHome.tsx`

Done when:

- tenant admins can view recent audit activity for the current workspace
- actor identity, action, target, and time are visible
- the feed remains company-scoped, not platform-wide

Status:

- implemented
- `GET /v1/orgs/current/activity` now returns company-scoped recent activity for the active workspace
- `rooiam-app` now includes a dedicated `Activity` section for tenant admins

## Ticket 5.8: Tenant API Access Model

Goal:

- define future company-scoped API access that mirrors tenant portal permissions without exposing operator credentials

Done when:

- the docs explicitly state that tenant API access must use workspace-scoped tokens
- tenant API capabilities are limited to the same company-scoped surface visible in `rooiam-app`

Status:

- implemented as Ticket 10 (API Keys) below
- docs updated at `http://localhost:5173/docs/api-tenant`

## Ticket 10: Tenant API Keys

Goal:

- let company admins create workspace-scoped API keys for server-to-server integrations
- keys carry the same permission boundary as the tenant portal (no operator access)
- revocable at any time with full audit trail

Repo targets:

- `rooiam-server/migrations/0012_tenant_api_keys.sql`
- `src/modules/organization/handlers.rs` (list/create/revoke handlers)
- `rooiam-app/src/pages/PortalHome.tsx` (API Keys section)
- `rooiam-landing/src/pages/DocsPage.tsx` (Tenant Portal API docs)

Endpoints:

- `GET /v1/orgs/current/api-keys` — list active keys for current workspace
- `POST /v1/orgs/current/api-keys` — create key (returns raw key once)
- `DELETE /v1/orgs/current/api-keys/:key_id` — revoke key

Key design:

- raw key format: `rooiam_<32 base64url bytes>` (~43 chars after prefix)
- only the SHA-256 hash stored in DB — raw key shown once at creation
- first 12 chars stored as `key_prefix` for display/identification
- optional `expires_at` — null means never expires
- soft-delete via `revoked = TRUE` flag (preserves audit trail)
- all create/revoke actions written to audit log

Status:

- implemented and deployed (migration 0012 applied)
- UI in rooiam-app: API Keys nav item with create form, active key list, revoke button, one-time copy banner
- documented at `http://localhost:5173/docs/api-tenant`

## Ticket 8: Tenant OAuth Client Management

Goal:

- let tenant admins register and manage their own downstream OAuth clients (their apps that use Rooiam for login)
- clients should be scoped to the tenant's organization, not globally visible

Repo targets:

- `src/modules/clients/handlers.rs`
- `src/modules/clients/service.rs`
- `src/modules/clients/repository.rs`
- `rooiam-app/src/pages/` (new Clients page)

Minimum endpoints:

- `GET /v1/orgs/current/clients` — list clients for current org
- `POST /v1/orgs/current/clients` — create client under current org
- `DELETE /v1/orgs/current/clients/:id` — delete own client

Security:

- user must have `org:update` or a dedicated `client:manage` permission
- tenant can only see/modify clients belonging to their own org

Done when:

- tenant admins can create OAuth clients from rooiam-app
- each client has a client_id, redirect URIs, and is scoped to the org
- tenant cannot see clients from other orgs

## Ticket 9: Tenant Auth Config (Custom Provider Credentials)

Goal:

- let tenants optionally provide their own Google OAuth app, Microsoft OAuth app, or SMTP
- when provided, these override operator defaults for that tenant's login flow
- when not provided, operator defaults are used transparently (zero setup for tenants)

Repo targets:

- `rooiam-server/migrations` (new `tenant_auth_config` table)
- `src/modules/organization/models.rs`
- `src/modules/organization/repository.rs`
- `src/modules/organization/service.rs`
- `src/modules/organization/handlers.rs`
- `src/modules/auth/service.rs` (fallback resolution logic)
- `rooiam-app/src/pages/` (Access/Settings page additions)

New migration — `tenant_auth_config` table:

```sql
CREATE TABLE tenant_auth_config (
    org_id                   UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,

    -- Google override (optional)
    google_client_id         TEXT,
    google_client_secret     TEXT,   -- encrypted at rest (AES-GCM-SIV)

    -- Microsoft override (optional)
    microsoft_client_id      TEXT,
    microsoft_client_secret  TEXT,   -- encrypted at rest
    microsoft_tenant_id      TEXT,

    -- SMTP override (optional)
    smtp_host                TEXT,
    smtp_port                INTEGER,
    smtp_user                TEXT,
    smtp_password            TEXT,   -- encrypted at rest
    smtp_from                TEXT,
    smtp_security            TEXT,   -- "starttls" | "tls" | "none"

    created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Provider resolution logic (in Rust auth service):

```
1. Load tenant_auth_config for the org
2. If tenant has their own google_client_id → use it
3. Else → fall back to system_settings (operator default)
4. If neither configured → Google button is hidden
```

Minimum endpoints:

- `GET /v1/orgs/current/auth-config` — load current custom config (secrets masked)
- `PATCH /v1/orgs/current/auth-config` — save custom credentials
- `POST /v1/orgs/current/auth-config/test` — test custom credentials before saving

Security:

- secrets encrypted before storing (AES-GCM-SIV, same pattern as existing TOTP secrets)
- secrets never returned in GET response — only presence indicators (`google_configured: true`)
- only org admins with `org:update` can read/write

Done when:

- a tenant can add their own Google OAuth app and their login consent screen shows their brand
- a tenant can add their own SMTP and magic-link emails come from their domain
- operator defaults are used for any unconfigured provider
- credentials can be tested before saving

## Recommended Order

1. Ticket 1
2. Ticket 2
3. Ticket 3
4. Ticket 4
5. Ticket 7
6. Ticket 5
7. Ticket 5.5
8. Ticket 8 (tenant OAuth clients)
9. Ticket 9 (custom auth credentials)
10. Ticket 6
