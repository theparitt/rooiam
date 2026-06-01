# Demo Startup Failures

Use this page if the demo setup does not come up cleanly.

## Problem: Mailhog UI does not open

Run:

```bash
docker compose up -d
docker ps | rg mailhog
```

Then open:

- `http://localhost:8025`

## Problem: Server does not show `DEMO MODE ENABLED`

Check:

```bash
rg '^ROOIAM_MODE=' rooiam-server/.env
```

Expected result:

```text
ROOIAM_MODE=demo
```

Then restart the server.

## Problem: `curl http://localhost:5170/health` fails

Run:

```bash
cd rooiam-server
SQLX_OFFLINE=true cargo run
```

Then in another terminal:

```bash
curl http://localhost:5170/health
```

## Problem: `start_rooiam.sh` starts some apps but not all

Run each app by itself:

```bash
cd rooiam-admin && npm run dev
cd ../rooiam-app && npm run dev
cd ../rooiam-landing && npm run dev
cd ../candycloud-web && npm run dev
cd ../rooiam-docs && npm run dev
cd ..
```

This shows which specific app is failing.

## Problem: Demo accounts do not work

Check:

```bash
rg '^ROOIAM_MODE=' rooiam-server/.env
```

Then restart the server.

Demo accounts only exist when demo mode is enabled (`ROOIAM_MODE=demo`).

## Problem: I want to start the setup wizard from zero again

If you want to reset only the Rooiam database state and keep your env file:

```bash
bash reset_rooiam_db.sh
```

If you are using the default Docker stack and want to reset only Docker PostgreSQL:

```bash
docker compose down
docker volume rm rooiam_rooiam_postgres
docker compose up -d
```

If you want to wipe the full default Docker stack:

```bash
docker compose down -v
docker compose up -d
```

Warning:

- `docker compose down -v` removes all named Docker volumes for the default stack
- that includes PostgreSQL, Redis, MinIO, and Rooiam storage data

---

## Problem: Server fails to start — "could not start Docker container"

**Symptom:**
```
Error: failed to start containers: mailhog
[ FAIL ]  SMTP         127.0.0.1:1025 (Mailhog)
          Demo mode requires Mailhog, but TCP connect failed: Connection refused
```

or

```
Auto-start: could not start Docker container 'minio': ...
[ FAIL ]  MinIO        http://localhost:9000/rooiam
```

**Root Cause:**
The server's Docker auto-start logic looks for containers with **exact names** (`minio`, `mailhog`), but your containers have different names (e.g., `rooiam-minio-1`, `jotjum-mailhog`).

**Diagnosis:**
```bash
# List all containers
docker ps -a --format "{{.ID}} {{.Names}} {{.Status}} {{.Ports}}"
```

If you see containers like `rooiam-minio-1` or `jotjum-mailhog` but not `minio` or `mailhog`, this is your issue.

**Resolutions:**

### Option 1: Rename your containers

```bash
# For MinIO
docker stop rooiam-minio-1
docker rename rooiam-minio-1 minio
docker start minio

# For Mailhog
docker stop rooiam-mailhog-1
docker rename rooiam-mailhog-1 mailhog
docker start mailhog
```

### Option 2: Stop conflicting containers and let auto-start create new ones

```bash
# Stop and remove existing containers with different names
docker stop rooiam-minio-1 jotjum-minio jotjum-mailhog rooiam-mailhog-1
docker rm rooiam-minio-1 jotjum-minio jotjum-mailhog rooiam-mailhog-1

# Let the server auto-start fresh containers
cargo run
```

### Option 3: Fix port conflicts

If you see "Bind for 0.0.0.0:9001 failed: port is already allocated", another process is using that port:

```bash
# Find what's using the port
ss -tlnp | grep -E "9000|9001|8025|1025"

# Example output:
# LISTEN 0 4096 0.0.0.0:9001 0.0.0.0:* users:(("docker-proxy",pid=2492,fd=4))

# Stop the conflicting container
docker ps --format "{{.ID}} {{.Names}}" | xargs -I {} docker inspect {} --format '{{.Name}} {{range .HostConfig.PortBindings}}{{.HostPort}}{{end}}' 2>/dev/null | grep 9001
```

---

## Problem: Server fails to start — MinIO 403 Forbidden

**Symptom:**
```
[ FAIL ]  MinIO        http://localhost:9000/rooiam
          MinIO returned 403 Forbidden. Check access key and secret key.
```

**Diagnosis:**
```bash
# Check if MinIO is running
curl -I http://localhost:9000/minio/health/live

# Check MinIO credentials
docker exec <minio-container> env | grep MINIO
```

**Resolution:**
The server expects credentials `rooiam/rooiam_secret`. If your MinIO has different credentials:

```bash
# Option 1: Update MinIO credentials to match
docker stop minio
docker rm minio
docker run -d --name minio \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=rooiam \
  -e MINIO_ROOT_PASSWORD=rooiam_secret \
  minio/minio server /data --console-address ':9001'

# Option 2: Create the bucket with correct permissions
docker exec -it minio mc alias set local http://localhost:9000 rooiam rooiam_secret
docker exec -it minio mc mb local/rooiam
docker exec -it minio mc anonymous set public local/rooiam
```

---

## Problem: Server starts but Mailhog UI shows no emails

**Diagnosis:**
```bash
# Check Mailhog container
docker ps | grep mailhog

# Check Mailhog logs
docker logs mailhog
```

**Resolution:**
```bash
# Ensure Mailhog is running
docker start mailhog

# Check if it's accessible
curl -I http://localhost:8025

# If Mailhog exists but port 1025 is not exposed:
docker stop mailhog
docker rm mailhog
docker run -d --name mailhog -p 1025:1025 -p 8025:8025 mailhog/mailhog
```

---

## Quick Reference: Expected Container Names and Ports

| Service | Container Name | Ports | Default Credentials |
|---------|---------------|-------|-------------------|
| MinIO | `minio` | 9000, 9001 | `rooiam` / `rooiam_secret` |
| Mailhog | `mailhog` | 1025, 8025 | N/A (UI only) |
| PostgreSQL | (varies) | 5432 | From `ROOIAM_DATABASE_URL` |
| Redis | (varies) | 6379 | From `ROOIAM_REDIS_URL` |

If your containers have different names, the server's auto-start will fail. Either rename them or ensure the correct ports are available.
