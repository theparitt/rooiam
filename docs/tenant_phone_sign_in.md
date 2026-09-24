# Phone sign-in for tenant workspaces

Phone sign-in lets a user start login on your website, scan a QR with an enrolled Android phone, compare the displayed code and approve. It appears alongside your other workspace login methods. Your users need an Android app integrated with the Rooiam SDK; scanning with an ordinary Camera app is not enough.

**Current availability:** Rooiam provides an [Android SDK and reference app source](./getting-started/11_build_your_first_android_app.md), not a general-purpose app for tenants to download. Your developer or integration partner must build and distribute an app, and the Rooiam operator must enable verification for its exact package. Keep Phone sign-in off until users have that supported app and enrollment instructions.

## The four things needed before users can sign in

1. **An app and server ready for your workspace.** Your developer builds an app using the Rooiam Android SDK and owns its Play Console/Cloud project. The Rooiam operator enables Phone sign-in and Play Integrity verification for that exact package. The reference app is an implementation example, not an app for all tenant users.
2. **Enable the login method.** In your tenant console, choose the workspace → **Access → Sign-In Methods → Phone sign-in**. Move the button up or down under **Login Button Order**. Keep at least one other usable login method available while onboarding phones.
3. **Each user enrolls their own phone.** Give users your app's official installation link. In that app they sign in to the same Rooiam account they use for your workspace and enroll their phone. A web login alone does not enroll a phone; the app must create and protect its device credential.
4. **Users scan and approve.** On your website they choose **Sign in with your phone**. In the enrolled app they scan the browser QR, compare the code and number, then explicitly approve. They return to the browser to finish sign-in and any required MFA. If your website uses OIDC, it still completes its own callback and application session.

Turning on the workspace switch **does not install an app or enroll users automatically**. A phone's ordinary Camera app cannot finish this login because it cannot use the enrolled device credential to approve the request.

## What to tell your users

Share your supported app's **official installation link**, then this short instruction:

> Install our approved phone app, sign in to your Rooiam account inside it, and enroll this phone. When you next sign in to our website, choose “Sign in with your phone,” scan the QR in the app, compare the number shown on both screens, and approve only if it matches.

Do not send users an arbitrary APK. If your team has not published a supported app and the operator has not enabled its package, keep Phone sign-in disabled. Developers can use the [Android SDK tutorial](./getting-started/11_build_your_first_android_app.md) and reference source; Play Console and Cloud project setup belong to the app owner, not the end user.

## If the button does not work

| What happens | Check |
|---|---|
| Phone is enabled in Access but missing from login | Ask the operator whether platform Phone sign-in is enabled. Confirm you opened the intended workspace login and saved its method order. |
| User has no supported app | Keep Phone sign-in disabled until your developer publishes one and the operator verifies its package. Use another available login method. |
| User installed the app but cannot scan/approve | Have them sign in and enroll **inside the app** first. Check that the app points at the same Rooiam server as the browser. |
| Approval succeeds on phone but the website is still signed out | Check browser completion, MFA and your website's OIDC callback/session. Phone approval alone does not create a website session. |

Your app developer handles app distribution and Play registration. Your Rooiam operator handles allowed packages, server verification and platform policy. Your tenant controls whether Phone appears in its own workspace and where the button appears.
