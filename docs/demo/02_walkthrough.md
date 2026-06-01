# Demo Walkthrough

This walkthrough is the shortest path to validate the current Rooiam feature surface.

## 1. Start The Docker Stack

```bash
cd /home/theparitt/work/rooiam
docker compose up --build -d
```

This starts:

- production-style surfaces
- demo surfaces with seeded data
- Postgres
- Redis
- MinIO
- Mailhog

Mailhog (your local fake inbox):

- UI: `http://localhost:8025` *(Open this to see your magic login links!)*
- SMTP: `127.0.0.1:1025`

MinIO console:

- `http://localhost:9001`

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
- magic link arrives in your Mailhog inbox (`http://localhost:8025`)
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
