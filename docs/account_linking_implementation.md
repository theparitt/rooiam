# Account Linking Implementation Plan

This document turns the account-linking design into concrete Rooiam implementation tickets.

Use this after reading [account_linking.md](/docs/account_linking.md).

## Goal

Allow one internal Rooiam user to explicitly link multiple provider identities:

- magic link
- Google
- Microsoft
- later other providers

without:

- auto-linking during provider tests
- silently merging accounts during setup
- replacing the active admin session

## Ticket 1: Linked Accounts Read API

Goal:

- show the signed-in user which login methods are already attached

API:

- `GET /v1/identity/me/linked-accounts`

Suggested response shape:

```json
{
  "primary_email": "theparitt@gmail.com",
  "magic_link": {
    "enabled": true
  },
  "providers": [
    {
      "provider": "google",
      "linked": true,
      "linked_email": "theparitt@gmail.com"
    },
    {
      "provider": "microsoft",
      "linked": false,
      "linked_email": null
    }
  ],
  "passkeys": 1,
  "totp_enabled": true
}
```

Backend files:

- add handler(s) under [identity/handlers.rs](/rooiam-server/src/modules/identity/handlers.rs)
- extend [identity/repository.rs](/rooiam-server/src/modules/identity/repository.rs)
- extend [identity/models.rs](/rooiam-server/src/modules/identity/models.rs)

Implementation notes:

- read primary email from `user_emails`
- read provider links from `external_identities`
- reuse existing passkey and MFA repositories if you want one compact security summary

Done when:

- the current user can see which providers are linked from the admin UI

## Ticket 2: OAuth State Intents

Goal:

- make OAuth callback behavior explicit by intent

Required intents:

- `login`
- `test`
- `link`

Backend files:

- update [oauth/handlers.rs](/rooiam-server/src/modules/oauth/handlers.rs)

Implementation notes:

- extend `OAuthStatePayload` to include:
  - `intent`
  - `provider`
  - `surface`
  - `link_user_id` when intent is `link`
- keep one callback endpoint, but branch behavior by intent

Suggested state shape:

```json
{
  "intent": "link",
  "provider": "microsoft",
  "surface": "admin",
  "final_redirect": "http://localhost:5171/settings?tab=linked-accounts",
  "link_user_id": "..."
}
```

Done when:

- provider test, login, and linking are distinct code paths in the callback logic

## Ticket 3: Start Linking Endpoints

Goal:

- let a signed-in user start explicit provider linking

API:

- `POST /v1/identity/me/linked-accounts/google/start`
- `POST /v1/identity/me/linked-accounts/microsoft/start`

Backend files:

- add routes under [identity/handlers.rs](/rooiam-server/src/modules/identity/handlers.rs)
- reuse OAuth URL generation from [oauth/handlers.rs](/rooiam-server/src/modules/oauth/handlers.rs)
- use [RequireAuth middleware](/rooiam-server/src/http/middleware/auth.rs)

Implementation notes:

- require an authenticated session
- generate OAuth state with `intent=link`
- redirect back to `Settings > Linked Accounts`
- do not reuse setup test behavior

Done when:

- a signed-in user can click `Link Google` or `Link Microsoft` and be redirected into provider auth

## Ticket 4: Callback Linking Branch

Goal:

- attach the provider identity to the current user during callback

Backend files:

- extend [oauth/handlers.rs](/rooiam-server/src/modules/oauth/handlers.rs)
- reuse [oauth/service.rs](/rooiam-server/src/modules/oauth/service.rs)
- extend [identity/repository.rs](/rooiam-server/src/modules/identity/repository.rs)

Implementation notes:

- provider callback should resolve:
  - `provider_user_id`
  - provider email
  - display data if needed
- if `intent=link`:
  - do not create a new login session
  - do not replace the current session
  - do not create a new user
  - link the provider onto `link_user_id`

Needed repository helpers:

- `get_external_identity_owner(provider, provider_user_id)`
- `list_external_identities_by_user_id(user_id)`
- reuse `link_external_identity(...)`

Safety rules:

- if provider identity already belongs to another user, reject with clear error
- if provider identity is already linked to this user, return success without duplicating

Done when:

- provider linking succeeds without changing the current signed-in identity

## Ticket 5: Linked Accounts UI

Goal:

- add a dedicated UI for account linking and unlinking

