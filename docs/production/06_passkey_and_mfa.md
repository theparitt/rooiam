# Passkey and MFA Policy

This chapter explains how tenant login policy works today.

## 1. Sign-In Methods

Tenant admins can enable or disable:

- Magic link
- Google
- Microsoft
- Passkey

These are primary sign-in methods.

## 2. MFA Requirement

`Require MFA` is separate from `Passkey`.

Current behavior:

- passkey is a sign-in method
- TOTP is the MFA method
- if a workspace requires MFA, Rooiam checks whether the user already has TOTP enrolled

## 3. Client Experience

If workspace MFA is **not** required:

- user signs in with one allowed method
- login completes

If workspace MFA **is** required and TOTP is already enrolled:

- user signs in with the first method
- user enters TOTP code
- login completes

If workspace MFA **is** required and the user has no TOTP yet:

- Rooiam starts MFA enrollment
- user adds the secret to an authenticator app
- user enters the first code
- login completes
- recovery codes are shown

## 4. Passkey

Passkey can be used as the primary login step when enabled.

Examples:

- passkey only: device biometric / PIN login
- passkey + require MFA: passkey first, then TOTP

## 5. Tenant Admin Self-Access

Inside `My Login`, a tenant admin can manage:

- passkeys
- linked Google/Microsoft accounts
- TOTP MFA
- backup code regeneration

