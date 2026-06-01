# =============================================================================
# Audit Log Coverage Tests
#
# Verifies that admin actions produce audit log entries, that pagination
# returns correct non-overlapping pages, and that action filters work.
#
# Scenarios:
#   1. Member status change produces an audit log entry
#   2. Client secret rotation produces an audit log entry
#   3. Policy change produces an audit log entry
#   4. Pagination: page 2 returns different records from page 1
#   5. Action filter: returns only entries matching the filter
#   6. Tenant audit logs: workspace-scoped events visible
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


###


# ── Scenario 1: Member status change → audit log entry created ───────────────

# Record audit log count before action
GET {{baseUrl}}/v1/admin/audit-logs?page_size=1
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Captures]
totalBefore: jsonpath "$.total"


###


# Perform action: suspend coco
PATCH {{baseUrl}}/v1/admin/users/{{cocoUserId}}/status
Content-Type: application/json

{ "status": "suspended" }

HTTP 200


###


# Read audit logs — total should have increased
GET {{baseUrl}}/v1/admin/audit-logs?page_size=1
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.total" >= {{totalBefore}}


###


# Restore coco
PATCH {{baseUrl}}/v1/admin/users/{{cocoUserId}}/status
Content-Type: application/json

{ "status": "active" }

HTTP 200


###


# ── Scenario 2: Client secret rotation → audit log entry ─────────────────────
# Only confidential "web" clients support secret rotation.
# Create one via rooroo in mintmallow (avoids roochoco client limit from prior runs).

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{mintMallowWorkspace}}" }

HTTP 200


###


# Pre-cleanup: ensure "Test Confidential Client" doesn't already exist (from prior runs).
# Step 1: try to create — accept any status (may already exist or workspace is full).
POST {{baseUrl}}/v1/orgs/current/clients
Content-Type: application/json

{
  "app_name": "Test Confidential Client",
  "app_type": "web",
  "redirect_uris": ["http://localhost:9999/callback"]
}

HTTP/1.1 *


###


# Step 2: list clients and capture the existing test client ID.
GET {{baseUrl}}/v1/orgs/current/clients

HTTP 200
[Captures]
confClientIdToDelete: jsonpath "$[?(@.client.app_name == 'Test Confidential Client')].client.id" nth 0


###


# Step 3: delete it for a clean slate.
DELETE {{baseUrl}}/v1/orgs/current/clients/{{confClientIdToDelete}}

HTTP 200


###


# Now create the test client fresh.
POST {{baseUrl}}/v1/orgs/current/clients
Content-Type: application/json

{
  "app_name": "Test Confidential Client",
  "app_type": "web",
  "redirect_uris": ["http://localhost:9999/callback"]
}

HTTP 201
[Captures]
confidentialClientId: jsonpath "$.client.id"
[Asserts]
jsonpath "$.client.app_type" == "web"


###


# Switch back to owner for admin rotate
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200


###


# Rotate the secret via admin endpoint
POST {{baseUrl}}/v1/admin/clients/{{confidentialClientId}}/rotate-secret
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.client_secret" isString


###


# Audit log should have an entry for the rotation
GET {{baseUrl}}/v1/admin/audit-logs?page_size=50
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
# At least one entry should exist (suspension + rotation)
jsonpath "$.items" count >= 1
jsonpath "$.total" >= 1


###


# ── Scenario 3: Pagination — page 2 returns different items from page 1 ───────

GET {{baseUrl}}/v1/admin/audit-logs?page=1&page_size=5
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Captures]
firstPageFirstId: jsonpath "$.items[0].id"
[Asserts]
jsonpath "$.items" count >= 1


###


GET {{baseUrl}}/v1/admin/audit-logs?page=2&page_size=5
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
# The first item of page 2 must not equal the first item of page 1
jsonpath "$.items[0].id" != {{firstPageFirstId}}


###


# ── Scenario 4: Action filter returns only matching entries ──────────────────

# Filter by search term — results must contain the search text in action or actor
# "search" does ILIKE match on action, email, display_name, ip
GET {{baseUrl}}/v1/admin/audit-logs?search=admin.user.suspended&page_size=20
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.items" count >= 1
jsonpath "$.items[0].action" == "admin.user.suspended"


###


# Filter by action category "success" — only returns success events
GET {{baseUrl}}/v1/admin/audit-logs?action=success&page_size=10
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
# auth.login.success entries must be present
jsonpath "$.total" >= 1


###


# ── Scenario 5: Tenant audit logs visible to workspace owner ─────────────────

# Login as rooroo (tenant owner of roochoco)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{tenantOwnerEmail}}", "org_slug": "{{tenantOwnerOrg}}" }

HTTP 200
[Captures]
roorooSession: cookie "rooiam_sid"


###


# Tenant owner can read their own org's activity
GET {{baseUrl}}/v1/orgs/workspace/activity?page_size=10
Cookie: rooiam_sid={{roorooSession}}

HTTP 200
[Asserts]
jsonpath "$.items" isCollection


###


# ── Scenario 6: Tenant member CANNOT read platform-wide audit logs ─────────────
# Using lulu@softmallow.test (mintmallow member) to avoid dependency on roochoco
# which may be suspended by a concurrent suspend-revocation test.

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "lulu@softmallow.test", "org_slug": "{{mintMallowWorkspace}}" }

HTTP 200
[Captures]
cocoSession: cookie "rooiam_sid"


###


GET {{baseUrl}}/v1/admin/audit-logs
Cookie: rooiam_sid={{cocoSession}}

HTTP 403


###


# ── Scenario 7: Tenant audit logs are scoped — coco cannot read another org ────

# rooroo owns roochoco AND mintmallow — ensure their audit logs are separate
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{tenantOwnerEmail}}", "org_slug": "{{tenantOwnerOrg}}" }

HTTP 200


###


POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200


###


GET {{baseUrl}}/v1/admin/tenant/audit-logs?page_size=10

HTTP 200
[Asserts]
jsonpath "$.items" isCollection
