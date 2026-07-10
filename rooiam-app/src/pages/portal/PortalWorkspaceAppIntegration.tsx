import React from 'react'
import { KeyRound, Server, MonitorSmartphone, ListChecks, ArrowRight, ExternalLink, FlaskConical, Play, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Maximize2, Minimize2 } from 'lucide-react'
import PortalCodeBlockField from '../../components/portal/PortalCodeBlockField'
import PortalCodeSnippet, { type SnippetLanguage } from '../../components/portal/PortalCodeSnippet'
import PortalContentCard from '../../components/portal/PortalContentCard'
import PortalInlineMessage from '../../components/portal/PortalInlineMessage'
import type { OrgClient } from '../../lib/portal-types'

type Props = {
    app: OrgClient
    workspaceId: string
    workspaceSlug: string
    apiOrigin: string
    apiBase: string
    onOpenWidget: () => void
}

/**
 * Copy-paste integration guide, scoped to ONE app. Everything a client needs
 * after registering the app and configuring the widget: resolved config values,
 * the login flow, client-side embed + OIDC (SDK) code with a language switch,
 * and the server-side token verification. Values are read live from the app
 * registration, so nothing here can drift from the real client_id / callback.
 */
export default function PortalWorkspaceAppIntegration({
    app,
    workspaceId,
    workspaceSlug,
    apiOrigin,
    apiBase,
    onOpenWidget,
}: Props) {
    const clientId = app.client.client_id
    const isConfidential = app.client.app_type === 'web'
    const redirectUri = app.redirect_uris[0] || 'https://your-app.example.com/callback'
    const scope = 'openid profile email'

    // Endpoints (discovery-equivalent; the SDK also exposes oidc.discovery()).
    const authorizeEndpoint = `${apiBase}/oidc/authorize`
    const tokenEndpoint = `${apiBase}/oidc/token`
    const userinfoEndpoint = `${apiBase}/oidc/userinfo`
    const introspectEndpoint = `${apiBase}/oidc/introspect`
    const widgetUrl = `${apiOrigin}/login-widget?workspace_id=${workspaceId}&workspace=${encodeURIComponent(workspaceSlug)}&client_id=${clientId}`
    // Preview variant — the ONLY widget URL this portal is allowed to load.
    // The real widgetUrl enforces the embed-origin allowlist against the
    // *requesting* site, so calling it from here (app.rooiam.com) always 403s
    // even when the config is correct. preview=1 uses the platform's preview
    // origins instead, so it validates that the workspace + branding resolve.
    const widgetPreviewUrl = `${apiOrigin}/login-widget?preview=1&workspace_id=${workspaceId}&client_id=${clientId}`

    const notReady = app.redirect_uris.length === 0 || app.allowed_embed_origins.length === 0
    const paused = app.client.status !== 'active'

    // ---- client-side snippets (language switch) ----
    const [clientLang, setClientLang] = React.useState<'javascript' | 'typescript' | 'json'>('javascript')

    const jsClient = `// npm install @rooiam/sdk-browser
import { RooiamBrowser, createPkcePair } from '@rooiam/sdk-browser'

const rooiam = new RooiamBrowser({ apiBase: '${apiBase}' })
const CLIENT_ID = '${clientId}'
const REDIRECT_URI = '${redirectUri}'

// 1) start login — redirect to RooIAM with PKCE
export async function startLogin() {
  const { verifier, challenge } = await createPkcePair()
  const state = crypto.randomUUID()
  sessionStorage.setItem('rooiam.pkce', JSON.stringify({ verifier, state }))
  window.location.href = rooiam.oidc.authorizeUrl({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    codeChallenge: challenge,
    state,
  })
}

// 2) on ${new URL(redirectUri).pathname} — exchange the code for tokens
export async function handleCallback() {
  const params = new URLSearchParams(window.location.search)
  const saved = JSON.parse(sessionStorage.getItem('rooiam.pkce') || '{}')
  if (params.get('state') !== saved.state) throw new Error('state mismatch')

  const tokens = await rooiam.oidc.exchangeCode({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    code: params.get('code'),
    codeVerifier: saved.verifier,
  })
  // send tokens.access_token to YOUR backend, mint your own session
  return rooiam.oidc.userinfo(tokens.access_token) // { sub, email, name }
}`

    const tsClient = `// npm install @rooiam/sdk-browser
import { RooiamBrowser, createPkcePair } from '@rooiam/sdk-browser'

const rooiam = new RooiamBrowser({ apiBase: '${apiBase}' })
const CLIENT_ID = '${clientId}'
const REDIRECT_URI = '${redirectUri}'

// 1) start login — redirect to RooIAM with PKCE
export async function startLogin(): Promise<void> {
  const { verifier, challenge } = await createPkcePair()
  const state = crypto.randomUUID()
  sessionStorage.setItem('rooiam.pkce', JSON.stringify({ verifier, state }))
  window.location.href = rooiam.oidc.authorizeUrl({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    codeChallenge: challenge,
    state,
  })
}

// 2) on ${new URL(redirectUri).pathname} — exchange the code for tokens
export async function handleCallback() {
  const params = new URLSearchParams(window.location.search)
  const saved = JSON.parse(sessionStorage.getItem('rooiam.pkce') ?? '{}') as {
    verifier?: string
    state?: string
  }
  const code = params.get('code')
  if (!code || params.get('state') !== saved.state) throw new Error('bad callback')

  const tokens = await rooiam.oidc.exchangeCode({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    code,
    codeVerifier: saved.verifier!,
  })
  // send tokens.access_token to YOUR backend, mint your own session
  return rooiam.oidc.userinfo(tokens.access_token) // { sub, email, name }
}`

    const jsonClient = JSON.stringify(
        {
            apiBase,
            issuer: apiOrigin,
            client_id: clientId,
            app_type: app.client.app_type,
            redirect_uri: redirectUri,
            scopes: scope.split(' '),
            widget_base_url: `${apiOrigin}/login-widget`,
            widget_url: widgetUrl,
            workspace_id: workspaceId,
            workspace_slug: workspaceSlug,
            endpoints: {
                authorize: authorizeEndpoint,
                token: tokenEndpoint,
                userinfo: userinfoEndpoint,
                introspect: introspectEndpoint,
            },
        },
        null,
        2,
    )

    const clientSnippet = clientLang === 'json' ? jsonClient : clientLang === 'typescript' ? tsClient : jsClient
    const clientSnippetLang: SnippetLanguage = clientLang

    // ---- server-side snippets (language switch) ----
    const [serverLang, setServerLang] = React.useState<'javascript' | 'bash'>('javascript')

    const jsServer = `const CLIENT_ID = '${clientId}'${isConfidential ? "\nconst CLIENT_SECRET = process.env.ROOIAM_CLIENT_SECRET // web app: server-side only" : ''}

export async function resolveUser(accessToken) {
  // 1) is the token active?
  const introspect = await fetch('${introspectEndpoint}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token: accessToken,
      client_id: CLIENT_ID,${isConfidential ? '\n      client_secret: CLIENT_SECRET,' : ''}
    }),
  }).then(r => r.json())
  if (!introspect.active) throw new Error('token is not active')

  // 2) identity claims (introspection has no email/name)
  return fetch('${userinfoEndpoint}', {
    headers: { Authorization: 'Bearer ' + accessToken },
  }).then(r => r.json()) // { sub, email, name } — upsert by sub
}`

    const curlServer = `# is the token active?
curl -X POST '${introspectEndpoint}' \\
  -d 'token=<ACCESS_TOKEN>' \\
  -d 'client_id=${clientId}'${isConfidential ? " \\\n  -d 'client_secret=<CLIENT_SECRET>'" : ''}

# identity claims (email, name)
curl '${userinfoEndpoint}' \\
  -H 'Authorization: Bearer <ACCESS_TOKEN>'`

    const serverSnippet = serverLang === 'bash' ? curlServer : jsServer
    const serverSnippetLang: SnippetLanguage = serverLang === 'bash' ? 'bash' : 'javascript'

    const sdkFns: Array<{ fn: string; what: string }> = [
        { fn: 'new RooiamBrowser({ apiBase })', what: 'Create the client (apiBase includes /v1).' },
        { fn: 'createPkcePair()', what: 'Generate the PKCE verifier + S256 challenge.' },
        { fn: 'rooiam.oidc.authorizeUrl(input)', what: 'Build the /oidc/authorize redirect URL.' },
        { fn: 'rooiam.oidc.exchangeCode(input)', what: 'Swap the code + verifier for tokens.' },
        { fn: 'rooiam.oidc.userinfo(accessToken)', what: 'Read identity claims (sub, email, name).' },
        { fn: 'rooiam.oidc.discovery()', what: 'Fetch issuer metadata + endpoint URLs.' },
        { fn: 'rooiam.oidc.endSessionUrl(input)', what: 'Build the RP-initiated logout URL.' },
    ]

    return (
        <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-violet-100 bg-violet-50/40 px-4 py-3">
                    <p className="text-xs font-black text-gray-900">① Client (browser)</p>
                    <p className="mt-1 text-[11px] font-semibold leading-5 text-muted-foreground">
                        Widget + OIDC PKCE → access token. Uses <span className="font-mono">@rooiam/sdk-browser</span>, no secrets.
                    </p>
                </div>
                <div className="rounded-2xl border border-violet-100 bg-violet-50/40 px-4 py-3">
                    <p className="text-xs font-black text-gray-900">② Server (your backend)</p>
                    <p className="mt-1 text-[11px] font-semibold leading-5 text-muted-foreground">
                        Verify the token, read <span className="font-mono">{'{ sub, email, name }'}</span>, mint your own session.
                    </p>
                </div>
            </div>

            {paused ? (
                <PortalInlineMessage tone="warning">
                    This app is paused — sign-in is disabled for end users until you resume it in the Overview tab.
                </PortalInlineMessage>
            ) : null}
            {notReady ? (
                <PortalInlineMessage tone="warning">
                    Add at least one redirect URI and one allowed embed origin (Overview tab) — the snippets below use
                    placeholder values until then.
                </PortalInlineMessage>
            ) : null}

            {/* ---- resolved config values ---- */}
            <PortalContentCard
                title="Configuration values"
                subtitle="Read live from this app's registration — all safe to ship to the browser."
                icon={KeyRound}
            >
                <div className="grid gap-3 lg:grid-cols-2">
                    <PortalCodeBlockField label="Workspace ID" value={workspaceId} copyable />
                    <PortalCodeBlockField label="Workspace slug" value={workspaceSlug} copyable />
                    <PortalCodeBlockField label="Client ID" value={clientId} copyable />
                    <PortalCodeBlockField label="App type" value={app.client.app_type} />
                    <PortalCodeBlockField label="Redirect URI" value={redirectUri} copyable />
                    <PortalCodeBlockField label="Scopes" value={scope} copyable />
                    <PortalCodeBlockField label="API base (SDK)" value={apiBase} copyable />
                    <PortalCodeBlockField label="Issuer" value={apiOrigin} copyable />
                </div>
                <div className="mt-3">
                    <PortalCodeBlockField label="Widget URL (embed as iframe)" value={widgetUrl} copyable tone="sky" />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-muted-foreground">Widget branding &amp; embed snippets:</span>
                    <button
                        type="button"
                        onClick={onOpenWidget}
                        className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-black text-violet-700 transition hover:bg-violet-50"
                    >
                        Login Widget <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                </div>
            </PortalContentCard>

            {/* ---- the flow ---- */}
            <PortalContentCard
                title="How the login flow works"
                subtitle="Widget authenticates the user; your app finishes an OIDC Authorization Code + PKCE exchange."
                icon={MonitorSmartphone}
            >
                <FlowSteps
                    apiOrigin={apiOrigin}
                    apiBase={apiBase}
                    workspaceId={workspaceId}
                    clientId={clientId}
                    redirectUri={redirectUri}
                    tokenEndpoint={tokenEndpoint}
                    userinfoEndpoint={userinfoEndpoint}
                    introspectEndpoint={introspectEndpoint}
                    widgetUrl={widgetUrl}
                    isConfidential={isConfidential}
                />
            </PortalContentCard>

            {/* ---- client setup ---- */}
            <PortalContentCard
                title="Client setup (browser)"
                subtitle="Copy this into your frontend. Pick the format you want."
                icon={MonitorSmartphone}
            >
                <LanguageTabs
                    options={[
                        ['javascript', 'JavaScript'],
                        ['typescript', 'TypeScript'],
                        ['json', 'Config JSON'],
                    ]}
                    value={clientLang}
                    onChange={value => setClientLang(value as typeof clientLang)}
                />
                <div className="mt-3">
                    <PortalCodeSnippet code={clientSnippet} language={clientSnippetLang} />
                </div>
            </PortalContentCard>

            {/* ---- server setup ---- */}
            <PortalContentCard
                title="Server setup (backend)"
                subtitle="Verify the access token and read identity claims. RooIAM proves identity; your app owns product roles + data."
                icon={Server}
            >
                {isConfidential ? (
                    <PortalInlineMessage tone="warning">
                        Web (confidential) app — client secret is server-side only. Rotate in the Overview Danger Zone.
                    </PortalInlineMessage>
                ) : null}
                <LanguageTabs
                    options={[
                        ['javascript', 'Node.js'],
                        ['bash', 'cURL'],
                    ]}
                    value={serverLang}
                    onChange={value => setServerLang(value as typeof serverLang)}
                />
                <div className="mt-3">
                    <PortalCodeSnippet code={serverSnippet} language={serverSnippetLang} />
                </div>
            </PortalContentCard>

            {/* ---- live test ---- */}
            <PortalContentCard
                title="Live test"
                subtitle="Real requests from this page to your RooIAM API — status and response shown as-is."
                icon={FlaskConical}
            >
                <div className="space-y-3">
                    <TryEndpoint
                        method="GET"
                        url={`${apiOrigin}/.well-known/openid-configuration`}
                        title="OIDC discovery"
                        proves="Issuer resolves and returns every endpoint URL."
                        run={() => fetch(`${apiOrigin}/.well-known/openid-configuration`)}
                    />
                    <TryEndpoint
                        method="GET"
                        url={widgetPreviewUrl}
                        title="Login widget (preview)"
                        proves="200 = workspace + branding resolve and the widget renders."
                        run={() => fetch(widgetPreviewUrl, { credentials: 'include' })}
                    />
                    <p className="text-[11px] font-semibold leading-5 text-muted-foreground">
                        The real embed URL only loads on{' '}
                        <span className="font-mono font-black">
                            {app.allowed_embed_origins.length > 0 ? app.allowed_embed_origins.join(', ') : '(no origins yet — Overview tab)'}
                        </span>{' '}
                        — from this portal it returns 403 by design. Token verification (introspect / userinfo) is a
                        backend step: copy it from <span className="font-black text-gray-900">Server setup</span> above.
                    </p>
                </div>
            </PortalContentCard>

            {/* ---- SDK reference ---- */}
            <PortalContentCard
                title="SDK functions used"
                subtitle="@rooiam/sdk-browser — the exact calls in the snippets above."
                icon={ListChecks}
            >
                <div className="space-y-2">
                    {sdkFns.map(({ fn, what }) => (
                        <div key={fn} className="flex flex-col gap-1 rounded-2xl border border-border bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <code className="text-xs font-mono font-bold text-violet-700">{fn}</code>
                            <span className="text-xs font-semibold text-muted-foreground">{what}</span>
                        </div>
                    ))}
                </div>
                <a
                    href="https://www.npmjs.com/package/@rooiam/sdk-browser"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-black text-violet-700 hover:underline"
                >
                    @rooiam/sdk-browser on npm <ExternalLink className="h-3.5 w-3.5" />
                </a>
            </PortalContentCard>
        </div>
    )
}

