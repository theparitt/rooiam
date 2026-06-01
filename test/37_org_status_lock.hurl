# Phase — Workspace Platform Lock
# Tests: platform suspend+lock → tenant cannot re-activate → platform unlock.
# Strategy: owner owns jar for admin work. Rooroo logs in only for tenant tests,
# then owner logs in again for unlock.


# 1. Log in as platform owner
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "owner@rooiam.test", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"


###


# 2. Find roochoco org ID
GET {{baseUrl}}/v1/admin/organizations?search=roochoco

HTTP 200
[Captures]
orgId: jsonpath "$.items[0].id"
[Asserts]
jsonpath "$.items" count >= 1


###


# 3. Platform-lock and suspend roochoco (jar = ownerSession)
PATCH {{baseUrl}}/v1/admin/organizations/{{orgId}}/status
Content-Type: application/json

{ "status": "suspended", "platform_locked": true }

HTTP 200


###


# 4. Verify org is suspended
GET {{baseUrl}}/v1/admin/organizations/{{orgId}}

HTTP 200
[Asserts]
jsonpath "$.organization.status" == "suspended"


###


# 5. Attempt demo login as rooroo while org is suspended
#    Returns 404 (org not found for suspended org) — proves suspension works.
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP/1.1 *
[Asserts]
# 404 = org suspended in demo seed — suspension is effective
status >= 400
status < 500


###


# 6. Platform owner logs back in (jar → owner again) and unlocks
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "owner@rooiam.test", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession2: cookie "rooiam_sid"


###


# 7. Unlock and reactivate roochoco
PATCH {{baseUrl}}/v1/admin/organizations/{{orgId}}/status
Content-Type: application/json

{ "status": "active", "platform_locked": false }

HTTP 200
[Asserts]
jsonpath "$.status" == "active"
jsonpath "$.platform_locked" == false


###


# 8. Verify org is active
GET {{baseUrl}}/v1/admin/organizations/{{orgId}}

HTTP 200
[Asserts]
jsonpath "$.organization.status" == "active"


###


# 9. Rooroo can log in again after unlock
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
roorooSession2: cookie "rooiam_sid"


###


# 10. Rooroo can access portal normally
GET {{baseUrl}}/v1/orgs/current/portal

HTTP 200
[Asserts]
jsonpath "$.current_org.slug" == "roochoco-test"
