# Rooiam Admin Demo Validation — 2026-03-13

This note records the manual demo-mode validation that was completed on `rooiam-admin` (`5171`) on March 13, 2026.

Scope:

- demo-mode platform admin sign-in and navigation
- limited-access demo user behavior inside `rooiam-admin`
- demo-only data isolation
- demo-seeded assets and app visibility
- demo reset and reseed behavior

Mode under test:

- `ROOIAM_ENABLE_DEMO_SEED=true`

Validated demo accounts:

- `admin@rooiam.demo`
- `rooroo@sweetfactory.demo`

## Confirmed Good

- Magic-link sign-in works for `admin@rooiam.demo`
- Demo passkey sign-in works and immediately lands in the dashboard when no extra MFA step is required
- Logout works correctly
- Session persists after refresh
- Bad or expired magic links show a clear error
- Demo SMTP is locked to MailHog and test email works
- Demo Redis is locked and connection test works
- OAuth, public URL, and workspace-governance settings show a clear locked state in demo mode
- `rooroo@sweetfactory.demo` does not see platform data
- Limited-access users no longer see platform-only admin navigation items
- `admin@rooiam.demo` sees the full platform admin navigation again after the role-flag fix
- `Platform > Apps` shows the seeded demo apps
- `Platform > Workspaces` detail view is correct
- `Platform > Audit Logs` only shows demo activity
- Workspace logos render correctly in:
  - `Platform > Workspaces`
  - `Platform > Members`
- Member profile avatars render correctly in `Platform > Members`
- `Platform > Members` opens a real member detail view
- Member detail shows:
  - platform role flags
  - workspace memberships
  - recent activity
- Safe lifecycle control is now present for members:
  - pause
  - resume
- Compact workspace/logo displays were simplified successfully for demo readability:
  - list-style workspace displays use circular icons
  - login surfaces still retain richer login-logo branding rules
- Full demo reset and reseed behavior is correct:
  - old data is removed
  - only seeded demo data comes back
  - demo superuser remains `admin@rooiam.demo`

## Demo Expectations Locked By This Pass

- Limited-access demo users inside `rooiam-admin` should not be treated like platform admins
- `rooiam-admin` demo mode should only expose demo-seeded data
- Demo visual identity should include:
  - workspace logos
  - member avatars
  - seeded app/workspace presence instead of empty state
- Demo infrastructure controls may be testable, but must remain locked where they imply real production editing

## Remaining Manual Admin Demo Checks

- Google demo sign-in from the admin surface if explicitly enabled for admin use
- Microsoft demo sign-in from the admin surface if explicitly enabled for admin use
- user-session inspection/revoke from the new member detail flow
- linked-identity visibility on member detail if that becomes part of the platform-admin scope
- any additional demo-only empty-state polishing on pages not exercised in this pass

## Notes

- The admin shell footer now reflects actual scope:
  - `Platform Owner`
  - `Platform Admin`
  - `Limited Access`
- Demo-mode validation here is intentionally separate from production validation. Demo convenience must remain gated by demo mode only.
