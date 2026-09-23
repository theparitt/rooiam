# Device-login certification runbook

This runbook separates automated local evidence from real-phone/vendor acceptance. Current results are in [the milestone snapshot](../docs/internal/45_v0.2_current_status_2026-09-23.md).

## Isolated local stack

Prerequisites: Docker, Rust, Node 22, PostgreSQL `psql`, Redis CLI; JDK 17 and Android SDK 34 for the phone project. Run from the repository root. These names/ports are reserved for a disposable certification stack, not an existing deployment.

```sh
docker run -d --name rooiam-v02-test-postgres -e POSTGRES_PASSWORD=rooiam-local-test -p 127.0.0.1:15439:5432 postgres:16-alpine
docker run -d --name rooiam-v02-test-redis -p 127.0.0.1:15479:6379 redis:7-alpine
DATABASE_URL=postgres://postgres:rooiam-local-test@127.0.0.1:15439/postgres SQLX_OFFLINE=true cargo test --manifest-path rooiam-server/Cargo.toml --lib modules::device_login -- --include-ignored
SQLX_OFFLINE=true cargo build --manifest-path rooiam-server/Cargo.toml --bin rooiam-server
rooiam-server/target/debug/rooiam-server --env-file test/device-login.env.example
```

After the server is ready, in another terminal:

```sh
node test/device-login-live.mjs
npm ci --prefix rooiam-sdk/packages/js-browser
npm ci --prefix rooiam-sdk/packages/js-server
node rooiam-sdk/scripts/sync-openapi.mjs --check
npm test --prefix rooiam-sdk/packages/js-browser
npm test --prefix rooiam-sdk/packages/js-server
npm run build --prefix rooiam-sdk/packages/js-browser
npm run build --prefix rooiam-sdk/packages/js-server
node --test rooiam-examples/device-login/fake-phone.test.mjs
npm ci --prefix rooiam-examples/example-4-reference-app
npm test --prefix rooiam-examples/example-4-reference-app
npm ci --prefix rooiam-app
npm run build --prefix rooiam-app
```

The live runner is hard-bound to the above isolated ports/database. It first verifies the test-only login endpoint works, creates disposable identities and explicitly relaxes attestation only there. It resets this Redis instance's `rl:*` counters between scenarios; rate limits remain active within race scenarios. Repository tests separately execute all 50 concurrent database insert attempts without HTTP throttling. Local HTTP success does not establish real vendor attestation or production-mode certification.

With the isolated API still running, execute `node test/reference-app-live.mjs`. It generates an Argon2 client secret through the server's own helper, provisions a temporary confidential client in the disposable database, and verifies the real authorize/code/userinfo/application-session flow on port 15474. It removes the temporary client afterward. This test bypasses the interactive hosted-login UI by using test login, so combine it with the Chromium and physical-phone walkthroughs rather than treating it as phone evidence.

For browser/phone testing, run `VITE_API_URL=http://127.0.0.1:15470/v1 npm run dev --prefix rooiam-app -- --host 127.0.0.1 --port 15472 --strictPort` and follow [Android instructions](../rooiam-android/README.md). Existing email/provider login and phone networking must be configured; the API containers alone do not supply those prerequisites.

For automated Chromium coverage after the HTTP runner, install Playwright in a separate tools directory (`npm install --prefix /tmp/rooiam-browser-tools playwright`), install its Chromium browser, then run `PLAYWRIGHT_MODULE=/tmp/rooiam-browser-tools/node_modules/playwright/index.mjs node test/device-login-browser.mjs`. `PLAYWRIGHT_EXECUTABLE` may select an existing Chromium binary. This verifies QR/cancel/deny/approve and the resulting browser identity; it does not simulate vendor attestation or replace phone UX testing.

SQLx offline query metadata is committed under `rooiam-server/.sqlx` so fresh builds do not depend on a developer's ignored cache. When compile-time SQL changes, regenerate it against a disposable migrated database using SQLx CLI 0.8: `DATABASE_URL=... SQLX_OFFLINE=false cargo sqlx prepare -- --lib --tests` in `rooiam-server`.

