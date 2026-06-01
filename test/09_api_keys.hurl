# Setup: log in as rooroo (tenant owner — has org:update permission)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
sessionCookie: cookie "rooiam_sid"


###


# Create an API key
# Expects: 201 with raw key (only returned once)

POST {{baseUrl}}/v1/orgs/current/api-keys
Cookie: rooiam_sid={{sessionCookie}}
Content-Type: application/json

{
  "label": "httpyac-test-key"
}

HTTP 201
[Captures]
apiKeyId: jsonpath "$.key.id"
[Asserts]
jsonpath "$.key.key_prefix" isString
jsonpath "$.key.label" == "httpyac-test-key"
jsonpath "$.raw_key" isString


###


# List API keys
# Expects: 200 with the created key visible (no raw value)

GET {{baseUrl}}/v1/orgs/current/api-keys
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200
[Asserts]
jsonpath "$" count >= 1


###


# Revoke the API key
# Expects: 200

DELETE {{baseUrl}}/v1/orgs/current/api-keys/{{apiKeyId}}
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200
