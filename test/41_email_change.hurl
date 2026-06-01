# Phase 5 — Secure email change flow
# Tests: request email change, reject same email, reject taken email, verify token.


# 1. Log in as rooroo
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
roorooSession: cookie "rooiam_sid"


###


# 2. Request email change to same address (should fail)
POST {{baseUrl}}/v1/identity/me/email-change/request
Content-Type: application/json

{ "new_email": "rooroo@sweetfactory.test" }

HTTP 400
[Asserts]
jsonpath "$.error" exists


###


# 3. Request email change to invalid email (should fail)
POST {{baseUrl}}/v1/identity/me/email-change/request
Content-Type: application/json

{ "new_email": "notanemail" }

HTTP 400


###


# 4. Request email change to valid new address (should succeed — email sent)
POST {{baseUrl}}/v1/identity/me/email-change/request
Content-Type: application/json

{ "new_email": "rooroo-new@sweetfactory.test" }

HTTP 200
[Asserts]
jsonpath "$.ok" == true


###


# 5. Try to verify with a bogus token (should fail with 404)
POST {{baseUrl}}/v1/identity/me/email-change/verify
Content-Type: application/json

{ "token": "AAAAABBBBBCCCCC_this_is_invalid" }

HTTP 404
