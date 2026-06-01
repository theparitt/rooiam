# Rooiam API Tests

This directory is primarily for automated Hurl API regression tests.

The authoritative automated test setup is:
- `ROOIAM_MODE=test`
- `test.vars`
- `bash run_tests.sh`

`demo` mode still exists for product demos and manual QA, but it is no longer the primary way to run the Hurl suite.

## Requirements

- [Hurl](https://hurl.dev) — `curl -fsSL https://github.com/Orange-OpenSource/hurl/releases/download/7.1.0/hurl-7.1.0-x86_64-unknown-linux-gnu.tar.gz | tar xz -C /tmp && sudo mv /tmp/hurl-7.1.0-x86_64-unknown-linux-gnu/bin/hurl /usr/local/bin/`
- Rooiam backend running on `localhost:5170`
- Server started in **test** mode for automated Hurl runs

## Server Modes

Set `ROOIAM_MODE` when starting the server:

| Mode | Env | Demo seed | `/v1/demo/*` routes | `/v1/test/*` routes | Rate limits | `X-Forwarded-For` trusted |
|------|-----|-----------|--------------------|--------------------|-------------|--------------------------|
| `production` | default | no | **not registered** | **not registered** | strict | no |
| `demo` | `ROOIAM_MODE=demo` | yes | yes | no | strict | no |
| `test` | `ROOIAM_MODE=test` | no | yes | yes | **unlimited** | yes (127.0.0.1) |

```bash
# Automated Hurl test mode — authoritative for this folder
# Seeds *.test platform accounts and enables /v1/test/* helpers.
ROOIAM_MODE=test SQLX_OFFLINE=true cargo run

# Demo mode — for manual demos / UI QA, not the primary Hurl mode
ROOIAM_MODE=demo SQLX_OFFLINE=true cargo run
```

> Legacy `ROOIAM_ENABLE_DEMO_SEED=true` still works and is equivalent to `ROOIAM_MODE=demo`.

## Run

Before running anything below, start the server in test mode:

```bash
cd rooiam-server
ROOIAM_MODE=test SQLX_OFFLINE=true cargo run
```

If the server is not running in `ROOIAM_MODE=test`, parts of this suite will fail because `/v1/test/*` routes do not exist in demo or production mode.

```bash
cd test/

# Run all files (authoritative path)
hurl --variables-file test.vars *.hurl --test --jobs 1

# Run a single file
hurl --variables-file test.vars 03_demo_login.hurl --test

# Show full request/response detail on failure
hurl --variables-file test.vars *.hurl --test --jobs 1 --error-format long

# Verbose — show every request and response
hurl --variables-file test.vars *.hurl --verbose --jobs 1

# Risk signal tests (requires ROOIAM_MODE=test)
bash run_risk_signal_test.sh

# Or just use the wrapper
bash run_tests.sh
```

## Variables

The Hurl suite uses `test.vars`.

`00_env.yaml` keeps both `demo` and `test` environments for editor tooling.

| Variable | Value |
|----------|-------|
| `baseUrl` | `http://localhost:5170` |
| `platformOwnerEmail` | `owner@rooiam.test` |
| `platformAdminEmail` | `admin@rooiam.test` |
| `tenantOwnerEmail` | `rooroo@sweetfactory.test` |
| `rooChocoMemberEmail` | `praline@roochoco.test` |
| `mintMallowMemberEmail` | `peppermint@mintmallow.test` |

If you intentionally want demo-mode values for manual calls, use the `demo` section in [00_env.yaml](/home/theparitt/work/rooiam/test/00_env.yaml).

## Files

| File | Topic |
|------|-------|
| `00_unauth.hurl` | Unauthenticated access — all protected endpoints return 401 |
| `01_health.hurl` | Health check — DB + Redis |
| `02_magic_link.hurl` | Passwordless magic link flow |
| `03_demo_login.hurl` | All roles + edge cases via `/v1/demo/login` |
| `04_identity_me.hurl` | User profile + sessions |
| `05_organization_portal.hurl` | Portal data + org listing |
| `06_auth_policy.hurl` | Auth policy updates |
| `07_members_and_invites.hurl` | Members + invite flow |
| `08_roles.hurl` | RBAC roles + permissions |
| `09_api_keys.hurl` | API key lifecycle |
| `10_oauth_clients.hurl` | OAuth client management |
| `11_activity_audit.hurl` | Audit logs + CSV/JSON export |
| `12_oidc.hurl` | OIDC discovery + token endpoint |
| `13_admin_platform.hurl` | Platform admin endpoints |
| `14_session_management.hurl` | Multi-session + logout |
| `15_mfa_status.hurl` | MFA status check |
| `16_privilege_escalation.hurl` | Privilege escalation guards |
| `17_idor.hurl` | Insecure direct object reference checks |
| `18_input_validation.hurl` | Input validation edge cases |
| `19_malformed_requests.hurl` | Malformed request handling |
| `20_session_security.hurl` | Session security checks |
| `21_rate_limit_probe.hurl` | Rate limiting behaviour |
| `22_ip_domain_policy.hurl` | IP + domain allow/block policy |
| `23_last_owner_guard.hurl` | Last owner removal guard |
| `24_member_status.hurl` | Member status transitions |
| `25_oidc_rfc_errors.hurl` | OIDC RFC-compliant error responses |
| `26_pkce_negative.hurl` | PKCE negative cases |
| `27_refresh_token.hurl` | Refresh token flow |
| `28_client_auth.hurl` | OAuth client authentication |
| `29_scope_hardening.hurl` | Scope enforcement |
| `30_linked_accounts.hurl` | Linked OAuth accounts |
| `31_webauthn_passkeys.hurl` | WebAuthn passkey flow |
| `32_org_branding.hurl` | Org branding settings |
| `33_admin_user_detail.hurl` | Admin user detail view |
| `34_admin_org_detail.hurl` | Admin org detail view |
| `35_admin_clients.hurl` | Admin OAuth client management |
| `36_admin_audit_logs.hurl` | Admin audit log access |
| `37_org_status_lock.hurl` | Org status + platform lock |
| `38_admin_policies.hurl` | Admin policy management |
| `39_setup_public.hurl` | Setup wizard public endpoints |
| `40_end_session.hurl` | OIDC end session |
| `41_email_change.hurl` | Email change flow |
| `42_signing_key_rotation.hurl` | OIDC signing key rotation |
| `43_effective_policy.hurl` | Effective auth policy resolution |
| `44_policy_preview.hurl` | Policy preview endpoint |
| `45_policy_snapshots.hurl` | Policy snapshot history |
| `46_role_catalog.hurl` | Role catalog |
| `47_admin_sessions.hurl` | Admin session management |
| `48_owner_transfer.hurl` | Org owner transfer |
| `49_phase5_provider_unlink.hurl` | OAuth provider unlink |
| `50_magic_link_security.hurl` | Magic link security edge cases |
| `51_role_guard_matrix.hurl` | Role guard matrix |
| `52_suspend_session_revocation.hurl` | Suspend + session revocation |
| `53_audit_log_coverage.hurl` | Audit log event coverage |
| `54_client_secret_rotation.hurl` | OAuth client secret rotation |
| `55_profile_input_validation.hurl` | Profile input validation |
| `56_risk_detection.hurl` | Risk policy GET/PATCH + validation |
| `57_setup_verification_guards.hurl` | Setup provider verification guards |
| `58_setup_storage_roundtrip.hurl` | Setup storage test/save/get round-trip |
| `59_hosted_widget_security.hurl` | Hosted widget embed-origin + callback-origin hardening |
| `60_security_alert_reviews.hurl` | Persisted workspace + platform suspicious-alert review state |
| `run_auth_surface_rate_limit_test.sh` | Auth-surface abuse rate limits for `/login`, `/login-widget`, magic-link, and OAuth start |
| `run_cookie_security_test.sh` | Session cookie flag and logout clearing-cookie smoke test |
| `run_oauth_state_security_test.sh` | OAuth state provider/callback mismatch, replay, and IP-binding smoke test |
| `run_security_smoke.sh` | Single-entry release security smoke runner |
| `run_widget_probe_signal_test.sh` | Repeated blocked hosted-widget embed probes raise suspicious-auth audit signal |
| `run_widget_context_security_test.sh` | Hosted widget replay / expired session smoke test |

## More

See [TESTING.md](TESTING.md) for writing new tests, debugging failures, and known traps.

## Notes

- Each file is self-contained — logs in at the top, captures session cookie for that file.
- Magic link tests (`02_`) require checking Mailhog (`:8025`) for the actual token.
- Tests that write data (create role, API key, client) clean up after themselves.
- `56_risk_detection.hurl` restores default thresholds at the end so it doesn't affect other tests.
- `57_*` and `58_*` cover the newer platform setup verification guards.
- `59_hosted_widget_security.hurl` covers the hosted login widget origin/callback hardening with self-created test apps.
- `60_security_alert_reviews.hurl` covers persisted suspicious-alert review state for workspace and platform operators.
- `run_auth_surface_rate_limit_test.sh` covers auth-surface abuse limits, including the hosted widget UI itself.
- `run_cookie_security_test.sh` verifies session cookie flags on login and logout responses.
- `run_oauth_state_security_test.sh` covers provider callback/state hardening without contacting Google or Microsoft.
- `run_security_smoke.sh` runs the current `0.1` security smoke stack in one command.
- `run_widget_probe_signal_test.sh` covers suspicious-auth escalation for repeated blocked hosted-widget embed attempts.
- `run_widget_context_security_test.sh` covers widget token consumption, replay rejection, expired-widget redirect behavior, and audit coverage.
- `run_risk_signal_test.sh` now covers `new_ip`, `rapid_ip_change`, and `new_user_agent`.
- `/v1/demo/*` and `/v1/test/*` routes are **not registered in production mode** — not just guarded, literally absent from the router.
