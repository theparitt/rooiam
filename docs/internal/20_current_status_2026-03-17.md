# Current Status — 2026-03-17

This document supersedes [18_current_status_2026-03-15.md](./18_current_status_2026-03-15.md).

It records the current practical state of the Rooiam codebase after Phase 1–2, Phase 3, and Phase 4 (Protocol Maturity) completion.

---

## Product Direction

- Rooiam is a multi-tenant identity platform and OIDC provider
- Phase 1–2 (protocol layer) is complete and production-quality
- Phase 3 (Identity Control Plane) is **complete**
- Phase 4 (Protocol Maturity + Security Hardening — core items) is **complete**
- Phase 5 (Control Plane Maturity) is **next** — see [19_roadmap_2026-03-15.md](./19_roadmap_2026-03-15.md)
- Demo mode is stable; do not reopen broad demo churn
- `rooiam-admin` and `rooiam-app` share the same visual language — keep them aligned

---

## Phase Checklist

### ✅ Phase 1–2 — Protocol Layer (Complete)

#### Core Identity
- [x] User registration + email verification
- [x] Magic link login (passwordless)
- [x] Session management — opaque session cookies, DB-backed (`sessions` table)
- [x] Session listing + self-revocation (`/identity/me/sessions`)
- [x] Admin session revocation with rank hierarchy enforcement
- [x] Self-session revocation from other devices (My Account → Sessions tab)

#### OAuth2 / OIDC
- [x] Authorization Code Flow
- [x] PKCE enforcement for public clients
- [x] Refresh token grant with rotation + reuse detection (token family revocation)
- [x] Token revocation (`/v1/oidc/revoke`)
- [x] Token introspection (`/v1/oidc/introspect`)
- [x] OIDC `/.well-known/openid-configuration`
- [x] JWKS endpoint
- [x] ID token with profile + email claims scoped correctly
- [x] Userinfo endpoint (`/v1/oidc/userinfo`)

#### Social Login (Federation)
- [x] Google OAuth
- [x] Microsoft OAuth
- [x] CSRF protection — state token bound to initiating IP
- [x] Demo OAuth — fake Google/Microsoft pages for demo mode

#### MFA
- [x] TOTP enrollment + verify
- [x] Backup codes
- [x] MFA required flag per workspace (`require_mfa`)
- [x] MFA enforcement in auth flow

#### WebAuthn / Passkeys
- [x] Passkey registration
- [x] Passkey login
- [x] Per-workspace passkey toggle (`allow_passkey`)

#### Security Fixes Applied (2026-03-12)
- [x] Client secret hashed with Argon2id (was SHA-256)
- [x] Constant-time secret comparison via `subtle::ConstantTimeEq`
- [x] Invite token bound to invited email address
- [x] OAuth state token bound to initiating IP
- [x] Raw invite token removed from logs

#### OAuth Client Management
- [x] Client creation (web, SPA, native)
- [x] Redirect URI management
- [x] Client secret rotation
- [x] Client suspend / resume
- [x] First-party client flag

---

### ✅ Phase 3 — Identity Control Plane (Complete)

#### Tenant Policies
- [x] Per-workspace login method toggles (`allow_magic_link`, `allow_google`, `allow_microsoft`, `allow_passkey`)
- [x] Per-workspace MFA required flag (`require_mfa`)
- [x] Platform-level IP allowlist / blocklist
- [x] Per-workspace IP policy override (platform controls whether tenants can override)
- [x] Platform-level tenant admin login method control (Tenant Access page)
- [x] Domain restrictions — `allowed_email_domains` per workspace
- [x] Session timeout policy — `max_session_age_hours` per workspace
- [x] Role-scoped MFA — `require_mfa_for_admins` flag
- [x] Concurrent session limit — `max_concurrent_sessions` per workspace
- [x] Session binding — server-side UA + IP-subnet fingerprint
- [x] Suspicious session detection — new device-class login triggers audit event

