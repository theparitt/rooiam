# iOS phone integration (0.9 experimental)

Rooiam has **source code for an experimental iOS SDK and reference app**. GitHub macOS CI builds both for iOS Simulator and passes four SDK protocol tests on Xcode 26.6. Neither has been tested on an iPhone, so iOS is not a supported login method or a production app download. Android remains the physically tested mobile integration. This guide lets an iOS developer take the next concrete steps and records what evidence is still missing.

## What the app does

The web browser starts a Rooiam phone sign-in or API-key confirmation and shows a QR. The iOS app scans it, fetches the authoritative request from the configured Rooiam server, displays the server/code/details, and sends a signed choice after the user approves. Rooiam finishes the browser flow; a consuming application still owns its own OIDC callback and session.

The iOS app must be signed in to **the same Rooiam account** that enrolled the phone. The SDK does not log the user in or silently approve requests. The host app provides the Rooiam session cookie, camera UI and review screen.

## Start from the source

1. On macOS with current Xcode, use the [reference app](../../rooiam-examples/example-6-ios-reference-app) `project.yml` with XcodeGen to generate a local iOS project. It links [`rooiam-sdk/ios`](../../rooiam-sdk/ios) as a local Swift package. You can also add the package directly to your own Xcode iOS 16+ project.
2. Choose a unique iOS bundle ID and Apple Development Team. Enable the **App Attest** capability for the app identifier and provisioning profile. Add `NSCameraUsageDescription` for QR scanning. Run package tests in Xcode. A simulator can help with UI and protocol parsing, but cannot close this release gate.
3. On the Rooiam server, set `ROOIAM_APPLE_APP_ID_PREFIX` to the Apple Team/App ID prefix and add the exact bundle ID to `device_attestation_allowed_app_ids`. Keep the production vendor-verification policy. The sample requests App Attest `development` only for DEBUG; point that build at a separate staging server where development attestation is explicitly allowed. Test a release/TestFlight build with `production` under normal policy. Rooiam's App Attest registration endpoint already checks the Apple certificate chain and a one-time challenge; there is no Google Play Console project for an iOS app. A tenant app needs its **own Apple developer signing identity and bundle ID**.
4. In the reference app, enter your trusted **API origin**, sign in to Rooiam in its embedded WebKit view, return to the app and enroll the phone. `enroll(label:)` requests a one-time challenge, asks Apple App Attest for evidence bound to the Rooiam signing key, and registers the phone. Confirm that the server returns `Attestation: verified`; do not infer that from the app screen alone.
5. In a fresh browser session, choose phone sign-in. Scan the QR with the app, compare the exact code and number, then approve. Confirm the browser reaches the expected workspace or application session. Repeat for an API-key confirmation, reviewing workspace, label, permissions and expiry first; then deny and cancellation cases.

```swift
let phone = try RooiamPhoneClient(origin: "https://api.your-rooiam.example") { origin in
    await mySession.cookieHeader(for: origin)
}

let enrollment = try await phone.enroll(label: "Alice's iPhone")
let review = try await phone.previewLogin(qr: cameraText)
// Present review.server, displayCode and matchNumber in your app first.
try await phone.approveLogin(review, selectedNumber: review.matchNumber)
```

`previewLogin` and `previewAction` reject a QR from another server **before** asking the host app for its cookie. The SDK signs the server's exact `approval_payload`; do not reconstruct it. Decisions are single-use in the local client. If a request may have reached the server but the response was lost, inspect the browser, then scan a fresh request. Never auto-send a second approval.

## Common failure points

| What you see | Check |
|---|---|
| `Sign in to Rooiam before using this phone` | The embedded or app-owned session must supply a cookie valid for the configured API origin. Browser sign-in in another app does not automatically share WebKit cookies. |
| `Apple App Attest is not available` | Use a supported physical iPhone, correct capability and provisioning profile. Simulator behavior is not release evidence. |
| App Attest registration rejected | Check the exact bundle ID allowlist, `ROOIAM_APPLE_APP_ID_PREFIX`, signed app ID, environment and server logs. The challenge expires in 10 minutes and is single-use. |
| `This QR belongs to another Rooiam server` | The app's configured API origin must equal the QR's server origin; do not replace the QR URL or use a different host. |
| `This phone is already enrolled` | Keep using that enrollment. To switch account/server, revoke it from Rooiam My Security after a recent sign-in. Do not erase local keys to bypass the server record. |
| Browser remains waiting after approve | Check browser request status and app error. An uncertain network response is not permission to retry the same decision; start a new QR if needed. |

## Evidence required before iOS support

- A signed app build with your Apple provisioning profile and any compiler/API issues outside the current Xcode 26.6 CI environment. The simulator SDK/app builds and four protocol XCTest cases already pass in [macOS CI](https://github.com/theparitt/rooiam/actions/workflows/ios-experimental.yml).
- iPhone registration with a real Apple App Attest verdict under strict server policy, QR login, API-key approve/deny and server audit evidence.
- Camera permission, rotation, background/relaunch review, offline/timeout, lost response, expired QR, revocation and replacement-phone scenarios.
- App distribution through TestFlight/App Store or a documented tenant signing route, with upgrade and Keychain persistence checks.
- A second-person fresh-clone walkthrough for the exact iOS example and server settings.

These are open gates. Do not mark iOS as supported in the workspace widget or 1.0 compatibility matrix until physical-device and distribution evidence exists. Existing Android and browser behavior need no iOS toggle for this source work.
