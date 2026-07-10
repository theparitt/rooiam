import React from 'react'
import { KeyRound, Server, MonitorSmartphone, ListChecks, ArrowRight, ExternalLink, AlertTriangle } from 'lucide-react'
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

    const notReady = app.redirect_uris.length === 0 || app.allowed_embed_origins.length === 0
    const paused = app.client.status !== 'active'

    // ---- client-side snippets (language switch) ----
    const [clientLang, setClientLang] = React.useState<'javascript' | 'typescript' | 'json'>('javascript')

    const jsClient = `// 1) Install the browser SDK
//    npm install @rooiam/sdk-browser
import { RooiamBrowser, createPkcePair } from '@rooiam/sdk-browser'

const rooiam = new RooiamBrowser({ apiBase: '${apiBase}' })

const CLIENT_ID = '${clientId}'
const REDIRECT_URI = '${redirectUri}'

// 2) Embed the hosted login widget (iframe). The widget URL never carries a
//    redirect_uri — the server resolves it from this app's registration.
document.getElementById('rooiam-login').innerHTML =
  '<iframe src="${widgetUrl}" ' +
  'width="420" height="520" allow="publickey-credentials-get *" ' +
  'style="border:0;max-width:100%"></iframe>'

// 3) Start the OIDC redirect once the widget signals success. Keep the PKCE
//    verifier + state in sessionStorage so /callback can finish the exchange.
export async function startLogin() {
  const { verifier, challenge } = await createPkcePair()
  const state = crypto.randomUUID()
  sessionStorage.setItem('rooiam.pkce', JSON.stringify({ verifier, state }))
  window.location.href = rooiam.oidc.authorizeUrl({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    codeChallenge: challenge,
    scope: '${scope}',
    state,
  })
}

// 4) On your ${new URL(redirectUri).pathname} page: exchange the code for tokens.
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

  // Best practice: send tokens.access_token to YOUR backend and exchange it
  // for your own app session instead of storing RooIAM tokens in the browser.
  const profile = await rooiam.oidc.userinfo(tokens.access_token)
  return profile // { sub, email, name, ... }
}`

    const tsClient = jsClient
        .replace(
            "const params = new URLSearchParams(window.location.search)",
            "const params = new URLSearchParams(window.location.search)\n  const code = params.get('code')\n  if (!code) throw new Error('missing authorization code')",
        )
        .replace('code: params.get(\'code\'),', 'code,')

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

    const jsServer = `// Verify a RooIAM access token on YOUR backend, then upsert your own user.
// RooIAM owns identity; your app owns product roles + data.
const CLIENT_ID = '${clientId}'${isConfidential ? "\n// 'web' app: keep the secret server-side; rotate it in App > Danger Zone\nconst CLIENT_SECRET = process.env.ROOIAM_CLIENT_SECRET" : '\n// SPA / public app: no client secret — PKCE proved the token exchange'}

export async function resolveUser(accessToken) {
  // introspection tells you if the token is active
  const introspect = await fetch('${introspectEndpoint}', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      token: accessToken,
      client_id: CLIENT_ID,${isConfidential ? '\n      client_secret: CLIENT_SECRET,' : ''}
    }),
  }).then(r => r.json())
  if (!introspect.active) throw new Error('token is not active')

  // introspection carries NO email/name — read identity claims from userinfo
  const profile = await fetch('${userinfoEndpoint}', {
    headers: { Authorization: 'Bearer ' + accessToken },
  }).then(r => r.json())

  return profile // { sub, email, name, ... } — upsert into your DB by sub
}`

    const curlServer = `# Introspect a RooIAM access token (is it active?)
curl -X POST '${introspectEndpoint}' \\
  -H 'Content-Type: application/x-www-form-urlencoded' \\
  -d 'token=<ACCESS_TOKEN>' \\
  -d 'client_id=${clientId}'${isConfidential ? " \\\n  -d 'client_secret=<CLIENT_SECRET>'" : ''}

# Fetch identity claims (email, name) with the same token
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
                subtitle="Live values for this app. Server-side keys are marked; the rest are safe to ship to the browser."
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
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-muted/20 px-4 py-3">
                    <span className="text-xs font-bold text-muted-foreground">
                        Callbacks &amp; allowed origins are managed per app in the Overview tab. Branding lives in
                    </span>
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
                <ol className="space-y-2">
                    {[
                        ['Embed the widget', 'Your site shows the hosted login widget in an iframe (widget URL above).'],
                        ['User signs in', 'RooIAM handles passkey / magic link / Google inside the widget.'],
                        ['Redirect to authorize', 'On success your page calls oidc.authorizeUrl() and redirects to /oidc/authorize with the PKCE challenge.'],
                        ['Callback with code', `RooIAM redirects back to ${new URL(redirectUri).pathname} with ?code&state.`],
                        ['Exchange the code', 'oidc.exchangeCode() swaps the code + verifier for an access token (no secret in the browser).'],
                        ['Resolve identity', 'oidc.userinfo() returns sub/email/name. Send the token to your backend and mint your own app session.'],
                    ].map(([title, detail], i) => (
                        <li key={i} className="flex gap-3 rounded-2xl border border-border bg-white px-4 py-3">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-black text-violet-700">
                                {i + 1}
                            </span>
                            <div>
                                <p className="text-sm font-black text-gray-900">{title}</p>
                                <p className="text-xs font-semibold text-muted-foreground">{detail}</p>
                            </div>
                        </li>
                    ))}
                </ol>
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
                        This is a <span className="font-black">web</span> (confidential) app — keep the client secret on
                        the server only. Rotate it in the Overview tab&apos;s Danger Zone.
                    </PortalInlineMessage>
                ) : (
                    <div className="mb-3 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        <p className="text-xs font-bold text-emerald-900">
                            SPA / public app — no client secret. PKCE proves the token exchange, so nothing secret ships
                            to the browser.
                        </p>
                    </div>
                )}
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
