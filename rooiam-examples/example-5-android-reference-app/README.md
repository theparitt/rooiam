# Example 5 — Android reference app

This is a reference consumer of the [Android SDK](../../rooiam-sdk/android/README.md), which lives separately in `rooiam-sdk/android`. Open this directory in Android Studio. Its Gradle settings include the SDK as `:sdk` from the same repository; the application is the root project. Alpha.3's assisted Redmi Note 9 regression passed a new camera scan through the application callback/session while retaining the alpha.2 enrollment. Lifecycle and vendor certification remain separate.

The SDK owns origin/QR validation, enrollment, protected credentials, request review, signing and revocation. The reference app owns its WebView login, camera permission/scanner, review dialog and lifecycle restoration. Play Integrity is supplied by the host through an adapter; the SDK has no camera or Google Play dependency.

Native enrollment, QR scan/paste, explicit approve/deny and revocation for the existing device-login v1 API. This is an implementation preview, not a certified release. Android 8/API 26 or later is required. QR decoding runs locally inside Rooiam using the Camera permission; only Play Integrity needs Google Play services.

## Build and install

Install JDK 17 and Android SDK platform/build-tools 34, set `ANDROID_HOME`, then run from this directory:

```sh
./gradlew assembleDebug lintDebug
adb devices -l
adb install -r build/outputs/apk/debug/RooiamAndroidReferenceApp-debug.apk
```

Enable USB debugging and accept the phone's authorization prompt. For a local test API and hosted frontend, use `adb reverse tcp:15470 tcp:15470` and `adb reverse tcp:15472 tcp:15472`. Both services must run on the host where ADB can reach them. WSL users may need Windows ADB or USB passthrough; a successful build is not proof of phone connectivity.

1. Enter your trusted API origin. The operator supplies the Google Cloud project number for Play Integrity.
2. Sign in through the server's configured hosted frontend using an existing account. For email login, paste the emailed link using the button inside the login view so its session stays in the app's WebView cookie store. Return to enrollment.
3. Enroll the phone, then choose **Sign in with your phone** in the browser's login widget. The hosted page additionally asks you to choose **Show QR code**. Platform and workspace policies must permit device login.
4. Scan or paste the QR. Compare server/application context, six-digit request code and the displayed number. Approve or deny explicitly. Finish any required MFA in the browser.
5. Revoke from this app or **My Security → Trusted phones**. Re-enroll with a new identity after revocation. A lost/cleared app must not reuse a backup of its key.

The alpha.2 scanner stays in Rooiam instead of launching an external Google scanner. Camera access is paused in the background; saved activity state restores an interrupted scan. Once decoded, the public QR request is saved before fetching its preview, so reopening the app restores the review after process death. Restoration revalidates the origin, signed-in identity, request status and expiry with the server. It never approves automatically. Cancel/close clears the saved review; an explicit approve/deny clears it before sending the decision so process recovery cannot resend a decision. If camera access is denied, use **Paste QR text**.

The email-link button accepts the exact verification endpoints on the configured API or its hosted frontend. It does not accept arbitrary origins or navigation paths. You can paste the original API link from the email without rewriting it.

Upgrade a test installation using `adb install -r` or open the new APK from Downloads; keep the existing package and signing certificate to preserve enrollment. A successful APK signature check does not establish Play Protect acceptance. If installation reports `INSTALL_FAILED_VERIFICATION_FAILURE`, record the full warning and APK hash, then follow [Google's developer guidance](https://developers.google.com/android/play-protect/warning-dev-guidance). Do not count installation with Play Protect disabled as passing protected-installation certification.

## Security and attestation

The Ed25519 seed and random device token are encrypted with a non-exportable Android Keystore AES-GCM wrapping key. Ed25519 signing is performed in app memory, not hardware. App backups and device transfers are excluded. No JavaScript bridge is installed; login uses the existing hosted UI. Production origins require HTTPS, and QR origin substitution is rejected before sending credentials. Debug HTTP is limited to loopback/emulator host.

Release enrollment requires a Play Integrity project number. The backend must be configured with its Google verification credentials, expected app/package and signing-certificate policy. Install/distribute the app through the operator's supported Play test track for real vendor certification. The debug app can enroll without attestation, but the server's default verified-attestation policy rejects its approvals. Do not relax production policy to make a sideloaded build pass.

See the [protocol](../../docs/internal/44_mobile_device_login_contract.md) and [certification runbook](../../test/device-login.md). Vendor attestation has not been certified with this app yet.

On a dedicated test installation, `./gradlew :sdk:connectedDebugAndroidTest` checks Keystore encryption, signing, persistence and tamper rejection in the SDK test application's sandbox. **It clears that test vault.** The instrumented test APK is also buildable with `:sdk:assembleDebugAndroidTest`; building it does not execute it on hardware.

Platform references: [Android Keystore](https://developer.android.com/privacy-and-security/keystore), [standard Play Integrity requests](https://developer.android.com/google/play/integrity/standard), [ZXing Android Embedded](https://github.com/journeyapps/zxing-android-embedded), [Android activity lifecycle](https://developer.android.com/guide/components/activities/activity-lifecycle).
