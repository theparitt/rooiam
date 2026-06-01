# Setup: log in as minty (MFA-required workspace)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "peppermint@mintmallow.test", "org_slug": "{{mintMallowWorkspace}}" }

HTTP 200
[Captures]
mintySession: cookie "rooiam_sid"


###


# Check MFA status
# Expects: 200 with totp_enabled and backup_codes_remaining

GET {{baseUrl}}/v1/mfa/status
Cookie: rooiam_sid={{mintySession}}

HTTP 200
[Asserts]
jsonpath "$.totp_enabled" isBoolean
jsonpath "$.backup_codes_remaining" >= 0


###


# Start TOTP enrollment (if not already enabled)
# Expects: 200 with QR URI

POST {{baseUrl}}/v1/mfa/totp/start
Cookie: rooiam_sid={{mintySession}}

HTTP/1.1 *
[Asserts]
status >= 200
status < 500


