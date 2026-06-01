# Setup: log in as rooroo (tenant owner — has auth_policy:manage)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
sessionCookie: cookie "rooiam_sid"


###


# Update auth policy — enable all methods, set domain restriction
# Expects: 200 with updated org fields

PATCH {{baseUrl}}/v1/orgs/current/auth-policy
Cookie: rooiam_sid={{sessionCookie}}
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
jsonpath "$.allow_magic_link" == true
jsonpath "$.allowed_email_domains" == ""


###


# Set concurrent session limit
# Expects: 200 with max_concurrent_sessions = 3

PATCH {{baseUrl}}/v1/orgs/current/auth-policy
Cookie: rooiam_sid={{sessionCookie}}
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
  "max_concurrent_sessions": 3
}

HTTP 200
[Asserts]
jsonpath "$.max_concurrent_sessions" == 3


###


# Reset — remove the limit
PATCH {{baseUrl}}/v1/orgs/current/auth-policy
Cookie: rooiam_sid={{sessionCookie}}
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
