import path from 'node:path'
import express from 'express'
import dotenv from 'dotenv'
import {
  buildHostedWidgetUrl,
  callWorkspaceApi,
  parseCookies,
  readExampleConfig,
} from '../shared/example-helpers.mjs'

dotenv.config({ path: path.join(process.cwd(), '.env') })

const app = express()
const port = Number(process.env.PORT || 5181)
const apiBase = (process.env.ROOIAM_API_BASE || 'http://localhost:5170/v1').replace(/\/+$/, '')
const apiKey = (process.env.ROOIAM_API_KEY || '').trim()

async function fetchWorkspaceInfo() {
  if (!apiKey) {
    return { error: 'Missing ROOIAM_API_KEY in example-2-account/.env' }
  }

  const result = await callWorkspaceApi({
    apiBase,
    apiKey,
    pathname: '/orgs/integrations/workspace',
  })
  return result.ok ? { data: result.data } : { error: result.error || 'Could not reach Rooiam API.' }
}

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
      --bg-a: #fff8f3;
      --bg-b: #f6f1ff;
      --ink: #1f2937;
      --muted: #6b7280;
      --border: #eadcf7;
      --card: rgba(255,255,255,0.82);
      --pink: #ffb6c8;
      --violet: #d9c2ff;
      --sky: #eef7ff;
      --sky-border: #bfdcf8;
      --amber: #fff7d6;
      --amber-border: #f0d57b;
      --green: #effcf3;
      --green-border: #bfe7c8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Nunito', system-ui, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at top left, rgba(255,182,200,0.35), transparent 28%),
        radial-gradient(circle at bottom right, rgba(217,194,255,0.35), transparent 34%),
        linear-gradient(180deg, var(--bg-a), var(--bg-b));
      min-height: 100vh;
    }
    .shell { max-width: 1180px; margin: 0 auto; padding: 20px 18px 40px; }
    .hero {
      display:flex; justify-content:space-between; align-items:flex-start; gap:16px;
      margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid var(--border);
    }
    .hero h1 { margin:0; font-size:1.55rem; line-height:1.1; letter-spacing:-0.02em; }
    .hero p { margin:6px 0 0; color:var(--muted); font-weight:600; line-height:1.55; font-size:0.95rem; max-width:760px; }
    .grid { display: grid; gap: 24px; grid-template-columns: minmax(0, 560px); justify-content: center; }
    .grid.widget-only { grid-template-columns: minmax(0, 420px); }
    .card {
      background: var(--card); backdrop-filter: blur(14px);
      border: 1px solid rgba(255,255,255,0.8); border-radius: 32px;
      box-shadow: 0 20px 48px rgba(15,23,42,0.09);
      padding: 24px;
    }
    .card h2 { margin: 0 0 10px; font-size: 1.1rem; }
    .card p { margin: 0; color: var(--muted); font-size: 0.95rem; font-weight: 600; line-height: 1.6; }
    .hint { border-radius: 24px; padding: 16px 18px; border: 1px solid var(--sky-border); background: var(--sky); margin-top: 16px; }
    .hint.warn { background: var(--amber); border-color: var(--amber-border); }
    .hint.ok { background: var(--green); border-color: var(--green-border); }
    .hint h3 { margin: 0 0 6px; font-size: 0.92rem; }
    .hint p, .hint li { color: #374151; font-size: 0.92rem; }
    .hint ul { margin: 8px 0 0 18px; padding: 0; }
    .iframe-wrap { display: flex; justify-content: center; }
    iframe {
      width: 420px; max-width: 100%; height: 1px; border: 0; background: transparent;
      display: block; opacity: 0; transition: opacity .16s ease;
    }
    .meta { display: grid; gap: 14px; margin-top: 18px; }
    .meta-item {
      border-radius: 22px; background: white; border: 1px solid var(--border); padding: 14px 16px;
    }
    .meta-item .k { font-size: 11px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: #9ca3af; margin-bottom: 6px; }
    .meta-item .v { font-size: 0.98rem; font-weight: 800; word-break: break-word; }
    .code {
      margin-top: 14px; padding: 14px 16px; border-radius: 22px; background: #111827; color: #f9fafb;
      font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-x: auto;
    }
    .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 18px; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      text-decoration: none; border-radius: 999px; padding: 12px 16px;
      font-size: 14px; font-weight: 800; border: 1px solid var(--border);
      background: white; color: var(--ink);
    }
    .btn.primary { background: linear-gradient(135deg, var(--pink), var(--violet)); }
    .dashboard-grid { display: grid; gap: 24px; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
    .my-shell { display: grid; gap: 24px; grid-template-columns: 230px minmax(0, 1fr); align-items: start; }
    .my-nav { position: sticky; top: 24px; display: grid; gap: 10px; }
    .my-nav-eyebrow { margin: 0 0 4px; color: #94a3b8; font-size: 11px; font-weight: 900; letter-spacing: .18em; text-transform: uppercase; }
    .my-nav-button {
      width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px;
      border-radius: 18px; border: 1px solid var(--border); background: white; color: #475569;
      padding: 12px 14px; font: inherit; font-size: 14px; font-weight: 800; cursor: pointer; text-align: left;
    }
    .my-nav-button.active { background: linear-gradient(135deg, #fff5f7, #f6f0ff); border-color: #d7b8ff; color: #1f2b46; }
    .my-nav-dot { width: 9px; height: 9px; border-radius: 999px; background: #d7dce4; flex: 0 0 auto; }
    .my-nav-button.active .my-nav-dot { background: linear-gradient(135deg, var(--pink), var(--violet)); }
    .my-main { display: grid; gap: 20px; }
    .my-panel.hidden { display: none; }
    .stack { display: grid; gap: 18px; }
    .section-title { margin: 0 0 8px; font-size: 1rem; line-height: 1.35; }
    .section-copy { margin: 0; color: var(--muted); font-size: 0.92rem; font-weight: 600; line-height: 1.55; }
    .status-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; }
    .status-badge {
      display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 8px 12px;
      font-size: 12px; font-weight: 800; border: 1px solid var(--border); background: white;
    }
    .status-badge.ok { background: var(--green); border-color: var(--green-border); }
    .status-badge.warn { background: var(--amber); border-color: var(--amber-border); }
    .subtle { color: #94a3b8; font-size: 12px; font-weight: 700; }
    .list { display: grid; gap: 12px; margin-top: 16px; }
    .list-item {
      border-radius: 22px; background: white; border: 1px solid var(--border); padding: 14px 16px;
      display: flex; align-items: center; justify-content: space-between; gap: 14px;
    }
    .list-item h3, .list-item p { margin: 0; }
    .list-item h3 { font-size: 0.95rem; }
    .list-item p { font-size: 0.86rem; color: var(--muted); font-weight: 700; }
    .inline-form { display: grid; gap: 12px; margin-top: 16px; }
    .field {
      width: 100%; border-radius: 18px; border: 1px solid var(--border);
      background: white; color: var(--ink); padding: 12px 14px; font: inherit; font-size: 14px; font-weight: 700;
    }
    .field::placeholder { color: #9ca3af; }
    .button-row { display: flex; gap: 10px; flex-wrap: wrap; }
    .button {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      border-radius: 999px; border: 1px solid var(--border); background: white; color: var(--ink);
      padding: 11px 15px; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer;
    }
    .button.primary { border: 0; background: linear-gradient(135deg, var(--pink), var(--violet)); color: #5a2d3f; }
    .button.warn { border-color: #f4c7cf; color: #9f1239; background: #fff6f7; }
    .button:disabled { opacity: .6; cursor: not-allowed; }
    .message {
      margin-top: 14px; padding: 12px 14px; border-radius: 18px; font-size: 13px; line-height: 1.45; font-weight: 700;
      border: 1px solid transparent; display: none;
    }
    .message.show { display: block; }
    .message.ok { background: var(--green); border-color: var(--green-border); color: #166534; }
    .message.warn { background: var(--amber); border-color: var(--amber-border); color: #92400e; }
    .message.error { background: #fff1f2; border-color: #fecdd3; color: #be123c; }
    .backup-grid {
      display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px;
    }
    .backup-code {
      border-radius: 14px; padding: 10px 12px; background: #fff7d6; border: 1px solid #f0d57b;
      font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 800; color: #92400e;
    }
    .secret-box, .uri-box {
      margin-top: 10px; padding: 12px 14px; border-radius: 16px; background: white; border: 1px solid var(--border);
      font-size: 12px; line-height: 1.55; word-break: break-word;
    }
    .profile-head { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; }
    .avatar {
      width: 72px; height: 72px; border-radius: 999px; overflow: hidden; border: 1px solid var(--border);
      background: white; box-shadow: 0 10px 24px rgba(15,23,42,0.06); flex: 0 0 auto;
    }
    .avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .summary-grid { display: grid; gap: 14px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 18px; }
    .subcard {
      border-radius: 24px; background: rgba(255,255,255,0.74); border: 1px solid rgba(255,255,255,0.9);
      box-shadow: 0 14px 30px rgba(15,23,42,0.05); padding: 18px;
    }
    .subcard h3 { margin: 0 0 8px; font-size: 0.96rem; }
    .subcard p { margin: 0; }
    .session-columns { display: grid; gap: 18px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 16px; }
    .audit-list { display: grid; gap: 12px; margin-top: 16px; }
    .audit-item { border-radius: 20px; background: white; border: 1px solid var(--border); padding: 14px 16px; }
    .audit-item-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
    .audit-action { font-size: 13px; font-weight: 900; color: #1f2b46; }
    .audit-meta { color: var(--muted); font-size: 12px; font-weight: 700; line-height: 1.5; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .hidden { display: none !important; }
    .empty { color: var(--muted); font-size: 0.92rem; font-weight: 700; margin-top: 14px; }
    @media (max-width: 980px) { .dashboard-grid, .summary-grid, .session-columns, .my-shell { grid-template-columns: 1fr; } .my-nav { position: static; } }
    @media (max-width: 980px) { .grid { grid-template-columns: 1fr; } .hero { flex-direction: column; align-items: flex-start; } }
  </style>
</head>
<body>
  <main class="shell">
    <header class="hero">
      <div>
        <h1>${title}</h1>
        <p>Real integration sample using the Rooiam hosted login widget and a workspace API key.</p>
      </div>
    </header>
    ${body}
  </main>
</body>
</html>`
}

app.get('/', async (req, res) => {
  // Example 2 shows the real downstream app shape:
  // - embed the hosted widget
  // - keep a browser session on 5170
  // - use workspace API keys only for workspace metadata, not end-user auth
  const config = readExampleConfig()
  const widgetUrl = buildHostedWidgetUrl(config)
  const body = `
    <section class="grid widget-only">
      <div class="iframe-wrap">
        <iframe id="login-widget-frame" src="${widgetUrl}" title="${config.app_name || 'Rooiam Example'} Login" allow="publickey-credentials-get *"></iframe>
      </div>
    </section>
    <script>
      (function() {
        const frame = document.getElementById('login-widget-frame');
        if (!frame) return;
        window.addEventListener('message', function(event) {
          if (event.origin !== 'http://localhost:5170') return;
          if (!event.data || event.data.type !== 'rooiam-login-widget:size') return;
          const nextHeight = Number(event.data.height);
          const nextWidth = Number(event.data.width);
          if (Number.isFinite(nextHeight) && nextHeight > 0) {
            frame.style.height = nextHeight + 'px';
            frame.height = String(nextHeight);
          }
          if (Number.isFinite(nextWidth) && nextWidth > 0) {
            frame.style.width = nextWidth + 'px';
            frame.width = String(nextWidth);
          }
          frame.style.opacity = '1';
        });
      })();
    <\/script>
  `
  res.type('html').send(layout({ title: 'Example 2: Real Integration', body }))
})

app.get('/dashboard', async (req, res) => {
  // The dashboard demonstrates what a downstream app usually does after login:
  // call identity, MFA, sessions, and audit APIs using the browser session
  // cookie that Rooiam issued on the main auth server.
  const config = readExampleConfig()
  const integration = await fetchWorkspaceInfo()
  const apiOrigin = new URL(apiBase).origin
  const accountReturnUrl = `${req.protocol}://${req.get('host')}/dashboard?section=account`
  const logoutParams = new URLSearchParams({
    post_logout_redirect_uri: `${req.protocol}://${req.get('host')}/`,
  })
  if ((config.client_id || '').trim()) {
    logoutParams.set('client_id', config.client_id.trim())
  }
  const logoutUrl = `${apiOrigin}/v1/oidc/end-session?${logoutParams.toString()}`
  const body = `
    <section class="my-shell">
      <aside class="card my-nav">
        <p class="my-nav-eyebrow">My</p>
        <button class="my-nav-button" type="button" data-section="profile"><span>Profile</span><span class="my-nav-dot"></span></button>
        <button class="my-nav-button" type="button" data-section="account"><span>Account</span><span class="my-nav-dot"></span></button>
        <button class="my-nav-button" type="button" data-section="security"><span>Security</span><span class="my-nav-dot"></span></button>
        <button class="my-nav-button" type="button" data-section="sessions"><span>Sessions</span><span class="my-nav-dot"></span></button>
        <button class="my-nav-button" type="button" data-section="audit"><span>Audit Logs</span><span class="my-nav-dot"></span></button>
        <a class="my-nav-button" href="${logoutUrl}"><span>Sign Out</span><span class="my-nav-dot"></span></a>
      </aside>

      <div class="my-main">
        <div id="global-message" class="message"></div>

        <section class="card my-panel" data-panel="profile">
          <h2 class="section-title">Profile</h2>
          <p class="section-copy">Manage the end-user identity that is currently signed in through this app.</p>
          <div class="profile-head">
            <div class="avatar"><img id="profile-avatar" src="${apiOrigin}/assets/rooiam-app-white.svg" alt="Profile avatar" /></div>
            <div>
              <h3 id="profile-name" class="section-title" style="margin-bottom:4px">—</h3>
              <p id="profile-email" class="section-copy">—</p>
              <p id="profile-status" class="subtle" style="margin-top:6px">—</p>
            </div>
          </div>
          <div class="inline-form">
            <input id="display-name" class="field" type="text" placeholder="Display name" />
            <div class="button-row">
              <button id="save-profile" class="button primary" type="button">Save Profile</button>
            </div>
          </div>
          <div class="inline-form" style="margin-top:18px">
            <input id="new-email" class="field" type="email" placeholder="new-email@example.com" />
            <div class="button-row">
              <button id="request-email-change" class="button" type="button">Send Email Change Link</button>
            </div>
          </div>
          <div class="summary-grid">
            <div class="subcard">
              <h3>Workspace</h3>
              <p>${integration.error ? '—' : integration.data.workspace_name}</p>
            </div>
            <div class="subcard">
              <h3>Workspace ID</h3>
              <p class="mono">${integration.error ? '—' : integration.data.workspace_id}</p>
            </div>
            <div class="subcard">
              <h3>Brand Color</h3>
              <p>${integration.error ? '—' : (integration.data.brand_color || '—')}</p>
            </div>
          </div>
        </section>

        <section class="card my-panel hidden" data-panel="account">
          <h2 class="section-title">Account</h2>
          <p class="section-copy">Link Google or Microsoft to the same Rooiam identity so this end-user can sign in with those providers too.</p>
          <div id="account-summary" class="status-row"></div>
          <div class="list" id="linked-accounts-list"></div>
          <div class="button-row" style="margin-top:16px">
            <button id="link-google" class="button" type="button">Link Google</button>
            <button id="link-microsoft" class="button" type="button">Link Microsoft</button>
          </div>
        </section>

        <section class="card my-panel hidden" data-panel="security">
          <h2 class="section-title">Security</h2>
          <p class="section-copy">Manage passkeys and TOTP MFA for the same live end-user account session from 5170.</p>
          <div class="stack">
            <div class="subcard">
              <h3>Passkeys</h3>
              <p class="section-copy">Add device passkeys for faster sign-in.</p>
              <div class="inline-form">
                <input id="passkey-name" class="field" type="text" value="My Device" placeholder="My Device" />
                <div class="button-row">
                  <button id="add-passkey" class="button primary" type="button">Add Passkey</button>
                </div>
              </div>
              <div id="passkey-list" class="list"></div>
              <p id="passkey-empty" class="empty">No passkeys added yet.</p>
            </div>

            <div class="subcard">
              <h3>TOTP MFA</h3>
              <p class="section-copy">Add a 6-digit authenticator code after sign-in.</p>
              <div id="mfa-summary" class="status-row"></div>
              <div class="button-row" style="margin-top:16px">
                <button id="start-totp" class="button primary" type="button">Start TOTP Setup</button>
                <button id="disable-totp" class="button warn" type="button">Disable TOTP</button>
                <button id="regen-backups" class="button" type="button">Regenerate Backup Codes</button>
              </div>
              <div id="totp-setup" class="hidden">
                <div class="secret-box"><strong>Secret</strong><br><span id="totp-secret">—</span></div>
                <div class="uri-box"><strong>OTP URI</strong><br><span id="totp-uri">—</span></div>
                <div class="inline-form">
                  <input id="totp-code" class="field" type="text" inputmode="numeric" placeholder="Enter 6-digit code" />
                  <div class="button-row">
                    <button id="finish-totp" class="button primary" type="button">Verify & Enable</button>
                  </div>
                </div>
              </div>
              <div id="backup-codes" class="backup-grid hidden"></div>
            </div>
          </div>
        </section>

        <section class="card my-panel hidden" data-panel="sessions">
          <h2 class="section-title">Sessions</h2>
          <p class="section-copy">See this browser session and revoke other active sessions tied to the same end-user identity.</p>
          <div class="button-row" style="margin-top:16px">
            <button id="revoke-others" class="button warn" type="button">Revoke All Others</button>
          </div>
          <div class="session-columns">
            <div class="subcard">
              <h3>Current Session</h3>
              <div id="current-session" class="list"></div>
            </div>
            <div class="subcard">
              <h3>Other Sessions</h3>
              <div id="other-sessions" class="list"></div>
              <p id="other-sessions-empty" class="empty">No other active sessions.</p>
            </div>
          </div>
        </section>

        <section class="card my-panel hidden" data-panel="audit">
          <h2 class="section-title">Audit Logs</h2>
          <p class="section-copy">Everything this end-user did on this Rooiam identity: logins, MFA, passkeys, linked accounts, and profile changes.</p>
          <div class="button-row" style="margin-top:16px">
            <button id="refresh-audit" class="button" type="button">Refresh Audit Logs</button>
            <a class="btn" href="/">Back to login</a>
          </div>
          <div id="audit-list" class="audit-list"></div>
          <p id="audit-empty" class="empty">No audit events yet.</p>
        </section>
      </div>
    </section>
    <script>
      (function() {
        const apiBase = ${JSON.stringify(apiBase)}
        const apiOrigin = ${JSON.stringify(apiOrigin)}
        const returnUrl = ${JSON.stringify(accountReturnUrl)}
        const globalMessage = document.getElementById('global-message')
        const navButtons = Array.from(document.querySelectorAll('[data-section]'))
        const panels = Array.from(document.querySelectorAll('[data-panel]'))
        const profileAvatar = document.getElementById('profile-avatar')
        const profileName = document.getElementById('profile-name')
        const profileEmail = document.getElementById('profile-email')
        const profileStatus = document.getElementById('profile-status')
        const displayNameInput = document.getElementById('display-name')
        const saveProfileBtn = document.getElementById('save-profile')
        const newEmailInput = document.getElementById('new-email')
        const requestEmailChangeBtn = document.getElementById('request-email-change')
        const accountSummary = document.getElementById('account-summary')
        const linkedAccountsList = document.getElementById('linked-accounts-list')
        const linkGoogleBtn = document.getElementById('link-google')
        const linkMicrosoftBtn = document.getElementById('link-microsoft')
        const passkeyNameInput = document.getElementById('passkey-name')
        const addPasskeyBtn = document.getElementById('add-passkey')
        const passkeyList = document.getElementById('passkey-list')
        const passkeyEmpty = document.getElementById('passkey-empty')
        const mfaSummary = document.getElementById('mfa-summary')
        const startTotpBtn = document.getElementById('start-totp')
        const disableTotpBtn = document.getElementById('disable-totp')
        const regenBackupsBtn = document.getElementById('regen-backups')
        const totpSetup = document.getElementById('totp-setup')
        const totpSecret = document.getElementById('totp-secret')
        const totpUri = document.getElementById('totp-uri')
        const totpCodeInput = document.getElementById('totp-code')
        const finishTotpBtn = document.getElementById('finish-totp')
        const backupCodes = document.getElementById('backup-codes')
        const revokeOthersBtn = document.getElementById('revoke-others')
        const currentSession = document.getElementById('current-session')
        const otherSessions = document.getElementById('other-sessions')
        const otherSessionsEmpty = document.getElementById('other-sessions-empty')
        const refreshAuditBtn = document.getElementById('refresh-audit')
        const auditList = document.getElementById('audit-list')
        const auditEmpty = document.getElementById('audit-empty')

        let meState = null
        let linkedState = null
        let mfaState = null
        let totpChallengeId = ''
        let sessionsState = []

        function setMessage(kind, text) {
          if (!globalMessage) return
          if (!text) {
            globalMessage.className = 'message'
            globalMessage.textContent = ''
            return
          }
          globalMessage.className = 'message show ' + kind
          globalMessage.textContent = text
        }

        async function authFetch(path, options = {}) {
          let response
          try {
            response = await fetch(apiBase + path, {
              ...options,
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {}),
              },
            })
          } catch (error) {
            throw new Error('Could not reach the Rooiam API from 5181.')
          }
          if (response.status === 401) {
            throw new Error('Sign in first. Your end-user session on 5170 is missing or expired.')
          }
          const data = await response.json().catch(() => ({}))
          if (!response.ok) {
            throw new Error(data?.error?.message || data?.message || response.statusText || 'Request failed')
          }
          return data
        }

        function resolveAssetUrl(value) {
          if (!value) return new URL('/assets/rooiam-app-white.svg', apiOrigin).toString()
          if (value.startsWith('http://') || value.startsWith('https://')) return value
          return new URL(value, apiOrigin).toString()
        }

        function selectSection(section, replace) {
          const next = section || 'profile'
          navButtons.forEach(function(button) {
            button.classList.toggle('active', button.getAttribute('data-section') === next)
          })
          panels.forEach(function(panel) {
            panel.classList.toggle('hidden', panel.getAttribute('data-panel') !== next)
          })
          const params = new URLSearchParams(window.location.search)
          params.set('section', next)
          history[replace ? 'replaceState' : 'pushState']({}, '', window.location.pathname + '?' + params.toString())
        }

        function badge(kind, label) {
          return '<span class="status-badge ' + kind + '">' + label + '</span>'
        }

        function sessionCard(session, current) {
          const context = [session.login_app_name, session.login_workspace_slug ? ('Workspace ' + session.login_workspace_slug) : ''].filter(Boolean).join(' · ')
          return '<div class="list-item">' +
            '<div><h3>' + (session.user_agent || 'Unknown device') + '</h3><p>' +
              (session.ip || '—') + ' · ' + new Date(session.last_seen_at).toLocaleString() + (context ? (' · ' + context) : '') +
            '</p></div>' +
            (current
              ? '<span class="status-badge ok">Current</span>'
              : '<button class="button warn" data-session-delete="' + session.id + '" type="button">Revoke</button>') +
          '</div>'
        }

        function auditCard(log) {
          const meta = [log.target_type, log.target_id || '', log.ip || ''].filter(Boolean).join(' · ')
          return '<div class="audit-item">' +
            '<div class="audit-item-top"><span class="audit-action">' + log.action + '</span><span class="subtle">' + new Date(log.created_at).toLocaleString() + '</span></div>' +
            '<div class="audit-meta">' + (meta || 'No extra metadata') + '</div>' +
          '</div>'
        }

        function renderProfile() {
          if (!meState) return
          profileAvatar.src = resolveAssetUrl(meState.avatar_url)
          profileName.textContent = meState.display_name || 'No display name'
          profileEmail.textContent = meState.email || 'No primary email'
          profileStatus.textContent = 'Status: ' + (meState.status || 'active')
          displayNameInput.value = meState.display_name || ''
        }

        profileAvatar.addEventListener('error', function() {
          profileAvatar.src = new URL('/assets/rooiam-app-white.svg', apiOrigin).toString()
        })

        function renderLinkedAccounts() {
          if (!linkedState) return
          const providers = linkedState.providers || []
          accountSummary.innerHTML = [
            badge(linkedState.magic_link?.enabled ? 'ok' : 'warn', linkedState.magic_link?.enabled ? 'Magic link enabled' : 'Magic link unavailable'),
            badge(linkedState.passkeys > 0 ? 'ok' : 'warn', linkedState.passkeys > 0 ? ('Passkeys ' + linkedState.passkeys) : 'No passkeys'),
            badge(linkedState.totp_enabled ? 'ok' : 'warn', linkedState.totp_enabled ? 'TOTP enabled' : 'TOTP off'),
          ].join('')

          linkedAccountsList.innerHTML = providers.map(function(provider) {
            const isGoogle = provider.provider === 'google'
            const name = isGoogle ? 'Google' : 'Microsoft'
            const linkedLabel = provider.linked ? ('Linked' + (provider.linked_email ? (' as ' + provider.linked_email) : '')) : 'Not linked yet'
            return '<div class="list-item">' +
              '<div><h3>' + name + '</h3><p>' + linkedLabel + '</p></div>' +
              (provider.linked
                ? '<button class="button warn" data-unlink="' + provider.provider + '" type="button">Unlink</button>'
                : '<button class="button" data-link="' + provider.provider + '" type="button">Link</button>') +
              '</div>'
          }).join('')

          linkedAccountsList.querySelectorAll('[data-link]').forEach(function(button) {
            button.addEventListener('click', function() {
              const provider = button.getAttribute('data-link')
              if (!provider) return
              void startLinkProvider(provider)
            })
          })
          linkedAccountsList.querySelectorAll('[data-unlink]').forEach(function(button) {
            button.addEventListener('click', function() {
              const provider = button.getAttribute('data-unlink')
              if (!provider) return
              void unlinkProvider(provider)
            })
          })
        }

        function renderPasskeys(passkeys) {
          passkeyList.innerHTML = passkeys.map(function(passkey) {
            const lastUsed = passkey.last_used_at ? (' · Last used ' + new Date(passkey.last_used_at).toLocaleString()) : ''
            return '<div class="list-item">' +
              '<div><h3>' + passkey.name + '</h3><p>Added ' + new Date(passkey.created_at).toLocaleDateString() + lastUsed + '</p></div>' +
              '<button class="button warn" data-passkey-delete="' + passkey.id + '" type="button">Remove</button>' +
            '</div>'
          }).join('')
          passkeyEmpty.style.display = passkeys.length ? 'none' : 'block'
          passkeyList.querySelectorAll('[data-passkey-delete]').forEach(function(button) {
            button.addEventListener('click', function() {
              const id = button.getAttribute('data-passkey-delete')
              if (!id) return
              void deletePasskey(id)
            })
          })
        }

        function renderMfaStatus() {
          if (!mfaState) return
          mfaSummary.innerHTML = [
            badge(mfaState.totp_enabled ? 'ok' : 'warn', mfaState.totp_enabled ? 'TOTP enabled' : 'TOTP off'),
            badge(mfaState.backup_codes_remaining > 0 ? 'ok' : 'warn', 'Backup codes ' + mfaState.backup_codes_remaining),
          ].join('')
          disableTotpBtn.disabled = !mfaState.totp_enabled
          regenBackupsBtn.disabled = !mfaState.totp_enabled
        }

        function renderSessions() {
          const current = sessionsState.find(function(session) { return session.is_current })
          const others = sessionsState.filter(function(session) { return !session.is_current })
          currentSession.innerHTML = current ? sessionCard(current, true) : '<p class="empty">No current session found.</p>'
          otherSessions.innerHTML = others.map(function(session) { return sessionCard(session, false) }).join('')
          otherSessionsEmpty.style.display = others.length ? 'none' : 'block'
          otherSessions.querySelectorAll('[data-session-delete]').forEach(function(button) {
            button.addEventListener('click', function() {
              const id = button.getAttribute('data-session-delete')
              if (!id) return
              void revokeSession(id)
            })
          })
        }

        function renderBackupCodes(codes) {
          if (!codes || !codes.length) {
            backupCodes.classList.add('hidden')
            backupCodes.innerHTML = ''
            return
          }
          backupCodes.classList.remove('hidden')
          backupCodes.innerHTML = codes.map(function(code) {
            return '<div class="backup-code">' + code + '</div>'
          }).join('')
        }

        function renderAudit(items) {
          auditList.innerHTML = items.map(auditCard).join('')
          auditEmpty.style.display = items.length ? 'none' : 'block'
        }

        async function loadDashboardState() {
          setMessage('', '')
          const [me, linked, mfa, passkeys, sessions, audit] = await Promise.all([
            authFetch('/identity/me'),
            authFetch('/identity/me/linked-accounts'),
            authFetch('/mfa/status'),
            authFetch('/webauthn/passkeys'),
            authFetch('/identity/me/sessions'),
            authFetch('/identity/me/audit-logs?page=1&page_size=20'),
          ])
          meState = me
          linkedState = linked
          mfaState = mfa
          sessionsState = sessions
          renderProfile()
          renderLinkedAccounts()
          renderPasskeys(passkeys)
          renderMfaStatus()
          renderSessions()
          renderAudit(audit.items || [])
        }

        async function saveProfile() {
          const updated = await authFetch('/identity/me/profile', {
            method: 'PATCH',
            body: JSON.stringify({ display_name: (displayNameInput.value || '').trim() || null }),
          })
          meState = { ...meState, ...updated }
          renderProfile()
          setMessage('ok', 'Profile updated.')
        }

        async function requestEmailChange() {
          const nextEmail = (newEmailInput.value || '').trim()
          if (!nextEmail) throw new Error('Enter a new email address first.')
          const result = await authFetch('/identity/me/email-change/request', {
            method: 'POST',
            body: JSON.stringify({ new_email: nextEmail }),
          })
          setMessage('ok', result.message || 'Email change link sent.')
        }

        async function startLinkProvider(provider) {
          setMessage('', '')
          const result = await authFetch('/identity/me/linked-accounts/' + provider + '/start', {
            method: 'POST',
            body: JSON.stringify({ redirect_uri: returnUrl }),
          })
          window.location.href = result.authorization_url
        }

        async function unlinkProvider(provider) {
          await authFetch('/identity/me/linked-accounts/' + provider, { method: 'DELETE' })
          setMessage('ok', (provider === 'google' ? 'Google' : 'Microsoft') + ' unlinked.')
          await loadDashboardState()
        }

        async function registerPasskey() {
          setMessage('', '')
          if (!(window.PublicKeyCredential && navigator.credentials)) {
            throw new Error('This browser does not support passkeys.')
          }
          const parseCreationOptionsFromJSON = window.PublicKeyCredential.parseCreationOptionsFromJSON
          if (!parseCreationOptionsFromJSON) {
            throw new Error('This browser is missing the JSON WebAuthn helpers needed for registration.')
          }
          const start = await authFetch('/webauthn/register/start', {
            method: 'POST',
            body: JSON.stringify({}),
          })
          const publicKey = parseCreationOptionsFromJSON(start.creation_options.publicKey)
          const credential = await navigator.credentials.create({ publicKey })
          if (!credential) throw new Error('Passkey registration was cancelled.')
          await authFetch('/webauthn/register/finish', {
            method: 'POST',
            body: JSON.stringify({
              challenge_id: start.challenge_id,
              name: (passkeyNameInput.value || 'My Device').trim() || 'My Device',
              credential: credential.toJSON(),
            }),
          })
          setMessage('ok', 'Passkey added.')
          await loadDashboardState()
        }

        async function deletePasskey(id) {
          await authFetch('/webauthn/passkeys/' + encodeURIComponent(id), { method: 'DELETE' })
          setMessage('ok', 'Passkey removed.')
          await loadDashboardState()
        }

        async function startTotpEnrollment() {
          setMessage('', '')
          const result = await authFetch('/mfa/totp/start', {
            method: 'POST',
            body: JSON.stringify({}),
          })
          totpChallengeId = result.challenge_id
          totpSecret.textContent = result.secret
          totpUri.textContent = result.otpauth_uri
          totpSetup.classList.remove('hidden')
          renderBackupCodes([])
        }

        async function finishTotpEnrollment() {
          if (!totpChallengeId) throw new Error('Start TOTP setup first.')
          const result = await authFetch('/mfa/totp/finish', {
            method: 'POST',
            body: JSON.stringify({ challenge_id: totpChallengeId, code: (totpCodeInput.value || '').trim() }),
          })
          totpChallengeId = ''
          totpCodeInput.value = ''
          totpSetup.classList.add('hidden')
          renderBackupCodes(result.backup_codes || [])
          setMessage('ok', 'TOTP MFA enabled. Store the new backup codes safely.')
          await loadDashboardState()
        }

        async function disableTotp() {
          await authFetch('/mfa/totp', { method: 'DELETE' })
          totpChallengeId = ''
          totpCodeInput.value = ''
          totpSetup.classList.add('hidden')
          renderBackupCodes([])
          setMessage('ok', 'TOTP MFA disabled.')
          await loadDashboardState()
        }

        async function regenerateBackupCodes() {
          const result = await authFetch('/mfa/recovery-codes/regenerate', {
            method: 'POST',
            body: JSON.stringify({}),
          })
          renderBackupCodes(result.codes || [])
          setMessage('ok', 'New backup codes generated.')
          await loadDashboardState()
        }

        async function revokeSession(id) {
          const result = await authFetch('/identity/me/sessions/' + encodeURIComponent(id), { method: 'DELETE' })
          setMessage('ok', result.message || 'Session revoked.')
          await loadDashboardState()
        }

        async function revokeOtherSessions() {
          const result = await authFetch('/identity/me/sessions/revoke-all', { method: 'POST' })
          setMessage('ok', result.revoked_count > 0 ? ('Revoked ' + result.revoked_count + ' other session' + (result.revoked_count === 1 ? '' : 's') + '.') : 'No other sessions were active.')
          await loadDashboardState()
        }

        async function refreshAudit() {
          const result = await authFetch('/identity/me/audit-logs?page=1&page_size=20')
          renderAudit(result.items || [])
          setMessage('ok', 'Audit logs refreshed.')
        }

        navButtons.forEach(function(button) {
          button.addEventListener('click', function() {
            const next = button.getAttribute('data-section') || 'profile'
            selectSection(next, false)
          })
        })
        saveProfileBtn.addEventListener('click', function() { void saveProfile().catch(function(error) { setMessage('error', error.message) }) })
        requestEmailChangeBtn.addEventListener('click', function() { void requestEmailChange().catch(function(error) { setMessage('error', error.message) }) })
        linkGoogleBtn.addEventListener('click', function() { void startLinkProvider('google').catch(function(error) { setMessage('error', error.message) }) })
        linkMicrosoftBtn.addEventListener('click', function() { void startLinkProvider('microsoft').catch(function(error) { setMessage('error', error.message) }) })
        addPasskeyBtn.addEventListener('click', function() { void registerPasskey().catch(function(error) { setMessage('error', error.message) }) })
        startTotpBtn.addEventListener('click', function() { void startTotpEnrollment().catch(function(error) { setMessage('error', error.message) }) })
        finishTotpBtn.addEventListener('click', function() { void finishTotpEnrollment().catch(function(error) { setMessage('error', error.message) }) })
        disableTotpBtn.addEventListener('click', function() { void disableTotp().catch(function(error) { setMessage('error', error.message) }) })
        regenBackupsBtn.addEventListener('click', function() { void regenerateBackupCodes().catch(function(error) { setMessage('error', error.message) }) })
        revokeOthersBtn.addEventListener('click', function() { void revokeOtherSessions().catch(function(error) { setMessage('error', error.message) }) })
        refreshAuditBtn.addEventListener('click', function() { void refreshAudit().catch(function(error) { setMessage('error', error.message) }) })

        const params = new URLSearchParams(window.location.search)
        const initialSection = params.get('section') || 'profile'
        const linkProvider = params.get('link_provider')
        const linkResult = params.get('link_result')
        const linkMessage = params.get('link_message')
        if (linkProvider && linkResult) {
          setMessage(linkResult === 'success' ? 'ok' : 'error', linkMessage || (linkResult === 'success' ? (linkProvider + ' linked successfully.') : ('Could not link ' + linkProvider + '.')))
          params.delete('link_provider')
          params.delete('link_result')
          params.delete('link_message')
          history.replaceState({}, '', window.location.pathname + (params.toString() ? ('?' + params.toString()) : ''))
        }

        selectSection(initialSection, true)

        loadDashboardState().catch(function(error) {
          setMessage('warn', error.message + ' Make sure localhost:5181 is allowed and you are signed in through the widget first.')
        })
      })();
    <\/script>
  `
  res.type('html').send(layout({ title: 'Example 2: Real Integration Dashboard', body }))
})

app.get('/callback', async (req, res) => {
  // Example 2 keeps the callback handler explicit so a developer can see the
  // handoff point between Rooiam and the downstream app.
  const config = readExampleConfig()
  const error = typeof req.query.error === 'string' ? req.query.error : ''
  const errorDescription = typeof req.query.error_description === 'string' ? req.query.error_description : ''

  if (!error) {
    const next = new URL(`${req.protocol}://${req.get('host')}/dashboard`)
    next.searchParams.set('section', 'profile')
    next.searchParams.set('login', 'success')
    return res.redirect(302, next.toString())
  }

  const body = `
    <section class="grid">
      <div class="card">
        <h2>Callback Received</h2>
        <p>This example app owns the registered callback route directly. Rooiam redirected back here after completing the hosted login flow for the selected app.</p>
        ${error ? `
          <div class="hint warn">
            <h3>Authorization error</h3>
            <p>${errorDescription || error}</p>
          </div>
        ` : `
          <div class="hint ok">
            <h3>Callback captured</h3>
            <p>The hosted widget sent the user back to the app callback registered in Rooiam. This example keeps the iframe contract strict and uses app identity only, not callback-style URL parameters.</p>
          </div>
        `}
        <div class="meta">
          <div class="meta-item"><div class="k">App</div><div class="v">${config.app_name || 'Rooiam Example'}</div></div>
          <div class="meta-item"><div class="k">Client ID</div><div class="v">${config.client_id || '—'}</div></div>
          <div class="meta-item"><div class="k">Callback Path</div><div class="v">${req.originalUrl}</div></div>
          <div class="meta-item"><div class="k">Flow Contract</div><div class="v">widget identity only</div></div>
        </div>
        <div class="actions">
          <a class="btn" href="/">Back to login</a>
        </div>
      </div>
    </section>
  `
  res.type('html').send(layout({ title: 'Example 2: Real Integration Callback', body }))
})

app.listen(port, () => {
  console.log(`example-2-account running on http://localhost:${port}`)
})
