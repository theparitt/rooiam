# API Key Cookbook

Use a workspace API key when your backend needs to manage one workspace without a browser session.

Use it for:
- members
- invites
- apps
- workspace info
- activity

Do not use it for:
- human sign-in
- hosted widget login
- OIDC browser redirects

## Request Pattern

```http
Authorization: Bearer rooiam_wk_...
Content-Type: application/json
```

Base path:

```text
https://auth.example.com/v1/orgs/integrations
```

## Read Workspace

```bash
curl https://auth.example.com/v1/orgs/integrations/workspace \
  -H "Authorization: Bearer $ROOIAM_WORKSPACE_API_KEY"
```

## List Members

```bash
curl "https://auth.example.com/v1/orgs/integrations/members?page=1&page_size=20&sort_by=created_at&sort_order=desc" \
  -H "Authorization: Bearer $ROOIAM_WORKSPACE_API_KEY"
```

Useful query params:
- `page`
- `page_size`
- `sort_by`
- `sort_order`
- `q` (display name, email, or role)
- `role` and `status`

The list is searched and paginated in PostgreSQL. `GET
/v1/orgs/integrations/members/by-user/{user_id}` looks up one member by
their stable RooIAM user ID within the key's workspace. Check the returned
`status` before using membership as an admission signal.

## Invite A Member

```bash
curl https://auth.example.com/v1/orgs/integrations/invites \
  -X POST \
  -H "Authorization: Bearer $ROOIAM_WORKSPACE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dev@example.com"
  }'
```

The response includes `invite_id`, `email`, and `expires_at`. RooIAM sends a
membership invitation, not an application-specific staff role. A recipient
must explicitly accept or decline it. To check the outcome, call
`GET /v1/orgs/integrations/invites?status=all` or
`GET /v1/orgs/integrations/invites/{invite_id}`. Status is `pending`,
`accepted`, `declined`, `revoked`, or `expired`; `accepted_user_id` identifies
the accepting account. Re-sending after a terminal outcome creates a new
invitation record. Only `pending` invitations can be revoked.
The send endpoint and tenant portal share a workspace limit of 100 invitations
per UTC day and a 10-minute cooldown for the same recipient. A limit returns
HTTP 429.

For application sign-in and a user's own sessions, use the OIDC BFF flow and
its server-held user access token described in the
[BFF guide](./20_bff_user_token_integration.md). A workspace API key cannot
act as that user.

## List Workspace Apps

```bash
curl "https://auth.example.com/v1/orgs/integrations/clients?page=1&page_size=20" \
  -H "Authorization: Bearer $ROOIAM_WORKSPACE_API_KEY"
```

## Create A Workspace App

```bash
curl https://auth.example.com/v1/orgs/integrations/clients \
  -X POST \
  -H "Authorization: Bearer $ROOIAM_WORKSPACE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "app_name": "Acme Portal",
    "app_type": "web",
    "redirect_uris": ["https://app.example.com/callback"],
    "allowed_embed_origins": ["https://app.example.com"]
  }'
```

If one app spans multiple origins, Rooiam may require explicit confirmation.

## Read Activity

```bash
curl "https://auth.example.com/v1/orgs/integrations/activity?page=1&page_size=50&action=suspicious" \
  -H "Authorization: Bearer $ROOIAM_WORKSPACE_API_KEY"
```

## Common Errors

### `401 Unauthorized`
- missing or invalid API key

### `403 Forbidden`
- valid key, wrong scope or role

### `422 Unprocessable Entity`
- invalid redirect URI
- invalid allowed embed origin
- multi-origin app confirmation missing

## Good `0.1` Rule

Keep the machine boundary simple:
- one workspace API key
- one backend integration
- one workspace boundary
