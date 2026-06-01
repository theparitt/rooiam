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
- `search`

## Invite A Member

```bash
curl https://auth.example.com/v1/orgs/integrations/invites \
  -X POST \
  -H "Authorization: Bearer $ROOIAM_WORKSPACE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dev@example.com",
    "role": "member"
  }'
```

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
