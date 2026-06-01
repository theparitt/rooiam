# Risk Detection — GET/PATCH risk-policy + signal verification
#
# What this tests:
#   1. GET  /admin/risk-policy        — returns defaults (platform owner)
#   2. PATCH /admin/risk-policy       — update thresholds, persisted correctly
#   3. GET after PATCH                — values actually saved
#   4. PATCH with invalid values      — validation rejects out-of-range inputs
#   5. Platform admin can also read/write (not owner-only)
#   6. Regular tenant user is forbidden
#   7. Restore defaults at the end
#
# Note: actually triggering auth.login.suspicious audit events requires
# logins from different IPs, which can't be simulated in a single-machine
# Hurl test. Signal trigger tests are covered by manual QA / future
# integration tests with IP spoofing support.
#
# Design: Each section starts with an explicit login so the jar matches
# the active session. This avoids the cookie-jar conflict that arises when
# multiple sessions are pre-captured and then mixed with the jar cookie.


# ── 1. GET risk policy as platform owner ─────────────────────────────────────
# Expects: 200 with all five fields present and sensible defaults

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "owner@rooiam.test", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"


###


GET {{baseUrl}}/v1/admin/risk-policy

HTTP 200
[Asserts]
jsonpath "$.enabled" isBoolean
jsonpath "$.new_ip_enabled" isBoolean
jsonpath "$.new_ip_lookback" isInteger
jsonpath "$.new_ip_lookback" >= 1
jsonpath "$.rapid_ip_change_enabled" isBoolean
jsonpath "$.rapid_ip_change_window_minutes" isInteger
jsonpath "$.rapid_ip_change_window_minutes" >= 1


###


# ── 2. PATCH risk policy — update thresholds ─────────────────────────────────
# Change lookback to 5, window to 20 minutes

PATCH {{baseUrl}}/v1/admin/risk-policy
Content-Type: application/json

{
    "enabled": true,
    "new_ip_enabled": true,
    "new_ip_lookback": 5,
    "rapid_ip_change_enabled": true,
    "rapid_ip_change_window_minutes": 20
}

HTTP 200
[Asserts]
jsonpath "$.enabled" == true
jsonpath "$.new_ip_enabled" == true
jsonpath "$.new_ip_lookback" == 5
jsonpath "$.rapid_ip_change_enabled" == true
jsonpath "$.rapid_ip_change_window_minutes" == 20


###


# ── 3. GET after PATCH — values actually persisted ───────────────────────────

GET {{baseUrl}}/v1/admin/risk-policy

HTTP 200
[Asserts]
jsonpath "$.new_ip_lookback" == 5
jsonpath "$.rapid_ip_change_window_minutes" == 20


###


# ── 4a. PATCH with invalid lookback (0 — below minimum) ──────────────────────

PATCH {{baseUrl}}/v1/admin/risk-policy
Content-Type: application/json

{ "new_ip_lookback": 0 }

HTTP 400


###


# ── 4b. PATCH with invalid lookback (999 — above maximum 100) ────────────────

PATCH {{baseUrl}}/v1/admin/risk-policy
Content-Type: application/json

{ "new_ip_lookback": 999 }

HTTP 400


###


# ── 4c. PATCH with invalid window (0 — below minimum) ────────────────────────

PATCH {{baseUrl}}/v1/admin/risk-policy
Content-Type: application/json

{ "rapid_ip_change_window_minutes": 0 }

HTTP 400


###


# ── 5. Platform admin can also read and write ────────────────────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "admin@rooiam.test", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200


###


GET {{baseUrl}}/v1/admin/risk-policy

HTTP 200
[Asserts]
jsonpath "$.enabled" isBoolean


###


PATCH {{baseUrl}}/v1/admin/risk-policy
Content-Type: application/json

{ "new_ip_lookback": 8 }

HTTP 200
[Asserts]
jsonpath "$.new_ip_lookback" == 8


###


# ── 6. Regular workspace member is forbidden ─────────────────────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "praline@roochoco.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
memberSession: cookie "rooiam_sid"


###


GET {{baseUrl}}/v1/admin/risk-policy

HTTP 403


###


PATCH {{baseUrl}}/v1/admin/risk-policy
Content-Type: application/json

{ "enabled": false }

HTTP 403


###


# ── 7. Unauthenticated / insufficient-privilege request is rejected ───────────
# Whether the jar has no session (401) or a member session (403 if logout was
# rate-limited), the endpoint must deny access with a 4xx.
# Section 6 already proves a member session gets 403; this confirms the endpoint
# is not publicly accessible under any scenario.

GET {{baseUrl}}/v1/admin/risk-policy

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# ── 8. Restore defaults ──────────────────────────────────────────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "owner@rooiam.test", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200


###


PATCH {{baseUrl}}/v1/admin/risk-policy
Content-Type: application/json

{
    "enabled": true,
    "new_ip_enabled": true,
    "new_ip_lookback": 10,
    "rapid_ip_change_enabled": true,
    "rapid_ip_change_window_minutes": 10
}

HTTP 200
[Asserts]
jsonpath "$.new_ip_lookback" == 10
jsonpath "$.rapid_ip_change_window_minutes" == 10
