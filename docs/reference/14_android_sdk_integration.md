# Build an Android QR sign-in app with the Rooiam SDK

This is the detailed SDK integration guide for an Android developer building an app like [Rooiam Reference](../../rooiam-examples/example-5-android-reference-app/README.md). For prerequisites, Google registration, and a first working build, start with the [beginner's app tutorial](../getting-started/11_build_your_first_android_app.md). For a guided tour of the finished screens, use the [screen-by-screen walkthrough](../getting-started/10_android_phone_sign_in_walkthrough.md). The SDK is a **preview** Android library; the reference app is an example host, not an app template that owns your product's login session.

The library owns origin and QR validation, device-key storage, registration, request preview, signatures, decisions and revocation. **Your app owns** its authenticated Rooiam session, camera and permission UI, user confirmation, lifecycle, Play Integrity adapter, package signing and distribution. It does not need to handle the SDK's private key or raw device token.

| Stage | Your app | SDK |
|---|---|---|
| Authenticate | Show hosted login and retain the API session cookie | Resolve the configured hosted-login origin |
| Enroll | Supply a device label and Play Integrity token adapter | Generate/protect a device credential and register it |
| Scan | Read QR text with a camera library | Check QR scheme and server origin before sending credentials |
| Review | Display context, code and number; request explicit consent | Fetch the pending intent and validate status/expiry |
| Decide | Call once after the user approves or denies | Sign approval; send approval or rejection |
| Recover | Restore only public QR text, then show a fresh review | Refetch the current intent; never replay a decision |

## 1. Add the library

Use Android API 26 or later and JDK 17. The current preview coordinate is `com.rooiam:android-sdk:0.2.0-alpha.4`; it is **not on Maven Central**. The reference project includes `rooiam-sdk/android` as a Gradle project:

```groovy
// settings.gradle — same checkout as the reference app
include ':sdk'
project(':sdk').projectDir = file('../../rooiam-sdk/android')
```

```groovy
// app/build.gradle
dependencies {
    implementation project(':sdk')
    implementation 'com.journeyapps:zxing-android-embedded:4.3.0' // Host scanner
    implementation 'com.google.android.play:integrity:1.3.0'       // Host attestation
}
```

For a separate app checkout, publish the SDK's local Maven repository with `./gradlew publishReleasePublicationToLocalPreviewRepository` from `rooiam-sdk/android`. Add the generated `build/repository` to `dependencyResolutionManagement.repositories`, then depend on `com.rooiam:android-sdk:0.2.0-alpha.4`. The Maven publication carries the Bouncy Castle dependency; a copied bare AAR does not. See the [SDK README](../../rooiam-sdk/android/README.md) for the exact publication command and consumer packaging check.

The SDK declares only `INTERNET`; the host declares `CAMERA` if it scans. Disable backup/transfer of its device vault. The reference app disables application backup entirely:

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />

<application
    android:allowBackup="false"
    android:fullBackupContent="false"
    android:dataExtractionRules="@xml/data_extraction_rules">
    <!-- Your activity -->
</application>
```

If your app needs other backup data, exclude the SDK's `vault.xml` from both legacy backup and Android 12+ data-extraction rules. Restoring encrypted enrollment data onto another installation is unsupported.

## 2. Give the SDK an authenticated session

The host login must authenticate the **same account** that will enroll and approve. Resolve the server-configured frontend and open it inside the host's login surface. The reference app uses a WebView and its CookieManager; a Custom Tab does **not** automatically share that WebView cookie store.

```java
// Keep one client and run its network/crypto methods on a serial worker.
ExecutorService rooiamWorker = Executors.newSingleThreadExecutor();
String apiOrigin = "https://auth.example.com";

RooiamClient client = new RooiamClient(
    getApplicationContext(),
    apiOrigin,
    trustedOrigin -> CookieManager.getInstance().getCookie(trustedOrigin)
);

rooiamWorker.execute(() -> {
    try {
        String loginOrigin = client.hostedLoginOrigin();
        runOnUiThread(() -> openHostedLogin(loginOrigin));
    } catch (Exception error) {
        runOnUiThread(() -> showError(error));
    }
});
```

`openHostedLogin` and `showError` are host UI functions in this example. The production constructor requires HTTPS. Do not construct an origin from the QR or use a cookie from an untrusted origin. The SDK requests the API cookie only for its configured origin; the cookie provider should return the existing authenticated cookie, not a token stored in app UI state.

If the hosted login uses one-use email links, open the copied link **inside the same WebView session**. The reference app calls `Protocol.emailLink(link, frontend, apiOrigin, BuildConfig.DEBUG)` before `webView.loadUrl(...)` to validate its origin and path. Opening that email link first in an external browser can consume it without authenticating the host app.

## 3. Enroll with Play Integrity

The app supplies a `RooiamClient.AttestationProvider`. The SDK computes a binding hash over its device public key, your package name, key ID and environment; your adapter must return a Play Integrity token for **exactly that hash**. The package's Play Console app must be linked to the Cloud project whose numeric project number you use.

```java
long cloudProjectNumber = Long.parseLong(configuredProjectNumber);

RooiamClient.AttestationProvider integrity = requestHash -> {
    StandardIntegrityManager manager =
        IntegrityManagerFactory.create(getApplicationContext());
    StandardIntegrityManager.StandardIntegrityTokenProvider provider =
        Tasks.await(manager.prepareIntegrityToken(
            StandardIntegrityManager.PrepareIntegrityTokenRequest.builder()
                .setCloudProjectNumber(cloudProjectNumber)
                .build()), 60, TimeUnit.SECONDS);

    return Tasks.await(provider.request(
        StandardIntegrityManager.StandardIntegrityTokenRequest.builder()
            .setRequestHash(requestHash)
            .build()), 60, TimeUnit.SECONDS).token();
};

rooiamWorker.execute(() -> {
    try {
        RooiamClient.Enrollment enrollment =
            client.enroll(Build.MANUFACTURER + " " + Build.MODEL, integrity);
        runOnUiThread(() -> showEnrollment(
            enrollment.deviceId, enrollment.attestationStatus, enrollment.recovered));
    } catch (Exception error) {
        runOnUiThread(() -> showError(error));
    }
});
```

The adapter above follows the [reference app's implementation](../../rooiam-examples/example-5-android-reference-app/src/main/java/com/rooiam/mobile/MainActivity.java). Import `StandardIntegrityManager` and `IntegrityManagerFactory` from `com.google.android.play.core.integrity`, `Tasks` from `com.google.android.gms.tasks`, and `TimeUnit` from `java.util.concurrent`. `Tasks.await` blocks, so this code belongs on the worker, never the UI thread.

`Enrollment.recovered` means the server had already committed the same public key after a lost response. `attestationStatus = pending` is not proof of acceptance; approval still depends on server policy and vendor verification. Release enrollment requires a provider. The debug-only four-argument constructor can allow local preview without one, but production policy should reject unverified approvals. Follow [Android Play Integrity setup](../production/23_android_play_integrity.md) for app distribution and backend verification.

## 4. Scan a QR, then fetch a review

The scanner is **host-owned**. Ask for Camera permission, use a QR-only decoder, pause the camera when backgrounded, and pass decoded text to the SDK. The reference app uses ZXing Android Embedded's `DecoratedBarcodeView`:

```java
scanner.getBarcodeView().setDecoderFactory(
    new DefaultDecoderFactory(
        Collections.singletonList(BarcodeFormat.QR_CODE)));
scanner.decodeSingle(result -> {
    scanner.pause();
    showLoading();
    previewQr(result.getText());
});
scanner.resume();
```

`previewQr` should persist **only the public QR text** if you want to recover an interrupted review, then call the SDK on the serial worker:

```java
void previewQr(String qrText) {
    rooiamWorker.execute(() -> {
        try {
            RooiamClient.Review review = client.preview(qrText);
            runOnUiThread(() -> showReview(
                review.getOrigin(),
                review.getApplication(),
                review.getWorkspace(),
                review.getDisplayCode(),
                review.getMatchNumber(),
                review));
        } catch (Exception error) {
            runOnUiThread(() -> showError(error));
        }
    });
}
```

`showReview` is host UI code. `preview` checks the QR origin **before** sending an authenticated API request; it then requires a pending, unexpired intent for the enrolled account. Display the server, application, workspace, six-digit request code and matching number. Do not turn a successful QR decode into approval.

## 5. Require an explicit decision

Show **Approve**, **Deny** and **Close**. Tell the user to compare the code and number to the browser they started. Bind the approve action to the `Review` object returned by the same client and pass its matching number only after that explicit confirmation:

```java
// Called only from the user's confirmed button, not from the scan callback.
void approveOnce(RooiamClient.Review review) {
    disableDecisionButtons();
    persistDecisionInFlightMarker();
    rooiamWorker.execute(() -> {
        try {
            client.approve(review, review.getMatchNumber());
            runOnUiThread(() -> showBrowserFinishMessage());
        } catch (Exception error) {
            runOnUiThread(() -> showUncertainDecisionMessage());
        }
    });
}

void denyOnce(RooiamClient.Review review) {
    disableDecisionButtons();
    persistDecisionInFlightMarker();
    rooiamWorker.execute(() -> {
        try {
            client.deny(review);
            runOnUiThread(() -> showDeniedMessage());
        } catch (Exception error) {
            runOnUiThread(() -> showUncertainDecisionMessage());
        }
    });
}
```

These UI/persistence functions are integration hooks, not SDK methods. The SDK validates the chosen number, signs approvals internally and marks the review used **before** sending a decision. It will not replay it after a timeout. An uncertain response may already have reached the server: tell the user to check their browser and, if needed, start a new request. Never silently retry `approve` or `deny`.

Phone approval completes only the phone side. The browser must finish Rooiam's sign-in and any required MFA. A downstream application still handles its own OIDC callback, state/PKCE validation and application session; see the [app-owned callback flow](./11_downstream_hosted_widget_callback_flow.md).

## 6. Handle app restarts and revocation

If the app closes **before** the user decides, persist only the public QR text. On return, call `preview` again and show a fresh review after checking expiry and origin. Dismiss the old dialog when the app backgrounds. Do not save a `Review` object, signature, cookie, private key or raw device token in activity state. If the app closes **during** a decision, keep an uncertainty marker and require a new browser request if the old one did not finish. The [reference activity](../../rooiam-examples/example-5-android-reference-app/src/main/java/com/rooiam/mobile/MainActivity.java) demonstrates both cases.

Use `client.revoke()` on the worker when the account owner intentionally removes this phone. It revokes the server credential before clearing local state; a server error preserves the local enrollment. Account sign-out and device revocation are separate.

## Error handling and verification

| Result | Meaning / next action |
|---|---|
| HTTP 401 from `RooiamApiException.getStatusCode()` | The app's API session is missing or expired. Sign in again inside the app. |
| HTTP 429 | Respect the server limit; do not immediately repeat the action. |
| QR origin mismatch or expired request | Start again from the intended server and scan a fresh browser QR. |
| Existing enrollment belongs to another account/server | Use the original account and server or explicitly revoke before switching. |
| Decision outcome uncertain | Check the browser; if it did not finish, create a new intent and scan again. |
| Play Integrity rejection | Check the Play-installed package, linked Cloud project, server verifier and strict policy. |

Build checks from `rooiam-sdk/android`:

```bash
./gradlew assembleRelease testDebugUnitTest lintDebug assembleDebugAndroidTest
```

`connectedDebugAndroidTest` additionally tests Keystore persistence/signing/tamper rejection on a **dedicated** device or emulator; it clears the SDK test application's vault. The packaging smoke test is `bash test/android-sdk-consumer.sh` from the repository root. A good final integration test is: fresh install, authenticate in-app, enroll, scan, compare, approve, confirm browser session, kill/reopen before a decision, then exercise an uncertain decision and revocation. Record the package, test track, Android version and effective server policy; do not record a live QR, one-use email link or token.

The SDK's [README](../../rooiam-sdk/android/README.md), [reference app](../../rooiam-examples/example-5-android-reference-app/README.md), and [device-login API reference](./13_sdk_and_device_login.md) are the source-level companions to this guide.
