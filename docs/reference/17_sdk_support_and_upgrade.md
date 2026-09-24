# SDK support and upgrade guide

This guide describes the integration surfaces checked for Rooiam 0.5. Version numbers below are package versions, not the Rooiam milestone number. Rooiam does not currently publish these SDKs to npm or Maven Central.

| Surface | Checked version and consumer | Distribution | Scope |
|---|---|---|---|
| Browser TypeScript | `@rooiam/sdk-browser@0.1.0`, Node 22 ESM build/test and independent TypeScript consumer | Build and `npm pack` from this repository | Hosted login, public OIDC code exchange, first-party cookie methods |
| Server TypeScript | `@rooiam/sdk-server@0.1.0`, Node 22 ESM build/test and independent TypeScript consumer | Build and `npm pack` from this repository | Trusted workspace API-key calls; keep secrets on the server |
| Android | `com.rooiam:android-sdk:0.4.0-alpha.1`, API 26+, JDK 17, Android Gradle Plugin 8.10.1 | Local Maven publication from source | Phone enrollment, QR review/approval, bounded action approval, same-phone revoked-enrollment recovery; Android beta |
| Example relying party | `example-4-reference-app`, Node 22 | Source in this repository | App-owned OIDC callback, subject mapping and session cookie; illustrative, in-memory session storage |

Other Node/Android versions, iOS and arbitrary tenant-built phone apps have not been certified by these checks. The assisted Play test covers the `com.rooiam.reference` package, not a general app download.

## Build and consume from a clean clone

From the repository root, install and check each TypeScript package, then run the independent tarball consumer. `prepack` compiles `dist`; only `dist` is included in the tarballs.

```sh
npm ci --prefix rooiam-sdk/packages/js-browser
npm ci --prefix rooiam-sdk/packages/js-server
npm test --prefix rooiam-sdk/packages/js-browser
npm test --prefix rooiam-sdk/packages/js-server
node test/sdk-package-consumer.mjs
```

To install one of those artifacts into your own project, run `npm pack` inside its package directory, then `npm install /absolute/path/to/the-generated.tgz` in your project. The consumer check creates an unrelated temporary project, installs both tarballs, type-checks their public imports and executes them. See [SDK and device-login reference](./13_sdk_and_device_login.md) and [the application-owned callback example](../../rooiam-examples/example-4-reference-app/README.md) for the actual sign-in boundary. Run `npm ci && npm test` in the example directory before adapting it; persist application sessions and users in your own store for deployment.

For Android, build the Maven artifact, then assemble a separate consumer from its coordinates:

```sh
cd rooiam-sdk/android
./gradlew testDebugUnitTest publishReleasePublicationToLocalPreviewRepository
cd ../..
bash test/android-sdk-consumer.sh
```

Add the generated `rooiam-sdk/android/build/repository` as a Maven repository in your Android project and depend on `com.rooiam:android-sdk:0.4.0-alpha.1`. Follow [the Android integration guide](./14_android_sdk_integration.md) for session-cookie, scanner, confirmation and backup handling. For a different Play package, register that package and its Google Cloud project, supply a Play Integrity token bound to the SDK request hash, and configure the server's package allowlist and verifier. The [Play Integrity operations guide](../production/23_android_play_integrity.md) covers the operator side. The source example does not grant your own package production verification automatically.

## Upgrade from earlier Android preview

The public methods of the 0.2.0-alpha.4 `RooiamClient` and its support classes were compared against 0.4.0-alpha.1; the older public signatures remain and action/recovery methods were added. This is a source/API comparison, not a guarantee that every app's manifest, UI or Play signing setup will work unchanged. Rebuild your application against the new AAR **with its Maven POM** so transitive dependencies are included. Keep your Android application ID and signing certificate, and do not clear app data or overwrite the SDK vault: enrollment is stored in the host app's sandbox. Exclude `vault.xml` from backup and transfer. If the server has revoked this same device, the 0.4 SDK can verify that status and re-enroll it; it will not silently switch account or server. See [lost-phone recovery](./16_lost_phone_and_replacement.md).

The Play-installed reference app was updated in place and its existing enrollment completed a phone sign-in after the update. A different physical replacement phone has not been tested because only one handset was available; follow the recovery guide but validate that path for your own release. No npm/Maven registry publication or independent human fresh-clone walkthrough is claimed here.

## OIDC token and signing-key compatibility

Use authorization code with PKCE and an application-owned session. Keep refresh tokens server-side, serialize refresh requests and replace each token with its successor; reuse revokes the family. Validate JWT issuer, audience, expiry and signature against the issuer's discovery/JWKS. Rooiam's signing-key rotation publishes the active RSA key and eligible retired keys in JWKS; old keys leave after the configured rollover. A deployment using the original HMAC signing configuration cannot publish that secret in JWKS, so relying parties should use introspection or an appropriate confidential token-validation path until RSA rotation is configured. Do not rotate a production key merely to run this guide. The isolated 0.5 regression covers code exchange, refresh and key rollover; an operator should schedule production rotation separately.
