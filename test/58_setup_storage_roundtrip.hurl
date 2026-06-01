# Setup storage round-trip
#
# What this tests:
#   1. Platform owner can read setup storage config
#   2. Setup storage test endpoint works for local disk
#   3. Saving setup storage persists backend + local path
#   4. GET after save returns the new values
#   5. Storage config can be restored to the simple local default


# ── 1. Login as platform owner ───────────────────────────────────────────────

POST {{baseUrl}}/v1/test/login
Content-Type: application/json

{ "email": "{{platformOwnerEmail}}", "org_slug": "{{platformOwnerOrg}}" }

HTTP 200
[Captures]
ownerSession: cookie "rooiam_sid"


###


# ── 2. Read setup storage config ─────────────────────────────────────────────

GET {{baseUrl}}/v1/setup/storage-config
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.backend" isString
jsonpath "$.local_path" isString
jsonpath "$.minio_endpoint" isString


###


# ── 3. Test local-disk storage payload ───────────────────────────────────────

POST {{baseUrl}}/v1/setup/test-storage
Cookie: rooiam_sid={{ownerSession}}
Content-Type: application/json

{
  "backend": "local",
  "local_path": "/tmp/rooiam-hurl-storage",
  "minio_endpoint": "",
  "minio_bucket": "",
  "minio_access_key": "",
  "minio_secret_key": "",
  "minio_use_ssl": false
}

HTTP 200
[Asserts]
jsonpath "$.ok" == true
jsonpath "$.message" isString


###


# ── 4. Save local-disk storage config ────────────────────────────────────────

POST {{baseUrl}}/v1/setup/storage-config
Cookie: rooiam_sid={{ownerSession}}
Content-Type: application/json

{
  "backend": "local",
  "local_path": "/tmp/rooiam-hurl-storage",
  "minio_endpoint": "",
  "minio_bucket": "",
  "minio_access_key": "",
  "minio_secret_key": "",
  "minio_use_ssl": false
}

HTTP 200
[Asserts]
jsonpath "$.backend" == "local"
jsonpath "$.local_path" == "/tmp/rooiam-hurl-storage"


###


# ── 5. Read back persisted values ────────────────────────────────────────────

GET {{baseUrl}}/v1/setup/storage-config
Cookie: rooiam_sid={{ownerSession}}

HTTP 200
[Asserts]
jsonpath "$.backend" == "local"
jsonpath "$.local_path" == "/tmp/rooiam-hurl-storage"


###


# ── 6. Restore simple local default ──────────────────────────────────────────

POST {{baseUrl}}/v1/setup/storage-config
Cookie: rooiam_sid={{ownerSession}}
Content-Type: application/json

{
  "backend": "local",
  "local_path": "",
  "minio_endpoint": "",
  "minio_bucket": "",
  "minio_access_key": "",
  "minio_secret_key": "",
  "minio_use_ssl": false
}

HTTP 200
[Asserts]
jsonpath "$.backend" == "local"
jsonpath "$.local_path" isString
jsonpath "$.local_path" != ""
