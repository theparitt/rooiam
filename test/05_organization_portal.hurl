# Setup: log in as rooroo (tenant owner — has portal access)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
sessionCookie: cookie "rooiam_sid"


###


# Get portal data — returns current org, permissions, roles
# Expects: 200 with current_org set to roochoco

GET {{baseUrl}}/v1/orgs/current/portal
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200
[Asserts]
jsonpath "$.current_org.slug" == "roochoco-test"
jsonpath "$.permissions" count >= 1


###


# List user's organizations
# Expects: 200 with at least roochoco in the list

GET {{baseUrl}}/v1/orgs
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200
[Asserts]
jsonpath "$" count >= 1


###


# Public branding — no auth needed
# Expects: 200 with branding fields

GET {{baseUrl}}/v1/orgs/public/branding?slug=roochoco-test

HTTP 200
[Asserts]
jsonpath "$.slug" == "roochoco-test"