#### Role System
- [x] Platform Owner, Platform Admin, Workspace Owner, Workspace Admin, User
- [x] Rank hierarchy for admin operations
- [x] Permission matrix (9 permissions, all handlers enforce RBAC)
- [x] Custom roles
- [x] Read-only / auditor role (`viewer` system role)
- [x] Role inheritance via `role_permissions` join

#### Audit Depth
- [x] Auth events, session events, workspace events, policy events, admin events
- [x] OAuth events, client events
- [x] Before/after values in policy change events
- [x] Role change + invite lifecycle events
- [x] API key lifecycle events
- [x] Audit log export (CSV / JSON)
- [x] Audit log retention (daily background prune)
- [x] SIEM integration (webhook with HMAC-SHA256 signature, SSRF protection)

---

### ✅ Phase 4 — Protocol Maturity + Security Hardening (Core Items Complete)

#### Status / Terminology Fix (2026-03-17)
- [x] **`paused` → `suspended` rename** — all DB rows migrated (migration 0040), Rust string literals, TypeScript type unions, UI display text, audit event action strings, CHECK constraint on `oauth_clients`
- [x] **`suspended` clear error message at login** — all login paths (magic link verify, OAuth callback, passkey) return `"This account has been suspended."` instead of generic 401

#### Platform Lock (Workspace Status)
- [x] `platform_locked` boolean on `organizations` table (migration 0039)
- [x] Platform admin can suspend + lock a workspace — tenant admin cannot re-activate locked workspace
- [x] `PATCH /v1/admin/organizations/:id/status` — sets `status` + `platform_locked` atomically
- [x] `PATCH /v1/orgs/current/status` — tenant admin toggle; blocked by `platform_locked`
- [x] Admin console (rooiam-admin) shows suspend/lock controls in workspace detail
- [x] Tenant portal (rooiam-app) shows suspend/re-activate toggle with locked guard

#### Admin UX Column Alignment (2026-03-17)
- [x] Shared `StatusBadge` component (consistent active/suspended/archived pill rendering)
- [x] Members list — fixed grid `sm:grid-cols-[200px_90px_90px]`, workspace + status + date columns
- [x] Tenant Members list — fixed grid `sm:grid-cols-[160px_90px_80px]`, org + status + date columns
- [x] Workspaces list — fixed grid `sm:grid-cols-[90px_90px_90px]`, member count + status + date columns
- [x] `AdminOrg` TypeScript type gets `status: string` field; server SQL updated to SELECT `o.status`

#### Protocol Correctness
- [x] RFC error response shapes on all OIDC endpoints — `{"error", "error_description"}` on negative paths
- [x] PKCE enforcement verified — public clients require `code_challenge=S256`; bad verifier → `invalid_grant`
- [x] Refresh token validation — fake/wrong-client tokens return `invalid_grant` with RFC shape
- [x] Token revocation RFC 7009 compliance — `POST /v1/oidc/revoke` returns **200** even for invalid/expired tokens (fix applied 2026-03-17)
- [x] Client auth enforcement — confidential vs. public client rules verified; introspect requires auth
- [x] Scope hardening — `scopes_supported` in discovery, userinfo requires valid bearer, unknown scopes handled gracefully
- [x] Stable claim guarantees — `sub` permanent, `email`/`name` scoped correctly

#### Known Gap (Tracked)
- [ ] `end_session_endpoint` — RP-initiated logout with `post_logout_redirect_uri` — **not yet implemented**
  - Test 12 in `25_oidc_rfc_errors.http` tracks this gap; expected to FAIL until implemented

#### Items Moved to Later Phases
These were originally in Phase 4 but are enterprise/complex — moved to later phases:
- Device trust (`trusted_devices` table, post-MFA tagging) → Phase 5
- Step-up auth (`acr_values`, re-auth before sensitive operations) → Phase 5
- Front-channel / back-channel logout → Phase 5
- Anomaly scoring (risk score from binding mismatch + suspicious login) → Phase 7
- Admin suspicious activity queue → Phase 7
- Alert thresholds (N failed logins → notify admin) → Phase 7
- Interop verification (NextAuth, oauth2-proxy, AppAuth) → Phase 5

