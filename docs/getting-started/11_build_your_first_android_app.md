# Build your first Android phone sign-in app

This tutorial is for an Android developer who wants **their own app** to scan a Rooiam browser QR and approve sign-in. You can start with the working [Rooiam Reference source](../../rooiam-examples/example-5-android-reference-app/README.md), see every screen in the [illustrated walkthrough](./10_android_phone_sign_in_walkthrough.md), and then replace its UI with yours. The Android SDK supplies the device-login protocol; your app supplies login, camera, approval screens and Play Integrity.

**Already using a Rooiam-hosted workspace?** You do not need Android Studio, a Google Cloud project or this tutorial just to sign in. Ask your Rooiam operator which phone app or test track your workspace supports. The reference package is currently distributed through **Play internal testing**, not as a public consumer download.

## What you will build

```text
Browser: Sign in with your phone → QR + matching number
Phone:   Sign in to Rooiam → Enroll → Scan → Compare → Approve
Browser: Finish sign-in → workspace or application session
```

There are two separate identities here. The phone signs in to **Rooiam** so it can enroll and approve. The browser signs in to **your application** after Rooiam completes its flow. If your application uses OIDC, your backend must still validate the callback and create its own session; see the [downstream callback example](../reference/11_downstream_hosted_widget_callback_flow.md).

## Before opening Android Studio

| You need | Why | Who supplies it |
|---|---|---|
| Android 8/API 26+ phone, JDK 17 and Android SDK | Build and run the example | Android developer |
| A reachable Rooiam **HTTPS API origin** and hosted frontend | The app and browser must talk to the same Rooiam installation | Rooiam operator |
| A Rooiam account and workspace with Phone sign-in enabled | The phone account enrolls; the browser starts a QR request | Rooiam operator |
| Your app's permanent Android `applicationId` | Rooiam checks the installed package | Android developer |
| Your own Play Console app and linked Google Cloud **project number** | Required for Play-backed release attestation | Android developer / Play Console owner |
| A Rooiam server configured to verify your package's Play Integrity tokens | Strict policy rejects unverified approvals | Rooiam operator |

You can **build and inspect the debug example before Play Console setup**. A debug/sideloaded app is not a valid test of strict production Play Integrity. Do not use the reference app's `com.rooiam.reference` package or project number `1028955371558` for your own published app.

## 1. Run the working example first

Install Android Studio with Android SDK platform 36, build-tools 35.0.0 and JDK 17. Clone the public repository, then open `rooiam-examples/example-5-android-reference-app` in Android Studio. The example's Gradle settings include the SDK at `rooiam-sdk/android`; keep the same checkout layout.

```bash
git clone https://github.com/theparitt/rooiam.git
cd rooiam/rooiam-examples/example-5-android-reference-app
./gradlew assembleDebug lintDebug
adb devices -l
adb install -r build/outputs/apk/debug/RooiamAndroidReferenceApp-debug.apk
```

`adb devices -l` must list an **authorized** phone before `adb install`. On the phone, enable USB debugging and accept its RSA prompt. If it says `unauthorized`, unlock the phone and allow that prompt. If it lists no device, check the cable/USB mode and host ADB connection. The debug package is `com.rooiam.mobile` so it does not overwrite the separate Play test package.

Open the example app. The [screen-by-screen guide](./10_android_phone_sign_in_walkthrough.md) shows what you should see at each stage: server fields, embedded login, enrollment status, scanner, review, and browser completion. Its illustrations contain example data, never a live QR.

## 2. Configure the Rooiam side

Ask the operator to enable Phone sign-in at the platform level, then in the intended workspace open **Workspace → Access** and enable/position the Phone login method. The operator also configures device-attestation policy, allows your exact Android package ID, and connects Google token decoding. In a self-hosted setup, the [Play Integrity operator guide](../production/23_android_play_integrity.md) and [keyless Cloud Run decoder guide](../production/24_cloud_run_play_integrity_decoder.md) cover this. The decoder's secret stays on the **server**; do not put it in your APK.

For your phone and browser test, use the same Rooiam installation and HTTPS origin. An enrollment created against a staging API is bound to staging; it cannot approve a production QR. If a browser QR starts on another domain, the SDK rejects it before sending credentials.

## 3. Add the SDK to your app

For your first app, copy the example project's `settings.gradle` pattern so `:sdk` points to `rooiam-sdk/android` in the same checkout. Your app module then uses:

```groovy
dependencies {
    implementation project(':sdk')
    implementation 'com.journeyapps:zxing-android-embedded:4.3.0' // Example scanner
    implementation 'com.google.android.play:integrity:1.3.0'       // Your attestation adapter
}
```

In a separate checkout, publish the SDK to a **local Maven repository** and consume `com.rooiam:android-sdk:0.2.0-alpha.4`. It is not on Maven Central. The [SDK README](../../rooiam-sdk/android/README.md) shows the command and repository configuration. Do not copy only the AAR: the Maven publication includes its runtime dependency metadata.

Your manifest needs `INTERNET` and, if your app scans with a camera, `CAMERA`. Disable backup of the SDK's `vault.xml` on old and new Android backup paths; the [integration guide](../reference/14_android_sdk_integration.md) has the manifest example. The SDK protects the device credential, but your app must prevent it from being restored onto another installation.

## 4. Connect login, enrollment and scanning

Start with a single `RooiamClient`. The cookie provider must read the session created by your in-app hosted login. Use a serial worker because these methods perform blocking network and cryptographic work. A system browser or Custom Tab does not automatically share WebView cookies.

