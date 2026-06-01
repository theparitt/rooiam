#!/usr/bin/env bash
# reset_db.sh — Drop and recreate the rooiam database, then re-run all migrations.
# USE WITH CAUTION: destroys all data.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

# Load .env (strip \r for Windows compatibility)
if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source <(sed 's/\r//' "$ENV_FILE")
    set +a
else
    echo "ERROR: .env not found at $ENV_FILE"
    exit 1
fi

DB_URL="${ROOIAM_DATABASE_URL:?ROOIAM_DATABASE_URL is not set}"

# Parse DB name, host, port, user, password from the URL
# postgres://user:pass@host:port/dbname
DB_NAME=$(echo "$DB_URL" | sed 's|.*\/||' | sed 's|?.*||' | tr -d '\r')
DB_HOST=$(echo "$DB_URL" | sed 's|.*@||' | sed 's|:.*||' | sed 's|/.*||' | tr -d '\r')
DB_PORT=$(echo "$DB_URL" | sed 's|.*@[^:]*:||' | sed 's|/.*||' | tr -d '\r')
DB_USER=$(echo "$DB_URL" | sed 's|postgres://||' | sed 's|:.*||' | tr -d '\r')
DB_PASS=$(echo "$DB_URL" | sed 's|.*://[^:]*:||' | sed 's|@.*||' | tr -d '\r')

echo ""
echo "  ┌─────────────────────────────────────┐"
echo "  │         ROOIAM DATABASE RESET        │"
echo "  └─────────────────────────────────────┘"
echo ""
echo "  Host : $DB_HOST:$DB_PORT"
echo "  DB   : $DB_NAME"
echo "  User : $DB_USER"
echo ""
echo "  ⚠️  WARNING: This will permanently delete ALL data."
echo "  This cannot be undone."
echo ""
read -r -p "  Type the word 'rooiam' to confirm: " CONFIRM

if [[ "$CONFIRM" != "rooiam" ]]; then
    echo ""
    echo "  Aborted. Nothing was changed."
    echo ""
    exit 0
fi

echo ""
echo "  → Terminating active connections..."
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
    -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" \
    -c "CREATE DATABASE \"$DB_NAME\";" \
    -q 2>&1 | grep -v "^$" || true

echo "  → Running migrations..."
cd "$SCRIPT_DIR/.."
DATABASE_URL="$DB_URL" sqlx migrate run 2>&1 | sed 's/^/  /'

echo ""
echo "  ✓ Done. Database '$DB_NAME' is clean and migrated."
echo ""
echo "  Next: restart the server and go to http://localhost:5171"
echo ""
