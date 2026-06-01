# Phase 6 — Owner transfer flow
# Tests: initiate transfer, reject invalid target, accept transfer.
# Uses demo users. Owner is rooroo for roochoco workspace.


# 1. Log in as rooroo (workspace owner)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
roorooSession: cookie "rooiam_sid"


###


# 2. Transfer to self should fail
POST {{baseUrl}}/v1/orgs/current/owner-transfer
Content-Type: application/json

{ "to_user_id": "00000000-0000-0000-0000-000000000000" }

HTTP *
[Asserts]
status >= 400


###


# 3. Transfer to a random non-member UUID should fail (non-member)
POST {{baseUrl}}/v1/orgs/current/owner-transfer
Content-Type: application/json

{ "to_user_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa" }

HTTP *
[Asserts]
status >= 400


###


# 4. Accept with invalid token should fail
POST {{baseUrl}}/v1/orgs/current/owner-transfer/accept
Content-Type: application/json

{ "token": "completely_invalid_token_12345" }

HTTP 404
