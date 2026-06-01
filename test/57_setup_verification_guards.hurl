# Setup verification guards
#
# What this tests:
#   1. Platform owner can read setup config
#   2. Setup config exposes provider verification/configured flags
#   3. Google admin login cannot be enabled before provider verification
#   4. Microsoft admin login cannot be enabled before provider verification
#   5. Failed enable attempts do not flip the provider-login booleans


# ── 1. Login as platform owner ───────────────────────────────────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"


###


# ── 2. Read setup config ─────────────────────────────────────────────────────

GET {{baseUrl}}/v1/setup/config
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.google_client_secret_configured" isBoolean
jsonpath "$.google_oauth_verified_at" isString
jsonpath "$.google_admin_login_enabled" isBoolean
jsonpath "$.microsoft_client_secret_configured" isBoolean
jsonpath "$.microsoft_oauth_verified_at" isString
jsonpath "$.microsoft_admin_login_enabled" isBoolean
jsonpath "$.google_admin_login_enabled" == false
jsonpath "$.microsoft_admin_login_enabled" == false


###


# ── 3. Reject enabling Google before verify ──────────────────────────────────

POST {{baseUrl}}/v1/setup/configure-oauth
Cookie: rooiam_sid={{ownerSession}}
Content-Type: application/json

{ "google_admin_login_enabled": true }

HTTP 400
[Asserts]
jsonpath "$.error.message" contains "Verify Google"


###


# ── 4. Reject enabling Microsoft before verify ───────────────────────────────

POST {{baseUrl}}/v1/setup/configure-oauth
Cookie: rooiam_sid={{ownerSession}}
Content-Type: application/json

{ "microsoft_admin_login_enabled": true }

HTTP 400
[Asserts]
jsonpath "$.error.message" contains "Verify Microsoft"


###


# ── 5. Ensure provider-login flags remain disabled after failed attempts ─────

GET {{baseUrl}}/v1/setup/config
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.google_admin_login_enabled" == false
jsonpath "$.microsoft_admin_login_enabled" == false

