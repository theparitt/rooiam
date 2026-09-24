# Confirm workspace API-key creation with a phone (0.3)

Rooiam can require the administrator creating a **workspace API key** to confirm its exact details on an enrolled Android phone. The phone confirms a Rooiam identity operation; it never receives the new API key or grants permissions the administrator did not already have. This is separate from enabling Phone as a sign-in method.

## Before enabling it

1. Run a Rooiam server and tenant portal that include the 0.3 action-approval API and migrations `0063`–`0064`. Upgrade both together. The policy defaults to **off**.
2. The workspace owner needs a recently signed-in portal session and an enrolled, verified phone **on that same Rooiam account**. A phone enrolled for a different account cannot confirm the owner's request. The Android app must use an SDK with `previewAction` and `approveAction` support; the reference app is only an example.
3. In **Workspace Settings → API Keys**, the owner selects **Require phone confirmation**. A separate setting controls whether Phone appears as a login method.
4. Check that each administrator who may create a key has an eligible enrolled phone. When confirmation is required, an administrator without one cannot create a key. Dedicated lost-phone recovery is planned for 0.4; the owner can turn the requirement off from a recent authenticated session if they still have account access.

## What the administrator sees

Enter the key label, permission preset and optional expiry. The portal freezes those values, then shows a QR code and a six-digit request code. Scan with the enrolled Android app. The app fetches the request from the trusted Rooiam server and displays the workspace, action, label, effective permissions and expiry. Compare the code and details before approving. The browser then creates the key and shows its raw value **once**. A denied, cancelled or expired request cannot be reused.

If the browser loses the final response, inspect the key list. A committed key's raw value cannot be recovered; revoke that key and start a fresh request if the secret was not saved. The phone's **Approved** message means the decision was accepted, not that a key was necessarily created.

## Android SDK integration

Use the SDK from [`rooiam-sdk/android`](../../rooiam-sdk/android/README.md). The [reference app](../../rooiam-examples/example-5-android-reference-app/README.md) shows camera, screen lifecycle, account session and Play Integrity setup. A host app owns its review UI. Network and signing methods run on a worker thread.

```java
RooiamClient client = new RooiamClient(context, trustedApiOrigin, cookies);

// Route by QR purpose. parseActionQr rejects a login QR and an origin mismatch.
String id = Protocol.parseActionQr(scannedQr, trustedApiOrigin, false);
RooiamClient.ActionReview review = client.previewAction(scannedQr);

showReview(
    review.getOrigin(), review.getWorkspace(), review.getAction(),
    review.getLabel(), review.getPermissionPreset(), review.getPermissions(),
    review.getKeyExpiry(), review.getDisplayCode()
);

// Only after the person explicitly confirms the same code and key details:
client.approveAction(review, review.getDisplayCode());
// Or: client.denyAction(review);
```

The SDK checks the trusted HTTPS origin and enrolled account before fetching details. It signs a purpose-specific payload with the enrolled device key and never exposes that key to host UI code. Do not automatically retry an ambiguous decision; fetch a fresh review or start a new browser request. An old SDK that understands only `device-login` rejects the action QR.

## Browser contract

The supplied tenant portal handles this flow. For a custom administrative UI, use the authenticated session cookie on the original browser:

1. `GET /v1/orgs/current/api-key-phone-policy` returns `required` and `version`.
2. `POST /v1/orgs/current/action-approvals` with `{ "label": "CI", "permission_preset": "workspace_admin", "expires_at": null }` returns an opaque ID, QR value, browser proof, code and five-minute expiry. Keep the proof in the initiating browser; **never put it in the QR**.
3. `POST /v1/orgs/current/action-approvals/status` with `{ "id": "…", "browser_proof": "…" }` reports `pending`, `approved`, `denied`, `cancelled`, `expired` or `consumed`.
4. After `approved`, submit the **unchanged** key configuration to `POST /v1/orgs/current/api-keys`, adding `approval_id` and `browser_proof`. The server rechecks workspace membership, permissions, policy version, device eligibility, expiry and every key parameter; it consumes the approval and inserts the key in one transaction.
5. `POST /v1/orgs/current/action-approvals/cancel` with the same ID and proof cancels an unconsumed request.

The API-key endpoint itself enforces the policy. Calling it directly without a matching approval fails when confirmation is required. A phone approval cannot be used for another browser session, workspace, key configuration or action. The raw key is returned only in the one successful creation response.

The phone's authenticated endpoints are `GET /v1/identity/action-approvals/{id}`, `POST /v1/identity/action-approvals/approve` and `POST /v1/identity/action-approvals/deny`. Use the SDK for device tokens and signatures; do not reconstruct its signing payload in an application.

## Troubleshooting

| Result | What to check |
|---|---|
| “Enroll a verified phone” when enabling policy | The owner needs an active device with verified attestation; complete the [Android setup](./14_android_sdk_integration.md) first. |
| The phone rejects the QR | Check the app's configured API origin, installed SDK version and that this is an action-approval QR, not a login QR. |
| Approval is denied or expires | Start a new request in the browser; decisions and five-minute requests are single-use. |
| Approval succeeds but key creation fails | Refresh the browser, inspect the key list, and check whether membership, policy or key configuration changed. Do not retry a lost final response automatically. |
| No eligible phone is available | Required confirmation fails closed. The owner can disable the opt-in policy after a recent sign-in; lost-account recovery is a separate 0.4 milestone. |

Operators must still configure Play Integrity for the Android app package and maintain the verified-device policy described in the [Play Integrity guide](../production/23_android_play_integrity.md). A package verified for the Rooiam reference app does not automatically certify a tenant's app.
