# Phase 6 — Policy snapshots
# Tests: update policy (auto-snapshots), list snapshots, restore snapshot.


# 1. Log in as rooroo (workspace admin)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
roorooSession: cookie "rooiam_sid"


###


# 2. Update auth policy (this should auto-save a snapshot of the previous state)
PATCH {{baseUrl}}/v1/orgs/current/auth-policy
Content-Type: application/json

{
  "allow_magic_link": true,
  "allow_google": true,
  "allow_microsoft": true,
  "allow_passkey": true,
  "require_mfa": false,
  "require_mfa_for_admins": false,
  "allowed_email_domains": "",
  "max_session_age_hours": null,
  "max_concurrent_sessions": null
}

HTTP 200


###


# 3. List policy snapshots — should have at least one
GET {{baseUrl}}/v1/orgs/current/policy-snapshots

HTTP 200
[Asserts]
jsonpath "$.snapshots" isCollection
[Captures]
snapshotCount: jsonpath "$.snapshots" count


###


# 4. Update policy again (creates another snapshot)
PATCH {{baseUrl}}/v1/orgs/current/auth-policy
Content-Type: application/json

{
  "allow_magic_link": true,
  "allow_google": false,
  "allow_microsoft": true,
  "allow_passkey": true,
  "require_mfa": false,
  "require_mfa_for_admins": false,
  "allowed_email_domains": ""
}

HTTP 200


###


# 5. Snapshots list should grow
GET {{baseUrl}}/v1/orgs/current/policy-snapshots

HTTP 200
[Asserts]
jsonpath "$.snapshots" isCollection
[Captures]
firstSnapshotId: jsonpath "$.snapshots[0].id"


###


# 6. Restore the most recent snapshot
POST {{baseUrl}}/v1/orgs/current/policy-snapshots/{{firstSnapshotId}}/restore

HTTP 200
[Asserts]
jsonpath "$.ok" == true


###


# 7. Try to restore a non-existent snapshot (should 404)
POST {{baseUrl}}/v1/orgs/current/policy-snapshots/99999999/restore

HTTP 404
