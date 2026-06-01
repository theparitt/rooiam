# Setup: log in as platform owner
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "owner@rooiam.test", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"


###


# Get platform-level session policy
# Expects: 200

GET {{baseUrl}}/v1/admin/session-policy
Cookie: rooiam_sid={{ownerSession}}

HTTP 200


###


# Update platform session policy
# Expects: 200 or 4xx (depends on supported fields)

PATCH {{baseUrl}}/v1/admin/session-policy
Cookie: rooiam_sid={{ownerSession}}
Content-Type: application/json

{
  "default_session_age_hours": 168,
  "max_concurrent_sessions": 10
}

HTTP/1.1 *
[Asserts]
status >= 200
status < 500


###


# Get client governance settings
# Expects: 200

GET {{baseUrl}}/v1/admin/client-governance
Cookie: rooiam_sid={{ownerSession}}

HTTP 200


###


# Update client governance
# Expects: 200 or 4xx

PATCH {{baseUrl}}/v1/admin/client-governance
Cookie: rooiam_sid={{ownerSession}}
Content-Type: application/json

{
  "allow_web_clients": true,
  "allow_spa_clients": true,
  "allow_native_clients": true
}

HTTP/1.1 *
[Asserts]
status >= 200
status < 500


###


# Get workspace governance settings
# Expects: 200

GET {{baseUrl}}/v1/admin/workspace-governance
Cookie: rooiam_sid={{ownerSession}}

HTTP 200


###


# Update workspace governance
# Expects: 200 or 4xx

PATCH {{baseUrl}}/v1/admin/workspace-governance
Cookie: rooiam_sid={{ownerSession}}
Content-Type: application/json

{
  "max_orgs_per_user": 10
}

HTTP/1.1 *
[Asserts]
status >= 200
status < 500


###


# Get tenant access policy
# Expects: 200

GET {{baseUrl}}/v1/admin/tenant-access
Cookie: rooiam_sid={{ownerSession}}

HTTP 200


###


# Restore tenant access to reasonable defaults
# Expects: 200 or 4xx

PATCH {{baseUrl}}/v1/admin/tenant-access
Cookie: rooiam_sid={{ownerSession}}
Content-Type: application/json

{}

HTTP/1.1 *
[Asserts]
status >= 200
status < 500


###


# Setup: log in as coco (regular member)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "praline@roochoco.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
cocoSession: cookie "rooiam_sid"


###


# Attempt to read platform session policy as unprivileged member
# Expects: 403

GET {{baseUrl}}/v1/admin/session-policy
Cookie: rooiam_sid={{cocoSession}}

HTTP 403


###


# Attempt to read client governance as unprivileged member
# Expects: 403

GET {{baseUrl}}/v1/admin/client-governance
Cookie: rooiam_sid={{cocoSession}}

HTTP 403
