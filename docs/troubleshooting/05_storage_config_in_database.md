# Storage Configuration Stuck In Database

## The Problem

Rooiam stores storage configuration (backend, MinIO endpoint, bucket, credentials) in the
`system_settings` table. When you change `ROOIAM_MINIO_ENDPOINT` or other storage env vars,
the server reads the **database value first** — the env var is only a fallback.

This means:

- you set up locally with `localhost:9000`
- you deploy to a server and set `ROOIAM_MINIO_ENDPOINT=http://minio:9000`
- the server still connects to `localhost:9000` because that value is in the database

The startup log will show the old value, not what is in your env file:

```
[ FAIL ]  MinIO        http://localhost:9000/rooiam
          Cannot reach MinIO at 'http://localhost:9000': error sending request...
```

## Why It Works This Way

Storage config is intentionally DB-first so that operators can change it through the
admin setup wizard without restarting the server. The env vars serve as bootstrap
defaults for a fresh database that has no stored config yet.

The logic (simplified):

1. Read from `system_settings` table
2. If DB row is empty → fall back to env var
3. If DB row exists → use DB value, ignore env var

## How To Fix It

Clear the stale storage rows from the database. The server will then fall back to the
env vars on next startup.

Connect to your PostgreSQL database and run:

```sql
DELETE FROM system_settings WHERE key IN (
  'storage_backend',
  'storage_minio_endpoint',
  'storage_minio_bucket',
  'storage_minio_access_key',
  'storage_minio_secret_key',
  'storage_minio_use_ssl',
  'storage_local_path'
);
```

Then restart the server. The startup log should now show the value from your env file.

### Docker example

If your database is running in Docker Compose:

```bash
docker compose --env-file .env.docker.public.prod exec postgres \
  psql -U rooiam -d rooiam -c "
    DELETE FROM system_settings WHERE key IN (
      'storage_backend',
      'storage_minio_endpoint',
      'storage_minio_bucket',
      'storage_minio_access_key',
      'storage_minio_secret_key',
      'storage_minio_use_ssl',
      'storage_local_path'
    );
  "
```

Then restart the server container:

```bash
docker compose --env-file .env.docker.public.prod up -d --force-recreate server
```

### Direct psql example

```bash
psql "$ROOIAM_DATABASE_URL" -c "
  DELETE FROM system_settings WHERE key IN (
    'storage_backend',
    'storage_minio_endpoint',
    'storage_minio_bucket',
    'storage_minio_access_key',
    'storage_minio_secret_key',
    'storage_minio_use_ssl',
    'storage_local_path'
  );
"
```

## After Clearing

The server treats an empty `system_settings` storage section as "not configured yet"
and falls back to env vars. You can then configure storage permanently through the
admin setup wizard, which writes back to the database.

## When Does This Happen

| Scenario | Result |
|---|---|
| Fresh database, MinIO env vars set | env vars used — correct |
| Setup wizard completed, MinIO saved | DB values used — correct |
| Migrated from local dev to production | DB has `localhost:9000` — **wrong** |
| Changed MinIO endpoint but did not clear DB | old endpoint still used — **wrong** |
| Restored a database dump from another environment | old endpoints from dump are used — **wrong** |

## Other Config That Behaves The Same Way

The same DB-first pattern applies to:

- SMTP settings (`storage_smtp_*` keys — managed via setup wizard)
- Google / Microsoft OAuth (`google_client_id`, `microsoft_client_id`, etc.)

If you are seeing the wrong SMTP host or OAuth client ID despite correct env vars, the
same fix applies — clear the relevant keys from `system_settings` or update them through
the setup wizard.

To inspect what is currently stored:

```sql
SELECT key, value FROM system_settings ORDER BY key;
```
