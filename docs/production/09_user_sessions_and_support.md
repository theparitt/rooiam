# Users, Sessions, and Device Access

This chapter is the day-2 operator and tenant-admin review path.

## 1. Platform Operator in `rooiam-admin`

Use `rooiam-admin` for:

- reviewing instance users
- reviewing organizations
- reviewing audit logs
- checking linked external identities
- managing instance settings

## 2. Tenant Admin in `rooiam-app`

Use `rooiam-app` for:

- inviting staff
- changing member roles
- reviewing workspace activity
- managing company apps
- managing company API keys

## 3. My Login / Device Access

Inside `My Login`, a signed-in tenant admin can review and manage:

- passkeys
- linked Google/Microsoft providers
- TOTP MFA status
- backup/recovery codes

## 4. Session and Device Model

Rooiam uses opaque server-backed browser sessions.

The system records session metadata such as:

- IP
- user agent
- creation time
- last seen time

Current feature surface includes session listing and revocation at the identity/API level.

## 5. Operational Review Checklist

After production launch, review:

1. SMTP delivery is working
2. OAuth provider sign-in works
3. tenant branding works on hosted login
4. passkey registration works on supported devices
5. MFA enrollment and recovery codes work
6. workspace invites work
7. OAuth clients and API keys can be created and revoked
8. audit logs record important auth/admin activity

