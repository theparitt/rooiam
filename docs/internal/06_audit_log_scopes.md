# Audit Log Scopes Reference

## Overview

Rooiam has 5 audit log levels. Every event that is logged appears in every level where its scope matches.

## Audit Log Levels

### 1. Platform Admin Log (`/admin/audit-logs`)
**Who sees it**: Platform operators (admin console only)
**Scope**: Events with `organization_id IS NULL` OR `is_platform_org = true` — platform-level system events only
**Examples**: Platform settings changed, demo seed events, system-level actions

### 2. Tenant Log — Admin Console (`/admin/tenant/audit-logs`)
**Who sees it**: Platform operators (admin console only)
**Scope**: All events across ALL tenant workspaces (`is_platform_org = false`) — full platform-wide view of tenant activity

### 3. Workspace Log — Admin Console (`/admin/organizations/{id}/audit-logs`)
**Who sees it**: Platform operators (admin console only)
**Scope**: All events scoped to one specific workspace (`organization_id = {id}`) — every actor, every action

### 4. User Log — Admin Console (`/admin/users/{id}/audit-logs`)
**Who sees it**: Platform operators (admin console only)
**Scope**: Everything a specific user did (`actor_user_id = {id}`) — across all workspaces

### 5. Tenant Audit Log — Portal (`/v1/orgs/tenant/activity`)
**Who sees it**: Workspace owners and admins (portal)
**Scope**: All events across workspaces where the viewer is owner or admin

### 6. Workspace Audit Log — Portal (`/v1/orgs/workspace/activity`)
**Who sees it**: Workspace owners and admins (portal)
**Scope**: All events in the currently active workspace (`organization_id = current_org_id`)

### 7. My Audit Log — Portal (`/v1/me/audit-logs`)
**Who sees it**: Any authenticated user (portal)
**Scope**: Everything the current user personally did (`actor_user_id = current_user_id`)

## Event → Log Mapping

| Action | Platform Log | Tenant Log (Admin) | Workspace Log | User Log | Portal Tenant Log | Portal Workspace Log | My Log |
|--------|-------------|-------------------|---------------|----------|-------------------|---------------------|--------|
| `admin.oauth_client.deleted` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `admin.oauth_client.secret_rotated` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `admin.user.sessions_revoked` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `api_key.created` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `api_key.revoked` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auth.ip_policy.blocked` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auth.login.failed` | ❌ | ✅ (if org set) | ✅ (if org set) | ✅ | ✅ | ✅ | ✅ |
| `auth.login.success` | ❌ | ✅ (if org set) | ✅ (if org set) | ✅ | ✅ | ✅ | ✅ |
| `auth.login.suspicious` | ❌ | ✅ (if org set) | ✅ (if org set) | ✅ | ✅ | ✅ | ✅ |
| `auth.logout.success` | ❌ | ✅ (if org set) | ✅ (if org set) | ✅ | ✅ | ✅ | ✅ |
| `auth.magic_link.requested` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auth.mfa.backup_code.used` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auth.mfa.backup_codes.regenerated` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auth.mfa.challenge.failed` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auth.mfa.enrolled` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auth.mfa.enrollment.failed` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auth.mfa.enrollment.required` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auth.mfa.required` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auth.mfa.totp.disabled` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auth.passkey.deleted` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auth.passkey.login.failed` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auth.passkey.registered` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auth.passkey.renamed` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auth.session.binding_mismatch` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auth.sessions.revoked_all` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `demo.oauth.login.success` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| `identity.link.*` (dynamic) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `identity.unlink.*` (dynamic) | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `identity.profile.avatar_uploaded` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `identity.profile.updated` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `oauth.login.failed` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `oauth.login.success` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `oauth.token.issued` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `oauth.token.refreshed` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `oauth_client.created` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `oauth_client.deleted` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `oauth_client.secret_rotated` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `platform.signing_key.rotated` | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `tenant_auth_config.updated` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `user.account.deleted` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `user.account.deletion_requested` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `user.email.change_requested` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `user.email.changed` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `workspace.auth_policy.snapshot_restored` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `workspace.auth_policy.updated` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `workspace.invite.accepted` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `workspace.invite.revoked` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `workspace.invite.sent` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `workspace.member.removed` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `workspace.member.role_changed` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `workspace.owner_transfer.accepted` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `workspace.owner_transfer.initiated` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `workspace.role.created` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `workspace.role.deleted` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `workspace.status.updated` | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

> Note: The mapping above is inferred from the backend routing logic. "Platform Log" events are those where `organization_id IS NULL` and `is_platform_org = true`. Most user-initiated events attach an `organization_id` and therefore land in the tenant/workspace scopes, not the platform scope. Platform-only actions (key rotation, platform admin operations) have no org attachment and appear only in the Platform Log and User Log (by actor).

## Notes

- Action strings ending in `.*` are dynamically constructed (e.g. `identity.link.google`, `identity.link.microsoft`).
- The "My Log" always includes every event the current user was the actor of, regardless of org scope.
- The "User Log" in the admin console is equivalent to My Log but for any user as viewed by a platform operator.
- Portal logs are access-controlled: tenants only see their own workspaces; the workspace log is scoped to the currently active workspace session.
