# Demo Walkthrough

This walkthrough is the shortest path to validate the current Rooiam feature surface.

## 1. Start The Docker Stack

```bash
cd rooiam
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo up -d
```

Create the env file and start the frontends separately as described in the [Docker Quickstart](../getting-started/05_quickstart_with_docker.md). Compose starts only the seeded demo API and its infrastructure.

Mailhog (your local fake inbox):

- UI: `http://localhost:8026` *(Open this to see your magic login links!)*
- SMTP: `127.0.0.1:1026`

MinIO console:

- `http://localhost:19001`

## 2. Validate Platform Admin

Open:

- `http://localhost:5181`

Use:

- `admin@rooiam.demo`

Validate:

- setup/settings pages load
- users/orgs/audit pages are reachable

## 3. Validate Tenant Login

Open:

- `http://localhost:5182/?org=roochoco`

Use:

- `rooroo@sweetfactory.demo`

Validate:

- tenant branding appears
- magic link arrives in your Mailhog inbox (`http://localhost:8026`)
- tenant portal loads after clicking the link and signing in

## 4. Validate Client Demo

Open:

- `http://localhost:5184/?org=roochoco`

Use:

- `minmin@lovechocolate.user`

Validate:

- customer-facing login flow works
- callback returns to `candycloud-web`
- dashboard shows workspace context

## 5. Validate MintMallow MFA Path

Open:

- `http://localhost:5184/?org=mintmallow`

Use:

- `lulu@softmallow.user`

Validate:

- workspace policy requires MFA
- enrollment or MFA challenge appears as expected
