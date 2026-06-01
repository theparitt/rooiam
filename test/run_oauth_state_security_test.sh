#!/bin/bash
# run_oauth_state_security_test.sh
#
# Smoke-tests OAuth provider state hardening by:
#   1. starting a real provider login and extracting the OAuth state token
#   2. rejecting the same state on the wrong provider callback route
#   3. rejecting callback IP mismatch for a provider state token
#   4. rejecting replay of a consumed state token
#   5. rejecting malformed provider callback payloads
#   6. verifying audit rows for each failure mode
#
# Usage:
#   BASE_URL=http://localhost:5177 \
#   DB=postgres://.../rooiam_test \
#   bash run_oauth_state_security_test.sh

set -euo pipefail

DB="${DB:-postgres://rooiam:rooiam@localhost:5432/rooiam_test}"
BASE_URL="${BASE_URL:-http://localhost:5170}"
REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379/}"
REDIRECT_URI="${REDIRECT_URI:-http://localhost:5172/callback?oauth_test_provider=google}"
INITIATED_IP="${INITIATED_IP:-203.0.113.10}"
MISMATCH_IP="${MISMATCH_IP:-203.0.113.11}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}PASS${NC} $1"; }
fail() { echo -e "${RED}FAIL${NC} $1"; exit 1; }
info() { echo -e "${YELLOW}INFO${NC} $1"; }

extract_state() {
    local headers_file="$1"
    python3 - "$headers_file" <<'PY'
import sys
from urllib.parse import urlparse, parse_qs

headers_path = sys.argv[1]
location = None
with open(headers_path, "r", encoding="utf-8") as fh:
    for line in fh:
        if line.lower().startswith("location:"):
            location = line.split(":", 1)[1].strip()
            break

if not location:
    raise SystemExit(1)

query = parse_qs(urlparse(location).query)
state = query.get("state", [""])[0]
if not state:
    raise SystemExit(1)
print(state)
PY
}

encode_url() {
    python3 - "$1" <<'PY'
import sys
import urllib.parse

print(urllib.parse.quote(sys.argv[1], safe=""))
PY
}

info "Checking test server health..."
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health")
[ "$HEALTH" = "200" ] || fail "Server not reachable on $BASE_URL (health returned $HEALTH)"

BEFORE_TS=$(psql "$DB" -Atc "SELECT NOW()")

info "Starting Google OAuth flow to mint a provider state token..."
STATE_HEADERS_ONE=$(mktemp)
ENCODED_REDIRECT_URI=$(encode_url "$REDIRECT_URI")
STATE_CODE_ONE=$(curl -s -o /dev/null -D "$STATE_HEADERS_ONE" -w "%{http_code}" \
    -H "X-Forwarded-For: $INITIATED_IP" \
    "$BASE_URL/v1/oauth/login?provider=google&redirect_uri=$ENCODED_REDIRECT_URI")
[ "$STATE_CODE_ONE" = "302" ] || fail "OAuth login start should return 302, got $STATE_CODE_ONE"
STATE_ONE=$(extract_state "$STATE_HEADERS_ONE")
[ -n "$STATE_ONE" ] || fail "Could not extract provider state token from Google auth redirect"
rm -f "$STATE_HEADERS_ONE"
pass "OAuth login start issued a provider state token"

info "Calling the wrong provider callback with a Google state token..."
WRONG_PROVIDER_CODE=$(curl -s -o /tmp/oauth_state_wrong_provider.json -w "%{http_code}" \
    -H "X-Forwarded-For: $INITIATED_IP" \
    "$BASE_URL/v1/oauth/microsoft/callback?code=fake-code&state=$STATE_ONE")
[ "$WRONG_PROVIDER_CODE" = "400" ] || fail "Wrong-provider callback should return 400, got $WRONG_PROVIDER_CODE"
grep -q 'OAuth state validation failed' /tmp/oauth_state_wrong_provider.json || fail "Wrong-provider callback did not return the expected validation message"
pass "Wrong-provider callback was rejected"

info "Starting another Google OAuth flow for IP-mismatch coverage..."
STATE_HEADERS_TWO=$(mktemp)
STATE_CODE_TWO=$(curl -s -o /dev/null -D "$STATE_HEADERS_TWO" -w "%{http_code}" \
    -H "X-Forwarded-For: $INITIATED_IP" \
    "$BASE_URL/v1/oauth/login?provider=google&redirect_uri=$ENCODED_REDIRECT_URI")
[ "$STATE_CODE_TWO" = "302" ] || fail "Second OAuth login start should return 302, got $STATE_CODE_TWO"
STATE_TWO=$(extract_state "$STATE_HEADERS_TWO")
[ -n "$STATE_TWO" ] || fail "Could not extract second provider state token"
rm -f "$STATE_HEADERS_TWO"
pass "Second OAuth login start issued a provider state token"

info "Calling the Google callback from a different IP..."
IP_MISMATCH_CODE=$(curl -s -o /tmp/oauth_state_ip_mismatch.json -w "%{http_code}" \
    -H "X-Forwarded-For: $MISMATCH_IP" \
    "$BASE_URL/v1/oauth/google/callback?code=fake-code&state=$STATE_TWO")
[ "$IP_MISMATCH_CODE" = "400" ] || fail "IP-mismatched callback should return 400, got $IP_MISMATCH_CODE"
grep -q 'OAuth state validation failed' /tmp/oauth_state_ip_mismatch.json || fail "IP-mismatched callback did not return the expected validation message"
pass "IP-mismatched callback was rejected"

