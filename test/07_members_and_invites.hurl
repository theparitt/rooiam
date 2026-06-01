# Setup: log in as rooroo (tenant owner — has members:manage)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
sessionCookie: cookie "rooiam_sid"


###


# List workspace members
# Expects: 200 with at least 1 member (coco herself)

GET {{baseUrl}}/v1/orgs/current/members
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200
[Asserts]
jsonpath "$" count >= 1
jsonpath "$[0].email" isString


###


# Send invite to a new email
# Expects: 200 — invite created (token sent to Mailhog)

POST {{baseUrl}}/v1/orgs/current/invites
Cookie: rooiam_sid={{sessionCookie}}
Content-Type: application/json

{
  "email": "newmember@example.com"
}

HTTP 200


###


# Accept invite with bogus token
# Expects: 4xx — token invalid

POST {{baseUrl}}/v1/orgs/invites/accept
Cookie: rooiam_sid={{sessionCookie}}
Content-Type: application/json

{
  "token": "totally-fake-token-000"
}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500
