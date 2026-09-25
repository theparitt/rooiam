# Rooiam Roadmap

Rooiam is self-hosted passwordless identity for multi-tenant SaaS. We are building on its existing sign-in methods, workspace controls and OIDC integrations to make phone approval useful throughout the identity experience.

## Now — Android phone sign-in

**0.2 preview.** Users scan a browser QR code, review the request on their enrolled Android phone and approve to continue. Workspaces can offer phone sign-in alongside passkeys, magic links and social login, and choose its position in the login widget.

The Android SDK and example app source are available in the repository. Rooiam does not distribute a general-purpose tenant app: an app owner integrates the SDK and distributes its own app. The reference app remains a developer example and an invited Play test package. The browser-to-phone flow has passed a controlled production-origin test for that package; other apps need their own verification and release evidence.

- [Android integration guide](./reference/14_android_sdk_integration.md)
- [Phone sign-in walkthrough](./getting-started/10_android_phone_sign_in_walkthrough.md)
- [Android example app](https://github.com/theparitt/rooiam/tree/main/rooiam-examples/example-5-android-reference-app)
- [SDK and device-login reference](./reference/13_sdk_and_device_login.md)

## Now — Confirm sensitive changes

**0.3 Android beta.** A workspace can require phone confirmation before an administrator creates an API key. The phone shows the exact request before approval; existing workspace permissions still apply.

The portal and API are deployed, and the SDK/example flow has passed a real-phone production test. App owners integrate the Android SDK into their own app and arrange verification for their package. [Set up phone confirmation](./reference/15_phone_action_approval.md). Your application continues to own its business operations.

## Now — Recover or replace a phone

**0.4 Android beta.** If an enrolled phone is lost, sign in with another method, revoke that phone from My Security, review your browser sessions, and enroll a replacement. Revocation stops unfinished phone approvals; a recent sign-in is required to revoke a device. [Follow the recovery guide](./reference/16_lost_phone_and_replacement.md).

The production flow passed an assisted revoke and re-enrollment test on the same Play-installed Android phone. A different replacement handset and tenant-built apps still need their own validation.

## Now — Integrate and upgrade

**0.5 developer integration.** Build the TypeScript and Android SDKs from source, try them in a separate application, and follow the [supported-client and upgrade guide](./reference/17_sdk_support_and_upgrade.md). The guide names checked versions, includes a working app-owned session example, and explains Android upgrade and signing-key behavior. SDK packages are available as repository artifacts; they are not published to npm or Maven Central. A simulated clean-clone consumer has passed, but an independent person's walkthrough and another physical replacement phone are still untested.

The combined backend implementation is deployed. A production relying-party callback/refresh check against that deployment and an independent developer walkthrough remain separate acceptance evidence. No production OIDC signing key was rotated as part of this rollout.

## Now — Protect workspace boundaries

**0.6 backend deployed.** Workspace ownership handoff and existing role, API-key and approval boundaries have been hardened. Isolated tests passed; a production cross-workspace and owner-transfer check on a disposable workspace remains open.

## Now — Make key confirmation more precise

**0.7 controls deployed.** Workspace owners can choose whether phone confirmation applies to no API keys, full-access owner keys, or every API key. This is scoped to key creation. The matching backend and portal are deployed; the production owner-settings and real-phone policy matrix still need a disposable-workspace run.

## Now — Predictable self-hosted operation

**0.8 tooling available.** Operators can create a private PostgreSQL backup, prove it restores in an isolated container, and follow a concrete image upgrade and failure checklist. A production PostgreSQL 18 backup restored in isolation; migration 65 passed a copy-of-data preflight and the new server passed startup/readiness checks. A readiness probe is recorded separately from login capacity. Full-instance recovery, including media, configuration and off-host copies, still needs verification before an operational reliability claim.

## Looking ahead

These are provisional directions, with scope guided by real integrations. Dates are not promised, and optional tracks may move or be skipped.

| Version | Direction | What it means for adopters |
|---|---|---|
| 0.9 | iOS exploration | Experimental SDK/reference source builds on iOS Simulator; real iPhone certification is still required before support. [Integration guide](./reference/18_ios_experimental_integration.md) |
| 1.0 | Stable compatibility | [A defined support and upgrade contract](./reference/19_compatibility_and_conformance.md) for checked APIs, OIDC integration and SDKs. The backend and portals are deployed, but release acceptance is incomplete and there is no 1.0 tag or OpenID certification claim; experimental iOS stays outside the supported matrix |

Security and tenant isolation are requirements throughout this work. OIDC, passkeys, Google/Microsoft login, workspaces and roles already exist and are not listed as new milestones. iOS is not part of a stable-release claim until it has passed physical-device tests. Enterprise federation and additional SDK languages are driven by demand, not prerequisites for every adopter.
