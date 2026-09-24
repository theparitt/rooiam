# Rooiam Release Roadmap

Updated: 2026-09-24. **Canonical version sequence and scope.** This supersedes earlier version assignments in the device-login design, SDK phases and product-phase history. Versions below describe intended outcomes, not shipped capabilities or delivery dates.

Rooiam remains the **self-hosted passwordless IAM for multi-tenant SaaS**. Phone approval extends identity and access controls; payment, deployment and business workflows belong to consuming applications.

## Current decision

- **0.2 engineering milestone:** accepted for the documented **internal-test/beta** scope. Android SDK/reference, hosted browser QR, workspace method controls, application-owned callback/session, recovery tests, strict real-Google verification and a Play Protect-enabled fresh install on Redmi have recorded evidence. See the [release-scope checklist](./48_v0.2_exit_checklist.md) and [latest evidence](./49_v0.2_closeout_evidence_2026-09-23.md).
- **0.2 public release:** still Android preview. The named test origin runs on Windows/WSL with local operator ADC; unattended production credentials/hosting and public Play/package support are not certified. Do not equate acceptance of the internal beta with general availability.
- **Developer onboarding and public explanation:** the Android screen-by-screen walkthrough, SDK integration guide, seven labeled illustrations, code highlighting and landing feature presentation are published. This improves documentation; it does not convert the simulated fresh-clone exercise into independent adoption evidence or close public distribution.
- **0.3:** next planned milestone: phone confirmation for sensitive identity actions. First vertical slice: create a workspace API key. The [implementation plan](./47_v0.3_sensitive_action_approval.md) is the execution handoff; its implementation tasks remain open.
- Begin 0.3 without rewriting the accepted login protocol. The separate production/distribution track remains visible and cannot be silently rolled into 0.3 feature work.

## Adaptation of the supplied proposal

| Suggestion | Current Rooiam | Decision |
|---|---|---|
| Android sign-in is complete | Internal beta now has assisted restart, vendor, Play fresh-install and browser evidence; independent human adoption and public production are not claimed | Separate engineering acceptance from public release |
| 0.3 authorizes any action, including payments and deployments | Product doctrine keeps business operations in consuming apps | Start with one Rooiam-owned identity operation; defer generic downstream grants |
| Replace login with a generic authorization request | Device-login v1, browser nonce binding and downstream OIDC PKCE already work | Add a separate action-purpose protocol; preserve v1 signing bytes and routes |
| 0.4 introduces OIDC, passkeys and token lifecycle | Discovery/JWKS, PKCE, revocation/introspection, refresh rotation and passkeys exist | Verify compatibility and improve adoption; do not reschedule existing features as new |
| 0.6 introduces organizations, roles and policies | Workspaces, membership, roles, API keys and tenant policies exist | Improve existing delegation and approval policy UX |
| Recovery waits until 0.7 | MFA recovery and session/device revocation exist; safe fallback is needed before action approval | Resolve baseline lost-phone/lockout behavior in 0.2/0.3; deeper recovery UX can follow |
| Rust SDK, enterprise federation, Kubernetes and broad scale are required for 1.0 | No established consumer need for every proposed surface | Make these demand-driven, not mandatory release blockers |
| Assign AAL levels from a list of factors | No assessed assurance certification is recorded | Specify policy requirements without claiming external assurance levels |
| 100 successful logins establishes release readiness | Existing plan requires 1,000 flows plus adversarial/failure coverage | A 100-flow smoke check cannot replace the existing release gates |

## Version sequence

0.2 internal-beta engineering acceptance is closed; 0.3 is the scoped next feature milestone. **0.4–0.9 are provisional planning slots**, reviewed after 0.3 adoption. Optional tracks may move or be skipped; they are not all prerequisites for 1.0.

