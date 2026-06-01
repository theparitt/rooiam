# Rooiam System Feature Test Checklist

Use this checklist to track manual and automated verification across the full Rooiam system.

Surfaces covered:

- `rooiam-server`
- `rooiam-admin`
- `rooiam-app`
- `rooiam-demo`
- `rooiam-landing`
- `rooiam-docs`

Important:

- check only what was actually verified
- leave browser-dependent or email/device/provider-dependent flows unchecked until exercised
- use this as the release checklist for `v1`

## Automated Checks Already Run

CLI-verified on `2026-03-12`:

- [x] `rooiam-server` passes `cargo check`
- [x] `rooiam-admin` passes `npm run build`
- [x] `rooiam-app` passes `npm run build`
- [x] `rooiam-demo` passes `npm run build`
- [x] `rooiam-landing` passes `npm run build`
- [x] `rooiam-docs` passes `npm run build`
- [x] `docker-compose.demo.yml` resolves with `docker compose config`
- [x] `docker-compose.prod.yml` resolves with `docker compose config`
- [x] built `rooiam-admin` preview serves HTML on `/`
- [x] built `rooiam-admin` Docker image serves HTML on `/`
- [x] built `rooiam-admin` Docker image serves HTML on `/login`
- [x] built `rooiam-app` preview serves HTML on `/`
- [x] built `rooiam-demo` preview serves HTML on `/`
- [x] built `rooiam-landing` preview serves HTML on `/`
- [x] built `rooiam-docs` preview serves HTML on `/`
- [x] server starts cleanly from zero in normal mode on a throwaway Postgres + Redis stack
- [x] server starts cleanly from zero in demo mode on a throwaway Postgres + Redis stack
- [x] `/health` returns 200 on running normal-mode and demo-mode servers
- [x] `sqlx migrate run --database-url "$ROOIAM_DATABASE_URL"` succeeds on a fresh throwaway database
- [x] `reset_rooiam_db.sh` resets a throwaway database and leaves `rooiam-server/.env` in place
- [x] authenticated branding upload returns a `/media/...` URL and the served bytes match the uploaded file
- [x] Redis-backed auth rate limiting returns `429` after the configured request burst
- [x] setup status reports the expected pre-init state on a fresh throwaway database
- [x] setup public URL defaults match the configured env values on first boot
- [x] first platform admin creation succeeds on a fresh throwaway database
- [x] SMTP setup config can be saved during bootstrap
- [x] Google OAuth setup config can be saved during bootstrap
- [x] Microsoft OAuth setup config can be saved during bootstrap
- [x] setup completion locks unauthenticated setup endpoints down afterward
- [x] non-loopback setup access is blocked without `ROOIAM_SETUP_TOKEN`
- [x] `rooiam-admin` login page stays stable in the browser without a reload loop on an isolated stack
- [x] `rooiam-admin` magic-link sign-in works on an isolated stack with MailHog
- [x] `rooiam-admin` dashboard renders live admin data on an isolated stack
- [x] `rooiam-admin` Users page renders and browser search works on an isolated stack
- [x] `rooiam-admin` Workspaces page renders and shows correct counts on an isolated stack
- [x] `rooiam-admin` Apps page renders and app registration succeeds where allowed on an isolated stack
- [x] `rooiam-admin` Audit Logs page renders on an isolated stack
- [x] `rooiam-admin` Settings page renders on an isolated stack
- [x] `rooiam-admin` platform IP policy save path works on an isolated stack
- [x] `rooiam-admin` workspace-governance save path works on an isolated stack

Scope note:

- these checks confirm buildability, compose resolution, and basic static delivery
- they do not confirm real auth, database mutation, email delivery, passkey hardware flows, or social-provider end-to-end behavior

## 1. Server Core

- [x] `cargo check` passes
- [x] server starts cleanly with normal mode config
- [x] server starts cleanly with demo mode config
- [x] `/health` returns 200 OK on a running instance
- [x] migrations run cleanly from zero
- [x] reset script wipes DB state without deleting `.env`
- [x] uploaded media path works
- [x] Redis-backed rate limiting works

## 2. Setup And Bootstrap

- [x] setup status endpoint reports expected state before first admin exists
- [x] public URL defaults match env values
- [x] first platform admin can be created
- [x] SMTP config can be saved
- [x] Google OAuth config can be saved
- [x] Microsoft OAuth config can be saved
- [x] setup completion locks setup endpoints down afterward
- [x] remote setup is blocked without loopback or `ROOIAM_SETUP_TOKEN`

## 3. Platform Admin (`rooiam-admin`)

- [x] `npm run build` passes
- [x] static root route serves HTML
- [x] static nested route serves HTML
- [x] admin login page loads in the browser without reload loop
- [x] admin magic-link sign-in works
- [x] admin passkey sign-in works if enabled
- [ ] admin Google sign-in works when configured
- [ ] admin Microsoft sign-in works when configured
- [x] dashboard loads real data
- [x] users page loads and search works
- [x] workspaces page loads and shows correct counts
- [x] apps page loads and app registration works where allowed
- [x] audit log page loads
- [x] settings page loads
- [x] SMTP test works or returns a clear error
- [x] IP policy settings save correctly
- [x] workspace-governance settings save correctly

Reference:

- [Rooiam Admin Test Checklist](./09_rooiam_admin_test_checklist.md)

## 4. Tenant Login And Portal (`rooiam-app`)

