# Running the Stack

## Fastest Path — Docker

```bash
cd rooiam
docker compose -f docker-compose.prod.yml --env-file .env.docker.local.prod up --build -d
```

First create the env file using the [Environment Configuration Guide](../reference/05_environment_configuration.md). This starts the production API plus Postgres, Redis, MinIO, and Mailhog. Frontends and the seeded demo stack run separately.

No Rust toolchain required.

## Source-Based Development

### Start the Server

Generate configuration with `SQLX_OFFLINE=true cargo run -- setup` first; mode env files are untracked. The server reads `.env` by default or the file passed with `--env-file`. To switch between files you have created:

```bash
cd rooiam/rooiam-server

# production (517x)
SQLX_OFFLINE=true cargo run -- --env-file .env.local.prod

# demo (518x) — seeds demo data
SQLX_OFFLINE=true cargo run -- --env-file .env.local.demo
```

> The server auto-creates the database, runs migrations, and (in demo) seeds data
> on startup — you do not need to pre-create anything in Postgres or MinIO.
>
> Demo mode requires a database whose name ends in `rooiam_demo` (safety check).
> Do **not** flip `ROOIAM_MODE` inside a prod `.env`: production-only vars like
> `ROOIAM_SETUP_TOKEN` are rejected in demo mode (and vice-versa). Use the
> matching env file instead.

### Start the frontend helper

```bash
cd rooiam
bash start_rooiam.sh
```

The helper starts production admin/portal, landing, and CandyCloud web. It does not start API servers, demo admin/portal, docs, or the book. Install dependencies and configure each app first.

Run docs separately:

```bash
cd rooiam/rooiam-docs
npm run dev
```

### Frontend env modes

`rooiam-admin` and `rooiam-app` are Vite apps configured by one env file per mode,
selected with `--mode`. The only required variable is `VITE_API_URL` (the
`rooiam-server` base, including `/v1`).

| Mode | Env file | `VITE_API_URL` |
|------|----------|----------------|
| `prod-local` | `.env.prod-local` | `http://localhost:5170/v1` |
| `demo-local` | `.env.demo-local` | `http://localhost:5180/v1` |
| `prod-online` | `.env.prod-online` | `https://api.rooiam.com/v1` |
| `demo-online` | `.env.demo-online` | `https://demo-api.rooiam.com/v1` |

Run a specific mode (ports are baked into the scripts):

```bash
cd rooiam/rooiam-app   && npm run dev:prod-local   # → :5172
cd rooiam/rooiam-app   && npm run dev:demo-local   # → :5182
cd rooiam/rooiam-admin && npm run dev:prod-local   # → :5171
cd rooiam/rooiam-admin && npm run dev:demo-local   # → :5181
```

Builds: `npm run build:prod-online` / `npm run build:demo-online`. See each app's
`README.md` for full details.

## Port Reference

| Port | Service | Stack |
|------|---------|-------|
| `5170` | `rooiam-server` (prod) | prod |
| `5171` | `rooiam-admin` (prod) | prod |
| `5172` | `rooiam-app` (prod) | prod |
| `5173` | `rooiam-landing` | prod |
| `5175` | `rooiam-docs` | prod |
| `5176` | `rooiam-book` | prod |
| `5180` | `rooiam-server` (demo) | demo |
| `5181` | `rooiam-admin` (demo) | demo |
| `5182` | `rooiam-app` (demo) | demo |
| `5185` | `candycloud-server` | demo |
| `5184` | `candycloud-web` | demo |
| `8025` | Mailhog UI | demo |

### Starting Candycloud locally

```bash
# 1. Start the demo Rooiam server (port 5180)
cd rooiam-server && SQLX_OFFLINE=true cargo run -- --env-file .env.local.demo

# 2. Start candycloud-server (port 5185)
cd candycloud-server && node src/index.js

# 3. Start candycloud-web (port 5184)
cd candycloud-web && npm run dev
```

## Mailhog

Use the Mailhog service in your chosen Compose stack. Production Compose publishes `8025`; the [demo quickstart](../getting-started/05_quickstart_with_docker.md) publishes `8026`. For a source-run server, set SMTP to the published host port rather than the container-only `mailhog:1025` address.

## Basic Verification

```bash
cd rooiam/rooiam-server && cargo check
cd rooiam/rooiam-admin && npm run build
cd rooiam/rooiam-app && npm run build
cd rooiam/rooiam-landing && npm run build
cd rooiam/rooiam-docs && npm run build
```
