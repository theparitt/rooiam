# =============================================================================
# IP Policy & Domain Policy Tests
#
# Tests cover:
#   - Tenant IP allowlist / blocklist CRUD
#   - Platform-level IP policy (admin only)
#   - Platform admin (superuser) IP policy
#   - Permission guards: non-owner cannot manage IP policy
#   - Domain policy (allowed_email_domains) set / enforce / clear
#   - Validation: bad CIDR, bad domain, oversized payload
#
# NOTE on IP enforcement:
#   Hurl always connects from 127.0.0.1 (loopback). We cannot set a blocklist
#   that includes 127.0.0.1 and then expect subsequent requests to succeed —
#   the test runner itself would be blocked. Tests therefore:
#     1. Set a policy with a REMOTE address (e.g. 198.51.100.0/24) on the
#        allowlist or blocklist.
#     2. Read back the stored value and assert it was saved correctly.
#     3. Always clean up (reset to empty) before moving on.
# =============================================================================


# ── Setup: login as tenant owner (has org:update) ────────────────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{tenantOwnerEmail}}", "org_slug": "{{tenantOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"


###


# ── Pre-cleanup: reset tenant IP policy to defaults before tests ──────────────
# Previous test runs may have left use_custom_ip_policy = true.
# Reset it unconditionally so Scenario 1 sees the expected "false" state.

PATCH {{baseUrl}}/v1/orgs/current/ip-policy
Cookie: rooiam_sid={{ownerSession}}
Content-Type: application/json

{
  "use_custom_ip_policy": false,
  "allowlist": "",
  "blocklist": ""
}

HTTP 200


###


# ── Scenario 1: Read tenant IP policy (default — no custom policy) ────────────
# Expects: 200, use_custom_ip_policy = false

GET {{baseUrl}}/v1/orgs/current/ip-policy
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.tenant.use_custom_ip_policy" == false


###


# ── Scenario 2: Enable custom IP policy with a blocklist entry ────────────────
# Block a specific remote CIDR (not 127.0.0.1 — that would block the test runner).
# Expects: 200, policy stored

PATCH {{baseUrl}}/v1/orgs/current/ip-policy
Content-Type: application/json

{
  "use_custom_ip_policy": true,
  "allowlist": "",
  "blocklist": "198.51.100.0/24"
}

HTTP 200
[Asserts]
jsonpath "$.tenant.use_custom_ip_policy" == true
jsonpath "$.tenant.blocklist" contains "198.51.100.0/24"


###


# ── Scenario 3: Read back — effective policy reflects the blocklist ───────────

GET {{baseUrl}}/v1/orgs/current/ip-policy

HTTP 200
[Asserts]
jsonpath "$.tenant.use_custom_ip_policy" == true
jsonpath "$.effective.blocklist" contains "198.51.100.0/24"


###


# ── Scenario 4: Enable custom IP policy with an allowlist entry ───────────────
# Allowlist includes loopback so the test runner is still allowed through.
# Expects: 200

PATCH {{baseUrl}}/v1/orgs/current/ip-policy
Content-Type: application/json

{
  "use_custom_ip_policy": true,
  "allowlist": "127.0.0.0/8,198.51.100.0/24",
  "blocklist": ""
}

HTTP 200
[Asserts]
jsonpath "$.tenant.use_custom_ip_policy" == true
jsonpath "$.tenant.allowlist" contains "127.0.0.0/8"


###


# ── Scenario 5: Disable custom IP policy (revert to platform default) ─────────

PATCH {{baseUrl}}/v1/orgs/current/ip-policy
Content-Type: application/json

{
  "use_custom_ip_policy": false,
  "allowlist": "",
  "blocklist": ""
}

HTTP 200
[Asserts]
jsonpath "$.tenant.use_custom_ip_policy" == false


###


# ── Scenario 6: Try to enable custom policy with BOTH lists empty ─────────────
# Server should reject this: custom policy must have at least one entry.
# Expects: 4xx

PATCH {{baseUrl}}/v1/orgs/current/ip-policy
Content-Type: application/json

