# Setup: log in as coco
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "praline@roochoco.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
session1: cookie "rooiam_sid"


###


# Create a second session
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "praline@roochoco.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
session2: cookie "rooiam_sid"


###


# List sessions from session2 — should see at least 2 active
GET {{baseUrl}}/v1/identity/me/sessions
Cookie: rooiam_sid={{session2}}

HTTP 200
[Asserts]
jsonpath "$" count >= 2


###


# Logout session2
# Expects: 200, subsequent request with session2 should fail

POST {{baseUrl}}/v1/auth/logout
Cookie: rooiam_sid={{session2}}

HTTP 200


###


# session2 is now invalid
# Expects: 401

GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{session2}}

HTTP 401


###


# session1 still works
GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{session1}}

HTTP 200
