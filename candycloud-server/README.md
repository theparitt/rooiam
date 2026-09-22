# CandyCloud backend

Express backend for `candycloud-web`. It exchanges OIDC codes with Rooiam, checks userinfo, stores tokens in Redis, and issues an HttpOnly app cookie. App-local display names are stored in SQLite. Routes are mounted at the backend origin (`/auth`, `/me`, `/identity/me`, etc.), without a `/v1` prefix; `ROOIAM_API_URL` includes Rooiam's `/v1` prefix.

Run with `npm ci` and `npm run dev` after configuring `.env`, or use `docker-compose.candycloud.yml`. Set `CANDYCLOUD_PORT=5185`, `ROOIAM_API_URL`, `CANDYCLOUD_REDIS_URL`, and `CANDYCLOUD_ALLOWED_ORIGINS`. HTTPS deployments also set `CANDYCLOUD_COOKIE_SECURE=true`.

## Demo boundaries

- MFA controls simulate enrollment and recovery codes in the CandyCloud session. They never enable real Rooiam MFA.
- `/auth/token` deliberately exposes the access token to the signed-in demo browser for curl examples. Do not copy this route into a backend that promises to keep bearer tokens out of the browser.
- Tokens are not automatically refreshed. The app session expires with the access token, even though Redis and the cookie have a 24-hour maximum lifetime. Sign in again after expiry.
- Browser-supplied workspace and app labels are display metadata, not authorization claims. Rooiam authorizes proxied requests using the stored access token; application business authorization must be implemented separately.
- Logout deletes the local app session. The frontend also navigates to Rooiam's end-session endpoint.

Run `npm test` for isolated proxy and session regression tests. Deploy the static frontend with `npm run deploy` in `candycloud-web`; the Express backend runs separately in Docker and is not a Cloudflare Pages app.
