# Phase 6 — Effective policy view
# Tests: GET effective-policy returns all policy dimensions.


# 1. Log in as rooroo (workspace admin)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
roorooSession: cookie "rooiam_sid"


###


# 2. Get effective policy — should include auth_policy, workspace_status, ip_policy, client_policy
GET {{baseUrl}}/v1/orgs/current/effective-policy

HTTP 200
[Asserts]
jsonpath "$.auth_policy" exists
jsonpath "$.auth_policy.allow_magic_link" isBoolean
jsonpath "$.auth_policy.require_mfa" isBoolean
jsonpath "$.workspace_status.status" isString
jsonpath "$.workspace_status.platform_locked" isBoolean