- [x] `npm run build` passes
- [x] static root route serves HTML
- [ ] login entry page loads
- [ ] workspace-branded login page loads for `?org=...`
- [ ] magic-link start works
- [ ] magic-link verify works
- [ ] passkey login works
- [ ] MFA challenge flow works
- [ ] Google sign-in works when configured
- [ ] Microsoft sign-in works when configured
- [ ] workspace switcher works
- [ ] overview page loads
- [ ] branding page loads and save works
- [ ] sign-in policy page loads and save works
- [ ] staff page loads and invite flow works
- [ ] apps page loads and register-app flow works
- [ ] API keys page loads and create/revoke works
- [ ] activity page loads
- [ ] blocked-IP policy shows a clear end-user/admin message when triggered

Reference:

- [Rooiam App Demo Validation — 2026-03-14](./16_rooiam_app_demo_validation_2026-03-14.md)

## 5. Downstream Client Demo (`rooiam-demo`)

- [x] `npm run build` passes
- [x] static root route serves HTML
- [ ] demo app root loads in browser
- [ ] login redirect to Rooiam works
- [ ] callback handling works
- [ ] session view loads after login
- [ ] logout works
- [ ] RooChoco customer flow works
- [ ] MintMallow customer flow works
- [ ] demo app reflects tenant branding correctly

## 6. Demo Mode And Demo OAuth

- [x] demo seed creates expected users and workspaces
- [x] demo admin login shortcut works
- [ ] demo Google provider page works
- [ ] demo Microsoft provider page works
- [x] root demo login resolves without placeholder redirect bugs
- [ ] demo provider continue flow is protected against login CSRF
- [ ] demo account selected for the requested workspace is correct
- [ ] demo user must belong to the requested workspace
- [x] demo-only data isolation holds for admin pages and audit views
- [x] demo reset and reseed restores only seeded demo data

## 7. OAuth / OIDC

- [ ] Google OAuth login works end to end
- [ ] Microsoft OAuth login works end to end
- [ ] OAuth account linking works only for verified provider email matches
- [ ] OIDC discovery endpoint responds
- [ ] JWKS endpoint responds
- [ ] authorize endpoint works with a valid client
- [ ] token endpoint exchanges a code successfully
- [ ] `userinfo` returns expected claims
- [ ] workspace app policy enforcement blocks disallowed clients

## 8. Security And Session Features

- [ ] passkey registration works
- [ ] passkey deletion works
- [ ] TOTP enrollment works
- [ ] TOTP verify works
- [ ] recovery code flow works
- [ ] current session listing works
- [ ] revoke single session works
- [ ] revoke all sessions works
- [ ] audit logs record key auth/security events
- [ ] trusted proxy / forwarded-IP behavior matches deployment expectations

### 8a. Automated Hurl Tests Added (2026-03-17)

The following test files cover the security scenarios identified in the admin UI review:

| File | What It Tests |
|---|---|
| `test/50_magic_link_security.http` | Expired token rejected, replay rejected, anti-enumeration, forged session cookie |
| `test/51_role_guard_matrix.http` | Full privilege matrix: unauth/member/superuser/owner against every guarded endpoint |
| `test/52_suspend_session_revocation.http` | Suspend user → existing session 401 immediately; suspend org → member login blocked |
| `test/53_audit_log_coverage.http` | Admin actions produce log entries; pagination non-overlapping; action filter works |
| `test/54_client_secret_rotation.http` | New secret returned; second rotation differs; suspend/resume client; member blocked |
| `test/55_profile_input_validation.http` | Empty/whitespace display name rejected; search="" returns all; page beyond total returns empty |

Run all new tests:
```bash
cd /home/theparitt/work/rooiam
hurl --variables-file test/dev.vars test/50_magic_link_security.http
hurl --variables-file test/dev.vars test/51_role_guard_matrix.http
hurl --variables-file test/dev.vars test/52_suspend_session_revocation.http
hurl --variables-file test/dev.vars test/53_audit_log_coverage.http
hurl --variables-file test/dev.vars test/54_client_secret_rotation.http
hurl --variables-file test/dev.vars test/55_profile_input_validation.http
```

Or run all together:
```bash
hurl --variables-file test/dev.vars test/5{0,1,2,3,4,5}_*.http
```

## 9. Workspace And Access Governance

- [ ] create workspace works within allowed limits
- [ ] max workspaces per user is enforced
- [ ] workspace IP policy inheritance/override works
- [ ] workspace client governance inheritance/override works
- [ ] max apps per workspace is enforced
- [ ] workspace member role switching works
- [ ] workspace invite acceptance works

## 10. Landing And Docs

- [x] `rooiam-landing` passes `npm run build`
- [x] `rooiam-docs` passes `npm run build`
- [x] landing static root route serves HTML
- [x] docs static root route serves HTML
- [ ] landing page loads in browser
- [ ] docs app loads in browser
- [ ] landing links to docs correctly in deployed shape
- [ ] docs links back to landing correctly in deployed shape

## 11. Docker And Deployment

- [x] `docker-compose.demo.yml` resolves
- [x] `docker-compose.prod.yml` resolves
- [ ] demo Docker stack boots and serves all expected ports
- [ ] production Docker stack boots with custom env file
- [ ] server health works inside demo Docker stack
- [ ] admin works inside demo Docker stack
- [ ] app works inside demo Docker stack
- [ ] demo app works inside demo Docker stack
- [ ] docs works inside demo Docker stack
- [ ] landing works inside demo Docker stack

## 12. Release Gate

Before calling the system release-ready, confirm:

- [ ] setup/bootstrap passed
- [ ] platform admin core flows passed
- [ ] tenant portal core flows passed
- [ ] downstream client demo passed
- [ ] OAuth / OIDC integration passed
- [ ] session and MFA security flows passed
- [ ] governance and policy enforcement passed
- [ ] Docker quickstart passed
- [ ] no known infinite-loading or reload-loop regressions remain
