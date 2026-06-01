![Rooiam](./art/rooiam-logo-wordmark-horizontal-transparent-small.png)

**Open Source Passwordless Identity & Access Management — Free. Self-hosted. Yours.**

[![Apache-2.0 License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![Built with Rust](https://img.shields.io/badge/built%20with-Rust%20🦀-orange)](https://www.rust-lang.org/)

---

## What is Rooiam?

Rooiam is an open-source **passwordless IAM platform** built in Rust for multi-product ecosystems.

**Rooiam is passwordless by design.**

In this release, Rooiam does **not** use username/password login for end users. Human sign-in is intentionally based on:

- magic link
- passkey
- Google
- Microsoft

It is purposely not just a "login microservice". Rooiam handles:

- passwordless end-user login
- multi-tenant workspace administration
- hosted login and hosted login widget flows
- first-party and third-party OAuth2/OIDC app delegation
- opaque browser sessions
- machine-to-machine workspace API keys
- audit logs and suspicious-auth visibility

Rooiam `0.1` is aimed at a real early production use case for core hosted login, workspace administration, and workspace API-key flows. It is not presented as “finished forever”; more hardening, analytics, and operational polish continue after `0.1`.

- ✉️ **Magic link** passwordless login via HTML emails
- 🔐 **Google & Microsoft OAuth2** login and explicit account linking
- 🔑 **Passkeys** for passwordless phishing-resistant sign-in
- 🏢 **Multi-tenant organizations** with team invitations
- 🔌 **First-Party Client Network** structure (OIDC Provider for your other apps)
- 🍪 **Opaque session tokens** — HttpOnly cookies, no stateless JWT over-reliance
- 🛡️ **TOTP MFA** for stronger admin and operator security
- 📟 **Extensive Audit Logs** stream (Actor, Action, Ip, Targets)

If you do not see a password field, that is expected behavior, not a missing feature.

[→ Read the architecture guide](docs/architecture.md)

## Docs

Start here:

- [Docs Index](docs/00_docs_index.md)
- [Quickstart With Docker](docs/getting-started/05_quickstart_with_docker.md)
- [Production Guide](docs/production/00_index.md)
- [Demo Guide](docs/demo/00_index.md)
- [Development Guide](docs/development/00_index.md)
- [Architecture](docs/architecture.md)
- [Features](docs/features.md)
- [Product Policy](docs/internal/product_policy.md)
- [Release Roadmap](docs/internal/release_roadmap.md)
- [Phase 2 Developer Platform Checklist](docs/internal/phase2_developer_platform_checklist.md)
- [Phase 2 REST API Test Checklist](docs/internal/phase2_rest_api_test_checklist.md)
- [Identity Data Boundary](docs/identity_data_boundary.md)
- [OAuth Provider Setup](docs/oauth_provider_setup.md)
- [Phase 5 Integration Walkthrough](docs/internal/phase5_integration_walkthrough.md)
- [Internal Notes](docs/internal/00_index.md)

Status and planning:

- [Release Roadmap](docs/internal/release_roadmap.md)
- [Product Policy](docs/internal/product_policy.md)
- [Phase 2 Developer Platform Checklist](docs/internal/phase2_developer_platform_checklist.md)
- [Phase 2 REST API Test Checklist](docs/internal/phase2_rest_api_test_checklist.md)
- [Product Phases](docs/internal/product_phases.md)
- [Phase 3 Readiness](docs/internal/phase3_readiness.md)
- [Phase 5 Demo Checklist](docs/internal/phase5_demo_checklist.md)
- [Phase 6 Self-Host Checklist](docs/internal/phase6_self_host_checklist.md)

Current phase summary:

- `v1` = usable multi-tenant auth core
- `v1.5` = polish plus safe reversible lifecycle controls like pause/resume for users and workspaces
- `v2` = deeper lifecycle and control-plane features like archive/restore and stronger privileged-role safeguards

## Quick Start

This README is organized in this order:

- Docker Quickstart
- Demo Setup
- Development Setup
- Production Setup

## Minimum Tool Versions

If you want to build Rooiam locally from source, use at least:

- Rust
  - minimum: `1.88.0`
- Node.js
  - minimum: `20`
- npm
  - use the npm that ships with Node 20
- PostgreSQL
  - minimum: `16`
- Redis
  - minimum: `7`
- MinIO
  - tested with the current `minio/minio` container image used in Compose
- Mailhog
  - tested with `mailhog/mailhog:v1.0.1`
- Docker Compose
  - recommended for the easiest full local stack

The repo now includes:

- [rust-toolchain.toml](rust-toolchain.toml)

so local Rust builds and Docker builds use the same compiler floor.

## Docker Quickstart

If you want the easiest path, use Docker first.

Fastest full demo:

```bash
docker compose up --build
```

Then open:

| URL | What it is |
|-----|-----------|
| `http://localhost:5171` | Admin (production) |
| `http://localhost:5172` | Portal / login (production) |
| `http://localhost:5173` | Landing page |
| `http://localhost:5175` | Docs |
| `http://localhost:5176` | Book |
| `http://localhost:5181` | Admin (demo) |
| `http://localhost:5182` | Portal / login (demo) |
| `http://localhost:5184` | Demo downstream app |
| `http://localhost:8025` | Mailhog inbox |
| `http://localhost:9001` | MinIO console |

For public / self-hosted use:

```bash
cp .env.docker.prod.template .env
nano .env
docker compose up --build -d
```

The checked-in compose file is optimized for a one-command local start. It ships safe localhost defaults, and the production template is there only when you want to override those values for a real deployment.

More detail:

- [Quickstart With Docker](docs/getting-started/05_quickstart_with_docker.md)

## Cloudflare Pages Frontends

Rooiam is not Cloudflare-only, but Cloudflare Pages is a convenient way to host the static frontends while `rooiam-server` stays on your own machine or VM.

Good split:

- `rooiam.com` -> `rooiam-landing`
- `admin.rooiam.com` -> `rooiam-admin`
- `app.rooiam.com` -> `rooiam-app`
- `docs.rooiam.com` -> `rooiam-docs`
- `book.rooiam.com` -> `rooiam-book`
- `api.rooiam.com` -> `rooiam-server` behind Caddy or another reverse proxy

Cloudflare Pages is a good fit for:

- `rooiam-admin`
- `rooiam-app`
- `rooiam-landing`
- `rooiam-docs`
- `rooiam-book`

It is not where `rooiam-server` runs.

Typical Wrangler deploys:

```bash
cd rooiam-admin
VITE_API_URL=https://api.example.com/v1 \
VITE_DOCS_URL=https://docs.example.com \
npm run build
npm run pages:deploy -- dist --project-name rooiam-admin
```

```bash
cd rooiam-app
VITE_API_URL=https://api.example.com/v1 \
npm run build
npm run pages:deploy -- dist --project-name rooiam-app
```

Important:

- every public browser frontend that calls the API must be added to `ROOIAM_ALLOWED_ORIGINS`
- `rooiam-server` must still be publicly reachable at `api.example.com`
- hosted widget app security still uses app-level `Allowed Embed Origins`, which is separate from global CORS

See:

- [First Production-Style Setup](docs/getting-started/03_first_production_setup.md)

## 1. Demo

Use this path if you want to evaluate Rooiam locally with the seeded demo data and local email capture.

Demo/testing assumptions:

- `ROOIAM_ENABLE_DEMO_SEED=true`
- Mailhog is acceptable for local magic-link testing
- Google / Microsoft OAuth can be skipped if you only want magic-link and demo flows
- local public URLs can stay on `localhost`

Port assignments:

| Port | Service | Notes |
|------|---------|-------|
| `5170` | API server (prod) | `ROOIAM_ENABLE_DEMO_SEED=false` |
| `5171` | Admin (prod) | |
| `5172` | Portal / login (prod) | |
| `5173` | Landing | |
| `5175` | Docs | |
| `5176` | Book | |
| `5180` | API server (demo) | `ROOIAM_ENABLE_DEMO_SEED=true` |
| `5181` | Admin (demo) | points at 5180 |
| `5182` | Portal / login (demo) | points at 5180 |
| `5184` | Demo downstream app | points at 5180 |

Infrastructure defaults used in the example config:

| Dependency | Port | Purpose |
|---|---|---|
| PostgreSQL | `5432` | Primary database |
| Redis | `6379` | OAuth state, rate limiting, short-lived auth state |
| Mailhog SMTP | `1025` | Testing/demo only: local SMTP capture |
| Mailhog UI | `8025` | Testing/demo only: view captured emails |

### Environment Variables to Set Before Starting

These three URL vars must be set correctly **before** the server starts for the first time. They control what gets written into the database during the demo seed — changing them later requires a reseed (see below).

| Variable | Local demo value | Public demo value | Why it matters |
|---|---|---|---|
| `ROOIAM_SERVER_URL` | `http://localhost:5170` | `https://demo-api.yourdomain.com` | Used in OIDC tokens and JWKS endpoint |
| `ROOIAM_ENDUSER_URL` | `http://localhost:5184` | `https://demo.yourdomain.com` | Controls redirect URIs seeded into demo OAuth clients (downstream end-user app) |
| `ROOIAM_ADMIN_URL` | `http://localhost:5181` | `https://demo-admin.yourdomain.com` | Controls admin redirect URIs seeded into demo OAuth clients |
| `ROOIAM_DATABASE_URL` | `postgres://user:pass@localhost:5432/rooiam` | `postgres://rooiam:rooiam@postgres:5432/rooiam_demo` | In demo mode the server auto-switches to `rooiam_demo` database |

**If you change `ROOIAM_APP_URL` or `ROOIAM_ADMIN_URL` after the seed has already run**, the old redirect URIs stay in the database. You must delete the demo OAuth clients and restart:

```bash
# Local
psql YOUR_DATABASE_URL -c "DELETE FROM oauth_clients WHERE client_id LIKE 'demo-%';"

# Docker
docker compose exec postgres \
  psql -U rooiam -d rooiam_demo -c "DELETE FROM oauth_clients WHERE client_id LIKE 'demo-%';"
```

Then restart the server — it will reseed automatically with the correct URLs.

### Start the full local stack for demo magic-link testing

From the repo root:

```bash
docker compose up -d
```

Then confirm:

- app surfaces are running on `5170` to `5176` (prod) and `5180` to `5184` (demo)
- Mailhog UI: `http://localhost:8025`
- Mailhog SMTP listener: `127.0.0.1:1025`

Infrastructure note:

- `postgres`, `redis`, and `minio` stay private inside the Docker network by default
- only the app/web surfaces are published to the host

Use these SMTP values in `rooiam-server/.env` for local demo/testing:

```bash
ROOIAM_DEMO_SMTP_HOST=127.0.0.1
ROOIAM_DEMO_SMTP_PORT=1025
ROOIAM_DEMO_SMTP_FROM=demo@rooiam.local
```

Optional cleanup:

```bash
docker compose down
```

Try the demo app after startup at `http://localhost:5184/?org=roochoco`.

If `ROOIAM_ENABLE_DEMO_SEED=true` is set in the server `.env`, demo accounts are seeded automatically:
- Platform admin: `admin@rooiam.demo`
- Tenant owner: `rooroo@sweetfactory.demo`
- RooChoco customer: `minmin@lovechocolate.user`
- MintMallow customer: `lulu@softmallow.user`
- Demo orgs: `roochoco`, `mintmallow`

Demo surface mapping:

| Surface | URL | Use this demo email | Role |
|---|---|---|---|
| Platform admin (demo) | `http://localhost:5181` | `admin@rooiam.demo` | Platform admin |
| Tenant login chooser (demo) | `http://localhost:5182` | none | Neutral entry page; choose a workspace first |
| Tenant login | `http://localhost:5182/?workspace=roochoco` | `rooroo@sweetfactory.demo` | RooChoco tenant owner/admin |
| Tenant login | `http://localhost:5182/?workspace=mintmallow` | `rooroo@sweetfactory.demo` | MintMallow tenant owner/admin |
| Demo downstream app | `http://localhost:5184/?org=roochoco` | `minmin@lovechocolate.user` | RooChoco client/customer |
| Demo downstream app | `http://localhost:5184/?org=mintmallow` | `lulu@softmallow.user` | MintMallow client/customer |

## 2. Real Production-Mode Path With The Examples

Use this path when you want to test the real product flow instead of the seeded demo flow.

Recommended order:

1. start `rooiam-server` in production mode
2. start `rooiam-admin`
3. open the setup wizard and create the first platform owner
4. finish the minimum platform setup in `rooiam-admin`
5. start `rooiam-app`
6. register the first tenant account
7. sign in to `rooiam-app` as that tenant owner
8. create a workspace
9. create a workspace app
10. register the app callback URLs and allowed embed origins
11. generate a workspace API key if you want to test server-to-server integration
12. run `example-1`, `example-2`, or `example-3`
13. point the examples at the real workspace/app values
14. test the login widget and API integration end to end

Minimal real setup flow:

- `5170`
  - start `rooiam-server` in production mode
- `5171`
  - open `rooiam-admin`
  - create the first platform owner through the setup wizard
  - finish the minimum platform setup:
    - public URLs
    - SMTP
    - Google / Microsoft later if needed
- `5172`
  - open `rooiam-app`
  - register the tenant owner account
  - create the workspace
  - create the workspace app
  - copy:
    - `workspace_id`
    - `client_id`
    - app name
  - set:
    - `Redirect URIs`
    - `Allowed Embed Origins`
  - generate a workspace API key for backend examples if needed

How to run the real examples:

- `example-1`
  - hosted widget only
  - needs:
    - `workspace_id` or `workspace_slug`
    - `client_id`
    - `app_name`
    - `widget_base_url`
- `example-2`
  - real account-style app with callback, dashboard, sessions, passkeys, MFA, and audit activity
  - needs:
    - everything from `example-1`
    - workspace API key for the workspace metadata calls
- `example-3`
  - backend-heavy integration example
  - needs:
    - workspace API key
    - real workspace/app identity if you want to keep the widget path contextual

Example doctrine:

- `example-1`
  - easiest first test for the hosted widget
- `example-2`
  - best real app-style example
- `example-3`
  - best backend / API-key example

If you use Docker:

- `docker compose up -d`
  - starts the full local stack
- then set the example env values:
  - `EXAMPLE_1_WORKSPACE_ID`
  - `EXAMPLE_1_CLIENT_ID`
  - `EXAMPLE_1_APP_NAME`
  - `EXAMPLE_2_WORKSPACE_ID`
  - `EXAMPLE_2_CLIENT_ID`
  - `EXAMPLE_2_APP_NAME`
  - `EXAMPLE_2_API_KEY`
  - `EXAMPLE_3_WORKSPACE_ID`
  - `EXAMPLE_3_CLIENT_ID`
  - `EXAMPLE_3_APP_NAME`
  - `EXAMPLE_3_API_KEY`

This is the real path:

- platform owner sets up the platform in `5171`
- tenant owner manages workspace + app in `5172`
- examples consume those real workspace/app values
- `example-3` additionally uses a real workspace API key

Important:
- `rooiam-app` (`5172`) is the tenant-facing login surface, not the platform admin surface
- `candycloud-web` (`5184`) is the customer/client demo surface, so it must use the customer demo accounts
- `rooiam-admin` (`5171`) is the only surface that should hint `admin@rooiam.demo`

### Alternate Demo-Only UI Ports

If you want to run isolated demo frontends without disturbing the normal local stack,
start each on its demo port (they talk to the demo server on `5180`):

```bash
cd rooiam/rooiam-admin && npm run dev:demo-local   # → 5181
cd rooiam/rooiam-app   && npm run dev:demo-local   # → 5182
cd rooiam/candycloud-web && npm run dev:demo       # → 5184
```

Demo-only UI ports:

| Service | Port | Description |
|---|---|---|
| `rooiam-admin` demo | **5181** | Demo admin surface |
| `rooiam-app` demo | **5182** | Demo tenant login/portal surface |
| `candycloud-web` demo | **5184** | Demo downstream app surface |

Important:
- these alternate ports reuse the same backend on `5170`
- real public magic-link and OAuth callbacks still follow the backend's configured public URLs
- if you need a fully separate authenticated demo stack, run a second backend instance with its own public URL config

## 2. Development

**Prerequisites:** PostgreSQL, Redis, Rust toolchain, Node.js 18+

Install or have available before continuing:

- PostgreSQL 14+ on port `5432`
- Redis on port `6379`
- Rust toolchain with `cargo`
- Node.js 18+ with `npm`
- optional for local email testing: Mailhog on ports `1025` and `8025`

```bash
git clone https://github.com/theparitt/rooiam
cd rooiam
```

#### 2.1 Configure the server

In the example below:

- PostgreSQL username: `rooiam`
- PostgreSQL password: `yourpassword`
- `ROOIAM_ENABLE_DEMO_SEED=true` is for local demo/testing only; set `ROOIAM_ENABLE_DEMO_SEED=false` for production

```bash
mkdir -p rooiam-server
cat > rooiam-server/.env << 'EOF'
ROOIAM_DATABASE_URL=postgres://rooiam:yourpassword@127.0.0.1:5432/rooiam
ROOIAM_REDIS_URL=redis://127.0.0.1:6379
ROOIAM_ALLOWED_ORIGINS=http://localhost:5171,http://localhost:5172,http://localhost:5173,http://localhost:5175,http://localhost:5176,http://localhost:5184
ROOIAM_ENABLE_DEMO_SEED=true
ROOIAM_STORAGE_ROOT=/data/rooiam
ROOIAM_PUBLIC_MEDIA_BASE=/media
ROOIAM_DEMO_SMTP_HOST=127.0.0.1
ROOIAM_DEMO_SMTP_PORT=1025
ROOIAM_DEMO_SMTP_FROM=demo@rooiam.local
EOF
```

Add any optional SMTP, OAuth provider, issuer, and cookie settings afterward.

If you want a cleaner starting point, copy:

- [rooiam-server/.env.template](rooiam-server/.env.template)

Editing guidance:

- advanced users can copy `rooiam-server/.env.template` to `rooiam-server/.env` and edit the file directly
- non-advanced users should still create `rooiam-server/.env` with the required basics, then use the setup wizard for SMTP, Google, Microsoft, and other optional settings

Typical direct-edit commands:

```bash
cp rooiam-server/.env.template rooiam-server/.env
nano rooiam-server/.env
```

SMTP mode rule:

- when `ROOIAM_ENABLE_DEMO_SEED=true`, Rooiam uses `ROOIAM_DEMO_SMTP_*` and defaults to local Mailhog
- when `ROOIAM_ENABLE_DEMO_SEED=false`, Rooiam uses the normal `ROOIAM_SMTP_*` settings (or values saved from the admin UI)

Storage rule:

- Rooiam stores uploaded tenant assets under `ROOIAM_STORAGE_ROOT`
- those files are served publicly from `ROOIAM_PUBLIC_MEDIA_BASE`
- recommended production example:
  - `ROOIAM_STORAGE_ROOT=/data/rooiam`
  - `ROOIAM_PUBLIC_MEDIA_BASE=/media`
- future uploaded workspace assets will resolve to URLs like `/media/uploads/orgs/<org_id>/...`

Setup wizard prefill rule:

- `ROOIAM_SERVER_URL`, `ROOIAM_APP_URL`, and `ROOIAM_ADMIN_URL` can appear as default values in the setup wizard connection step
- if `ROOIAM_SETUP_TOKEN` is set for public first-time setup, paste the same value into the setup wizard `Setup Token` field
- SMTP and OAuth env vars are runtime fallback values, but they do not currently prefill the setup wizard fields
- once saved through setup or admin settings, those values come back from the database and do appear in later setup/settings views

If you want to test magic links locally, start Mailhog before running the server:

```bash
docker compose up -d
# Mailhog UI: http://localhost:8025
```

#### 2.2 Run database migrations

```bash
cd rooiam-server
cargo install sqlx-cli --no-default-features --features postgres
sqlx migrate run --database-url "$ROOIAM_DATABASE_URL"
```

#### 2.3 Start the server

```bash
cd rooiam-server
SQLX_OFFLINE=true cargo run
# → 🚀 Rooiam listening on http://0.0.0.0:5170
```

#### 2.4 Install the frontends

```bash
cd rooiam-admin   && npm install && cd ..
cd rooiam-app     && npm install && cd ..
cd rooiam-landing && npm install && cd ..
cd candycloud-web && npm install && cd ..
cd rooiam-docs    && npm install && cd ..
```

#### 2.5 Start the frontend stack

```bash
bash start_rooiam.sh   # opens 5171 (admin), 5172 (login app), 5173 (landing), 5184 (demo)
```

Run the docs app separately:

```bash
cd rooiam-docs && npm run dev   # opens 5175
```

#### 2.6 Optional admin setup

Open `http://localhost:5171/setup` if you need to initialize or manage instance settings from the UI.

Use the setup/admin UI to:
- create the first platform admin account if one does not exist yet
- optionally save SMTP settings for magic-link emails
- optionally save Google / Microsoft OAuth2 settings if you want social login

Notes:
- if SMTP or Google / Microsoft OAuth values are already provided by environment variables, you do not need to re-enter them here
- for local testing/demo email, you can use Mailhog instead of a real SMTP provider
- for production, configure your real SMTP provider and any Google / Microsoft OAuth settings in `rooiam-admin`
- after setup is completed, setup configuration and secret-bearing setup endpoints are restricted to the signed-in platform superuser
- tenant-facing magic-link email can use workspace name, color, and first-party hosted logo assets, while the real sender domain stays platform-controlled for phishing resistance

## 3. Production

Use this path when deploying a real instance instead of a local demo/testing stack.

### Running Production and Demo Instances Side-by-Side

If you want to run a live public demo (e.g. `demo.rooiam.com`) alongside a real production instance, run two separate server processes pointing at the same Postgres and Redis:

| Instance | Port | `ROOIAM_MODE` | `ROOIAM_DEPLOY_TARGET` | Purpose |
|---|---|---|---|---|
| Production | `5170` | `production` | `local` or `public` | Real tenants and users |
| Demo | `5180` | `demo` | `local` or `public` | Seeded demo tenants (`roochoco`, `mintmallow`) |

The demo frontends — admin (`5181`), portal (`5182`), and demo app (`5184`) — all point at the demo server on `5180`. The production frontends (`5171`, `5172`) point at `5170`. They share the same Postgres and Redis — no need to duplicate the heavy infrastructure.

The demo seed creates isolated tenants with fixed slugs. Real tenants from production coexist in the same database without conflict.

In Docker Compose, this means adding a second `server` service with a separate env file:

```yaml
server-demo:
  image: rooiam-server  # same image as production
  env_file: .env.docker.public.demo
  ports:
    - "5180:5170"
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
```

- set `ROOIAM_ENABLE_DEMO_SEED=false`
- use `rooiam-admin` for platform bootstrap and instance settings
- use `rooiam-app` for tenant login and tenant-admin flows
- use the production docs set for the full operator walkthrough: [docs/production/00_index.md](docs/production/00_index.md)
- use a real SMTP provider, not Mailhog
- configure Google / Microsoft OAuth only if you want those sign-in methods enabled
- review and save production-facing values for issuer URL, hosted login URL, admin URL, cookies, and SMTP in env and/or `rooiam-admin`
- publish SPF, DKIM, and DMARC for your SMTP sender domain before relying on magic-link email in production

Production-focused references:

- [OAuth Provider Setup](docs/oauth_provider_setup.md)
- [Phase 6 Self-Host Checklist](docs/internal/phase6_self_host_checklist.md)

## Fixed Local Ports

These local ports are fixed so Rooiam's frontend apps, redirects, callbacks, and docs all stay aligned. If one of these ports is busy, fix the conflict instead of starting the app on a different port.

| Port | Service | Description |
|------|---------|-------------|
| **5170** | `rooiam-server` (prod) | Rust API server — `ROOIAM_ENABLE_DEMO_SEED=false` |
| **5171** | `rooiam-admin` (prod) | Admin dashboard |
| **5172** | `rooiam-app` (prod) | Login / auth UI |
| **5173** | `rooiam-landing` | Public landing page |
| **5175** | `rooiam-docs` | Standalone documentation app |
| **5176** | `rooiam-book` | IAM textbook |
| **5180** | `rooiam-server` (demo) | Rust API server — `ROOIAM_ENABLE_DEMO_SEED=true` |
| **5181** | `rooiam-admin` (demo) | Admin dashboard pointed at demo server |
| **5182** | `rooiam-app` (demo) | Login / auth UI pointed at demo server |
| **5184** | `candycloud-web` | Downstream demo app |
Rules:
- prod stack: `5170`–`5173`, `5175`–`5176`
- demo stack: `5180`–`5182`, `5184`
- `5183` is unused — demo downstream app is `5184`
- if any service starts on a different port, treat it as a config problem and fix it

## API at a Glance

```bash
# Check health
GET  http://localhost:5170/health

# Send magic link
POST http://localhost:5170/v1/auth/magic-link/start
     { "email": "user@example.com" }

# Check current session (use in your backend middleware)
GET  http://localhost:5170/v1/identity/me
```

[→ Full API docs](http://localhost:5175)

## Project Structure

```
rooiam/
|-- rooiam-server/      # Rust + Actix-Web API server
|   |-- src/
|   |   |-- modules/    # auth, identity, session, oauth, oidc, organization, clients, admin, audit, rbac, setup
|   |   |-- bootstrap/  # config, router, state
|   |   `-- http/       # middleware (auth guard)
|   `-- migrations/     # PostgreSQL migrations (sqlx)
|-- rooiam-admin/       # React admin dashboard (port 5171)
|-- rooiam-app/         # React login UI (port 5172)
|-- rooiam-landing/     # React landing page (port 5173)
|-- candycloud-web/     # Downstream demo app frontend (port 5184)
|-- candycloud-server/  # Downstream demo app backend (port 5185)
|-- rooiam-docs/        # Standalone docs app (port 5175)
|-- rooiam-book/        # IAM textbook (port 5176)
`-- rooiam-examples/    # Integration examples (manual / optional)
    |-- example-1-widget/    # Hosted widget only
    |-- example-2-account/   # Full account app with sessions and MFA
    `-- example-3-backend/   # Backend API key integration
```

## Configuration

Rooiam is configured via environment variables, plus optional SMTP/OAuth settings stored by the admin UI.

Recommended first-start workflow:

1. copy [rooiam-server/.env.template](/rooiam-server/.env.template) to `rooiam-server/.env`
2. fill the required runtime values first: database, redis, allowed origins, issuer URL, login URL, admin URL
3. optionally fill `ROOIAM_SMTP_*`, `ROOIAM_GOOGLE_*`, and `ROOIAM_MICROSOFT_*` in `.env`
4. start the server and open the setup wizard
5. if SMTP or Google / Microsoft were not placed in `.env`, fill and save them in the wizard instead

Recommended operator split:

- advanced users: edit `rooiam-server/.env` directly and keep more of the runtime config in files
- non-advanced users: set only the required basics in `rooiam-server/.env`, then use the setup wizard for optional provider and email settings

Practical rule:

- `.env` is required because the server still needs database, redis, and public URL basics before the wizard can work
- the wizard is the easier path for optional SMTP and Google / Microsoft configuration

Important behavior:

- `ROOIAM_SERVER_URL`, `ROOIAM_APP_URL`, and `ROOIAM_ADMIN_URL` can appear as setup-wizard defaults
- `ROOIAM_SETUP_TOKEN`, if set, must be pasted into the `Setup Token` field during remote first-time setup
- `ROOIAM_SMTP_*`, `ROOIAM_GOOGLE_*`, and `ROOIAM_MICROSOFT_*` work as runtime fallback values, but they do not currently appear prefilled in the wizard on first boot
- once SMTP or OAuth values are saved through setup or admin settings, those saved values reappear later in the forms

| Variable | Required | Description |
|---|---|---|
| `ROOIAM_DATABASE_URL` | ✅ | PostgreSQL connection string |
| `ROOIAM_REDIS_URL` | ✅ | Redis URL for OAuth state storage |
| `ROOIAM_HOST` | Optional | API bind host, defaults to `0.0.0.0` |
| `ROOIAM_PORT` | Optional | API port, defaults to `5170` |
| `ROOIAM_ALLOWED_ORIGINS` | Optional | Comma-separated CORS origins |
| `ROOIAM_SERVER_URL` | Optional | Bootstrap public issuer/base URL used for OIDC metadata and OAuth callback generation; can be overridden later in setup/settings |
| `ROOIAM_APP_URL` | Optional | Bootstrap hosted auth UI URL used in generated magic-link emails; can be overridden later in setup/settings |
| `ROOIAM_ADMIN_URL` | Optional | Bootstrap admin UI URL shown in setup/settings; can be overridden later in setup/settings |
| `ROOIAM_SETUP_TOKEN` | Optional | Required for first-time setup from a public/non-loopback browser when remote bootstrap protection is enabled |
| `VITE_API_URL` | Frontend build | Required API base URL for `rooiam-app` / `rooiam-admin`; the frontends do not guess a default |
| `ROOIAM_COOKIE_DOMAIN` | Optional | Domain attribute for session cookies |
| `ROOIAM_COOKIE_SECURE` | Optional | Force secure cookies on or off |
| `ROOIAM_GOOGLE_CLIENT_ID` | Optional | Google OAuth2 client ID |
| `ROOIAM_GOOGLE_CLIENT_SECRET` | Optional | Google OAuth2 client secret |
| `ROOIAM_MICROSOFT_CLIENT_ID` | Optional | Microsoft OAuth2 client ID |
| `ROOIAM_MICROSOFT_CLIENT_SECRET` | Optional | Microsoft OAuth2 client secret |
| `ROOIAM_MICROSOFT_TENANT_ID` | Optional | Microsoft tenant ID, defaults to `common` |
| `ROOIAM_OIDC_SIGNING_SECRET` | Optional | Secret used to sign OIDC-issued tokens |
| `ROOIAM_OIDC_PRIVATE_KEY_PEM` | Optional | RSA private key PEM for RS256 OIDC signing |
| `ROOIAM_OIDC_PUBLIC_KEY_PEM` | Optional | RSA public key PEM published in JWKS |
| `ROOIAM_OIDC_PRIVATE_KEY_PATH` | Optional | File path to RSA private key PEM |
| `ROOIAM_OIDC_PUBLIC_KEY_PATH` | Optional | File path to RSA public key PEM |
| `ROOIAM_OIDC_KEY_ID` | Optional | Key ID published in JWKS and token headers |
| `ROOIAM_SMTP_HOST` | Optional | SMTP host for magic link emails |
| `ROOIAM_SMTP_PORT` | Optional | SMTP port |
| `ROOIAM_SMTP_USER` | Optional | SMTP username |
| `ROOIAM_SMTP_PASS` | Optional | SMTP password / API key |
| `ROOIAM_SMTP_FROM` | Optional | Sender address for magic-link emails |

## Self-Hosting

Rooiam is source-first today. The documented source-based local setup works, but the repo does not yet ship a full production compose stack, upgrade path, or operator packaging bundle.

Current self-host status:

- local source-based development setup is documented and usable
- runtime config, setup wizard, Redis/Postgres requirements, and production env guidance exist
- `docker-compose.yml` is now the default all-in-one local Docker stack
- production packaging and upgrade/operator docs are tracked in [docs/internal/phase6_self_host_checklist.md](docs/internal/phase6_self_host_checklist.md)

### Redis Setup

Rooiam requires Redis for:
- OAuth state storage
- Redis-backed rate limiting
- short-lived auth state

Set:

```bash
export ROOIAM_REDIS_URL="redis://127.0.0.1:6379"
```

Install Redis on Ubuntu/Debian:

```bash
sudo apt update
sudo apt install redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
redis-cli ping
```

Expected result:

```text
PONG
```

Or run Redis with Docker:

```bash
docker run -d --name rooiam-redis -p 6379:6379 redis:7-alpine
docker exec -it rooiam-redis redis-cli ping
```

Expected result:

```text
PONG
```

If Redis requires a password:

```bash
export ROOIAM_REDIS_URL="redis://:yourpassword@127.0.0.1:6379"
```

If Redis runs on another machine:

```bash
export ROOIAM_REDIS_URL="redis://192.168.0.50:6379"
```

Operator note:
- the admin dashboard can test a Redis connection from `Settings > Redis`
- changing Redis still requires updating `ROOIAM_REDIS_URL` in your deployment and restarting the server

### PostgreSQL Setup

Rooiam requires PostgreSQL 14+.

Install on Ubuntu/Debian:

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
sudo -u postgres psql -c "CREATE USER rooiam WITH PASSWORD 'yourpassword';"
sudo -u postgres psql -c "CREATE DATABASE rooiam OWNER rooiam;"
```

Or run PostgreSQL with Docker:

```bash
docker run -d \
  --name rooiam-postgres \
  -e POSTGRES_USER=rooiam \
  -e POSTGRES_PASSWORD=yourpassword \
  -e POSTGRES_DB=rooiam \
  -p 5432:5432 \
  postgres:16-alpine
```

Then set:

```bash
export ROOIAM_DATABASE_URL="postgres://rooiam:yourpassword@127.0.0.1:5432/rooiam"
```

Use `ROOIAM_DATABASE_URL` for Rooiam runtime configuration. Do not put your main server DB setting in plain `DATABASE_URL`.

### Running the Server

```bash
cd rooiam-server

# First run — apply migrations
sqlx migrate run --database-url "$ROOIAM_DATABASE_URL"

# Start the server
SQLX_OFFLINE=true cargo run
```

The server binds to `0.0.0.0:5170` by default. Override with `ROOIAM_HOST` and `ROOIAM_PORT`.

### Resetting Local State From Zero

If you want to wipe Rooiam back to a fresh database state without deleting `rooiam-server/.env`, run:

```bash
bash reset_rooiam_db.sh
```

This script:

- loads `rooiam-server/.env` if present
- requires `ROOIAM_DATABASE_URL`
- asks you to type `rooiam` to confirm
- drops and recreates the PostgreSQL `public` schema
- reruns all migrations
- does not delete `rooiam-server/.env`

Use this only for local/dev reset flows. It destroys all Rooiam DB data for the configured database.

If your current Rooiam instance uses PostgreSQL from the default Docker stack, you have two stronger Docker reset options too.

Reset only Docker PostgreSQL data:

```bash
docker compose down
docker volume rm rooiam_rooiam_postgres
docker compose up -d
```

This removes only the Docker Postgres volume, so the setup wizard starts from zero again while other Docker volumes stay in place.

Reset the full default Docker stack from zero:

```bash
docker compose down -v
docker compose up -d
```

This removes all named Docker volumes in the default stack, including:

- PostgreSQL data
- Redis data
- MinIO data
- Rooiam storage data

Use the full Docker reset when you want a true clean slate for the entire all-in-one stack.

### Running the Frontend Apps

Each frontend app requires its own `.env` file with the API base URL.

**rooiam-admin** (port 5171):

```bash
cd rooiam-admin
echo "VITE_API_URL=http://localhost:5170/v1" > .env
npm install
npm run dev
```

**rooiam-app** (port 5172 — hosted login UI):

```bash
cd rooiam-app
echo "VITE_API_URL=http://localhost:5170/v1" > .env
npm install
npm run dev
```

**candycloud-web** (port 5184 — downstream demo app frontend):

```bash
cd candycloud-web
cat > .env << 'EOF'
VITE_API_URL=http://localhost:5185/v1
VITE_LOGIN_WIDGET_URL=http://localhost:5180
EOF
npm install
npm run dev
```

### Start Everything at Once

```bash
# In one terminal — starts all frontends (server must be running separately)
bash start_rooiam.sh

# In another terminal — start the Rust server
cd rooiam-server && SQLX_OFFLINE=true cargo run
```

### CORS Configuration

All frontend origins that call the API must be listed in `ROOIAM_ALLOWED_ORIGINS`:

```env
ROOIAM_ALLOWED_ORIGINS=http://localhost:5171,http://localhost:5172,http://localhost:5173,http://localhost:5175
```

Add your own app's origin to this list if you are integrating a downstream app.

For a public-domain deployment, a typical value looks like:

```env
ROOIAM_ALLOWED_ORIGINS=https://admin.rooiam.com,https://app.rooiam.com,https://demo.rooiam.com,https://examples.rooiam.com,https://rooiam.com,https://www.rooiam.com
```

Common symptom when this is wrong:

- browser console shows:
  - `No 'Access-Control-Allow-Origin' header is present on the requested resource`
- network tab may still show `200`

That means the API is reachable, but the current frontend origin is missing from the server CORS allowlist.

Do not confuse this with hosted-widget app settings:

- `ROOIAM_ALLOWED_ORIGINS`
  - global API CORS allowlist
- `Allowed Embed Origins`
  - per-app hosted-widget site allowlist

### Integrating a Downstream App

See [docs/internal/phase5_integration_walkthrough.md](docs/internal/phase5_integration_walkthrough.md) for the full step-by-step guide — covers login redirect, callback handling, session reading, logout, and CORS.

The `candycloud-web` app (`http://localhost:5184`) with `candycloud-server` is the working reference implementation.

### Production Checklist

Before going to production:

- [ ] Set `ROOIAM_COOKIE_SECURE=true` — required when serving over HTTPS
- [ ] Set `ROOIAM_COOKIE_DOMAIN` to your actual domain
- [ ] Set `ROOIAM_SERVER_URL` to your real public API URL (used in OIDC metadata and OAuth callbacks)
- [ ] Set `FRONTEND_URL` to your real hosted login app URL (used in magic-link emails)
- [ ] Set a strong `ROOIAM_OIDC_SIGNING_SECRET` or provide RSA keys via `ROOIAM_OIDC_PRIVATE_KEY_PEM` / `ROOIAM_OIDC_PUBLIC_KEY_PEM`
- [ ] Do **not** set `ROOIAM_ENABLE_DEMO_SEED=true` in production
- [ ] Configure SMTP so magic-link emails are delivered
- [ ] Run behind a reverse proxy (nginx, Caddy, Traefik) with TLS termination
- [ ] Use connection pooling for PostgreSQL (PgBouncer or built-in pool)

## Project Status

Current high-level status:

- core IAM features are implemented
- the tenant portal and demo app are implemented
- self-host packaging and operator docs are still the main product gap
- live end-to-end verification and product hardening are still ongoing

Source-of-truth docs:

- implemented feature surface: [docs/features.md](docs/features.md)
- roadmap and milestones: [docs/internal/product_phases.md](docs/internal/product_phases.md)
- runtime verification: [docs/internal/phase3_readiness.md](docs/internal/phase3_readiness.md)
- self-host adoption work: [docs/internal/phase6_self_host_checklist.md](docs/internal/phase6_self_host_checklist.md)

## License

Apache-2.0 — see [LICENSE](LICENSE).
