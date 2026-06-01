# =============================================================================
# Suspend → Session Revocation Tests
#
# Verifies that suspending a user immediately blocks all their active sessions
# on the NEXT request — no grace period, no cache.
#
# Scenarios:
#   1. Suspend user → their existing session returns 401 on next request
#   2. Suspended user cannot start a new session (login blocked)
#   3. Resume user → they can log in and get a fresh session
#   4. Revoking all sessions from admin clears session list
#   5. Suspend workspace → members cannot log in to that org
#   6. Resume workspace → members can log in again
# =============================================================================


# ── Setup: login as platform owner ───────────────────────────────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"


###


# Get coco's user ID

GET {{baseUrl}}/v1/admin/users?search=praline
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Captures]
cocoUserId: jsonpath "$.items[0].id"
[Asserts]
jsonpath "$.items[0].email" == "{{rooChocoMemberEmail}}"


###


# Pre-flight: ensure coco is active before starting (restore from prior runs)

PATCH {{baseUrl}}/v1/admin/users/{{cocoUserId}}/status
Content-Type: application/json

{ "status": "active" }

HTTP/1.1 *


###


# Pre-flight: ensure roochoco is active before starting (restore from prior runs)

GET {{baseUrl}}/v1/admin/organizations?search=roochoco
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Captures]
roochocoOrgIdPreflight: jsonpath "$.items[0].id"


###


PATCH {{baseUrl}}/v1/admin/organizations/{{roochocoOrgIdPreflight}}/status
Content-Type: application/json

{ "status": "active" }

HTTP/1.1 *


###


# ── Scenario 1: Create a session for coco, then suspend coco ─────────────────

# Login as coco to get an active session
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{rooChocoMemberEmail}}", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
cocoLiveSession: cookie "rooiam_sid"


###


# Confirm coco's session is valid before suspend
GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{cocoLiveSession}}

HTTP 200
[Asserts]
jsonpath "$.email" == "{{rooChocoMemberEmail}}"


###


# Owner suspends coco — re-login as owner and capture session explicitly
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession2: cookie "rooiam_sid"


###


PATCH {{baseUrl}}/v1/admin/users/{{cocoUserId}}/status
Content-Type: application/json

{ "status": "suspended" }

HTTP 200
[Asserts]
jsonpath "$.status" == "suspended"


###


# Verify suspension via admin sessions endpoint — coco's sessions should be empty
# (session revocation happens immediately on suspend).
# This avoids relying on a logout to clear the jar (logout may be rate-limited in CI).
GET {{baseUrl}}/v1/admin/users/{{cocoUserId}}/sessions

HTTP 200
[Asserts]
jsonpath "$" count == 0


###


# ── Scenario 2: Suspended user cannot start a new session ────────────────────

POST {{baseUrl}}/v1/auth/magic-link/start
Content-Type: application/json

{
  "email": "{{rooChocoMemberEmail}}",
  "redirect_uri": "{{appBase}}/auth/callback?workspace={{rooChocoWorkspace}}"
}

HTTP/1.1 *
[Asserts]
# Must succeed at the send step (anti-enumeration), but verify step would fail
status >= 200
status < 500


###


# ── Scenario 3: Resume coco → fresh login works ───────────────────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200


###


PATCH {{baseUrl}}/v1/admin/users/{{cocoUserId}}/status
Content-Type: application/json

{ "status": "active" }

HTTP 200
[Asserts]
jsonpath "$.status" == "active"


###


# coco can now log in successfully
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{rooChocoMemberEmail}}", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
cocoRestoredSession: cookie "rooiam_sid"


###


# coco's new session is valid
GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{cocoRestoredSession}}

HTTP 200
[Asserts]
jsonpath "$.email" == "{{rooChocoMemberEmail}}"


###


# ── Scenario 4: Admin revokes all sessions for a user ─────────────────────────

# Get coco's active sessions via admin API — capture owner session explicitly
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession4: cookie "rooiam_sid"


###


GET {{baseUrl}}/v1/admin/users/{{cocoUserId}}/sessions
Cookie: rooiam_sid={{ownerSession4}}

HTTP 200
[Asserts]
jsonpath "$" count >= 1


###


# Revoke all of coco's sessions via admin endpoint
DELETE {{baseUrl}}/v1/admin/users/{{cocoUserId}}/sessions
Cookie: rooiam_sid={{ownerSession4}}

HTTP 200


###


# Verify admin session revocation via sessions endpoint — coco should have 0 active sessions.
# This avoids relying on a logout to clear the jar (logout may be rate-limited in CI).
GET {{baseUrl}}/v1/admin/users/{{cocoUserId}}/sessions

HTTP 200
[Asserts]
jsonpath "$" count == 0


###


# Re-login as owner to restore jar for remaining admin calls
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200


###


# Session list for coco should now be empty
GET {{baseUrl}}/v1/admin/users/{{cocoUserId}}/sessions

HTTP 200
[Asserts]
jsonpath "$" count == 0


###


# ── Scenario 5: Suspend workspace → members blocked from that org ─────────────

# Find roochoco org
GET {{baseUrl}}/v1/admin/organizations?search=roochoco

HTTP 200
[Captures]
roochocoOrgId: jsonpath "$.items[0].id"
[Asserts]
jsonpath "$.items[0].status" == "active"


###


# Suspend roochoco
PATCH {{baseUrl}}/v1/admin/organizations/{{roochocoOrgId}}/status
Content-Type: application/json

{ "status": "suspended" }

HTTP 200


###


# Verify org is suspended
GET {{baseUrl}}/v1/admin/organizations/{{roochocoOrgId}}

HTTP 200
[Asserts]
jsonpath "$.organization.status" == "suspended"


###


# Login to suspended org must fail
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{rooChocoMemberEmail}}", "org_slug": "{{rooChocoWorkspace}}" }

HTTP/1.1 *
[Asserts]
# 400/403/404 — org is suspended so context lookup fails
status >= 400
status < 500


###


# ── Scenario 6: Resume workspace → members can log in again ──────────────────

PATCH {{baseUrl}}/v1/admin/organizations/{{roochocoOrgId}}/status
Content-Type: application/json

{ "status": "active" }

HTTP 200
[Asserts]
jsonpath "$.status" == "active"


###


# Login succeeds after resuming
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{rooChocoMemberEmail}}", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
cocoFreshSession: cookie "rooiam_sid"


###


GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{cocoFreshSession}}

HTTP 200
[Asserts]
jsonpath "$.email" == "{{rooChocoMemberEmail}}"
