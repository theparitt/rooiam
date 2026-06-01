# Phase — Linked Accounts & Provider Management
# Tests GET linked-accounts shape, link start, and unlink safety.


# Setup: log in as coco (roochoco member)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "praline@roochoco.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
cocoSession: cookie "rooiam_sid"


###


# 1. Get linked accounts — verify response shape
GET {{baseUrl}}/v1/identity/me/linked-accounts
Cookie: rooiam_sid={{cocoSession}}

HTTP 200
[Asserts]
jsonpath "$.magic_link" exists
jsonpath "$.magic_link.enabled" == true
jsonpath "$.totp_enabled" == false
jsonpath "$.passkeys" >= 0
jsonpath "$.providers" isCollection


###


# 2. Start Google OAuth link flow → 200 (returns redirect_url) or 4xx
POST {{baseUrl}}/v1/identity/me/linked-accounts/google/start
Cookie: rooiam_sid={{cocoSession}}
Content-Type: application/json

{}

HTTP/1.1 *
[Asserts]
status >= 200
status < 500


###


# 3. Attempt to unlink Google (coco never linked Google → 4xx)
DELETE {{baseUrl}}/v1/identity/me/linked-accounts/google
Cookie: rooiam_sid={{cocoSession}}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# 4. Attempt to unlink Microsoft (not linked → 4xx)
DELETE {{baseUrl}}/v1/identity/me/linked-accounts/microsoft
Cookie: rooiam_sid={{cocoSession}}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500
