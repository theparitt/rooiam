# Quickstart With Docker

Use this path for the easiest way to run Rooiam without installing databases or configuring servers manually.

> [!TIP]
> **What is Docker?** Docker runs applications inside lightweight, isolated containers. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) first, then one command starts the entire Rooiam ecosystem.

## The Two Stacks

Rooiam uses **two separate stacks** controlled by compose files and environment files:

| Stack | Compose File | Env File | Purpose |
|-------|-------------|----------|---------|
| Production | `docker-compose.yml` | `.env.docker.local.prod` or `.env.docker.public.prod` | Real deployment |
| Demo | `docker-compose.demo.yml` | `.env.docker.local.demo` or `.env.docker.public.demo` | Demo/preview |

| Axis | Controlled By | Examples |
|------|--------------|----------|
| **prod / demo** | compose file | `docker-compose.yml` vs `docker-compose.demo.yml` |
| **local / public** | env file | `.env.docker.local.prod` vs `.env.docker.public.prod` |

---

## 1A. Local Production (for development)

```bash
docker compose -f docker-compose.yml --env-file .env.docker.local.prod up -d --build
```

Starts: API (`5170`), Admin (`5171`), Portal (`5172`), Landing (`5173`), Docs (`5175`)

---

## 1B. Local Demo (fastest preview)

```bash
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo up -d --build
```

Starts: Demo API (`5180`), Demo Admin (`5181`), Demo Portal (`5182`), Demo App (`5184`)

With pre-seeded demo accounts and Mailhog for magic links.

---

## 1C. Public Production (self-hosted)

```bash
cp .env.docker.public.prod .env.temp
# Edit .env.temp with your real domains, passwords, and credentials
docker compose -f docker-compose.yml --env-file .env.temp up -d --build
```

See [First Production Setup](./03_first_production_setup.md) for full guidance.

---

## Local URLs

### Production Stack

| URL | Purpose |
|-----|---------|
| `http://localhost:5170` | API server (prod) |
| `http://localhost:5171` | Admin console |
| `http://localhost:5172` | Tenant portal / login |
| `http://localhost:5173` | Landing page |
| `http://localhost:5175` | Docs |
| `http://localhost:8025` | Mailhog inbox |
| `http://localhost:9001` | MinIO console |

### Demo Stack

| URL | Purpose |
|-----|---------|
| `http://localhost:5180` | API server (demo) |
| `http://localhost:5181` | Admin (demo) |
| `http://localhost:5182` | Portal / login (demo) |
| `http://localhost:5184` | Demo downstream app |

---

## Demo Accounts (seeded automatically)

| Email | Password | Role |
|-------|----------|------|
| `admin@rooiam.demo` | magic link / demo OAuth | Platform admin |
| `rooroo@sweetfactory.demo` | magic link / demo OAuth | Tenant owner |
| `minmin@lovechocolate.user` | magic link / demo OAuth | RooChoco end user |

> [!WARNING]
> Do not keep demo admin and demo portal signed in at the same time in the same browser.
> Use separate browsers or private windows.

Magic-link emails go to Mailhog at `http://localhost:8025`.

---

## Environment Files

### `.env.docker.local.prod` — Local Production

For development with localhost URLs, Mailhog, and no real OAuth.

### `.env.docker.public.prod` — Public Production

For real deployments with HTTPS domains, real SMTP, and OAuth credentials.

### `.env.docker.local.demo` — Local Demo

For local demo preview with seeded data.

### `.env.docker.public.demo` — Public Demo

For publicly hosted demo instances.

See [Environment Configuration Reference](../reference/05_environment_configuration.md) for full variable documentation.

---

## Common Commands

```bash
# Stop services
docker compose -f docker-compose.yml down

# Stop demo services
docker compose -f docker-compose.demo.yml down

# Wipe volumes (full reset)
docker compose -f docker-compose.yml down -v
docker compose -f docker-compose.demo.yml down -v

# Rebuild
docker compose -f docker-compose.yml --env-file .env.docker.local.prod up -d --build
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo up -d --build
```

---

## Port Reference

| Port | Service | Stack |
|------|---------|-------|
| `5170` | API server (prod) | prod |
| `5171` | Admin (prod) | prod |
| `5172` | Portal / login (prod) | prod |
| `5173` | Landing | prod |
| `5175` | Docs | prod |
| `5180` | API server (demo) | demo |
| `5181` | Admin (demo) | demo |
| `5182` | Portal / login (demo) | demo |
| `5184` | Demo downstream app | demo |
| `8025` | Mailhog UI | both |
| `9001` | MinIO console | both |

---

## Troubleshooting

### Services not starting

```bash
docker compose -f docker-compose.demo.yml ps
docker compose -f docker-compose.demo.yml logs
```

### Database migration issues

```bash
docker compose -f docker-compose.demo.yml exec demo-server sh
sqlx migrate run --database-url "$ROOIAM_DATABASE_URL"
```

### Need to reseed demo data

```bash
docker compose -f docker-compose.demo.yml exec postgres psql -U rooiam -d rooiam_demo -c "DELETE FROM oauth_client_redirect_uris WHERE oauth_client_id IN (SELECT id FROM oauth_clients WHERE client_id LIKE 'demo-%');"
docker compose -f docker-compose.demo.yml restart demo-server
```

See [Troubleshooting](../troubleshooting/00_index.md) for more.