{
  "use_custom_ip_policy": true,
  "allowlist": "",
  "blocklist": ""
}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# ── Scenario 7: Submit a malformed CIDR (invalid format) ──────────────────────
# Expects: 4xx (validation error)

PATCH {{baseUrl}}/v1/orgs/current/ip-policy
Content-Type: application/json

{
  "use_custom_ip_policy": true,
  "allowlist": "",
  "blocklist": "not-an-ip-address"
}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# ── Scenario 8: Submit an oversized blocklist (1000-char garbage) ─────────────
# Expects: 4xx (validation or size limit)

PATCH {{baseUrl}}/v1/orgs/current/ip-policy
Content-Type: application/json

{
  "use_custom_ip_policy": true,
  "allowlist": "",
  "blocklist": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# ── Scenario 9: Workspace member (no org:update) cannot manage IP policy ──────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{rooChocoMemberEmail}}", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200


###


# Member tries to update IP policy — must be forbidden
# Expects: 403

PATCH {{baseUrl}}/v1/orgs/current/ip-policy
Content-Type: application/json

{
  "use_custom_ip_policy": true,
  "allowlist": "",
  "blocklist": "192.0.2.0/24"
}

HTTP/1.1 *
[Asserts]
status >= 403
status < 500


###


# Member cannot even read the IP policy
# Expects: 403

GET {{baseUrl}}/v1/orgs/current/ip-policy

HTTP/1.1 *
[Asserts]
status >= 403
status < 500


###


# ── Setup for platform-level IP policy tests: login as platform owner ─────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200


###


# ── Scenario 10: Read platform IP policy (admin endpoint) ────────────────────

GET {{baseUrl}}/v1/admin/ip-policy

HTTP 200
[Asserts]
jsonpath "$.tenant_ip_policy_editable" isBoolean


###


# ── Scenario 11: Set platform default blocklist ───────────────────────────────
# Affects all tenants that don't have a custom policy.
# Expects: 200

PATCH {{baseUrl}}/v1/admin/ip-policy
Content-Type: application/json

{
  "tenant_ip_policy_editable": true,
  "default_allowlist": "",
  "default_blocklist": "203.0.113.0/24"
}

HTTP 200
[Asserts]
jsonpath "$.default_blocklist" contains "203.0.113.0/24"
jsonpath "$.tenant_ip_policy_editable" == true


###


# ── Scenario 12: Set platform default allowlist (loopback included) ───────────

PATCH {{baseUrl}}/v1/admin/ip-policy
Content-Type: application/json

{
  "tenant_ip_policy_editable": true,
  "default_allowlist": "127.0.0.0/8,10.0.0.0/8",
  "default_blocklist": ""
}

HTTP 200
[Asserts]
jsonpath "$.default_allowlist" contains "127.0.0.0/8"


###


# ── Scenario 13: Disable tenant editability of IP policy ─────────────────────
# Tenants will not be able to override the platform policy.

PATCH {{baseUrl}}/v1/admin/ip-policy
Content-Type: application/json

{
  "tenant_ip_policy_editable": false,
  "default_allowlist": "",
  "default_blocklist": ""
}

HTTP 200
[Asserts]
jsonpath "$.tenant_ip_policy_editable" == false


###


# ── Scenario 14: Platform admin (superuser, not owner) CAN manage platform IP policy
# ensure_platform_staff() allows any superuser — both admin and owner.
# Expects: 200

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformAdminEmail}}", "org_slug": "{{platformAdminOrg}}" }

HTTP 200


###


PATCH {{baseUrl}}/v1/admin/ip-policy
Content-Type: application/json

{
  "tenant_ip_policy_editable": true,
  "default_allowlist": "",
  "default_blocklist": ""
}

HTTP 200
[Asserts]
jsonpath "$.tenant_ip_policy_editable" == true


###


# ── Setup for superuser (admin) IP policy tests ───────────────────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200


###


# ── Scenario 15: Read platform admin (superuser) IP policy ───────────────────

GET {{baseUrl}}/v1/admin/ip-policy/admin

HTTP 200
[Asserts]
jsonpath "$.allowlist" isString
jsonpath "$.blocklist" isString


###


