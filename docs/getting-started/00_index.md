# Quick Start

Start here if you want the shortest path into Rooiam without reading the whole docs tree first.

This page is now the canonical entry point for public getting-started docs.

Rooiam is the self-hosted passwordless IAM for multi-tenant SaaS.

Simple meaning:

- your product has many customer workspaces
- you want hosted login and tenant access control
- you want to run the identity system yourself

Current status:

- Rooiam already works as a real product
- it is still early-stage
- the best fit today is evaluation, internal use, and early adopter SaaS teams

## Choose Your Path

### See Rooiam working now (fastest)

- [Run the Demo Locally](./01_run_demo_locally.md) — demo stack with seeded accounts
- [Quickstart With Docker](./05_quickstart_with_docker.md) — all options explained

Use this when you want:
- the fastest local preview
- seeded demo accounts
- Mailhog and local object storage

### Normal developer setup

- [Run the Full Local Development Stack](./02_run_local_development.md)
- [Android phone sign-in walkthrough](./10_android_phone_sign_in_walkthrough.md) — follow each app and browser screen
- [Phone sign-in for tenant workspaces](../tenant_phone_sign_in.md) — what must be ready before enabling the button
- [Build your first Android phone sign-in app](./11_build_your_first_android_app.md) — from a fresh clone to your own Play-backed test
- [Build a branded Android phone app](./12_white_label_android_starter.md) — tenant-owned source and Play listing
- [Android SDK integration](../reference/14_android_sdk_integration.md) — annotated SDK calls and lifecycle details

Use this when you want:
- a real dev environment (not Docker)
- Rust + Node.js running locally
- clearer control over env/config

### First real deployment

- [First Production Setup](./03_first_production_setup.md)
- [Environment Configuration](../reference/05_environment_configuration.md)
- [Production Guide](../production/00_index.md)

Use this when you want:
- a real hosted deployment
- SMTP, OAuth provider, storage, cookies, and security guidance

## Understand The Product Surfaces

- [Choose the Right Surface](./04_which_app_to_use.md)
- [Product Surface Map](../reference/05_product_surface_map.md)

Read these if you are unsure about:
- `rooiam-admin`
- `rooiam-app`
- `rooiam-server`
- `rooiam-docs`
- `rooiam-book`

## Helpful References

- [Glossary](./00_glossary.md)
- [End-User Account Center](./09_end_user_account_center.md)
- [FAQ](../reference/07_faq.md)

## Local URL Map

Create the env files using the [Docker quickstart](./05_quickstart_with_docker.md) and [configuration guide](../reference/05_environment_configuration.md). Compose starts the API and infrastructure; the frontends listed below are separate dev servers.

### Production Stack
Start with: `docker compose -f docker-compose.prod.yml --env-file .env.docker.local.prod up -d --build`

| URL | Purpose |
|-----|---------|
| `http://localhost:5170` | API server (prod) |
| `http://localhost:5171` | Admin console |
| `http://localhost:5172` | Portal / login |
| `http://localhost:5173` | Landing page |
| `http://localhost:5175` | Documentation site |

### Demo Stack
Start with: `docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo up -d`

| URL | Purpose |
|-----|---------|
| `http://localhost:5180` | API server (demo) — seeded tenants |
| `http://localhost:5181` | Admin (demo) |
| `http://localhost:5182` | Portal / login (demo) |
| `http://localhost:5184` | Demo downstream app |

### Infrastructure consoles
Production Compose uses the first pair of ports; the demo quickstart uses the second:

| URL | Purpose |
|-----|---------|
| `http://localhost:8025` / `http://localhost:8026` | Production / demo Mailhog inbox |
| `http://localhost:9001` / `http://localhost:19001` | Production / demo MinIO console |

Older mission-style pages are maintained separately. Start with the current guides above.
