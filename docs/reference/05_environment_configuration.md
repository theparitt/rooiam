# Environment Configuration Guide

This document describes how to configure Rooiam for different deployment scenarios using environment variables and Docker Compose.

## Architecture Overview

Rooiam uses a **2-axis separation** for environment configuration:

| Axis | Purpose | Controlled By |
|------|---------|---------------|
| **Mode** | System behavior (demo vs production) | `docker-compose.yml` / `docker-compose.demo.yml` |
| **Target** | Deployment destination (local vs public-domain) | `.env.docker.*` files |

### The Four Environments

| Environment | Compose File | Env File | Use Case |
|------------|--------------|----------|----------|
| Local Production | `docker-compose.yml` | `.env.docker.local.prod` | Development on localhost/LAN |
| Public Production | `docker-compose.yml` | `.env.docker.public.prod` | Production deployment |
| Local Demo | `docker-compose.demo.yml` | `.env.docker.local.demo` | Demo development on localhost/LAN |
| Public Demo | `docker-compose.demo.yml` | `.env.docker.public.demo` | Public demo deployment |

---

## Quick Start Commands

```bash
# Local Production
docker compose -f docker-compose.yml --env-file .env.docker.local.prod up -d --build

# Public Production
docker compose -f docker-compose.yml --env-file .env.docker.public.prod up -d --build

# Local Demo
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo up -d --build

# Public Demo
docker compose -f docker-compose.demo.yml --env-file .env.docker.public.demo up -d --build
```

---

## What Differs Between Modes

### Differences Due to `demo / prod` (System Behavior)

These are set in compose files:

| Setting | Production | Demo |
|---------|------------|------|
| `ROOIAM_MODE` | `production` | `demo` |
| Database | Separate prod DB | Separate demo DB |
| Redis | Separate prod Redis | Separate demo Redis |
| SMTP | Real SMTP | Mock/Demo SMTP |
| Pre-seeded data | None | Users, workspaces, OAuth clients |

### Differences Due to `local / public` (URLs & Security)

| Setting | Local | Public |
|---------|-------|--------|
| URLs | `http://localhost:*` | `https://*.rooiam.com` |
| `*_COOKIE_SECURE` | `false` | `true` |
| `ROOIAM_DEPLOY_TARGET` | `local` | `public` |
| Allowed Origins | localhost origins | real domain origins |
| Trusted Proxy | empty | configured CIDRs |
| SMTP Security | `none` | `starttls` |

---

## Environment Variables Reference

### Infrastructure (Shared)

| Variable | Description |
|----------|-------------|
| `POSTGRES_DB` | PostgreSQL database name |
| `POSTGRES_USER` | PostgreSQL username |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `MINIO_ROOT_USER` | MinIO root user |
| `MINIO_ROOT_PASSWORD` | MinIO root password |

### Production Mode URLs

| Variable | Local Example | Public Example |
|----------|---------------|----------------|
| `SERVER_PUBLIC_URL` | `http://localhost:5170` | `https://api.rooiam.com` |
| `LOGIN_PUBLIC_URL` | `http://localhost:5172` | `https://app.rooiam.com` |
| `ADMIN_PUBLIC_URL` | `http://localhost:5171` | `https://admin.rooiam.com` |
| `LANDING_PUBLIC_URL` | `http://localhost:5173` | `https://rooiam.com` |
| `DOCS_PUBLIC_URL` | `http://localhost:5175` | `https://docs.rooiam.com` |

### Demo Mode URLs

| Variable | Local Example | Public Example |
|----------|---------------|----------------|
| `DEMO_SERVER_PUBLIC_URL` | `http://localhost:5180` | `https://demo-api.rooiam.com` |
| `DEMO_APP_PUBLIC_URL` | `http://localhost:5184` | `https://candycloud.rooiam.com` |
| `DEMO_ADMIN_PUBLIC_URL` | `http://localhost:5181` | `https://demo-admin.rooiam.com` |
| `DEMO_PORTAL_PUBLIC_URL` | `http://localhost:5182` | `https://demo-app.rooiam.com` |

`DEMO_PORTAL_PUBLIC_URL` is the Rooiam tenant portal (`rooiam-app`) and maps to `ROOIAM_APP_URL`.
`DEMO_APP_PUBLIC_URL` is the downstream customer/end-user demo app (`candycloud-web`) and maps to `ROOIAM_ENDUSER_URL`.

### Allowed Origins

| Env File | Example Value |
|----------|---------------|
| `ROOIAM_ALLOWED_ORIGINS` (prod) | `http://localhost:5170,...` or `https://api.rooiam.com,...` |
| `DEMO_ALLOWED_ORIGINS` (demo) | `http://localhost:5180,...` or `https://demo.rooiam.com,...` |

### Cookie Security

| Env File | Local | Public |
|----------|-------|--------|
| `ROOIAM_COOKIE_SECURE` (prod) | `false` | `true` |
| `DEMO_COOKIE_SECURE` (demo) | `false` | `true` |

### Database & Redis

| Mode | Variable | Example |
|------|----------|---------|
| Production | `ROOIAM_DATABASE_URL` | `postgres://rooiam:pass@postgres:5432/rooiam` |
| Production | `ROOIAM_REDIS_URL` | `redis://redis:6379` |
| Demo | `DEMO_DATABASE_URL` | `postgres://rooiam:pass@postgres:5432/rooiam_demo` |
| Demo | `DEMO_REDIS_URL` | `redis://redis:6379` |

