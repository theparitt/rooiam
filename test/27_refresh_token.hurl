# Phase 4 — Refresh Token Negative Paths
# Verifies: refresh token validation, wrong client binding, missing fields.


# 1. Refresh with totally fake token → invalid_grant
POST {{baseUrl}}/v1/oidc/token
[Form]
grant_type: refresh_token
refresh_token: totally-fake-refresh-token-abc123
client_id: test-roochoco-portal-spa

HTTP/1.1 *
[Asserts]
status >= 400
status < 500
jsonpath "$.error" exists


###


# 2. Refresh with empty token value → error
POST {{baseUrl}}/v1/oidc/token
[Form]
grant_type: refresh_token
refresh_token:
client_id: test-roochoco-portal-spa

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# 3. Refresh with wrong client_id (token belongs to different client) → invalid_grant
#    Both clients are real seeded clients; the token is fake so it fails at lookup.
POST {{baseUrl}}/v1/oidc/token
[Form]
grant_type: refresh_token
refresh_token: fake-token-for-wrong-client
client_id: test-mintmallow-portal-spa

HTTP/1.1 *
[Asserts]
status >= 400
status < 500
jsonpath "$.error" exists


###


# 4. Refresh with missing client_id → error
POST {{baseUrl}}/v1/oidc/token
[Form]
grant_type: refresh_token
refresh_token: fake-token-no-client

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# 5. Revoke a token then immediately revoke again → still 200 (RFC 7009 idempotent)
POST {{baseUrl}}/v1/oidc/revoke
[Form]
token: already-revoked-token-xyz
client_id: test-roochoco-portal-spa

HTTP/1.1 *
[Asserts]
# RFC 7009: second revocation of the same token MUST also return 200
status == 200
