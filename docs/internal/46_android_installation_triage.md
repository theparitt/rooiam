# Android installation verification — 2026-09-23

This tracks the Play Protect installation blocker separately from camera and callback defects. It is not a vendor certification or a malware verdict.

## Observed on Redmi Note 9, Android 12

- Package: `com.rooiam.mobile`.
- Initial APK: `0.2.0-alpha.1`, version code 1.
- Initial APK SHA-256: `e11b8557cf8759a0c9d73fd1724cd25185221fda0e8e3db2dae367a8c1c981b2`.
- ADB installation returned `INSTALL_FAILED_USER_RESTRICTED`. A subsequent manual install produced `INSTALL_FAILED_VERIFICATION_FAILURE: Package Verification Result`.
- Google verifier logs recorded `result=REJECT`. Local scan sub-results and internal numeric verdicts do not establish the reason for that final rejection.
- Logs included `upload_requested=true` and `upload_consent=0`, but the user confirmed **Improve harmful app detection** was already enabled. Those internal values must not be equated with the user's settings.
- The user reported successful installation after disabling Play Protect. That establishes a protection-dependent installation failure, not proof that the app is malicious or falsely classified.

## Checks performed

`apksigner verify --print-certs` passes. The installed debug APK uses the original Android Debug signer; the camera fix keeps the package and certificate so enrollment can survive an update. The certificate SHA-256 fingerprint is `d2d1eca72560914a58f83f13b95e9112679ab7180e889bfb2380acb89f51fbf3`.

The alpha.1 merged manifest requested INTERNET and ACCESS_NETWORK_STATE. Alpha.2 replaces the external Google scanner with an in-app ZXing scanner and requests INTERNET and CAMERA. Neither inspected manifest requests SMS, notification-listener or accessibility privileges. These checks are useful triage evidence, not a malware audit or proof of Play Protect acceptance.

Build/source and APK integrity can be recorded using:

```sh
git rev-parse HEAD
sha256sum rooiam-android/app/build/outputs/apk/debug/app-debug.apk
"$ANDROID_HOME/build-tools/34.0.0/apksigner" verify --print-certs rooiam-android/app/build/outputs/apk/debug/app-debug.apk
"$ANDROID_HOME/build-tools/34.0.0/aapt" dump permissions rooiam-android/app/build/outputs/apk/debug/app-debug.apk
```

Do not reuse a previous APK hash after rebuilding. Do not include account cookies, private signing keys or phone enrollment secrets in a report.

## Remaining gate

Capture the exact current warning text and retest the final APK with Play Protect enabled. If Google continues to reject it, review the app and dependencies against [Google's warning guidance](https://developers.google.com/android/play-protect/warning-dev-guidance), then have the developer submit the exact package, APK/certificate identifiers and warning through the linked Play Protect appeal process if the classification appears erroneous. No appeal has been submitted in this session; no account access or vendor verdict is available.

Changing the certificate/package to evade a verdict, disabling verification, or a passing local build does not close this gate. Play Integrity enrollment is a different integration and still requires its own operator project/distribution configuration.
