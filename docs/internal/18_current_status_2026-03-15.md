# Current Status — 2026-03-15 (updated 2026-03-15)

This document supersedes [17_current_status_2026-03-14.md](./17_current_status_2026-03-14.md).

It records the current practical state of the Rooiam codebase after Phase 1–2 completion, Phase 3 (Identity Control Plane) completion of items 1–5, and the admin UX improvements applied on 2026-03-15.

---

## Product Direction

- Rooiam is a multi-tenant identity platform and OIDC provider
- Phase 1–2 (protocol layer) is complete and production-quality
- Phase 3 (Identity Control Plane) is **complete**
- Phase 4 (Protocol Maturity + Security Hardening) is **next** — see [19_roadmap_2026-03-15.md](./19_roadmap_2026-03-15.md)
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
- [x] Token revocation (`/oauth/revoke`)
- [x] Token introspection (`/oauth/introspect`)
- [x] OIDC `/.well-known/openid-configuration`
- [x] JWKS endpoint
- [x] ID token with profile + email claims scoped correctly
- [x] Userinfo endpoint (`/oauth/userinfo`)

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
- [x] Client pause / resume
- [x] First-party client flag

---

### ✅ Phase 3 — Identity Control Plane (Complete)

#### Tenant Policies
- [x] Per-workspace login method toggles (`allow_magic_link`, `allow_google`, `allow_microsoft`, `allow_passkey`)
- [x] Per-workspace MFA required flag (`require_mfa`)
- [x] Platform-level IP allowlist / blocklist
- [x] Per-workspace IP policy override (platform controls whether tenants can override)
- [x] Platform-level tenant admin login method control (Tenant Access page)
- [x] **Domain restrictions** — `allowed_email_domains` per workspace; enforced at magic link verify, OAuth callback, and invite accept
- [x] **Session timeout policy** — `max_session_age_hours` per workspace; enforced in `RequireAuth` middleware, auto-revokes on expiry
- [x] **Role-scoped MFA** — `require_mfa_for_admins` flag; enforced in all 4 login paths (magic link, OAuth real, OAuth demo, passkey)
- [x] **Concurrent session limit** — `max_concurrent_sessions` per workspace; oldest session auto-revoked on overflow (migration 0034)
- [x] **Session binding** — server-side UA + IP-subnet fingerprint stored at creation; `auth.session.binding_mismatch` audit event on device-class/subnet change (migration 0035)
- [x] **Suspicious session detection** — new device-class login triggers `auth.login.suspicious` audit event at session creation

#### Role System
- [x] Platform Owner (`is_platform_owner` flag)
- [x] Platform Admin (`is_superuser` flag)
- [x] Workspace Owner (role code `owner`)
- [x] Workspace Admin (role code `admin`)
- [x] User (role code `member`)
- [x] Rank hierarchy for admin operations — Platform Owner (3) > Platform Admin (2) > Tenant Owner/Admin (1) > User (0)
- [x] **Permission matrix** — 9 permissions seeded (`org:update`, `branding:manage`, `auth_policy:manage`, `members:*`, `roles:manage`, `activity:read`); all handlers enforce `has_permission()` via RBAC join
- [x] **Custom roles** — `POST/GET/DELETE /v1/orgs/current/roles`; workspace owners create roles with any permission subset; audit logged
- [x] **Read-only / auditor role** — `viewer` system role seeded with `members:read` + `activity:read`; enforced via `has_permission()`
- [x] **Role inheritance** — implicit via `role_permissions` join; admin and owner accumulate all lower permissions through seeded assignments

