# =============================================================================
# Last Workspace Owner Guard Tests
#
# The server must prevent a workspace from becoming ownerless.
# Rule: if a member holds the owner role AND is the only owner, any role
# change on that member must be rejected with a 4xx error.
#
# Using mintmallow workspace where rooroo@sweetfactory.test is the SOLE owner.
# roochoco has accumulated extra owners from previous test runs and cannot
# be relied upon to have exactly one owner.
#
# Scenarios:
#   1. Sole owner tries to demote themselves       → must be rejected (4xx)
#   2. Member with no manage-permission tries role change → rejected (403)
#   3. Owner tries to assign "owner" role to another member → rejected (4xx)
#   4. Owner changes a member's role to "admin"    → succeeds (happy path)
#   5. Cleanup: restore lulu back to "member"
# =============================================================================


# ── Setup: login as rooroo (sole owner of mintmallow) ────────────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{mintMallowWorkspace}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"


###


# Capture rooroo's own member record ID and lulu's member ID from the members list.

GET {{baseUrl}}/v1/orgs/current/members

HTTP 200
[Captures]
ownerMemberId: jsonpath "$[?(@.email == 'rooroo@sweetfactory.test')].id" nth 0
luluMemberId:  jsonpath "$[?(@.email == 'lulu@softmallow.test')].id" nth 0
[Asserts]
jsonpath "$" count >= 2


###


# ── Scenario 1: Sole owner tries to demote themselves ────────────────────────
# rooroo is the ONLY owner of mintmallow.
# Attempting to change their role to "admin" must be rejected.
# Expects: 4xx (last-owner guard)

PATCH {{baseUrl}}/v1/orgs/current/members/{{ownerMemberId}}/role
Content-Type: application/json

{ "role_code": "admin" }

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# ── Scenario 2: Regular member cannot change any member's role ───────────────
# lulu has only members:read — no org:update or roles:manage.
# Even if the guard did not exist, permission check fires first.
# Expects: 403

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "lulu@softmallow.test", "org_slug": "{{mintMallowWorkspace}}" }

HTTP 200


###


PATCH {{baseUrl}}/v1/orgs/current/members/{{ownerMemberId}}/role
Content-Type: application/json

{ "role_code": "member" }

HTTP/1.1 *
[Asserts]
status >= 403
status < 500


###


# ── Scenario 3: Owner tries to assign "owner" role to another member ─────────
# "owner" is not in the allowed_roles list in the service layer.
# Expects: 4xx (validation error)

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{mintMallowWorkspace}}" }

HTTP 200


###


PATCH {{baseUrl}}/v1/orgs/current/members/{{luluMemberId}}/role
Content-Type: application/json

{ "role_code": "owner" }

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# ── Scenario 4: Owner changes lulu's role to "admin" (happy path) ────────────
# This is a normal role change — no owner involved, no guard triggered.
# Expects: 200

PATCH {{baseUrl}}/v1/orgs/current/members/{{luluMemberId}}/role
Content-Type: application/json

{ "role_code": "admin" }

HTTP 200


###


# ── Scenario 5: Cleanup — restore lulu back to "member" ─────────────────────

PATCH {{baseUrl}}/v1/orgs/current/members/{{luluMemberId}}/role
Content-Type: application/json

{ "role_code": "member" }

HTTP 200
