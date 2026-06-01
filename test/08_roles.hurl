# Setup: log in as rooroo (tenant owner — has roles:manage)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
sessionCookie: cookie "rooiam_sid"


###


# Pre-cleanup: ensure test_viewer_hurl exists then delete it.
# Step 1 — attempt to create the role (succeeds if absent, 400 if already present).
POST {{baseUrl}}/v1/orgs/current/roles
Cookie: rooiam_sid={{sessionCookie}}
Content-Type: application/json

{
  "name": "Test Viewer",
  "code": "test_viewer_hurl",
  "permissions": ["activity:read", "members:read"]
}

HTTP/1.1 *


###


# Step 2 — now the role is guaranteed to exist; capture its ID.
GET {{baseUrl}}/v1/orgs/current/roles
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200
[Captures]
existingTestRoleId: jsonpath "$[?(@.code == 'test_viewer_hurl')].id" nth 0


###


# Step 3 — delete it so the subsequent "Create a custom role" test gets a clean slate.
DELETE {{baseUrl}}/v1/orgs/current/roles/{{existingTestRoleId}}
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200


###


# List all roles (system + custom)
# Expects: 200 with at least the seeded system roles

GET {{baseUrl}}/v1/orgs/current/roles
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200
[Asserts]
jsonpath "$" count >= 3
jsonpath "$[0].code" isString
jsonpath "$[0].is_system" isBoolean


###


# List available permissions
# Expects: 200 with permission codes

GET {{baseUrl}}/v1/orgs/current/roles/permissions
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200
[Asserts]
jsonpath "$" count >= 1
jsonpath "$[0].code" isString


###


# Create a custom role
# Expects: 201 with new role id

POST {{baseUrl}}/v1/orgs/current/roles
Cookie: rooiam_sid={{sessionCookie}}
Content-Type: application/json

{
  "name": "Test Viewer",
  "code": "test_viewer_hurl",
  "permissions": ["activity:read", "members:read"]
}

HTTP 201
[Captures]
newRoleId: jsonpath "$.id"
[Asserts]
jsonpath "$.code" == "test_viewer_hurl"
jsonpath "$.is_system" == false


###


# Delete the custom role just created
# Expects: 200 ok

DELETE {{baseUrl}}/v1/orgs/current/roles/{{newRoleId}}
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200
[Asserts]
jsonpath "$.ok" == true


###


# Try to create role with reserved code
# Expects: 4xx

POST {{baseUrl}}/v1/orgs/current/roles
Cookie: rooiam_sid={{sessionCookie}}
Content-Type: application/json

{
  "name": "Fake Owner",
  "code": "owner",
  "permissions": []
}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500