### SMTP

| Mode | Variable | Local Example | Public Example |
|------|----------|---------------|----------------|
| Production | `ROOIAM_SMTP_HOST` | `mailhog` | `smtp.example.com` |
| Production | `ROOIAM_SMTP_PORT` | `1025` | `587` |
| Production | `ROOIAM_SMTP_SECURITY` | `none` | `starttls` |
| Demo | `ROOIAM_DEMO_SMTP_HOST` | `mailhog` | `mailhog` |
| Demo | `ROOIAM_DEMO_SMTP_PORT` | `1025` | `1025` |
| Demo | `ROOIAM_DEMO_MAILBOX_URL` | `http://localhost:8025` | `https://mailhog-demo.internal` |

### OAuth (Production Only)

| Variable | Description |
|----------|-------------|
| `ROOIAM_GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `ROOIAM_GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `ROOIAM_MICROSOFT_CLIENT_ID` | Microsoft OAuth client ID |
| `ROOIAM_MICROSOFT_CLIENT_SECRET` | Microsoft OAuth client secret |
| `ROOIAM_MICROSOFT_TENANT_ID` | Microsoft tenant ID (or `common`) |

### Security

| Variable | Local | Public |
|----------|-------|--------|
| `ROOIAM_TRUSTED_PROXY_CIDRS` | (empty) | `127.0.0.1/32,172.16.0.0/12,10.0.0.0/8` |

### Demo URLs (linking from prod to demo)

| Variable | Local Example | Public Example |
|----------|---------------|----------------|
| `DEMO_APP_PUBLIC_URL` | `http://localhost:5184` | `https://candycloud.rooiam.com` |
| `DEMO_PORTAL_PUBLIC_URL` | `http://localhost:5182` | `https://demo-app.rooiam.com` |
| `DEMO_ADMIN_PUBLIC_URL` | `http://localhost:5181` | `https://demo-admin.rooiam.com` |

---

## Docker Compose Services

### Production Stack (`docker-compose.yml`)

| Service | Port | Description |
|---------|------|-------------|
| `postgres` | 5432 | PostgreSQL database |
| `redis` | 6379 | Redis cache |
| `minio` | 9000 | MinIO object storage |
| `mailhog` | 8025 | SMTP capture (local dev) |
| `server` | 5170 | Rooiam backend |
| `admin` | 5171 | Admin dashboard |
| `app` | 5172 | Rooiam tenant portal (`rooiam-app`) |
| `landing` | 5173 | Landing page |
| `docs` | 5175 | Documentation |
| `book` | 5176 | Book documentation |

### Demo Stack (`docker-compose.demo.yml`)

| Service | Port | Description |
|---------|------|-------------|
| `postgres` | 5432 | PostgreSQL database (demo) |
| `redis` | 6379 | Redis cache (demo) |
| `minio` | 9000 | MinIO object storage |
| `mailhog` | 8025 | SMTP capture |
| `demo-server` | 5180 | Rooiam backend (demo mode) |
| `demo-admin` | 5181 | Admin dashboard (demo) |
| `demo-app` | 5182 | Rooiam tenant portal (`rooiam-app`, demo) |
| `demo` | 5184 | Downstream customer/end-user demo app (`candycloud-web`) |

---

## Docker Image Building

### Build Single Image for All Modes

Rooiam uses **one Docker image** for all modes. The mode is determined at runtime via environment variables.

```bash
# Build the server image
docker build -t ghcr.io/theparitt/rooiam-server:latest -f Dockerfile.server.prod .

# Login and push
echo $GITHUB_TOKEN | docker login ghcr.io -u theparitt --password-stdin
docker push ghcr.io/theparitt/rooiam-server:latest
```

### Local Build Without Push

```bash
docker build -t rooiam-server:local -f Dockerfile.server.prod .
```

---

## Security Checklist Before Production

- [ ] `ROOIAM_COOKIE_SECURE=true`
- [ ] `ROOIAM_TRUSTED_PROXY_CIDRS` configured for your network
- [ ] Strong passwords for PostgreSQL and MinIO
- [ ] `ROOIAM_SETUP_TOKEN` changed from default
- [ ] Real OAuth credentials configured (Google, Microsoft)
- [ ] Real SMTP configured with valid credentials
- [ ] Allowed origins match actual deployment domains

---

## Troubleshooting

### Database Migration

The Docker entrypoint automatically runs migrations on startup.

```bash
docker compose exec server sqlx migrate run --database-url "$ROOIAM_DATABASE_URL"
```

### Reseed Demo Data

To reseed demo data after code/config updates:

```bash
docker compose -f docker-compose.demo.yml exec postgres psql -U rooiam -d rooiam_demo -c "DELETE FROM oauth_client_redirect_uris WHERE oauth_client_id IN (SELECT id FROM oauth_clients WHERE client_id LIKE 'demo-%');"
docker compose -f docker-compose.demo.yml restart demo-server
```

### Verify Mode

```bash
docker compose logs -f server 2>&1 | grep "MODE"
docker compose -f docker-compose.demo.yml logs -f demo-server 2>&1 | grep "MODE"
```

Expected output:
- Production: `PRODUCTION MODE - No demo seed, no demo routes. Production-ready.`
- Demo: `DEMO MODE - Demo seed active. Demo-login endpoint enabled.`
