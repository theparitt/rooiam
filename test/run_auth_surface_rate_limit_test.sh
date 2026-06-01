#!/bin/bash
#
# Verifies that auth-surface abuse is rate-limited, including the hosted login UI.
#
# Usage:
#   BASE_URL=http://localhost:5178 bash run_auth_surface_rate_limit_test.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5178}"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} $1"; }
fail() { echo -e "${RED}FAIL${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}INFO${NC} $1"; }

info "Checking rate-limit test server health..."
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
[ "$HEALTH" = "200" ] || fail "Server not reachable on $BASE_URL (health returned $HEALTH)"

count_statuses() {
  local method="$1"
  local url="$2"
  local body="${3:-}"
  local extra_header="${4:-}"
  local attempts="${5:-3}"
  local codes=()
  for _ in $(seq 1 "$attempts"); do
    if [ -n "$body" ]; then
      if [ -n "$extra_header" ]; then
        code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" -H "Content-Type: application/json" -H "$extra_header" -d "$body")
      else
        code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" -H "Content-Type: application/json" -d "$body")
      fi
    else
      if [ -n "$extra_header" ]; then
        code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url" -H "$extra_header")
      else
        code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "$url")
      fi
    fi
    codes+=("$code")
  done
  printf '%s\n' "${codes[@]}"
}

info "Testing hosted login UI rate limit..."
UI_CODES=$(count_statuses GET "$BASE_URL/login" "" "" 6)
echo "$UI_CODES" | grep -q '^429$' || fail "Expected /login to return 429 after repeated requests"
pass "Hosted login UI is rate-limited"

info "Testing magic-link start rate limit..."
MAGIC_CODES=$(count_statuses POST "$BASE_URL/v1/auth/magic-link/start" '{"email":"rate-limit@demo.test","redirect_uri":"http://localhost:5172/auth/callback"}')
echo "$MAGIC_CODES" | grep -q '^429$' || fail "Expected /v1/auth/magic-link/start to return 429 after repeated requests"
pass "Magic-link start is rate-limited"

info "Testing OAuth login start rate limit..."
OAUTH_CODES=$(count_statuses GET "$BASE_URL/v1/oauth/login?provider=google&redirect_uri=http%3A%2F%2Flocalhost%3A5172%2Fauth%2Fcallback" "" "" 21)
echo "$OAUTH_CODES" | grep -q '^429$' || fail "Expected /v1/oauth/login to return 429 after repeated requests"
pass "OAuth login start is rate-limited"

info "Testing hosted widget page rate limit..."
WIDGET_CODES=$(count_statuses GET "$BASE_URL/login-widget?preview=1" "" "Referer: http://localhost:5172/portal/preview" 6)
echo "$WIDGET_CODES" | grep -q '^429$' || fail "Expected /login-widget to return 429 after repeated requests"
pass "Hosted widget page is rate-limited"

echo -e "${GREEN}Auth surface rate-limit test passed.${NC}"
