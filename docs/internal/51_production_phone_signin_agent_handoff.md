# Handoff to the next production-side assistant

Updated: 2026-09-24. Read this after the operator says they have built and deployed the new server image. This file is an execution checklist, not evidence that the rollout passed. Recheck every live status before marking a step complete.

## Start here

The operator manages the production Docker build and deployment. The intended source commit is **`23959c4` or a later commit containing the CRLF migration compatibility fix**. The older `2cab52d` image fails on the existing production database and must not be redeployed. The running production Compose project is in `~/rooiam`; it selects its `server` image through `ROOIAM_SERVER_IMAGE` in `.env`. The source checkout may be at `~/rooiam-source`. Neither directory is the same as this workspace checkout; verify paths and the actual image before assuming them.

At the last read-only check, `https://api.rooiam.com/health` returned **502** and production PostgreSQL recorded **57 successful migrations, max version 57**. This was while the first new image was restarting on `migration 1 was previously applied but has been modified`. The difference was traced to CRLF versus LF bytes in migrations 1–4, 11–12 and 17–23. Original SQL was otherwise identical. Commit `23959c4` selects that exact historic checksum lineage when present and still lets SQLx reject unknown changes. **Do not edit `_sqlx_migrations` checksums, mark migrations as applied, drop data, or run the test-mode server against production.** If production is still down, prioritize returning to the previous working server image while troubleshooting; the operator has chosen to perform Docker deployments themself.

The existing [rollout runbook](./50_production_phone_signin_rollout.md) contains the backup, image build, Compose override, rollback and staged enablement instructions. The [Play Integrity guide](../production/23_android_play_integrity.md) contains the verifier policy. Do not put the long internal test report on the landing page.

## After the operator deploys: verify Stage 1

1. **Identify the running artifact.** Read the actual Compose `server` image and `org.opencontainers.image.revision` label; expect the new source revision, not a moving `latest` tag. Check `docker compose ps server` and recent server logs for a stable, healthy process and `Migrations [ OK ]`. Do not paste environment values or secrets into chat.
2. **Check the database history without changing it.** From `~/rooiam`, run:

   ```bash
   docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "SELECT max(version), count(*) FROM _sqlx_migrations WHERE success"'
   ```

   Expect `62|62`. If it is still `57|57`, migration did not run. If it is between 58 and 61, identify the failed step from logs; do not manually advance the version.
3. **Check public API and route:**

   ```bash
   curl -i https://api.rooiam.com/health
   curl -i https://api.rooiam.com/v1/identity/device-login/workspace-policy
   ```

   Expect health HTTP 200 with `status: ok`, database and Redis healthy. The protected phone-policy route should reject an anonymous request as unauthenticated; **404 or 502 is a failure**. Check the actual response rather than assuming a particular auth status code.
4. **Protect existing login.** Run the [API and SDK smoke checklist](../production/22_api_and_sdk_smoke_checklist.md), including login bootstrap for a real production workspace, CORS from `https://app.rooiam.com`, and a normal sign-in. Record tested endpoint, status and time. Avoid sharing cookies, one-use links or tokens. Do not enable phone sign-in yet.
5. **If checks fail:** collect the sanitized error, running image revision and migration maximum; fix code or Compose as appropriate and rebuild a new immutable image. The first rollout did not reach migration 58. Later failed attempts may have applied some migrations, so recheck history before rollback. Once migrations 58–62 are recorded, the old image may refuse to start because it lacks those versions; do not assume an image-only rollback works. Keep the database backup and use a tested schema-compatible fix or deliberate database restore. Never rewrite migration history to force a rollback.

## Then finish production phone sign-in

Stage 1 only makes the API capable of phone login. Both platform and workspace phone login default to disabled. The production Compose file originally did not pass Play Integrity ADC variables; the tracked [`production-phone.compose.yaml`](../../rooiam-server/deploy/production-phone.compose.yaml) supplies them with ADC off by default.

6. **Set up unattended Google verification before enabling the method.** This is a self-hosted Docker machine, not a Google Cloud workload with an attached service account. The Google organization blocks service-account key creation. Set up a renewable Workload Identity Federation source and mount its external-account configuration plus token source into the container using [`production-play-integrity-wif.compose.yaml`](../../rooiam-server/deploy/production-play-integrity-wif.compose.yaml), or use an attached service account if the workload is moved to Google Cloud. A local operator `gcloud` ADC login from the test host is not an unattended production credential. Validate token refresh and a real Play Integrity decode in the production container. Keep credentials and private Compose values out of Git and chat.
7. **Set strict attestation policy:** require attestation and vendor verification for QR login, disallow development environments, and allow only the intended Play package ID. For the current Rooiam Reference internal-test app, the package is `com.rooiam.reference`, linked to project number `1028955371558`. Confirm its current Play Console linkage before a live test. Run invalid-token, wrong-package and verifier-unavailable checks in a separate non-production environment; no fallback to an unverified approval is acceptable.
8. **Update the console after the API and verifier pass.** `rooiam-app` builds for `https://api.rooiam.com/v1` in `.env.prod-online`; its `npm run deploy` publishes to the `rooiam-app` Cloudflare Pages project. Check `app.rooiam.com` → Workspace → Access for Phone sign-in enable/disable and Login Button Order. The corresponding code is in `rooiam-app/src/pages/portal/PortalWorkspaceAccess.tsx`. Confirm platform phone login is enabled before expecting a workspace toggle to become usable. Keep phone login off for other workspaces until their acceptance run.
9. **Test one production workspace end to end.** A phone enrolled on `phone-test.rooiam.com` does not automatically transfer to production. Plan a separate production-origin enrollment with the operator; do not casually revoke the test enrollment. Use the Play-installed reference app, compare the browser and phone approval code, approve, and confirm the requesting browser reaches the correct workspace and audit event. Also test cancel/expiry and a regular non-phone sign-in. Check cross-origin browser cookies and callback behavior on the actual production domains.
10. **Record the decision.** Capture source/image revision, migration result, production API and frontend URLs, verifier credential type (not its contents), effective policy, package/version, device/Android version, browser result, regressions and remaining limits. Keep the public wording at **Android preview** until unattended verification, production-origin login and distribution scope are accepted. The accepted 0.2 internal-beta evidence in [the closeout checklist](./48_v0.2_exit_checklist.md) is separate from public production readiness.

If the user opens a new chat, they can ask the assistant to read this file and report which numbered steps passed. The assistant should continue from observed state rather than repeating device setup or claiming that a successful image deploy completes phone sign-in.