#### Audit Depth
- [x] Auth events: login success, login failed, MFA verified, magic link sent
- [x] Session events: session created, session revoked, admin sessions revoked (`admin.user.sessions_revoked`)
- [x] Workspace events: workspace created, member invited, member removed
- [x] Policy events: tenant access updated, IP policy updated
- [x] Admin events: user paused (`admin.user.paused`), user resumed (`admin.user.resumed`)
- [x] OAuth events: token issued, token refreshed, token revoked
- [x] Client events: client created, client paused, secret rotated
- [x] **Before/after values** in policy change events — `workspace.auth_policy.updated` includes full before/after JSON
- [x] **Role change events** — `workspace.member.role_changed` logs before roles + new role + actor
- [x] **Invite lifecycle** — `workspace.invite.sent` and `workspace.invite.accepted` logged with invited email + actor
- [x] **API key lifecycle** — `api_key.created` (with label) and `api_key.revoked` (with label + key_prefix) both logged
- [x] **Audit log export** — `GET /v1/orgs/current/activity/export?format=csv|json`; frontend CSV/JSON buttons in PortalActivity; respects current search + filter
- [x] **Audit log retention** — `audit_log_retention_days` in `system_settings`; background task prunes daily; `null` = keep forever (migration 0032)
- [x] **SIEM integration** — `siem_webhook_url` + `siem_webhook_secret` in `system_settings`; every audit event POSTed fire-and-forget with `X-Rooiam-Signature: sha256=<hmac>` (migration 0033)

---

### 🔲 Phase 4 — Protocol Maturity + Security Hardening

*See [19_roadmap_2026-03-15.md](./19_roadmap_2026-03-15.md) for full detail and build order.*

#### Protocol Correctness (9 → 10)
- [ ] RFC-grade negative path coverage (bad PKCE, reused auth code, reused refresh token, bad scope, nonce mismatch)
- [ ] Exact RFC error response shapes on all OAuth/OIDC endpoints
- [ ] Stricter client authentication (confidential vs public enforcement)
- [ ] Stable claim guarantees (`sub` permanent; `email`/`name` scoped correctly)
- [ ] `end_session_endpoint` — RP-initiated logout with `post_logout_redirect_uri`
- [ ] Front-channel logout (iframe, optional per client)
- [ ] Back-channel logout (server POST, optional per client)
- [ ] Interop verified: NextAuth, oauth2-proxy, SPA PKCE client, mobile OIDC (AppAuth)

#### Security Architecture (8.5 → 10)
- [ ] OIDC signing key rotation — new key on demand; old key stays in JWKS until tokens expire; `kid` in all JWTs
- [ ] Secure email change flow — verify new address before switching; notify old address
- [ ] Provider unlink safety — block if last login method would be removed
- [ ] Anti-lockout safeguards — owner cannot remove last owner; policy change cannot lock out actor
- [ ] **Device trust** — `trusted_devices` table; post-MFA device tagging; skip MFA on trusted device; My Account → Trusted Devices
- [ ] Step-up auth (`acr_values`) — re-authenticate before email change, passkey removal, owner transfer
- [ ] Anomaly scoring — combine binding mismatch + suspicious login into risk score; high-risk = shorter TTL
- [ ] Admin suspicious activity queue — platform view of recent `auth.login.suspicious` events
- [ ] Alert thresholds — N failed logins in T minutes → notify platform admin

---

### 🔲 Phase 5 — Control Plane + Developer Ecosystem

*Goal: Control plane 8 → 10/10; Developer ecosystem 4 → 8/10.*

#### Control Plane Maturity (8 → 10)
- [ ] Effective policy view — show platform default → tenant override → workspace override → effective result per dimension
- [ ] Policy change preview — warn if change would lock out active users
- [ ] Last-N policy snapshots + one-click restore
- [ ] Permission catalog page with plain-language descriptions
- [ ] Role diff view — compare two roles side by side
- [ ] Built-in role templates ("Billing Admin", "Support Agent", "Auditor")
- [ ] Scoped admin delegation with expiry
- [ ] Active sessions by workspace (platform admin view)
- [ ] Auth method usage stats per workspace
- [ ] Owner transfer flow (explicit handoff with confirmation)
- [ ] Self-lockout prevention on policy save

