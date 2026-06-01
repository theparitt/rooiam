# =============================================================================
# Demo Login — all 5 roles + edge cases
# Requires: ROOIAM_ENABLE_DEMO_SEED=true
# =============================================================================


# ── Role 1: Platform Owner ────────────────────────────────────────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"
[Asserts]
header "Set-Cookie" contains "rooiam_sid"


###


# Verify platform owner — is_platform_owner=true, is_superuser=true

GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.email" == "{{platformOwnerEmail}}"
jsonpath "$.is_platform_owner" == true
jsonpath "$.is_superuser" == true


###


# ── Role 2: Platform Admin ────────────────────────────────────────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformAdminEmail}}", "org_slug": "{{platformAdminOrg}}" }

HTTP 200
[Captures]
adminSession: cookie "rooiam_sid"
[Asserts]
header "Set-Cookie" contains "rooiam_sid"


###


# Verify platform admin — superuser but NOT platform owner

GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{adminSession}}

HTTP 200
[Asserts]
jsonpath "$.email" == "{{platformAdminEmail}}"
jsonpath "$.is_platform_owner" == false
jsonpath "$.is_superuser" == true


###


# ── Role 3: Tenant Owner (sweetfactory) ──────────────────────────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{tenantOwnerEmail}}", "org_slug": "{{tenantOwnerOrg}}" }

HTTP 200
[Captures]
tenantOwnerSession: cookie "rooiam_sid"
[Asserts]
header "Set-Cookie" contains "rooiam_sid"


###


# Verify tenant owner — no platform flags

GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{tenantOwnerSession}}

HTTP 200
[Asserts]
jsonpath "$.email" == "{{tenantOwnerEmail}}"
jsonpath "$.is_platform_owner" == false
jsonpath "$.is_superuser" == false


###


# ── Role 4: Workspace Member — roochoco ──────────────────────────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{rooChocoMemberEmail}}", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
rooChocoSession: cookie "rooiam_sid"
[Asserts]
header "Set-Cookie" contains "rooiam_sid"


###


# Verify roochoco member identity

GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{rooChocoSession}}

HTTP 200
[Asserts]
jsonpath "$.email" == "{{rooChocoMemberEmail}}"
jsonpath "$.is_platform_owner" == false
jsonpath "$.is_superuser" == false


###


# roochoco member can see their org

GET {{baseUrl}}/v1/orgs
Cookie: rooiam_sid={{rooChocoSession}}

HTTP 200
[Asserts]
jsonpath "$" count >= 1
jsonpath "$[0].slug" == "{{rooChocoWorkspace}}"


###


# ── Role 5: Workspace Member — mintmallow (org has require_mfa=true) ─────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{mintMallowMemberEmail}}", "org_slug": "{{mintMallowWorkspace}}" }

HTTP 200
[Captures]
mintMallowSession: cookie "rooiam_sid"
[Asserts]
header "Set-Cookie" contains "rooiam_sid"


###


# Verify mintmallow member identity

GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{mintMallowSession}}

HTTP 200
[Asserts]
jsonpath "$.email" == "{{mintMallowMemberEmail}}"
jsonpath "$.is_platform_owner" == false
jsonpath "$.is_superuser" == false


###


# mintmallow org has require_mfa=true

GET {{baseUrl}}/v1/orgs
Cookie: rooiam_sid={{mintMallowSession}}

HTTP 200
[Asserts]
jsonpath "$[0].require_mfa" == true


###


# =============================================================================
# Edge cases
# =============================================================================


# Unknown email — not a seeded account

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "hacker@evil.com" }

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# Empty email

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "" }

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# Missing email field

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# Wrong content-type — plain text body instead of JSON
# Expects: 400 or 415

POST {{baseUrl}}/v1/test/login
Content-Type: text/plain
```
hacker
```

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# Workspace member cannot access platform admin endpoint

GET {{baseUrl}}/v1/admin/users
Cookie: rooiam_sid={{rooChocoSession}}

HTTP/1.1 *
[Asserts]
status >= 403
status < 500


###


# Platform admin cannot access platform-owner-only settings

GET {{baseUrl}}/v1/setup/config
Cookie: rooiam_sid={{adminSession}}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500
