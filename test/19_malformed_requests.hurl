# =============================================================================
# Malformed / Unexpected Request Shape Tests
# Verify that the API handles badly shaped inputs gracefully without crashing.
# =============================================================================


# Scenario 1: Malformed session cookie (not a valid opaque token format)
# Expects: 401

GET {{baseUrl}}/v1/identity/me
Cookie: rooiam_sid=not-a-valid-uuid.notasecret

HTTP 401


###


# Scenario 2: Magic link start — no body at all
# Expects: 400 or 422

POST {{baseUrl}}/v1/auth/magic-link/start
Content-Type: application/json

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# Scenario 3: Magic link start — wrong Content-Type (text/plain)
# Expects: 400 or 415

POST {{baseUrl}}/v1/auth/magic-link/start
Content-Type: text/plain
```
hello
```

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# ── Setup: Login as coco to test authenticated malformed requests ─────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{rooChocoMemberEmail}}", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
cocoSession: cookie "rooiam_sid"


###


# Scenario 4: Delete API key with non-UUID ID in path
# Expects: 400 (path param parse error) or 404

DELETE {{baseUrl}}/v1/orgs/current/api-keys/not-a-uuid
Cookie: rooiam_sid={{cocoSession}}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# Scenario 5: Update member role with non-UUID member ID in path
# Expects: 400 (path param parse error) or 404

PATCH {{baseUrl}}/v1/orgs/current/members/not-a-uuid/role
Cookie: rooiam_sid={{cocoSession}}
Content-Type: application/json

{ "role_code": "admin" }

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# Scenario 6: Delete role with non-UUID role ID in path
# Expects: 400 (path param parse error) or 404

DELETE {{baseUrl}}/v1/orgs/current/roles/not-a-uuid
Cookie: rooiam_sid={{cocoSession}}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# Scenario 7: Create org with empty name
# Expects: 400

POST {{baseUrl}}/v1/orgs
Cookie: rooiam_sid={{cocoSession}}
Content-Type: application/json

{ "name": "" }

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# Scenario 8: Create org with name that is 500 characters long
# Expects: 400 (name too long) or 201 (if no length limit enforced)

POST {{baseUrl}}/v1/orgs
Cookie: rooiam_sid={{cocoSession}}
Content-Type: application/json

{ "name": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# Scenario 9: Create OAuth client with invalid app_type value
# Expects: 400 (unknown enum variant)

POST {{baseUrl}}/v1/orgs/current/clients
Cookie: rooiam_sid={{cocoSession}}
Content-Type: application/json

{
  "app_name": "Test",
  "app_type": "unknown_type",
  "redirect_uris": ["http://localhost:3000/callback"]
}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# Scenario 10: Create OAuth client with empty redirect_uris array
# Expects: 400 (redirect URIs required) or 201 if the server allows it

POST {{baseUrl}}/v1/orgs/current/clients
Cookie: rooiam_sid={{cocoSession}}
Content-Type: application/json

{
  "app_name": "Test",
  "app_type": "spa",
  "redirect_uris": []
}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# Scenario 11: Public branding — missing slug query param
# Expects: 400

GET {{baseUrl}}/v1/orgs/public/branding
Cookie: rooiam_sid={{cocoSession}}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# Scenario 12: Public branding — slug that does not exist
# Expects: 404

GET {{baseUrl}}/v1/orgs/public/branding?slug=does-not-exist-org-12345

HTTP 404


###


# Scenario 13: PATCH member role with missing role_code field
# Expects: 400 or 422

PATCH {{baseUrl}}/v1/orgs/current/members/00000000-0000-0000-0000-000000000001/role
Cookie: rooiam_sid={{cocoSession}}
Content-Type: application/json

{}

HTTP/1.1 *
[Asserts]
status >= 400
status < 500


###


# Scenario 14: POST org switch with completely wrong field name (should fail deserialization)
# Expects: 400 or 422

POST {{baseUrl}}/v1/orgs/switch
Cookie: rooiam_sid={{cocoSession}}
Content-Type: application/json

{ "org_slug": "{{rooChocoWorkspace}}" }

HTTP/1.1 *
[Asserts]
status >= 400
status < 500
