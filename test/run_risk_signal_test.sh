#!/bin/bash
# run_risk_signal_test.sh
#
# Tests risk detection signals using test-login with cute test identities.
# No demo seed required — test-login creates users on the fly.
#
# Usage:
#   cd /home/theparitt/work/rooiam/test
#   bash run_risk_signal_test.sh
#
# Requirements:
#   - rooiam-server running with ROOIAM_MODE=test on localhost:5170
#   - psql installed

set -euo pipefail

DB="${DB:-postgres://rooiam:rooiam@localhost:5432/rooiam_test}"
BASE_URL="${BASE_URL:-http://localhost:5170}"

# Test identities — created on the fly by test-login, cleaned up at the end
TESTER="pixel@neoncat.test"     # used for new_ip + rapid_ip_change tests
OWNER="lumi@starjelly.test"     # used for risk policy admin (needs platform owner)
OPERATOR_EMAIL="rooroo@sweetfactory.test"
SHARED_ORG="roochoco-test"
SHARED_MEMBER="hazel@roochoco.test"

OLD_IP="203.0.113.1"            # TEST-NET-3 (RFC 5737)
NEW_IP="198.51.100.5"           # TEST-NET-2 (RFC 5737)
OLD_UA="RooiamTestBrowser/1.0"
NEW_UA="RooiamTestBrowser/2.0"
MAILHOG_API="${MAILHOG_API:-http://127.0.0.1:8025/api/v2/messages}"

# ── colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} $1"; }
fail() { echo -e "${RED}FAIL${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}INFO${NC} $1"; }

mailhog_subject_count() {
    python3 - "$MAILHOG_API" "$1" "$2" <<'PY'
import json, sys, urllib.request
api, subject_fragment, recipient = sys.argv[1:4]
obj = json.load(urllib.request.urlopen(api))
count = 0
for item in obj.get("items", []):
    headers = item.get("Content", {}).get("Headers", {})
    subject = (headers.get("Subject") or [""])[0]
    to = (headers.get("To") or [""])[0]
    if subject_fragment in subject and recipient in to:
        count += 1
print(count)
PY
}

# ── 0. Verify server is in test mode ─────────────────────────────────────────
info "Checking server is up and in test mode..."
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
if [ "$HEALTH" != "200" ]; then
    fail "Server not reachable (health returned $HEALTH). Is it running with ROOIAM_MODE=test?"
fi

PROBE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/v1/test/login" \
    -H "Content-Type: application/json" \
    -d '{"email": "probe@check.test"}')
if [ "$PROBE" = "404" ]; then
    fail "test-login returned 404 — server must be running with ROOIAM_MODE=test."
fi

# ── cleanup function (runs on exit) ──────────────────────────────────────────
cleanup() {
    info "Running test-cleanup (deletes all *.test users/orgs/sessions)..."
    RESULT=$(curl -s -X DELETE "$BASE_URL/v1/test/cleanup")
    info "Cleanup: $RESULT"
    rm -f /tmp/rooiam_test_owner_cookie.txt /tmp/rooiam_owner_resp.txt
}
trap cleanup EXIT

# ── Ensure risk detection is enabled before we start ─────────────────────────
# Previous test run may have left it disabled if cleanup ran before re-enable.
info "Ensuring risk detection is enabled..."
curl -s -c /tmp/rooiam_test_owner_cookie.txt \
    -X POST "$BASE_URL/v1/test/login" \
    -H "Content-Type: application/json" \
    -d '{"email": "owner@rooiam.test"}' > /dev/null
curl -s -b /tmp/rooiam_test_owner_cookie.txt \
    -X PATCH "$BASE_URL/v1/admin/risk-policy" \
    -H "Content-Type: application/json" \
    -d '{"enabled": true, "new_user_agent_enabled": true, "operator_email_enabled": true}' > /dev/null

# ── look up user ID after first login ────────────────────────────────────────
info "Creating test user $TESTER via test-login..."
INIT=$(curl -s -X POST "$BASE_URL/v1/test/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$TESTER\"}")
if ! echo "$INIT" | grep -q '"ok":true'; then
    fail "test-login failed: $INIT"
fi

USER_ID=$(echo "$INIT" | grep -o '"user_id":"[^"]*"' | cut -d'"' -f4)
if [ -z "$USER_ID" ]; then
    # fallback: look up from DB
    USER_ID=$(psql "$DB" -tAc \
        "SELECT user_id FROM user_emails WHERE email = '$TESTER' LIMIT 1")
fi
info "User ID: $USER_ID"

# ─────────────────────────────────────────────────────────────────────────────
# TEST 1: new_ip signal
#
# Login 3× from OLD_IP → history established.
# Login from NEW_IP → not in history → triggers new_ip.
# ─────────────────────────────────────────────────────────────────────────────
echo ""
info "=== TEST 1: new_ip signal ==="

