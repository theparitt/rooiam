# Domain Model

This page locks the core product vocabulary used across Rooiam.

## Core Terms

- Workspace
  - The tenant or company identity space.
  - Owns members, branding, login policy, audit logs, API keys, and tenant-scoped apps.
  - Examples in demo mode: `MintMallow`, `RooChoco`.

- App
  - A registered OAuth/OIDC client application under a workspace.
  - Owns `client_id`, app type, redirect URIs, and optional client secret.
  - A workspace can have many apps.

- Platform Admin
  - The superuser operating the Rooiam platform from the admin console.
  - Sets global defaults and guardrails.

- Tenant Admin
  - An admin inside a specific workspace.
  - Manages only that workspace, and only within platform guardrails.

## Relationship Rules

- A user can belong to multiple workspaces.
- A workspace can contain multiple apps.
- An app always belongs to exactly one workspace.
- Platform policy can restrict tenant behavior.
- Tenant overrides can narrow or replace platform defaults only where explicitly allowed.

## Policy Hierarchy

- Platform policy
  - Default allow/deny values and feature switches set by platform admin.

- Workspace policy
  - Per-workspace overrides when platform admin has enabled them.

- Effective policy
  - The final policy used at runtime after platform defaults and optional workspace overrides are resolved.

## Branding Model

- Workspace icon
  - Uses a single container/shape field.
  - There is no separate workspace icon size field.

- Login logo
  - Uses both container/shape and size.
  - Can differ from the workspace icon.

## UI Naming Rule

Tenant-facing UI should use these labels consistently:

- `Workspace`
- `App`
- `Login`

Avoid mixing these alternatives in the same surface unless there is a real product distinction:

- `company`
- `organization`
- `client`
- `company app`
- `client login`

If a new screen needs terminology, prefer the shared label constants in:

- `rooiam-app/src/lib/domain-labels.ts`
- `rooiam-admin/src/lib/domain-labels.ts`

## Cross-Project Rule

The same user-facing terms should be used consistently across:

- `rooiam-app`
- `rooiam-admin`
- internal docs

Current standard:

- `Workspace`
- `App`
- `Login`
- `Members`

## Membership Terms

When a screen talks about people inside a workspace or across the platform, use these meanings consistently:

- `Members`
  - Everyone in a workspace.
  - Includes workspace owners, workspace admins, and non-admin users.

- `Workspace Admins`
  - Workspace owners and workspace admins.
  - Elevated operators inside a workspace.

- `Users`
  - Non-admin members.
  - Do not label these as `End Users` in normal UI copy unless a screen is explicitly contrasting staff vs customer audiences.

Important exception:

- backend transport fields may still use `org`, `organization`, `tenant`, or `client`
- those API names should stay stable until the server contract is intentionally changed
- UI copy should still use the canonical terms above
