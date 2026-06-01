# Operator Access Policy Hierarchy

**Date**: 2026-03-19
**Status**: Phase 1 implemented

---

## Overview

Rooiam governs two completely separate policy domains:

### 1. Operator Domain
People who operate Rooiam itself. Their login is governed by a strict hierarchical policy chain. Each level sets policy for the level below. **Child can only tighten, never loosen.**

### 2. End-User Domain
Tenant end users — the customers of a tenant's product. Their login is configured freely by the tenant (workspace owner / workspace admin). **Rooiam has no say.** Not governed here.

---

## Operator Hierarchy

```
Platform Owner
    ↓ sets policy for
Platform Admin  (login to admin console)
    ↓ sets policy for
Tenant Owner / Workspace Owner  (login to tenant portal)
    ↓ sets policy for
Workspace Admin  (login to tenant portal)
```

Each level controls **how the level below it must authenticate**.

---

## What Each Policy Level Controls

### Inherited (strict chain — child can only tighten)

| Setting | Description |
|---|---|
| `allow_magic_link` | Allow magic link login |
| `allow_google` | Allow Google OAuth login |
| `allow_microsoft` | Allow Microsoft OAuth login |
| `allow_passkey` | Allow passkey (WebAuthn) login |
| `require_mfa` | Require TOTP MFA completion |

If a parent disables Google login, no child level can re-enable it.
If a parent requires MFA, no child level can remove that requirement.

### NOT inherited (per-level, independent)

| Setting | Description |
|---|---|
| `ip_allowlist` | CIDR ranges allowed (empty = unrestricted) |
| `ip_blocklist` | CIDR ranges blocked (empty = none) |
| `allowed_email_domains` | Only these email domains can log in |
| `blocked_email_domains` | These email domains are blocked |

IP and email domain rules are configured independently at each level. Platform locking to a private network does NOT force tenants to do the same. Each level decides its own network/domain rules.

---

## Personal MFA Opt-in

A user can enable MFA for themselves even if policy does not require it.

```
effective_require_mfa = policy_requires_mfa OR user_has_enrolled_totp
```

Once enrolled, a user cannot skip MFA — their own TOTP enrollment counts as a requirement. Policy and personal opt-in both lock in MFA.

---

## Database Schema

Table: `operator_policies`

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `level` | `operator_policy_level` enum | `platform_to_admin`, `admin_to_tenant`, `tenant_to_workspace` |
| `organization_id` | UUID? | NULL = global for this level. Non-NULL = per-org override (Phase 2) |
| `allow_magic_link` | bool | Default: true |
| `allow_google` | bool | Default: true |
| `allow_microsoft` | bool | Default: true |
| `allow_passkey` | bool | Default: true |
| `require_mfa` | bool | Default: false |
| `ip_allowlist` | text | CIDR list, newline/comma separated |
| `ip_blocklist` | text | CIDR list, newline/comma separated |
| `allowed_email_domains` | text | Comma-separated domains |
| `blocked_email_domains` | text | Comma-separated domains |

Two seed rows are inserted on first migration: `platform_to_admin` and `admin_to_tenant` with maximally permissive defaults (all allow = true, require_mfa = false, empty lists). No logins are blocked by default.

---

## Level Mapping

| Who is logging in | DB level evaluated |
|---|---|
| Platform admin (`is_superuser = true`) into admin console | `platform_to_admin` |
| Tenant owner/admin into tenant portal | `admin_to_tenant` |
| Workspace admin into workspace (Phase 2) | `tenant_to_workspace` |
| End user into workspace | NOT governed — tenant controls freely |

---

## Enforcement Points

Policy is enforced at login time, after the user is identified but before session creation. All three login paths are covered:

- `modules/auth/handlers.rs` — magic link verify
- `modules/oauth/handlers.rs` — Google and Microsoft OAuth callback
- `modules/webauthn/handlers.rs` — passkey finish

The gate function `enforce_operator_login_policy()` in `shared/operator_policy.rs`:
1. Detects if the login is an operator login (via `resolve_operator_login_level`)
2. Loads the effective policy for that level
3. Checks auth method allowed
4. Checks IP against allowlist/blocklist
5. Checks email domain against allowed/blocked lists
6. Returns the effective policy (including `require_mfa`) to the caller for MFA handling

---

## Key Files

| File | Purpose |
|---|---|
| `shared/operator_policy.rs` | Core: structs, load/save, evaluation, enforcement |
| `migrations/0046_operator_policies.sql` | Schema and seed rows |
| `shared/auth_policy.rs` | Existing workspace/end-user policy (unchanged) |
| `modules/auth/handlers.rs` | Magic link enforcement wired |
| `modules/oauth/handlers.rs` | OAuth callback enforcement wired |
| `modules/webauthn/handlers.rs` | Passkey enforcement wired |

---

## API Endpoints (Phase 1 — TODO)

The backend logic is implemented. Admin UI endpoints to read/write these policies still need to be added:

```
GET  /v1/admin/operator-policy/platform-to-admin     (platform owner only)
POST /v1/admin/operator-policy/platform-to-admin     (platform owner only)
GET  /v1/admin/operator-policy/admin-to-tenant       (platform staff)
POST /v1/admin/operator-policy/admin-to-tenant       (platform staff)
```

Currently configured via direct DB access or future UI. The `ADMIN > Access` page in `rooiam-admin` needs to be updated to read/write these rows instead of the old `system_settings` keys.

---

## Phase 2 (Not yet implemented)

- `tenant_to_workspace` level (Tenant Owner controls Workspace Admin login)
- Per-org override rows (non-NULL `organization_id`) for `admin_to_tenant`
- Country/region lock (needs GeoIP)
- VPN/proxy detection (needs external data source)
- Time-of-day / day-of-week restrictions

---

## Design Principles

**Why IP is not inherited**: Platform may lock admin access to its private VPN. Tenants have no reason to follow that rule — their workspace admins may be distributed globally. Each level owns its own network policy.

**Why auth methods ARE inherited**: If platform disables Google login for security reasons, that decision must propagate down. A tenant owner should not be able to log in via a method the platform has deemed unsafe for operators.

**Why end-user login is separate**: End users belong to the tenant's product. Rooiam has no authority over how a tenant's customers authenticate. The tenant owns that experience entirely. Rooiam only governs people operating Rooiam itself.
