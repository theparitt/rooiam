# =============================================================================
# Role Guard Matrix
#
# Verifies that every combination of privilege level gets the correct access:
#
#   Role                          | /admin/* | /settings | /identity/me
#   ------------------------------|----------|-----------|-------------
#   Unauthenticated               |   401    |    401    |    401
#   Regular member (coco)         |   403    |    403    |    200
#   Superuser (admin@rooiam.demo) |   200    |    403    |    200
#   Platform owner                |   200    |    200    |    200
#
# Also verifies: after logout, Zustand localStorage state cannot re-enter.
# (Server side: the session cookie is invalidated, so any cached client state
#  is irrelevant — the next API call returns 401.)
# =============================================================================


# ── Pre-flight: ensure all demo accounts are active (restore from prior runs) ──

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200


###


GET {{baseUrl}}/v1/admin/users?search=admin@rooiam

HTTP 200
[Captures]
adminUserId: jsonpath "$.items[0].id"


###


PATCH {{baseUrl}}/v1/admin/users/{{adminUserId}}/status
Content-Type: application/json

{ "status": "active" }

HTTP/1.1 *


###


GET {{baseUrl}}/v1/admin/users?search=praline

HTTP 200
[Captures]
cocoUserIdPreflight: jsonpath "$.items[0].id"


###


PATCH {{baseUrl}}/v1/admin/users/{{cocoUserIdPreflight}}/status
Content-Type: application/json

{ "status": "active" }

HTTP/1.1 *


###


POST {{baseUrl}}/v1/auth/logout

HTTP/1.1 *


###


# ── Unauthenticated: no cookie ────────────────────────────────────────────────

GET {{baseUrl}}/v1/identity/me

HTTP 401


###


GET {{baseUrl}}/v1/admin/users

HTTP 401


###


GET {{baseUrl}}/v1/setup/config

HTTP/1.1 *
[Asserts]
# 401 (no session) or 403 (session required, setup-only) — never 200 without auth
status >= 400
status < 500


###


# ── Regular member (lulu — no platform privileges) ────────────────────────────
# Using lulu@softmallow.test (mintmallow member) to avoid roochoco state interference
# from concurrent suspend/revocation tests that may suspend praline@roochoco.test.

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "lulu@softmallow.test", "org_slug": "{{mintMallowWorkspace}}" }

HTTP 200
[Captures]
cocoSession: cookie "rooiam_sid"


###


# Member CAN access their own identity
GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{cocoSession}}

HTTP 200
[Asserts]
jsonpath "$.email" == "lulu@softmallow.test"
jsonpath "$.is_superuser" == false
jsonpath "$.is_platform_owner" == false


###


# Member CANNOT access platform user list
GET {{baseUrl}}/v1/admin/users
Cookie: rooiam_sid={{cocoSession}}

HTTP 403


###


# Member CANNOT access platform org list
GET {{baseUrl}}/v1/admin/organizations
Cookie: rooiam_sid={{cocoSession}}

HTTP 403


###


# Member CANNOT access platform audit logs
GET {{baseUrl}}/v1/admin/audit-logs
Cookie: rooiam_sid={{cocoSession}}

HTTP 403


###


# Member CANNOT access workspace governance settings
GET {{baseUrl}}/v1/admin/workspace-governance
Cookie: rooiam_sid={{cocoSession}}

HTTP 403


###


# Member CANNOT access session policy settings
GET {{baseUrl}}/v1/admin/session-policy
Cookie: rooiam_sid={{cocoSession}}

HTTP 403


###


# Member CANNOT access setup config (owner-only)
GET {{baseUrl}}/v1/setup/config
Cookie: rooiam_sid={{cocoSession}}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# ── Superuser (admin@rooiam.demo — is_superuser=true, is_platform_owner=false) ─

# Clear cookie jar before switching users
POST {{baseUrl}}/v1/auth/logout

HTTP/1.1 *


###


POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformAdminEmail}}", "org_slug": "{{platformAdminOrg}}" }

HTTP 200
[Captures]
adminSession: cookie "rooiam_sid"


###


# Superuser CAN access own identity
GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{adminSession}}

HTTP 200
[Asserts]
jsonpath "$.is_superuser" == true
jsonpath "$.is_platform_owner" == false


###


# Superuser CAN list platform users
GET {{baseUrl}}/v1/admin/users
Cookie: rooiam_sid={{adminSession}}

HTTP 200
[Asserts]
jsonpath "$.items" count >= 1


###


# Superuser CAN read workspace governance
GET {{baseUrl}}/v1/admin/workspace-governance
Cookie: rooiam_sid={{adminSession}}

HTTP 200


###


# Superuser CANNOT access setup config (requires is_platform_owner)
GET {{baseUrl}}/v1/setup/config
Cookie: rooiam_sid={{adminSession}}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# ── Platform owner (owner@rooiam.demo — is_platform_owner=true) ───────────────

POST {{baseUrl}}/v1/auth/logout

HTTP/1.1 *


###


POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"


###


# Owner CAN access own identity
GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.is_platform_owner" == true


###


# Owner CAN list platform users
GET {{baseUrl}}/v1/admin/users
Cookie: rooiam_sid={{ownerSession}}

HTTP 200


###


# Owner CAN access setup config
GET {{baseUrl}}/v1/setup/config
Cookie: rooiam_sid={{ownerSession}}

HTTP 200


###


# ── After logout — session invalidated, cannot re-use cookie ──────────────────

# Clear owner session before logging in as coco
POST {{baseUrl}}/v1/auth/logout

HTTP/1.1 *


###


# Login as coco and immediately logout
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{rooChocoMemberEmail}}", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
sessionToInvalidate: cookie "rooiam_sid"


###


# Confirm session is valid before logout
GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{sessionToInvalidate}}

HTTP 200


###


# Logout
POST {{baseUrl}}/v1/auth/logout
Cookie: rooiam_sid={{sessionToInvalidate}}

HTTP 200


###


# Reuse the revoked session — must return 401 regardless of any client-side cache
GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{sessionToInvalidate}}

HTTP 401
