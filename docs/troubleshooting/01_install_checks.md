# Install Checks

Use this page when you are not sure whether your machine is ready to run Rooiam.

## 1. Check Core Tools

Run:

```bash
psql --version
redis-server --version
cargo --version
node --version
npm --version
docker --version
docker compose version
```

Expected result:

- every command prints a version
- no command prints `command not found`

## 2. Check Local Ports

Run:

```bash
ss -ltnp | rg '5170|5171|5172|5173|5175|5176|5184|5185|8025|1025|5432|6379'
```

Use this to see whether a port is already busy.

## 3. Check PostgreSQL

Run:

```bash
psql "$ROOIAM_DATABASE_URL" -c 'select 1;'
```

Expected result:

- PostgreSQL returns one row

If `$ROOIAM_DATABASE_URL` is empty, first load your env:

```bash
set -a
source rooiam-server/.env
set +a
```

## 4. Check Redis

Run:

```bash
redis-cli -u "${ROOIAM_REDIS_URL:-redis://127.0.0.1:6379}" ping
```

Expected result:

- `PONG`

## 5. Check Mailhog

Run:

```bash
curl -I http://localhost:8025
```

Expected result:

- HTTP response headers

## 6. Check The API Server

Run:

```bash
curl http://localhost:5170/health
```

Expected result:

```json
{"status":"ok","version":"v1"}
```
