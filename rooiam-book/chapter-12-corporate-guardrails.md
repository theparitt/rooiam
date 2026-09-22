# Chapter 12: Corporate Guardrails

Organizations need controls over sign-in, session lifetime, and administration. Rooiam provides policies for these needs; enabling them does not itself certify an installation for a regulatory framework.

## Settings live in several places

| Control | Current representation |
|---|---|
| Allowed email domains | `organizations.allowed_email_domains`, comma-separated text |
| Maximum session age | `organizations.max_session_age_hours` |
| Concurrent sessions | `organizations.max_concurrent_sessions` |
| Idle timeout | Effective `idle_timeout_minutes` policy |
| Workspace availability | `organizations.status` plus `platform_locked` |
| Platform defaults | `system_settings` |
| Network restrictions | IP-policy fields and effective policy resolvers |
| Audit retention | `system_settings.audit_log_retention_days` |

These are not one `organizations.is_locked` switch or a collection of `*_secs` fields. Null/inherited settings and explicit zero values can have different meanings; consult the relevant policy response before changing them.

## Login checks and request checks

Auth-method and email-domain checks operate in login context. Session middleware also evaluates session age, idle behavior, network policy, and other active-session constraints. Operator, tenant-portal, and workspace access are separate policy surfaces.

A suspended workspace and a platform lock serve different purposes. Platform locking prevents a tenant from undoing an operator-imposed restriction. It does not replace the workspace's status or membership checks.

## Trusted proxies

Only trust forwarded client-IP headers from your actual proxy ranges, configured through `ROOIAM_TRUSTED_PROXY_CIDRS`. Otherwise use the socket peer identity. The extracted IP feeds both network restrictions and abuse controls.

A VPN allowlist answers where a request comes from; it does not establish user identity or eliminate the need for authorization. Network changes and shared NATs also affect legitimate users.

## Policy inheritance and operations

Platform defaults, tenant settings, workspace settings, and per-user governance overrides are resolved by different helpers. Review effective values, not just one database field. For example, workspace-count defaults are currently five, while explicit governance can change a user's effective limit.

Session termination must also be considered separately from downstream application sessions. Rooiam can revoke its own sessions and associated refresh credentials; an application retaining its own session needs an appropriate local invalidation policy.

Audit retention is an operator-selected duration. The code does not impose a universal seven-year compliance requirement and deliberately prunes logs when configured.

## Exercises

1. Find where `platform_locked` prevents tenant-controlled reactivation.
2. Compare operator and workspace IP-policy resolution.
3. Trace the effective idle timeout for a tenant-portal session and a downstream workspace session.

## Follow the source

- [rooiam-server/src/shared/ip_policy.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/shared/ip_policy.rs)
- [rooiam-server/src/shared/operator_policy.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/shared/operator_policy.rs)
- [rooiam-server/src/shared/tenant_access.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/shared/tenant_access.rs)
- [rooiam-server/src/modules/admin/session_policies.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/admin/session_policies.rs)
- [rooiam-server/src/http/middleware/auth.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/http/middleware/auth.rs)
- [rooiam-server/src/shared/workspace_governance.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/shared/workspace_governance.rs)
