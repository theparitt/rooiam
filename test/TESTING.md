# Rooiam Test Guide

This guide is for the automated Hurl suite in this folder.

Authoritative defaults:
- mode: `ROOIAM_MODE=test`
- vars file: `test.vars`
- runner: `bash run_tests.sh`

`demo` mode is now secondary/manual tooling, not the primary regression-test path.

## Quick Start

```bash
# 1. Start server in test mode (from rooiam-server/)
ROOIAM_MODE=test SQLX_OFFLINE=true cargo run

# 2. Run all tests (from test/)
cd test/
bash run_tests.sh

# Verbose output on failure
bash run_tests.sh --verbose

# Single file
bash run_tests.sh 03_demo_login.hurl
```

If the server is not running in `ROOIAM_MODE=test`, this suite is expected to fail.
The main symptom is `404` on `/v1/test/login`.

## Why `--jobs 1` is Required

Hurl runs files in parallel by default. These tests **cannot** run in parallel because:

- All files share the same seeded user sessions (same DB)
- One file logging out a session can invalidate another file's session mid-test

Always use `--jobs 1` when running the full suite. `run_tests.sh` enforces this automatically.

## Server Mode

Tests require `ROOIAM_MODE=test`. **Never run test mode against your real database.**

Test mode calls `TRUNCATE TABLE ... CASCADE` on startup — it wipes everything.
The server will panic and refuse to start if `ROOIAM_DATABASE_URL` does not contain the word `test`.

Always use a dedicated test database:
```bash
ROOIAM_MODE=test ROOIAM_DATABASE_URL=postgres://user:pass@host:5432/rooiam_test SQLX_OFFLINE=true cargo run
```

| Mode | Demo login | Test login | Rate limits | Wipe on startup |
|------|-----------|-----------|-------------|-----------------|
| `production` | no | no | strict | no |
| `demo` | yes | no | strict | no |
| `test` | yes | yes | **unlimited** | **yes** |

Test mode wipes and reseeds all data on every startup — guaranteed clean state.

Demo mode still has value for:
- manual showcase
- UI QA
- checking seeded `.demo` identities and branded workspaces

But demo mode is not the authoritative mode for the Hurl suite because:
- it does not expose `/v1/test/login`
- it keeps strict rate limits
- it is not designed for deterministic automation

## Test Users

Defined in [test.vars](/home/theparitt/work/rooiam/test/test.vars) and seeded fresh on every server startup in test mode:

| Variable | Email | Org | Role |
|----------|-------|-----|------|
| `platformOwnerEmail` | `owner@rooiam.test` | `rooiam-test` | Platform owner + superuser |
| `platformAdminEmail` | `admin@rooiam.test` | `rooiam-test` | Superuser (not platform owner) |
| `tenantOwnerEmail` | `rooroo@sweetfactory.test` | `roochoco-test` + `mintmallow-test` | Org owner of both |
| `rooChocoMemberEmail` | `praline@roochoco.test` | `roochoco-test` | Member |
| `mintMallowMemberEmail` | `peppermint@mintmallow.test` | `mintmallow-test` | Admin |

Additional seeded user not in `test.vars` (used directly in hurl files):

| Email | Org | Role | Used for |
|-------|-----|------|----------|
| `truffle@roochoco.test` | `roochoco-test` | Admin | Role/permission tests |
| `ganache@roochoco.test` | `roochoco-test` | Member | IDOR tests |
| `spearmint@mintmallow.test` | `mintmallow-test` | Admin | MFA tests |
| `lulu@softmallow.test` | `mintmallow-test` | Member | IDOR + permission-denial tests |
| `toffee@rooiam.test` | `rooiam-test` | Admin (superuser) | Platform staff tests |

### Why lulu@softmallow.test?

`lulu` is a mintmallow member with the `member` role (members:read only, no auth_policy:manage, no members:invite, no activity:read). She exists in a different domain (`softmallow.test`) from mintmallow on purpose — so tests that need a low-privilege mintmallow user don't interfere with the `peppermint`/`spearmint` admin accounts. Use lulu for IDOR and permission-denial tests in mintmallow.

## Test Login

Every test file logs in at the top using `/v1/test/login`:

```
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
sessionCookie: cookie "rooiam_sid"
```

Rules for `/v1/test/login`:
- **Email is required** — missing or blank → 400
- **Email must end in `.test`** — any other TLD → 400 (e.g., `.com`, `.demo`, `.user` all rejected)
- `org_slug` is optional — if omitted, derived from the email domain (e.g., `roochoco.test` → `roochoco-test`)
- If the email is not in the seed, the user is created on the fly with the derived slug as their org

## Writing New Tests

### File naming

Number sequentially: `57_my_feature.hurl`. Add an entry to the table in `README.md`.

### Structure

Every file must be self-contained:

```
# 1. Login at the top — capture session cookie
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
sessionCookie: cookie "rooiam_sid"

###

# 2. Your tests

###

# 3. Clean up anything you created (role, client, API key, etc.)
```

### Choosing which user to log in as

