# Phone sign-in for tenant workspaces

Phone sign-in lets a user start login on your website, scan a QR with an enrolled Android phone, compare the displayed code and approve. It appears alongside your other workspace login methods. **Your tenant does not have to build an Android app** to use the Rooiam-managed route, but an approved phone app must actually be available to your users.

**Current availability:** Rooiam's public Android app is **not released yet**. The Rooiam Reference app is a developer example distributed to internal testers; it is not a general tenant download. Do not turn on Phone sign-in for ordinary users until your Rooiam operator supplies a supported app and installation instructions for your workspace. Your other login methods can remain available in the meantime.

## The four things needed before users can sign in

1. **An app and server ready for your workspace.** Your Rooiam operator confirms Phone sign-in and Play Integrity verification are enabled on the server, and tells you which approved Android app your users can install. The tenant does not configure Google Cloud or Play Console for a Rooiam-supplied app.
2. **Enable the login method.** In your tenant console, choose the workspace → **Access → Sign-In Methods → Phone sign-in**. Move the button up or down under **Login Button Order**. Keep at least one other usable login method available while onboarding phones.
3. **Each user enrolls their own phone.** Give users the operator-provided app installation link. In that app they sign in to the same Rooiam account they use for your workspace and choose **Enroll this phone**. A web login alone does not enroll a phone; the app must create and protect its device credential.
4. **Users scan and approve.** On your website they choose **Sign in with your phone**. In the enrolled app they scan the browser QR, compare the code and number, then explicitly approve. They return to the browser to finish sign-in and any required MFA. If your website uses OIDC, it still completes its own callback and application session.

Turning on the workspace switch **does not install an app or enroll users automatically**. A phone's ordinary Camera app cannot finish this login because it cannot use the enrolled device credential to approve the request.

## What to tell your users

Share the supported app's **official installation link supplied by your operator**, then this short instruction:

> Install the approved Rooiam phone app, sign in to your Rooiam account inside it, and enroll this phone. When you next sign in to our website, choose “Sign in with your phone,” scan the QR in the app, compare the number shown on both screens, and approve only if it matches.

Do not send users to the Rooiam Reference source or an arbitrary APK. If your operator has not provided a supported app, keep Phone sign-in disabled. For the screen sequence, see the [illustrated sign-in walkthrough](./getting-started/10_android_phone_sign_in_walkthrough.md), which currently uses the internal reference app to show the flow. Developers who intentionally build a separate Android app can use the [Android SDK tutorial](./getting-started/11_build_your_first_android_app.md); those Play Console steps are **not tenant setup steps**.

## If the button does not work

| What happens | Check |
|---|---|
| Phone is enabled in Access but missing from login | Ask the operator whether platform Phone sign-in is enabled. Confirm you opened the intended workspace login and saved its method order. |
| User has no supported app | Keep Phone sign-in disabled until the operator supplies an installation route. Use another available login method. |
| User installed the app but cannot scan/approve | Have them sign in and enroll **inside the app** first. Check that the app points at the same Rooiam server as the browser. |
| Approval succeeds on phone but the website is still signed out | Check browser completion, MFA and your website's OIDC callback/session. Phone approval alone does not create a website session. |

Your Rooiam operator handles app distribution, allowed packages, server verification and platform policy. Your tenant controls whether Phone appears in its own workspace and where the button appears.
