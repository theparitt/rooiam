# Setup: log in as platform owner
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "owner@rooiam.test", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"


###


# Get platform-wide audit logs (default page)
# Expects: 200 with items and total

GET {{baseUrl}}/v1/admin/audit-logs
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.items" exists
jsonpath "$.total" >= 0


###


# Get audit logs with pagination — page 1, 5 results
# Expects: 200 with at most 5 items

GET {{baseUrl}}/v1/admin/audit-logs?page=1&page_size=5
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.items" exists


###


# Search audit logs for login events
# Expects: 200

GET {{baseUrl}}/v1/admin/audit-logs?search=login
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.items" exists


###


# List platform tenant members (admin staff view)
# Expects: 200 with items

GET {{baseUrl}}/v1/admin/tenant/members
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.items" exists


###


# Get platform tenant audit logs
# Expects: 200 with items

GET {{baseUrl}}/v1/admin/tenant/audit-logs
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.items" exists


###


# Setup: log in as coco (regular member — no admin access)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "praline@roochoco.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
cocoSession: cookie "rooiam_sid"


###


# Attempt to access platform audit logs as unprivileged member
# Expects: 403

GET {{baseUrl}}/v1/admin/audit-logs
Cookie: rooiam_sid={{cocoSession}}

HTTP 403