| Need | Use |
|------|-----|
| Platform admin endpoints (`/v1/admin/*`) | `{{platformOwnerEmail}}` or `{{platformAdminEmail}}` |
| Org owner actions (invite, roles, clients) | `{{tenantOwnerEmail}}` |
| Regular roochoco user (members:read only) | `{{rooChocoMemberEmail}}` (`praline@roochoco.test`) |
| Low-privilege mintmallow user | `lulu@softmallow.test` |
| MFA-required workspace admin | `{{mintMallowMemberEmail}}` (`peppermint@mintmallow.test`) |

### Cleanup is critical

If your test creates something (OAuth client, role, API key, invite), **delete it at the end**.
Since test mode wipes everything on restart, a server restart also cleans up — but don't rely on it mid-run.

The 5-app limit per org is the most common victim of missing cleanup. If test N creates a client and doesn't delete it, tests N+1 through N+5 will eventually hit "Workspace app limit reached".

### Avoid hardcoded emails and slugs

Use `test.vars` variables (`{{rooChocoMemberEmail}}`, `{{rooChocoWorkspace}}`) rather than hardcoded values. Never hardcode `.test` emails or `-test` slugs directly in hurl files.

For editor/manual demo-oriented requests, use the `demo` environment in [00_env.yaml](/home/theparitt/work/rooiam/test/00_env.yaml). Do not add a second Hurl vars file again.

### State isolation between tests

Each file gets its own session cookie via `[Captures]`. Do not share a session cookie across files.

If your test intentionally modifies shared state (e.g. IP policy, auth policy, risk policy), restore the original value at the end of the file.

---

## Known Failures and How to Fix Them

### "Workspace app limit reached" (400 on `POST /v1/orgs/current/clients`)

**Cause:** A test created an OAuth client and didn't delete it. After 5+ creates across multiple tests, the org is full.

**Fix:** Restart the server — test mode wipes everything on startup.

**Prevention:** Every test that creates an OAuth client must `DELETE /v1/orgs/current/clients/{{clientId}}` at the end of the file.

---

### "403 Forbidden: This account is not active"

**Cause:** An earlier test suspended a user (e.g., `PATCH /v1/admin/users/{id}/status`), and that user is used by a later test.

**Fix:** Restart the server — seed resets all user statuses to `active`.

**Prevention:** Tests that suspend a user must unsuspend them before the file ends. Check `52_suspend_session_revocation.hurl` for the pattern.

---

### "You do not have permission to view company members" (403 on `GET /v1/orgs/current/members`)

**Cause:** A seeded user has no role assigned. This happens if `ensure_member_with_role` looks up a role by `organization_id = $1` — system roles have `organization_id = NULL` and won't match.

**Fix:** The role lookup in `test_seed.rs::ensure_member_with_role` must use:
```sql
WHERE (organization_id = $1 OR organization_id IS NULL) AND code = $2
ORDER BY organization_id NULLS LAST LIMIT 1
```
This prefers org-specific roles but falls back to system roles.

**Warning:** If you add a new user to a seeded org via `ensure_member_with_role` and that user has no permissions, this is almost certainly why.

---

### `/v1/test/login` returns 200 for empty or missing email

**Cause:** The old code had a default fallback to `pixel@neoncat.test` when email was absent or blank. That meant `{}` and `{ "email": "" }` both logged in successfully, breaking tests that expected 400.

**Fix:** Email is now required. The handler immediately returns 400 if email is missing or blank.

**Warning:** Do not add back a default email fallback to `test_login`. Tests in `03_demo_login.hurl` explicitly verify that blank/missing email is rejected.

---

### Audit log filter `?action=success` returns total=0

**Cause:** `GET /v1/admin/audit-logs?action=success` queries platform-org logs only (`is_platform_org = true`). If the rooiam-test org is not flagged as the platform org, login events are recorded but the query skips them.

**Fix:** `test_seed.rs` must set `is_platform_org = true` on the rooiam-test org after creating it:
```rust
sqlx::query("UPDATE organizations SET is_platform_org = true WHERE id = $1")
    .bind(platform_org.id).execute(pool).await?;
```

**Warning:** `org_repo.create_organization()` does not set `is_platform_org`. It defaults to `false`. You must set it manually in the seed.

---

### Tests fail because of `.demo` or `.user` TLD emails in hurl files

**Cause:** An old hurl file still has `.demo` or `.user` emails hardcoded in request bodies (not just in comments). `/v1/test/login` rejects any email that doesn't end in `.test`.

**Fix:**
```bash
# Find offenders
grep -rn "\.demo\|\.user" test/*.hurl | grep -v "^.*:#"

# Replace
sed -i 's/example@domain\.demo/example@domain.test/g' test/XX_file.hurl
```

Also make sure the replacement email is seeded in `test_seed.rs`, or `/v1/test/login` will create an ad-hoc user with no org membership (which then fails permission checks).

---

### Test passes alone but fails in the full suite

**Cause:** An earlier file left state that corrupts the test's preconditions. Common culprits:
- Suspended user
- Full OAuth client list (hit the limit)
- Auth policy changed and not restored
- IP risk policy changed and not restored

