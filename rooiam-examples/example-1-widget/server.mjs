import path from 'node:path'
import express from 'express'
import dotenv from 'dotenv'
import {
  buildHostedWidgetUrl,
  readExampleConfig,
} from '../shared/example-helpers.mjs'

dotenv.config({ path: path.join(process.cwd(), '.env') })

const app = express()
const port = Number(process.env.PORT || 5180)
const apiBase = (process.env.ROOIAM_API_BASE || 'http://localhost:5170/v1').replace(/\/+$/, '')

function layout({ title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap');
    :root {
      --bg-a: #f4fbff;
      --bg-b: #edf4ff;
      --ink: #1f2937;
      --muted: #6b7280;
      --border: #d7e5f6;
      --card: rgba(255,255,255,0.82);
      --pink: #8ed8f8;
      --violet: #bfd6ff;
      --ok-bg: #effcf3;
      --ok-border: #bfe7c8;
      --warn-bg: #fff7d6;
      --warn-border: #f0d57b;
      --bad-bg: #fff1f2;
      --bad-border: #fecdd3;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: 'Nunito', system-ui, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(142,216,248,0.34), transparent 28%),
        radial-gradient(circle at bottom right, rgba(191,214,255,0.4), transparent 34%),
        linear-gradient(180deg, var(--bg-a), var(--bg-b));
    }
    .shell { max-width: 980px; margin: 0 auto; padding: 20px 18px 40px; }
    .hero {
      display:flex; justify-content:space-between; align-items:flex-start; gap:16px;
      margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid var(--border);
    }
    .hero h1 { margin:0; font-size:1.55rem; line-height:1.1; letter-spacing:-0.02em; }
    .hero p { margin:6px 0 0; color:var(--muted); font-weight:600; line-height:1.55; font-size:0.95rem; max-width:760px; }
    .card {
      background: var(--card);
      backdrop-filter: blur(14px);
      border: 1px solid rgba(255,255,255,0.8);
      border-radius: 32px;
      box-shadow: 0 20px 48px rgba(15,23,42,0.09);
      padding: 28px;
    }
    .card h2 { margin: 0 0 8px; font-size: 1.1rem; }
    .card p { margin: 0; color: var(--muted); font-size: 0.96rem; font-weight: 600; line-height: 1.6; }
    .widget-wrap { display: flex; justify-content: center; margin-top: 12px; }
    iframe {
      width: 420px;
      max-width: 100%;
      height: 1px;
      border: 0;
      background: transparent;
      opacity: 0;
      display: block;
      transition: opacity .16s ease;
    }
    .status {
      margin-top: 20px;
      border-radius: 22px;
      padding: 16px 18px;
      border: 1px solid var(--border);
      background: white;
    }
    .status.ok { background: var(--ok-bg); border-color: var(--ok-border); }
    .status.warn { background: var(--warn-bg); border-color: var(--warn-border); }
    .status.bad { background: var(--bad-bg); border-color: var(--bad-border); }
    .meta { display: grid; gap: 12px; margin-top: 16px; }
    .meta-item {
      border-radius: 18px;
      border: 1px solid var(--border);
      background: white;
      padding: 12px 14px;
    }
    .meta-item .k {
      margin-bottom: 6px;
      color: #9ca3af;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: .14em;
      text-transform: uppercase;
    }
    .meta-item .v { font-size: 0.95rem; font-weight: 800; word-break: break-word; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center;
      text-decoration: none; margin-top: 18px;
      border-radius: 999px; padding: 12px 16px;
      font-size: 14px; font-weight: 800; color: var(--ink);
      border: 1px solid var(--border); background: white;
    }
  </style>
</head>
<body>
  <main class="shell">${body}</main>
</body>
</html>`
}

app.get('/', (req, res) => {
  // Example 1 is intentionally tiny: load config, build the strict widget URL,
  // then let the hosted widget own the rest of the login flow.
  const config = readExampleConfig()
  const widgetUrl = buildHostedWidgetUrl(config)

  res.send(
    layout({
      title: 'Example 1: Simple Widget',
      body: `
        <section class="hero">
          <div>
            <h1>Example 1: Simple Widget</h1>
            <p>The minimum hosted login widget using only workspace app identity.</p>
          </div>
        </section>
        <div class="widget-wrap">
          <iframe
            id="widget-frame"
            src="${widgetUrl}"
            allow="publickey-credentials-get *"
            title="Rooiam login widget"
          ></iframe>
        </div>
        <script>
          const iframe = document.getElementById('widget-frame')
          window.addEventListener('message', event => {
            if (!event?.data || event.data.type !== 'rooiam-login-widget:size') return
            if (typeof event.data.height === 'number') iframe.style.height = event.data.height + 'px'
            if (typeof event.data.width === 'number') iframe.style.width = Math.min(event.data.width, 420) + 'px'
            iframe.style.opacity = '1'
          })
        </script>
      `,
    }),
  )
})

app.get('/callback', (req, res) => {
  // This route exists only to show where the registered app callback lands
  // after Rooiam finishes the hosted login transaction.
  const config = readExampleConfig()
  const { error = '', error_description = '' } = req.query

  if (error) {
    res.status(400).send(
      layout({
        title: 'Example 1: Simple Widget Callback Error',
        body: `
          <section class="hero">
            <div>
              <h1>Example 1: Simple Widget</h1>
              <p>Example 1 callback result.</p>
            </div>
          </section>
          <section class="card">
            <h2>App Callback Error</h2>
            <div class="status bad">
              <strong>Callback failed.</strong><br />
              ${String(error_description || error)}
            </div>
            <div class="meta">
              <div class="meta-item"><div class="k">App</div><div class="v">${config.app_name || 'Rooiam Example'}</div></div>
              <div class="meta-item"><div class="k">Client ID</div><div class="v">${config.client_id || '—'}</div></div>
            </div>
            <a class="btn" href="/">Back to login</a>
          </section>
        `,
      }),
    )
    return
  }

  res.send(
    layout({
      title: 'Example 1: Simple Widget Callback',
      body: `
        <section class="hero">
          <div>
            <h1>Example 1: Simple Widget</h1>
            <p>Example 1 callback result.</p>
          </div>
        </section>
        <section class="card">
          <h2>Callback Received</h2>
          <div class="status ok">
            <strong>Callback captured.</strong><br />
            Rooiam redirected back to the app callback registered for this workspace app. This example keeps the widget contract strict and does not pass callback-style parameters into the iframe.
          </div>
          <div class="meta">
            <div class="meta-item"><div class="k">App</div><div class="v">${config.app_name || 'Rooiam Example'}</div></div>
            <div class="meta-item"><div class="k">Client ID</div><div class="v">${config.client_id || '—'}</div></div>
            <div class="meta-item"><div class="k">Callback Path</div><div class="v">${req.originalUrl}</div></div>
            <div class="meta-item"><div class="k">Flow Contract</div><div class="v">widget identity only</div></div>
          </div>
          <a class="btn" href="/">Back to login</a>
        </section>
      `,
    }),
  )
})

app.listen(port, () => {
  console.log(`example-1-widget running on http://localhost:${port}`)
})
