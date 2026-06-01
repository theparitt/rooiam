# =============================================================================
# Privilege Escalation Tests
# Verify that lower-privileged users cannot access higher-privileged endpoints.
# =============================================================================


# ── Setup: Login as coco (roochoco member — members:read only) ────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{rooChocoMemberEmail}}", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
cocoSession: cookie "rooiam_sid"
[Asserts]
header "Set-Cookie" contains "rooiam_sid"


###


# Confirm coco has no elevated privileges

GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{cocoSession}}

HTTP 200
[Asserts]
jsonpath "$.email" == "{{rooChocoMemberEmail}}"
jsonpath "$.is_platform_owner" == false
jsonpath "$.is_superuser" == false


###


# Scenario 1: coco tries to update auth-policy (needs auth_policy:manage)
# Expects: 403

PATCH {{baseUrl}}/v1/orgs/current/auth-policy
Cookie: rooiam_sid={{cocoSession}}
Content-Type: application/json

{
  "allow_magic_link": true,
  "allow_google": false,
  "allow_microsoft": false,
  "allow_passkey": false,
  "require_mfa": false,
  "require_mfa_for_admins": false,
  "allowed_email_domains": "",
  "max_session_age_hours": null,
  "max_concurrent_sessions": null
}

HTTP 403


###


# Scenario 2: coco tries to access platform admin user list (needs is_superuser)
# Expects: 403

GET {{baseUrl}}/v1/admin/users
Cookie: rooiam_sid={{cocoSession}}

HTTP 403


###


# Scenario 3: coco tries to invite a new member (needs members:invite)
# Expects: 403

POST {{baseUrl}}/v1/orgs/current/invites
Cookie: rooiam_sid={{cocoSession}}
Content-Type: application/json

{ "email": "hacker@evil.com" }

HTTP 403


###


# Scenario 4: coco tries to create a custom role (needs roles:manage)
# Expects: 403

POST {{baseUrl}}/v1/orgs/current/roles
Cookie: rooiam_sid={{cocoSession}}
Content-Type: application/json

{ "name": "Evil", "code": "evil", "permissions": [] }

HTTP 403


###


# Scenario 5: coco tries to delete a system role by fixed UUID
# The system "owner" role exists but coco lacks roles:manage — expects 403 or 404

DELETE {{baseUrl}}/v1/orgs/current/roles/00000000-0000-0000-0000-000000000001
Cookie: rooiam_sid={{cocoSession}}

HTTP/1.1 *
[Asserts]
status >= 403
status < 500


###


# Scenario 6: coco tries to list all admin organizations
# Expects: 403

GET {{baseUrl}}/v1/admin/organizations
Cookie: rooiam_sid={{cocoSession}}

HTTP 403


###


# Scenario 7: coco tries to read workspace governance (superuser-only)
# Expects: 403

GET {{baseUrl}}/v1/admin/workspace-governance
Cookie: rooiam_sid={{cocoSession}}

HTTP 403


###


# ── Setup: Login as admin (is_superuser=true, is_platform_owner=false) ─────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformAdminEmail}}", "org_slug": "{{platformAdminOrg}}" }

HTTP 200
[Captures]
adminSession: cookie "rooiam_sid"
[Asserts]
header "Set-Cookie" contains "rooiam_sid"


###


# Verify admin identity

GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{adminSession}}

HTTP 200
[Asserts]
jsonpath "$.email" == "{{platformAdminEmail}}"
jsonpath "$.is_superuser" == true
jsonpath "$.is_platform_owner" == false


###


# Scenario 8: admin (superuser) CAN list platform users
# Expects: 200

GET {{baseUrl}}/v1/admin/users
Cookie: rooiam_sid={{adminSession}}

HTTP 200
[Asserts]
jsonpath "$.items" count >= 1


###


# Scenario 9: admin (superuser) CAN read workspace governance
# Expects: 200

GET {{baseUrl}}/v1/admin/workspace-governance
Cookie: rooiam_sid={{adminSession}}

HTTP 200


###


# Scenario 10: admin (superuser) CAN update workspace governance
# Expects: 200

PATCH {{baseUrl}}/v1/admin/workspace-governance
Cookie: rooiam_sid={{adminSession}}
Content-Type: application/json

{}

HTTP 200


###


# Scenario 11: admin cannot access setup/config (requires platform_owner — guards are internal)
# POST /v1/test/login only works in demo mode; GET /v1/setup/config requires platform ownership
# Expects: 4xx

GET {{baseUrl}}/v1/setup/config
Cookie: rooiam_sid={{adminSession}}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500
