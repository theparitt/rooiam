# Environment Configuration Guide

Rooiam has two runtime axes: `ROOIAM_MODE` (`production`, `demo`, or isolated `test`) and `ROOIAM_DEPLOY_TARGET` (`local` or `public`). The same Rust binary supports these combinations.

Deployment env files are untracked. Their names in examples are conventions, not files supplied by a fresh clone. For a complete local demo env block, use the [Docker Quickstart](../getting-started/05_quickstart_with_docker.md).

## Source execution

From `rooiam-server`, generate server configuration interactively:

```bash
SQLX_OFFLINE=true cargo run -- setup
SQLX_OFFLINE=true cargo run -- --env-file .env.local.prod
```

Use the output filename you selected in the wizard. Without `--env-file`, the binary loads `.env` through dotenv. Existing process environment variables take precedence. The wizard writes server configuration; it does not generate the different Docker Compose interpolation inputs.

Startup checks required values and rejects unrecognized `ROOIAM_*` names. Production uses `ROOIAM_SMTP_*` and `ROOIAM_SETUP_TOKEN`; demo uses `ROOIAM_DEMO_SMTP_*`. Do not change only the mode in an otherwise incompatible env file.

## Compose inputs versus server variables

Compose reads the chosen env file to substitute `${...}` expressions. Only variables explicitly forwarded by a service's `environment` block enter that container. Adding a variable to `--env-file` does not automatically configure the server.

| Purpose | Production Compose input | Demo Compose input | Server receives |
|---|---|---|---|
| API URL | `ROOIAM_SERVER_URL` | `ROOIAM_DEMO_SERVER_URL` | `ROOIAM_SERVER_URL` |
| Portal URL | `ROOIAM_APP_URL` | `ROOIAM_DEMO_APP_URL` | `ROOIAM_APP_URL` |
| Admin URL | `ROOIAM_ADMIN_URL` | `ROOIAM_DEMO_ADMIN_URL` | `ROOIAM_ADMIN_URL` |
| Target | `ROOIAM_DEPLOY_TARGET` | `ROOIAM_DEMO_DEPLOY_TARGET` | `ROOIAM_DEPLOY_TARGET` |
| Secure cookie | `ROOIAM_COOKIE_SECURE` | `ROOIAM_DEMO_COOKIE_SECURE` | `ROOIAM_COOKIE_SECURE` |
| Database URL | `ROOIAM_DATABASE_URL` | `ROOIAM_DEMO_DATABASE_URL` | `ROOIAM_DATABASE_URL` |
| Redis URL | `ROOIAM_REDIS_URL` | `ROOIAM_DEMO_REDIS_URL` | `ROOIAM_REDIS_URL` |
| CORS | `ROOIAM_ALLOWED_ORIGINS` | `ROOIAM_DEMO_ALLOWED_ORIGINS` | `ROOIAM_ALLOWED_ORIGINS` |
| Storage credentials | `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | `ROOIAM_DEMO_MINIO_USER` / `ROOIAM_DEMO_MINIO_PASSWORD` | `ROOIAM_MINIO_USER` / `ROOIAM_MINIO_PASSWORD` |

Demo also forwards `ROOIAM_DEMO_ENDUSER_URL` as `ROOIAM_ENDUSER_URL` for seeded downstream callbacks. It uses `ROOIAM_DEMO_DB_NAME`, `ROOIAM_DEMO_DB_USER`, and `ROOIAM_DEMO_DB_PASSWORD` for Postgres and `ROOIAM_DEMO_*_BIND` variables for host ports.

## Local production example

Create `.env.docker.local.prod` at the repository root. This example is for local evaluation only; replace the credentials before using real data.

```env
POSTGRES_DB=rooiam
POSTGRES_USER=rooiam
POSTGRES_PASSWORD=local_prod_password
MINIO_ROOT_USER=rooiam
MINIO_ROOT_PASSWORD=local_prod_minio_password
ROOIAM_DEPLOY_TARGET=local
ROOIAM_COOKIE_SECURE=false
ROOIAM_SERVER_URL=http://localhost:5170
ROOIAM_APP_URL=http://localhost:5172
ROOIAM_ADMIN_URL=http://localhost:5171
ROOIAM_ALLOWED_ORIGINS=http://localhost:5171,http://localhost:5172
ROOIAM_DATABASE_URL=postgres://rooiam:local_prod_password@postgres:5432/rooiam
ROOIAM_REDIS_URL=redis://redis:6379
ROOIAM_PUBLIC_MEDIA_BASE=/media
ROOIAM_MINIO_ENDPOINT=http://minio:9000
ROOIAM_MINIO_BUCKET=rooiam
ROOIAM_SETUP_TOKEN=replace_with_a_random_setup_token
ROOIAM_SMTP_HOST=mailhog
ROOIAM_SMTP_PORT=1025
ROOIAM_SMTP_SECURITY=none
ROOIAM_SMTP_FROM=noreply@rooiam.local
```

Generate a setup token with `openssl rand -hex 32`, put it in the file, then run:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.docker.local.prod up -d --build
```

This starts the API on `5170`, Mailhog on `8025`, and the MinIO console on `9001`. Admin and portal are separate dev servers on `5171` and `5172`. Postgres, Redis, and the MinIO API are accessed through the Compose network, not published host ports.

## Public deployment

Create an appropriately named public env file with your HTTPS URLs, real credentials, secure cookies, and SMTP configuration. Configure a reverse proxy and deploy the frontends separately. Google/Microsoft credentials are optional if those methods are disabled.

The supplied production Compose file does not forward every setting in the [server variable catalog](./08_env_var_catalog.md). In particular, add explicit environment/volume mappings for RSA signing keys, WebAuthn configuration, cookie-domain settings, or other optional server features when needed. Merely adding them to the env file is insufficient.

## Images and updates

- `docker-compose.prod.yml` builds the server from the checkout.
- `docker-compose.demo.yml` uses `ghcr.io/theparitt/rooiam-demo-server:latest`. Use `pull` to update it, or build that tag locally as shown in the quickstart.
- Both stacks run migrations in the Rust process at startup. The runtime image has no `sqlx` command.
- Use `--env-file` with `logs`, `ps`, `restart`, and `down` as well as `up`.

Inspect `/health` or `/server-info` for the running package version and available build metadata. An image's `latest` tag does not prove it matches your checkout.
