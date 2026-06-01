# Phase 6 — Policy change preview (lockout warning) and self-lockout check
# Tests: preview endpoint, self-check endpoint.


# 1. Log in as rooroo (workspace admin)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
roorooSession: cookie "rooiam_sid"


###


# 2. Preview policy change that keeps magic link enabled (no lockout expected)
POST {{baseUrl}}/v1/orgs/current/auth-policy/preview
Content-Type: application/json

{
  "allow_magic_link": true,
  "allow_google": true,
  "allow_microsoft": true,
  "allow_passkey": true
}

HTTP 200
[Asserts]
jsonpath "$.would_lock_out_users" isBoolean
jsonpath "$.warnings" isCollection


###


# 3. Preview disabling magic link (may warn about locked-out users)
POST {{baseUrl}}/v1/orgs/current/auth-policy/preview
Content-Type: application/json

{
  "allow_magic_link": false,
  "allow_google": false,
  "allow_microsoft": false,
  "allow_passkey": false
}

HTTP 200
[Asserts]
jsonpath "$.would_lock_out_users" isBoolean


###


# 4. Self-lockout check — would current user lose access?
POST {{baseUrl}}/v1/orgs/current/auth-policy/self-check
Content-Type: application/json

{
  "allow_magic_link": true,
  "allow_google": true,
  "allow_microsoft": true,
  "allow_passkey": true
}

HTTP 200
[Asserts]
jsonpath "$.would_lock_out_self" == false
jsonpath "$.your_login_methods" exists


###


# 5. Self-lockout check with all methods disabled (would lock self out)
POST {{baseUrl}}/v1/orgs/current/auth-policy/self-check
Content-Type: application/json

{
  "allow_magic_link": false,
  "allow_google": false,
  "allow_microsoft": false,
  "allow_passkey": false
}

HTTP 200
[Asserts]
jsonpath "$.would_lock_out_self" == true
