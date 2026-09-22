# Chapter 9: MFA and Passkeys

Rooiam supports TOTP as an additional login challenge and WebAuthn passkeys as a passwordless authentication method. It does not require both on every login. Effective policy and the login path determine the challenge.

## Different kinds of proof

A magic link proves access to a mailbox; it is not a memorized knowledge factor. A TOTP app proves possession of a shared secret. A passkey uses an authenticator-held private key and can include local user verification. Passkeys may be synced or device-bound; Rooiam does not claim every passkey is permanently tied to one physical device.

## Current TOTP storage

| Table | Purpose |
|---|---|
| `user_mfa_methods` | Enrolled method, encrypted secret, verification timestamp |
| `mfa_challenges` | Temporary enrollment/login/recovery context with expiry and used state |
| `user_mfa_backup_codes` | Hashed recovery codes and use timestamps |

The code uses `totp-rs`. Enrollment creates a temporary challenge and exposes the secret/`otpauth` URI so an authenticator can be configured. Successful confirmation persists the verified method. Login and recovery flows consume their respective challenge state.

Secrets use AES-256-GCM-SIV encryption in `MfaService`. The encryption key is derived from `config.oidc.signing_secret`; this is important backup and key-management context. Replacing that secret without migration can make existing encrypted MFA material unreadable. It is distinct from rotating a database-managed RSA JWT signing key.

Recovery codes are hashed and tracked separately. Do not assume a `totp_used_windows` table exists: current migrations use the method/challenge/recovery-code tables listed above.

## Current passkey storage

`user_passkeys` stores credential identifiers, a serialized credential, user ownership, labels, and usage metadata. `webauthn_challenges` stores temporary challenge state, including JSON state introduced by migration `0006`.

The `webauthn` module uses the WebAuthn library to run registration and authentication ceremonies. Relying-party ID, origin, challenge, and credential verification matter together. Configure `ROOIAM_WEBAUTHN_RP_ID`, `ROOIAM_WEBAUTHN_ORIGIN`, and any intentionally allowed extra origins for the deployed environment.

## Trusted-device approval is separate

The `device_login` module implements trusted-device registration and browser login approval with Apple App Attest and Google Play Integrity support. This is a separate protocol from WebAuthn passkeys and TOTP. A server implementation does not imply that a bundled native mobile authenticator app is available.

## Exercises

1. Trace TOTP enrollment from temporary challenge to verified method.
2. Find the recovery-code consumption query and compare it with magic-link consumption.
3. Explain why changing an app's domain can affect passkey authentication even when its user database is unchanged.

## Follow the source

- [rooiam-server/src/modules/mfa/service.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/mfa/service.rs)
- [rooiam-server/src/modules/mfa/repository.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/mfa/repository.rs)
- [rooiam-server/src/modules/webauthn/service.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/webauthn/service.rs)
- [rooiam-server/migrations/0005_passkeys.sql](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/migrations/0005_passkeys.sql)
- [rooiam-server/migrations/0006_webauthn_registration_state.sql](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/migrations/0006_webauthn_registration_state.sql)
- [rooiam-server/migrations/0007_mfa.sql](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/migrations/0007_mfa.sql)
- [rooiam-server/migrations/0008_mfa_backup_codes.sql](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/migrations/0008_mfa_backup_codes.sql)
- [rooiam-server/src/modules/device_login/service.rs](https://github.com/theparitt/rooiam/blob/c20b9edfa8ce23649fd9107b35f9f20e1251b39b/rooiam-server/src/modules/device_login/service.rs)
