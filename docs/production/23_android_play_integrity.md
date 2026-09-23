# Android Play Integrity setup

Use this guide for an application consuming the Rooiam Android SDK. The application owner supplies its Play Console app, Cloud project, signing and distribution. The SDK does not provide a shared Rooiam Play project for other developers' apps.

The reference app's Play-distributed alpha.5 build passed a real Play Integrity verification and QR approval on a Redmi Note 9 in an isolated strict-policy environment on 2026-09-23. Alpha.6 then updated through Play with Play Protect scanning on and completed another phone sign-in using the original enrollment. This is evidence for that package, device and test track; it does not certify other apps or Android devices. The initial alpha.5 installation occurred while Play Protect scanning was off, so a fresh installation with scanning on is not claimed. Building or sideloading a debug APK does not establish either result.

## Prepare the application

1. Create **Rooiam Reference** in your Play Console account with application ID **`com.rooiam.reference`** for this project's certification build. The existing local debug app keeps `com.rooiam.mobile` and its enrollment; another consuming app uses its own ID.
2. Create a Google Cloud project and enable Play Integrity API. In the Play Console app, open **Protected with Play → Play Integrity API → Link Cloud project**. Copy the numeric **project number**, not the project ID, into the reference app's project field. For the Rooiam Reference app in this repository, the operator supplied **`1028955371558`**; confirm this exact project is linked in Play Console before testing. An application owner integrating the SDK uses its own linked project number. See [Google's setup instructions](https://developer.android.com/google/play/integrity/setup).
3. Configure release signing and Play App Signing. Build a signed release app bundle from the reference project or your own consuming project. Supply the four signing environment variables documented in the [reference README](../../rooiam-examples/example-5-android-reference-app/README.md); no private keystore is distributed with the source. Without those variables, `bundleRelease` is unsigned. The reference targets API 36, matching [Google's current target requirement](https://support.google.com/googleplay/android-developer/answer/11926878); recheck the requirement for later releases.
4. Publish to an internal test track and add your tester account. Install using that account's Play test link, with Play Protect enabled. Follow [Google's internal testing instructions](https://support.google.com/googleplay/android-developer/answer/9845334). Keep the existing debug phone enrollment intact: a Play-signed app may not update a locally signed debug package. Use a separate test device/profile or a distinct certification package rather than uninstalling a wanted enrollment.

Use a reachable HTTPS Rooiam API and hosted frontend for the release build. Loopback HTTP is a debuggable-build exception only.

From `rooiam-examples/example-5-android-reference-app`, select the certification package with `./gradlew -ProoiamApplicationId=com.rooiam.reference bundleRelease`. Configure release signing before uploading; package selection alone does not sign the bundle. The default debug build remains `com.rooiam.mobile`.

## Configure Rooiam's verifier

Create a backend service account in the linked project for Play Integrity token decoding. Google documents the [server-side decode request](https://developer.android.com/google/play/integrity/standard). Prefer [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials) with an attached service account on Google Cloud or [Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation) for a self-hosted deployment. If organization policy disables service-account key creation, keep that policy enabled; Rooiam can use ADC without a key.

For keyless verification, configure the server:

```dotenv
ROOIAM_GOOGLE_PLAY_USE_ADC=true
```

The server process must have ADC for the linked project's service account, scoped to `https://www.googleapis.com/auth/playintegrity`. On Google Cloud, attach that service account to the workload. On another host, set `GOOGLE_APPLICATION_CREDENTIALS` to a Workload Identity Federation credential **configuration** file and grant that external workload access to impersonate the service account. For a local certification run, Google also supports `gcloud auth application-default login --impersonate-service-account=SERVICE_ACCOUNT_EMAIL --scopes=https://www.googleapis.com/auth/playintegrity`; the signed-in operator needs permission to impersonate the account. This local login is a test credential, not a permanent server deployment. Keep credential configuration files and local ADC state private. See [Google's ADC guidance](https://cloud.google.com/docs/authentication/application-default-credentials) and [workload federation setup](https://cloud.google.com/iam/docs/workload-download-cred-and-grant-access).

`docker-compose.prod.yml` passes `ROOIAM_GOOGLE_PLAY_USE_ADC` and `GOOGLE_APPLICATION_CREDENTIALS` into the server container. A file path set in the latter must refer to a file **inside** the container. For a self-hosted Workload Identity Federation deployment, add a private Compose override that read-only mounts the credential configuration and any token-source file it names; do not commit those files. An attached Google Cloud service account needs no credential file. Check the running container's environment and mount before enforcing vendor verification, because a host-only path cannot be read by the container.

The older explicit-key configuration remains available where organizational policy permits it:

Configure these existing server environment variables:

```dotenv
ROOIAM_GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
ROOIAM_GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY_PATH=/run/secrets/play-integrity-private-key.pem
```

The private-key path expects the PEM private key, not the whole downloaded service-account JSON. Restrict file permissions. Leave the token URI override unset to use the normal Google endpoint. Do not configure `ROOIAM_GOOGLE_PLAY_USE_ADC=true` and a private key together; Rooiam rejects this ambiguous setup.

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
