# =============================================================================
# Session Security Tests
# Verify logout invalidation, revoke-all semantics, and session isolation.
# =============================================================================


# ── Scenario 1–4: Logout invalidates session ──────────────────────────────────


# Login as coco

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{rooChocoMemberEmail}}", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
sessionCookie: cookie "rooiam_sid"
[Asserts]
header "Set-Cookie" contains "rooiam_sid"


###


# Confirm session is valid before logout

GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200
[Asserts]
jsonpath "$.email" == "{{rooChocoMemberEmail}}"


###


# Logout with the valid session

POST {{baseUrl}}/v1/auth/logout
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200


###


# Reuse the now-revoked session — must be rejected
# Expects: 401

GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{sessionCookie}}

HTTP 401


###


# ── Scenario 5–8: revoke-all keeps the current session alive ─────────────────


# Login as coco again to get a fresh session

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{rooChocoMemberEmail}}", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
newSession: cookie "rooiam_sid"
[Asserts]
header "Set-Cookie" contains "rooiam_sid"


###


# Create a second concurrent session for coco

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{rooChocoMemberEmail}}", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
anotherSession: cookie "rooiam_sid"


###


# From newSession — list sessions (should show at least 2)

GET {{baseUrl}}/v1/identity/me/sessions
Cookie: rooiam_sid={{newSession}}

HTTP 200
[Asserts]
jsonpath "$" count >= 2


###


# Revoke all OTHER sessions (keeps newSession alive)

POST {{baseUrl}}/v1/identity/me/sessions/revoke-all
Cookie: rooiam_sid={{newSession}}

HTTP 200
[Asserts]
jsonpath "$.ok" == true


###


# newSession (the calling session) is still valid after revoke-all
# Expects: 200

GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{newSession}}

HTTP 200
[Asserts]
jsonpath "$.email" == "{{rooChocoMemberEmail}}"


###


# ── Scenario 9–12: Cross-user session isolation ───────────────────────────────
# Strategy: login as owner first, assert owner identity while jar = ownerSession,
# then login as coco — jar switches to cocoSession — assert coco identity.
# This avoids the hurl cookie-jar-wins-over-explicit-header limitation.


# Login as platform owner (jar is now ownerSession)

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"
[Asserts]
header "Set-Cookie" contains "rooiam_sid"


###


# Scenario 11: owner tries to get a platform user by a fake UUID
# Jar = ownerSession at this point.
# Expects: 4xx

GET {{baseUrl}}/v1/admin/users/00000000-0000-0000-0000-000000000000

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# Scenario 12: /identity/me while jar = ownerSession returns owner's own data.
# Proves the session is bound to the owner, not to any other user.
# Expects: 200, email == owner's email

GET {{baseUrl}}/v1/identity/me

HTTP 200
[Asserts]
jsonpath "$.email" == "{{platformOwnerEmail}}"
jsonpath "$.email" != "{{rooChocoMemberEmail}}"
jsonpath "$.is_platform_owner" == true


###


# Login as coco (jar now switches to cocoSession)

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{rooChocoMemberEmail}}", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
cocoSession: cookie "rooiam_sid"


###


# Scenario 13: /identity/me while jar = cocoSession returns only coco's identity.
# Proves sessions are strictly isolated — coco cannot see owner's identity.

GET {{baseUrl}}/v1/identity/me

HTTP 200
[Asserts]
jsonpath "$.email" == "{{rooChocoMemberEmail}}"
jsonpath "$.email" != "{{platformOwnerEmail}}"
jsonpath "$.is_platform_owner" == false


###


# Scenario 14: coco cannot revoke an arbitrary session by ID.
# We use a nil UUID that is unlikely to exist — must get 4xx, not 500.

DELETE {{baseUrl}}/v1/identity/me/sessions/00000000-0000-0000-0000-000000000000

HTTP/1.1 *
[Asserts]
status >= 400
status < 500
