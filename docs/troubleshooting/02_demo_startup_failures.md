# Demo Startup Failures

Use the [Docker Quickstart](../getting-started/05_quickstart_with_docker.md) as the baseline. It creates an untracked env file and runs frontends separately.

## Inspect the stack

```bash
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo ps
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo logs --tail 100 demo-server
curl http://localhost:5180/health
```

A healthy response has `status: "ok"`, `mode: "demo"`, and successful dependency checks. The quickstart exposes Mailhog on `8026` and MinIO console on `19001`; ports come from the env file, not fixed demo defaults.

## Missing env file or required variable

Deployment env files are not committed. Copy the complete block from the quickstart into `.env.docker.local.demo`. Demo Compose inputs use `ROOIAM_DEMO_*` names and map them to the server's runtime names. A source-run server env file is not interchangeable with these Compose inputs.

## Demo data missing

Check that the running instance reports demo mode and uses a database name ending in `rooiam_demo`. For source runs, pass the intended file explicitly:

```bash
cd rooiam-server
SQLX_OFFLINE=true cargo run -- --env-file .env.local.demo
```

Generate that server env file with `cargo run -- setup` first. `ROOIAM_MODE` determines seeding; toggling a legacy seed flag does not select demo mode.

## Frontend not reachable

Compose does not start admin, portal, docs, book, or CandyCloud. Start the appropriate dev server separately after installing dependencies. Admin and portal use `dev:demo-local` and `VITE_API_URL=http://localhost:5180/v1` for this demo.

The `start_rooiam.sh` helper starts production admin/portal, landing, and CandyCloud web. It does not start demo admin/portal or backend services.

## Dependency connection refused

Verify host and container addresses separately. A process running on the host uses published host ports; a process in Compose uses service names such as `postgres`, `redis`, and `mailhog`. Do not rely on automatic container discovery to select the right instance.

## Deliberately reset a disposable demo

The following removes this Compose project's PostgreSQL, Redis, MinIO, and server-data volumes. Use it only when all of that demo data can be discarded:

```bash
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo down -v
docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo up -d
```

To stop without deleting data, omit `-v`. Do not guess volume names or remove a production volume to fix a demo startup issue.