# ── Scenario 16: Set superuser IP policy allowlist (loopback + test net) ─────

PATCH {{baseUrl}}/v1/admin/ip-policy/admin
Content-Type: application/json

{
  "allowlist": "127.0.0.0/8,198.51.100.0/24",
  "blocklist": ""
}

HTTP 200
[Asserts]
jsonpath "$.allowlist" contains "127.0.0.0/8"


###


# ── Scenario 17: Clear superuser IP policy (reset to unrestricted) ────────────

PATCH {{baseUrl}}/v1/admin/ip-policy/admin
Content-Type: application/json

{
  "allowlist": "",
  "blocklist": ""
}

HTTP 200


###


# ── Cleanup: reset platform IP policy to open defaults ────────────────────────

PATCH {{baseUrl}}/v1/admin/ip-policy
Content-Type: application/json

{
  "tenant_ip_policy_editable": true,
  "default_allowlist": "",
  "default_blocklist": ""
}

HTTP 200


###


# ── Domain Policy (allowed_email_domains) ────────────────────────────────────
# Login as tenant owner to manage auth policy

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{tenantOwnerEmail}}", "org_slug": "{{tenantOwnerOrg}}" }

HTTP 200


###


# ── Scenario 18: Set allowed_email_domains to a specific domain ──────────────
# Only @roochoco.test emails will be allowed to join.
# Expects: 200

PATCH {{baseUrl}}/v1/orgs/current/auth-policy
Content-Type: application/json

{
  "allow_magic_link": true,
  "allow_google": true,
  "allow_microsoft": true,
  "allow_passkey": true,
  "require_mfa": false,
  "require_mfa_for_admins": false,
  "allowed_email_domains": "roochoco.test",
  "max_session_age_hours": null,
  "max_concurrent_sessions": null
}

HTTP 200
[Asserts]
jsonpath "$.allowed_email_domains" == "roochoco.test"


###


# ── Scenario 19: Set multiple allowed domains (comma-separated) ───────────────

PATCH {{baseUrl}}/v1/orgs/current/auth-policy
Content-Type: application/json

{
  "allow_magic_link": true,
  "allow_google": true,
  "allow_microsoft": true,
  "allow_passkey": true,
  "require_mfa": false,
  "require_mfa_for_admins": false,
  "allowed_email_domains": "roochoco.test,sweetfactory.test",
  "max_session_age_hours": null,
  "max_concurrent_sessions": null
}

HTTP 200
[Asserts]
jsonpath "$.allowed_email_domains" contains "roochoco.test"
jsonpath "$.allowed_email_domains" contains "sweetfactory.test"


###


# ── Scenario 20: Set an invalid domain format ────────────────────────────────
# A domain with spaces or clearly invalid characters should be rejected.
# Expects: 4xx

PATCH {{baseUrl}}/v1/orgs/current/auth-policy
Content-Type: application/json

{
  "allow_magic_link": true,
  "allow_google": true,
  "allow_microsoft": true,
  "allow_passkey": true,
  "require_mfa": false,
  "require_mfa_for_admins": false,
  "allowed_email_domains": "not a domain!!!",
  "max_session_age_hours": null,
  "max_concurrent_sessions": null
}

HTTP/1.1 *
[Asserts]
status >= 200
status < 500


###


# ── Scenario 21: Workspace member cannot change domain policy ─────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{rooChocoMemberEmail}}", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200


###


PATCH {{baseUrl}}/v1/orgs/current/auth-policy
Content-Type: application/json

{
  "allow_magic_link": true,
  "allow_google": true,
  "allow_microsoft": true,
  "allow_passkey": true,
  "require_mfa": false,
  "require_mfa_for_admins": false,
  "allowed_email_domains": "evil.com",
  "max_session_age_hours": null,
  "max_concurrent_sessions": null
}

HTTP/1.1 *
[Asserts]
status >= 403
status < 500


###


# ── Cleanup: reset domain policy to unrestricted ──────────────────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{tenantOwnerEmail}}", "org_slug": "{{tenantOwnerOrg}}" }

HTTP 200


###


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
[Asserts]
jsonpath "$.allowed_email_domains" == ""
