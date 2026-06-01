# Tenant Admin Model

This document defines the product split between the three main Rooiam surfaces.

## Product Split

### `rooiam-admin`

This is the operator-level console.

It is for the Rooiam owner or platform operator to manage:

- instance-wide setup
- system-wide users
- all organizations/workspaces
- global provider credentials
- global SMTP and Redis configuration
- audit logs across the whole instance

### `rooiam-app`

This should evolve into the tenant-facing auth and tenant-admin surface.

It is for a company-specific admin to manage:

- their company's login appearance
- their company's allowed sign-in methods
- their own company-facing branded login page
- their own workspace/company-level auth experience

It should not expose system-wide visibility.

### `rooiam-demo`

This is the downstream customer-facing example app.

It should demonstrate:

- how a real app delegates login to Rooiam
- how a tenant/company user lands back in the app after sign-in
- how company branding and company auth policy affect a real product login flow

## Why This Split Matters

Without this split, every company under one Rooiam instance gets the same:

- logo
- colors
- auth method availability
- login presentation

That is acceptable at the current stage, but it is not enough for real multi-tenant B2B customization.

## Future Configuration Layers

### 1. Instance Defaults

Managed in `rooiam-admin`.

Examples:

- default logo
- default color palette
- default provider availability
- SMTP
- provider credentials

### 2. Client / App Policy

Managed by the platform operator.

Examples:

- app A enables Google + magic link
- app B enables Microsoft only
- app C requires MFA

### 3. Tenant / Company Overrides

Managed by the tenant/company admin in the future tenant-facing surface.

Examples:

- company logo
- company brand color
- company display name
- company-specific login method toggles

## Security Boundary

Tenant admins must only be able to:

- see their own company settings
- change their own company branding and allowed login methods
- view their own company-specific auth experience

Tenant admins must not be able to:

- view all users in the instance
- view all organizations
- change SMTP, Redis, or global provider credentials
- access platform-wide audit or operator controls

## Short Version

- `rooiam-admin` = system/operator admin
- `rooiam-app` = tenant/company auth surface, and later tenant-admin surface
- `rooiam-demo` = customer-facing example app using Rooiam for login

That is the cleaner long-term product model for Rooiam.

Related UI planning:

- [tenant_ui_plan.md](/docs/internal/tenant_ui_plan.md)
- [tenant_api_access.md](/docs/tenant_api_access.md)

## Ownership Table

| Capability | `rooiam-admin` | `rooiam-app` | Notes |
| --- | --- | --- | --- |
| SMTP / email infrastructure | Yes | No (Phase 4) | Operator sets the global default; tenant override is a later advanced feature |
| Google / Microsoft client credentials | Yes | No (Phase 4) | Operator sets the global default; tenant override is a later advanced feature |
| Redis / public URLs / low-level instance config | Yes | No | Operator-only |
| Global auth defaults | Yes | No | Inherited by tenants unless overridden |
| All-tenant visibility | Yes | No | Operator/system oversight |
| Company branding | No | Yes | Tenant/company-scoped |
| Company sign-in method toggles | No | Yes | Enables/disables platform-provided methods for that company |
| Company custom OAuth credentials | No | No (Phase 4) | Deferred to a later advanced feature |
| Company custom SMTP | No | No (Phase 4) | Deferred to a later advanced feature |
| Company OAuth clients | No | Yes | Tenants manage their own downstream app clients |
| Company member visibility | No | Yes | Only current company/workspace |
| Company login activity | No | Yes | Audit logs scoped to their org only |
| Customer-facing app login | No | No | This belongs to downstream apps like `rooiam-demo` |
| Real product integration example | No | No | This belongs to `rooiam-demo` |

Interpretation:

- `rooiam-admin` decides what the whole Rooiam instance is capable of (global defaults).
- `rooiam-app` decides how one company uses those capabilities.
- `rooiam-demo` shows how a downstream product consumes the Rooiam identity layer.

## Auth Provider Inheritance Model

Phase 4 uses a simpler inheritance model:

```
1. Operator default (system_settings)
   e.g. Rooiam's shared Google app, shared SMTP

2. Disabled — if the operator has not configured the method, the tenant cannot enable it
```

This means:
- Tenants get working Google/Microsoft/magic-link login immediately after signup (zero setup).
- Tenants can also toggle individual methods on/off regardless of credentials source.
- Tenant-owned provider or email credentials are a later advanced phase, not part of the initial tenant portal.
