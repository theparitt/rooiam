# Setup: log in as rooroo (tenant owner — has activity:read)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
sessionCookie: cookie "rooiam_sid"


###


# List audit logs (default page)
# Expects: 200 with items array and total count

GET {{baseUrl}}/v1/orgs/workspace/activity
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200
[Asserts]
jsonpath "$.items" count >= 0
jsonpath "$.total" >= 0


###


# Search audit logs
# Expects: 200 — results filtered by action

GET {{baseUrl}}/v1/orgs/workspace/activity?search=login&page=1&page_size=10
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200
[Asserts]
jsonpath "$.items" count >= 0


###


# Export as CSV
# Expects: 200 with text/csv content-type

GET {{baseUrl}}/v1/orgs/workspace/activity/export?format=csv
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200
[Asserts]
header "Content-Type" contains "text/csv"
header "Content-Disposition" contains "activity.csv"


###


# Export as JSON
# Expects: 200 with JSON array

GET {{baseUrl}}/v1/orgs/workspace/activity/export?format=json
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200
[Asserts]
jsonpath "$" count >= 0