/* ------------------------------------------------------------------ */
/*  Collapsible login-flow step cards                                 */
/* ------------------------------------------------------------------ */

type FlowDetailLine = { kind: 'send'; label: string; method?: string; code: string } | { kind: 'recv'; label: string; status?: string; code: string } | { kind: 'sdk'; label: string; code: string } | { kind: 'note'; label: string; code: string; tone?: 'violet' | 'amber' | 'sky' | 'emerald' }

type FlowStep = {
    title: string
    summary: string
    details: FlowDetailLine[]
}

function FlowSteps(props: {
    apiOrigin: string
    apiBase: string
    workspaceId: string
    clientId: string
    redirectUri: string
    tokenEndpoint: string
    userinfoEndpoint: string
    introspectEndpoint: string
    widgetUrl: string
    isConfidential: boolean
}) {
    const { apiBase, apiOrigin, workspaceId, clientId, redirectUri, tokenEndpoint, userinfoEndpoint, introspectEndpoint, widgetUrl, isConfidential } = props
    const cbPath = (() => { try { return new URL(redirectUri).pathname } catch { return redirectUri } })()

    const [expandedAll, setExpandedAll] = React.useState(false)

    const steps: FlowStep[] = React.useMemo(() => [
        {
            title: 'Embed the login widget',
            summary: `Load the widget in an iframe. RooIAM checks your embed origin and renders your branded sign-in page.`,
            details: [
                { kind: 'send', method: 'GET', label: 'Iframe src', code: `${apiOrigin}/login-widget?workspace_id=${workspaceId}&client_id=${clientId}` },
                { kind: 'recv', status: '200', label: 'HTML page', code: `<iframe> with login form + CSP frame-ancestors set to your origin. A widget_login_context token (15-min Redis TTL) binds the redirect URI to this session.` },
                { kind: 'sdk', label: '', code: `<iframe src="${widgetUrl}" />` },
            ],
        },
        {
            title: 'User signs in',
            summary: 'User picks magic link, passkey, or Google / Microsoft. The server sets an HTTP‑only session cookie.',
            details: [
                { kind: 'send', method: 'POST', label: 'Magic link (example)', code: `${apiBase}/auth/magic-link/start` },
                { kind: 'send', method: '', label: 'JSON body', code: '{ email, widget_login_context, widget_embed_origin }' },
                { kind: 'recv', status: '200', label: 'Email sent', code: 'User clicks link → GET /v1/auth/magic-link/verify?token=... → 302 + Set-Cookie: rooiam_session=...' },
                { kind: 'sdk', label: 'Not your code', code: 'rooiam.startLogin(...) — called by the widget internally' },
                { kind: 'note', tone: 'amber', label: 'Also supported', code: 'Passkeys → /webauthn/login + OAuth → /v1/oauth/login?provider=google' },
            ],
        },
        {
            title: 'Redirect to authorize',
            summary: 'After login the widget sends the browser to /oidc/authorize with a PKCE challenge. If already signed in, this step is silent (SSO).',
            details: [
                { kind: 'send', method: 'GET', label: 'Authorize URL', code: `${apiBase}/oidc/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&code_challenge=<challenge>&code_challenge_method=S256&scope=openid+profile+email&state=<state>` },
                { kind: 'recv', status: '302', label: 'Redirect to your app', code: `Location: ${redirectUri}?code=<code>&state=<state>` },
                { kind: 'sdk', label: 'Build the URL', code: 'createPkcePair() → { verifier, challenge }\nrooiam.oidc.authorizeUrl({ clientId, redirectUri, codeChallenge, state }) → string' },
                { kind: 'note', tone: 'violet', label: 'Silent SSO', code: 'If a valid rooiam_session cookie already exists the code is issued immediately — no widget shown.' },
            ],
        },
        {
            title: 'Callback with code',
            summary: `The browser lands on ${cbPath}?code=...&state=...  Your app reads the URL params and checks the state matches.`,
            details: [
                { kind: 'send', label: 'Browser navigates to', code: `${redirectUri}?code=<code>&state=<state>` },
                { kind: 'recv', label: 'Your callback page renders', code: 'Read window.location.search, extract code + state params' },
                { kind: 'sdk', label: 'Validate PKCE state', code: 'sessionStorage.getItem("rooiam.pkce") → check url.state === saved.state' },
            ],
        },
        {
            title: 'Exchange the code',
            summary: 'POST the code + PKCE verifier to the token endpoint. Returns access_token, optional refresh_token & id_token.',
            details: [
                { kind: 'send', method: 'POST', label: 'Token endpoint', code: tokenEndpoint },
                { kind: 'send', method: '', label: 'Form body', code: `grant_type=authorization_code&code=<code>&redirect_uri=${encodeURIComponent(redirectUri)}&client_id=${clientId}&code_verifier=<verifier>${isConfidential ? '&client_secret=<secret>' : ''}` },
                { kind: 'recv', status: '200', label: 'Token response', code: '{ access_token: "eyJ...", token_type: "Bearer", expires_in: 3600, refresh_token: "rt_...", id_token: "eyJ..." }' },
                { kind: 'sdk', label: 'Exchange function', code: 'rooiam.oidc.exchangeCode({ code, redirectUri, clientId, codeVerifier })\n→ { access_token, token_type, expires_in, refresh_token?, id_token? }' },
                { kind: 'note', tone: 'sky', label: 'Refresh rotation', code: 'Each refresh issues a new pair & revokes the old one. Reusing a revoked token revokes the whole family.' },
            ],
        },
        {
            title: 'Resolve identity',
            summary: 'Read user claims from the token. Send it to your backend for verification, then mint your own session keyed on sub.',
            details: [
                { kind: 'sdk', label: 'Browser: userinfo', code: 'rooiam.oidc.userinfo(accessToken) → { sub, email, email_verified, name, picture }' },
                { kind: 'recv', status: '200', label: 'Userinfo response', code: '{ sub: "usr_abc123", email: "alice@example.com", email_verified: true, name: "Alice" }' },
                { kind: 'sdk', label: 'Backend: introspect', code: `rooiam.oidc.introspect({ token, clientId })\n→ { active: true, sub, scope, exp, iss, ... }` },
                { kind: 'recv', label: 'Introspect response', code: '{ active: true, sub: "usr_abc123", scope: "openid profile email", exp: 1718400000 }' },
                { kind: 'note', tone: 'emerald', label: 'Done', code: 'Use sub as the stable user ID. Create your own session. RooIAM owns identity — your app owns everything else.' },
            ],
        },
    ], [apiBase, apiOrigin, workspaceId, clientId, redirectUri, tokenEndpoint, userinfoEndpoint, introspectEndpoint, widgetUrl, isConfidential, cbPath])

    return (
        <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700"><span className="text-[10px]">→</span> client sends</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-sky-700"><span className="text-[10px]">←</span> server returns</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-violet-700"><span className="text-[10px]">fn</span> SDK call</span>
                </div>
                <button
                    type="button"
                    onClick={() => setExpandedAll(v => !v)}
                    className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-3 py-1 text-[11px] font-bold text-muted-foreground transition hover:text-foreground hover:border-violet-200"
                >
                    {expandedAll ? <><Minimize2 className="h-3 w-3" /> Collapse all</> : <><Maximize2 className="h-3 w-3" /> Expand all</>}
                </button>
            </div>
            <ol className="space-y-2.5">
                {steps.map((step, i) => (
                    <FlowStepCard key={i} index={i} step={step} forceExpand={expandedAll} />
                ))}
            </ol>
        </>
    )
}

