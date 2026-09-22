# Chapter 8: RBAC and Permission Roles

Authentication identifies the caller. Authorization determines which actions that caller may perform in a particular workspace or at platform scope.

## The permission graph

Rooiam uses these database relationships:

```text
organization_members -> member_roles -> roles
roles -> role_permissions -> permissions
```

`member_roles` contains `member_id` and `role_id`. `role_permissions` contains `role_id` and `permission_id`; the permission code belongs to `permissions.code`.

This read-only query mirrors the permission lookup in `RbacRepository`:

```sql
SELECT DISTINCT p.code
FROM permissions p
JOIN role_permissions rp ON p.id = rp.permission_id
JOIN member_roles mr ON rp.role_id = mr.role_id
JOIN organization_members om ON mr.member_id = om.id
WHERE om.user_id = $1
  AND om.organization_id = $2
  AND om.status = 'active';
```

The UUID parameters must come from an authorized request context. This query computes permissions; it does not by itself authorize every resource referenced by the request.

## Current workspace roles

The built-in workspace roles are `owner`, `admin`, and `member`. Migration `0052_remove_manager_viewer_roles.sql` removed `manager` and `viewer`, mapping existing memberships to `admin` and `member` respectively.

Owner is handled through ownership transfer rather than being an ordinary assignable dropdown role. Handler-level ownership rules protect sensitive actions. Platform privileges are represented separately, including flags on `users`, and use operator-specific authorization paths.

The repository also implements organization-scoped custom-role operations and permission lookup. Do not infer that custom roles can bypass owner-only actions, platform locks, or app-governance rules. Those checks remain separate.

## Permission vocabulary

Use the actual permission catalog and handler checks. Workspace API keys have a separate permission vocabulary such as `members.read` and `clients.create`; these are not interchangeable with arbitrary `users:read` or wildcard scopes.

The API key's issued permissions are also not a live impersonation of every permission its creator currently holds. Key-authenticated integration handlers resolve their own workspace context and enforce the key and operation policies.

## Exercises

1. Explain why the same user can have different effective permissions in two workspaces.
2. Trace a custom-role operation and identify its organization boundary.
3. Find the ownership-transfer path and compare it with an ordinary member role update.

## Follow the source

- [rooiam-server/src/modules/rbac/repository.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/rbac/repository.rs)
- [rooiam-server/src/modules/rbac/service.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/rbac/service.rs)
- [rooiam-server/src/modules/rbac/handlers.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/rbac/handlers.rs)
- [rooiam-server/migrations/0052_remove_manager_viewer_roles.sql](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/migrations/0052_remove_manager_viewer_roles.sql)
- [rooiam-server/src/modules/organization/integration.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/organization/integration.rs)
