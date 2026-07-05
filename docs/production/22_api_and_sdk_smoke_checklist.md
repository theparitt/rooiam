# API And SDK Smoke Checklist

Use this after a production deploy of `rooiam-server`, `rooiam-app`, or the browser SDK-facing login/profile flows.

This checklist focuses on:

- public API reachability
- OpenAPI/spec availability
- CORS for `app.rooiam.com`
- protected profile/avatar endpoints
- media URL behavior
- `@rooiam/sdk-browser` sanity

## 1. Public API health

```bash
curl -i https://api.rooiam.com/health
```

Expected:

- `HTTP/1.1 200 OK`
- JSON body with `"status":"ok"`
- `"checks":{"database":{"ok":true},"redis":{"ok":true}}`

Operator note:

- Confirm the reported environment label is what you intended for the public server.

## 2. OpenAPI availability

```bash
curl -i https://api.rooiam.com/openapi.json
```

Expected:

- `HTTP/1.1 200 OK`
- JSON OpenAPI document
- Paths include:
  - `/v1/identity/me`
  - `/v1/identity/me/profile`
  - `/v1/identity/me/avatar/upload`
  - `/v1/setup/auth-methods`
  - `/v1/setup/login-bootstrap`

This matters because the browser SDK wire types are generated from the server spec.

## 3. Public login bootstrap surface

```bash
curl -i "https://api.rooiam.com/v1/setup/auth-methods?org=<workspace-slug>"
curl -i "https://api.rooiam.com/v1/setup/login-bootstrap?org=<workspace-slug>"
```

Expected:

- `HTTP/1.1 200 OK`
- JSON body describing enabled auth methods
- `login-bootstrap` returns an `auth` object; workspace/app may be `null` if the slug does not resolve on that environment

Use a real production workspace slug for the strongest check.

## 4. CORS preflight for profile update

```bash
curl -i -X OPTIONS "https://api.rooiam.com/v1/identity/me/profile" \
  -H "Origin: https://app.rooiam.com" \
  -H "Access-Control-Request-Method: PATCH" \
  -H "Access-Control-Request-Headers: content-type"
```

Expected:

- `HTTP/1.1 200 OK`
- `Access-Control-Allow-Origin: https://app.rooiam.com`
- `Access-Control-Allow-Credentials: true`
- `PATCH` present in `Access-Control-Allow-Methods`

## 5. CORS preflight for avatar upload

```bash
curl -i -X OPTIONS "https://api.rooiam.com/v1/identity/me/avatar/upload" \
  -H "Origin: https://app.rooiam.com" \
  -H "Access-Control-Request-Method: POST"
```

Expected:

- `HTTP/1.1 200 OK`
- `Access-Control-Allow-Origin: https://app.rooiam.com`
- `Access-Control-Allow-Credentials: true`
- `POST` present in `Access-Control-Allow-Methods`

## 6. Unauthorized negative checks

Profile update without a session:

```bash
curl -i -X PATCH "https://api.rooiam.com/v1/identity/me/profile" \
  -H "Origin: https://app.rooiam.com" \
  -H "Content-Type: application/json" \
  --data '{"avatar_url":""}'
```

Avatar upload without a session:

```bash
curl -i -X POST "https://api.rooiam.com/v1/identity/me/avatar/upload" \
  -H "Origin: https://app.rooiam.com" \
  -F "file=@/path/to/test.jpg;type=image/jpeg"
```

Expected:

- `HTTP/1.1 401 Unauthorized`
- JSON body with `{"error":{"message":"Unauthorized"}}`
- CORS headers still present for `https://app.rooiam.com`

This proves the route exists and the browser should see a normal API response instead of a blocked request.

## 7. Signed-in browser checks

Run these in `https://app.rooiam.com/my/profile` while signed in:

1. Remove avatar.
2. Upload a new PNG/JPG/WEBP/GIF/SVG avatar.
3. Hard refresh the page.
4. Open the image URL from DevTools or the UI text.

Expected:

- Remove succeeds with no generic "could not reach API" error.
- Upload succeeds and the new avatar appears after refresh.
- The stored avatar URL is either:
  - `/media/uploads/...`
  - `https://api.rooiam.com/media/uploads/...`
- The stored avatar URL is **not** a private/LAN/temporary host such as:
  - `http://192.168.x.x/...`
  - `http://localhost:...`
  - `http://minio:9000/...`

If a bad absolute URL appears here, the server already wrote bad data into the database. Fixing env later will not rewrite that row automatically.

## 8. Media routing checks

The production rule from the MinIO guide still applies:

- `ROOIAM_PUBLIC_MEDIA_BASE=/media` means the app resolves media against the API origin
- the public proxy must serve `https://api.rooiam.com/media/...`

If media is behind MinIO, also verify the reverse proxy described in [12_minio_setup.md](./12_minio_setup.md) is still correct.

Quick checks:

```bash
curl -I https://api.rooiam.com/media/<known-real-uploaded-key>
curl -I https://api.rooiam.com/media/does-not-exist
```

Expected:

- real key: `200 OK`
- missing key: `404`
- if you get the API's own 404/CSP response instead, `/media` is probably not routed to MinIO/object storage

## 9. Browser SDK checks

Inside `rooiam-sdk/packages/js-browser`:

```bash
npm run typecheck
npm test
```

Expected:

- `typecheck` passes
- `test` passes the request-path and multipart tests, including:
  - `/v1/identity/me/profile`
  - `/v1/identity/me/avatar/upload`
  - `credentials: 'include'` on every request
  - multipart avatar upload without forcing JSON `Content-Type`

If `npm test` fails with a missing optional Rollup native package in a mixed WSL/Windows environment, reinstall dependencies in the same OS/runtime you use to execute the tests. That is an environment problem, not an API contract failure.

## 10. Stale media DB cleanup

If old bad URLs already exist in the database, use:

```bash
bash rooiam-server/scripts/cleanup_stale_media_urls.sh \
  --old-base http://192.168.0.147:9000/rooiam \
  --dry-run
```

See also:

- [DOCKER.md](../../DOCKER.md)
- [12_minio_setup.md](./12_minio_setup.md)
