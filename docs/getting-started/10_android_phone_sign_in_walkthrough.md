# Android phone sign-in: a screen-by-screen walkthrough

This guide takes you from a fresh Android reference app to a completed browser sign-in. It is for a tester with access to the **Rooiam Reference internal Play test** or a developer running its source. Rooiam Reference is not currently a public app download. If you are building your own Android app, start with [Build your first Android phone sign-in app](./11_build_your_first_android_app.md).

The screen images below are **illustrations of the current reference app**, with example codes and domains. They are not captures of a live sign-in. The app deliberately blocks Android screenshots with `FLAG_SECURE`, and a real QR or email link must never be put in public documentation. Button labels and the order of screens match the current source; device styling may differ.

## Before you begin

You need Android 8 (API 26) or later, a reachable **HTTPS** Rooiam API and hosted frontend, an existing Rooiam account, and a browser on another screen. Your operator must enable phone sign-in on the platform and workspace, allow the Android package, and configure Play Integrity verification. For a real release build, install the app through its supported Play track and obtain the **numeric Google Cloud project number** linked to that package. A local debug build can use loopback HTTP for development only; it does not pass the release attestation policy.

The repository's reference app is [example 5](../../rooiam-examples/example-5-android-reference-app/README.md). From a fresh clone, build it with JDK 17 and the Android SDK:

```bash
cd rooiam-examples/example-5-android-reference-app
./gradlew assembleDebug lintDebug
adb devices -l
adb install -r build/outputs/apk/debug/RooiamAndroidReferenceApp-debug.apk
```

The default debug package is `com.rooiam.mobile`. The Play test package is `com.rooiam.reference`, built and signed separately. See [Play Integrity setup](../production/23_android_play_integrity.md) before attempting a Play-backed test. For a local server, use the ports and ADB reverse mapping in the [reference app README](../../rooiam-examples/example-5-android-reference-app/README.md). Use your own reachable API origin; the domains in the pictures are examples.

## 1. Open the app and set its server

![Illustration of the reference app home screen with API origin, Cloud project number, and three numbered actions](/android-guide/01-home.svg)

Open **Rooiam Reference** and scroll to the top. Enter the Rooiam **API origin** (for example, `https://auth.example.com`) and the numeric **Google Cloud project number** supplied by the operator. The latter is required for release enrollment. Keep the API origin exactly the same when you later scan a QR; the SDK rejects a QR for a different server.

**You should see:** `1. Sign in to Rooiam`, `2. Enroll this phone`, and `3. Scan a sign-in QR` below the two fields. On a short screen, the fields may be above the visible area; scroll up. Tap **1. Sign in to Rooiam**. A confirmation dialog displays the API and hosted Login origins. Check both before tapping **Continue**.

## 2. Sign in inside the reference app

![Illustration of the hosted login inside the reference app, with the return and email-link buttons above it](/android-guide/02-login.svg)

The hosted login opens **inside the app**. Sign in with an existing account. If you use a magic link, request a fresh email, copy its URL **without opening it in another browser**, then tap **Paste your email sign-in link** at the top of the app, paste, and tap **Open**. Rooiam validates the link's origin and path before opening it in the app's WebView. Opening a one-use link in Chrome first can consume it there and leave the app without the session cookie needed to enroll.

**You should see:** your account in the embedded login surface. Tap **Return to phone enrollment**. The app retains the WebView session cookie for the configured API. If enrollment later returns 401, sign in again inside this app; a browser session on your computer does not authenticate the phone app.

## 3. Enroll this phone

![Illustration of enrollment status showing pending attestation](/android-guide/03-enrolled.svg)

Tap **2. Enroll this phone** once. The SDK creates a device credential in the app sandbox, asks the host app for a Play Integrity token, and registers the phone with Rooiam. A first enrollment may show `Phone enrolled. Attestation: pending. Approval remains subject to server policy.` **Pending is not a failure or a verified verdict**: the server verifies the statement under its policy when an approval is attempted. If the operation was committed but the response was lost, the SDK can recover the existing enrollment; the status then says `Recovered existing phone enrollment.`

