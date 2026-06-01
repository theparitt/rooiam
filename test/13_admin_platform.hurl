# Setup: log in as platform owner
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "owner@rooiam.test", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"


###


# List all platform users
# Expects: 200 with users array

GET {{baseUrl}}/v1/admin/users
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.items" count >= 1
jsonpath "$.items[0].id" isString
jsonpath "$.items[0].email" isString


###


# List all workspaces
# Expects: 200 with at least roochoco and mintmallow

GET {{baseUrl}}/v1/admin/organizations
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.items" count >= 2
jsonpath "$.items[0].slug" isString


###


# Get workspace governance settings
# Expects: 200

GET {{baseUrl}}/v1/admin/workspace-governance
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
