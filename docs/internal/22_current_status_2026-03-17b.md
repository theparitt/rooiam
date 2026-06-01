# Current Status — 2026-03-17 (Phase 5 + Phase 6 Complete)

This document supersedes [20_current_status_2026-03-17.md](./20_current_status_2026-03-17.md).

It records the state of the Rooiam codebase after Phase 5 (Security Architecture) and Phase 6 (Control Plane Maturity) completion.

---

## Product Direction

- Phases 1–4 are complete (protocol layer, control plane, protocol maturity, security hardening)
- Phase 5 (Security Architecture) is **complete** as of 2026-03-17
- Phase 6 (Control Plane Maturity) is **complete** as of 2026-03-17
- Phase 7 (Developer Ecosystem) is **next** — see [21_roadmap_2026-03-17.md](./21_roadmap_2026-03-17.md)
- Full test suite: **56 files, 492 requests, 100% pass** (latest sequential validation on 2026-03-19)

---

## Phase Checklist

### ✅ Phase 1–2 — Protocol Layer (Complete)
*(unchanged — see 20_current_status_2026-03-17.md)*

### ✅ Phase 3 — Identity Control Plane (Complete)
*(unchanged — see 20_current_status_2026-03-17.md)*

### ✅ Phase 4 — Protocol Maturity + Security Hardening (Complete)
*(unchanged — see 20_current_status_2026-03-17.md)*

---

### ✅ Phase 5 — Security Architecture (Complete)

#### Logout
- [x] `end_session_endpoint` (`GET /v1/oidc/end-session`) — RP-initiated logout
  - Clears session cookie, revokes session in DB
  - Redirects to `post_logout_redirect_uri` with optional `state` param
  - Advertised in `/.well-known/openid-configuration`

#### Identity Lifecycle Safety
- [x] **Secure email change flow**
  - Two-step: request (send verification to new address) → verify (swap email)
  - Blocks if new email already in use
  - Notifies old address on success
  - Audit event: `user.email.change_requested` + `user.email.changed`
  - Token stored as SHA-256 hash in `email_change_tokens` table (migration 0041)
- [x] **Provider unlink safety** (already implemented, Phase 5 tests verify)
  - Cannot unlink last login method
  - Unsupported providers return 400
  - `GET /v1/identity/me/linked-accounts` returns magic link status + OAuth providers + passkey count

#### Key Lifecycle
- [x] **OIDC signing key rotation**
  - `POST /v1/admin/signing-keys/rotate` — generates 2048-bit RSA, retires current key, deletes old keys past rollover window
  - `GET /v1/admin/signing-keys` — lists all signing keys with status
  - `kid` format: `rooiam-{YYYYMMDDHHmmss}`
  - JWKS serves both active key + retired keys within rollover window (default 24h from `system_settings`)
  - Falls back to config-based PEM key if no DB keys exist (backward compatible)
  - Migration 0042: `oidc_signing_keys` table, `signing_key_rollover_hours` system setting

---

### ✅ Phase 6 — Control Plane Maturity (Complete)

#### Policy Clarity
- [x] **Effective policy view** (`GET /v1/orgs/current/effective-policy`)
  - Returns auth_policy, workspace_status, ip_policy, client_policy in one response
- [x] **Policy change preview** (`POST /v1/orgs/current/auth-policy/preview`)
  - Counts members who would be locked out if magic link or Google is disabled
- [x] **Self-lockout prevention** (`POST /v1/orgs/current/auth-policy/self-check`)
  - Checks if the requesting user's own login methods would survive the proposed policy change
- [x] **Policy snapshots** — auto-saved before each auth policy update; last 10 kept per org
  - `GET /v1/orgs/current/policy-snapshots` — list snapshots
  - `POST /v1/orgs/current/policy-snapshots/{id}/restore` — one-click restore
  - Migration 0041: `org_policy_snapshots` table

#### Permission System UX
- [x] **Permission catalog with descriptions** (`GET /v1/orgs/current/roles/permissions`)
  - All 11 permissions have plain-language descriptions (migration 0043)
- [x] **Role diff view** (`GET /v1/orgs/current/role-diff?role_a=&role_b=`)
  - Returns `only_in_a`, `only_in_b`, `in_both` permission sets
- [x] **Built-in role templates** (`GET /v1/orgs/current/role-templates`)
  - Static list: Billing Admin, Support Agent, Auditor, Security Admin

#### Operational Visibility
- [x] **Active sessions (platform admin view)** (`GET /v1/admin/sessions`)
  - Lists all active sessions with user email, org slug, IP, user agent
  - Searchable by email or org name/slug; paginated
  - Requires `is_superuser`

#### Admin Safety
- [x] **Owner transfer flow**
  - `POST /v1/orgs/current/owner-transfer` — initiate (generates 48h token)
  - `POST /v1/orgs/current/owner-transfer/accept` — accept (atomically demotes old owner, promotes new owner)
  - Migration 0041: `owner_transfer_requests` table

---

## Phase 5 + 6 Migrations

| Migration | Table(s) | Purpose |
|-----------|----------|---------|
| `0041_email_change_tokens.sql` | `email_change_tokens`, `org_policy_snapshots`, `owner_transfer_requests` | Email change flow, policy snapshots, owner transfer |
| `0042_signing_key_rotation.sql` | `oidc_signing_keys` + system_setting | OIDC signing key rotation |
| `0043_permission_descriptions.sql` | `permissions` (UPDATE) | Plain-language descriptions for all permissions |

