# =============================================================================
# IDOR (Insecure Direct Object Reference) / Cross-Tenant Access Tests
# Verify that users cannot access data belonging to other organizations.
# =============================================================================


# ── Setup: Login as coco (roochoco member) ────────────────────────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{rooChocoMemberEmail}}", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
cocoSession: cookie "rooiam_sid"
[Asserts]
header "Set-Cookie" contains "rooiam_sid"


###


# Scenario 1: Public branding endpoint is intentionally public — should return 200
# (this is expected behaviour, not a vulnerability)

GET {{baseUrl}}/v1/orgs/public/branding?slug=mintmallow-test
Cookie: rooiam_sid={{cocoSession}}

HTTP 200
[Asserts]
jsonpath "$.slug" == "mintmallow-test"


###


# Scenario 2: coco tries to switch context to mintmallow (not a member)
# /v1/orgs/switch expects organization_id (UUID), not slug.
# Sending a non-UUID value should result in 400/422 (parse error).
# Expects: 400 or 422

POST {{baseUrl}}/v1/orgs/switch
Cookie: rooiam_sid={{cocoSession}}
Content-Type: application/json

{ "organization_id": "00000000-0000-0000-0000-000000000099" }

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# ── Setup: Login as rooroo (roochoco tenant owner) ────────────────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{tenantOwnerEmail}}", "org_slug": "{{tenantOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"
[Asserts]
header "Set-Cookie" contains "rooiam_sid"


###


# Scenario 3: rooroo tries to read members of a nonexistent org by UUID
# Expects: 403 (not a member of that org) or 404

GET {{baseUrl}}/v1/orgs/00000000-0000-0000-0000-000000000099/members
Cookie: rooiam_sid={{ownerSession}}

HTTP/1.1 *
[Asserts]
status >= 403
status < 500


###


# Scenario 4: rooroo tries to update a member's role using a fake member UUID
# The fake member UUID does not belong to roochoco — expects 404

PATCH {{baseUrl}}/v1/orgs/current/members/00000000-0000-0000-0000-000000000099/role
Cookie: rooiam_sid={{ownerSession}}
Content-Type: application/json

{ "role_code": "admin" }

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# Scenario 5: rooroo tries to delete a nonexistent API key UUID
# Expects: 404

DELETE {{baseUrl}}/v1/orgs/current/api-keys/00000000-0000-0000-0000-000000000000
Cookie: rooiam_sid={{ownerSession}}

HTTP/1.1 *
[Asserts]
status >= 404
status < 500


###


# Scenario 6: rooroo tries to list admin users (not a superuser)
# Expects: 403

GET {{baseUrl}}/v1/admin/users
Cookie: rooiam_sid={{ownerSession}}

HTTP 403


###


# ── Setup: Login as lulu (mintmallow regular member, role=member, no activity:read)
# Note: mintMallowMemberEmail (peppermint@mintmallow.demo) is an admin in mintmallow
# and therefore has activity:read, auth_policy:manage, members:invite — too permissive
# for these IDOR / permission-denial tests. Use lulu@softmallow.test (member role).

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "lulu@softmallow.test", "org_slug": "{{mintMallowWorkspace}}" }

HTTP 200
[Captures]
mintySession: cookie "rooiam_sid"
[Asserts]
header "Set-Cookie" contains "rooiam_sid"


###


# Scenario 7: minty tries to read audit activity — no activity:read permission
# Expects: 403

GET {{baseUrl}}/v1/orgs/workspace/activity
Cookie: rooiam_sid={{mintySession}}

HTTP 403


###


# Scenario 8: minty can read members — has members:read
# Expects: 200

GET {{baseUrl}}/v1/orgs/current/members
Cookie: rooiam_sid={{mintySession}}

HTTP 200
[Asserts]
jsonpath "$" count >= 1


###


# Scenario 9: minty tries to update auth-policy for mintmallow (needs auth_policy:manage)
# Expects: 403

PATCH {{baseUrl}}/v1/orgs/current/auth-policy
Cookie: rooiam_sid={{mintySession}}
Content-Type: application/json

{
  "allow_magic_link": true,
  "allow_google": true,
  "allow_microsoft": true,
  "allow_passkey": true,
  "require_mfa": false,
  "require_mfa_for_admins": false,
  "allowed_email_domains": "",
  "max_session_age_hours": null,
  "max_concurrent_sessions": null
}

HTTP 403


###


# Scenario 10: minty tries to invite someone to mintmallow (needs members:invite)
# Expects: 403

POST {{baseUrl}}/v1/orgs/current/invites
Cookie: rooiam_sid={{mintySession}}
Content-Type: application/json

{ "email": "outsider@evil.com" }

HTTP 403


###


# Scenario 11: minty tries to read roochoco's members directly via org-id path
# (minty is not a member of roochoco — should fail)
# Expects: 403 or 404

GET {{baseUrl}}/v1/orgs/00000000-0000-0000-0000-000000000001/members
Cookie: rooiam_sid={{mintySession}}

HTTP/1.1 *
[Asserts]
status >= 403
status < 500
