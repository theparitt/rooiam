# Setup: log in as coco (workspace owner)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "praline@roochoco.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
sessionCookie: cookie "rooiam_sid"


###


# Get own profile — authenticated
# Expects: 200 with user id and email

GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200
[Asserts]
jsonpath "$.id" isString
jsonpath "$.email" == "praline@roochoco.test"


###


# List active sessions
# Expects: 200 with array containing at least the current session

GET {{baseUrl}}/v1/identity/me/sessions
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200
[Asserts]
jsonpath "$" count >= 1


###


# Update display name
# Expects: 200 with updated display_name

PATCH {{baseUrl}}/v1/identity/me/profile
Cookie: rooiam_sid={{sessionCookie}}
Content-Type: application/json

{
  "display_name": "Coco Test"
}

HTTP 200
[Asserts]
jsonpath "$.display_name" == "Coco Test"
