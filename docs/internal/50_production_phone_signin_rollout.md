# Production phone sign-in rollout

Updated: 2026-09-24. Status: **not deployed to the production API**. This is the operator handoff for the existing Docker Compose host behind `api.rooiam.com`; the test host at `phone-test.rooiam.com` remains separate. The operator builds and deploys the production server image. Do not enable the public login method until the verifier and an end-to-end production-origin sign-in pass.

## What exists today

- The production server runs an older `ghcr.io/theparitt/rooiam-server:latest` image. Its `/v1/identity/device-login/workspace-policy` route returns 404. The database has successful migrations through version 57; current source has additive device-login migrations 58–62.
- The production Compose file selects `ROOIAM_SERVER_IMAGE` from `.env`. It does **not** currently pass `ROOIAM_GOOGLE_PLAY_USE_ADC` or `GOOGLE_APPLICATION_CREDENTIALS` into the server container. The repository's `docker-compose.prod.yml` is a reference, not the production host's active Compose file.
- The current frontend code has the workspace Phone sign-in enable/order controls, but `app.rooiam.com` has not been redeployed with that build. Deploying it before the API would show broken controls.
- The server's platform phone login default is off, and each workspace's phone login default is off. A code-only server rollout does not expose QR sign-in by itself.
- The first production rollout exposed a historical migration-lineage difference: versions 1–4, 11–12 and 17–23 were applied from CRLF files in the July production image; the repository later normalized those same SQL statements to LF. The server now selects the CRLF checksum lineage only when migration 1 matches that known history. SQLx still validates every applied migration; no database checksum is rewritten. Do not deploy the earlier `2cab52d` image, which lacks this compatibility fix.

## Stage 1 — build and deploy the API with phone sign-in still disabled

Use a maintenance window. On the production host, first save the current image name and back up PostgreSQL. Keep the backup private and off the repository. The current compose service names are `server` and `postgres`.

```bash
cd ~/rooiam
docker compose ps
docker inspect rooiam-server-1 --format '{{.Config.Image}} {{.Image}}'
mkdir -p ~/rooiam-backups
chmod 700 ~/rooiam-backups
backup=~/rooiam-backups/before-phone-login-$(date -u +%Y%m%dT%H%M%SZ).dump
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup"
test -s "$backup"
pg_restore --list "$backup" >/dev/null
```

Obtain the reviewed source commit on the server (clone/pull the repository, or transfer an archive), then use the build helper from its root. It refuses uncommitted server changes, builds with the lockfile, tags the image with the commit SHA and labels the image with the full revision. **Do not use or overwrite `latest`** for this rollout. Record the actual commit SHA and image ID in the release log.

```bash
cd ~/rooiam-source
git status --short
git rev-parse HEAD
bash rooiam-server/scripts/build_production_image.sh
```

In `~/rooiam/.env`, set `ROOIAM_SERVER_IMAGE` to the exact image tag printed by the helper. Keep `ROOIAM_GOOGLE_PLAY_USE_ADC` unset for this first stage. Do not copy the test host's operator ADC or Play tokens. Copy the tracked [`production-phone.compose.yaml`](../../rooiam-server/deploy/production-phone.compose.yaml) alongside the active production Compose file, then from that directory:

```bash
cd ~/rooiam
docker compose -f docker-compose.yml -f production-phone.compose.yaml config --quiet
docker compose -f docker-compose.yml -f production-phone.compose.yaml up -d --no-deps server
docker compose ps server
docker compose logs --tail=100 server
```

The server automatically runs migrations on startup. Verify health and that the protected phone-policy endpoint exists (an unauthenticated response must no longer be 404). Check that migrations through 62 succeeded. Use a known production workspace for the existing login bootstrap smoke check.

```bash
curl -fsS https://api.rooiam.com/health
curl -i https://api.rooiam.com/v1/identity/device-login/workspace-policy
curl -i 'https://api.rooiam.com/v1/setup/login-bootstrap?org=YOUR_WORKSPACE_SLUG'
cd ~/rooiam
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT max(version), count(*) FROM _sqlx_migrations WHERE success"'
```

Expect `62` as the maximum migration version, health `ok`, and the phone-policy endpoint to reject the missing session rather than return 404. Also complete the [API smoke checklist](../production/22_api_and_sdk_smoke_checklist.md) for normal sign-in and CORS. If startup or a regression fails, restore the previous **image** selection and restart `server`; migrations 58–62 remain in the database. Do not assume changing the image reverses schema changes. Preserve the backup for a deliberate database-restore decision if one is needed.

## Stage 2 — unattended Play Integrity verification

The server is a self-hosted Docker workload. `ROOIAM_GOOGLE_PLAY_USE_ADC=true` alone is insufficient: ADC must exist **inside** the container and be refreshable without a human browser session. The Google organization blocks service-account key creation; keep that policy in place. Use a supported Workload Identity Federation source for this host, or move this verifier workload to a Google Cloud runtime with an attached service account. A local `gcloud auth application-default login --impersonate-service-account` session is certification-only, not the production credential. See [the Play Integrity configuration](../production/23_android_play_integrity.md) and [Google's ADC guidance](https://cloud.google.com/docs/authentication/application-default-credentials).

For a self-hosted WIF setup, use the tracked [`production-play-integrity-wif.compose.yaml`](../../rooiam-server/deploy/production-play-integrity-wif.compose.yaml) as an additional override. Set `ROOIAM_PLAY_CREDENTIALS_DIR` to a private directory containing the external-account configuration and its renewable token source. Grant that workload impersonation of the service account in the Play-linked Cloud project. Verify token refresh and a real Google decode from the running container before enforcing strict policy. Do not commit credentials or tokens. The reference app uses package `com.rooiam.reference` and linked project number `1028955371558`; other consumer apps need their own package/project.

Set the platform attestation policy to require attestation and vendor verification, disallow development environments, and allow only the intended package IDs. The exact settings and negative tests are in [the Play Integrity guide](../production/23_android_play_integrity.md). A test-origin phone enrollment does not move to the production origin automatically; enroll against production separately after the verifier is ready.

## Stage 3 — console and controlled enablement

After Stage 1 passes and Stage 2 verifies, build the frontend with the production API URL and deploy `rooiam-app` to Cloudflare Pages. Confirm `app.rooiam.com` exposes Workspace → Access → Phone sign-in and its button-order controls. Then enable the platform phone method, enable it for one intended workspace, place the button, and perform a real Play-installed phone scan/approval against the production origin. Check a completed browser session and audit event. Keep the test origin working independently.

Release decision: do not call public phone sign-in complete until the production API, unattended verifier, production-origin enrollment and browser login, existing-login regression, and frontend controls all pass. The 0.2 [internal-beta acceptance](./48_v0.2_exit_checklist.md) is a separate decision.
