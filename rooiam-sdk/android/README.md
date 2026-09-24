# Rooiam Android SDK (preview)

Standalone Android library for device-login v1. The [Android reference app](../../rooiam-examples/example-5-android-reference-app/README.md) lives in `rooiam-examples` and consumes this library. Minimum Android API 26; Java 17 build toolchain. Package `com.rooiam.sdk`, local preview coordinates `com.rooiam:android-sdk:0.2.0-alpha.4`. This package has **not** been published to Maven Central.

For a step-by-step implementation with annotated code, see [Build an Android QR sign-in app](../../docs/reference/14_android_sdk_integration.md). For each screen the user sees, see the [phone sign-in walkthrough](../../docs/getting-started/10_android_phone_sign_in_walkthrough.md).

## Add to an application

The reference app includes this directory as its `:sdk` project and uses:

```groovy
dependencies { implementation project(':sdk') }
```

For another Android project, generate the Maven repository (AAR, sources, POM and transitive dependency metadata) from `rooiam-sdk/android`:

```sh
./gradlew publishReleasePublicationToLocalPreviewRepository
```

Add the generated `rooiam-sdk/android/build/repository` directory to that project's `dependencyResolutionManagement.repositories` using `maven { url = uri('/absolute/path/to/repository') }`, alongside `google()` and `mavenCentral()`. Then use:

```groovy
dependencies { implementation 'com.rooiam:android-sdk:0.2.0-alpha.4' }
```

Prefer the Maven repository over a bare AAR: it carries the Bouncy Castle runtime dependency. The SDK has no Camera, scanner, WebView UI or Play Integrity dependency. It declares only INTERNET permission.

After publication, run `bash test/android-sdk-consumer.sh` from the repository root to assemble a separate Android consumer using Maven coordinates rather than a Gradle project dependency. This is an automated packaging check, not the independent human walkthrough.

## Integration

The host owns the login UI and supplies the existing Rooiam session cookie for the trusted API origin. A WebView consumer can use this adapter; a Custom Tabs session does not automatically share the WebView cookie store.

```java
RooiamClient client = new RooiamClient(
    context.getApplicationContext(), "https://auth.example.com",
    origin -> android.webkit.CookieManager.getInstance().getCookie(origin));
```

Use one client and a serial worker for all enrollment/decision/revocation operations. Methods perform blocking network/crypto work and must run off the main thread. Errors are not automatically retried. `RooiamApiException.getStatusCode()` distinguishes HTTP failures such as 401 (sign in again) and 429 (respect limits); response bodies and credentials are not exposed in exceptions. Network and local validation failures are also propagated.

1. Authenticate an existing account. `hostedLoginOrigin()` resolves the configured frontend. `Protocol.emailLink(...)` validates pasted email-verification links; the host opens them in its authenticated login surface.
2. On the worker, call `client.enroll(deviceLabel, attestationProvider)`. The result has `deviceId`, `attestationStatus` and `recovered`. The SDK retains device secrets internally. An enrollment recovered after a lost response reports attestation `unknown`, not verified.
3. Obtain QR text using your camera library or a paste UI. Call `RooiamClient.Review review = client.preview(qrText)` on the worker. Origin validation runs before credentials are sent.
4. Display `getOrigin()`, `getApplication()`, `getWorkspace()`, `getDisplayCode()` and `getMatchNumber()` for comparison with the user's browser. After explicit user confirmation, call `client.approve(review, selectedNumber)` on the same client; alternatively call `client.deny(review)`. Never approve in a scan callback without user confirmation.
5. Tell the user to return to their browser for completion and any MFA. Phone approval does not mean the browser has completed sign-in.
6. `client.revoke()` revokes the server credential before deleting the local key. Server errors preserve local state. Sign out/session revocation is separate.

Reviews are bound to the client/enrollment and expire. A decision attempt consumes the local review even if its response is lost. Do not retry it automatically. After process death, persist only the public QR text if needed, call `preview` again and ask for confirmation again. Never serialize reviews, keys or session credentials to saved instance state. The reference app demonstrates this flow.

## Attestation and development

Implement `AttestationProvider.requestToken(requestHash)` using your application's Play Integrity configuration. Return the provider token bound to the exact supplied hash. The SDK computes the enrollment binding using the public key, host package name, key ID and production environment; it submits the statement to Rooiam. The reference app includes an adapter using standard Play Integrity requests. The operator must configure the server's package allowlist and verifier credentials for the consuming app. Certificate recognition currently relies on Google's `PLAY_RECOGNIZED` verdict; Rooiam does not expose a separate certificate-digest pinning setting. See the [Play Integrity setup guide](../../docs/production/23_android_play_integrity.md).

The default constructor requires HTTPS and an attestation provider for enrollment. The four-argument constructor with `true` explicitly enables local preview only when the host application is debuggable. It permits loopback HTTP and enrollment without attestation. It does not override server approval policy. Do not ship a debuggable production application.

## Storage and ownership

One enrollment per host application installation is supported. The SDK uses the existing `vault` SharedPreferences file and `rooiam.device.v1` Keystore alias, preserving the reference app's earlier enrollment when the package/signing certificate remain the same. Reserve those names. Keys are private to the host application's Android sandbox; Ed25519 signing occurs in memory under an AES-GCM Keystore wrapping key, not hardware-backed Ed25519.

The consuming app **must exclude `vault.xml` from cloud backup and device transfer**, including Android 12+ data extraction rules and older backup rules, or disable backup as the reference app does. Do not restore private enrollment data into another installation. The SDK intentionally does not override the host application's global backup policy.

Rooiam owns API/protocol correctness, origin/account binding, key handling and server-side attestation verification. Integrators own login/session integration, camera permission/UI, lifecycle UX, explicit user confirmation, app signing/distribution and their Play Integrity project. Protected installation of the reference APK is a reference distribution gate, not an Android library release prerequisite. Other applications still require their own Play package, project and integration verification.

## Validation

```sh
./gradlew assembleRelease testDebugUnitTest lintDebug assembleDebugAndroidTest
```

Run these commands from this SDK directory. JVM tests cover origin/QR/email-link validation and HTTP redirect/credential isolation, status handling and no retry. `connectedDebugAndroidTest` tests Keystore persistence/signing/tamper detection in the SDK test application's sandbox. It clears that test vault; use a dedicated test device. Building the test APK does not execute it. The Redmi Note 9 reference-package journey has since passed lifecycle recovery and Play-backed vendor verification in internal beta; see the [evidence snapshot](../../docs/internal/45_v0.2_current_status_2026-09-23.md). This does not certify a different consuming app.
