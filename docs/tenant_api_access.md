# Tenant API Access

> [!NOTE]
> This page is an older design-direction note.
>
> For the current `0.1` canonical path, prefer:
> - [Auth Models By Surface](./production/18_auth_models_by_surface.md)
> - [Integration API Contract](./reference/01_integration_api_contract.md)
> - [API Key Cookbook](./reference/02_api_key_cookbook.md)

This note defines the safe direction for tenant/company API access during `Phase 4`.

## Short Version

Tenant companies should not receive the same credentials or visibility as `rooiam-admin`.

Future tenant API access should use:

- workspace-scoped tokens
- company-scoped permissions
- the same access boundary as `rooiam-app`

## What Tenant API Access Should Be Able To Do

For the current workspace/company only:

- read company branding
- read company member list
- read company activity
- manage company branding when the caller has tenant-admin permission
- manage company sign-in policy when the caller has tenant-admin permission
- invite company members when the caller has tenant-admin permission

## What Tenant API Access Must Not Do

- read all tenants in the instance
- read platform-wide users
- read global audit logs
- manage SMTP / Redis / public URLs
- manage Google / Microsoft client credentials
- use the same credentials as `rooiam-admin`

## Product Split

- `rooiam-admin` owns platform/operator API access
- `rooiam-app` owns tenant/company API access
- `candycloud-web` will later demonstrate customer-facing app integration

## Security Direction

When tenant API keys/tokens are added, they should be:

- scoped to one workspace/company
- permissioned like tenant-admin actions, not operator actions
- revocable
- auditable

They should follow the same company boundary the UI already uses.

## Why This Matters

Without a separate tenant API model, a B2B customer would either:

- have no programmable company access at all
- or get overly broad operator-level access

Neither is acceptable.

The correct model is:

- operator credentials for platform operators
- tenant credentials for company admins
