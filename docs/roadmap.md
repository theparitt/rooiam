# Rooiam 0.2 — Trusted Device & QR Authentication

Status: **implementation preview; real-device and release certification pending**. Updated: 2026-09-23.
The current package version remains `0.1.0`. Code in the checkout is not a certification of the complete mobile experience.

**Scan. Match. Approve.**

The goal of 0.2 is for a developer to integrate Rooiam, display a QR code, and let an existing user scan it with an enrolled Android phone, verify the number and request details, approve, and securely finish signing in to the requesting browser.

Rooiam remains the **self-hosted passwordless IAM for multi-tenant SaaS**. Trusted-device approval extends hosted login and OIDC while preserving workspace policies, MFA, and application-owned sessions.

## What exists and what comes next

| Area | Current checkout | 0.2 goal |
|---|---|---|
| Identity platform | Passwordless login, workspaces, hosted login, OIDC and session lifecycle | Preserve these flows and tenant boundaries |
| Integration | OpenAPI snapshot and browser/server TypeScript SDK packages | Validate device-login coverage and provide tested helpers and examples |
| Trusted devices | Registration, revocation, device-token hashes, Ed25519 approval signatures and attestation verification paths | Prove enrollment and revocation with a real Android client |
| Login intents | PostgreSQL intent storage; start, status, approve, reject, cancel and browser-bound completion | Verify replay, races, policy enforcement and failure recovery end to end |
| User experience | Android and hosted QR implementations build locally; real-phone journey is not yet certified | Verify and ship the Android scan/approve flow and hosted-login QR experience together |
| Operations | Docker stacks, existing docs and test runners | Reproduce setup, upgrades and the reference login from a fresh clone |

See the [SDK and device-login reference](./reference/13_sdk_and_device_login.md) for today's API boundaries.

## The intended experience

1. An existing user signs in using an existing Rooiam method and enrolls an Android phone.
2. A workspace-enabled hosted login starts a short-lived request bound to that browser and registered application.
3. The phone scans the QR and shows the trusted server, application/workspace context and number-matching prompt.
4. The user checks the request and number, then explicitly approves or denies.
5. The requesting browser completes the approved intent once. Required MFA still applies; downstream apps finish through their existing callback/session flow.

A QR scan or matching number alone must never authenticate anyone. The phone must prove its registered identity. QR payloads must never contain session tokens, device credentials or reusable login credentials.

## Delivery phases

These are gates within **0.2**, replacing the older plan that spread server, widget and Android work across 0.3–0.6. Dates are not promised.

| Phase | Deliverable | Exit gate |
|---|---|---|
| A — Contract and security review | Reconcile the existing wire contract, state transitions, browser binding and Android key storage | Written protocol, threat model, compatibility decisions and regression matrix |
| B — Device and completion hardening | Validate enrollment, signatures, revocation, tenant policy, expiry and single-use completion | Live database tests prove isolation, replay rejection and safe concurrent completion |
| C — Android and hosted login | Enroll, scan, match, approve/deny, cancel and recover from errors | Real phone and browser complete the flow, including MFA and revoked-device failures |
| D — Developer experience | Extend existing TypeScript SDKs and one reference demo; document setup and self-host requirements | Fresh-clone walkthrough reaches first login without undocumented steps |
| E — Release verification | Automated regressions, Android evidence, audit/log checks and operator instructions | All required checks pass with no unresolved authentication bypass or critical security finding |

Security tests and audit work accompany every phase. Phase E collects evidence; it is not the first security review.

## Release acceptance

- [ ] An existing user enrolls an Android device with protected key material and can revoke it.
- [ ] The phone validates the configured server before sending credentials; malformed or substituted QR data fails safely.
- [ ] Correct number matching and explicit approval complete only the requesting browser's intent.
- [ ] Wrong signatures, expired requests, denied/cancelled requests and revoked devices cannot log in.
- [ ] Replays and concurrent approval/completion attempts produce at most one successful authentication result per intent.
- [ ] Two users, phones, browsers, clients and workspaces remain isolated; required MFA is preserved.
- [ ] Network loss, reload, server restart and database failure have documented, safe recovery behavior.
- [ ] Audit events identify the operation and outcome without exposing credentials; rate limits are verified under production settings.
- [ ] TypeScript integration, Android flow and a fresh-clone demo pass the documented release checks.
- [ ] Setup, attestation requirements, backup/restore and upgrade guidance match the shipped configuration.

## Scope after 0.2

Tenant/operator polish and production evidence continue toward 0.3 and a stable 1.0. iOS, push approval, a Rust SDK, broader sensitive-action approval and advanced risk policy remain follow-up candidates, with sequencing based on actual integration needs. Existing server support for attestation or push-token storage does not promise a shipped iOS app or push delivery.

SAML, SCIM, password-login expansion, payment workflows and broad enterprise features are outside this milestone. The demo's ease of use must not depend on weakening production security defaults.

The [maintainer implementation plan](./internal/43_v0.2_plan_brief.md) records the concrete code locations, protocol decisions and verification work.
