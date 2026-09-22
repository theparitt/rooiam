# Docker — Running rooiam-server

This file is the single source of truth for the Docker setup. Read it before
editing any `docker-compose.*.yml` or `Dockerfile.*`.

For configuration on a fresh clone, start with the [Docker quickstart](docs/getting-started/05_quickstart_with_docker.md).

## What these compose files build

`docker-compose.prod.yml` and `docker-compose.demo.yml` run **only
`rooiam-server` plus the infrastructure it needs**:

- `postgres` — database
- `redis` — cache / sessions / OAuth state
- `minio` + `minio-init` — object storage + bucket creation
- `mailhog` — SMTP capture (magic-link emails)
- `server` (prod) / `demo-server` (demo) — the Rust backend

They do **NOT** build the frontends (admin, app, landing, docs, book, candycloud).
Those are deployed separately (Cloudflare Pages, or their own build). Do not add
frontend services back into these files.

## The two axes

| Axis | Values | Set by |
|------|--------|--------|
| **Mode** | production / demo | which **compose file** (`docker-compose.prod.yml` vs `docker-compose.demo.yml`) |
| **Target** | local / public | which **`.env.docker.*` file** you pass with `--env-file` |

So there are four combinations:

| Combination | Compose file | Env file |
|-------------|--------------|----------|
| Local production | `docker-compose.prod.yml` | `.env.docker.local.prod` |
| Public production | `docker-compose.prod.yml` | `.env.docker.public.prod` |
| Local demo | `docker-compose.demo.yml` | `.env.docker.local.demo` |
| Public demo | `docker-compose.demo.yml` | `.env.docker.public.demo` |

`local` = `http://localhost`, cookies insecure. `public` = real `https://*.rooiam.com`
domains, secure cookies. The server binds `5170` inside the container; the host
port is `5170` for prod and `5180` for demo.

## Commands

Every prod/demo command should include its `--env-file`. Demo uses
`${VAR?}` (required) interpolation, so without it even `logs`/`ps` fail with
"required variable ... is missing".

```bash
# Build the current checkout under the tag used by demo Compose
docker build -t ghcr.io/theparitt/rooiam-demo-server:latest -f Dockerfile.server.prod .

# Run the locally built demo image
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo up -d --pull never

# Logs
docker compose -f docker-compose.demo.yml --env-file .env.docker.public.demo logs --tail 40 demo-server

# Stop (keeps data volumes)
docker compose -f docker-compose.demo.yml --env-file .env.docker.public.demo down

# Stop + WIPE data
docker compose -f docker-compose.demo.yml --env-file .env.docker.public.demo down -v
```

Production Compose has a build section; use `up -d --build` with `docker-compose.prod.yml` and its matching env file. Demo Compose has only an image tag, so `compose build` does not rebuild it.

## Verify it worked

```bash
# git_sha should match your latest commit; checks should be true
curl -s http://localhost:5180/health | python3 -m json.tool   # demo (5170 for prod)
```

The server **auto-creates the database, runs migrations, and (in demo) seeds
data** on startup. You do not pre-create anything in Postgres or MinIO.
Demo mode requires a database whose name ends in `rooiam_demo` (safety check).

## Gotchas (things that have actually broken before)

1. **Shell variables override Compose interpolation.** Only names forwarded by a service's `environment` block enter the container. Adding a server setting to an env file does not automatically forward it; add an explicit Compose mapping when needed.

2. **Use the correct mode's variables.** The strict server contract rejects unknown `ROOIAM_*` names and incompatible mode-specific settings. Production SMTP uses `ROOIAM_SMTP_*`; demo SMTP uses `ROOIAM_DEMO_SMTP_*`.

3. **Deployment env files are untracked.** A fresh clone must create them. The [Docker quickstart](docs/getting-started/05_quickstart_with_docker.md) and [environment guide](docs/reference/05_environment_configuration.md) contain local examples. Replace example credentials and configure real URLs before a public deployment.

4. **Google/Microsoft OAuth keys are optional.** Unset shows as `[ - ]`, not an
   error. Demo and local prod run fine without them.

5. **Media URLs are stored, not derived at read time.**
   `ROOIAM_PUBLIC_MEDIA_BASE` controls what gets written into avatar/logo fields
   for future uploads:
   - local setups usually use `/media`
   - public setups usually use `https://api.rooiam.com/media`

   If you previously uploaded media while using a temporary base like
   `http://192.168.0.147:9000/rooiam`, those exact URLs remain in the database.
   Changing `ROOIAM_PUBLIC_MEDIA_BASE` later does not fix old rows. Clean or
   rewrite the affected DB values separately.

6. **`/media` in the app means API-origin media, not app-origin media.**
   The browser app resolves stored root-relative URLs like `/media/uploads/...`
   against `VITE_API_URL`'s origin. With `VITE_API_URL=https://api.rooiam.com/v1`,
   the browser loads `https://api.rooiam.com/media/uploads/...`.

## Stale media cleanup

If media was uploaded while `ROOIAM_PUBLIC_MEDIA_BASE` pointed at a temporary or
private URL, the bad absolute URL stays in the database even after the env is
fixed. Use the maintenance script in `rooiam-server/scripts/cleanup_stale_media_urls.sh`
to inspect and clean those rows.

Dry run:

```bash
bash rooiam-server/scripts/cleanup_stale_media_urls.sh \
  --old-base http://192.168.0.147:9000/rooiam \
  --dry-run
```

Clear matching URLs to `NULL`:

```bash
bash rooiam-server/scripts/cleanup_stale_media_urls.sh \
  --old-base http://192.168.0.147:9000/rooiam \
  --yes
```

Rewrite matching URLs to a new base:

```bash
bash rooiam-server/scripts/cleanup_stale_media_urls.sh \
  --old-base http://192.168.0.147:9000/rooiam \
  --new-base /media \
  --yes
```

The script covers:

- `users.avatar_url`
- `organizations.icon_url`
- `organizations.login_logo_url`
- `organizations.logo_url` if the legacy column still exists

Use `--new-base` only if you are certain the replacement base is already valid
for browsers. Otherwise prefer clearing the bad values and re-uploading.

## The server image

`Dockerfile.server.prod` is a two-stage build:

- builder: `rust:1.88` compiles `rooiam-server` with `SQLX_OFFLINE=true`
  (uses the committed `rooiam-server/.sqlx/` query cache — no DB needed at build).
- runtime: `debian:bookworm-slim` with only `ca-certificates` + `curl`
  (curl is required by the compose healthcheck). The server self-migrates on
  boot, so no `sqlx` CLI is installed in the image.

## Other compose files (not for the server)

- `docker-compose.local.yml` — bare local infra only (postgres + minio), for
  source-running the server with `cargo run`.
- `docker-compose.candycloud.yml` — the candycloud downstream demo app's own
  backend (redis + api), separate from rooiam-server.
