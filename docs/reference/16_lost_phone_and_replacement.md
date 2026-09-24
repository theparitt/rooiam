# Lost phone and replacement

Rooiam phone sign-in and API-key confirmation use an enrolled Android app. If that phone is lost, revoke its enrollment from your Rooiam account and enroll a replacement. The old phone's key cannot be copied or restored from a backup.

## If you lost the phone

1. On a browser you trust, sign in to your Rooiam account using a method you already set up **other than the lost phone**, such as a magic link or passkey. Complete your usual MFA if asked. If you are already signed in, sign out and sign in again before revoking; Rooiam requires a session less than 10 minutes old.
2. Open **My → Security → Trusted phones**. Find the lost phone and select **Revoke phone**. Check its label before confirming. If the phone is not listed under this account, do not revoke another person's device.
3. Go to **My → Sessions** and revoke other browser sessions you do not recognize. Phone revocation stops the phone from approving new requests, but it does not close browser sessions that were already created.
4. Install your organization's Android app on the replacement phone. Sign in to the **same Rooiam account**, enroll the new phone, and wait until its attestation is verified. Test a new phone sign-in before relying on it.

Revocation is immediate for new phone decisions. Approved but unfinished sign-ins and API-key requests from that phone stop; pending API-key requests for your account are cancelled. Start a fresh QR request after enrolling a replacement. A workspace requiring phone confirmation will block new API keys while you have no eligible phone. It does **not** automatically turn off that policy.

If you cannot use any other sign-in method, this self-service path is unavailable. Contact your Rooiam operator through your organization's established account-recovery process. Rooiam does not turn off phone approval on the basis of an email or support message alone.

## If you are changing phones

While the old phone still works, enroll and verify the new phone on the same account first. Then use **My → Security → Trusted phones** to revoke the old one. Check **My → Sessions** if you are retiring or disposing of the old device. Tenant app owners must build and distribute their own Android app using the [SDK integration guide](./14_android_sdk_integration.md); Rooiam Reference is a developer example, not a general tenant app.

If you are re-enrolling the same physical phone after you revoked it from the web, update your Android app to a version with 0.4 recovery support, sign in to the same account, then tap **Enroll this phone**. The SDK confirms that the original enrollment is revoked on the server before removing its local key and creating a new one. It refuses to reset a key for another account, server, or unmatched registration. If the app reports that it cannot verify the stored enrollment, ask your operator to investigate rather than repeatedly clearing app data.

Operators should keep their verified-device and Play Integrity policy in place. A replacement app package needs its own package verification; revoking or replacing a phone is not a reason to relax that policy.
