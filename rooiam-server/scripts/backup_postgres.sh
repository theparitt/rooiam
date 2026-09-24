#!/usr/bin/env bash
# Create one private, restorable PostgreSQL archive. Use PGHOST/PGPORT/PGUSER/
# PGDATABASE and a protected .pgpass file rather than putting a password in argv.
set -euo pipefail

if [[ $# -ne 1 || -z ${PGDATABASE:-} || -z ${PGUSER:-} ]]; then
  printf 'Usage: PGDATABASE=... PGUSER=... [PGHOST=...] %s BACKUP_DIRECTORY\n' "$0" >&2
  exit 2
fi

dump_bin=${PG_DUMP_BIN:-pg_dump}
restore_bin=${PG_RESTORE_BIN:-pg_restore}
command -v "$dump_bin" >/dev/null
command -v "$restore_bin" >/dev/null
command -v sha256sum >/dev/null

umask 077
backup_dir=$1
if [[ -L $backup_dir ]]; then
  printf 'Backup directory must not be a symbolic link.\n' >&2
  exit 2
fi
mkdir -p -- "$backup_dir"
chmod 700 -- "$backup_dir"
backup_dir=$(cd -- "$backup_dir" && pwd -P)

temporary=$(mktemp "$backup_dir/.rooiam-backup-XXXXXXXX.dump")
cleanup() { rm -f -- "$temporary"; }
trap cleanup EXIT

"$dump_bin" --format=custom --file="$temporary"
test -s "$temporary"
"$restore_bin" --list "$temporary" >/dev/null

stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup="$backup_dir/rooiam-$stamp-${temporary##*-}"
digest=$(sha256sum -- "$temporary")
digest=${digest%% *}
mv -- "$temporary" "$backup"
printf '%s\n' "$digest" > "$backup.sha256"
trap - EXIT
printf 'Backup: %s\nSHA-256: %s\n' "$backup" "$digest"
