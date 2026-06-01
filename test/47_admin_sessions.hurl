# Phase 6 — Active sessions by workspace (platform admin view)
# Tests: platform owner can list all active sessions; non-admin cannot.


# 1. Log in as platform owner
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "owner@rooiam.test", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"


###


# 2. List all active sessions (platform admin view)
GET {{baseUrl}}/v1/admin/sessions

HTTP 200
[Asserts]
jsonpath "$.items" isCollection
jsonpath "$.total" isInteger
jsonpath "$.page" isInteger
jsonpath "$.page_size" isInteger


###


# 3. Search sessions by email
GET {{baseUrl}}/v1/admin/sessions?search=rooroo

HTTP 200
[Asserts]
jsonpath "$.items" isCollection


###


# 4. Non-admin cannot view all sessions
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200


###

GET {{baseUrl}}/v1/admin/sessions

HTTP 403