---

### 🔲 Phase 5 — Control Plane Maturity

*Goal: Control plane 8 → 10/10.*

#### Security Architecture (carry-over from Phase 4)
- [ ] `end_session_endpoint` — RP-initiated logout with `post_logout_redirect_uri`
- [ ] Front-channel logout (iframe, optional per client)
- [ ] Back-channel logout (server POST, optional per client)
- [ ] Device trust — post-MFA device tagging; skip MFA on trusted device
- [ ] Step-up auth (`acr_values`) — re-authenticate before email change, passkey removal, owner transfer
- [ ] OIDC signing key rotation — `kid` in JWTs, old key stays in JWKS until expiry
- [ ] Secure email change flow — verify new address before switching
- [ ] Provider unlink safety — block if last login method would be removed
- [ ] Interop verified (NextAuth, oauth2-proxy, SPA PKCE, mobile AppAuth)

#### Control Plane Maturity
- [ ] Effective policy view
- [ ] Policy change preview (warn if change would lock out active users)
- [ ] Last-N policy snapshots + one-click restore
- [ ] Permission catalog page
- [ ] Role diff view
- [ ] Built-in role templates
- [ ] Scoped admin delegation with expiry
- [ ] Active sessions by workspace (platform admin view)
- [ ] Owner transfer flow
- [ ] Self-lockout prevention on policy save

---

### 🔲 Phase 6 — Developer Ecosystem

*Goal: Developer ecosystem 4 → 8/10.*

- [ ] `@rooiam/client` JS/TS SDK
- [ ] Next.js integration guide + middleware helper
- [ ] SPA PKCE reference app
- [ ] `rooiam` Rust crate
- [ ] Public docs site
- [ ] Docker Compose quickstart
- [ ] Versioned changelog

---

### 🔲 Phase 7 — Platform Ecosystem

- [ ] Admin API keys with scoped permissions
- [ ] Prometheus metrics endpoint
- [ ] Structured JSON log output
- [ ] Webhook system (tenant-configured identity event webhooks)
- [ ] Rate limit dashboards per tenant
- [ ] Anomaly scoring + admin suspicious activity queue
- [ ] Alert thresholds (N failed logins → notify admin)
- [ ] Terraform / Pulumi provider
- [ ] Python SDK + Go SDK

---

### 🔲 Phase 8 — Enterprise Federation

*Only after real enterprise demand.*

- [ ] SAML 2.0 SP
- [ ] SCIM provisioning + deprovisioning + group sync
- [ ] LDAP / Active Directory read sync
- [ ] JIT provisioning from SAML / SCIM
- [ ] Impersonation with audit trail
- [ ] GDPR right to erasure
- [ ] PII masking in audit logs
- [ ] SOC2 / ISO 27001 audit report export
- [ ] Data residency controls

---

## Phase 4 Changes Applied (2026-03-17)

### Migrations
- `0039_org_platform_lock.sql` — `ALTER TABLE organizations ADD COLUMN platform_locked BOOLEAN NOT NULL DEFAULT FALSE`
- `0040_status_paused_to_suspended.sql` — data migration: all `status = 'paused'` → `'suspended'` in users, organizations, organization_members, oauth_clients; drops and recreates `oauth_clients_status_check` constraint

### Backend
| File | Change |
|------|--------|
| `organization/models.rs` | `platform_locked: bool` added to `Organization` |
| `organization/repository.rs` | All SELECT/RETURNING clauses include `platform_locked` |
| `admin/handlers.rs` | `AdminOrganization.status: String` added; `o.status` in list SQL; all `"paused"` literals → `"suspended"`; `can_manage_status` / `platform_locked` logic in org status handler |
| `oidc/handlers.rs` | `revoke_refresh_token` errors now silenced (RFC 7009 §2.2 — returns 200 for any token) |
| All auth handlers | Login paths return `"This account has been suspended."` for suspended users |

