# Phase — Admin Org Detail & Per-Org Session Policy
# Tests admin org detail view and per-org session policy management.


# Setup: log in as platform owner
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "owner@rooiam.test", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"


###


# 1. Search for roochoco workspace — capture its ID
GET {{baseUrl}}/v1/admin/organizations?search=roochoco
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Captures]
orgId: jsonpath "$.items[0].id"
[Asserts]
jsonpath "$.items" count >= 1
jsonpath "$.items[0].id" isString
jsonpath "$.items[0].slug" isString


###


# 2. Get full detail for roochoco org
GET {{baseUrl}}/v1/admin/organizations/{{orgId}}
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.organization.name" isString
jsonpath "$.organization.status" isString


###


# 3. Get session policy for roochoco
GET {{baseUrl}}/v1/admin/organizations/{{orgId}}/session-policy
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.platform_session_duration_days" exists


###


# 4. Set custom session policy (session_duration_days override)
PATCH {{baseUrl}}/v1/admin/organizations/{{orgId}}/session-policy
Cookie: rooiam_sid={{ownerSession}}
Content-Type: application/json

{
  "session_duration_days": 1
}

HTTP 200
[Asserts]
jsonpath "$.session_duration_days" == 1


###


# 5. Verify saved value persists
GET {{baseUrl}}/v1/admin/organizations/{{orgId}}/session-policy
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.session_duration_days" == 1


###


# 6. Cleanup: reset to null (remove override)
PATCH {{baseUrl}}/v1/admin/organizations/{{orgId}}/session-policy
Cookie: rooiam_sid={{ownerSession}}
Content-Type: application/json

{
  "session_duration_days": 7
}

HTTP 200
[Asserts]
jsonpath "$.session_duration_days" == 7


###


# 7. Nonexistent org → 404
GET {{baseUrl}}/v1/admin/organizations/00000000-0000-0000-0000-000000000000
Cookie: rooiam_sid={{ownerSession}}

HTTP 404
