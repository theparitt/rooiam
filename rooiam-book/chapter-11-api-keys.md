# Chapter 11: Machine Identity and API Keys

Automation needs a noninteractive credential. Rooiam provides workspace API keys for server-to-server integration routes. These keys are separate from browser cookies and OIDC tokens.

## Key generation and storage

Creation is implemented in `modules/organization/handlers.rs`. It generates 32 random bytes, encodes them as base64url without padding, and prefixes the result with `rooiam_`.

```text
Authorization: Bearer rooiam_<random-secret>
```

`X-API-Key` is also accepted by the integration key extractor. Keep the key on the application server, not in frontend bundles or widget URLs.

The response returns `raw_key` once. The database stores its SHA-256 hash and a display prefix of the first 12 characters. It uses the table `tenant_api_keys`, with:

| Column | Meaning |
|---|---|
| `org_id` | Workspace boundary |
| `created_by` | Creating user |
| `label`, `key_prefix` | Display metadata |
| `key_hash` | Hash of the entire raw credential |
| `permission_preset`, `allowed_permissions` | Issued integration permissions |
| `expires_at`, `revoked` | Expiry and boolean revocation state |
| `created_at`, `last_used_at` | Lifecycle timestamps |

There is no current `modules/api_keys` module, `api_keys.scopes` array, or `revoked_at` column for these keys.

## Request handling

`resolve_workspace_api_key_context` hashes the supplied credential, joins its record to the workspace, rejects revoked/expired keys, updates `last_used_at`, and records `api_key.used`. Integration handlers then enforce required permissions and operation-specific policy.

The key's workspace ID comes from the database lookup. An arbitrary caller-supplied workspace ID cannot expand that key's scope. The resolver is used by integration endpoints; it is not a universal bearer-token middleware for every API route.

## Permission presets

The current presets are `workspace_owner` and `workspace_admin`. Examples of permissions include `workspace.read`, `members.read`, `clients.create`, and `activity.read`.

The permission check accepts a permission found in the stored allowed list **or** in the preset's permissions. It is not a generic `*` wildcard model, and it is not the intersection of the creator's live RBAC permissions with arbitrary scopes.

Revocation changes `revoked` to true. Rotation operationally means creating a replacement, updating consumers, and revoking the old key. Optional expiry also terminates access; deletion is not the only lifecycle boundary.

## Try a read-only request

```bash
curl http://localhost:5170/v1/orgs/integrations/workspace \
  -H "Authorization: Bearer $ROOIAM_WORKSPACE_API_KEY"
```

`ROOIAM_WORKSPACE_API_KEY` here is your downstream shell variable, not a server bootstrap setting. Use an issued key from the matching instance and workspace.

## Exercises

1. Explain why a key hash in a database dump cannot directly authenticate as the raw key.
2. Compare the two presets in `workspace_api_key_permissions_for_preset`.
3. Find the key-revocation query and explain its workspace filter.

## Follow the source

- [rooiam-server/src/modules/organization/handlers.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/organization/handlers.rs)
- [rooiam-server/src/modules/organization/integration.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/organization/integration.rs)
- [rooiam-server/migrations/0012_tenant_api_keys.sql](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/migrations/0012_tenant_api_keys.sql)
- [rooiam-server/migrations/0053_tenant_api_key_permissions.sql](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/migrations/0053_tenant_api_key_permissions.sql)
- [rooiam-server/migrations/0054_rename_api_key_owner_preset.sql](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/migrations/0054_rename_api_key_owner_preset.sql)