#### Developer Ecosystem (4 → 8)
- [ ] `@rooiam/client` JS/TS SDK — login redirect, token verification, user extraction, logout
- [ ] Next.js integration guide + middleware helper
- [ ] SPA PKCE reference app (Vite + React)
- [ ] `rooiam` Rust crate — token verification, Actix Web middleware
- [ ] Public docs site — quickstart-first, use-case structured, error reference
- [ ] Docker Compose quickstart — single command gives working instance with demo seed
- [ ] Versioned changelog with breaking change notes

---

### 🔲 Phase 6 — Platform Ecosystem

- [ ] Admin API keys with scoped permissions
- [ ] Prometheus metrics endpoint (active sessions, login rates, token issue rate per workspace)
- [ ] Structured JSON log output for aggregators
- [ ] Webhook system — tenant-configured endpoints for identity events
- [ ] Rate limit dashboards per tenant
- [ ] Terraform / Pulumi provider for workspace config
- [ ] Python SDK + Go SDK

---

### 🔲 Phase 7 — Enterprise Federation

*Only after real enterprise demand. Full detail in [19_roadmap_2026-03-15.md](./19_roadmap_2026-03-15.md).*

- [ ] SAML 2.0 SP (Okta, Azure AD, Google Workspace)
- [ ] SCIM provisioning + deprovisioning + group sync
- [ ] LDAP / Active Directory read sync
- [ ] JIT provisioning from SAML / SCIM
- [ ] Impersonation — platform admin acts as user with audit trail
- [ ] GDPR right to erasure
- [ ] PII masking in audit logs
- [ ] SOC2 / ISO 27001 audit report export
- [ ] Data residency controls
- [ ] Enterprise admin UX (federation wizard, troubleshooting log, mapping preview)

---

## Phase 3 Build Order (Updated)

| Priority | Item | Status |
|----------|------|--------|
| 1 | Audit before/after values for policy changes | ✅ Done |
| 2 | Role change + invite lifecycle audit events | ✅ Done |
| 3 | Domain restrictions per workspace | ✅ Done |
| 4 | Session timeout policy per workspace | ✅ Done |
| 5 | Role-scoped MFA (`require_mfa_for_admins`) | ✅ Done |
| 6 | Audit log export (CSV / JSON) | ✅ Done |
| 7 | Permission matrix + custom roles | ✅ Done |
| 8 | Audit log retention + SIEM webhook | ✅ Done |
| 9 | Concurrent session limit per user | ✅ Done |
| 10 | Session binding (server-side fingerprint) | ✅ Done |
| 11 | Suspicious session detection (new country/device) | ✅ Done |

---

## Phase 3 Changes Applied (2026-03-15)

### Migration
- `0031_phase3_advanced_policies.sql` — adds `allowed_email_domains TEXT NOT NULL DEFAULT ''`, `max_session_age_hours INTEGER`, `require_mfa_for_admins BOOLEAN NOT NULL DEFAULT FALSE` to `organizations`

### Backend
| File | Change |
|------|--------|
| `organization/models.rs` | 3 new fields on `Organization` struct |
| `organization/repository.rs` | All RETURNING/SELECT clauses updated; new `is_org_admin_or_owner()` helper |
| `organization/service.rs` | `update_auth_policy` extended; domain normalization; domain check on `accept_invite` |
| `organization/handlers.rs` | Request struct extended; audit before/after for policy change; role change audit; invite sent/accepted audit |
| `shared/auth_policy.rs` | New `ensure_email_domain_allowed()` function |
| `auth/handlers.rs` | Domain check after magic link verify; `workspace_requires_mfa` now ORs in `require_mfa_for_admins` |
| `oauth/handlers.rs` | Domain check before OAuth session creation (redirects with error); `workspace_requires_mfa` updated in both demo and real OAuth paths |
| `webauthn/handlers.rs` | `workspace_requires_mfa` updated for passkey flow |
| `session/models.rs` | `created_at` added to `ActiveSession` |
| `session/service.rs` | Populates `created_at` in `ActiveSession` |
| `http/middleware/auth.rs` | After IP check: loads org `max_session_age_hours`, revokes and rejects sessions that exceed the limit |

