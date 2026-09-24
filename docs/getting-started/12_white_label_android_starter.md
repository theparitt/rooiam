# Build a branded Android phone app for your tenant

If your workspace wants its **own Android app and Play Store listing**, use the [Rooiam Android tenant starter](../../rooiam-android-tenant-starter/README.md). This is separate from the Rooiam Reference example. It keeps the tested SDK and approval flow, while letting you set the app's name, package, server, color, corners and logo in one `tenant.properties` file. Your team owns its Play listing and updates.

**This is an advanced tenant option.** A tenant that only wants users to sign in should use an operator-supplied Rooiam app once one is available. Rooiam's public app is not released yet. Changing the starter's logo does not make it work against the hosted Rooiam server by itself: the operator must authorize and verify its new package.

## Before you build

You need Android Studio/JDK 17, an Android phone, your own Play Console account, a Google Cloud project, and a Rooiam operator willing to onboard your exact package. Pick a unique permanent package name; Google says Play package names are [unique and permanent](https://support.google.com/googleplay/android-developer/answer/9859152). The current Rooiam production decoder is configured for one package, so **hosted multi-tenant self-service onboarding is not yet available**. Do not promise your users Phone sign-in until the operator confirms the verifier is ready.

## Make the app yours

Clone the repository and open `rooiam-android-tenant-starter` in Android Studio. Edit [its `tenant.properties`](../../rooiam-android-tenant-starter/tenant.properties):

```properties
applicationId=com.yourcompany.phone
appName=Your Company Login
apiOrigin=https://your-rooiam-api.example
cloudProjectNumber=123456789012
brandColor=#287E73
cornerRadiusDp=20
versionCode=1
versionName=1.0.0
logoFile=branding/logo.png
```

Put your square PNG at the path you chose. The same file becomes the app's in-app mark and launcher icon. `brandColor` and `cornerRadiusDp` style the main screen; the Android launcher chooses its own icon mask. The API origin and Google project number are **public configuration**, not credentials. Never put a service-account key or Play signing password in this file.

Run `./gradlew assembleDebug lintDebug` to inspect the design. For a release, create the app in **your Play Console**, link **your Cloud project** under **Protected with Play → Play Integrity API**, and use its numeric project number. Google documents these steps in [Play Integrity setup](https://developer.android.com/google/play/integrity/setup). Keep your upload key private, set the four signing environment variables listed in the [starter README](../../rooiam-android-tenant-starter/README.md), then run `./gradlew bundleRelease` and upload the signed AAB to your own internal test track.

The release check is end-to-end: install from Play, sign in inside the app, enroll, scan a browser QR, compare the number, approve and reach the browser's workspace or application session. A sideloaded debug APK does not pass strict Play verification. When updating, increase `versionCode` and keep the same package and signing setup.

For troubleshooting and annotated SDK calls, use [Build your first Android phone sign-in app](./11_build_your_first_android_app.md). For a tenant that **does not** want to own a Play app, read [Phone sign-in for tenant workspaces](../tenant_phone_sign_in.md).
