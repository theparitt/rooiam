# Rooiam Roadmap

Rooiam is self-hosted passwordless identity for multi-tenant SaaS. We are building on its existing sign-in methods, workspace controls and OIDC integrations to make phone approval useful throughout the identity experience.

## Now — Android phone sign-in

**0.2 preview.** Users scan a browser QR code, review the request on their enrolled Android phone and approve to continue. Workspaces can offer phone sign-in alongside passkeys, magic links and social login, and choose its position in the login widget.

The Android SDK and example app are available in the repository. The reference app is available to invited Play testers. Public availability follows production deployment review.

- [Android integration guide](https://github.com/theparitt/rooiam/tree/main/rooiam-sdk/android#readme)
- [Android example app](https://github.com/theparitt/rooiam/tree/main/rooiam-examples/example-5-android-reference-app)
- [SDK and device-login reference](./reference/13_sdk_and_device_login.md)

## Next — Confirm sensitive changes

**0.3 planned.** Let workspace administrators confirm sensitive changes from their phone, starting with creating a workspace API key. The phone shows what will change before the administrator approves. Existing workspace permissions still apply.

This is planned functionality, not an available API. It extends Rooiam's identity controls; your application continues to own its business operations.

## Looking ahead

These are provisional directions, with scope guided by real integrations. Dates are not promised, and optional tracks may move or be skipped.

| Version | Direction | What it means for adopters |
|---|---|---|
| 0.4 | Easier integration | More predictable use of existing OIDC, passkeys and SDKs across applications |
| 0.5 | More devices | Bring phone approval to iOS |
| 0.6 | Workspace policies | Clearer control over which identity changes need confirmation |
| 0.7 | Recovery and replacement | A safer, clearer path when someone loses or replaces a device |
| 0.8 | Company identity connections | Connect more existing identity providers where teams need them |
| 0.9 | Self-hosted operations | More predictable upgrades, recovery and day-to-day operation |
| 1.0 | Stable compatibility | A documented support and compatibility commitment for the supported APIs, protocols and SDKs |

Security, safe recovery and tenant isolation are requirements throughout this work. OIDC, passkeys, Google/Microsoft login, workspaces and roles already exist; later milestones improve them. Enterprise federation and additional SDK languages are driven by demand, not prerequisites for every adopter.

Maintainers can find the detailed scope, outstanding evidence and implementation handoff in the [internal release roadmap](./internal/release_roadmap.md).
