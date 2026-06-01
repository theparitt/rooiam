# =============================================================================
# Unauthenticated / invalid session edge cases
# These MUST run with no prior login in this file so the cookie jar is empty.
# =============================================================================


# No cookie — identity endpoint
# Expects: 401

GET {{baseUrl}}/v1/identity/me

HTTP 401


###


# Fake / expired session cookie
# Expects: 401

GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid=fake-token-aaaaaaaaaaaaaaaa

HTTP 401


###


# No cookie — portal endpoint
# Expects: 401

GET {{baseUrl}}/v1/orgs/current/portal

HTTP 401


###


# No cookie — MFA status
# Expects: 401

GET {{baseUrl}}/v1/mfa/status

HTTP 401


###


# No cookie — platform admin endpoint
# Expects: 401

GET {{baseUrl}}/v1/admin/users

HTTP 401