For the continuous reference-app QR regression, enable device login on the disposable **Rooiam Test** workspace, keep its test-only unattested-device policy, and run:

```sh
PLAYWRIGHT_MODULE=/tmp/rooiam-browser-tools/node_modules/playwright/index.mjs node test/reference-app-phone-browser.mjs
```

This starts a temporary reference app on port 15475, provisions a confidential client and fake signing device, and removes/revokes those fixtures afterward. The API and hosted frontend must already be running on 15470/15472. It validates browser QR completion, client/workspace binding, exact downstream subject, existing-session return, invalid-client rejection and callback tampering. `ROOIAM_BROWSER_TEST_DATABASE` may select the separate disposable PostgreSQL on port 15440 used for the phone walkthrough; the script rejects non-loopback hosts, other ports and database names. This is browser regression evidence, not a physical scan or Play Integrity result.

For alpha.2 physical acceptance, update the existing phone app without clearing its data. Test camera permission denial and the paste fallback, cancel and rescan, rotate/background/return while scanning, and reopen while the approval review is visible. A restored review must fetch current status and require a new explicit approval. Do not rerun the vault-clearing instrumented test against an enrollment you want to preserve. Retest installation with Play Protect enabled separately from camera functionality.

## Upgrade and operations

**Test-mode startup wipes and reseeds the entire dedicated database.** Do not restart a phone walkthrough API expecting enrollment, clients or sessions to survive. Take a restricted-access database backup before replacing its binary and restore it only in this disposable environment. Use production mode against an isolated database for persistence/restart certification; test-mode reseeding is not a restart-recovery test.

For local production-mode throttling checks, copy the example environment to a private temporary file, change mode to `production`, API/server port to 15473 and Redis URL to `redis://127.0.0.1:15479/2`, and supply a random `ROOIAM_SETUP_TOKEN`. Keep the disposable database. Run a second server with that file, then `node test/device-login-limits.mjs`. This verifies test-login absence, ordinary identity routing, start 10/min and status 120/min limits. It is a focused limit test, not a comprehensive abuse certification.

Migration 0061 adds workspace opt-in, default false. Migration 0062 enforces unique non-null enrollment public keys. Before upgrade, query duplicate `device_public_key` values with `GROUP BY ... HAVING COUNT(*) > 1`; investigate and resolve them explicitly. Migration failure is preferable to silently reassigning a phone to another identity. Back up the database before normal deployment migration procedures.

Enable the platform switch, then opt in each intended workspace through its session policy screen. Keep verified/vendor attestation policies and app allowlists appropriate to production. Revoking a device blocks new approvals and completion; revoke existing sessions separately when responding to compromise. Restore server backups using existing procedures, but never restore phone private keys from app backups. Restore drills must account for already-consumed intents/sessions to avoid replaying old state.

Reverse proxies and telemetry must omit status query strings, cookies, request bodies containing credentials and signing material. Verify logs with disposable secret fixtures. `Cache-Control: no-store` protects browser device endpoints; do not cache authenticated identity responses.

## Remaining release evidence

Android alpha.3 separates `:sdk` and the reference `:app`. Use the [SDK integration guide](../rooiam-android/sdk/README.md) and `:sdk:testDebugUnitTest`, `:sdk:lintDebug`, `:sdk:assembleDebugAndroidTest` for library checks. Earlier `:app:` test commands in historical evidence predate extraction. Treat reference APK Play Protect/distribution as app-specific evidence; SDK release still needs an independent consuming-project walkthrough and verification of its claimed security behavior. Repeat the real-phone flow after the split rather than carrying alpha.2 acceptance forward automatically.

Record commit, OS/device model, Android version, app signing/distribution, attestation configuration and every pass/fail/skip. Run real-phone enroll/approve/deny/expire/revoke, offline/reload, MFA, two identities/workspaces/clients, restart/disconnect recovery, production limits, secret-log inspection and a fresh-clone walkthrough. The stable gate additionally requires the documented 1,000-flow isolation run and parser fuzz evidence. Do not mark these passed from unit tests or an APK build.
