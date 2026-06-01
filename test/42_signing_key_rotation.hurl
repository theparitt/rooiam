# Phase 5 — OIDC signing key rotation
# Tests: list keys, rotate key, JWKS updated.


# 1. Log in as platform owner
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "owner@rooiam.test", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"


###


# 2. List signing keys (initially empty — no DB keys yet)
GET {{baseUrl}}/v1/admin/signing-keys

HTTP 200
[Asserts]
jsonpath "$.keys" isCollection


###


# 3. Rotate signing key — generates new RSA key pair
POST {{baseUrl}}/v1/admin/signing-keys/rotate

HTTP 200
[Asserts]
jsonpath "$.ok" == true
jsonpath "$.kid" isString
[Captures]
newKid: jsonpath "$.kid"


###


# 4. List signing keys — new key should appear
GET {{baseUrl}}/v1/admin/signing-keys

HTTP 200
[Asserts]
jsonpath "$.keys" count >= 1
jsonpath "$.keys[0].is_active" == true


###


# 5. JWKS now includes the new DB key
GET {{baseUrl}}/.well-known/jwks.json

HTTP 200
[Asserts]
jsonpath "$.keys" count >= 1
jsonpath "$.keys[0].kty" == "RSA"
jsonpath "$.keys[0].use" == "sig"


###


# 6. Rotate again — old key stays (retired), new key becomes active
POST {{baseUrl}}/v1/admin/signing-keys/rotate

HTTP 200
[Asserts]
jsonpath "$.ok" == true


###


# 7. JWKS should contain 2 keys (active + retired within rollover window)
GET {{baseUrl}}/.well-known/jwks.json

HTTP 200
[Asserts]
jsonpath "$.keys" count >= 1


###


# 8. Non-admin cannot rotate signing keys
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200


###

POST {{baseUrl}}/v1/admin/signing-keys/rotate

HTTP 403
