# Tenant UI Plan

This plan defines what the tenant-facing Rooiam surface should become during `Phase 4`.

The goal is to keep the product split clear:

- `rooiam-admin` = platform/operator console
- `rooiam-app` = tenant/company auth and tenant-admin portal
- `rooiam-demo` = downstream customer-facing example app

## Tenant Admin Role

Tenant admins are company-scoped admins.

They manage only their own company-facing identity experience.

They should not have access to:

- global SMTP / Redis / provider credentials
- all tenants in the instance
- system-wide users
- platform-wide audit visibility

They should be able to:

- switch between companies they belong to
- customize their own company login appearance
- choose allowed sign-in methods for their company
- choose whether their company requires MFA as part of sign-in policy
- invite company members
- view company members
- manage company member roles from the available workspace role catalog
- view recent company activity
- later manage company-level login/security policy

Default infrastructure model:

- tenant/company policy uses platform-managed Google, Microsoft, and SMTP defaults
- tenant admins do not edit raw provider credentials in the normal tenant portal
- tenant-owned credentials are a later advanced feature, not the Phase 4 default

## Tenant Portal Information Architecture

The tenant portal in `rooiam-app` should be organized around company-scoped tasks.

Recommended navbar order:

- Overview
- Members
- Clients
- Access
- Branding
- Activity
- Workspaces

### Overview

Shows:

- active company
- connected app name
- current user
- current company login summary
- quick links to company-facing settings

Purpose:

- orient the tenant admin
- make it obvious this is a company portal, not the operator console

### Workspaces

Shows:

- companies/workspaces the current user belongs to

Actions:

- switch active company context

Purpose:

- let one tenant admin move between multiple companies they manage

### Branding

Shows:

- company login display name
- company logo
- company brand color

Actions:

- update company login branding

Purpose:

- let each company have a different company identity without affecting the whole instance

### Preview

Shows:

- login title
- login subtitle
- widget radius
- widget shadow
- sign-in method order
- live login widget preview
- embed snippet

Actions:

- update the actual hosted login widget look

Purpose:

- keep one clear place where tenant admins can see and adjust the real login widget

### Clients

Shows:

- OAuth clients registered under this company (downstream apps that use Rooiam for login)
- client name, client ID, redirect URIs

Actions:

- create a new OAuth client
- delete a client
- manage redirect URIs

Purpose:

- tenant admins register their own apps (e.g. "Acme Web", "Acme Mobile")
- each client gets a `client_id` to use in the OIDC authorization code flow
- login activity for each client is visible in Activity

### Access

Shows:

- company-level sign-in method toggles
- current effective company sign-in policy

Actions:

- enable/disable company-visible login methods

Current scope:

- magic link
- Google
- Microsoft
- passkey

Later scope:

- MFA requirement
- per-client policy overrides
- optional tenant-owned OAuth / SMTP overrides later, not in Phase 4

Current scope now includes:

- magic link
- Google
- Microsoft
- passkey
- Require MFA

Credential behavior:

- tenant login uses operator-managed provider credentials and email infrastructure by default
- tenant admins only choose whether those methods are visible for their company
- provider credentials and SMTP stay in `rooiam-admin`
- later advanced plans may add optional tenant-owned credentials with explicit inheritance

### Members

Shows:

- members in the current company
- status for each member

Actions:

- invite a member to the current company
- assign one of the available company roles
- later: suspension, removal

Purpose:

- make tenant admin useful beyond branding

### Activity

Shows:

- recent company-scoped auth and membership events
- actor identity where available
- target type and timestamp

Purpose:

- give tenant admins visibility into their own company activity
- avoid sending them to platform-wide operator audit logs

## Clear Ownership Split

| Area | `rooiam-admin` | `rooiam-app` |
| --- | --- | --- |
| Who uses it | Platform/operator admins | Tenant/company admins |
| Scope | Whole Rooiam instance | Current company/workspace only |
| Can view | All tenants, system-wide users, global audit/config | Company members, company activity, company branding, company sign-in policy |
| Can change | SMTP, provider credentials, public URLs, Redis, global defaults | Company logo, company display name, company brand color, company sign-in method toggles, company invites |
| Must not expose | Tenant-only styling controls as primary workflow | Global infrastructure secrets and all-tenant visibility |

### Keep In `rooiam-admin`

- SMTP / email infrastructure
- Google / Microsoft client credentials
- Redis and public URL configuration
- global auth defaults
- all-tenant visibility
- platform-wide audit logs

### Keep In `rooiam-app`

- company branding
- company sign-in method toggles
- company OAuth clients (downstream apps)
- company member list
- company invites
- company-scoped activity / login activity
- later: company login/security policy (MFA enforcement, session timeout)

### Later Advanced Tenant Override

Defer until a later phase:

- company-owned Google OAuth app later
- company-owned Microsoft OAuth app later
- company-owned SMTP / sender infrastructure later

Phase 4 should ship cleanly without exposing those raw secrets to normal tenant admins.

### Future Shared Model

Operator controls what the instance is capable of.

Tenant admin controls how one company uses those capabilities.

## Tenant Login Expectations

Tenant users should feel:

- "I am signing into my company"
- not "I am inside the global Rooiam system"

Tenant login should show:

- company logo if set
- Rooiam branding as the identity platform
- connected app context when relevant

Default branding behavior:

- company logo if provided
- Rooiam logo as fallback

## Design Direction

`rooiam-app` should stay visually aligned with `rooiam-admin`:

- soft gradients
- rounded cards
- strong but restrained hierarchy
- fixed left sidebar on desktop
- only the workspace pane scrolls
- shared header/card rhythm across tenant pages instead of page-specific layout patterns

Use reusable ideas from `rooiam-admin`:

- sidebar structure
- section cards
- loading / empty / error states
- compact data cards

But the tenant portal should feel:

- lighter
- company-facing
- less infrastructural than the operator console

## Phase 4 Tenant UI Checklist

- [x] tenant portal shell
- [x] workspace switching
- [x] company branding editor
- [x] company login widget styling editor
- [x] company sign-in policy editor (magic link, Google, Microsoft, passkey toggles)
- [x] company member visibility
- [x] company invite flow
- [x] company activity view (org-scoped audit logs)
- [x] company OAuth clients (create, list, delete — tenant-scoped)
- [ ] company login activity (client-scoped auth events)
- [ ] custom Google OAuth credentials (deferred to a later advanced phase)
- [ ] custom Microsoft OAuth credentials (deferred to a later advanced phase)
- [ ] custom SMTP (deferred to a later advanced phase)
- [ ] credential test buttons (verify before saving)
- [x] company-scoped roles
- [x] MFA requirement at company policy level
- [x] tenant-scoped API access / company tokens
- [ ] per-client policy visibility
- [x] app + workspace context shown in session/audit surfaces
- [ ] validation across multiple companies

## Phase 4 UI Phases

### 4A. Foundation

- onboarding
- workspace creation
- workspace switching
- company branding
- widget style controls
- company login preview

### 4B. Company Admin

- members
- invites
- roles
- sign-in policy
- clients
- API keys
- activity

### 4C. Context And Isolation

- preserve company + app intent across login
- show company-only data
- prove tenant isolation
- show company-scoped activity and session context

### 4D. Cleanup

- one onboarding flow only
- one tenant shell pattern
- shared section-header/card components
- visual consistency with `rooiam-admin`

## Completion Rule

The tenant UI is ready for the next phase when:

- a tenant admin can manage their own company without touching operator settings
- company login looks and behaves differently per tenant
- company membership tasks are possible in the tenant portal
- `rooiam-app` feels like a real tenant portal instead of a generic signed-in placeholder
