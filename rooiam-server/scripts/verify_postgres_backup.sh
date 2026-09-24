#!/usr/bin/env bash
# Restore an archive in a disposable, network-isolated PostgreSQL container.
# No production database connection or restore destination is accepted here.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  printf 'Usage: %s BACKUP.dump\n' "$0" >&2
  exit 2
fi

backup=$1
if [[ ! -f $backup || -L $backup || ! -f $backup.sha256 || -L $backup.sha256 ]]; then
  printf 'A regular backup file and its .sha256 file are required.\n' >&2
  exit 2
fi

expected=$(cat -- "$backup.sha256")
if [[ ! $expected =~ ^[[:xdigit:]]{64}$ ]]; then
  printf 'Invalid checksum file.\n' >&2
  exit 2
fi
actual=$(sha256sum -- "$backup")
actual=${actual%% *}
if [[ $actual != "$expected" ]]; then
  printf 'Backup checksum mismatch.\n' >&2
  exit 1
fi

restore_bin=${PG_RESTORE_BIN:-pg_restore}
"$restore_bin" --list "$backup" >/dev/null
command -v docker >/dev/null

image=${POSTGRES_VERIFY_IMAGE:-postgres:18-alpine}
container="rooiam-restore-verify-$$-$RANDOM"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --detach --rm --network none --name "$container" \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  --env POSTGRES_DB=rooiam_restore_check \
  "$image" >/dev/null

ready=false
for _ in {1..60}; do
  # The official image first starts a temporary server for database creation,
  # shuts it down, then starts the final server. Do not race that handoff.
  if docker logs "$container" 2>&1 | grep -q 'PostgreSQL init process complete' \
    && docker exec "$container" pg_isready -U postgres -d rooiam_restore_check >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ $ready != true ]]; then
  printf 'Disposable PostgreSQL did not become ready.\n' >&2
  exit 1
fi

docker cp -- "$backup" "$container:/tmp/rooiam-backup.dump"
docker exec "$container" pg_restore --exit-on-error --no-owner --no-privileges \
  -U postgres -d rooiam_restore_check /tmp/rooiam-backup.dump

# Successful pg_restore covers every table/data item. These queries also
# reject a valid archive that is not a Rooiam database.
migrations=$(docker exec "$container" psql -X -q -t -A -U postgres \
  -d rooiam_restore_check -c 'SELECT COUNT(*) FROM _sqlx_migrations WHERE success')
users_table=$(docker exec "$container" psql -X -q -t -A -U postgres \
  -d rooiam_restore_check -c "SELECT to_regclass('public.users') IS NOT NULL")
if [[ ! $migrations =~ ^[1-9][0-9]*$ || $users_table != t ]]; then
  printf 'Restore completed, but the archive is not a migrated Rooiam database.\n' >&2
  exit 1
fi
printf 'Verified complete restore in isolated PostgreSQL (%s migrations).\n' "$migrations"
