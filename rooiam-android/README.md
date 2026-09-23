# Rooiam Android preview

Native enrollment, QR scan/paste, explicit approve/deny and revocation for the existing device-login v1 API. This is an implementation preview, not a certified release. Android 8/API 26 or later is required; the scanner and Play Integrity need Google Play services.

## Build and install

Install JDK 17 and Android SDK platform/build-tools 34, set `ANDROID_HOME`, then:

```sh
./gradlew :app:assembleDebug :app:testDebugUnitTest :app:lintDebug
adb devices -l
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Enable USB debugging and accept the phone's authorization prompt. For a local test API and hosted frontend, use `adb reverse tcp:15470 tcp:15470` and `adb reverse tcp:15472 tcp:15472`. Both services must run on the host where ADB can reach them. WSL users may need Windows ADB or USB passthrough; a successful build is not proof of phone connectivity.

1. Enter your trusted API origin. The operator supplies the Google Cloud project number for Play Integrity.
2. Sign in through the server's configured hosted frontend using an existing account. For email login, paste the emailed link using the button inside the login view so its session stays in the app's WebView cookie store. Return to enrollment.
3. Enroll the phone, then open hosted login in a separate browser and choose **Show QR code**. Platform and workspace policies must permit device login.
4. Scan or paste the QR. Compare server/application context, six-digit request code and the displayed number. Approve or deny explicitly. Finish any required MFA in the browser.
5. Revoke from this app or **My Security → Trusted phones**. Re-enroll with a new identity after revocation. A lost/cleared app must not reuse a backup of its key.

## Security and attestation

The Ed25519 seed and random device token are encrypted with a non-exportable Android Keystore AES-GCM wrapping key. Ed25519 signing is performed in app memory, not hardware. App backups and device transfers are excluded. No JavaScript bridge is installed; login uses the existing hosted UI. Production origins require HTTPS, and QR origin substitution is rejected before sending credentials. Debug HTTP is limited to loopback/emulator host.

Release enrollment requires a Play Integrity project number. The backend must be configured with its Google verification credentials, expected app/package and signing-certificate policy. Install/distribute the app through the operator's supported Play test track for real vendor certification. The debug app can enroll without attestation, but the server's default verified-attestation policy rejects its approvals. Do not relax production policy to make a sideloaded build pass.

See the [protocol](../docs/internal/44_mobile_device_login_contract.md) and [certification runbook](../test/device-login.md). Vendor attestation has not been certified with this app yet.

On a dedicated test installation, `./gradlew :app:connectedDebugAndroidTest` checks Keystore encryption, signing, persistence and tamper rejection. **It clears the app's test vault.** The instrumented test APK is also buildable with `:app:assembleDebugAndroidTest`; building it does not execute it on hardware.

Platform references: [Android Keystore](https://developer.android.com/privacy-and-security/keystore), [standard Play Integrity requests](https://developer.android.com/google/play/integrity/standard), [Google code scanner](https://developers.google.com/ml-kit/vision/barcode-scanning/code-scanner).
