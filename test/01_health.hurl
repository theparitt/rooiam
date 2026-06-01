# Health check
# Expects: 200 with status "ok"




GET {{baseUrl}}/health

HTTP 200
[Asserts]
jsonpath "$.status" == "ok"


###


# Health check returns version string
# Expects: version field present and non-empty

GET {{baseUrl}}/health

HTTP 200
[Asserts]
jsonpath "$.version" isString
