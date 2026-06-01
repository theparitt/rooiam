#!/bin/bash

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$BASE_DIR/rooiam-server"
ENV_FILE="$SERVER_DIR/.env"

if [[ -f "$HOME/.cargo/env" ]]; then
  # shellcheck disable=SC1090
  source "$HOME/.cargo/env"
fi

if [[ -f "$ENV_FILE" ]]; then
  SANITIZED_ENV_FILE="$(mktemp)"
  tr -d '\r' < "$ENV_FILE" > "$SANITIZED_ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$SANITIZED_ENV_FILE"
  set +a
  rm -f "$SANITIZED_ENV_FILE"
fi

if [[ -z "${ROOIAM_DATABASE_URL:-}" ]]; then
  echo "ROOIAM_DATABASE_URL is not set."
  echo "Load it from rooiam-server/.env or export it before running this script."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but was not found in PATH."
  exit 1
fi

if ! command -v sqlx >/dev/null 2>&1; then
  echo "sqlx CLI is required but was not found in PATH."
  echo "Install it with: cargo install sqlx-cli --no-default-features --features rustls,postgres"
  exit 1
fi

echo "This will destroy ALL Rooiam data in: $ROOIAM_DATABASE_URL"
echo "The schema will be dropped and migrations rerun. .env is not touched."
echo ""
printf "Type rooiam to confirm deletion: "
read -r confirmation

if [[ "$confirmation" != "rooiam" ]]; then
  echo "Confirmation failed. Nothing was deleted."
  exit 1
fi

echo ""
echo "Resetting database schema..."
psql "$ROOIAM_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO CURRENT_USER;
GRANT ALL ON SCHEMA public TO public;
SQL
if [[ $? -ne 0 ]]; then
  echo "Database reset failed."
  exit 1
fi

echo "Re-running migrations..."
cd "$SERVER_DIR" || exit 1
sqlx migrate run --database-url "$ROOIAM_DATABASE_URL"
if [[ $? -ne 0 ]]; then
  echo "Migration run failed."
  exit 1
fi

echo ""
echo "Rooiam database reset complete."
echo "Your .env file was left unchanged."
