#!/bin/bash
# run_widget_context_security_test.sh
#
# Smoke-tests hosted widget session replay / expiry handling by:
#   1. creating a real workspace app in test mode
#   2. loading /login-widget and extracting widgetLoginContext from HTML
#   3. consuming that token through magic-link start
#   4. replaying the same token and expecting rejection
#   5. using the same stale token on OAuth start and expecting widget_error=expired
#   6. verifying audit coverage for auth.widget.context_invalid + auth.widget.expired
#
# Usage:
#   BASE_URL=http://localhost:5177 \
#   DB=postgres://.../rooiam_test \
#   bash run_widget_context_security_test.sh

set -euo pipefail

DB="${DB:-postgres://rooiam:rooiam@localhost:5432/rooiam_test}"
BASE_URL="${BASE_URL:-http://localhost:5170}"
EMAIL="${EMAIL:-rooroo@sweetfactory.test}"
ORG_SLUG="${ORG_SLUG:-roochoco-test}"
EMBED_ORIGIN="${EMBED_ORIGIN:-http://localhost:5172}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} $1"; }
fail() { echo -e "${RED}FAIL${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}INFO${NC} $1"; }

COOKIE_JAR="/tmp/rooiam_widget_ctx_cookie.txt"
rm -f "$COOKIE_JAR"

cleanup() {
    if [ -n "${CLIENT_ROW_ID:-}" ]; then
        curl -s -b "$COOKIE_JAR" -X DELETE "$BASE_URL/v1/orgs/current/clients/$CLIENT_ROW_ID" >/dev/null || true
    fi
    rm -f "$COOKIE_JAR"
}
trap cleanup EXIT

info "Checking test server health..."
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
if [ "$HEALTH" != "200" ]; then
    fail "Server not reachable on $BASE_URL (health returned $HEALTH)"
fi

PROBE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/v1/test/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$EMAIL\", \"org_slug\": \"$ORG_SLUG\"}")
if [ "$PROBE" = "404" ]; then
    fail "test-login returned 404 — server must run in ROOIAM_MODE=test"
fi

info "Logging in as tenant owner..."
LOGIN=$(curl -s -c "$COOKIE_JAR" -X POST "$BASE_URL/v1/test/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$EMAIL\", \"org_slug\": \"$ORG_SLUG\"}")
echo "$LOGIN" | grep -q '"ok":true' || fail "test-login failed: $LOGIN"

info "Loading current workspace id..."
PORTAL=$(curl -s -b "$COOKIE_JAR" "$BASE_URL/v1/orgs/current/portal")
WORKSPACE_ID=$(echo "$PORTAL" | grep -o '"id":"[^"]*"' | head -n1 | cut -d'"' -f4)
[ -n "$WORKSPACE_ID" ] || fail "Could not extract workspace id from portal response"

APP_NAME="Widget Context Test App"
info "Creating widget test app..."
CREATE=$(curl -s -b "$COOKIE_JAR" -X POST "$BASE_URL/v1/orgs/current/clients" \
    -H "Content-Type: application/json" \
    -d "{\"app_name\":\"$APP_NAME\",\"app_type\":\"spa\",\"redirect_uris\":[\"$EMBED_ORIGIN/callback\"],\"allowed_embed_origins\":[\"$EMBED_ORIGIN\"]}")
echo "$CREATE" | grep -q '"client"' || fail "app creation failed: $CREATE"
CLIENT_ID=$(echo "$CREATE" | sed -n 's/.*"client_id":"\([^"]*\)".*/\1/p')
CLIENT_ROW_ID=$(echo "$CREATE" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -n1)
[ -n "$CLIENT_ID" ] || fail "Could not extract public client_id"
[ -n "$CLIENT_ROW_ID" ] || fail "Could not extract app row id"

