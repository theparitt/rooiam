# Run the Demo Locally

Follow the [Docker Quickstart](./05_quickstart_with_docker.md) to create the untracked demo env file, start the API and infrastructure, then start the admin and portal separately.

With that guide's configuration:

| Port | Service |
|---|---|
| 5180 | Demo API |
| 5181 | Admin dev server |
| 5182 | Tenant portal dev server |
| 8026 | Mailhog inbox |
| 19001 | MinIO console |

CandyCloud is optional and runs separately on frontend port `5184` and backend port `5185`; see [Local Setup](../development/01_local_setup.md).

## Try sign-in

1. Open `http://localhost:5181` and use `admin@rooiam.demo` for platform administration.
2. Open `http://localhost:5182` in another browser profile and use `rooroo@sweetfactory.demo` for tenant administration.
3. Retrieve magic links from `http://localhost:8026`.
4. If CandyCloud is configured, try `minmin@lovechocolate.user` in its RooChoco workspace.

Use separate browser profiles for simultaneous operator and tenant sessions because localhost cookies are shared across ports. See [Demo Accounts Reference](./02_demo_accounts_reference.md) for the full account list.

## Check and stop

```bash
curl http://localhost:5180/health
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo ps
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo logs --tail 50 demo-server
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo down
```

Healthy responses include `status: "ok"`, `mode: "demo"`, and successful database/Redis checks. The version is the Cargo package version, not `v1` (the API path version).

For startup failures, see [Troubleshooting](../troubleshooting/00_index.md).