| Version | Product thesis | Increment over today's system | Exit evidence / dependency |
|---|---|---|---|
| 0.2 | Phone sign-in | Finish acceptance of Android SDK/reference, hosted/embedded QR and app-owned session | Close the scoped [0.2 gates](./48_v0.2_exit_checklist.md); preserve current login/MFA/OIDC |
| 0.3 | Confirm sensitive identity actions | Bound, single-use phone approval for workspace API-key creation when policy requires it | Real phone + portal journey, atomic execution, RBAC/policy rechecks, deny/replay/race/lockout tests; [detailed plan](./47_v0.3_sensitive_action_approval.md) |
| 0.4 | Easier identity integration | Verify existing OIDC/passkeys/token lifecycle with independent consumers; tighten SDK compatibility | Supported-client matrix, code/refresh/key-rotation regressions and documented upgrade path; critical defects are fixed immediately |
| 0.5 | Phone approval on more devices | iOS SDK + separate example using the same supported protocol; improve existing device management | Physical iOS enrollment/revoke/recovery and protocol parity; push review only with end-to-end delivery support |
| 0.6 | Clearer workspace approval policies | Extend existing roles/delegation and explain which operations need confirmation | Tenant isolation, least privilege, policy-change and lockout tests; no general policy language or multi-party approvals without a real use case |
| 0.7 | Safe recovery and device replacement | Improve lost-device/replacement UX on top of existing MFA/device/session controls | Documented threat model, enrollment/revocation races and no weaker-path bypass; baseline recovery remains required earlier |
| 0.8 | Connect existing company identities | Evaluate generic upstream OIDC for an adopter; Google/Microsoft already exist | Real customer integration and identity-linking isolation; SAML/SCIM only with demand and explicit scope |
| 0.9 | Predictable self-hosted operation | Consolidate supported upgrades, backup/restore, failure handling, observability and capacity evidence | Reproducible runbooks and measured capacity for a declared environment; no automatic HA/Kubernetes guarantee |
| 1.0 | A compatibility promise | Commit to supported API/protocol/SDK versions, migrations, deprecation and security maintenance | All claimed surfaces pass their release matrix; supported upgrade/rollback boundaries and security response policy published |

Security, recovery safety, tenant isolation and operational reliability apply to every release. Later milestones deepen coverage; they do not defer critical fixes.

## Existing foundations to preserve

- `rooiam-server/src/modules/oidc`, `webauthn`, `mfa`, `session`, `oauth`: current authentication, federation and session lifecycle.
- `modules/organization` and `modules/rbac`: workspace identity, roles, policy, apps and API keys.
- `modules/device_login`: trusted devices, attestation, signed login approval and transactional completion.
- `rooiam-sdk/packages/js-browser`, `packages/js-server`, `rooiam-sdk/android`: current SDK surfaces.
- `rooiam-examples/example-4-reference-app` and `example-5-android-reference-app`: web relying party and Android host responsibilities.

## Planning and publication rules

1. Use this file for version scope, the 0.2 snapshot for evidence and milestone checklists for outstanding tasks. Old numbered product phases are historical workstreams, not release numbers.
2. Completed code requires appropriate tests. Hardware, independent adoption, vendor configuration and production-operation claims require evidence from those environments.
3. Each milestone has one user outcome, a bounded first journey, exclusions, prerequisites and observable exit criteria. Record scope decisions before changing protocols or permissions.
4. The landing page describes user value and the next product outcome in a few lines. Hardware names, test counts, internal phases, task IDs and certification reports stay in engineering docs. Use a short preview/planned label where needed.
5. A roadmap edit does not publish packages, certify compatibility, promise dates or deploy authentication infrastructure.

## Start here next time

Read [product policy](./product_policy.md), [0.2 closeout](./48_v0.2_exit_checklist.md), then the [0.3 handoff](./47_v0.3_sensitive_action_approval.md). Verify the checkout and evidence before picking the first incomplete task. Do not assume capabilities in the supplied suggestion already exist.