info "Establishing login history: 3 logins from $OLD_IP..."
for i in 1 2 3; do
    curl -s -X POST "$BASE_URL/v1/test/login" \
        -H "Content-Type: application/json" \
        -H "X-Forwarded-For: $OLD_IP" \
        -H "User-Agent: $OLD_UA" \
        -d "{\"email\": \"$TESTER\"}" > /dev/null
done

info "Logging in from new IP $NEW_IP..."
RESPONSE=$(curl -s -X POST "$BASE_URL/v1/test/login" \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: $NEW_IP" \
    -H "User-Agent: $OLD_UA" \
    -d "{\"email\": \"$TESTER\"}")

if ! echo "$RESPONSE" | grep -q '"ok":true'; then
    fail "Login failed: $RESPONSE"
fi

sleep 1

NEW_IP_COUNT=$(psql "$DB" -tAc "
    SELECT COUNT(*) FROM audit_logs
    WHERE actor_user_id = '$USER_ID'
      AND action = 'auth.login.suspicious'
      AND metadata->>'reason' = 'new_ip'
      AND created_at >= NOW() - INTERVAL '30 seconds'
")

if [ "$NEW_IP_COUNT" -ge 1 ]; then
    pass "new_ip signal fired ($NEW_IP_COUNT event(s))"
else
    fail "new_ip signal did NOT fire"
fi

# ─────────────────────────────────────────────────────────────────────────────
# TEST 2: rapid_ip_change signal
#
# Login from OLD_IP, then immediately from NEW_IP → triggers rapid_ip_change.
# ─────────────────────────────────────────────────────────────────────────────
echo ""
info "=== TEST 2: rapid_ip_change signal ==="

info "Login from $OLD_IP..."
curl -s -X POST "$BASE_URL/v1/test/login" \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: $OLD_IP" \
    -H "User-Agent: $OLD_UA" \
    -d "{\"email\": \"$TESTER\"}" > /dev/null

info "Immediately login from $NEW_IP (different IP, within window)..."
RESPONSE=$(curl -s -X POST "$BASE_URL/v1/test/login" \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: $NEW_IP" \
    -H "User-Agent: $OLD_UA" \
    -d "{\"email\": \"$TESTER\"}")

if ! echo "$RESPONSE" | grep -q '"ok":true'; then
    fail "Login failed: $RESPONSE"
fi

sleep 1

RAPID_COUNT=$(psql "$DB" -tAc "
    SELECT COUNT(*) FROM audit_logs
    WHERE actor_user_id = '$USER_ID'
      AND action = 'auth.login.suspicious'
      AND metadata->>'reason' = 'rapid_ip_change'
      AND created_at >= NOW() - INTERVAL '30 seconds'
")

if [ "$RAPID_COUNT" -ge 1 ]; then
    pass "rapid_ip_change signal fired ($RAPID_COUNT event(s))"
else
    fail "rapid_ip_change signal did NOT fire"
fi

# ─────────────────────────────────────────────────────────────────────────────
# TEST 3: master switch — disabled risk fires nothing
#
# Creates lumi@starjelly.test as platform owner via test-login platform_owner:true,
# uses that session to disable risk policy, then asserts no suspicious events fire.
# ─────────────────────────────────────────────────────────────────────────────
echo ""
info "=== TEST 3: master switch disabled ==="

OWNER_RESP=$(curl -s -c /tmp/rooiam_test_owner_cookie.txt \
    -X POST "$BASE_URL/v1/test/login" \
    -H "Content-Type: application/json" \
    -d '{"email": "owner@rooiam.test"}')

if ! echo "$OWNER_RESP" | grep -q '"ok":true'; then
    fail "Owner test-login failed: $OWNER_RESP"
fi
info "Logged in as owner@rooiam.test (platform owner)"

DISABLE_RESP=$(curl -s -b /tmp/rooiam_test_owner_cookie.txt \
    -X PATCH "$BASE_URL/v1/admin/risk-policy" \
    -H "Content-Type: application/json" \
    -d '{"enabled": false}')

if ! echo "$DISABLE_RESP" | grep -q '"enabled":false'; then
    fail "Could not disable risk detection: $DISABLE_RESP"
fi
info "Risk detection disabled"

# Capture timestamp before the login so we only check events from this moment
BEFORE_DISABLED=$(psql "$DB" -tAc "SELECT NOW()")

curl -s -X POST "$BASE_URL/v1/test/login" \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: $NEW_IP" \
    -d "{\"email\": \"$TESTER\"}" > /dev/null

sleep 1

DISABLED_COUNT=$(psql "$DB" -tAc "
    SELECT COUNT(*) FROM audit_logs
    WHERE actor_user_id = '$USER_ID'
      AND action = 'auth.login.suspicious'
      AND created_at >= '$BEFORE_DISABLED'
")

if [ "$DISABLED_COUNT" -eq 0 ]; then
    pass "master switch: no signals fired when disabled"
else
    fail "master switch: $DISABLED_COUNT suspicious event(s) fired even though risk was disabled"
fi

# Re-enable
curl -s -b /tmp/rooiam_test_owner_cookie.txt \
    -X PATCH "$BASE_URL/v1/admin/risk-policy" \
    -H "Content-Type: application/json" \
    -d '{"enabled": true}' > /dev/null
info "Risk detection re-enabled"

# ─────────────────────────────────────────────────────────────────────────────
# TEST 4: new_user_agent signal
# ─────────────────────────────────────────────────────────────────────────────
echo ""
info "=== TEST 4: new_user_agent signal ==="

info "Establishing login history with one user agent..."
for i in 1 2 3; do
    curl -s -X POST "$BASE_URL/v1/test/login" \
        -H "Content-Type: application/json" \
        -H "X-Forwarded-For: $OLD_IP" \
        -H "User-Agent: $OLD_UA" \
        -d "{\"email\": \"$TESTER\"}" > /dev/null
done

info "Logging in with a new user agent..."
RESPONSE=$(curl -s -X POST "$BASE_URL/v1/test/login" \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: $OLD_IP" \
    -H "User-Agent: $NEW_UA" \
    -d "{\"email\": \"$TESTER\"}")

if ! echo "$RESPONSE" | grep -q '"ok":true'; then
    fail "Login failed: $RESPONSE"
fi

sleep 1

NEW_UA_COUNT=$(psql "$DB" -tAc "
    SELECT COUNT(*) FROM audit_logs
    WHERE actor_user_id = '$USER_ID'
      AND action = 'auth.login.suspicious'
      AND metadata->>'reason' = 'new_user_agent'
      AND created_at >= NOW() - INTERVAL '30 seconds'
")

if [ "$NEW_UA_COUNT" -ge 1 ]; then
    pass "new_user_agent signal fired ($NEW_UA_COUNT event(s))"
else
    fail "new_user_agent signal did NOT fire"
fi

# ─────────────────────────────────────────────────────────────────────────────
# TEST 5: high-severity operator email + dedupe window
# ─────────────────────────────────────────────────────────────────────────────
echo ""
info "=== TEST 5: high-severity operator email ==="

MAIL_BEFORE=$(mailhog_subject_count "High-severity suspicious sign-in detected" "$OPERATOR_EMAIL")

info "Creating a shared-org member in $SHARED_ORG..."
curl -s -X POST "$BASE_URL/v1/test/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"$SHARED_MEMBER\", \"org_slug\": \"$SHARED_ORG\"}" > /dev/null

info "Triggering rapid IP change for the shared-org member..."
curl -s -X POST "$BASE_URL/v1/test/login" \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: $OLD_IP" \
    -H "User-Agent: $OLD_UA" \
    -d "{\"email\": \"$SHARED_MEMBER\", \"org_slug\": \"$SHARED_ORG\"}" > /dev/null
curl -s -X POST "$BASE_URL/v1/test/login" \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: $NEW_IP" \
    -H "User-Agent: $OLD_UA" \
    -d "{\"email\": \"$SHARED_MEMBER\", \"org_slug\": \"$SHARED_ORG\"}" > /dev/null

sleep 2

MAIL_AFTER=$(mailhog_subject_count "High-severity suspicious sign-in detected" "$OPERATOR_EMAIL")
if [ "$MAIL_AFTER" -gt "$MAIL_BEFORE" ]; then
    pass "high-severity operator email was delivered to $OPERATOR_EMAIL"
else
    fail "high-severity operator email was not delivered to $OPERATOR_EMAIL"
fi

MAIL_DELTA=$((MAIL_AFTER - MAIL_BEFORE))
if [ "$MAIL_DELTA" -ne 1 ]; then
    fail "expected exactly 1 new operator alert email on first high-severity event, got $MAIL_DELTA"
fi
pass "first high-severity event sent exactly one operator alert email"

info "Triggering the same high-severity signal again inside the dedupe window..."
curl -s -X POST "$BASE_URL/v1/test/login" \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: $OLD_IP" \
    -H "User-Agent: $OLD_UA" \
    -d "{\"email\": \"$SHARED_MEMBER\", \"org_slug\": \"$SHARED_ORG\"}" > /dev/null
curl -s -X POST "$BASE_URL/v1/test/login" \
    -H "Content-Type: application/json" \
    -H "X-Forwarded-For: $NEW_IP" \
    -H "User-Agent: $OLD_UA" \
    -d "{\"email\": \"$SHARED_MEMBER\", \"org_slug\": \"$SHARED_ORG\"}" > /dev/null

sleep 2

MAIL_AFTER_REPEAT=$(mailhog_subject_count "High-severity suspicious sign-in detected" "$OPERATOR_EMAIL")
if [ "$MAIL_AFTER_REPEAT" -ne "$MAIL_AFTER" ]; then
    fail "operator alert email dedupe failed; expected count to stay at $MAIL_AFTER, got $MAIL_AFTER_REPEAT"
fi
pass "high-severity operator alert email was deduped inside the active window"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}All risk signal tests passed.${NC}"
