# Run OpenID conformance checks

Rooiam exposes an OpenID Connect discovery document, JWKS and authorization-code integration. The [OpenID Foundation conformance suite](https://gitlab.com/openid/conformance-suite) can test an **isolated candidate** before release. Running a suite plan is not certification; publish the plan result and profile name if making a conformance claim. The [1.0 compatibility page](../reference/19_compatibility_and_conformance.md) defines Rooiam's narrower supported integration contract.

## Prepare an isolated issuer

1. Deploy the candidate server and its database at a temporary **HTTPS** issuer. Do not point the suite at the live production database or share a signing key with production.
2. Configure an RSA signing key and confirm `/.well-known/openid-configuration` names the exact issuer, HTTPS endpoints, `RS256`, `S256`, and the client authentication methods the server actually accepts. Confirm `/.well-known/jwks.json` contains its matching public key.
3. Keep a record of the candidate Git revision, container/image digest, server configuration *names* (not values), and suite image digest. The test alias and static OAuth clients belong to this disposable environment.

## Run the official suite

Use the [official prebuilt Compose file](https://gitlab.com/openid/conformance-suite/-/blob/master/docker-compose-prebuilt.yml) in a private directory and start it with `docker compose up -d`. Its development UI normally uses `https://localhost.emobix.co.uk:8443`; trust its local test certificate only for this session. Use the suite's **Config OP** plan (`oidcc-config-certification-test-plan`) with the candidate discovery URL first. The plan tests discovery metadata and JWKS without a user sign-in. Save the plan/module ID, result and export.

Then try **Basic OP** (`oidcc-basic-certification-test-plan`) with three disposable confidential clients registered for the suite callback URL shown in the [OP testing instructions](https://openid.net/certification/connect_op_testing/). The suite exercises `client_secret_basic` and `client_secret_post` and a browser sign-in. Rooiam currently requires S256 PKCE on *every* authorization-code request and starts the usual relying-party journey at its hosted login widget. A Basic OP plan may fail when it sends an authorization request without PKCE or expects direct interactive login. Record this as a profile gap; do not disable PKCE or accept arbitrary caller-controlled resume URLs to turn a test green.

If a module fails, inspect its suite log and the issuer's redacted server log. Distinguish a network/issuer/JWKS setup error from a behavior the implementation lacks. Never commit client secrets, suite configuration containing secrets, one-time links, private keys or exported user data. Stop and remove the disposable suite/database after exporting redacted evidence.
