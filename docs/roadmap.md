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

## Next — Protect workspace boundaries

**0.6 backend candidate.** Workspace ownership handoff and existing role, API-key and approval boundaries have been hardened. Production rollout and live verification are planned with the pending 0.5 and 0.7 server updates; these changes are not live yet.

## Next — Make key confirmation more precise

**0.7 engineering candidate.** Workspace owners can choose whether phone confirmation applies to no API keys, full-access owner keys, or every API key. This is scoped to key creation; it will become available when the matching backend and portal are deployed together.

## Looking ahead

These are provisional directions, with scope guided by real integrations. Dates are not promised, and optional tracks may move or be skipped.

| Version | Direction | What it means for adopters |
|---|---|---|
| 0.8 | Self-hosted reliability | More predictable upgrades, backup, restore and failure handling; additional company identity connections only where needed |
| 0.9 | iOS exploration | Bring the supported device protocol to iOS only when real iPhone testing is available |
| 1.0 | Stable compatibility | A documented support and compatibility commitment for the supported APIs, protocols and SDKs |

Security and tenant isolation are requirements throughout this work. OIDC, passkeys, Google/Microsoft login, workspaces and roles already exist and are not listed as new milestones. iOS is not part of a stable-release claim until it has passed physical-device tests. Enterprise federation and additional SDK languages are driven by demand, not prerequisites for every adopter.