**Fix:** Run the failing file in isolation first to confirm it works alone:
```bash
# Fresh server
fuser -k 5170/tcp
ROOIAM_MODE=test SQLX_OFFLINE=true cargo run &
sleep 8

# Run just that file
bash run_tests.sh 17_idor.hurl
```

If it passes alone, search for the state-polluting file by running pairs:
```bash
bash run_tests.sh 16_privilege_escalation.hurl 17_idor.hurl
```

---

### `404` on `/v1/test/login`

**Cause:** The server is running in `demo` or `production` mode instead of `test` mode.

**Fix:**
```bash
ROOIAM_MODE=test SQLX_OFFLINE=true cargo run
```

**Why:** `/v1/test/login` is only registered in test mode. In demo mode you may still have `/v1/demo/login`, but that is not the primary automated test helper.

**Cause:** Server started in `production` or `demo` mode.

**Fix:** `ROOIAM_MODE=test SQLX_OFFLINE=true cargo run`

---

### Session randomly 401 mid-test

**Cause:** Running with `--jobs > 1`. A parallel file is logging out the same session.

**Fix:** Always use `bash run_tests.sh` (which enforces `--jobs 1`). Never call hurl directly without `--jobs 1`.

---

### Duplicate org created on startup (e.g., two `mintmallow-test`)

**Cause:** `create_organization(owner_id, name, slug)` was called with name and slug swapped. A slug like `"MintMallow Test"` gets slugified differently and creates a second org instead of matching the first.

**Fix:** Always call `create_organization` with the correct argument order:
```rust
org_repo.create_organization(owner_id, "MintMallow Test", "mintmallow-test").await?
//                            ↑ owner   ↑ human name        ↑ url slug
```

---

### `$.require_mfa == false` when expecting `true`

**Cause:** `mintmallow-test` org has `require_mfa` defaulting to `false`. The test seed must explicitly set it:
```rust
sqlx::query("UPDATE organizations SET require_mfa = true WHERE id = $1")
    .bind(mintmallow_org.id).execute(pool).await?;
```

**Warning:** There is no `require_mfa` column in `tenant_auth_config`. It lives on the `organizations` table. Do not try to set it via `tenant_auth_config`.

---

### `setup_completed` not set → setup endpoints behave unexpectedly

**Cause:** Test mode truncates `system_settings`, removing `setup_completed`. Without it, setup endpoints fall back to loopback-trust mode and may respond 200 instead of 403.

**Fix:** `test_seed.rs` seeds both keys immediately after the truncate:
```rust
for (key, val) in [("setup_completed", "true"), ("superuser_email", TEST_OWNER_EMAIL)] {
    sqlx::query(
        "INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2"
    )
    .bind(key).bind(val).execute(pool).await?;
}
```

---

## Adding a New Seeded User

When a test needs a user that doesn't fit the existing personas, add them to `test_seed.rs`:

1. Add a `const` for email and name at the top of the file
2. Call `ensure_user(pool, &identity_repo, EMAIL, NAME).await?` in `seed_test_data()`
3. Call `ensure_member_with_role(pool, org_id, user_id, "member").await?` to add them to an org
4. If using the user in hurl files, use their email directly (no `test.vars` needed unless it's a suite-wide persona)
5. Make sure the email ends in `.test`

**Do not use `.demo`, `.user`, `.com`, or any real TLD in seeded test emails.**

---

## Updating Tests After Seed Changes

When the test seed changes (new personas, renamed emails, new orgs):

1. Update `test.vars` — keep variables in sync with actual seeded emails
2. Update `00_env.yaml` (`test:` environment) — mirror of `test.vars` for REST Client / VSCode
3. Search for hardcoded old emails: `grep -rn "old@email.test" test/*.hurl`
4. Run the suite to confirm: `bash run_tests.sh`

When an endpoint path changes:
```bash
grep -r "old/path" test/*.hurl
# replace with new path using sed
```

---

## Troubleshooting Quick Reference

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `403` — account not active | User suspended by earlier test | Restart server |
| `400` — workspace app limit | OAuth client leak from failed test | Restart server |
| `400` — email required | Blank/missing email in test login body | Add email field to request |
| `400` — email must end in .test | `.demo` / `.user` / `.com` email in hurl | Replace with `.test` equivalent and seed user |
| `403` — no permission (members:read) | User seeded with no role (system role lookup bug) | Check `ensure_member_with_role` uses `OR organization_id IS NULL` |
| `404` on `/v1/test/login` | Server in wrong mode | `ROOIAM_MODE=test cargo run` |
| `401` mid-test | Parallel execution | Use `bash run_tests.sh` (enforces `--jobs 1`) |
| Audit log total = 0 for `?action=success` | Platform org not flagged `is_platform_org=true` | Set flag in seed after creating platform org |
| `$.require_mfa == false` | Seed didn't set it on `organizations` table | `UPDATE organizations SET require_mfa = true` |
| Test passes alone, fails in suite | State pollution from earlier file | Run pair bisection to find the polluting file |
| Duplicate orgs after restart | `create_organization` args swapped (name vs slug) | Check argument order: `(owner_id, name, slug)` |
