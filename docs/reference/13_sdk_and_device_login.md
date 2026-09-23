# SDK and Device Login Reference

This page describes the development checkout for 0.2. Existing server/SDK package versions remain `0.1.0`; package versions and the REST path prefix (`/v1`) are separate identifiers.

## TypeScript SDKs

`rooiam-sdk/packages/js-browser` contains `@rooiam/sdk-browser`. `rooiam-sdk/packages/js-server` contains `@rooiam/sdk-server`. Their generated types come from `rooiam-sdk/spec/openapi.json`; the server source is `rooiam-server/src/openapi.rs` plus handler annotations.

For repository development, install dependencies and build each SDK package from its own directory with `npm install` and `npm run build`. The package manifests and source define available methods; a server route does not automatically imply a handwritten SDK helper exists.

The browser SDK exports `buildHostedLoginUrl`:

```ts
import { buildHostedLoginUrl } from '@rooiam/sdk-browser'

const widgetUrl = buildHostedLoginUrl({
  apiOrigin: 'https://auth.example.com',
  workspaceId: 'YOUR_WORKSPACE_UUID',
  clientId: 'YOUR_REGISTERED_CLIENT_ID',
})
```

Use the result as the iframe URL. It includes workspace and client identity; it does not accept a browser-chosen callback or an `app` display-name parameter. Preview mode is explicitly separate.

The browser SDK supports public login, OIDC code exchange, and first-party cookie self-service. A downstream app's own session does not grant access to those cookie endpoints. Workspace API keys and client secrets belong on the backend.

## Token handling

`oidc.exchangeCode` returns the typed token response. For public clients, the SDK submits a form-encoded code exchange with PKCE. The response's `expires_in` is in seconds; do not hardcode access-token lifetime.

The server rotates refresh tokens. Serialize refresh calls and persist the successor after success. Reusing an old token revokes its active family, including under concurrent requests. The current browser SDK has no dedicated refresh helper; backend integrations can submit a form-encoded `grant_type=refresh_token` request to `/v1/oidc/token`, with the appropriate client authentication.

Read the [callback flow](./11_downstream_hosted_widget_callback_flow.md) for app-owned state/PKCE handling and the transition to an app-owned session.

## Trusted-device login

**Phone sign-in** is a normal login method in the hosted page and embedded widget. Workspace administrators enable or disable it in **Access → Login Methods**; **Login Widget → Sign-In Method Order** also exposes its toggle and move-up/move-down controls. Its method key is `device`. Existing stored orders keep their previous positions, with phone appended until reordered. The platform phone policy remains an upper limit, and existing attestation and MFA requirements still apply.

The reference app uses the widget's QR screen; it no longer needs a separate phone-login link. Embedded requests use the server-issued widget context and validated embedding origin, preserving the registered app callback.

The server has a trusted-device login protocol separate from WebAuthn. The mobile side registers a device token and Ed25519 public key; login approval uses the device credential and signed approval data, subject to attestation policy.

| Surface | Routes |
|---|---|
| Browser intent | `POST /v1/auth/device-login/start`, `GET /v1/auth/device-login/{public_id}/status` |
| Browser completion | `POST /v1/auth/device-login/complete`, `POST /v1/auth/device-login/cancel` |
| Trusted-device management | `POST /v1/identity/me/devices/attestation-challenge`, `GET/POST /v1/identity/me/devices`, `DELETE /v1/identity/me/devices/{id}` |
| Push-token registration | `PUT /v1/identity/me/devices/{id}/push-token` |
| Mobile decision | `GET /v1/identity/device-login/intents/{public_id}`, `POST /v1/identity/device-login/approve`, `POST /v1/identity/device-login/reject` |

Implementation modules include Apple App Attest and Google Play Integrity verification, plus policy-controlled compatibility verification. Exact request bodies, signing payloads, and policy settings are in the [mobile contract](../internal/44_mobile_device_login_contract.md) and current handler/service code. The server stores push tokens but does not itself deliver APNs/FCM notifications.

The development checkout includes `rooiam-examples/example-5-android-reference-app`, the hosted QR screen, and a real-signing Node harness in `rooiam-examples/device-login`. They are previews; real-phone/vendor and release certification are still pending.

For the downstream boundary after authentication, use [`example-4-reference-app`](../../rooiam-examples/example-4-reference-app/README.md). It demonstrates a confidential web client whose backend owns OAuth state, PKCE verifier, callback exchange, local subject mapping and an opaque application cookie. The browser never receives the client secret or Rooiam tokens. Phone approval changes the authentication method inside Rooiam; it does not change the relying party's OIDC callback/session contract.

`RooiamBrowser.deviceLogin` exposes `start`, `status`, `complete` and `cancel`, with optional abort signals. Keep the returned browser nonce in memory and poll status approximately every two seconds. Complete once after approval; follow the returned MFA challenge before showing success. Mutations are not automatically retried. After a lost completion response or reload, start a new request. `trustedDevices.list()` and `trustedDevices.revoke(id)` use the existing account cookie; never put phone private keys/device tokens in browser code.

Regenerate the contract with `node rooiam-sdk/scripts/sync-openapi.mjs`; `--check` detects server/spec/schema drift. Workspace phone login defaults off and requires both platform policy and workspace opt-in. Use the [API/SDK smoke checklist](../production/22_api_and_sdk_smoke_checklist.md) to validate a deployment and its native clients.

## Next milestone

[Rooiam 0.2](../roadmap.md) targets a verified Android + hosted-login QR journey on this foundation. The current protocol uses a browser nonce for device-login completion; this is separate from downstream OIDC PKCE. New scan-secret, claim or authorization-code fields from design proposals are not current API parameters.
