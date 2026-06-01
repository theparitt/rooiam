#!/bin/bash
#
# Verifies repeated blocked hosted-widget embed attempts raise a suspicious-auth audit signal.
#
# Usage:
#   BASE_URL=http://localhost:5177 DB=postgres://.../rooiam_test bash run_widget_probe_signal_test.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5177}"
DB="${DB:-postgres://rooiam:rooiam@localhost:5432/rooiam_test}"
COOKIE_JAR="/tmp/rooiam_widget_probe_cookie.txt"
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} $1"; }
fail() { echo -e "${RED}FAIL${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}INFO${NC} $1"; }

info "Checking widget-probe test server health..."
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
[ "$HEALTH" = "200" ] || fail "Server not reachable on $BASE_URL (health returned $HEALTH)"

info "Logging in as tenant owner..."
curl -s -c "$COOKIE_JAR" \
  -X POST "$BASE_URL/v1/test/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"rooroo@sweetfactory.test","org_slug":"roochoco-test"}' > /dev/null

WORKSPACE_ID=$(curl -s -b "$COOKIE_JAR" "$BASE_URL/v1/orgs/current/portal" | python3 -c 'import json,sys; print(json.load(sys.stdin)["current_org"]["id"])')
[ -n "$WORKSPACE_ID" ] || fail "Could not load workspace id"

APP_RESP=$(curl -s -b "$COOKIE_JAR" \
  -X POST "$BASE_URL/v1/orgs/current/clients" \
  -H "Content-Type: application/json" \
  -d "{\"app_name\":\"Probe Signal App\",\"app_type\":\"spa\",\"redirect_uris\":[\"http://localhost:5180/callback\"],\"allowed_embed_origins\":[\"http://localhost:5180\"]}")
CLIENT_ID=$(echo "$APP_RESP" | python3 -c 'import json,sys; print(json.load(sys.stdin)["client"]["client_id"])')
[ -n "$CLIENT_ID" ] || fail "Could not create widget probe app"

BEFORE_TS=$(psql "$DB" -Atc "SELECT NOW()")

info "Triggering repeated blocked widget loads from a disallowed origin..."
for _ in 1 2 3 4; do
  code=$(curl -s -o /tmp/rooiam_widget_probe.json -w "%{http_code}" \
    -H "Referer: http://evil.example/hijack" \
    "$BASE_URL/login-widget?workspace_id=$WORKSPACE_ID&client_id=$CLIENT_ID&app=Probe%20Signal%20App")
  [ "$code" = "403" ] || fail "Expected blocked widget load to return 403, got $code"
done
pass "Blocked widget loads were rejected"

COUNT=$(psql "$DB" -Atc "
  SELECT COUNT(*) FROM audit_logs
  WHERE action = 'auth.login.suspicious'
    AND metadata->>'reason' = 'repeated_blocked_embed_origin_probe'
    AND created_at >= '$BEFORE_TS'
")

[ "${COUNT:-0}" -ge 1 ] || fail "Expected repeated_blocked_embed_origin_probe suspicious audit event"
pass "Repeated blocked widget probes generated a suspicious-auth audit signal"

rm -f "$COOKIE_JAR" /tmp/rooiam_widget_probe.json
echo -e "${GREEN}Widget probe suspicious-signal test passed.${NC}"