UI location:

- add a section or tab in [PlatformSettings.tsx](/rooiam-admin/src/pages/PlatformSettings.tsx)

Suggested label:

- `Linked Accounts`

Show:

- primary email
- magic link availability
- Google linked/not linked
- Microsoft linked/not linked
- passkey count
- MFA status

Actions:

- `Link Google`
- `Link Microsoft`
- `Unlink Google`
- `Unlink Microsoft`

Frontend files:

- extend [api.ts](/rooiam-admin/src/lib/api.ts)
- extend [PlatformSettings.tsx](/rooiam-admin/src/pages/PlatformSettings.tsx)

Done when:

- the admin can see and manage linked providers for the current account

## Ticket 6: Unlink Provider Endpoint

Goal:

- let a user remove a linked provider safely

API:

- `DELETE /v1/identity/me/linked-accounts/{provider}`

Backend files:

- add handler(s) under [identity/handlers.rs](/rooiam-server/src/modules/identity/handlers.rs)
- extend [identity/repository.rs](/rooiam-server/src/modules/identity/repository.rs)

Suggested repository helper:

- `delete_external_identity_for_user(user_id, provider)`

Safety checks:

- block unlink if it would remove the last usable sign-in path
- for admin accounts, prefer re-auth or MFA before unlink
- keep passkeys/MFA unrelated; unlinking Google should not delete passkeys

Done when:

- a user can unlink Google or Microsoft without being able to lock themselves out accidentally

## Ticket 7: Last Usable Sign-In Guard

Goal:

- prevent self-lockout by unlinking the last viable method

Backend files:

- extend [identity/repository.rs](/rooiam-server/src/modules/identity/repository.rs)
- add service logic under identity or auth module

Guard conditions should consider:

- primary email exists for magic-link login
- at least one external provider remains linked
- at least one passkey exists
- optional future password method

For v1, a simple rule is enough:

- do not allow unlink if the account would have:
  - no primary email
  - no external providers
  - no passkeys

Done when:

- unlink actions cannot remove the last practical sign-in method

## Ticket 8: Audit Events

Goal:

- make linking and unlinking visible and traceable

Events to add:

- `identity.link.google`
- `identity.link.microsoft`
- `identity.unlink.google`
- `identity.unlink.microsoft`
- `identity.link.failed`

Backend files:

- reuse [audit/service.rs](/rooiam-server/src/modules/audit/service.rs)
- emit from linking/unlink handlers

Metadata suggestions:

- provider
- linked email if available
- failure reason

Done when:

- account-link changes appear in the admin audit log

## Ticket 9: Re-Auth For Sensitive Linking Actions

Goal:

- make admin account linking changes safer

Scope:

- admin linking
- admin unlinking

Possible implementation:

- require recent MFA challenge
- or require recent sign-in age below a threshold

Backend files:

- extend [mfa/service.rs](/rooiam-server/src/modules/mfa/service.rs)
- possibly extend [session/service.rs](/rooiam-server/src/modules/session/service.rs)

This can be a later hardening ticket if you want a smaller first release.

Done when:

- sensitive provider-link changes for admin accounts require stronger proof than a stale session

## Ticket 10: Admin Login Policy After Linking

Goal:

- make linked providers satisfy admin login rules cleanly

Current policy:

- provider login allowed only if the resolved Rooiam user is the configured superuser

That policy should stay.

What changes:

- once Google and Microsoft are linked to the same internal user, either provider can pass the existing rule

Backend files:

- mostly already handled in [oauth/handlers.rs](/rooiam-server/src/modules/oauth/handlers.rs)

Done when:

- linked providers work for admin login without weakening superuser checks

## Suggested Implementation Order

1. Ticket 1: linked accounts read API
2. Ticket 2: OAuth state intents
3. Ticket 3: start linking endpoints
4. Ticket 4: callback linking branch
5. Ticket 5: linked accounts UI
6. Ticket 8: audit events
7. Ticket 6: unlink provider
8. Ticket 7: last usable sign-in guard
9. Ticket 10: confirm admin login policy works through linked identities
10. Ticket 9: add re-auth hardening

## Minimum Viable First Release

If you want the smallest useful version first:

- read linked accounts
- link Google
- link Microsoft
- no unlink yet
- audit events

That would already solve the admin Google/Microsoft split cleanly without overbuilding.
