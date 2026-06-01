# Run the Demo Locally

Use this guide if you want to see Rooiam demo mode working as fast as possible on your own machine.

You will end up with:

- Demo API on `5180`
- Demo admin on `5181`
- Demo portal on `5182`
- Demo downstream app on `5184`
- Mailhog inbox on `8025`
- MinIO console on `9001`

## 1. Install What You Need

Install Docker Desktop or Docker Engine with `docker compose`:

```bash
docker --version
docker compose version
```

## 2. Download The Repo

```bash
git clone https://github.com/theparitt/rooiam
cd rooiam
```

## 3. Start The Demo Stack

```bash
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo up -d --build
```

This starts only the demo stack with:
- Demo API server with seeded demo tenants
- Demo admin, portal, and downstream app
- PostgreSQL, Redis, Mailhog, MinIO (demo instances)

## 4. Open The Apps

| URL | Purpose |
|-----|---------|
| `http://localhost:5181` | Admin (demo) |
| `http://localhost:5182` | Portal / login (demo) |
| `http://localhost:5184` | Demo downstream app |
| `http://localhost:8025` | Mailhog inbox |
| `http://localhost:9001` | MinIO console (user: `rooiam`, pass: `rooiam_secret`) |

## 5. Use The Demo Accounts

> [!WARNING]
> **Do not use the same browser session for both demo admin and demo portal at the same time.**
> Their cookies can conflict.
>
> Use one of these:
> - log out before switching
> - another browser
> - a private / incognito window

| Role | Email | Password | Best for... |
|------|-------|----------|-------------|
| Platform Admin | `admin@rooiam.demo` | magic link / demo OAuth | System-wide settings |
| Tenant Admin | `rooroo@sweetfactory.demo` | magic link / demo OAuth | Workspace branding & API keys in `rooiam-app` |
| End User | `minmin@lovechocolate.user` | magic link / demo OAuth | Testing CandyCloud login and callback flow |

For the full list of demo accounts, see [Demo Accounts Reference](./02_demo_accounts_reference.md).

## 6. Test Magic Link Login

1. Open `http://localhost:5184/?org=roochoco`
2. Enter `minmin@lovechocolate.user`
3. Click `Send Magic Link`
4. Open Mailhog at `http://localhost:8025`
5. Click the login link in the email

Expected result:
- Browser returns to demo app
- User is signed in

## 7. Verify Demo API Is Up

```bash
curl http://localhost:5180/health
```

Expected result:

```json
{"status":"ok","version":"v1"}
```

## 8. Stopping

```bash
docker compose -f docker-compose.demo.yml down
```

To wipe volumes and start fresh:

```bash
docker compose -f docker-compose.demo.yml down -v
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo up -d --build
```

## 9. If Something Does Not Work

Check these first:

- `docker compose -f docker-compose.demo.yml ps` - are all services running?
- `docker compose -f docker-compose.demo.yml logs demo-server` - any errors?
- Did you use the correct `--env-file .env.docker.local.demo`?

Next steps:
- [Troubleshooting](../troubleshooting/00_index.md)
- [Environment Configuration](../reference/05_environment_configuration.md)
