# Quickstart With Docker

The Compose stacks start the Rust API, PostgreSQL, Redis, MinIO (plus bucket initialization), and Mailhog. Run the frontends separately. Deployment env files are untracked, so a fresh clone must create them first.

## Local demo

Create `.env.docker.local.demo` in the repository root with this **local-only** configuration. These example credentials are for disposable evaluation data.

```env
ROOIAM_MODE=demo
ROOIAM_DEMO_DEPLOY_TARGET=local
ROOIAM_DEMO_HOST=0.0.0.0
ROOIAM_DEMO_PORT=5170
ROOIAM_DEMO_SERVER_BIND=127.0.0.1:5180
ROOIAM_DEMO_COOKIE_SECURE=false
ROOIAM_DEMO_COOKIE_DOMAIN=
ROOIAM_DEMO_SERVER_URL=http://localhost:5180
ROOIAM_DEMO_APP_URL=http://localhost:5182
ROOIAM_DEMO_ADMIN_URL=http://localhost:5181
ROOIAM_DEMO_ENDUSER_URL=http://localhost:5184
ROOIAM_DEMO_CANDYCLOUD_API_URL=http://localhost:5185/v1
ROOIAM_DEMO_ALLOWED_ORIGINS=http://localhost:5181,http://localhost:5182,http://localhost:5184
ROOIAM_DEMO_DB_NAME=rooiam_demo
ROOIAM_DEMO_DB_USER=rooiam
ROOIAM_DEMO_DB_PASSWORD=local_demo_password
ROOIAM_DEMO_POSTGRES_BIND=127.0.0.1:15432
ROOIAM_DEMO_DATABASE_URL=postgres://rooiam:local_demo_password@postgres:5432/rooiam_demo
ROOIAM_DEMO_REDIS_BIND=127.0.0.1:16379
ROOIAM_DEMO_REDIS_URL=redis://redis:6379
ROOIAM_DEMO_STORAGE_ROOT=/data/rooiam
ROOIAM_DEMO_PUBLIC_MEDIA_BASE=/media
ROOIAM_DEMO_MINIO_ENDPOINT=http://minio:9000
ROOIAM_DEMO_MINIO_BUCKET=rooiam
ROOIAM_DEMO_MINIO_USER=rooiam
ROOIAM_DEMO_MINIO_PASSWORD=local_demo_minio_password
ROOIAM_DEMO_MINIO_BIND=127.0.0.1:19000
ROOIAM_DEMO_MINIO_CONSOLE_BIND=127.0.0.1:19001
ROOIAM_DEMO_MAILHOG_SMTP_BIND=127.0.0.1:1026
ROOIAM_DEMO_MAILHOG_UI_BIND=127.0.0.1:8026
ROOIAM_DEMO_SMTP_HOST=mailhog
ROOIAM_DEMO_SMTP_PORT=1025
ROOIAM_DEMO_SMTP_FROM=demo@rooiam.local
ROOIAM_DEMO_MAILBOX_URL=http://localhost:8026
```

From the repository root:

```bash
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo up -d
curl http://localhost:5180/health
```

The demo Compose file uses `ghcr.io/theparitt/rooiam-demo-server:latest`; it has no `build` section. To evaluate the source in your checkout, build that image locally first:

```bash
docker build -t ghcr.io/theparitt/rooiam-demo-server:latest -f Dockerfile.server.prod .
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo up -d --pull never
```

The server runs migrations and seeds demo data at startup. The database name must end in `rooiam_demo`. A healthy response has `status: "ok"`, `mode: "demo"`, and successful database/Redis checks; `version` is the Cargo package version.

## Start the frontends

Install Node dependencies in each frontend first. Create `rooiam-admin/.env.demo-local.local` and `rooiam-app/.env.demo-local.local`, each containing:

```env
VITE_API_URL=http://localhost:5180/v1
VITE_DOCS_URL=http://localhost:5175
```

Run these in separate terminals from the repository root:

```bash
npm --prefix rooiam-admin install
npm --prefix rooiam-admin run dev:demo-local
```

```bash
npm --prefix rooiam-app install
npm --prefix rooiam-app run dev:demo-local
```

| URL | Surface |
|---|---|
| `http://localhost:5180/health` | API health |
| `http://localhost:5181` | Platform admin (separate dev server) |
| `http://localhost:5182` | Tenant portal (separate dev server) |
| `http://localhost:8026` | Mailhog inbox |
| `http://localhost:19001` | MinIO console; credentials from the env file |

Sign in with `admin@rooiam.demo` for platform administration or `rooroo@sweetfactory.demo` for tenant administration. Use separate browser profiles for simultaneous operator and tenant sessions: cookies on localhost are shared across ports. Login uses magic links or configured demo methods, not passwords.

CandyCloud needs its own backend and frontend; follow [Local Setup](../development/01_local_setup.md). It is not started by this Compose stack.

## Production and other targets

| Purpose | Compose file | Local env file convention |
|---|---|---|
| Production API + infrastructure | `docker-compose.prod.yml` | `.env.docker.local.prod` or `.env.docker.public.prod` |
| Demo API + infrastructure | `docker-compose.demo.yml` | `.env.docker.local.demo` or `.env.docker.public.demo` |
| Source-development Postgres + MinIO only | `docker-compose.local.yml` | No env file required |

Production Compose builds `Dockerfile.server.prod`. Its env names differ from the demo Compose inputs. See [Environment Configuration](../reference/05_environment_configuration.md) and [First Production Setup](./03_first_production_setup.md). Frontends and HTTPS termination are deployed separately.

## Logs and shutdown

Include the same env file on every Compose command:

```bash
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo ps
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo logs --tail 50 demo-server
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo down
```

`down` preserves volumes. Add `-v` only to deliberately delete all data in this disposable stack. Migrations run in the server binary; the runtime image does not include the `sqlx` CLI.
