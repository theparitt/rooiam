# Chapter 4: Social Logins and External Identities

Google and Microsoft sign-in let Rooiam delegate identity proof to an external provider. Rooiam then maps that provider identity to its own stable user UUID.

## Provider identity is the primary lookup

`external_identities` stores `provider` and `provider_user_id` with a uniqueness constraint on the pair. The provider's subject identifier maps to `provider_user_id`; the database column is not named `sub`.

`OAuthService::get_or_create_user_from_identity` follows this order:

1. Look up the existing external identity by provider and provider user ID.
2. If the provider email is considered verified, look for an existing Rooiam user with that email and link the external identity.
3. Otherwise create the new user and external-identity records through the identity repository.

This means Rooiam **does support automatic linking through verified provider email**. It does not unconditionally link every matching, unverified email. Explicit account-linking flows have additional session and verification requirements.

## Why verification matters

Imagine a provider lets someone type another person's email without proving ownership. Linking that identity to an existing Rooiam account would let the attacker impersonate the account owner. The `email_verified` decision is therefore part of the trust boundary, not just profile metadata.

Provider-specific interpretation happens before the common linking function. Read `fetch_provider_identity` when auditing which Google or Microsoft claims are trusted.

## The callback flow

The OAuth handlers create temporary state in Redis, redirect to the provider, validate the returning state/context, exchange the provider authorization code, and fetch provider identity. The resulting Rooiam login still passes through policy and MFA handling before session completion.

Provider callback URLs normally derive from `ROOIAM_SERVER_URL`:

```text
/api/v1/auth/google/callback
/api/v1/auth/microsoft/callback
```

These compatibility callback paths are deliberately registered outside the normal `/v1/oauth` route scope. Do not replace them in provider settings solely because most REST APIs use `/v1`.

Provider OAuth login is separate from Rooiam's own OIDC provider. In this chapter Rooiam is the client of Google/Microsoft; in Chapter 6 downstream applications are clients of Rooiam.

## Exercises

1. What happens when the same provider subject returns with a changed email?
2. Find the branch that requires `email_verified` before linking an existing user.
3. Trace the OAuth state validation and explain why provider code exchange alone is insufficient to bind the login to its initiating browser.

## Follow the source

- [rooiam-server/src/modules/oauth/service.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/oauth/service.rs)
- [rooiam-server/src/modules/oauth/handlers.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/oauth/handlers.rs)
- [rooiam-server/src/modules/identity/repository.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/identity/repository.rs)
