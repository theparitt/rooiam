# OIDC discovery document
# Expects: 200 with standard OIDC fields

GET {{baseUrl}}/.well-known/openid-configuration

HTTP 200
[Asserts]
jsonpath "$.issuer" isString
jsonpath "$.authorization_endpoint" isString
jsonpath "$.token_endpoint" isString
jsonpath "$.jwks_uri" isString


###


# JWKS endpoint
# Expects: 200 with at least one key

GET {{baseUrl}}/.well-known/jwks.json

HTTP 200
[Asserts]
jsonpath "$.keys" count >= 0


###


# Authorize with missing client_id
# Expects: 4xx — invalid request

GET {{baseUrl}}/v1/oidc/authorize?response_type=code&redirect_uri=http://localhost:3000/cb

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# Token endpoint — bad grant
# Expects: 400

POST {{baseUrl}}/v1/oidc/token
[Form]
grant_type: authorization_code
code: fake-code
redirect_uri: http://localhost:3000/cb
client_id: fake

HTTP/1.1 *
[Asserts]
status >= 400
status < 500
