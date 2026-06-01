# Account Linking

Rooiam should treat account linking as an explicit identity action, not as a side effect of provider testing.

This document defines the recommended v1 account-linking model for:

- admin accounts
- tenant/end-user accounts
- Google and Microsoft today
- future providers later

Implementation breakdown:

- [Account Linking Implementation Plan](/home/theparitt/work/rooiam/docs/account_linking_implementation.md)

## Goal

One internal Rooiam user should be able to own multiple authentication methods:

- magic link
- Google
- Microsoft
- passkey
- future password or other providers if needed

This prevents one person from accidentally becoming multiple Rooiam users.

## Core Rule

Testing is not linking.

Keep these actions separate:

- `Provider test`
  - validates OAuth app configuration
  - should not create a session
  - should not create a new user
  - should not link accounts

- `Login`
  - authenticates a user
  - may create a new user only in allowed end-user flows
  - should not silently merge two existing identities

- `Link account`
  - explicit action by a signed-in user
  - attaches a provider identity to the current internal user

## Current Problem It Solves

Example:

- `theparitt@gmail.com` is the superuser and is linked to Google
- `I-w-I@outlook.com` is linked to Microsoft

Today those are two different internal users, so Microsoft admin login is correctly blocked.

With explicit account linking, one signed-in admin could intentionally link Microsoft onto the same internal user and then use either provider later.

## Recommended UX

Add a new section in admin settings:

- `Settings > Linked Accounts`

For the signed-in user, show:

- primary email
- magic-link status
- Google: `Linked` / `Not linked`
- Microsoft: `Linked` / `Not linked`
- passkeys count
- MFA status

Actions:

- `Link Google`
- `Link Microsoft`
- `Unlink Google`
- `Unlink Microsoft`

Suggested copy:

- `Link a provider to this Rooiam account so you can sign in with either method later.`

## Recommended Linking Flow

### Link Provider

1. User signs in to Rooiam normally.
2. User opens `Settings > Linked Accounts`.
3. User clicks `Link Google` or `Link Microsoft`.
4. Rooiam starts OAuth with a dedicated linking state:
   - `intent=link`
   - `provider=google|microsoft`
   - `user_id=current_user`
5. Provider callback returns to Rooiam.
6. Rooiam validates:
   - session is still present
   - linking state is valid
   - provider identity is not already linked to another user
7. If valid, Rooiam inserts the provider into `external_identities` for the current user.
8. Rooiam writes an audit log event.
9. UI returns to `Settings > Linked Accounts` with `Linked successfully`.

### Unlink Provider

1. User clicks `Unlink`.
2. Rooiam blocks unlink if it would remove the last viable sign-in method.
3. For high-risk cases, require recent re-auth or MFA.
4. Rooiam removes the provider link.
5. Rooiam writes an audit log event.

## Safety Rules

These rules matter more than convenience.

### Never auto-link during provider test

`Settings > OAuth` test buttons should only validate configuration.

They must not:

- create users
- replace the admin session
- link the provider
- grant admin access

### Never auto-link just because emails look similar

Do not merge identities automatically during provider testing.

For normal end-user login, email-based matching can still be allowed under controlled rules, but explicit linking should remain separate.

### Block linking if provider is already attached elsewhere

If a Google or Microsoft identity is already linked to another Rooiam user:

- do not reassign it silently
- show a clear error
- require manual recovery/admin intervention if needed

### Require strong auth for admin linking changes

For admin users, linking and unlinking should require:

- an active admin session
- ideally recent re-auth or MFA challenge

### Preserve at least one usable sign-in method

Do not allow unlinking that would leave the user unable to sign in.

Examples:

- block unlink if user has no other provider, no passkey, and no magic-link route
- warn strongly before unlinking the last OAuth provider

## API Shape

Recommended endpoints:

- `GET /v1/identity/me/linked-accounts`
- `POST /v1/identity/me/linked-accounts/google/start`
- `POST /v1/identity/me/linked-accounts/microsoft/start`
- `POST /v1/identity/me/linked-accounts/{provider}/unlink`

Recommended callback behavior:

- reuse existing OAuth callback route
- branch on state intent:
  - `intent=login`
  - `intent=test`
  - `intent=link`

That keeps one callback endpoint but makes the behavior explicit and auditable.

## Data Model

Rooiam already has `external_identities`, which is the right place for provider links.

Recommended shape:

- `external_identities`
  - `user_id`
  - `provider`
  - `provider_user_id`
  - `email`
  - `created_at`

Useful additions later:

- `linked_by_user_id`
- `last_used_at`
- `metadata jsonb`

## Audit Events

Add explicit audit events:

- `identity.link.google`
- `identity.link.microsoft`
- `identity.unlink.google`
- `identity.unlink.microsoft`
- `identity.link.failed`

For admin accounts, this should be visible in the admin audit log.

## Admin Policy

For admin console access:

- provider must be enabled for admin login
- resulting internal Rooiam user must be the admin/superuser user

So after linking, admin OAuth works because both providers resolve to the same internal user.

That is the correct reason for linking. It should not bypass admin policy; it should satisfy admin policy cleanly.

## Suggested Implementation Order

1. Add `Settings > Linked Accounts` UI.
2. Add `GET /v1/identity/me/linked-accounts`.
3. Add provider linking start flow with explicit `intent=link`.
4. Handle provider callback linking branch.
5. Add unlink with safety checks.
6. Add audit events.
7. Add re-auth or MFA requirement for unlink and admin linking.

## What Not To Do

Avoid these shortcuts:

- auto-link during OAuth provider test
- auto-link during setup wizard
- silently merge two existing internal users
- allow unlinking the last usable sign-in method
- allow provider testing to replace the current admin session

## Product Guidance

Keep the user mental model simple:

- `Setup Wizard`
  - configure providers

- `Settings > OAuth`
  - verify provider app configuration
  - enable provider for admin login

- `Settings > Linked Accounts`
  - attach Google/Microsoft to the current identity

That separation is clearer, safer, and easier to support.