### Frontend
| File | Change |
|------|--------|
| `portal-types.ts` | `Organization` gets 3 new fields; `AuthPolicyForm` type exported |
| `PortalSignIn.tsx` | Imports `AuthPolicyForm` from types; "Workspace access rules" section adds `require_mfa_for_admins` toggle, `allowed_email_domains` text input, `max_session_age_hours` number input |
| `PortalHome.tsx` | State init, org-load sync, save-response sync all updated; `max_session_age_hours` serialized as `number \| null` in PATCH body |

---

## Phase 3 Remaining Items Applied (2026-03-15, session 2)

### Migrations
- `0032_audit_log_retention.sql` — seeds `audit_log_retention_days = null` in `system_settings`
- `0033_siem_webhook.sql` — seeds `siem_webhook_url` and `siem_webhook_secret` in `system_settings`

### Backend
| File | Change |
|------|--------|
| `organization/handlers.rs` | `api_key.revoked` audit now includes `label` + `key_prefix` in metadata; new `export_current_org_activity` handler + route `GET /orgs/current/activity/export` |
| `rbac/repository.rs` | Added `list_permissions()`, `create_custom_role()`, `delete_custom_role()`, `get_role_permissions()` |
| `rbac/handlers.rs` | New file — `GET/POST /v1/orgs/current/roles`, `GET /v1/orgs/current/roles/permissions`, `DELETE /v1/orgs/current/roles/{id}`; all guarded by `roles:manage` permission; audit logged |
| `rbac/mod.rs` | Enabled `handlers` module |
| `bootstrap/router.rs` | Registered `rbac::handlers::routes` |
| `shared/audit_retention.rs` | New file — daily background task that reads `audit_log_retention_days` and prunes `audit_logs` |
| `shared/mod.rs` | Registered `audit_retention` module |
| `modules/audit/service.rs` | `log()` now returns the inserted row id + created_at; spawns fire-and-forget Tokio task to POST to `siem_webhook_url` with HMAC-SHA256 signature |
| `Cargo.toml` | Added `hmac = "0.12"` |
| `main.rs` | Spawns `audit_retention::spawn_audit_retention_task` after state init |

### Frontend
| File | Change |
|------|--------|
| `PortalActivity.tsx` | Added `Download` icon + `getApiBase` import; `exporting` state + `handleExport(format)` function; CSV and JSON export buttons in filter bar, disabled while exporting |

---

## Phase 3 Advanced Session Items + Security Hardening (2026-03-15, session 3)

### Migrations
- `0034_concurrent_session_limit.sql` — `ALTER TABLE organizations ADD COLUMN max_concurrent_sessions INTEGER`
- `0035_session_binding.sql` — `ALTER TABLE sessions ADD COLUMN session_fingerprint TEXT`

### Backend
| File | Change |
|------|--------|
| `organization/models.rs` | `max_concurrent_sessions: Option<i32>` added to `Organization` |
| `organization/repository.rs` | `max_concurrent_sessions` in all RETURNING/SELECT clauses; `update_organization_auth_policy` extended with `$10` param |
| `organization/service.rs` | `update_auth_policy` extended with `max_concurrent_sessions: Option<i32>` |
| `organization/handlers.rs` | Request struct + audit before/after extended; search length capped to 256 chars; CSV export: formula injection prevention (tab prefix for `=+−@`); `max_concurrent_sessions` UI field wired |
| `session/models.rs` | `session_fingerprint: Option<String>` added to `Session` and `ActiveSession` |
| `session/repository.rs` | `create_session` stores fingerprint; `get_valid_session` + `get_sessions_by_user_id` include `session_fingerprint`; new `revoke_oldest_sessions_for_org()` and `get_recent_session_user_agents()` helpers |
| `session/service.rs` | `SessionService::new` now takes `db: PgPool`; concurrent session limit enforced after creation; suspicious login detection (new device class → `auth.login.suspicious`); fingerprint populated in `ActiveSession` |
| `http/middleware/auth.rs` | Session binding check: if stored fingerprint differs from current, logs `auth.session.binding_mismatch`; User-Agent capped to 512 chars |
| `shared/session_fingerprint.rs` | New module: `compute()`, `device_class()`, `ip_subnet()` helpers |
| `shared/mod.rs` | Registered `session_fingerprint` module |
| `modules/audit/service.rs` | SSRF protection: `is_safe_webhook_url()` blocks loopback + RFC-1918 private ranges before posting webhook |
| `shared/auth_policy.rs` | `ensure_email_domain_allowed()` rejects emails with multiple `@` chars |
| All handler files using `SessionService` | Updated `SessionService::new(repo)` → `SessionService::new(repo, state.db.clone())` |

