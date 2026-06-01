# Running the Stack

## Fastest Path — Docker

```bash
cd /home/theparitt/work/rooiam
docker compose -f docker-compose.yml --env-file .env.docker.local.prod up --build -d
```

This starts the full local Docker stack with:

- production-style surfaces
- seeded demo surfaces
- Postgres, Redis, MinIO, Mailhog

No Rust toolchain required.

## Source-Based Development

### Start the Server

```bash
cd /home/theparitt/work/rooiam/rooiam-server
SQLX_OFFLINE=true cargo run -- --env-file .env.local.prod
```

### Start All Frontends

```bash
cd /home/theparitt/work/rooiam
bash start_rooiam.sh
```

Run docs separately:

```bash
cd /home/theparitt/work/rooiam/rooiam-docs
npm run dev
```

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

```bash
docker compose up -d
```

Mailhog UI: `http://localhost:8025`

## Basic Verification

```bash
cd /home/theparitt/work/rooiam/rooiam-server && cargo check
cd /home/theparitt/work/rooiam/rooiam-admin && npm run build
cd /home/theparitt/work/rooiam/rooiam-app && npm run build
cd /home/theparitt/work/rooiam/rooiam-landing && npm run build
cd /home/theparitt/work/rooiam/rooiam-docs && npm run build
```
