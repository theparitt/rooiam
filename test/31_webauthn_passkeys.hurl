# Setup: log in as coco (roochoco member)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "praline@roochoco.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
cocoSession: cookie "rooiam_sid"


###


# List passkeys for current user
# Expects: 200 with a keys or passkeys collection

GET {{baseUrl}}/v1/webauthn/passkeys
Cookie: rooiam_sid={{cocoSession}}

HTTP 200
[Asserts]
jsonpath "$" exists


###


# Start passkey registration (challenge)
# Expects: 200 or 4xx (registration challenge or error if RP not configured — must not 500)

POST {{baseUrl}}/v1/webauthn/register/start
Cookie: rooiam_sid={{cocoSession}}
Content-Type: application/json

{}

HTTP/1.1 *
[Asserts]
status >= 200
status < 500


###


# Start passkey login (assertion challenge) — unauthenticated flow
# Expects: 200 or 4xx (must not 500)

POST {{baseUrl}}/v1/webauthn/login/start
Content-Type: application/json

{ "email": "praline@roochoco.test" }

HTTP/1.1 *
[Asserts]
status >= 200
status < 500


###


# Report passkey login failure (e.g. user cancelled)
# Expects: 200 or 4xx (must not 500)

POST {{baseUrl}}/v1/webauthn/login/report-failure
Content-Type: application/json

{ "email": "praline@roochoco.test", "reason": "test" }

HTTP/1.1 *
[Asserts]
status >= 200
status < 500
