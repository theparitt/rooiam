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
npm ci --prefix rooiam-app
npm run build --prefix rooiam-app
```

The live runner is hard-bound to the above isolated ports/database. It first verifies the test-only login endpoint works, creates disposable identities and explicitly relaxes attestation only there. It resets this Redis instance's `rl:*` counters between scenarios; rate limits remain active within race scenarios. Repository tests separately execute all 50 concurrent database insert attempts without HTTP throttling. Local HTTP success does not establish real vendor attestation or production-mode certification.

For browser/phone testing, run `VITE_API_URL=http://127.0.0.1:15470/v1 npm run dev --prefix rooiam-app -- --host 127.0.0.1 --port 15472 --strictPort` and follow [Android instructions](../rooiam-android/README.md). Existing email/provider login and phone networking must be configured; the API containers alone do not supply those prerequisites.

## Upgrade and operations

For local production-mode throttling checks, copy the example environment to a private temporary file, change mode to `production`, API/server port to 15473 and Redis URL to `redis://127.0.0.1:15479/2`, and supply a random `ROOIAM_SETUP_TOKEN`. Keep the disposable database. Run a second server with that file, then `node test/device-login-limits.mjs`. This verifies test-login absence, ordinary identity routing, start 10/min and status 120/min limits. It is a focused limit test, not a comprehensive abuse certification.

Migration 0061 adds workspace opt-in, default false. Migration 0062 enforces unique non-null enrollment public keys. Before upgrade, query duplicate `device_public_key` values with `GROUP BY ... HAVING COUNT(*) > 1`; investigate and resolve them explicitly. Migration failure is preferable to silently reassigning a phone to another identity. Back up the database before normal deployment migration procedures.

Enable the platform switch, then opt in each intended workspace through its session policy screen. Keep verified/vendor attestation policies and app allowlists appropriate to production. Revoking a device blocks new approvals and completion; revoke existing sessions separately when responding to compromise. Restore server backups using existing procedures, but never restore phone private keys from app backups. Restore drills must account for already-consumed intents/sessions to avoid replaying old state.

Reverse proxies and telemetry must omit status query strings, cookies, request bodies containing credentials and signing material. Verify logs with disposable secret fixtures. `Cache-Control: no-store` protects browser device endpoints; do not cache authenticated identity responses.

## Remaining release evidence

Record commit, OS/device model, Android version, app signing/distribution, attestation configuration and every pass/fail/skip. Run real-phone enroll/approve/deny/expire/revoke, offline/reload, MFA, two identities/workspaces/clients, restart/disconnect recovery, production limits, secret-log inspection and a fresh-clone walkthrough. The stable gate additionally requires the documented 1,000-flow isolation run and parser fuzz evidence. Do not mark these passed from unit tests or an APK build.
