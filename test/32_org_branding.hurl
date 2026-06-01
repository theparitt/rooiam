# Setup: log in as rooroo (tenant owner — has branding:manage permission)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
roorooSession: cookie "rooiam_sid"


###


# Get current portal / branding data
# Expects: 200 with org branding fields

GET {{baseUrl}}/v1/orgs/current/portal
Cookie: rooiam_sid={{roorooSession}}

HTTP 200
[Asserts]
jsonpath "$.current_org.slug" == "roochoco-test"
jsonpath "$.current_org" exists


###


# Update branding — set primary_color and display_name
# Expects: 200

PATCH {{baseUrl}}/v1/orgs/current/branding
Cookie: rooiam_sid={{roorooSession}}
Content-Type: application/json

{
  "primary_color": "#FF5733",
  "display_name": "RooChoco Test"
}

HTTP 200


###


# Public branding — no auth required
# Expects: 200 with branding fields present

GET {{baseUrl}}/v1/orgs/public/branding?slug=roochoco-test

HTTP 200
[Asserts]
jsonpath "$.slug" == "roochoco-test"
jsonpath "$.name" isString


###


# Update branding with invalid/edge-case color value
# Expects: 200 or 4xx (must not 500 — graceful handling)

PATCH {{baseUrl}}/v1/orgs/current/branding
Cookie: rooiam_sid={{roorooSession}}
Content-Type: application/json

{
  "primary_color": "not-a-color"
}

HTTP/1.1 *
[Asserts]
status >= 200
status < 500


###


# Setup: log in as coco (regular member — no branding:manage permission)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "praline@roochoco.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
cocoSession: cookie "rooiam_sid"


###


# Attempt branding update as unprivileged member
# Expects: 403 (permission guard enforced)

PATCH {{baseUrl}}/v1/orgs/current/branding
Cookie: rooiam_sid={{cocoSession}}
Content-Type: application/json

{
  "display_name": "Should Be Rejected"
}

HTTP 403


###


# Cleanup: log in as rooroo again and reset display_name to original
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
roorooSession2: cookie "rooiam_sid"


###


# Reset display_name back to "RooChoco"
PATCH {{baseUrl}}/v1/orgs/current/branding
Cookie: rooiam_sid={{roorooSession2}}
Content-Type: application/json

{
  "display_name": "RooChoco"
}

HTTP 200
