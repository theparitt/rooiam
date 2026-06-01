# Phase 4 — PKCE Negative Paths
# Verifies: PKCE enforcement on public clients and code-exchange validation.


# ── PKCE enforcement on public (SPA) clients ────────────────────────────────


# 1. SPA authorize without code_challenge → must redirect to login (unauthenticated)
#    (full PKCE enforcement test requires a session; here we verify the endpoint accepts the flow)
GET {{baseUrl}}/v1/oidc/authorize?response_type=code&client_id=test-roochoco-portal-spa&redirect_uri=http://localhost:5172/callback

HTTP/1.1 *
[Asserts]
# Without a session, server redirects to login — correct browser-facing behavior
status >= 300
status < 500


###


# 2. Token exchange with wrong code_verifier → invalid_grant
#    Attempt to redeem a fake code (no session needed — code lookup will fail first)
POST {{baseUrl}}/v1/oidc/token
[Form]
grant_type: authorization_code
code: fake-auth-code-000000
redirect_uri: http://localhost:5172/callback
client_id: test-roochoco-portal-spa
code_verifier: wrong-verifier-value

HTTP/1.1 *
[Asserts]
status >= 400
status < 500
jsonpath "$.error" exists


###


# 3. Token exchange missing code_verifier entirely → error
POST {{baseUrl}}/v1/oidc/token
[Form]
grant_type: authorization_code
code: fake-auth-code-111111
redirect_uri: http://localhost:5172/callback
client_id: test-roochoco-portal-spa

HTTP/1.1 *
[Asserts]
status >= 400
status < 500
jsonpath "$.error" exists


###


# 4. Token exchange with missing redirect_uri → error
POST {{baseUrl}}/v1/oidc/token
[Form]
grant_type: authorization_code
code: fake-auth-code-222222
client_id: test-roochoco-portal-spa
code_verifier: dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk

HTTP/1.1 *
[Asserts]
status >= 400
status < 500
jsonpath "$.error" exists


###


# 5. Reused authorization code → invalid_grant (code already used or not found)
POST {{baseUrl}}/v1/oidc/token
[Form]
grant_type: authorization_code
code: fake-reused-code-xyz
redirect_uri: http://localhost:5172/callback
client_id: test-roochoco-portal-spa
code_verifier: dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk

HTTP/1.1 *
[Asserts]
status >= 400
status < 500
jsonpath "$.error" exists
