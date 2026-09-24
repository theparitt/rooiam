# Rooiam Roadmap

Rooiam is self-hosted passwordless identity for multi-tenant SaaS. We are building on its existing sign-in methods, workspace controls and OIDC integrations to make phone approval useful throughout the identity experience.

## Now — Android phone sign-in

**0.2 preview.** Users scan a browser QR code, review the request on their enrolled Android phone and approve to continue. Workspaces can offer phone sign-in alongside passkeys, magic links and social login, and choose its position in the login widget.

The Android SDK and example app source are available in the repository. Rooiam does not distribute a general-purpose tenant app: an app owner integrates the SDK and distributes its own app. The reference app remains a developer example and an invited Play test package. The browser-to-phone flow has passed a controlled production-origin test for that package; other apps need their own verification and release evidence.

- [Android integration guide](./reference/14_android_sdk_integration.md)
- [Phone sign-in walkthrough](./getting-started/10_android_phone_sign_in_walkthrough.md)
- [Android example app](https://github.com/theparitt/rooiam/tree/main/rooiam-examples/example-5-android-reference-app)
- [SDK and device-login reference](./reference/13_sdk_and_device_login.md)

## Next — Confirm sensitive changes

**0.3 planned.** Let workspace administrators confirm one sensitive change from their phone: creating a workspace API key when policy requires it. The phone shows the exact request before approval. Existing workspace permissions still apply.

This is planned functionality, not an available API. It extends Rooiam's identity controls; your application continues to own its business operations.

## Looking ahead

These are provisional directions, with scope guided by real integrations. Dates are not promised, and optional tracks may move or be skipped.

| Version | Direction | What it means for adopters |
|---|---|---|
| 0.4 | Recovery and replacement | A safer, clearer path when someone loses or replaces a device |
| 0.5 | Developer adoption | A tested upgrade path and clearer first integration for supported SDKs and applications |
| 0.6 | Tenant access assurance | Stronger organization ownership, RBAC and cross-tenant isolation checks for existing features |
| 0.7 | Workspace approval policies | Clearer control over which identity changes need confirmation |
| 0.8 | Self-hosted reliability | More predictable upgrades, backup, restore and failure handling; additional company identity connections only where needed |
| 0.9 | iOS exploration | Bring the supported device protocol to iOS only when real iPhone testing is available |
| 1.0 | Stable compatibility | A documented support and compatibility commitment for the supported APIs, protocols and SDKs |

Security and tenant isolation are requirements throughout this work. OIDC, passkeys, Google/Microsoft login, workspaces and roles already exist and are not listed as new milestones. iOS is not part of a stable-release claim until it has passed physical-device tests. Enterprise federation and additional SDK languages are driven by demand, not prerequisites for every adopter.