**You should see:** a phone-enrolled status, without being asked to export a key. If the app instead says `This phone is already enrolled. Revoke it before switching accounts or servers.`, use the original account and server. Revoke only when you intentionally want to replace that enrollment; revocation cannot preserve the old key.

## 4. Start phone sign-in in your browser

![Illustration of the browser QR screen with a request code and matching number](/android-guide/04-browser-qr.svg)

In a fresh browser window, open your Rooiam login or the application that uses its hosted widget. Choose **Sign in with your phone**, then **Show QR code** if the hosted page asks. This method appears only when platform and workspace policy enable it. Leave this browser screen open; QR requests expire.

**You should see:** a QR, a short request code, and a matching number. The QR in this guide is a *non-scannable illustration*. Do not share a live QR or code in a support ticket. If the browser page is reloaded or expires, start a new request and scan the new QR.

## 5. Scan and review on the phone

![Illustration of the in-app QR scanner aimed at the browser screen](/android-guide/05-scanner.svg)

In Rooiam Reference tap **3. Scan a sign-in QR**. Grant Camera permission when Android asks. The scanner runs inside the app; aim it at the QR on the browser you just started. If you cannot grant Camera permission, **Paste QR text** is available for controlled development, but do not paste a live QR into chat or logs.

**You should see:** the camera scanner, then an **Approve this browser?** dialog. If scanning fails, check that the API origin in the app matches the origin encoded in the QR and that the browser request has not expired.

## 6. Match, approve, and finish in the browser

![Illustration of the approval dialog with server, application, workspace, request code, and matching number](/android-guide/06-review.svg)

Read the **Server**, **Application**, and **Workspace**. Compare the phone's **six-digit request code** and **matching number** with the browser. Only tap **Codes match — approve** when the details correspond to the request you started. Otherwise tap **Deny**. **Close** dismisses the review without a decision. The app never approves directly from the scan callback.

![Illustration of the approved status on the phone and the completed browser session](/android-guide/07-finish.svg)

After approval, the phone says `Approved. Return to your browser to finish sign-in and any required MFA.` The browser then completes its own Rooiam flow and, for a downstream application, its own OIDC callback and app session. **The phone success message alone does not prove the browser has signed in.** Confirm that the browser reaches the expected workspace or application session.

## If the app or network is interrupted

| What happened | What you should do |
|---|---|
| App closed after scanning, before approval | Reopen it while the browser request is still valid. The app fetches a fresh review and asks for confirmation again. Compare the codes again. |
| Approval was tapped but the result is uncertain | Check the browser first. If sign-in did not finish, start a **new** browser request and scan again. The app intentionally does not resend an uncertain decision. |
| `Cannot reach your server` | Check the phone's network and the configured HTTPS origin. Reopen the app to refresh the request while it is still valid. |
| `Request expired` | Start a new request in the browser and scan its new QR. |
| `Session Expired` in the browser | Start from the same HTTPS origin as the API/frontend configured for this test. Restart sign-in in a fresh browser window. |
| Play Integrity or approval rejected | Verify Play installation, linked Cloud project, expected package, server verifier credentials, and policy using the [Play Integrity guide](../production/23_android_play_integrity.md). Do not weaken production policy to make a debug build pass. |

To remove access, tap **Revoke this phone** in the app or use **My Security → Trusted phones**. Sign-out of the hosted login and revocation of the device are separate actions.

For a full new-developer setup and validation checklist, continue with [Build your first Android phone sign-in app](./11_build_your_first_android_app.md), then the [SDK integration guide](../reference/14_android_sdk_integration.md). The [reference app source](../../rooiam-examples/example-5-android-reference-app/src/main/java/com/rooiam/mobile/MainActivity.java) implements these screens.
