# Rooiam Android tenant starter

This is a **separate, configurable source project** for a tenant that wants its own branded Android phone sign-in app. It uses the [Rooiam Android SDK](../rooiam-sdk/android/README.md) and the same reviewed scan → match → explicit approve flow as the [reference example](../rooiam-examples/example-5-android-reference-app/README.md). The reference app remains a protocol example; this project is the starting point for a tenant-owned package and Play listing.

The starter is **source code, not a Play-ready app download**. Building it does not register the package with a Rooiam server or Google Play. The current hosted Rooiam verifier accepts only its configured package, so a new tenant package must be onboarded by the Rooiam operator before strict phone approval works. Do not enable Phone sign-in for users until that is complete. See [tenant app onboarding](../docs/getting-started/12_white_label_android_starter.md).

## One-file branding and app configuration

Edit [`tenant.properties`](./tenant.properties):

```properties
applicationId=com.example.phoneapp
appName=My Phone Login
apiOrigin=https://auth.example.com
cloudProjectNumber=0
brandColor=#6844C8
cornerRadiusDp=18
versionCode=1
versionName=1.0.0
logoFile=
```

- `applicationId` is your permanent, unique Android package name. Pick it before creating the Play listing; do not reuse `com.rooiam.reference`.
- `apiOrigin` is the **bare HTTPS origin** of the Rooiam API serving your workspace. Users cannot change it in the app, and a QR from another server is rejected.
- `cloudProjectNumber` is the numeric Google Cloud project **linked to your app in Play Console**. It is not a private key.
- `brandColor` styles action buttons and the accent. Use a color with readable white text. `cornerRadiusDp` controls buttons/status card corners, from 0 to 48 dp.
- `logoFile` is an optional PNG path inside this project, such as `branding/logo.png`. It is used as the in-app logo and launcher icon. If omitted, a generic phone icon is used. Supply a square, high-resolution PNG with transparent margins. Android launchers may mask icon corners; `cornerRadiusDp` does not override the launcher mask. Your Play listing also needs its own store artwork.
- Increment `versionCode` for every Play update. Keep the same application ID and upload signing key for updates.

The app title, icon, fixed server origin and Play project number come from that file at build time. The device credential remains in the app's private storage; backups and device transfer are disabled. Do not add the credential or a service-account secret to `tenant.properties`.

## Build a debug app

Use JDK 17, Android SDK platform 36 and build-tools 35.0.0. Keep this directory beside `rooiam-sdk` in the same repository checkout; `settings.gradle` includes the SDK directly. Set `ANDROID_HOME` to your SDK installation. From this directory:

```bash
./gradlew assembleDebug lintDebug
adb devices -l
adb install -r build/outputs/apk/debug/RooiamTenantPhoneApp-debug.apk
```

Debug builds let you inspect the branded UI and exercise a reachable HTTPS test server. A debug/sideloaded APK is **not** evidence that Google's strict Play Integrity approval works. The app is intentionally pinned to the API origin in `tenant.properties`; the user cannot accidentally enroll against another Rooiam server.

## Publish a Play test build

1. Create your own Play Console app using the package in `applicationId`. Set up Play App Signing and retain your upload key. Choose your own Google Cloud project, link it under **Protected with Play → Play Integrity API**, and put its numeric project number in `tenant.properties`. See [Google's setup](https://developer.android.com/google/play/integrity/setup).
2. Ask your Rooiam operator to allow and verify **your exact package**. The current single-package decoder for Rooiam Reference cannot decode your app's tokens. This operator step is required before a Play-installed app can approve under strict policy.
3. Keep your keystore outside Git. Set these variables only in your local build environment: `ROOIAM_ANDROID_KEYSTORE_PATH`, `ROOIAM_ANDROID_STORE_PASSWORD`, `ROOIAM_ANDROID_KEY_ALIAS`, `ROOIAM_ANDROID_KEY_PASSWORD`. The Gradle project refuses release builds without them.
4. Run `./gradlew bundleRelease`. Upload `build/outputs/bundle/release/RooiamTenantPhoneApp-release.aab` to your Play internal testing track, invite a tester, and install from Play. Do not distribute a sideloaded APK as a production replacement.
5. Sign in inside the app, enroll the phone, scan a fresh browser QR, compare the code, approve, and confirm that the browser finishes its own login. The operator must confirm vendor attestation was actually verified.

Your **Play Console account and upload key stay yours**. Rooiam does not collect them. Play listing review, distribution and updates are your responsibility. The source project can be customized further in Android Studio; for example, change strings, accessibility or onboarding before a public release. Google requires app bundles for new Play apps and notes that package names are unique and permanent: [Play Console app setup](https://support.google.com/googleplay/android-developer/answer/9859152).

## What the app already handles

The SDK checks QR origin before sending credentials, protects the device key, obtains a review and signs explicit approval. The app owns camera permission and QR decoding, an embedded Rooiam login with one-use email-link handling, Play Integrity token requests, approval/denial UI, interruption recovery and revocation. An approval is not silently retried after an uncertain network outcome. The browser still finishes its own session and any MFA.

For source-level behavior and troubleshooting, see the [Android SDK integration guide](../docs/reference/14_android_sdk_integration.md). The [screen walkthrough](../docs/getting-started/10_android_phone_sign_in_walkthrough.md) uses the reference app to illustrate the protocol stages; this tenant project has a fixed server and branded home screen instead of editable reference fields.
