# Phase 6 — Permission catalog, role diff, role templates
# Tests: list permissions (with descriptions), diff two roles, list templates.


# 1. Log in as rooroo (workspace admin)
POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "rooroo@sweetfactory.test", "org_slug": "{{rooChocoWorkspace}}" }

HTTP 200
[Captures]
roorooSession: cookie "rooiam_sid"


###


# 2. List all available permissions (catalog with descriptions)
GET {{baseUrl}}/v1/orgs/current/roles/permissions

HTTP 200
[Asserts]
jsonpath "$" isCollection
jsonpath "$[0].code" isString


###


# 3. List built-in role templates
GET {{baseUrl}}/v1/orgs/current/role-templates

HTTP 200
[Asserts]
jsonpath "$.templates" isCollection
jsonpath "$.templates[0].name" isString
jsonpath "$.templates[0].permissions" isCollection


###


# 4. List all roles (system + custom)
GET {{baseUrl}}/v1/orgs/current/roles

HTTP 200
[Asserts]
jsonpath "$" isCollection
[Captures]
firstRoleId: jsonpath "$[0].id"
secondRoleId: jsonpath "$[1].id"


###


# 5. Role diff — compare two system roles
GET {{baseUrl}}/v1/orgs/current/role-diff?role_a={{firstRoleId}}&role_b={{secondRoleId}}

HTTP 200
[Asserts]
jsonpath "$.role_a_id" isString
jsonpath "$.role_b_id" isString
jsonpath "$.in_both" isCollection
