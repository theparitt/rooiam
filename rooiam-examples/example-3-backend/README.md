# example-3-backend

Simple backend-only Rooiam example.

This example is intentionally machine-to-machine only:

- browser calls local routes on `5193`
- `5193` backend calls Rooiam on `5170`
- the workspace API key stays on the example server

This example does not use:

- a hosted login widget
- end-user login
- callback routes

## What the page tests

The page on `http://localhost:5193` is split into:

- read-route buttons for the implemented workspace API-key `GET` routes
- write-route tests for:
  - create, update, suspend, resume, rotate-secret, and delete a test client
  - send and revoke an invite
  - change a member role
  - remove a member

Every action:

- calls the local example backend on `5193`
- the backend forwards the request to `5170` with the workspace API key
- the browser shows the real JSON response with formatting

## API-Key Checklist

Implemented now:

- `GET /v1/orgs/integrations/workspace`
- `GET /v1/orgs/integrations/branding`
- `GET /v1/orgs/integrations/auth-config`
- `GET /v1/orgs/integrations/clients`
- `GET /v1/orgs/integrations/members`
- `GET /v1/orgs/integrations/invites`
- `GET /v1/orgs/integrations/activity`
- `GET /v1/orgs/integrations/effective-policy`
- `PATCH /v1/orgs/integrations/branding`
- `PATCH /v1/orgs/integrations/auth-config`
- `POST /v1/orgs/integrations/clients`
- `PATCH /v1/orgs/integrations/clients/{client_id}`
- `PATCH /v1/orgs/integrations/clients/{client_id}/status`
- `POST /v1/orgs/integrations/clients/{client_id}/rotate-secret`
- `DELETE /v1/orgs/integrations/clients/{client_id}`
- `POST /v1/orgs/integrations/invites`
- `DELETE /v1/orgs/integrations/invites/{invite_id}`
- `PATCH /v1/orgs/integrations/members/{member_id}/role`
- `DELETE /v1/orgs/integrations/members/{member_id}`

Needs broader scope than a workspace API key:

- `POST /v1/orgs/current/api-keys`
- `DELETE /v1/orgs/current/api-keys/{key_id}`
- `POST /v1/orgs`
- `GET /v1/orgs`
- `DELETE /v1/orgs/{workspace_id}`
- member pause or suspend routes do not exist yet
- tenant-wide or platform-wide management needs a broader tenant/platform key

## Local Example Routes

These are the local routes served by `5193`:

- `GET /api/rooiam/workspace`
- `GET /api/rooiam/branding`
- `GET /api/rooiam/auth-config`
- `GET /api/rooiam/clients`
- `GET /api/rooiam/members`
- `GET /api/rooiam/invites`
- `GET /api/rooiam/activity`
- `GET /api/rooiam/effective-policy`
- `PATCH /api/rooiam/branding`
- `PATCH /api/rooiam/auth-config`
- `POST /api/rooiam/clients`
- `PATCH /api/rooiam/clients/:clientId`
- `PATCH /api/rooiam/clients/:clientId/status`
- `POST /api/rooiam/clients/:clientId/rotate-secret`
- `DELETE /api/rooiam/clients/:clientId`
- `POST /api/rooiam/invites`
- `DELETE /api/rooiam/invites/:inviteId`
- `PATCH /api/rooiam/members/:memberId/role`
- `DELETE /api/rooiam/members/:memberId`

Each local route:

1. receives the browser request on `5193`
2. calls the real Rooiam endpoint on `5170`
3. sends the JSON response back to the browser

## Local config

1. Create a workspace API key in `rooiam-app`.
2. Put it in `.env`.

## Run

```bash
cd rooiam/rooiam-examples/example-3-backend
npm install
npm run dev
```

Then open:

```text
http://localhost:5193
```
