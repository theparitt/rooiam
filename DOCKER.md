# Docker — Running rooiam-server

This file is the single source of truth for the Docker setup. Read it before
editing any `docker-compose.*.yml` or `Dockerfile.*`.

## What these compose files build

`docker-compose.prod.yml` and `docker-compose.demo.yml` build **only
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

Every command **must** include `--env-file` — the compose files use
`${VAR?}` (required) interpolation, so without it even `logs`/`ps` fail with
"required variable ... is missing".

```bash
# Build only (no run)
docker compose -f docker-compose.demo.yml --env-file .env.docker.public.demo build

# Build + run in background
docker compose -f docker-compose.demo.yml --env-file .env.docker.public.demo up -d --build

# Rebuild just the server (DB/Redis/MinIO/Mailhog keep running)
docker compose -f docker-compose.demo.yml --env-file .env.docker.public.demo up -d --build demo-server

# Logs
docker compose -f docker-compose.demo.yml --env-file .env.docker.public.demo logs --tail 40 demo-server

# Stop (keeps data volumes)
docker compose -f docker-compose.demo.yml --env-file .env.docker.public.demo down

# Stop + WIPE data
docker compose -f docker-compose.demo.yml --env-file .env.docker.public.demo down -v
```

Swap `demo` → `prod` and the matching env file for production.

## Verify it worked

```bash
# git_sha should match your latest commit; checks should be true
curl -s http://localhost:5180/health | python3 -m json.tool   # demo (5170 for prod)
```

The server **auto-creates the database, runs migrations, and (in demo) seeds
data** on startup. You do not pre-create anything in Postgres or MinIO.
Demo mode requires a database whose name ends in `rooiam_demo` (safety check).

## Gotchas (things that have actually broken before)

1. **Stale host env vars override the compose env.** Docker passes through any
   matching `ROOIAM_*` vars from the host shell. If your shell still exports the
   old MinIO names, the server's strict contract rejects them:
   ```
   [ UNEXPECTED ] ROOIAM_MINIO_ACCESS_KEY is not a recognized server env variable
   ```
   Fix: `unset ROOIAM_MINIO_ACCESS_KEY ROOIAM_MINIO_SECRET_KEY` (the current names
   are `ROOIAM_MINIO_USERNAME` / `ROOIAM_MINIO_PASSWORD`). Check with
   `env | grep ROOIAM_MINIO`.

2. **Wrong-mode env vars are fatal.** The strict contract rejects production-only
   vars in demo and vice-versa. `ROOIAM_SETUP_TOKEN` is production-only;
   `ROOIAM_DEMO_SMTP_*` and `ROOIAM_ENDUSER_URL` are demo-only. Use the env file
   that matches the compose file.

3. **Public env files ship with placeholder secrets.** Before a real public
   deploy, edit `.env.docker.public.{prod,demo}`: change `POSTGRES_PASSWORD`,
   `MINIO_ROOT_PASSWORD`, and (prod) `ROOIAM_SETUP_TOKEN`
   (`openssl rand -hex 32`). The committed versions contain `*_here` placeholders.

4. **Google/Microsoft OAuth keys are optional.** Unset shows as `[ - ]`, not an
   error. Demo and local prod run fine without them.

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
