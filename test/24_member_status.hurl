# =============================================================================
# Member Status Tests — Suspend and Resume
#
# Tests the full lifecycle of suspending and resuming a member's account via the
# platform admin API, including read-back verification after each change.
#
# Also covers workspace-level membership status (org_member.status) separately
# from the user-level account status (users.status).
#
# Scenarios:
#   1. Suspend a member account       → 200, response status == "suspended"
#   2. Read back via userDetail       → user.status == "suspended"
#   3. Resume the member account      → 200, response status == "active"
#   4. Read back via userDetail       → user.status == "active"
#   5. Suspend self (owner)           → 403 (cannot change own status)
#   6. Suspend platform owner         → blocked (platform owner guard)
#   7. Workspace membership status    → visible in workspace_memberships list
# =============================================================================


# ── Setup: login as platform owner (admin actions require platform staff) ─────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200


###


# Capture coco's user ID from the admin users list

GET {{baseUrl}}/v1/admin/users?search=praline

HTTP 200
[Captures]
cocoUserId: jsonpath "$.items[0].id"
[Asserts]
jsonpath "$.items[0].email" == "{{rooChocoMemberEmail}}"
jsonpath "$.items[0].status" == "active"


###


# ── Scenario 1: Suspend coco ──────────────────────────────────────────────────

PATCH {{baseUrl}}/v1/admin/users/{{cocoUserId}}/status
Content-Type: application/json

{ "status": "suspended" }

HTTP 200
[Asserts]
jsonpath "$.status" == "suspended"
jsonpath "$.email" == "{{rooChocoMemberEmail}}"


###


# ── Scenario 2: Read back — must show suspended ───────────────────────────────

GET {{baseUrl}}/v1/admin/users/{{cocoUserId}}

HTTP 200
[Asserts]
jsonpath "$.user.status" == "suspended"


###


# ── Scenario 3: Resume coco ───────────────────────────────────────────────────

PATCH {{baseUrl}}/v1/admin/users/{{cocoUserId}}/status
Content-Type: application/json

{ "status": "active" }

HTTP 200
[Asserts]
jsonpath "$.status" == "active"
jsonpath "$.email" == "{{rooChocoMemberEmail}}"


###


# ── Scenario 4: Read back — must show active ──────────────────────────────────

GET {{baseUrl}}/v1/admin/users/{{cocoUserId}}

HTTP 200
[Asserts]
jsonpath "$.user.status" == "active"


###


# ── Scenario 5: Owner cannot suspend themselves ───────────────────────────────

# First, get the platform owner's own user ID
GET {{baseUrl}}/v1/identity/me

HTTP 200
[Captures]
ownerUserId: jsonpath "$.id"


###


PATCH {{baseUrl}}/v1/admin/users/{{ownerUserId}}/status
Content-Type: application/json

{ "status": "suspended" }

HTTP/1.1 *
[Asserts]
status >= 403
status < 500


###


# ── Scenario 6: Cannot suspend the is_platform_owner account ─────────────────
# The platform owner (owner@rooiam.demo, is_platform_owner=true) is protected.
# Attempting to suspend them must be rejected.

GET {{baseUrl}}/v1/admin/users?search=owner@rooiam

HTTP 200
[Captures]
platformOwnerUserId: jsonpath "$.items[0].id"


###


PATCH {{baseUrl}}/v1/admin/users/{{platformOwnerUserId}}/status
Content-Type: application/json

{ "status": "suspended" }

HTTP/1.1 *
[Asserts]
status >= 403
status < 500


###


# ── Scenario 7: Workspace membership status visible in userDetail ─────────────
# After coco is active, their workspace membership should show as active too.

GET {{baseUrl}}/v1/admin/users/{{cocoUserId}}

HTTP 200
[Asserts]
jsonpath "$.user.status" == "active"
jsonpath "$.workspace_memberships" count >= 1
jsonpath "$.workspace_memberships[0].membership_status" == "active"