info "Starting a malformed-payload callback check..."
STATE_HEADERS_MALFORMED=$(mktemp)
STATE_CODE_MALFORMED=$(curl -s -o /dev/null -D "$STATE_HEADERS_MALFORMED" -w "%{http_code}" \
    -H "X-Forwarded-For: $INITIATED_IP" \
    "$BASE_URL/v1/oauth/login?provider=google&redirect_uri=$ENCODED_REDIRECT_URI")
[ "$STATE_CODE_MALFORMED" = "302" ] || fail "Malformed-payload OAuth login start should return 302, got $STATE_CODE_MALFORMED"
STATE_MALFORMED=$(extract_state "$STATE_HEADERS_MALFORMED")
[ -n "$STATE_MALFORMED" ] || fail "Could not extract malformed-payload provider state token"
rm -f "$STATE_HEADERS_MALFORMED"

MALFORMED_CODE=$(curl -s -o /tmp/oauth_state_malformed.json -w "%{http_code}" \
    -H "X-Forwarded-For: $INITIATED_IP" \
    "$BASE_URL/v1/oauth/google/callback?code=&state=$STATE_MALFORMED")
[ "$MALFORMED_CODE" = "400" ] || fail "Malformed callback should return 400, got $MALFORMED_CODE"
grep -Eq 'Missing code|OAuth callback missing provider code' /tmp/oauth_state_malformed.json || fail "Malformed callback did not return the expected validation message"
pass "Malformed provider callback payload was rejected"

info "Starting a third Google OAuth flow for explicit expiry coverage..."
STATE_HEADERS_THREE=$(mktemp)
STATE_CODE_THREE=$(curl -s -o /dev/null -D "$STATE_HEADERS_THREE" -w "%{http_code}" \
    -H "X-Forwarded-For: $INITIATED_IP" \
    "$BASE_URL/v1/oauth/login?provider=google&redirect_uri=$ENCODED_REDIRECT_URI")
[ "$STATE_CODE_THREE" = "302" ] || fail "Third OAuth login start should return 302, got $STATE_CODE_THREE"
STATE_THREE=$(extract_state "$STATE_HEADERS_THREE")
[ -n "$STATE_THREE" ] || fail "Could not extract third provider state token"
rm -f "$STATE_HEADERS_THREE"

info "Deleting the OAuth state from Redis to simulate expiry..."
redis-cli -u "$REDIS_URL" DEL "oauth_state:$STATE_THREE" > /dev/null

EXPIRED_CODE=$(curl -s -o /tmp/oauth_state_expired.json -w "%{http_code}" \
    -H "X-Forwarded-For: $INITIATED_IP" \
    "$BASE_URL/v1/oauth/google/callback?code=fake-code&state=$STATE_THREE")
[ "$EXPIRED_CODE" = "400" ] || fail "Expired callback should return 400, got $EXPIRED_CODE"
grep -q 'Invalid or expired OAuth state' /tmp/oauth_state_expired.json || fail "Expired callback did not mention invalid or expired OAuth state"
pass "Explicitly expired OAuth state token was rejected"

info "Replaying the same consumed OAuth state token..."
REPLAY_CODE=$(curl -s -o /tmp/oauth_state_replay.json -w "%{http_code}" \
    -H "X-Forwarded-For: $MISMATCH_IP" \
    "$BASE_URL/v1/oauth/google/callback?code=fake-code&state=$STATE_TWO")
[ "$REPLAY_CODE" = "400" ] || fail "Replayed callback should return 400, got $REPLAY_CODE"
grep -q 'Invalid or expired OAuth state' /tmp/oauth_state_replay.json || fail "Replayed callback did not mention invalid or expired OAuth state"
pass "Consumed OAuth state token could not be replayed"

info "Checking audit coverage..."
PROVIDER_MISMATCH_COUNT=$(psql "$DB" -Atc "
    SELECT COUNT(*) FROM audit_logs
    WHERE action = 'oauth.login.failed'
      AND metadata->>'error' = 'oauth_state_provider_mismatch'
      AND created_at >= '$BEFORE_TS'
")
IP_MISMATCH_COUNT=$(psql "$DB" -Atc "
    SELECT COUNT(*) FROM audit_logs
    WHERE action = 'oauth.login.failed'
      AND metadata->>'error' = 'oauth_state_ip_mismatch'
      AND created_at >= '$BEFORE_TS'
")
REPLAY_COUNT=$(psql "$DB" -Atc "
    SELECT COUNT(*) FROM audit_logs
    WHERE action = 'oauth.login.failed'
      AND metadata->>'error' = 'invalid_or_expired_oauth_state'
      AND created_at >= '$BEFORE_TS'
")
MALFORMED_COUNT=$(psql "$DB" -Atc "
    SELECT COUNT(*) FROM audit_logs
    WHERE action = 'oauth.login.failed'
      AND metadata->>'error' = 'oauth_callback_missing_code'
      AND created_at >= '$BEFORE_TS'
")

[ "${PROVIDER_MISMATCH_COUNT:-0}" -ge 1 ] || fail "Expected oauth_state_provider_mismatch audit coverage"
[ "${IP_MISMATCH_COUNT:-0}" -ge 1 ] || fail "Expected oauth_state_ip_mismatch audit coverage"
[ "${REPLAY_COUNT:-0}" -ge 1 ] || fail "Expected invalid_or_expired_oauth_state audit coverage"
[ "${MALFORMED_COUNT:-0}" -ge 1 ] || fail "Expected oauth_callback_missing_code audit coverage"
pass "Audit coverage recorded provider mismatch, IP mismatch, malformed callback, and replay failures"

rm -f /tmp/oauth_state_wrong_provider.json /tmp/oauth_state_ip_mismatch.json /tmp/oauth_state_malformed.json /tmp/oauth_state_expired.json /tmp/oauth_state_replay.json
echo -e "${GREEN}OAuth state callback security test passed.${NC}"