info "Loading hosted widget HTML..."
WIDGET_HTML=$(curl -s -H "Referer: $EMBED_ORIGIN/app" "$BASE_URL/login-widget?workspace_id=$WORKSPACE_ID&client_id=$CLIENT_ID")
WIDGET_CTX=$(echo "$WIDGET_HTML" | sed -n "s/.*let widgetLoginContext = '\([^']*\)'.*/\1/p" | head -n1)
[ -n "$WIDGET_CTX" ] || fail "Could not extract widgetLoginContext from hosted widget HTML"
pass "Hosted widget issued a widget_login_context"

BEFORE_TS=$(psql "$DB" -Atc "SELECT NOW()")

info "Consuming widget_login_context through magic-link start..."
FIRST_START=$(curl -s -X POST "$BASE_URL/v1/auth/magic-link/start" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"widget_login_context\":\"$WIDGET_CTX\",\"widget_embed_origin\":\"$EMBED_ORIGIN\",\"surface\":\"tenant\"}")
echo "$FIRST_START" | grep -q '"ok":true' || fail "First magic-link start failed: $FIRST_START"
pass "Initial widget_login_context consumption succeeded"

info "Replaying the same widget_login_context..."
SECOND_START_CODE=$(curl -s -o /tmp/rooiam_widget_ctx_replay.json -w "%{http_code}" -X POST "$BASE_URL/v1/auth/magic-link/start" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"widget_login_context\":\"$WIDGET_CTX\",\"widget_embed_origin\":\"$EMBED_ORIGIN\",\"surface\":\"tenant\"}")
[ "$SECOND_START_CODE" = "400" ] || fail "Replay should return 400, got $SECOND_START_CODE"
grep -q 'expired or was already used' /tmp/rooiam_widget_ctx_replay.json || fail "Replay response did not mention expired/used widget session"
pass "Replay attempt was rejected with the expected hosted-widget message"

info "Using the same stale token on OAuth provider start..."
OAUTH_HEADERS=$(mktemp)
OAUTH_CODE=$(curl -s -o /dev/null -D "$OAUTH_HEADERS" -w "%{http_code}" \
    -H "Referer: $EMBED_ORIGIN/app" \
    "$BASE_URL/v1/oauth/login?provider=google&client_id=$CLIENT_ID&workspace_id=$WORKSPACE_ID&widget_login_context=$WIDGET_CTX&widget_embed_origin=$EMBED_ORIGIN&surface=tenant")
[ "$OAUTH_CODE" = "302" ] || fail "OAuth stale-token redirect should be 302, got $OAUTH_CODE"
grep -qi 'Location: .*widget_error=expired' "$OAUTH_HEADERS" || fail "OAuth stale-token redirect did not include widget_error=expired"
pass "OAuth start redirected back to the widget with widget_error=expired"
rm -f "$OAUTH_HEADERS" /tmp/rooiam_widget_ctx_replay.json

info "Checking audit coverage..."
CONTEXT_INVALID_COUNT=$(psql "$DB" -Atc "
    SELECT COUNT(*) FROM audit_logs
    WHERE action = 'auth.widget.context_invalid'
      AND created_at >= '$BEFORE_TS'
")
WIDGET_EXPIRED_COUNT=$(psql "$DB" -Atc "
    SELECT COUNT(*) FROM audit_logs
    WHERE action = 'auth.widget.expired'
      AND created_at >= '$BEFORE_TS'
")

[ "${CONTEXT_INVALID_COUNT:-0}" -ge 2 ] || fail "Expected at least 2 auth.widget.context_invalid events, got ${CONTEXT_INVALID_COUNT:-0}"
[ "${WIDGET_EXPIRED_COUNT:-0}" -ge 1 ] || fail "Expected at least 1 auth.widget.expired event, got ${WIDGET_EXPIRED_COUNT:-0}"
pass "Audit coverage recorded context_invalid and widget.expired events"

echo -e "${GREEN}Widget context replay / expiry test passed.${NC}"
