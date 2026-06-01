#!/bin/bash
#
# Verifies session cookie flags on login and logout responses.
#
# Usage:
#   BASE_URL=http://localhost:5177 bash run_cookie_security_test.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5177}"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} $1"; }
fail() { echo -e "${RED}FAIL${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}INFO${NC} $1"; }

info "Checking cookie test server health..."
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
[ "$HEALTH" = "200" ] || fail "Server not reachable on $BASE_URL (health returned $HEALTH)"

LOGIN_HEADERS=$(mktemp)
COOKIE_JAR=$(mktemp)

info "Logging in through test-login to inspect the session cookie..."
LOGIN_CODE=$(curl -s -o /tmp/rooiam_cookie_login.json -D "$LOGIN_HEADERS" -c "$COOKIE_JAR" -w "%{http_code}" \
  -X POST "$BASE_URL/v1/test/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"cookie-check@rooiam.test"}')
[ "$LOGIN_CODE" = "200" ] || fail "test-login should return 200, got $LOGIN_CODE"

COOKIE_LINE=$(grep -i '^set-cookie: rooiam_sid=' "$LOGIN_HEADERS" || true)
[ -n "$COOKIE_LINE" ] || fail "login response did not set rooiam_sid"
echo "$COOKIE_LINE" | grep -qi 'HttpOnly' || fail "session cookie must be HttpOnly"
echo "$COOKIE_LINE" | grep -qi 'SameSite=Lax' || fail "session cookie must be SameSite=Lax"
echo "$COOKIE_LINE" | grep -qi 'Path=/' || fail "session cookie must use Path=/"
if echo "$COOKIE_LINE" | grep -qi 'Domain='; then
  fail "session cookie should not set a Domain by default"
fi
if echo "$COOKIE_LINE" | grep -qi 'Secure'; then
  fail "localhost test cookie should not be Secure by default"
fi
pass "login session cookie flags are correct for localhost"

LOGOUT_HEADERS=$(mktemp)
info "Logging out to inspect the clearing cookie..."
LOGOUT_CODE=$(curl -s -o /tmp/rooiam_cookie_logout.json -D "$LOGOUT_HEADERS" -b "$COOKIE_JAR" -w "%{http_code}" \
  -X POST "$BASE_URL/v1/auth/logout")
[ "$LOGOUT_CODE" = "200" ] || fail "logout should return 200, got $LOGOUT_CODE"

CLEAR_LINE=$(grep -i '^set-cookie: rooiam_sid=' "$LOGOUT_HEADERS" || true)
[ -n "$CLEAR_LINE" ] || fail "logout response did not clear rooiam_sid"
echo "$CLEAR_LINE" | grep -qi 'HttpOnly' || fail "clear cookie must stay HttpOnly"
echo "$CLEAR_LINE" | grep -qi 'SameSite=Lax' || fail "clear cookie must stay SameSite=Lax"
echo "$CLEAR_LINE" | grep -qi 'Max-Age=0' || fail "clear cookie must expire immediately"
pass "logout clearing cookie flags are correct"

rm -f "$LOGIN_HEADERS" "$LOGOUT_HEADERS" "$COOKIE_JAR" /tmp/rooiam_cookie_login.json /tmp/rooiam_cookie_logout.json
echo -e "${GREEN}Cookie security test passed.${NC}"
