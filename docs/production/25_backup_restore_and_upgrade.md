# Back up, verify and upgrade a self-hosted Rooiam server

This procedure covers one Rooiam server with PostgreSQL, Redis and MinIO. PostgreSQL holds identities, policies, keys and sessions; MinIO holds uploaded media. Redis contains short-lived state such as verification tickets and rate-limit counters. **A PostgreSQL dump alone is not a complete instance backup.** Keep the server configuration, secret files, Play Integrity proxy secret and a separate MinIO copy in protected storage too. Never commit backups or secrets.

## Before the maintenance window

1. Record the running image's immutable tag, `org.opencontainers.image.revision` label and the `/health` `build.git_sha`. Record the PostgreSQL **server major version** (`SELECT current_setting('server_version')`) and choose matching-version `pg_dump`/`pg_restore` tools. A newer dump client may emit an archive an older restore client cannot read.
2. Use an account that can read the entire Rooiam database. Configure `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` and a mode-600 `.pgpass` file on the **operator host**. Do not put a database URL with a password in a command argument or shell history. Check that the backup destination is private and has enough free space.
3. Capture MinIO data with your storage provider's versioned backup/snapshot process. For a consistent database/media recovery point, pause writes while taking the final database dump and media snapshot. Keep the exact environment configuration and private secret files separately. Store copies off the server and set a retention policy; a single local dump does not protect against host loss.

For a PostgreSQL 18 server, for example:

```bash
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=rooiam PGDATABASE=rooiam
export PGPASSFILE="$HOME/.pgpass" # chmod 600; file format is described by PostgreSQL
export PG_DUMP_BIN=/usr/lib/postgresql/18/bin/pg_dump
export PG_RESTORE_BIN=/usr/lib/postgresql/18/bin/pg_restore
rooiam-server/scripts/backup_postgres.sh "$HOME/rooiam-backups"
```

The script creates a private custom-format `.dump`, checks its table of contents and writes a SHA-256 sidecar. Copy **both** files to protected off-host storage. If PostgreSQL lives only on a Docker network, run a matching-version client from a trusted operator container or use an SSH tunnel to a localhost-only port; do not open port 5432 to the internet.

## Prove the backup restores

```bash
POSTGRES_VERIFY_IMAGE=postgres:18-alpine \
  rooiam-server/scripts/verify_postgres_backup.sh "$HOME/rooiam-backups/rooiam-YYYYMMDDTHHMMSSZ-RANDOM.dump"
```

The verifier checks the SHA-256, starts a **network-isolated disposable** PostgreSQL container, restores every archive item with `--exit-on-error`, verifies the migrations/users tables and removes the container. It never connects to or drops a production database. Use an image major version matching the archive's dump client. A passing table-of-contents check alone is insufficient; the full restore is the gate. Run this after every scheduled backup and before every schema upgrade. The disposable container temporarily contains a copy of production data, so run it only on a trusted, encrypted operator host.

## One-image upgrade and rollback decision

1. Test the candidate against an **isolated copy** of the restored database, using the same migration lineage. A new server starts migrations itself. Check startup logs for checksum errors; never edit an applied migration or `_sqlx_migrations` to bypass one.
2. Build from a reviewed commit with `rooiam-server/scripts/build_production_image.sh`. Record its immutable image tag and revision label. Keep the previous image available. For releases that change the portal and API contract, deploy the matching portal with the API.
3. Take and verify a fresh backup immediately before switching. Deploy the new image and wait for `GET /ready` to return 200 (`ready: true`, PostgreSQL and Redis both `ok`). Then inspect `GET /health` for the **expected** `build.git_sha`, mode and dependency checks. A 200 from the reverse proxy alone does not prove the new image is serving.
4. Run the relevant API/OIDC/phone-login smoke tests with a disposable account and workspace. Check logs, `/metrics` (only with its configured bearer token or private network), error rate, PostgreSQL connections and disk space. Start with the [API and SDK smoke checklist](./22_api_and_sdk_smoke_checklist.md). For the planned 0.5–0.7 combined release, keep the phase-specific checks in order in the private operator handoff.
5. If a check fails, stop new traffic and diagnose. Reverting the container image can be safe after an additive migration **only when the prior binary is verified against the migrated schema**. Do not blindly restore an old database snapshot over newer live writes. A database restore after users have written new data requires an explicit outage and data-loss decision.