### Frontend — rooiam-admin
| File | Change |
|------|--------|
| `components/ui/StatusBadge.tsx` | New shared component — maps status → color + label |
| `pages/Members.tsx` | Fixed grid columns, StatusBadge, workspace pill with icon |
| `pages/TenantMembers.tsx` | Fixed grid columns, StatusBadge |
| `pages/Workspaces.tsx` | Fixed grid columns, StatusBadge, member count column, status now shows (was missing) |
| `lib/api.ts` | `AdminOrg.status: string` added; `'paused'` → `'suspended'` in all type unions |

### Tests Added (Phase 4 — Protocol Maturity)
| File | Requests | Result |
|------|----------|--------|
| `test/25_oidc_rfc_errors.http` | 13 | ⚠️ 12/13 (test 12 tracks `end_session_endpoint` gap) |
| `test/26_pkce_negative.http` | 5 | ✅ 5/5 |
| `test/27_refresh_token.http` | 5 | ✅ 5/5 |
| `test/28_client_auth.http` | 4 | ✅ 4/4 |
| `test/29_scope_hardening.http` | 5 | ✅ 5/5 |

### Tests Added (Full Endpoint Coverage — 2026-03-17)
| File | Requests | What It Covers |
|------|----------|----------------|
| `test/30_linked_accounts.http` | 5 | `GET/POST/DELETE /identity/me/linked-accounts` |
| `test/31_webauthn_passkeys.http` | 5 | `GET /webauthn/passkeys`, register/login start, report-failure |
| `test/32_org_branding.http` | 9 | `PATCH /orgs/current/branding`, public branding, permission guard |
| `test/33_admin_user_detail.http` | 9 | `GET/DELETE /admin/users/:id/sessions`, user detail, 404 |
| `test/34_admin_org_detail.http` | 8 | `GET /admin/organizations/:id`, per-org session policy CRUD |
| `test/35_admin_clients.http` | 7 | `GET /admin/clients`, suspend/restore, permission guard |
| `test/36_admin_audit_logs.http` | 8 | `GET /admin/audit-logs`, tenant/members, tenant/audit-logs |
| `test/37_org_status_lock.http` | 10 | Platform suspend+lock, tenant blocked, platform unlock |
| `test/38_admin_policies.http` | 12 | Session policy, client governance, workspace governance, tenant-access |
| `test/39_setup_public.http` | 5 | `GET /setup/status`, public-urls, auth-methods, login-bootstrap |

---

## Current Test Coverage

| Range | Files | Focus | Status |
|-------|-------|-------|--------|
| `00`–`24` | 25 files | Core API, security, sessions, OIDC basics | ✅ All pass |
| `25`–`29` | 5 files | Phase 4 Protocol Maturity (RFC errors, PKCE, refresh, client auth, scopes) | ⚠️ 31/32 (1 known gap: `end_session_endpoint`) |
| `30`–`39` | 10 files | Full endpoint coverage (linked accounts, branding, admin detail, lock flow, policies, setup) | ✅ 78/78 |

**Total: 40 files, ~297 requests**

Run all tests:
```bash
cd /home/theparitt/work/rooiam/test
hurl --variables-file dev.vars *.http --test --jobs 1
```

---

## Known Open Issues

1. `end_session_endpoint` not implemented — test 12 in `25_oidc_rfc_errors.http` tracks this (**resolved in Phase 5**)
2. ~~Raw invite token logged at INFO~~ — false alarm: `service.rs` logs only email + org ID, not the token
3. Demo branding overwritten on restart — by design

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

# After DB schema changes
DATABASE_URL="$ROOIAM_DATABASE_URL" sqlx migrate run
DATABASE_URL="$ROOIAM_DATABASE_URL" cargo sqlx prepare

# Tests
cd test && hurl --variables-file dev.vars *.http --test --jobs 1
```
