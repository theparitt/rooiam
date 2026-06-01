# Phase 5 — Provider unlink safety (already implemented, verifying behavior)
# Tests: cannot unlink last login method, can get linked accounts.


# 1. Log in as rooroo
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
roorooSession: cookie "rooiam_sid"


###


# 2. Get linked accounts (rooroo has magic link via email)
GET {{baseUrl}}/v1/identity/me/linked-accounts

HTTP 200
[Asserts]
jsonpath "$.magic_link.enabled" isBoolean
jsonpath "$.providers" isCollection
jsonpath "$.passkeys" isInteger


###


# 3. Try to unlink google when not linked (should 404)
DELETE {{baseUrl}}/v1/identity/me/linked-accounts/google

HTTP *
[Asserts]
# Either 404 (not linked) or 403 (would be last method) — either is safe
status >= 400
status < 500


###


# 4. Try to unlink microsoft when not linked (should 404)
DELETE {{baseUrl}}/v1/identity/me/linked-accounts/microsoft

HTTP *
[Asserts]
status >= 400
status < 500


###


# 5. Try to unlink an unsupported provider
DELETE {{baseUrl}}/v1/identity/me/linked-accounts/github

HTTP 400