```java
ExecutorService worker = Executors.newSingleThreadExecutor();
RooiamClient client = new RooiamClient(
    getApplicationContext(),
    "https://auth.example.com", // Replace with your operator's API origin
    origin -> CookieManager.getInstance().getCookie(origin)
);

worker.execute(() -> {
    try {
        String frontend = client.hostedLoginOrigin();
        runOnUiThread(() -> openLoginWebView(frontend));
    } catch (Exception error) {
        runOnUiThread(() -> showError(error));
    }
});
```

`openLoginWebView` and `showError` are **functions you write**, not SDK methods. Authenticate the same Rooiam account that will enroll the phone. If login uses a one-use magic link, open that link **inside this app's WebView**; opening it first in Chrome consumes it in Chrome's session. The [reference activity](../../rooiam-examples/example-5-android-reference-app/src/main/java/com/rooiam/mobile/MainActivity.java) contains a working login surface and link validation.

Next call `client.enroll(label, attestationProvider)` on the worker. For release builds, your adapter requests a standard Play Integrity token using the **exact `requestHash` supplied by the SDK**. The [annotated adapter code](../reference/14_android_sdk_integration.md#3-enroll-with-play-integrity) shows this without exposing the device key. An initial `Attestation: pending` message means the server has not yet accepted an approval; strict verification is checked by the server during the approval flow.

For the camera, decode **QR codes only**, then pass the raw decoded text to `client.preview(qrText)` on the worker. Display the returned server, application, workspace, six-digit code and matching number. Only call `client.approve(review, review.getMatchNumber())` after a user explicitly compares the phone and browser and taps Approve. Also offer Deny and Close. Never approve directly inside the scanner callback.

```java
// After the user taps Approve and confirms the code matches:
disableDecisionButtons();
worker.execute(() -> {
    try {
        client.approve(review, review.getMatchNumber());
        runOnUiThread(() -> showReturnToBrowser());
    } catch (Exception error) {
        runOnUiThread(() -> showUncertainResult());
    }
});
```

The UI functions above are yours. A timeout after Approve may mean the server already received the decision. Check the browser; **do not resend** that decision. If the app closes before a decision, save only the public QR text, reopen, call `preview` again and show a fresh review. The reference app demonstrates these lifecycle cases; the [full SDK guide](../reference/14_android_sdk_integration.md) explains each call and revocation.

## 5. Register your app for a real Play-backed test

Do this when your own UI and debug journey work. Each consuming app needs its **own** package and Play/Cloud setup. Google documents the current screens in [Play Integrity setup](https://developer.android.com/google/play/integrity/setup) and [internal testing](https://support.google.com/googleplay/android-developer/answer/9845334).

1. Choose a permanent `applicationId` such as `com.example.myapp`. Create that app in **your Play Console**. Do not copy `com.rooiam.reference`.
2. Create or select **your Google Cloud project**, enable Play Integrity API, then in the Play Console app go to **Protected with Play → Play Integrity API → Link Cloud project**. Copy its numeric **project number** into your app's `prepareIntegrityToken` request. The project ID string is not the number.
3. Set up Play App Signing and your release upload key. Build and upload a signed **AAB** to an internal testing track. Add your tester's Google account, open its opt-in link on the phone and install from Google Play. The reference project's [release build example](../../rooiam-examples/example-5-android-reference-app/README.md) shows the required signing variables; do not commit your keystore or passwords.
4. Give the Rooiam operator your **package ID and Cloud project number**. The operator configures the verifier and allowlist on the server. Do not send a service-account key to the Android app. For a home-hosted Rooiam, the server can use the [keyless Cloud Run decoder](../production/24_cloud_run_play_integrity_decoder.md).
5. On the Play-installed app, sign in, enroll, then start a browser QR, scan and approve. Verify that the browser reaches its workspace or application session **and** the server reports verified attestation. Installing an APK outside Play or seeing `pending` alone is not this result.

The Play Console app, Cloud project, Android package, upload signing and server allowlist must refer to the **same consuming app**. The Rooiam Reference project's number and test track are for Rooiam's example only.

## When something goes wrong

| What you see | Likely cause | What to do |
|---|---|---|
| `401` while enrolling or previewing | Phone app lacks an authenticated Rooiam API cookie | Sign in **inside the app** again; do not rely on the computer browser's session. |
| Magic link says used/expired | It was opened in a different browser or reused | Request a new link and open it once inside the app's login WebView. |
| `This phone is already enrolled` | This app installation still owns an enrollment | Use its original account/server, or intentionally revoke before switching. Sign-out alone is not revocation. |
| QR origin mismatch | The app points at a different Rooiam server | Check the configured API origin and start a new QR on that server. |
| QR/request expired | Browser intent timed out or was replaced | Start a new Phone sign-in in the browser; scan its new QR. |
| `Attestation: pending` | Enrollment response is not a final verified verdict | Continue a controlled test; have the operator check vendor verification and policy after approval. |
| Play Integrity or approval rejected | Wrong package/project, sideloaded build, server verifier or policy | Confirm Play installation, exact package, linked project number, operator allowlist and server verdict. Do not disable strict policy to make a debug APK pass. |
| Phone says Approved, browser says Session Expired | Browser session/origin or callback failed | Restart on the same HTTPS installation; inspect browser callback/session logs. Approval alone does not create your app session. |
| Network error after tapping Approve | Decision result may be uncertain | Check the browser. If it did not finish, create a **new** QR; do not replay the old approval. |

For detailed API behavior and exact source, use the [SDK integration guide](../reference/14_android_sdk_integration.md), [Android SDK source](../../rooiam-sdk/android/README.md), and [reference app source](../../rooiam-examples/example-5-android-reference-app/README.md). If you are **only a phone user**, return to the [illustrated sign-in walkthrough](./10_android_phone_sign_in_walkthrough.md); the Google setup above is your app developer's/operator's job.
