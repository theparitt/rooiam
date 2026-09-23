import path from 'node:path'
import dotenv from 'dotenv'
import { createReferenceApp } from './app.mjs'

dotenv.config({ path: path.join(process.cwd(), '.env') })
const port = Number(process.env.PORT || 5194)
const { app } = createReferenceApp({
  appBaseUrl: process.env.APP_BASE_URL || `http://localhost:${port}`,
  apiBase: process.env.ROOIAM_API_BASE || 'http://localhost:5170/v1',
  widgetUrl: process.env.ROOIAM_WIDGET_URL || 'http://localhost:5170/login-widget',
  hostedLoginOrigin: process.env.ROOIAM_HOSTED_LOGIN_ORIGIN,
  workspaceId: process.env.ROOIAM_WORKSPACE_ID,
  clientId: process.env.ROOIAM_CLIENT_ID,
  clientSecret: process.env.ROOIAM_CLIENT_SECRET,
  secureCookie: process.env.COOKIE_SECURE === 'true',
})
const server = app.listen(port, '127.0.0.1', () => console.log(`example-4-reference-app running on http://localhost:${server.address().port}`))
