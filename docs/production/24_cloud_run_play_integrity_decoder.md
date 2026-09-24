# Keyless Play Integrity verification from a self-hosted server

This deployment keeps Rooiam on your own host. A small Cloud Run service only calls Google's `decodeIntegrityToken` API using an **attached service account**; Rooiam still decides whether to trust the decoded package, request binding, device verdict, and age. No Google service-account key is created or copied to Rooiam.

The decoder is specific to one Android package. For Rooiam Reference, use `com.rooiam.reference` and Google Cloud project number `1028955371558`, which is linked to that app in Play Console. Other application owners use their own Play-linked project and package.

## Deploy the decoder

Cloud Run requires a Google Cloud project linked to Billing and a signed-in Google Cloud CLI administrator. From the repository root, run the deployment script. It resolves the project ID from the number, verifies the existing `rooiam-play-integrity` service account, enables the required APIs, grants the default Cloud Build identity `roles/run.builder` so it can read the uploaded source, stores a generated shared secret in Secret Manager, and deploys the decoder. It prints the service URL and **the path** to the private secret file, never the secret value.

```bash
bash rooiam-server/deploy/play-integrity-decode-proxy/deploy.sh 1028955371558
```

Cloud Run's public HTTPS endpoint is **application-authenticated**: every decode request must contain the matching `X-Rooiam-Proxy-Secret` header. The `/health` endpoint exposes no credential. Keep the secret in Google Secret Manager and in a private environment file on the Rooiam server; rotate both copies together. `--allow-unauthenticated` is required because the self-hosted Rooiam server has no Google workload identity. Do not put this decoder URL in a browser login widget or expose the secret to an Android app.

Transfer the local `play-integrity-proxy-secret` file securely to the home server during deployment. The two values must match exactly. Re-running the script reads the existing Secret Manager value instead of creating a new one. Cloud Run may require an administrator to grant the deployer `roles/iam.serviceAccountUser` on the attached service account. If Billing is not yet linked to this project, link the existing billing account in Google Cloud Console before running the script.

## Connect Rooiam

On the production host, store the transferred secret in an owner-readable file outside the repository, for example `~/rooiam-secrets/play-integrity-proxy-secret` with mode `0600`. In the host's private Compose environment, set the Cloud Run service's HTTPS origin and the absolute path to that file. Add [`production-play-integrity-proxy.compose.yaml`](../../rooiam-server/deploy/production-play-integrity-proxy.compose.yaml) to the active Compose command when deploying the Rooiam server image that contains proxy support. The override mounts the secret read-only. Do not enable `ROOIAM_GOOGLE_PLAY_USE_ADC` or configure a service-account private key in the same container.

```dotenv
ROOIAM_GOOGLE_PLAY_DECODE_PROXY_URL=https://YOUR_CLOUD_RUN_SERVICE.run.app
ROOIAM_PLAY_PROXY_SECRET_FILE=/home/YOUR_USER/rooiam-secrets/play-integrity-proxy-secret
```

Rooiam requires an HTTPS origin and a secret of at least 32 ASCII characters. The decoder accepts only its configured Android package and never returns a Google access token to Rooiam. A missing/incorrect secret, Google error, timeout, or invalid response makes vendor attestation unavailable; it does **not** approve phone sign-in.

## Release checks

1. With Phone sign-in still disabled, check `/health` on both services and verify that a request without the proxy secret returns 401. Confirm an invalid integrity token returns 400 through the authenticated proxy; this proves the attached service account can call Google while keeping the genuine phone flow untouched.
2. In a test environment, verify wrong package, wrong secret, invalid token, and unavailable proxy all fail closed. Check that logs contain no token or shared secret.
3. In production, enable the platform method and one intended workspace only after a Play-installed phone enrolls against the production API and a real attestation is verified. Then test a QR approval through `app.rooiam.com`, callback completion, session creation, cancellation, expiry, and audit events. A `phone-test.rooiam.com` enrollment is tied to that test origin and does not automatically move to production.

For the underlying verdict and policy checks, see [Android Play Integrity setup](./23_android_play_integrity.md).
