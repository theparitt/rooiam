# Setup: log in as platform owner
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "owner@rooiam.test", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"


###


# List all platform OAuth clients
# Expects: 200 with items collection

GET {{baseUrl}}/v1/admin/clients
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.items" exists


###


# Search for roochoco client to capture its ID
# Expects: 200 with at least one match

GET {{baseUrl}}/v1/admin/clients?search=roochoco
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Captures]
clientId: jsonpath "$.items[0].id"
[Asserts]
jsonpath "$.items" count >= 1
jsonpath "$.items[0].id" isString


###


# Suspend the roochoco client
# Expects: 200

PATCH {{baseUrl}}/v1/admin/clients/{{clientId}}/status
Cookie: rooiam_sid={{ownerSession}}
Content-Type: application/json

{ "status": "suspended" }

HTTP 200


###


# Restore the roochoco client to active
# Expects: 200

PATCH {{baseUrl}}/v1/admin/clients/{{clientId}}/status
Cookie: rooiam_sid={{ownerSession}}
Content-Type: application/json

{ "status": "active" }

HTTP 200


###


# Setup: log in as coco (regular member — no platform admin access)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "praline@roochoco.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
cocoSession: cookie "rooiam_sid"


###


# Attempt to list admin clients as unprivileged member
# Expects: 403 (platform staff only)

GET {{baseUrl}}/v1/admin/clients
Cookie: rooiam_sid={{cocoSession}}

HTTP 403