### Confirm which image is actually running

`docker pull ghcr.io/theparitt/rooiam-server:latest` only downloads an image. It does not change an existing container. If your Compose file uses `image: ${ROOIAM_SERVER_IMAGE}`, that environment value still decides which image `docker compose up -d` runs. A local tag such as `rooiam-server:phone-recovery-fd4070e` stays selected until you deliberately update it.

GitHub-published server images now carry an immutable `sha-<40-character Git SHA>` tag and OCI labels for source revision, Git ref, release version and UTC build time. `latest` is a moving convenience tag; a manually published `main` build says `release_version: "unreleased"`. A `v*` Git tag supplies the release version. The top-level `/health.version` is the server crate version, **not** the product release. `/health.build` and `/server-info.build` identify the deployed source and build:

```json
{
  "version": "0.1.0",
  "build": {
    "built_at_utc": "2026-09-25T06:00:00Z",
    "git_sha": "<40-character Git commit>",
    "git_branch": "main",
    "source_ref": "refs/heads/main",
    "release_version": "unreleased"
  }
}
```

Before a planned upgrade, pull the chosen immutable `sha-...` image and inspect its `org.opencontainers.image.revision`, `.ref.name`, `.version` and `.created` labels. Verify that the revision is the reviewed source commit. Set `ROOIAM_SERVER_IMAGE` in the protected Compose `.env` to that exact tag, then run `docker compose up -d --no-deps --force-recreate server` from the deployment directory. Compare the **running** container image with `/health.build.git_sha` and the intended commit; `/ready` must also return 200. Do not assume the new image is active merely because `docker pull` or `docker compose up -d` completed. Use the backup, migration and matched-portal checks above before switching a production authentication server.

`/ready` is the dependency gate; `/health` is the detailed diagnostic and build identity; `/metrics` provides uptime, dependency and database-pool gauges. Set `ROOIAM_METRICS_TOKEN` in the protected Compose environment or restrict metrics to a private listener; do not expose unprotected metrics publicly. Alert on repeated 503 readiness, PostgreSQL/Redis errors, failed backups, failed restore verification, low free disk and growing database-pool pressure. A green `/ready` does not prove SMTP, MinIO or Google Play Integrity; test those flows separately.

For a repeatable **dependency-probe** baseline on a staging host, run `python3 test/operator-readiness-capacity.py --url http://127.0.0.1:5170/ready --requests 500 --concurrency 8` and record the host, PostgreSQL/Redis versions, latency and failures. This measures only readiness, so it cannot establish concurrent-login capacity or a production SLA. Test real login flows separately in a scheduled window.

## Recovery from a lost host

Provision a clean host with a supported PostgreSQL version and protected network, restore the saved environment/secrets and MinIO objects, then restore the **verified** PostgreSQL archive to a new empty database with the matching `pg_restore` client. After creating the application database role and configuring protected `PG*` connection settings, the database step is:

```bash
createdb --maintenance-db=postgres --owner="$PGUSER" "$PGDATABASE"
"$PG_RESTORE_BIN" --exit-on-error --no-owner --no-privileges \
  --dbname="$PGDATABASE" /private/path/rooiam-verified.dump
```

`createdb` must fail if the destination already exists; never use this procedure to overwrite a live database. Start the same reviewed Rooiam image and confirm migrations, `/ready`, `/health` revision, media reads and a real login. Reissue interrupted magic links and OAuth requests; Redis transient tickets are not guaranteed to survive. Rotate credentials if host compromise is suspected. Never test this process by overwriting the only production database.

This is a single-host recovery procedure, not an HA or zero-downtime guarantee. Measure restore duration and data volume on your actual hardware before setting RPO/RTO promises.
