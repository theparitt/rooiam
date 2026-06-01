# Setup wizard public read-only endpoints — no auth required
# Safe to test without disrupting demo state


# Get setup completion status
# Expects: 200 with setup_completed boolean

GET {{baseUrl}}/v1/setup/status

HTTP 200
[Asserts]
jsonpath "$.initialized" exists


###


# Get public URLs (issuer URL, etc.)
# Expects: 200 with issuer_url

GET {{baseUrl}}/v1/setup/public-urls

HTTP 200
[Asserts]
jsonpath "$.issuer_url" isString


###


# Get available authentication methods (platform-wide)
# Expects: 200

GET {{baseUrl}}/v1/setup/auth-methods

HTTP 200


###


# Get login bootstrap data (used by login pages before org context is known)
# Expects: 200

GET {{baseUrl}}/v1/setup/login-bootstrap

HTTP 200


###


# Get org-scoped authentication methods for roochoco
# Expects: 200

GET {{baseUrl}}/v1/setup/auth-methods?org=roochoco

HTTP 200
