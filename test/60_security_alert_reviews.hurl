# Persisted security alert review state

# 1. Login as tenant owner in a workspace
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{tenantOwnerEmail}}", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
workspaceOwnerCookie: cookie "rooiam_sid"


###


# 2. Workspace review list starts empty
GET {{baseUrl}}/v1/orgs/current/security-alert-reviews
Cookie: rooiam_sid={{workspaceOwnerCookie}}

HTTP 200
[Asserts]
jsonpath "$.items" count == 0


###


# 3. Mark a workspace alert as reviewed
POST {{baseUrl}}/v1/orgs/current/security-alert-reviews
Cookie: rooiam_sid={{workspaceOwnerCookie}}
Content-Type: application/json

{ "alert_key": "event:test-workspace-alert" }

HTTP 200
[Asserts]
jsonpath "$.ok" == true


###


# 4. Workspace review list now contains the alert key
GET {{baseUrl}}/v1/orgs/current/security-alert-reviews
Cookie: rooiam_sid={{workspaceOwnerCookie}}

HTTP 200
[Asserts]
jsonpath "$.items[0].alert_key" == "event:test-workspace-alert"


###


# 5. Reset workspace review state
DELETE {{baseUrl}}/v1/orgs/current/security-alert-reviews
Cookie: rooiam_sid={{workspaceOwnerCookie}}

HTTP 200
[Asserts]
jsonpath "$.ok" == true


###


# 6. Login as platform owner
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "owner@rooiam.test" }

HTTP 200
[Captures]
platformOwnerCookie: cookie "rooiam_sid"


###


# 7. Platform review list starts empty
GET {{baseUrl}}/v1/admin/security-alert-reviews
Cookie: rooiam_sid={{platformOwnerCookie}}

HTTP 200
[Asserts]
jsonpath "$.items" count == 0


###


# 8. Mark a platform alert as reviewed
POST {{baseUrl}}/v1/admin/security-alert-reviews
Cookie: rooiam_sid={{platformOwnerCookie}}
Content-Type: application/json

{ "alert_key": "group:test-platform-alert" }

HTTP 200
[Asserts]
jsonpath "$.ok" == true


###


# 9. Platform review list now contains the alert key
GET {{baseUrl}}/v1/admin/security-alert-reviews
Cookie: rooiam_sid={{platformOwnerCookie}}

HTTP 200
[Asserts]
jsonpath "$.items[0].alert_key" == "group:test-platform-alert"


###


# 10. Reset platform review state
DELETE {{baseUrl}}/v1/admin/security-alert-reviews
Cookie: rooiam_sid={{platformOwnerCookie}}

HTTP 200
[Asserts]
jsonpath "$.ok" == true
