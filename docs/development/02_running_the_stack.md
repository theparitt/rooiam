# Running the Stack

## Fastest Path — Docker

```bash
cd rooiam
docker compose -f docker-compose.yml --env-file .env.docker.local.prod up --build -d
```

This starts the full local Docker stack with:

- production-style surfaces
- seeded demo surfaces
- Postgres, Redis, MinIO, Mailhog

No Rust toolchain required.

## Source-Based Development

### Start the Server

The server always reads `rooiam-server/.env`. To switch modes, copy the env file
for the mode you want onto `.env`, then run:

```bash
cd rooiam/rooiam-server

# production (517x)
cp .env.local.prod .env && SQLX_OFFLINE=true cargo run

# demo (518x) — seeds demo data
cp .env.local.demo .env && SQLX_OFFLINE=true cargo run
```

> The server auto-creates the database, runs migrations, and (in demo) seeds data
> on startup — you do not need to pre-create anything in Postgres or MinIO.
>
> Demo mode requires a database whose name ends in `rooiam_demo` (safety check).
> Do **not** flip `ROOIAM_MODE` inside a prod `.env`: production-only vars like
> `ROOIAM_SETUP_TOKEN` are rejected in demo mode (and vice-versa). Use the
> matching env file instead.

### Start All Frontends

```bash
cd rooiam
bash start_rooiam.sh
```

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
cd rooiam-server && cp .env.local.demo .env && SQLX_OFFLINE=true cargo run

# 2. Start candycloud-server (port 5185)
cd candycloud-server && node src/index.js

# 3. Start candycloud-web (port 5184)
cd candycloud-web && npm run dev
```

## Mailhog

```bash
docker compose up -d
```

Mailhog UI: `http://localhost:8025`

## Basic Verification

```bash
cd rooiam/rooiam-server && cargo check
cd rooiam/rooiam-admin && npm run build
cd rooiam/rooiam-app && npm run build
cd rooiam/rooiam-landing && npm run build
cd rooiam/rooiam-docs && npm run build
```
