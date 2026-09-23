# Embedded phone sign-in

`device-login.js` uses the browser SDK and local QR rendering inside `/login-widget`.
The server injects the validated widget context and embedding origin; the module
never chooses the application callback. Preview mode does not start an intent.

After building the browser SDK and installing `rooiam-app` dependencies, run
`node rooiam-server/widget/build.mjs` from the repository root. Commit the generated
`rooiam-server/assets/device-login.js` alongside source changes. CI checks that the
bundle is current. The build includes QR dependency license notices.
