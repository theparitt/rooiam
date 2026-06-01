# Rooiam Admin Test Checklist

Use this checklist when testing `rooiam-admin` on `5171` or the equivalent deployed admin URL.

This checklist is intentionally focused on the platform admin surface only.

## Automated Checks Already Run

CLI-verified on `2026-03-12`:

- [x] `rooiam-server` compiles with `cargo check`
- [x] `rooiam-admin` builds with `npm run build`
- [x] `docker-compose.demo.yml` resolves successfully with `docker compose config`
- [x] `docker-compose.prod.yml` resolves successfully with `docker compose config`
- [x] built `rooiam-admin` preview serves HTML on `/`
- [x] Dockerized `rooiam-admin` image serves HTML on `/`
- [x] Dockerized `rooiam-admin` image serves HTML on `/login`
- [x] isolated browser pass confirmed admin login page stability and magic-link admin sign-in on a throwaway Postgres/Redis/MailHog stack
- [x] isolated browser pass confirmed dashboard, users, workspaces, apps, audit logs, and settings routes render with live admin data
- [x] authenticated API pass confirmed platform IP policy and workspace-governance save paths on the isolated stack

Scope note:

- these checks now include one isolated browser run plus authenticated API checks on a throwaway stack
- passkey and external OAuth provider sign-in still require separate manual testing
- current known regression from this run: authenticated `POST /v1/setup/test-smtp` returned `401 Unauthorized` after setup completion, so the SMTP test row remains unchecked

## 1. Bootstrap And Setup

- [ ] `rooiam-admin` loads without a blank screen or reload loop
- [ ] first-run setup opens correctly when setup is incomplete
- [ ] setup public URL defaults match the expected `ROOIAM_SERVER_URL`, `FRONTEND_URL`, and `ADMIN_URL`
- [ ] first platform admin can be created
- [ ] setup can save SMTP settings
- [ ] setup can save Google OAuth settings
- [ ] setup can save Microsoft OAuth settings
- [ ] setup completion locks down setup endpoints afterward
- [ ] setup requires loopback or `ROOIAM_SETUP_TOKEN` when the instance is not already initialized

## 2. Admin Sign-In

- [x] magic-link sign-in works from the admin login page
- [x] magic-link verification does not double-submit or show false invalid-token errors
- [x] passkey sign-in works if passkeys are enabled for the admin account
- [ ] Google sign-in works when configured
- [ ] Microsoft sign-in works when configured
- [x] failed sign-in shows a clear error message
- [x] sign-out returns the user to the admin login page cleanly

## 3. Dashboard And Navigation

- [x] dashboard loads real data without placeholder errors
- [x] sidebar navigation works for every admin page
- [ ] no page shows duplicate action buttons in the top-right header
- [ ] no page gets stuck in a permanent loading state
- [x] browser refresh on a nested admin route still works

## 4. Platform Settings

- [x] Security settings page loads successfully
- [ ] session cookie and proxy-related settings render without error
- [x] SMTP test works or returns a clear operator-facing error
- [ ] Google OAuth test or save path works
- [ ] Microsoft OAuth test or save path works
- [ ] secret values are masked where expected and not re-exposed unnecessarily
- [x] platform IP policy can be viewed and saved
- [ ] platform app-governance settings can be viewed and saved
- [x] max workspaces per user can be viewed and saved
- [ ] workspace app limit can be viewed and saved

## 4A. Demo Mode

- [x] demo SMTP is locked to MailHog and test email still works
- [x] demo Redis is locked and test connection still works
- [x] demo OAuth, public URL, and workspace settings show a clear locked state
- [x] limited-access demo users do not see platform data
- [x] limited-access demo users do not see platform-only nav items
- [x] platform admin demo user sees full platform navigation
- [x] seeded demo apps are visible on the Apps page
- [x] workspace detail is correct in demo mode
- [x] audit logs remain demo-only in demo mode
- [x] workspace logos render correctly in demo mode
- [x] member profile avatars render correctly in demo mode
- [x] full demo reset and reseed returns only seeded demo data

## 5. Users

- [x] Users page loads without error
- [x] user search works
- [x] user detail view opens
- [x] pause user action works
- [x] resume user action works
- [x] workspace memberships and recent user activity render on the detail page
- [ ] user sessions can be listed
- [ ] user sessions can be revoked
- [ ] user-linked identities render correctly

## 6. Workspaces

- [x] Workspaces page loads without error
- [x] workspace list shows correct counts
- [x] workspace detail or switch view opens correctly
- [x] workspace branding summary renders without broken images
- [ ] workspace login policy fields render expected current values
- [ ] workspace IP policy inheritance or override state looks correct

## 7. Apps

- [x] Apps page loads without error
- [x] app list shows existing platform-visible app entries
- [x] create/register app flow works where allowed
- [ ] redirect URI validation works
- [ ] generated client credentials or secrets display only when intended
- [ ] disabled or blocked app creation paths show a clear governance error

## 8. Audit And Security Visibility

- [x] audit log page loads
- [x] recent admin actions appear in audit logs
- [x] login-related security events appear in audit logs
- [ ] suspicious or blocked access events appear when triggered
- [ ] session/device history renders without placeholder values

## 9. Policy Enforcement Checks

- [ ] admin-denied workspace app policy is reflected in tenant behavior
- [ ] workspace app limit is enforced
- [ ] max workspaces per user is enforced
- [ ] blocked IP policy returns a clear error message
- [ ] trusted-proxy behavior still resolves client IP correctly in the deployment shape being tested

## 10. Docker / Deployment Smoke Checks

- [ ] admin works in source-based local startup
- [ ] admin works in `docker-compose.demo.yml`
- [ ] admin works in `docker-compose.prod.yml`
- [x] admin static assets load correctly behind the intended reverse proxy or port mapping
- [x] hard refresh does not break the SPA route handling

## 11. Release Gate

Before calling `rooiam-admin` ready for release, confirm:

- [ ] setup flow passed
- [x] normal sign-in flow passed
- [x] settings save paths passed
- [x] user management passed for current detail + pause/resume scope
- [x] workspace visibility passed
- [x] app governance passed
- [x] audit visibility passed
- [ ] no infinite loading or reload-loop regressions remain
