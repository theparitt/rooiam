#!/bin/bash

set -euo pipefail

BASE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$BASE_DIR/.env"

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

usage() {
  cat <<'EOF'
Usage:
  bash rooiam-server/scripts/cleanup_stale_media_urls.sh --old-base <url-or-path> [options]

Options:
  --old-base <value>   Required. Prefix to match, e.g. http://192.168.0.147:9000/rooiam
  --new-base <value>   Rewrite matched URLs to this new prefix instead of clearing them
  --dry-run            Show matching row counts only; do not modify data
  --yes                Skip the confirmation prompt
  --help               Show this help

Behavior:
  - Without --new-base, matching URLs are cleared to NULL.
  - With --new-base, matching URLs are rewritten by replacing the prefix only.
  - The script checks these columns:
      users.avatar_url
      organizations.icon_url
      organizations.login_logo_url
      organizations.logo_url   (only if the legacy column still exists)

Examples:
  bash rooiam-server/scripts/cleanup_stale_media_urls.sh \
    --old-base http://192.168.0.147:9000/rooiam \
    --dry-run

  bash rooiam-server/scripts/cleanup_stale_media_urls.sh \
    --old-base http://192.168.0.147:9000/rooiam \
    --yes

  bash rooiam-server/scripts/cleanup_stale_media_urls.sh \
    --old-base http://192.168.0.147:9000/rooiam \
    --new-base /media \
    --yes
EOF
}

OLD_BASE=""
NEW_BASE=""
DRY_RUN=0
ASSUME_YES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --old-base)
      OLD_BASE="${2:-}"
      shift 2
      ;;
    --new-base)
      NEW_BASE="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --yes)
      ASSUME_YES=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      echo ""
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$OLD_BASE" ]]; then
  echo "--old-base is required."
  echo ""
  usage
  exit 1
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

OLD_BASE="${OLD_BASE%/}"
NEW_BASE="${NEW_BASE%/}"
OLD_LIKE="${OLD_BASE}/%"

TARGETS=(
  "users.avatar_url"
  "organizations.icon_url"
  "organizations.login_logo_url"
)

HAS_LEGACY_LOGO_URL="$(
  psql "$ROOIAM_DATABASE_URL" -Atqc "
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'organizations'
        and column_name = 'logo_url'
    );
  "
)"

if [[ "$HAS_LEGACY_LOGO_URL" == "t" ]]; then
  TARGETS+=("organizations.logo_url")
fi

count_sql_file="$(mktemp)"
update_sql_file="$(mktemp)"
trap 'rm -f "$count_sql_file" "$update_sql_file"' EXIT

{
  first=1
  for target in "${TARGETS[@]}"; do
    table_name="${target%.*}"
    column_name="${target#*.}"
    if [[ $first -eq 0 ]]; then
      printf 'UNION ALL\n'
    fi
    printf "SELECT '%s' AS target, count(*)::bigint AS rows\n" "$target"
    printf "FROM %s\n" "$table_name"
    printf "WHERE %s LIKE :'old_like'\n" "$column_name"
    first=0
  done
  printf 'ORDER BY target;\n'
} > "$count_sql_file"

echo "Scanning for stale media URLs with prefix:"
echo "  $OLD_BASE"
echo ""
psql "$ROOIAM_DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -v old_like="$OLD_LIKE" \
  -f "$count_sql_file"

TOTAL_MATCHES="$(
  psql "$ROOIAM_DATABASE_URL" -Atq \
    -v old_like="$OLD_LIKE" \
    -f "$count_sql_file" \
  | awk -F'|' '{sum += $2} END {print sum + 0}'
)"

echo ""
echo "Total matching rows: $TOTAL_MATCHES"

if [[ "$TOTAL_MATCHES" == "0" ]]; then
  echo "Nothing to change."
  exit 0
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "Dry run only. No rows were modified."
  exit 0
fi

if [[ -n "$NEW_BASE" ]]; then
  ACTION_SUMMARY="rewrite matching URLs to '$NEW_BASE'"
else
  ACTION_SUMMARY="clear matching URLs to NULL"
fi

echo ""
echo "This will $ACTION_SUMMARY in:"
echo "  $ROOIAM_DATABASE_URL"

if [[ "$ASSUME_YES" -ne 1 ]]; then
  echo ""
  printf "Type rooiam to confirm: "
  read -r confirmation
  if [[ "$confirmation" != "rooiam" ]]; then
    echo "Confirmation failed. Nothing was changed."
    exit 1
  fi
fi

{
  printf "BEGIN;\n"
  for target in "${TARGETS[@]}"; do
    table_name="${target%.*}"
    column_name="${target#*.}"
    if [[ -n "$NEW_BASE" ]]; then
      printf "UPDATE %s\n" "$table_name"
      printf "SET %s = :'new_base' || substr(%s, length(:'old_base') + 1)\n" "$column_name" "$column_name"
      printf "WHERE %s LIKE :'old_like';\n" "$column_name"
    else
      printf "UPDATE %s\n" "$table_name"
      printf "SET %s = NULL\n" "$column_name"
      printf "WHERE %s LIKE :'old_like';\n" "$column_name"
    fi
  done
  printf "COMMIT;\n"
} > "$update_sql_file"

psql "$ROOIAM_DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -v old_base="$OLD_BASE" \
  -v old_like="$OLD_LIKE" \
  -v new_base="$NEW_BASE" \
  -f "$update_sql_file"

echo ""
echo "Post-update scan:"
psql "$ROOIAM_DATABASE_URL" \
  -v ON_ERROR_STOP=1 \
  -v old_like="$OLD_LIKE" \
  -f "$count_sql_file"

echo ""
echo "Stale media URL cleanup complete."