function FlowStepCard({ index, step, forceExpand }: { index: number; step: FlowStep; forceExpand: boolean }) {
    const [open, setOpen] = React.useState(false)
    const expanded = forceExpand ? true : open

    return (
        <li className="group rounded-2xl border border-border bg-white transition hover:border-violet-200">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left"
            >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-black text-violet-700">
                    {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-black text-gray-900">{step.title}</p>
                        {expanded ? (
                            <ChevronUp className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                        )}
                    </div>
                    <p className="mt-0.5 text-xs font-semibold leading-5 text-muted-foreground">{step.summary}</p>
                </div>
            </button>
            {expanded && (
                <div className="border-t border-border/50 px-4 pb-3.5 pt-3">
                    <div className="space-y-2">
                        {step.details.map((d, j) => {
                            if (d.kind === 'note') {
                                const toneMap: Record<string, string> = {
                                    violet: 'border-violet-100 bg-violet-50/40 text-violet-800',
                                    amber: 'border-amber-100 bg-amber-50/40 text-amber-800',
                                    sky: 'border-sky-100 bg-sky-50/40 text-sky-800',
                                    emerald: 'border-emerald-100 bg-emerald-50/40 text-emerald-800',
                                }
                                return (
                                    <div key={j} className={`rounded-lg border px-2.5 py-2 text-[11px] font-semibold ${toneMap[d.tone || 'violet']}`}>
                                        <span className="font-black">{d.label}</span>{d.label ? ': ' : ''}{d.code}
                                    </div>
                                )
                            }

                            const icon = d.kind === 'send'
                                ? <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-emerald-100 text-[10px] font-black text-emerald-700">→</span>
                                : d.kind === 'recv'
                                ? <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-sky-100 text-[10px] font-black text-sky-700">←</span>
                                : <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-violet-100 text-[10px] font-black text-violet-700">fn</span>

                            const prefix = d.kind === 'send' && d.method
                                ? <><span className="font-black text-gray-700">{d.method}</span>{' '}</>
                                : d.kind === 'recv' && d.status
                                ? <><span className="font-black text-gray-700 mr-1">{d.status}</span></>
                                : null

                            return (
                                <div key={j} className="flex items-start gap-2 text-[11px]">
                                    {icon}
                                    <span className="font-semibold text-muted-foreground min-w-0 break-words">
                                        {d.label ? <><span className="font-bold text-gray-600">{d.label}</span><br /></> : null}
                                        {prefix}
                                        {d.code.includes('\n') ? (
                                            d.code.split('\n').map((line, li) => (
                                                <React.Fragment key={li}>
                                                    {li > 0 && <br />}
                                                    <code className="inline-block rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">{line}</code>
                                                </React.Fragment>
                                            ))
                                        ) : (
                                            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] break-all">{d.code}</code>
                                        )}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </li>
    )
}

type TryState =
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'done'; status: number; ok: boolean; ms: number; body: string }
    | { kind: 'error'; message: string }

/**
 * A one-click live request. Runs the real fetch (caller builds it), then shows
 * the HTTP status, latency, and pretty-printed response body — so a client can
 * see exactly what the server returns before writing any code.
 */
function TryEndpoint({
    method,
    url,
    title,
    proves,
    run,
    disabled = false,
    disabledHint,
}: {
    method: string
    url: string
    title: string
    proves: string
    run: () => Promise<Response>
    disabled?: boolean
    disabledHint?: string
}) {
    const [state, setState] = React.useState<TryState>({ kind: 'idle' })

    const send = async () => {
        setState({ kind: 'loading' })
        const started = performance.now()
        try {
            const res = await run()
            const text = await res.text()
            let body = text
            try {
                body = JSON.stringify(JSON.parse(text), null, 2)
            } catch {
                // non-JSON (e.g. the widget returns HTML) — show a short excerpt
                body = text.length > 600 ? `${text.slice(0, 600)}…` : text
            }
            setState({ kind: 'done', status: res.status, ok: res.ok, ms: Math.round(performance.now() - started), body })
        } catch (error) {
            setState({
                kind: 'error',
                message: (error as Error)?.message || 'Request failed (network or CORS).',
            })
        }
    }

    return (
        <div className="rounded-2xl border border-border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                            {method}
                        </span>
                        <p className="text-sm font-black text-gray-900">{title}</p>
                    </div>
                    <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{url}</p>
                </div>
                <button
                    type="button"
                    onClick={send}
                    disabled={disabled || state.kind === 'loading'}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-xs font-black text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {state.kind === 'loading' ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending…</>
                    ) : (
                        <><Play className="h-3.5 w-3.5" /> Send request</>
                    )}
                </button>
            </div>
            <p className="mt-2 text-xs font-semibold text-muted-foreground">{proves}</p>
            {disabled && disabledHint ? (
                <p className="mt-1 text-[11px] font-bold text-amber-600">{disabledHint}</p>
            ) : null}

            {state.kind === 'error' ? (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                    <p className="text-xs font-bold text-rose-800">{state.message}</p>
                </div>
            ) : null}

            {state.kind === 'done' ? (
                <div className="mt-3 overflow-hidden rounded-xl border border-border">
                    <div className={`flex items-center gap-2 px-3 py-2 ${state.ok ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                        {state.ok ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                            <XCircle className="h-4 w-4 text-amber-600" />
                        )}
                        <span className={`text-xs font-black ${state.ok ? 'text-emerald-800' : 'text-amber-800'}`}>
                            HTTP {state.status}
                        </span>
                        <span className="text-[11px] font-bold text-muted-foreground">· {state.ms} ms</span>
                    </div>
                    <pre className="max-h-72 overflow-auto bg-[#fffdfd] px-3 py-2 text-[11px] font-mono leading-5 text-slate-700">
                        {state.body || '(empty response body)'}
                    </pre>
                </div>
            ) : null}
        </div>
    )
}

function LanguageTabs({
    options,
    value,
    onChange,
}: {
    options: Array<[string, string]>
    value: string
    onChange: (value: string) => void
}) {
    return (
        <div className="inline-flex rounded-full border border-border bg-muted/40 p-1">
            {options.map(([id, label]) => (
                <button
                    key={id}
                    type="button"
                    onClick={() => onChange(id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                        value === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
                    }`}
                >
                    {label}
                </button>
            ))}
        </div>
    )
}
