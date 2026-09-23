# Android Play Integrity setup

Use this guide for an application consuming the Rooiam Android SDK. The application owner supplies its Play Console app, Cloud project, signing and distribution. The SDK does not provide a shared Rooiam Play project for other developers' apps.

The reference app's live vendor verification is still pending. Building or sideloading its debug APK does not establish Play Integrity or Play Protect acceptance.

## Prepare the application

1. Create **Rooiam Reference** in your Play Console account with application ID **`com.rooiam.reference`** for this project's certification build. The existing local debug app keeps `com.rooiam.mobile` and its enrollment; another consuming app uses its own ID.
2. Create a Google Cloud project and enable Play Integrity API. In the Play Console app, open **Protected with Play → Play Integrity API → Link Cloud project**. Copy the numeric **project number**, not the project ID, into the reference app's project field. For the Rooiam Reference app in this repository, the operator supplied **`1028955371558`**; confirm this exact project is linked in Play Console before testing. An application owner integrating the SDK uses its own linked project number. See [Google's setup instructions](https://developer.android.com/google/play/integrity/setup).
3. Configure release signing and Play App Signing. Build a signed release app bundle from the reference project or your own consuming project. Supply the four signing environment variables documented in the [reference README](../../rooiam-examples/example-5-android-reference-app/README.md); no private keystore is distributed with the source. Without those variables, `bundleRelease` is unsigned. The reference targets API 36, matching [Google's current target requirement](https://support.google.com/googleplay/android-developer/answer/11926878); recheck the requirement for later releases.
4. Publish to an internal test track and add your tester account. Install using that account's Play test link, with Play Protect enabled. Follow [Google's internal testing instructions](https://support.google.com/googleplay/android-developer/answer/9845334). Keep the existing debug phone enrollment intact: a Play-signed app may not update a locally signed debug package. Use a separate test device/profile or a distinct certification package rather than uninstalling a wanted enrollment.

Use a reachable HTTPS Rooiam API and hosted frontend for the release build. Loopback HTTP is a debuggable-build exception only.

From `rooiam-examples/example-5-android-reference-app`, select the certification package with `./gradlew -ProoiamApplicationId=com.rooiam.reference bundleRelease`. Configure release signing before uploading; package selection alone does not sign the bundle. The default debug build remains `com.rooiam.mobile`.

## Configure Rooiam's verifier

Create the backend service account in the linked project and give it the access needed to decode Play Integrity tokens. Follow the server-side setup under [standard requests](https://developer.android.com/google/play/integrity/standard). Keep its credentials on the server, never in the APK, repository or chat.

Configure these existing server environment variables:

```dotenv
ROOIAM_GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
ROOIAM_GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY_PATH=/run/secrets/play-integrity-private-key.pem
```

The private-key path expects the PEM private key, not the whole downloaded service-account JSON. Restrict file permissions. Leave the token URI override unset to use the normal Google endpoint.

In platform device-attestation settings, use:

| Setting | Certification value |
|---|---|
| `device_attestation_required_for_qr_login` | `true` |
| `device_attestation_require_vendor_verification_for_qr_login` | `true` |
| `device_attestation_allow_development_environments` | `false` |
| `device_attestation_allowed_app_ids` | Exact application ID(s), comma-separated |

Also enable platform phone sign-in and the intended workspace's phone login method. Use a dedicated certification environment before changing an existing deployment's policy.

Rooiam validates the decoded package, enrollment request hash, app recognition, device verdict, environment and statement age. It rejects `UNLICENSED`; its current device rule accepts basic, device or strong integrity. Certificate recognition relies on Google's `PLAY_RECOGNIZED` verdict, not a separate Rooiam certificate-digest pin. See [Google's verdict definitions](https://developer.android.com/google/play/integrity/verdicts). These are the current checks, not a claim that all optional Google verdicts are enforced.

## Record the real result

Enroll a fresh certification installation with its project number, then scan and approve a browser login. Record package/version, Play track, signing certificate digest, device/Android version, effective server policy and whether the server actually reports verified attestation. Test a wrong package allowlist, invalid token/binding and unavailable verifier; none may silently fall back to unverified approval.

Record Play Protect-enabled install/update separately. A simulated verdict or a relaxed local policy does not pass the real-vendor test. If a step fails, retain the error category and configuration without saving tokens or private keys in the report.
