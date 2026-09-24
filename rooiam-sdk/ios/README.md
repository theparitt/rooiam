# Rooiam iOS phone SDK (0.9 experimental source)

This Swift package ports the existing Rooiam trusted-phone protocol. It is **not a supported iOS release**. GitHub macOS CI compiled the SDK and reference app for iOS Simulator and passed four protocol tests on Xcode 26.6. No iPhone, App Attest enrollment, camera journey or signed distribution has been tested; physical-device certification is required before a support claim.

The host app owns login, its session cookie, QR camera screen, explicit review and distribution. The SDK owns origin/purpose validation, Ed25519 device signing, Keychain persistence, App Attest registration, and exact Rooiam API requests. It never creates a browser session for another app.

## Add it to an Xcode app

Add this directory as a **local Swift package** in Xcode. Set deployment target iOS 16 or newer. Add the **App Attest** capability to your app ID/provisioning profile and `NSCameraUsageDescription` to `Info.plist`. Use your own unique bundle ID. In the Rooiam server, set `ROOIAM_APPLE_APP_ID_PREFIX` to your Apple Team/App ID prefix and allow this bundle ID in `device_attestation_allowed_app_ids`. Use an actual iPhone for App Attest enrollment; simulator work is limited to UI and protocol parsing until hardware is available.

The reference host source is in [`rooiam-examples/example-6-ios-reference-app`](../../rooiam-examples/example-6-ios-reference-app). It shows a WebKit-owned login session, camera scan and explicit login/API-key confirmation. The app's login cookie is passed through the `cookieProvider` only for the configured API origin. Your production host app should integrate its existing sign-in and session handling instead of copying WebKit blindly.

```swift
let phone = try RooiamPhoneClient(origin: "https://api.example.com") { trustedOrigin in
    // Read the host app's Rooiam session cookie for this exact trusted origin.
    // Return nil if the host app is not signed in.
    await sessionStore.cookieHeader(for: trustedOrigin)
}

let enrollment = try await phone.enroll(label: "My iPhone")
// Present status to the user. A verified App Attest result comes from the server.

let review = try await phone.previewLogin(qr: scannedQR)
// Show review.server, review.displayCode and review.matchNumber.
// Only call this after the user compares the browser values and taps Approve.
try await phone.approveLogin(review, selectedNumber: review.matchNumber)
```

For an API-key QR, call `previewAction(qr:)`, display `workspaceName`, `label`, `permissionPreset`, `allowedPermissions`, `keyExpiresAt` and `displayCode`, then call `approveAction(_:displayedCode:)` or `denyAction(_:)`. Do not auto-approve or retry an ambiguous decision: return to the browser, inspect its state, and scan a new request if needed.

Registration requires a signed-in Rooiam account. The SDK creates a Keychain-stored Ed25519 signing key and token, obtains an App Attest key ID, requests a one-time server challenge, calls Apple `attestKey` with Rooiam's exact bound SHA-256 preimage, and sends the attestation object to the server. A lost registration response is recovered by matching the stored public key against `/v1/identity/me/devices` before making another registration request. It does not erase an unverified local enrollment silently.

The Keychain item uses `WhenUnlockedThisDeviceOnly`; it does not migrate to another phone. The App Attest key is a separate Apple-managed key. When a phone is lost, the user signs in another way and revokes it from My Security. `revoke()` requires the server's recent-sign-in rule and only clears local state after a confirmed success.

## Current limits

- macOS CI passed the simulator SDK/app builds and four XCTest cases for challenge hashing, QR origin/purpose and sign-in-link boundaries. Those tests do not exercise iPhone hardware or Apple App Attest.
- Apple's App Attest entitlement, actual certificate-chain validation, Keychain persistence, camera/permission behavior, background/restoration and App Store/TestFlight distribution are **not tested**.
- The example includes an XcodeGen project spec and builds for Simulator in CI; it is not a signed `.ipa` or an App Store listing.
- The server must already expose the current trusted-device and action-approval endpoints. The operator has deferred the combined 0.5–0.8 production rollout; do not infer production readiness from this package.

See the [device-login reference](../../docs/reference/13_sdk_and_device_login.md) for the Rooiam flow and the [iOS integration guide](../../docs/reference/18_ios_experimental_integration.md) for setup and the certification checklist.
