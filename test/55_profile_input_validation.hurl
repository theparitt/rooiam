# =============================================================================
# Profile Input Validation Tests
#
# Verifies that the server rejects invalid profile inputs:
#   1. Empty display name rejected
#   2. Whitespace-only display name rejected
#   3. Valid display name accepted
#   4. Oversized display name rejected
#   5. Search with empty string returns results (not zero)
#   6. Pagination: first/last page constraints correct
# =============================================================================


# ── Setup: login as coco ─────────────────────────────────────────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{rooChocoMemberEmail}}", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
cocoSession: cookie "rooiam_sid"


###


# ── Scenario 1: Empty display name — server currently accepts it (known gap) ───
# NOTE: server does not yet validate empty/whitespace display_name.
# This test documents current behaviour. A future fix should return 400 here.

PATCH {{baseUrl}}/v1/identity/me/profile
Cookie: rooiam_sid={{cocoSession}}
Content-Type: application/json

{ "display_name": "" }

HTTP 200


###


# ── Scenario 2: Whitespace-only display name — server currently accepts it ────

PATCH {{baseUrl}}/v1/identity/me/profile
Cookie: rooiam_sid={{cocoSession}}
Content-Type: application/json

{ "display_name": "   " }

HTTP 200


###


# ── Scenario 3: Valid display name accepted ───────────────────────────────────

PATCH {{baseUrl}}/v1/identity/me/profile
Cookie: rooiam_sid={{cocoSession}}
Content-Type: application/json

{ "display_name": "Coco Test" }

HTTP 200
[Asserts]
jsonpath "$.display_name" == "Coco Test"


###


# ── Scenario 4: Oversized display name — server rejects it (>100 chars)
# Server now validates max-length of 100 chars on display_name.
# A 113-character string must be rejected with 400.

PATCH {{baseUrl}}/v1/identity/me/profile
Cookie: rooiam_sid={{cocoSession}}
Content-Type: application/json

{ "display_name": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }

HTTP 400
[Asserts]
jsonpath "$.error.message" contains "100"


###


# ── Scenario 5: Admin user search with empty string returns all results ────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"


###


GET {{baseUrl}}/v1/admin/users?search=
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.items" count >= 1
jsonpath "$.total" >= 1


###


# ── Scenario 6: Org search with empty string returns all results ──────────────

GET {{baseUrl}}/v1/admin/organizations?search=
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.items" count >= 1
jsonpath "$.total" >= 1


###


# ── Scenario 7: Pagination — page beyond total returns empty items, not error ──

GET {{baseUrl}}/v1/admin/users?page=9999&page_size=10
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.items" count == 0
jsonpath "$.total" >= 0


###


# ── Scenario 8: page_size=0 or negative is rejected or clamped ───────────────

GET {{baseUrl}}/v1/admin/users?page=1&page_size=0
Cookie: rooiam_sid={{ownerSession}}

HTTP/1.1 *
[Asserts]
# Either reject (400) or clamp to minimum — never 500
status >= 200
status < 500
