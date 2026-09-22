# CandyCloud web

React example app backed by `candycloud-server`. Requires Node.js 22.12 or newer (Node 24 is also supported).

```sh
npm ci
npm run dev
```

Set `VITE_API_URL` to the CandyCloud backend origin (for example `http://localhost:5185`), and `VITE_LOGIN_WIDGET_URL` to the Rooiam origin serving `/login-widget` (for example `http://localhost:5180`). Alternatively, use `VITE_API_URL=/api` with the development proxy. The CandyCloud backend routes do not have a `/v1` prefix.

`npm test` checks widget message and navigation boundaries. `npm run build` type-checks and builds the static site. `npm run deploy` builds and publishes the production branch of the `candycloud-web` Cloudflare Pages project; it requires Cloudflare authentication and the production widget origin in `.env.production`. The backend is deployed separately.

The authenticator controls are explicitly simulated. See [backend demo boundaries](../candycloud-server/README.md#demo-boundaries) before copying this example into a production app.
