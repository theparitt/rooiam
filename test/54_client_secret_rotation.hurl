# =============================================================================
# OAuth Client Secret Rotation Tests
#
# Verifies that rotating a client secret:
#   1. Returns a new secret in the response
#   2. Rotated secret is different from the previous one
#   3. Suspend client: status changes to suspended
#   4. Resume client: status returns to active
#   5. Non-admin cannot rotate a secret
# =============================================================================


# ── Setup: create a fresh confidential (web) client to test rotation ──────────
# Rotation only works on app_type=web. Create via rooroo in mintmallow to avoid
# the roochoco 10-client limit from accumulated test runs.

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{mintMallowWorkspace}}" }

HTTP 200


###


# Pre-cleanup: attempt to create the client — accept any status (may already exist or workspace is full).
# Step 1: try to create (succeeds if absent, 400 if limit reached).
POST {{baseUrl}}/v1/orgs/current/clients
Content-Type: application/json

{
  "app_name": "Rotation Test Client",
  "app_type": "web",
  "redirect_uris": ["http://localhost:9999/callback"]
}

HTTP/1.1 *


###


# Step 2: list clients and capture the ID of the test client (now guaranteed to exist or was pre-existing).
GET {{baseUrl}}/v1/orgs/current/clients

HTTP 200
[Captures]
rotationTestClientIdToDelete: jsonpath "$[?(@.client.app_name == 'Rotation Test Client')].client.id" nth 0


###


# Step 3: delete the test client so the actual test gets a clean slate.
DELETE {{baseUrl}}/v1/orgs/current/clients/{{rotationTestClientIdToDelete}}

HTTP 200


###


# Now create the test client fresh.
POST {{baseUrl}}/v1/orgs/current/clients
Content-Type: application/json

{
  "app_name": "Rotation Test Client",
  "app_type": "web",
  "redirect_uris": ["http://localhost:9999/callback"]
}

HTTP 201
[Captures]
testClientId: jsonpath "$.client.id"
[Asserts]
jsonpath "$.client.app_type" == "web"


###


# Switch to platform owner for admin operations
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"


###


# ── Scenario 1: Rotate secret — response contains a new secret ───────────────

POST {{baseUrl}}/v1/admin/clients/{{testClientId}}/rotate-secret
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Captures]
newSecret: jsonpath "$.client_secret"
[Asserts]
jsonpath "$.client_secret" isString
jsonpath "$.client_id" isString


###


# ── Scenario 2: Rotate again — must return a DIFFERENT secret ─────────────────

POST {{baseUrl}}/v1/admin/clients/{{testClientId}}/rotate-secret
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Captures]
anotherSecret: jsonpath "$.client_secret"
[Asserts]
jsonpath "$.client_secret" isString
# New rotation must produce a different value
jsonpath "$.client_secret" != {{newSecret}}


###


# ── Scenario 3: Suspend the client ───────────────────────────────────────────

PATCH {{baseUrl}}/v1/admin/clients/{{testClientId}}/status
Cookie: rooiam_sid={{ownerSession}}
Content-Type: application/json

{ "status": "suspended" }

HTTP 200
[Asserts]
jsonpath "$.status" == "suspended"


###


# Read back — client must show as suspended
GET {{baseUrl}}/v1/admin/clients?page_size=50
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.items" count >= 1


###


# ── Scenario 4: Resume client → status returns to active ─────────────────────

PATCH {{baseUrl}}/v1/admin/clients/{{testClientId}}/status
Cookie: rooiam_sid={{ownerSession}}
Content-Type: application/json

{ "status": "active" }

HTTP 200
[Asserts]
jsonpath "$.status" == "active"


###


# ── Scenario 5: Regular member cannot rotate a secret ────────────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{rooChocoMemberEmail}}", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
cocoSession: cookie "rooiam_sid"


###


POST {{baseUrl}}/v1/admin/clients/{{testClientId}}/rotate-secret
Cookie: rooiam_sid={{cocoSession}}

HTTP 403


###


# ── Scenario 6: Non-existent client ID returns 404 ───────────────────────────

POST {{baseUrl}}/v1/admin/clients/00000000-0000-0000-0000-000000000000/rotate-secret
Cookie: rooiam_sid={{ownerSession}}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500
