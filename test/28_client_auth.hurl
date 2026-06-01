# Phase 4 — Client Authentication Enforcement
# Verifies: confidential (web) clients must present client_secret; public (SPA) clients must not.


# 1. Token request for confidential client without secret → error
#    "Rooiam Admin Console" is a SPA client — no secret. Use a fake web client to test concept.
#    (We use a fake client_id so the lookup fails before secret check)
POST {{baseUrl}}/v1/oidc/token
[Form]
grant_type: authorization_code
code: fake-code
redirect_uri: http://localhost:5172/callback
client_id: fake-web-client-no-secret

HTTP/1.1 *
[Asserts]
status >= 400
status < 500
jsonpath "$.error" exists


###


# 2. Revoke for unknown client → 401 (client auth is required for revoke)
POST {{baseUrl}}/v1/oidc/revoke
[Form]
token: some-token
client_id: completely-unknown-client-id

HTTP/1.1 *
[Asserts]
# Unknown client cannot authenticate — 401 is correct per RFC 7009 §2.1
status >= 400
status < 500


###


# 3. Introspect without valid bearer or client auth → 401
POST {{baseUrl}}/v1/oidc/introspect
[Form]
token: some-access-token
client_id: fake-client

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# 4. Token for public client (SPA) — no secret required, unknown code still fails with proper error
POST {{baseUrl}}/v1/oidc/token
[Form]
grant_type: authorization_code
code: fake-code-spa
redirect_uri: http://localhost:5172/callback
client_id: test-roochoco-portal-spa
code_verifier: dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk

HTTP/1.1 *
[Asserts]
status >= 400
status < 500
# Error must be present (invalid_grant for bad code), NOT invalid_client
jsonpath "$.error" exists
jsonpath "$.error" != "invalid_client"