### Frontend
| File | Change |
|------|--------|
| `portal-types.ts` | `Organization` gets `max_concurrent_sessions: number \| null`; `AuthPolicyForm` gets `max_concurrent_sessions: string` |
| `PortalSignIn.tsx` | New "Max concurrent sessions per user" number input in Workspace access rules section |
| `PortalHome.tsx` | State init, org-load sync, save-response sync, and PATCH body all include `max_concurrent_sessions` |

---

## Admin UX Improvements (2026-03-15)

Applied across `rooiam-admin` and `rooiam-app`:

- Per-page selector (20 / 50 / 100 / 500 / 1000) on all list pages
- Audit logs and tenant member lists default to 50; all other lists default to 20
- Scrollbar hidden by default, shows as 4px on hover (both sidebar and main content)
- My Account defaults to Linked Accounts tab on first visit
- All tabbed pages persist last visited tab to localStorage
- Tenant Members rows are now clickable — navigate to MemberDetail with correct back link
- MemberDetail back link context-aware (Back to Members vs Back to Tenant Members)
- MemberDetail audit log link routes to correct log scope
- Admin session revocation: new Active Sessions section in MemberDetail
  - Lists device, IP, last seen per session
  - "Sign out all sessions" button (lighter than Pause — no account status change)
  - Rank enforcement: Platform Owner > Platform Admin > Tenant Owner/Admin > User

---

## Current Role Model

Platform:
- `Platform Owner` — `is_platform_owner` flag, full access including Settings
- `Platform Admin` — `is_superuser` flag, operational access, no Settings

Workspace:
- `Workspace Owner` — role code `owner`
- `Workspace Admin` — role code `admin`
- `User` — role code `member`

Removed (deferred):
- `Platform Staff`, `Workspace Staff` — not enough permission depth to justify complexity yet

---

## Current Navigation Model

### `rooiam-admin` (port 5171)

- `Platform` — Overview, Settings (owner only)
- `Admin` — Members, Access, Audit Logs
- `Tenant` — Members, Workspaces, Apps, Access, Workspace Rules, Audit Logs
- `My` — Profile, Account

### `rooiam-app` (port 5172)

- `Workspace` — Overview, Branding, Sign-In, Members, Apps, API Keys, Activity
- `Tenant` — Access (tenant admin login methods), IP Policy
- `My` — Profile, Account (linked accounts, sessions, security)

---

## Demo Accounts

| Account | Role | Portal |
|---------|------|--------|
| `owner@rooiam.demo` | Platform Owner | rooiam-admin (5171) |
| `admin@rooiam.demo` | Platform Admin | rooiam-admin (5171) |
| `coco@roochoco.demo` | Workspace Owner (roochoco) | rooiam-app (5172) |
| `minty@mintmallow.demo` | Workspace Owner (mintmallow) | rooiam-app (5172), MFA required |

---

## Known Open Issues

See [05_known_issues.md](./05_known_issues.md) for full detail.

- Issue 8 (Demo branding overwritten on restart) — by design, open

All issues 1–7 fixed as of 2026-03-12.

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
```
