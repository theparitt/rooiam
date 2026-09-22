# Demo Guide

Use this section if you want to evaluate Rooiam locally with seeded demo data.

Read in this order:

1. [Demo Account Map](./01_accounts_and_surfaces.md)
2. [Demo Walkthrough](./02_walkthrough.md)

## What Demo Mode Means

When `ROOIAM_MODE=demo`:

- demo users and demo workspaces are seeded automatically
- demo SMTP uses Mailhog
- `candycloud-web` becomes a customer-facing sample app
- `rooiam-app` becomes the tenant login/portal surface
- `rooiam-admin` remains the platform-admin surface
- `rooiam-docs` remains the standalone documentation surface

## Demo Surfaces

| Port | Service |
|------|---------|
| `5180` | API server (demo) |
| `5181` | Admin (demo) |
| `5182` | Portal / login (demo) |
| `5184` | Demo downstream app |
| `8026` | Mailhog inbox |
| `19001` | MinIO console |

First follow the [Docker Quickstart](../getting-started/05_quickstart_with_docker.md) to create the env file and start the frontends separately. The API/infra command is:

```bash
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo up -d
```
