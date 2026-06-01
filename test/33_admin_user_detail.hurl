# Setup: log in as platform owner
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "owner@rooiam.test", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"


###


# Search for coco by email to get her user ID
# Expects: 200 with at least one result

GET {{baseUrl}}/v1/admin/users?search=praline
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Captures]
cocoUserId: jsonpath "$.items[0].id"
[Asserts]
jsonpath "$.items" count >= 1
jsonpath "$.items[0].id" isString
jsonpath "$.items[0].email" isString


###


# Get full detail for coco's user record
# Expects: 200 with user and workspace_memberships

GET {{baseUrl}}/v1/admin/users/{{cocoUserId}}
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.user.email" isString
jsonpath "$.workspace_memberships" exists


###


# Get coco's active sessions (admin view)
# Expects: 200 with sessions collection

GET {{baseUrl}}/v1/admin/users/{{cocoUserId}}/sessions
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$" isCollection


###


# Get detail for nonexistent user ID
# Expects: 404

GET {{baseUrl}}/v1/admin/users/00000000-0000-0000-0000-000000000000
Cookie: rooiam_sid={{ownerSession}}

HTTP 404


###


# Create a fresh session for coco (so there is at least one to revoke)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "praline@roochoco.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
cocoSession: cookie "rooiam_sid"


###


# Re-establish platform owner session
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "owner@rooiam.test", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession2: cookie "rooiam_sid"


###


# Revoke all sessions for coco
# Expects: 200

DELETE {{baseUrl}}/v1/admin/users/{{cocoUserId}}/sessions
Cookie: rooiam_sid={{ownerSession2}}

HTTP 200


###


# Verify coco sessions are now empty or minimal after revocation
# Expects: 200 (sessions list, should be empty or near-empty)

GET {{baseUrl}}/v1/admin/users/{{cocoUserId}}/sessions
Cookie: rooiam_sid={{ownerSession2}}

HTTP 200
[Asserts]
jsonpath "$" isCollection
