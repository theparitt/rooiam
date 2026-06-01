#!/bin/bash
#
# Single-entry security smoke runner for release checks.
#
# Expected environment:
#   - normal isolated test server on http://localhost:5177
#   - low-limit auth-abuse test server on http://localhost:5178
#
# Example:
#   cd /home/theparitt/work/rooiam/test
#   bash run_security_smoke.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5177}"
LOW_LIMIT_BASE_URL="${LOW_LIMIT_BASE_URL:-http://localhost:5178}"
DB="${DB:-postgres://rooiam:rooiam@localhost:5432/rooiam_test}"
REDIS_URL="${REDIS_URL:-redis://127.0.0.1:6379/}"
MAILHOG_API="${MAILHOG_API:-http://127.0.0.1:8025/api/v2/messages}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${YELLOW}INFO${NC} $1"; }
done_msg() { echo -e "${GREEN}DONE${NC} $1"; }

info "Checking primary security test server on $BASE_URL"
curl -fsS "$BASE_URL/health" > /dev/null

info "Checking low-limit auth-abuse test server on $LOW_LIMIT_BASE_URL"
curl -fsS "$LOW_LIMIT_BASE_URL/health" > /dev/null

info "Running hosted-widget security Hurl suite"
hurl --variables-file test.vars --variable baseUrl="$BASE_URL" 59_hosted_widget_security.hurl --test

info "Running suspicious-alert review Hurl suite"
hurl --variables-file test.vars --variable baseUrl="$BASE_URL" 60_security_alert_reviews.hurl --test

info "Running OAuth state security smoke"
BASE_URL="$BASE_URL" DB="$DB" REDIS_URL="$REDIS_URL" bash run_oauth_state_security_test.sh

info "Running widget context replay / expiry smoke"
BASE_URL="$BASE_URL" DB="$DB" bash run_widget_context_security_test.sh

info "Running suspicious-risk signal smoke"
BASE_URL="$BASE_URL" DB="$DB" MAILHOG_API="$MAILHOG_API" bash run_risk_signal_test.sh

info "Running cookie security smoke"
BASE_URL="$BASE_URL" bash run_cookie_security_test.sh

info "Running blocked-widget probe suspicious-signal smoke"
BASE_URL="$BASE_URL" DB="$DB" bash run_widget_probe_signal_test.sh

info "Running auth-surface rate-limit smoke"
BASE_URL="$LOW_LIMIT_BASE_URL" bash run_auth_surface_rate_limit_test.sh

done_msg "Release security smoke suite passed."