---

## Phase 5 + 6 Backend Changes

### `oidc/handlers.rs`
- Added `end_session_endpoint` to `DiscoveryDocument`
- Added `EndSessionRequest` struct + `end_session` handler
- `jwks_with_state` now calls `oidc_jwks_from_db` (DB-backed with rollover)

### `oidc/service.rs`
- Added `oidc_jwks_from_db` — queries `oidc_signing_keys`, falls back to config PEM

### `identity/handlers.rs`
- Added `request_email_change` — validates, generates SHA-256 hashed token, sends verification email
- Added `verify_email_change` — validates token, swaps email, sends notification to old address

### `admin/handlers.rs`
- Added `list_signing_keys` — lists `oidc_signing_keys` (superuser only)
- Added `rotate_signing_key` — generates RSA 2048-bit key, retires old key, prunes expired keys
- Added `list_active_sessions_admin` — platform-wide session view (superuser only); uses `s.ip::text AS ip` (Postgres INET → Rust String cast)

### `organization/handlers.rs`
- Added `get_effective_policy` — org-wide effective policy view
- Added `preview_auth_policy_change` — lockout preview
- Added `check_self_lockout` — would-I-lose-access check
- Policy snapshot auto-save in `update_current_org_auth_policy` (prunes to last 10)
- Added `list_policy_snapshots` + `restore_policy_snapshot`
- Added `list_role_templates` — static list of 4 templates
- Added `diff_roles` — compares two role IDs
- Added `initiate_owner_transfer` + `accept_owner_transfer`

### `infra/email.rs`
- Added `send_notification_email` — plain notification emails (no template), used for email change flow

---

## Test Coverage

### Phase 5 Test Files (New)

| File | Requests | What It Covers |
|------|----------|----------------|
| `test/40_end_session.http` | 6 | Discovery has `end_session_endpoint`; logout clears cookie; redirect with `post_logout_redirect_uri` + `state` |
| `test/41_email_change.http` | 5 | Same email rejected; invalid email rejected; valid new email accepted; bogus token → 404 |
| `test/42_signing_key_rotation.http` | 9 | List keys (empty); rotate (returns kid); list (1 active); JWKS has RSA key; rotate again; JWKS ≥1 key; non-admin → 403 |
| `test/49_phase5_provider_unlink.http` | 5 | Linked accounts response shape; unlink non-linked providers → 400/404; unsupported provider → 400 |

### Phase 6 Test Files (New)

| File | Requests | What It Covers |
|------|----------|----------------|
| `test/43_effective_policy.http` | 2 | `GET /effective-policy` returns all policy dimensions |
| `test/44_policy_preview.http` | 5 | Preview with magic link disabled shows lockout count; Google disable; no change → 0 locked |
| `test/45_policy_snapshots.http` | 7 | Trigger snapshot by updating policy; list snapshots; restore snapshot |
| `test/46_role_catalog.http` | 5 | List permissions with descriptions; list role templates; list roles; role diff |
| `test/47_admin_sessions.http` | 5 | Platform admin lists sessions; search by email; non-admin → 403 |
| `test/48_owner_transfer.http` | 4 | Initiate transfer; accept with bogus token → 404; non-member cannot accept |

### Full Test Suite

| Range | Files | Focus | Status |
|-------|-------|-------|--------|
| `00`–`24` | 25 files | Core API, security, sessions, OIDC basics | ✅ All pass |
| `25`–`29` | 5 files | Phase 4 Protocol Maturity | ✅ All pass (`end_session_endpoint` gap now resolved in 40) |
| `30`–`39` | 10 files | Full endpoint coverage | ✅ All pass |
| `40`–`49` | 10 files | Phase 5 + 6 features | ✅ All pass |
| `50`–`55` | 6 files | Magic-link hardening, role guard matrix, suspend/session revocation, audit coverage, client rotation, profile validation | ✅ All pass |

**Total: 56 files, 492 requests, 100% pass (sequential — use `--jobs 1`)**

Run all tests:
```bash
cd rooiam/test
hurl --variables-file dev.vars *.http --test --jobs 1
```

> Note: Running without `--jobs 1` causes the auth rate limiter (10 req per window per IP) to trip
> when the full suite runs in parallel. Always use `--jobs 1` for the full suite.

---

## Known Open Issues

None currently tracked.

Notes:

- Demo branding reset on restart remains an intentional demo-mode limitation, not a production bug.
- Historical fixed issues and informational notes remain in [05_known_issues.md](./05_known_issues.md).

---

## Dev Commands

```bash
# Backend
cd rooiam-server && SQLX_OFFLINE=true cargo run      # port 5170
cd rooiam-server && SQLX_OFFLINE=true cargo check

# Frontend
cd rooiam-admin && npm run dev                        # port 5171
cd rooiam-app && npm run dev                          # port 5172
cd rooiam-demo && npm run dev                         # port 5174

# Migrations
DATABASE_URL="$ROOIAM_DATABASE_URL" sqlx migrate run
DATABASE_URL="$ROOIAM_DATABASE_URL" cargo sqlx prepare

# Tests
cd test && hurl --variables-file dev.vars *.http --test --jobs 1
```
