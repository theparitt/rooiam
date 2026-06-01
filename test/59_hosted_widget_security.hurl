# Hosted widget security hardening
# Tests:
#   1. Create an app with explicit redirect URIs + embed origins
#   2. Allowed embed origin can load /login-widget
#   3. Disallowed embed origin is blocked with 403
#   4. App with no matching callback for the current site is blocked with 403
#   5. Cleanup created clients


# 1. Login as tenant owner
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{tenantOwnerEmail}}", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
sessionCookie: cookie "rooiam_sid"


###


# 2. Capture current workspace id for the widget query
GET {{baseUrl}}/v1/orgs/current/portal
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200
[Captures]
workspaceId: jsonpath "$.current_org.id"
[Asserts]
jsonpath "$.current_org.slug" == "{{rooChocoWorkspace}}"


###


# 3. Create a hosted-widget app with matching callback + embed origin
POST {{baseUrl}}/v1/orgs/current/clients
Cookie: rooiam_sid={{sessionCookie}}
Content-Type: application/json

{
  "app_name": "hurl Hosted Widget App",
  "app_type": "spa",
  "redirect_uris": ["http://localhost:5172/callback"],
  "allowed_embed_origins": ["http://localhost:5172"]
}

HTTP 201
[Captures]
widgetClientId: jsonpath "$.client.client_id"
widgetClientRowId: jsonpath "$.client.id"


###


# 4. Allowed embed origin can load the hosted widget
GET {{baseUrl}}/login-widget?workspace_id={{workspaceId}}&client_id={{widgetClientId}}
Referer: http://localhost:5172/app

HTTP 200
[Asserts]
body contains "widgetLoginContext"
body contains "http://localhost:5172"


###


# 5. Disallowed embed origin is blocked
GET {{baseUrl}}/login-widget?workspace_id={{workspaceId}}&client_id={{widgetClientId}}
Referer: http://evil.example/phish

HTTP 403


###


# 6. Create an app whose redirect origin does not match the allowed embed origin
POST {{baseUrl}}/v1/orgs/current/clients
Cookie: rooiam_sid={{sessionCookie}}
Content-Type: application/json

{
  "app_name": "hurl Widget Mismatch App",
  "app_type": "spa",
  "redirect_uris": ["http://localhost:5999/callback"],
  "allowed_embed_origins": ["http://localhost:5172"],
  "confirm_multi_origin": true
}

HTTP 201
[Captures]
mismatchClientId: jsonpath "$.client.client_id"
mismatchClientRowId: jsonpath "$.client.id"


###


# 7. Matching embed origin but no matching callback origin is blocked
GET {{baseUrl}}/login-widget?workspace_id={{workspaceId}}&client_id={{mismatchClientId}}
Referer: http://localhost:5172/app

HTTP 403


###


# 8. Cleanup
DELETE {{baseUrl}}/v1/orgs/current/clients/{{widgetClientRowId}}
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200


###


# 9. Multi-origin app setup requires explicit confirmation
POST {{baseUrl}}/v1/orgs/current/clients
Cookie: rooiam_sid={{sessionCookie}}
Content-Type: application/json

{
  "app_name": "hurl Multi Origin App",
  "app_type": "spa",
  "redirect_uris": ["http://localhost:5172/callback", "http://localhost:5180/callback"],
  "allowed_embed_origins": ["http://localhost:5172", "http://localhost:5180"]
}

HTTP 400
[Asserts]
jsonpath "$.error.message" contains "Confirm the multi-origin app setup"


###


# 10. Multi-origin app setup succeeds after explicit confirmation
POST {{baseUrl}}/v1/orgs/current/clients
Cookie: rooiam_sid={{sessionCookie}}
Content-Type: application/json

{
  "app_name": "hurl Multi Origin App",
  "app_type": "spa",
  "redirect_uris": ["http://localhost:5172/callback", "http://localhost:5180/callback"],
  "allowed_embed_origins": ["http://localhost:5172", "http://localhost:5180"],
  "confirm_multi_origin": true
}

HTTP 201
[Captures]
multiOriginClientRowId: jsonpath "$.client.id"


###


# 11. Cleanup multi-origin app
DELETE {{baseUrl}}/v1/orgs/current/clients/{{multiOriginClientRowId}}
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200


###


DELETE {{baseUrl}}/v1/orgs/current/clients/{{mismatchClientRowId}}
Cookie: rooiam_sid={{sessionCookie}}

HTTP 200
