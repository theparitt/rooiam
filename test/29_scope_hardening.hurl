# Phase 4 — Scope Hardening
# Verifies: discovery lists supported scopes, unknown scopes are handled, userinfo requires auth.


# 1. Discovery lists scopes_supported
GET {{baseUrl}}/.well-known/openid-configuration

HTTP 200
[Asserts]
jsonpath "$.scopes_supported" isCollection


###


# 2. Userinfo endpoint without auth → 401
GET {{baseUrl}}/v1/oidc/userinfo

HTTP/1.1 *
[Asserts]
status == 401


###


# 3. Userinfo with invalid bearer token → 401
GET {{baseUrl}}/v1/oidc/userinfo
Authorization: Bearer totally-invalid-jwt-token

HTTP/1.1 *
[Asserts]
status == 401


###


# 4. Token with unknown scope — server should either strip or return error (not 500)
POST {{baseUrl}}/v1/oidc/token
[Form]
grant_type: authorization_code
code: fake-code-scope
redirect_uri: http://localhost:5172/callback
client_id: test-roochoco-portal-spa
code_verifier: dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
scope: openid profile email totally_unknown_scope_xyz

HTTP/1.1 *
[Asserts]
# Must not 500 — either 400 (invalid_scope) or the code lookup fails gracefully
status >= 400
status < 500
jsonpath "$.error" exists


###


# 5. Introspect a random string token → returns { active: false } or 401
POST {{baseUrl}}/v1/oidc/introspect
[Form]
token: not-a-valid-access-token-at-all
client_id: test-roochoco-portal-spa

HTTP/1.1 *
[Asserts]
status >= 200
status < 500
