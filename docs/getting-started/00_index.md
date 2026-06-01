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

### Production Stack
Start with: `docker compose -f docker-compose.yml --env-file .env.docker.local.prod up -d --build`

| URL | Purpose |
|-----|---------|
| `http://localhost:5170` | API server (prod) |
| `http://localhost:5171` | Admin console |
| `http://localhost:5172` | Portal / login |
| `http://localhost:5173` | Landing page |
| `http://localhost:5175` | Documentation site |

### Demo Stack
Start with: `docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo up -d --build`

| URL | Purpose |
|-----|---------|
| `http://localhost:5180` | API server (demo) — seeded tenants |
| `http://localhost:5181` | Admin (demo) |
| `http://localhost:5182` | Portal / login (demo) |
| `http://localhost:5184` | Demo downstream app |

### Shared Services
Available in both stacks:

| URL | Purpose |
|-----|---------|
| `http://localhost:8025` | Mailhog inbox for magic-link emails |
| `http://localhost:9001` | MinIO console |

## Legacy Notes

Older mission-style pages were moved out of the public getting-started path.

If you need them for historical reference, they now live under:
- `docs/internal/legacy-getting-started/`

If you are starting fresh, follow the canonical links above instead.
