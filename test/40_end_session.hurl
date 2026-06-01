# Phase 5 — end_session_endpoint (RP-initiated logout)
# Tests: discovery advertises end_session_endpoint; GET /v1/oidc/end-session clears session cookie;
# post_logout_redirect_uri is only honored for a registered app callback + matching client_id.


# 1. Discovery document includes end_session_endpoint
GET {{baseUrl}}/.well-known/openid-configuration

HTTP 200
[Asserts]
jsonpath "$.end_session_endpoint" isString
jsonpath "$.end_session_endpoint" contains "/v1/oidc/end-session"


###


# 2. Log in as rooroo to get a session
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
roorooSession: cookie "rooiam_sid"


###


# 2b. Create a client with a registered logout redirect target
POST {{baseUrl}}/v1/orgs/current/clients
Cookie: rooiam_sid={{roorooSession}}
Content-Type: application/json

{
  "app_name": "hurl End Session App",
  "app_type": "spa",
  "redirect_uris": ["http://localhost:5172/logout"],
  "allowed_embed_origins": ["http://localhost:5172"]
}

HTTP 201
[Captures]
endSessionClientId: jsonpath "$.client.client_id"
endSessionClientRowId: jsonpath "$.client.id"


###


# 3. Verify session works (me endpoint)
GET {{baseUrl}}/v1/identity/me

HTTP 200
[Asserts]
jsonpath "$.email" isString


###


# 4. Call end_session — no redirect specified, redirects to frontend root
GET {{baseUrl}}/v1/oidc/end-session

HTTP *
[Asserts]
status >= 300
status < 400


###


# 5. Re-login to get fresh session for redirect test
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200


###


# 6. end_session with post_logout_redirect_uri + client_id — redirects to specified URI
GET {{baseUrl}}/v1/oidc/end-session?client_id={{endSessionClientId}}&post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A5172%2Flogout&state=mystate

HTTP *
[Asserts]
status >= 300
status < 400
header "Location" contains "localhost:5172"
header "Location" contains "mystate"


###


# 7. post_logout_redirect_uri without client_id is rejected and falls back safely
GET {{baseUrl}}/v1/oidc/end-session?post_logout_redirect_uri=http%3A%2F%2Fevil.example%2Flogout&state=badstate

HTTP *
[Asserts]
status >= 300
status < 400
header "Location" contains "localhost:5172"
header "Location" not contains "evil.example"


###


# 8. Cleanup
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
cleanupSession: cookie "rooiam_sid"


###


DELETE {{baseUrl}}/v1/orgs/current/clients/{{endSessionClientRowId}}
Cookie: rooiam_sid={{cleanupSession}}

HTTP 200
