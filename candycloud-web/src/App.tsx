import React from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import {
  ArrowRightLeft,
  Check,
  ExternalLink,
  KeyRound,
  Loader2,
  LogOut,
  Palette,
  RefreshCcw,
  Smartphone,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import {
  demoApi,
  DemoAppCatalogItem,
  DemoAppConfig,
  DemoAuditLog,
  DemoLinkedAccounts,
  DemoMfaStatus,
  DemoPasskey,
  DemoSessionEntry,
  DemoUser,
  RateLimitError,
} from './lib/api'
import { getApiBase, getLoginBase } from './lib/config'
import DemoBadge from './components/DemoBadge'
import DemoLoginHint from './components/DemoLoginHint'

const DEFAULT_ORG_SLUG = 'roochoco'
const OIDC_AUTH_KEY = 'rooiam-demo:oidc-auth'
const DEMO_APP_SESSION_KEY = 'rooiam-demo:app-session'
const OIDC_AUTHORIZE_START_KEY = 'rooiam-demo:oidc-authorize-start'
const callbackExchangeRequests = new Map<string, Promise<{ ok: boolean; userinfo: Record<string, unknown>; workspace: string; workspace_id: string; token_type: string; expires_in: number; has_refresh_token: boolean; has_id_token: boolean }>>()

type PublicBranding = {
  id?: string
  name: string
  login_display_name: string | null
  brand_color: string | null
  logo_url?: string | null
}

type PublicAuthMethods = {
  magic_link_enabled: boolean
  google_enabled: boolean
  microsoft_enabled: boolean
  passkey_enabled: boolean
  mfa_required: boolean
  demo_mode: boolean
  demo_mailbox_url: string | null
}

type StoredOidcAuth = {
  workspaceId: string
  workspace: string
  appName: string
  appIconUrl: string | null
  appId: string
  redirectUri: string
  authorizationEndpoint: string
  tokenEndpoint: string
  userinfoEndpoint: string
  scope: string
  state: string
  codeVerifier: string
  codeChallenge: string
  createdAt: number
}

type DemoAppSession = {
  workspaceId: string
  workspace: string
  appName: string
  appIconUrl: string | null
  appId: string
  redirectUri: string
  scope: string
  callbackCode: string
  callbackState: string
  tokenMeta: {
    token_type: string
    expires_in: number
    has_refresh_token: boolean
    has_id_token: boolean
  }
  userinfo: Record<string, unknown>
}

type DemoGuideSection = {
  title: string
  steps: string[]
}

function alphaColor(hex: string | null | undefined, alpha: number) {
  const fallback = '201, 107, 138'
  if (!hex) return `rgba(${fallback}, ${alpha})`
  const value = hex.replace('#', '').trim()
  const normalized = value.length === 3 ? value.split('').map(char => `${char}${char}`).join('') : value
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(${fallback}, ${alpha})`
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

async function sha256Base64Url(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  const bytes = Array.from(new Uint8Array(digest))
  const binary = bytes.map(byte => String.fromCharCode(byte)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function randomBase64Url(byteLength = 32) {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  const binary = Array.from(bytes).map(byte => String.fromCharCode(byte)).join('')
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function buildAuthorizeUrl(config: DemoAppConfig, auth: StoredOidcAuth) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.app_id,
    redirect_uri: config.redirect_uri,
    scope: auth.scope,
    state: auth.state,
    code_challenge: auth.codeChallenge,
    code_challenge_method: 'S256',
  })
  return `${config.authorization_endpoint}?${params.toString()}`
}

function buildLoginUrl(workspaceId: string, workspace: string, appId: string) {
  const loginBase = getLoginBase()
  const widgetUrl = new URL(
    loginBase.endsWith('/login-widget') ? loginBase : `${loginBase}/login-widget`,
  )
  const params = new URLSearchParams({
    workspace_id: workspaceId,
    workspace,
    client_id: appId,
  })
  widgetUrl.search = params.toString()
  return widgetUrl.toString()
}

function persistOidcAuth(auth: StoredOidcAuth) {
  window.localStorage.setItem(OIDC_AUTH_KEY, JSON.stringify(auth))
}

function readOidcAuth() {
  const raw = window.localStorage.getItem(OIDC_AUTH_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredOidcAuth
  } catch {
    return null
  }
}

function persistDemoSession(session: DemoAppSession) {
  window.sessionStorage.setItem(DEMO_APP_SESSION_KEY, JSON.stringify(session))
}

function readDemoSession() {
  const raw = window.sessionStorage.getItem(DEMO_APP_SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as DemoAppSession
  } catch {
    return null
  }
}

function markOidcAuthorizeStarted(state: string) {
  window.sessionStorage.setItem(OIDC_AUTHORIZE_START_KEY, state)
}

function readOidcAuthorizeStarted() {
  return window.sessionStorage.getItem(OIDC_AUTHORIZE_START_KEY)
}

function clearOidcAuthorizeStarted() {
  window.sessionStorage.removeItem(OIDC_AUTHORIZE_START_KEY)
}

async function createOidcAuth(config: DemoAppConfig, workspace: string): Promise<StoredOidcAuth> {
  const codeVerifier = randomBase64Url(48)
  const codeChallenge = await sha256Base64Url(codeVerifier)
  return {
    workspaceId: config.workspace_id,
    workspace,
    appName: config.app_name,
    appIconUrl: config.app_icon_url,
    appId: config.app_id,
    redirectUri: config.redirect_uri,
    authorizationEndpoint: config.authorization_endpoint,
    tokenEndpoint: config.token_endpoint,
    userinfoEndpoint: config.userinfo_endpoint,
    scope: config.scopes.join(' '),
    state: randomBase64Url(24),
    codeVerifier,
    codeChallenge,
    createdAt: Date.now(),
  }
}

async function fetchBranding(workspaceId: string): Promise<PublicBranding | null> {
  if (!workspaceId.trim()) return null
  const res = await fetch(`${getApiBase()}/orgs/public/branding?workspace_id=${encodeURIComponent(workspaceId)}`)
  const data = await res.json().catch(() => ({}))
  return res.ok ? data : null
}

async function fetchAuthMethods(workspaceId: string): Promise<PublicAuthMethods> {
  const res = await fetch(`${getApiBase()}/setup/auth-methods?workspace_id=${encodeURIComponent(workspaceId)}`)
  const data = await res.json().catch(() => ({}))
  return {
    magic_link_enabled: Boolean(data.magic_link_enabled),
    google_enabled: Boolean(data.google_enabled),
    microsoft_enabled: Boolean(data.microsoft_enabled),
    passkey_enabled: Boolean(data.passkey_enabled),
    mfa_required: Boolean(data.mfa_required),
    demo_mode: Boolean(data.demo_mode),
    demo_mailbox_url: data.demo_mailbox_url || null,
  }
}

function hexToRgbVars(hex: string | null | undefined): React.CSSProperties {
  if (!hex) return {}
  const value = hex.replace('#', '').trim()
  const normalized = value.length === 3 ? value.split('').map(c => `${c}${c}`).join('') : value
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return {}
  return {
    '--brand-r': Number.parseInt(normalized.slice(0, 2), 16),
    '--brand-g': Number.parseInt(normalized.slice(2, 4), 16),
    '--brand-b': Number.parseInt(normalized.slice(4, 6), 16),
  } as React.CSSProperties
}

function resolveDemoAssetUrl(assetUrl: string | null | undefined): string {
  if (!assetUrl) return ''
  if (/^https?:\/\//i.test(assetUrl)) return assetUrl
  // Relative asset paths (e.g. /assets/demo/...) are served from rooiam-server, not candycloud-api
  return `${getLoginBase()}${assetUrl.startsWith('/') ? '' : '/'}${assetUrl}`
}

function Shell({ children, brandColor }: { children: React.ReactNode; brandColor?: string | null }) {
  return (
    <div className="demo-shell" style={hexToRgbVars(brandColor)}>
      <div className="demo-bg" />
      <div className="demo-inner">{children}</div>
    </div>
  )
}

function ApiInspectorBlock({
  label,
  request,
  onRun,
  response,
  loading,
}: {
  label: string
  request: string
  onRun?: () => void
  response?: { status: number; body: string } | null
  loading?: boolean
}) {
  return (
    <div>
      <div className="api-block-header">
        <p className="api-block-label">{label}</p>
        {onRun ? (
          <button type="button" className="api-run-btn" onClick={onRun} disabled={loading}>
            {loading ? 'Running…' : 'Run Request'}
          </button>
        ) : null}
      </div>
      <pre className="demo-code-block"><code>{request}</code></pre>
      {response ? (
        <div className="api-response-block">
          <p className="api-response-status">Response {response.status}</p>
          <pre className="demo-code-block api-response-code"><code>{response.body}</code></pre>
        </div>
      ) : null}
    </div>
  )
}

function formatWhen(value: string | null | undefined) {
  if (!value) return 'Not available'
  return new Date(value).toLocaleString()
}

function formatAuditAction(action: string) {
  return action.replace(/\./g, ' ')
}

function describeAuditAction(action: string) {
  const known: Record<string, string> = {
    'auth.login.success': 'Signed in successfully',
    'auth.passkey.login.success': 'Signed in with a passkey',
    'auth.passkey.demo.login.success': 'Signed in with demo passkey',
    'auth.mfa.enrolled': 'Enabled authenticator app',
    'auth.mfa.backup_codes.regenerated': 'Generated new backup codes',
    'auth.sessions.revoked_all': 'Revoked other sessions',
    'auth.passkey.registered': 'Added a passkey',
    'user.email.change_requested': 'Requested an email change',
    'user.email.changed': 'Changed account email',
  }
  return known[action] || formatAuditAction(action)
}

function describeSession(entry: DemoSessionEntry) {
  const app = entry.login_app_name || 'Signed-in app'
  const workspace = entry.login_workspace_slug ? ` · ${entry.login_workspace_slug}` : ''
  return `${app}${workspace}`
}

function getWorkspaceGuide(
  workspace: string,
  authMethods: PublicAuthMethods,
  demoEmail: string,
): { beforeLogin: DemoGuideSection[]; afterLogin: DemoGuideSection[] } {
  const normalized = workspace.trim().toLowerCase()
  const genericBefore = [
    `Use ${demoEmail} as the end-user account for this app.`,
    'Start with the enabled login methods shown for this workspace.',
  ]
  const genericAfter = [
    'Open Security to register a passkey or set up an authenticator app.',
    'Open Sessions to revoke another session and confirm the session list updates.',
    'Open Activity to confirm your sign-in and self-service changes were logged.',
  ]

  switch (normalized) {
    case 'roochoco':
      return {
        beforeLogin: [
          { title: 'First sign-in', steps: [...genericBefore, 'Try Magic Link first, then come back and test Passkey sign-in on the same account.'] },
          { title: 'What this workspace shows', steps: ['Passkey is enabled.', 'MFA is optional.', 'Google is enabled as an additional social login path.'] },
        ],
        afterLogin: [
          { title: 'Recommended next tests', steps: [...genericAfter, 'Register a passkey here, sign out, then use Passkey on the next sign-in.'] },
        ],
      }
    case 'mintmallow':
      return {
        beforeLogin: [
          { title: 'First sign-in', steps: [...genericBefore, 'Use Magic Link, Google, or Microsoft.', 'This workspace requires MFA, so you should hit MFA enrollment during login if the account is not enrolled yet.'] },
          { title: 'What this workspace shows', steps: ['Passkey is disabled.', 'MFA is required.', 'Microsoft is enabled here to contrast with RooChoco.'] },
        ],
        afterLogin: [
          { title: 'Recommended next tests', steps: [...genericAfter, 'Generate backup codes after MFA enrollment and verify they appear in Security.'] },
        ],
      }
    case 'melonhoneytoast':
      return {
        beforeLogin: [
          { title: 'First sign-in', steps: [...genericBefore, 'Try Magic Link first, then add a passkey after sign-in.'] },
          { title: 'What this workspace shows', steps: ['Passkey is enabled.', 'MFA is optional.', 'Google is enabled.'] },
        ],
        afterLogin: [
          { title: 'Recommended next tests', steps: [...genericAfter, 'Add a passkey, sign out, then test the passkey path end to end.'] },
        ],
      }
    case 'berryburger':
      return {
        beforeLogin: [
          { title: 'First sign-in', steps: [...genericBefore, 'Use Magic Link or Google.', 'This workspace is the simpler baseline: no passkey and no required MFA.'] },
          { title: 'What this workspace shows', steps: ['Passkey is disabled.', 'MFA is not required.', 'Powered-by branding is hidden in the widget.'] },
        ],
        afterLogin: [
          { title: 'Recommended next tests', steps: [...genericAfter, 'Add TOTP manually here to show user-controlled MFA even when the workspace does not require it.'] },
        ],
      }
    case 'moopizza':
      return {
        beforeLogin: [
          { title: 'First sign-in', steps: [...genericBefore, 'This workspace is the strongest policy path: passkey is available and MFA is required.', 'Start with Magic Link if you need to enroll MFA first.'] },
          { title: 'What this workspace shows', steps: ['Passkey is enabled.', 'MFA is required.', 'Google and Microsoft are disabled to keep the flow focused.'] },
        ],
        afterLogin: [
          { title: 'Recommended next tests', steps: [...genericAfter, 'Enroll MFA, generate backup codes, then add a passkey and use both on the next sign-in cycle.'] },
        ],
      }
    default:
      return {
        beforeLogin: [
          { title: 'Before sign-in', steps: genericBefore },
          { title: 'Enabled methods', steps: [
            authMethods.passkey_enabled ? 'Passkey is enabled.' : 'Passkey is disabled.',
            authMethods.mfa_required ? 'MFA is required for sign-in.' : 'MFA is optional.',
          ] },
        ],
        afterLogin: [
          { title: 'After sign-in', steps: genericAfter },
        ],
      }
  }
}

function getSecurityBanner(workspace: string, mfaRequired: boolean, passkeyEnabled: boolean) {
  const normalized = workspace.trim().toLowerCase()
  const enabled: string[] = []
  if (passkeyEnabled) enabled.push('Passkey')
  enabled.push('Magic Link')

  switch (normalized) {
    case 'mintmallow':
      return {
        title: 'This workspace requires MFA',
        body: 'Finish sign-in, then open Security to verify your authenticator app and generate backup codes for recovery.',
        chips: ['MFA required', 'Google enabled', 'Microsoft enabled'],
      }
    case 'moopizza':
      return {
        title: 'This workspace has the strongest security path',
        body: 'MFA is required here and passkey is available. Open Security to enroll your authenticator app, generate backup codes, and add a passkey for future sign-ins.',
        chips: ['MFA required', 'Passkey enabled'],
      }
    case 'roochoco':
    case 'melonhoneytoast':
      return {
        title: 'Passkey is available for this workspace',
        body: 'Open Security to register a passkey now, then sign out and try the faster passkey path on your next login.',
        chips: ['Passkey enabled', mfaRequired ? 'MFA required' : 'MFA optional'],
      }
    case 'berryburger':
      return {
        title: 'This workspace is the simple baseline flow',
        body: 'Use this one to test a lighter login experience first, then try optional MFA setup in Security if you want to compare the user-managed path.',
        chips: ['No passkey', 'MFA optional'],
      }
    default:
      return {
        title: 'Security setup is available after sign-in',
        body: 'Open Security to review the enabled sign-in methods, add a passkey if available, and configure MFA for this account.',
        chips: [...enabled, mfaRequired ? 'MFA required' : 'MFA optional'],
      }
  }
}

function Landing() {
  const [params, setParams] = useSearchParams()
  const workspace = params.get('workspace') || params.get('org') || DEFAULT_ORG_SLUG
  const requestedAppId = params.get('app_id') || ''
  const widgetDebug = true
  const [showMobileGuide, setShowMobileGuide] = React.useState(false)
  const [branding, setBranding] = React.useState<PublicBranding | null>(null)
  const [authMethods, setAuthMethods] = React.useState<PublicAuthMethods>({
    magic_link_enabled: true,
    google_enabled: false,
    microsoft_enabled: false,
    passkey_enabled: false,
    mfa_required: false,
    demo_mode: false,
    demo_mailbox_url: null,
  })
  const [demoApps, setDemoApps] = React.useState<DemoAppCatalogItem[]>([])
  const [appConfig, setAppConfig] = React.useState<DemoAppConfig | null>(null)
  const [authRequest, setAuthRequest] = React.useState<StoredOidcAuth | null>(null)
  const [brandingReady, setBrandingReady] = React.useState(false)
  const [iframeReady, setIframeReady] = React.useState(false)
  const [widgetReady, setWidgetReady] = React.useState(false)
  const [loadingMessage, setLoadingMessage] = React.useState('Loading login widget...')
  const [loadingDetail, setLoadingDetail] = React.useState('Waiting for embedded login frame...')
  const [bootError, setBootError] = React.useState('')
  const [bootRateLimited, setBootRateLimited] = React.useState<{ message: string; raw: unknown } | null>(null)
  const [pendingPrefillEmail, setPendingPrefillEmail] = React.useState('')
  const [widgetResponse, setWidgetResponse] = React.useState<{ status: number; body: string } | null>(null)
  const [widgetResponseLoading, setWidgetResponseLoading] = React.useState(false)
  const [appConfigResponse, setAppConfigResponse] = React.useState<{ status: number; body: string } | null>(null)
  const [appConfigResponseLoading, setAppConfigResponseLoading] = React.useState(false)
  const iframeVisible = iframeReady && widgetReady
  const iframeRef = React.useRef<HTMLIFrameElement>(null)

  React.useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'rooiam:iframe-height' && iframeRef.current) {
        iframeRef.current.style.height = `${e.data.height}px`
        setIframeReady(true)
      }
      if (e.data?.type === 'rooiam:iframe-progress' && typeof e.data.message === 'string') {
        setLoadingMessage(e.data.message)
        setLoadingDetail(typeof e.data.detail === 'string' ? e.data.detail : '')
      }
      if (e.data?.type === 'rooiam:widget-ready') {
        setWidgetReady(true)
      }
      if (e.data?.type === 'rooiam:navigate' && typeof e.data.url === 'string') {
        window.location.href = e.data.url
      }
      if (e.data?.type === 'rooiam:error') {
        setBootError(e.data.message || 'Widget failed to load')
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [])



  React.useEffect(() => {
    let cancelled = false
    setBootError('')
    setBootRateLimited(null)
    setBrandingReady(false)
    setIframeReady(false)
    setWidgetReady(false)
    setPendingPrefillEmail('')
    setLoadingMessage('Loading login widget...')
    setLoadingDetail(`workspace=${workspace}`)
    setAppConfig(null)
    setAuthRequest(null)

    Promise.resolve()
      .then(async () => {
        try {
          const catalog = await demoApi.demoAppCatalog()
          const matchingApp = catalog.find(item =>
            (params.get('workspace_id') && item.workspace_id === params.get('workspace_id'))
            || (workspace && item.workspace_slug === workspace),
          )
          const resolvedWorkspaceId = params.get('workspace_id') || matchingApp?.workspace_id || ''
          const resolvedAppId = requestedAppId || matchingApp?.app_id || ''
          const config = await demoApi.demoAppConfig(
            resolvedWorkspaceId,
            workspace,
            resolvedAppId,
            window.location.origin,
          )
          if (!config.redirect_uri) {
            throw new Error(
              `Demo config error: redirect_uri is empty for "${config.app_id}".\n` +
              `The server seeded this OAuth client with a different origin.\n` +
              `Fix: delete demo OAuth clients from the DB and restart the server to reseed.\n` +
              `SQL: DELETE FROM oauth_clients WHERE client_id LIKE 'demo-%';`
            )
          }
          return { catalog, config }
        } catch (err) {
          throw err
        }
      })
      .then(async ({ catalog, config }) => {
        if (cancelled) return
        setDemoApps(catalog)
        setAppConfig(config)
        const [brandingData, authData] = await Promise.all([
          fetchBranding(config.workspace_id),
          fetchAuthMethods(config.workspace_id),
        ])
        if (cancelled) return
        setBranding(brandingData)
        setAuthMethods(authData)
        const auth = await createOidcAuth(config, workspace)
        if (cancelled) return
        persistOidcAuth(auth)
        setAuthRequest(auth)
      })
      .catch(err => {
        if (!cancelled) {
          if (err instanceof RateLimitError) {
            setBootRateLimited({ message: err.message, raw: err.raw })
          } else {
            setBootError(err instanceof Error ? err.message : 'Could not prepare the demo app.')
          }
        }
      })
      .finally(() => {
        if (!cancelled) setBrandingReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [workspace, requestedAppId])

  const tenantName = branding?.login_display_name || branding?.name || appConfig?.app_name || 'Rooiam Demo'
  const widgetColor = branding?.brand_color || '#c96b8a'
  const demoCustomerEmail = appConfig?.demo_email || ''
  const authorizeUrl = appConfig && authRequest ? buildAuthorizeUrl(appConfig, authRequest) : ''
  const loginUrl = appConfig ? buildLoginUrl(appConfig.workspace_id, workspace, appConfig.app_id) : ''
  const demoHintReady = brandingReady && iframeVisible && !bootError
  const apiBase = getApiBase()
  const widgetConfigUrl = appConfig
    ? `${apiBase}/setup/login-bootstrap?workspace_id=${encodeURIComponent(appConfig.workspace_id)}`
    : ''
  const appConfigUrl = appConfig
    ? `${apiBase}/demo/app-config?workspace_id=${encodeURIComponent(appConfig.workspace_id)}&app_id=${encodeURIComponent(appConfig.app_id)}&origin=${encodeURIComponent(window.location.origin)}`
    : ''
  const authorizePreviewUrl = authorizeUrl
  const tokenCurlSnippet = appConfig && authRequest
    ? `curl -X POST ${appConfig.token_endpoint} \\\n  -d 'grant_type=authorization_code' \\\n  -d 'code=<code-from-callback>' \\\n  -d 'redirect_uri=${appConfig.redirect_uri}' \\\n  -d 'client_id=${appConfig.app_id}' \\\n  -d 'code_verifier=${authRequest.codeVerifier}'`
    : `curl -X POST /v1/oidc/token \\\n  -d 'grant_type=authorization_code' \\\n  -d 'code=<code-from-callback>' \\\n  -d 'redirect_uri=<redirect-uri>' \\\n  -d 'client_id=<client-id>' \\\n  -d 'code_verifier=<pkce-verifier>'`
  const userinfoCurlSnippet = appConfig
    ? `curl ${appConfig.userinfo_endpoint} \\\n  -H 'Authorization: Bearer <access-token>'`
    : `curl /v1/oidc/userinfo -H 'Authorization: Bearer <access-token>'`
  const workspaceGuide = getWorkspaceGuide(workspace, authMethods, demoCustomerEmail)
  const widgetOrigin = loginUrl ? new URL(loginUrl).origin : ''

  const runJsonRequest = React.useCallback(async (
    url: string,
    setLoading: React.Dispatch<React.SetStateAction<boolean>>,
    setResponse: React.Dispatch<React.SetStateAction<{ status: number; body: string } | null>>,
  ) => {
    setLoading(true)
    try {
      const res = await fetch(url)
      const text = await res.text()
      let body = text
      try {
        body = JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        body = text
      }
      setResponse({ status: res.status, body })
    } catch (err) {
      setResponse({
        status: 0,
        body: JSON.stringify(
          { error: err instanceof Error ? err.message : 'Request failed' },
          null,
          2,
        ),
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const sendPrefillEmailToWidget = React.useCallback((email: string) => {
    const normalizedEmail = email.trim()
    if (!normalizedEmail || !iframeRef.current?.contentWindow || !widgetOrigin) return
    iframeRef.current.contentWindow.postMessage(
      {
        type: 'rooiam-login-widget:prefill-email',
        email: normalizedEmail,
      },
      widgetOrigin,
    )
  }, [widgetOrigin])

  React.useEffect(() => {
    if (!pendingPrefillEmail || !iframeReady || !widgetReady) return
    sendPrefillEmailToWidget(pendingPrefillEmail)
  }, [iframeReady, pendingPrefillEmail, sendPrefillEmailToWidget, widgetReady])

  const handlePrefillEmail = React.useCallback((email: string) => {
    const normalizedEmail = email.trim()
    if (!normalizedEmail) return
    setPendingPrefillEmail(normalizedEmail)
    if (iframeReady && widgetReady) {
      sendPrefillEmailToWidget(normalizedEmail)
    }
  }, [iframeReady, sendPrefillEmailToWidget, widgetReady])

  return (
    <Shell brandColor={widgetColor}>
      <div className="login-page">
        {authMethods.demo_mode && demoApps.length > 0 ? (
          <div className="demo-tenant-switcher" role="tablist">
            {demoApps.map(t => (
              <button
                key={`${t.workspace_slug}:${t.app_id}`}
                type="button"
                className={workspace === t.workspace_slug ? 'demo-tenant-chip is-active' : 'demo-tenant-chip'}
                onClick={() => {
                  const next = new URLSearchParams(params)
                  next.set('workspace', t.workspace_slug)
                  next.set('workspace_id', t.workspace_id)
                  next.set('app_id', t.app_id)
                  next.delete('org')
                  setParams(next, { replace: true })
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : null}

        {bootRateLimited ? (
          <div className="login-loading-state" style={{ border: '1px solid #fde68a', background: '#fffbeb', borderRadius: '24px', padding: '24px 32px', marginBottom: '24px' }}>
            <p className="login-loading-title" style={{ color: '#92400e' }}>Server is busy — please wait a moment</p>
            <p className="login-loading-copy" style={{ color: '#78350f', marginBottom: '12px' }}>Too many requests. Refresh the page to try again.</p>
            <pre style={{ fontSize: '11px', color: '#92400e', background: '#fef3c7', borderRadius: '8px', padding: '10px 14px', overflowX: 'auto', textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{JSON.stringify(bootRateLimited.raw, null, 2)}</pre>
          </div>
        ) : null}

        {bootError ? (
          <div className="login-loading-state">
            <p className="login-loading-title">Could not prepare the demo app</p>
            <p className="login-loading-copy">{bootError}</p>
          </div>
        ) : null}

        {params.get('revoked') === 'true' ? (
          <div className="login-loading-state" style={{ padding: '24px 32px', border: '1px solid #ffd8d8', background: '#fff0f0', borderRadius: '24px', marginBottom: '24px' }}>
            <p className="login-loading-title" style={{ color: '#d94141' }}>Session Revoked</p>
            <p className="login-loading-copy" style={{ color: '#b91c1c' }}>Your session was terminated (likely from another window). The demo app automatically detected the revocation via its background polling and safely signed you out.</p>
          </div>
        ) : null}

        <div className="landing-grid">
          <div>
            <div className="landing-widget-frame">
              {!iframeVisible && !bootError ? (
                <div className="login-loading-state">
                  <Loader2 className="login-loading-spinner" />
                  <p className="login-loading-title">{widgetDebug ? 'Preparing secure sign-in' : 'Loading sign-in...'}</p>
                  {widgetDebug ? <p className="login-loading-copy">{loadingMessage}</p> : null}
                  {widgetDebug && loadingDetail ? <p className="login-loading-detail">{loadingDetail}</p> : null}
                </div>
              ) : null}

              {loginUrl ? (
                <iframe
                  ref={iframeRef}
                  key={loginUrl}
                  src={loginUrl}
                  className="login-widget-iframe"
                  title={`${tenantName} Login`}
                  allow="publickey-credentials-get *"
                  style={{ opacity: iframeVisible ? 1 : 0, minHeight: 520, transition: 'opacity 0.18s ease' }}
                  onLoad={() => {
                    setIframeReady(true)
                    setWidgetReady(true)
                  }}
                />
              ) : null}
            </div>

            <button
              type="button"
              className="mobile-guide-toggle"
              onClick={() => setShowMobileGuide(open => !open)}
            >
              {showMobileGuide ? 'Hide guide & API' : 'Show guide & API'}
            </button>
          </div>

          <aside className={`detail-card demo-simple-card landing-explainer${showMobileGuide ? ' is-open' : ''}`}>
            {demoHintReady && authMethods.demo_mode && authMethods.magic_link_enabled && demoCustomerEmail ? (
              <DemoLoginHint
                title="Try the demo app"
                email={demoCustomerEmail}
                accentColor={widgetColor}
                onFillEmail={() => handlePrefillEmail(demoCustomerEmail)}
                showPasskey={authMethods.passkey_enabled}
                showMfaStep={authMethods.mfa_required}
                showSetupHint={authMethods.passkey_enabled || authMethods.mfa_required}
                mailboxUrl={authMethods.demo_mailbox_url}
              />
            ) : null}

            <div className="landing-summary-grid">
              <div className="landing-summary-card">
                <span>Workspace</span>
                <strong>{tenantName}</strong>
              </div>
              <div className="landing-summary-card">
                <span>Methods</span>
                <strong>
                  {[
                    authMethods.passkey_enabled ? 'Passkey' : null,
                    authMethods.magic_link_enabled ? 'Magic Link' : null,
                    authMethods.google_enabled ? 'Google' : null,
                    authMethods.microsoft_enabled ? 'Microsoft' : null,
                  ].filter(Boolean).join(', ')}
                </strong>
              </div>
            </div>

            <details className="demo-guide-details">
              <summary className="demo-guide-summary">Demo Guide</summary>
              <div className="landing-guide-stack">
                <div className="landing-summary-card">
                  <span>Widget Login</span>
                  <strong>Hosted sign-in UI from the configured login app URL.</strong>
                </div>
                <div className="landing-summary-card">
                  <span>App Login</span>
                  <strong>OIDC redirect to callback, then token and userinfo via API.</strong>
                </div>
                {workspaceGuide.beforeLogin.map(section => (
                  <div key={section.title} className="landing-summary-card">
                    <span>{section.title}</span>
                    <ul className="landing-guide-list">
                      {section.steps.map(step => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>

            <details className="api-inspector">
              <summary className="api-inspector-summary">View API examples</summary>
              <div className="api-link-list">
                {widgetConfigUrl ? (
                  <a className="api-link-chip" href={widgetConfigUrl} target="_blank" rel="noreferrer">
                    Widget Config JSON
                  </a>
                ) : null}
                {appConfigUrl ? (
                  <a className="api-link-chip" href={appConfigUrl} target="_blank" rel="noreferrer">
                    App Config JSON
                  </a>
                ) : null}
                {authorizePreviewUrl ? (
                  <a className="api-link-chip" href={authorizePreviewUrl} target="_blank" rel="noreferrer">
                    Authorize Request
                  </a>
                ) : null}
                {appConfig?.token_endpoint ? (
                  <a className="api-link-chip" href={appConfig.token_endpoint} target="_blank" rel="noreferrer">
                    Token Endpoint
                  </a>
                ) : null}
                {appConfig?.userinfo_endpoint ? (
                  <a className="api-link-chip" href={appConfig.userinfo_endpoint} target="_blank" rel="noreferrer">
                    Userinfo Endpoint
                  </a>
                ) : null}
              </div>
              <div className="explainer-panel">
                <ApiInspectorBlock
                  label="Widget bootstrap"
                  request={widgetConfigUrl || 'GET /v1/setup/login-bootstrap?workspace_id=<workspace-id>'}
                  onRun={widgetConfigUrl ? () => runJsonRequest(widgetConfigUrl, setWidgetResponseLoading, setWidgetResponse) : undefined}
                  response={widgetResponse}
                  loading={widgetResponseLoading}
                />
                <ApiInspectorBlock
                  label="App config"
                  request={appConfigUrl || 'GET /v1/demo/app-config?workspace_id=<workspace-id>&app_id=<client-id>&origin=<app-origin>'}
                  onRun={appConfigUrl ? () => runJsonRequest(appConfigUrl, setAppConfigResponseLoading, setAppConfigResponse) : undefined}
                  response={appConfigResponse}
                  loading={appConfigResponseLoading}
                />
                <ApiInspectorBlock
                  label="Token exchange example"
                  request={tokenCurlSnippet}
                />
                <ApiInspectorBlock
                  label="Userinfo example"
                  request={userinfoCurlSnippet}
                />
              </div>
            </details>
          </aside>
        </div>
      </div>
    </Shell>
  )
}

function Callback() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (window.parent !== window) {
      window.top?.location.replace(window.location.href)
      return
    }

    let cancelled = false

    const run = async () => {
      const oidcError = params.get('error')
      if (oidcError) {
        setError(params.get('error_description') || oidcError)
        return
      }

      const code = params.get('code')
      const state = params.get('state')
      const auth = readOidcAuth()

      if (!auth) {
        setError('The demo app callback is missing its OIDC state.')
        return
      }
      if (!code || !state) {
        const authorizeStarted = readOidcAuthorizeStarted() === auth.state
        if (!authorizeStarted) {
          markOidcAuthorizeStarted(auth.state)
          window.location.replace(buildAuthorizeUrl({
            workspace_id: auth.workspaceId,
            workspace_slug: auth.workspace,
            app_name: auth.appName,
            app_icon_url: auth.appIconUrl,
            app_id: auth.appId,
            redirect_uri: auth.redirectUri,
            authorization_endpoint: auth.authorizationEndpoint,
            token_endpoint: auth.tokenEndpoint,
            userinfo_endpoint: auth.userinfoEndpoint,
            scopes: auth.scope.split(' ').filter(Boolean),
            demo_email: '',
          }, auth))
          return
        }
        setError('The demo app callback is missing its authorization code.')
        return
      }
      if (state !== auth.state) {
        setError('The OIDC callback state did not match the request that started this demo login.')
        return
      }
      const exchangeKey = `${code}:${state}`
      let exchange = callbackExchangeRequests.get(exchangeKey)
      if (!exchange) {
        // Exchange code server-side via candycloud-api.
        // candycloud-api calls Rooiam, creates candycloud_session cookie.
        exchange = demoApi.authExchange({
          code,
          redirect_uri: auth.redirectUri,
          client_id: auth.appId,
          code_verifier: auth.codeVerifier,
          workspace: auth.workspace,
          workspace_id: auth.workspaceId,
          app_name: auth.appName,
          app_id: auth.appId,
        })
        callbackExchangeRequests.set(exchangeKey, exchange)
      }

      try {
        const result = await exchange
        if (cancelled) return
        persistDemoSession({
          workspaceId: result.workspace_id || auth.workspaceId,
          workspace: result.workspace || auth.workspace,
          appName: auth.appName,
          appIconUrl: auth.appIconUrl,
          appId: auth.appId,
          redirectUri: auth.redirectUri,
          scope: auth.scope,
          callbackCode: code,
          callbackState: state,
          tokenMeta: {
            token_type: result.token_type || 'Bearer',
            expires_in: result.expires_in || 0,
            has_refresh_token: result.has_refresh_token || false,
            has_id_token: result.has_id_token || false,
          },
          userinfo: result.userinfo,
        })
        clearOidcAuthorizeStarted()
        callbackExchangeRequests.delete(exchangeKey)
        window.localStorage.removeItem(OIDC_AUTH_KEY)
        // Give the browser one event-loop tick to process the Set-Cookie header
        // from the exchange response before the dashboard mounts and fires fetches.
        await new Promise(r => setTimeout(r, 0))
        navigate(`/dashboard?workspace=${encodeURIComponent(auth.workspace)}&workspace_id=${encodeURIComponent(auth.workspaceId)}`, {
          replace: true,
        })
      } catch (err) {
        clearOidcAuthorizeStarted()
        callbackExchangeRequests.delete(exchangeKey)
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not complete the OIDC callback.')
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [navigate, params])

  return (
    <Shell>
      <div className="center-card">
        <Loader2 className="spinner" />
        <h1>Completing app sign-in</h1>
        <p>Rooiam is exchanging the authorization code for tokens and loading the demo app session.</p>
        {error ? <p className="error-copy">{error}</p> : null}
      </div>
    </Shell>
  )
}

function getSessionCookie(): string {
  const match = document.cookie.match(/(?:^|;\s*)candycloud_session=([^;]+)/)
  return match ? match[1] : '(not set)'
}

function makeLog(
  method: string,
  url: string,
  body: Record<string, unknown> | null,
  resStatus: string,
  resBody: string,
  opts?: { demo?: boolean; extraReqHeaders?: string; resHeaders?: string },
): ApiLog {
  const cookie = getSessionCookie()
  const reqHeaderLines = [
    `Cookie: candycloud_session=${cookie}`,
    ...(body !== null ? ['Content-Type: application/json'] : []),
    ...(opts?.extraReqHeaders ? [opts.extraReqHeaders] : []),
  ].join('\n')
  const resHeaderLines = [
    'Content-Type: application/json',
    ...(opts?.resHeaders ? [opts.resHeaders] : []),
  ].join('\n')
  return {
    method,
    url,
    reqHeaders: reqHeaderLines,
    reqBody: body !== null ? JSON.stringify(body, null, 2) : undefined,
    resStatus,
    resHeaders: resHeaderLines,
    resBody,
    demo: opts?.demo,
  }
}

function Dashboard() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [session, setSession] = React.useState<DemoAppSession | null>(() => readDemoSession())
  const [checkingCookieSession, setCheckingCookieSession] = React.useState(() => !readDemoSession())
  const [sessionCheckError, setSessionCheckError] = React.useState<string | null>(null)
  const [branding, setBranding] = React.useState<PublicBranding | null>(null)
  const [loggingOut, setLoggingOut] = React.useState(false)
  const [userinfoResponse, setUserinfoResponse] = React.useState<{ status: number; body: string } | null>(null)
  const [userinfoLoading, setUserinfoLoading] = React.useState(false)
  const [selfServiceLoading, setSelfServiceLoading] = React.useState(true)
  const [selfServiceError, setSelfServiceError] = React.useState('')
  const [selfServiceNotice, setSelfServiceNotice] = React.useState('')
  const [linkedAccounts, setLinkedAccounts] = React.useState<DemoLinkedAccounts | null>(null)
  const [passkeys, setPasskeys] = React.useState<DemoPasskey[]>([])
  const [mfaStatus, setMfaStatus] = React.useState<DemoMfaStatus | null>(null)
  const [sessions, setSessions] = React.useState<DemoSessionEntry[]>([])
  const [auditLogs, setAuditLogs] = React.useState<DemoAuditLog[]>([])
  const [registeringPasskey, setRegisteringPasskey] = React.useState(false)
  const [passkeyName, setPasskeyName] = React.useState('My Device')
  const [totpLoading, setTotpLoading] = React.useState(false)
  const [totpChallengeId, setTotpChallengeId] = React.useState('')
  const [totpSecret, setTotpSecret] = React.useState('')
  const [totpUri, setTotpUri] = React.useState('')
  const [totpQrCode, setTotpQrCode] = React.useState('')
  const [totpCode, setTotpCode] = React.useState('')
  const [backupCodes, setBackupCodes] = React.useState<string[]>([])
  const [busySessionId, setBusySessionId] = React.useState('')
  const [profileName, setProfileName] = React.useState('')
  const [pendingEmail, setPendingEmail] = React.useState('')
  const [profileSaving, setProfileSaving] = React.useState(false)
  const [emailSaving, setEmailSaving] = React.useState(false)
  const [profileApiLog, setProfileApiLog] = React.useState<ApiLog | null>(null)
  const [emailApiLog, setEmailApiLog] = React.useState<ApiLog | null>(null)

  const [passkeyAddApiLog, setPasskeyAddApiLog] = React.useState<ApiLog | null>(null)
  const [passkeyRemoveApiLog, setPasskeyRemoveApiLog] = React.useState<ApiLog | null>(null)
  const [mfaStartApiLog, setMfaStartApiLog] = React.useState<ApiLog | null>(null)
  const [mfaFinishApiLog, setMfaFinishApiLog] = React.useState<ApiLog | null>(null)
  const [mfaDisableApiLog, setMfaDisableApiLog] = React.useState<ApiLog | null>(null)
  const [mfaCodesApiLog, setMfaCodesApiLog] = React.useState<ApiLog | null>(null)
  const [revokeSessionApiLogs, setRevokeSessionApiLogs] = React.useState<Map<string, ApiLog>>(new Map())
  const [revokedSessionIds, setRevokedSessionIds] = React.useState<Set<string>>(new Set())
  const [revokeOtherApiLog, setRevokeOtherApiLog] = React.useState<ApiLog | null>(null)
  const [copiedAppId, setCopiedAppId] = React.useState(false)
  const [accessToken, setAccessToken] = React.useState('')
  const workspace = params.get('workspace') || params.get('org') || DEFAULT_ORG_SLUG
  const workspaceId = params.get('workspace_id') || ''

  React.useEffect(() => {
    if (window.parent !== window) {
      window.top?.location.replace(window.location.href)
    }
  }, [])

  React.useEffect(() => {
    if (session) {
      setCheckingCookieSession(false)
      return
    }

    let cancelled = false

    setSessionCheckError(null)
    setCheckingCookieSession(true)

    demoApi.authSession()
      .then(result => {
        if (cancelled) return

        const newSession: DemoAppSession = {
          workspaceId: result.workspace_id || workspaceId,
          workspace: result.workspace || workspace,
          appName: result.app_name || 'Demo App',
          appIconUrl: null,
          appId: result.app_id || '',
          redirectUri: `${window.location.origin}/dashboard`,
          scope: 'openid profile email',
          callbackCode: '',
          callbackState: '',
          tokenMeta: {
            token_type: 'Bearer',
            expires_in: 0,
            has_refresh_token: false,
            has_id_token: false,
          },
          userinfo: result.userinfo,
        }
        persistDemoSession(newSession)
        setSession(newSession)
        setCheckingCookieSession(false)
      })
      .catch(err => {
        if (cancelled) return

        // 401 = no session, which is normal — just redirect to login silently.
        // Only show the error screen for unexpected failures (network error, 500, etc.)
        if (err.status === 401) {
          setSession(null)
          setCheckingCookieSession(false)
        } else {
          setSessionCheckError(err.message || 'Session check failed')
          setSession(null)
          setCheckingCookieSession(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [session, workspace, workspaceId])

  React.useEffect(() => {
    if (!session) return
    let cancelled = false
    fetchBranding(session.workspaceId).then(data => {
      if (!cancelled) setBranding(data)
    }).catch(() => {})
    demoApi.authToken().then(data => {
      if (!cancelled) setAccessToken(data.access_token)
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [session])

  const loadSelfService = React.useCallback(async () => {
    setSelfServiceLoading(true)
    setSelfServiceError('')
    try {
      const [meData, linkedData, passkeyList, mfaData, sessionList, auditData] = await Promise.all([
        demoApi.me(),
        demoApi.linkedAccounts(),
        demoApi.passkeys(),
        demoApi.mfaStatus(),
        demoApi.sessions(),
        demoApi.auditLogs(1, 8),
      ])
      setLinkedAccounts(linkedData)
      setPasskeys(passkeyList)
      setMfaStatus(mfaData)
      setSessions(sessionList)
      setAuditLogs(auditData.items)
      setProfileName(meData.display_name || '')
      setPendingEmail(linkedData.primary_email || meData.email || '')
    } catch (err) {
      setSelfServiceError(err instanceof Error ? err.message : 'Could not load self-service security data.')
    } finally {
      setSelfServiceLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (!session) return
    void loadSelfService()
  }, [loadSelfService, session])

  React.useEffect(() => {
    if (!session) return
    document.title = `${branding?.login_display_name || branding?.name || session.workspace} - ${session.appName}`
    return () => {
      document.title = 'Rooiam Demo'
    }
  }, [branding, session])

  React.useEffect(() => {
    if (!totpUri) {
      setTotpQrCode('')
      return
    }

    let cancelled = false
    QRCode.toDataURL(totpUri, {
      margin: 1,
      width: 196,
      color: {
        dark: '#243049',
        light: '#ffffff',
      },
    })
      .then(url => {
        if (!cancelled) setTotpQrCode(url)
      })
      .catch(() => {
        if (!cancelled) setTotpQrCode('')
      })

    return () => {
      cancelled = true
    }
  }, [totpUri])

  const handleLogout = async () => {
    setLoggingOut(true)
    const returnTo = `/app?org=${encodeURIComponent(session?.workspace || workspace)}`
    const returnUrl = new URL(returnTo, window.location.origin).toString()
    const endSessionUrl = `${getLoginBase()}/v1/oidc/end-session?post_logout_redirect_uri=${encodeURIComponent(returnUrl)}&client_id=${encodeURIComponent(session?.appId || '')}`
    window.sessionStorage.removeItem(DEMO_APP_SESSION_KEY)
    window.localStorage.removeItem(OIDC_AUTH_KEY)
    try { await demoApi.logout() } catch { /* ignore */ }
    window.location.href = endSessionUrl
  }

  const logoutApiPreview: ApiLog = React.useMemo(() => {
    const apiBase = getApiBase()
    const returnTo = `/app?org=${encodeURIComponent(session?.workspace || workspace)}`
    const returnUrl = new URL(returnTo, window.location.origin).toString()
    const endSessionUrl = `${getLoginBase()}/v1/oidc/end-session?post_logout_redirect_uri=${encodeURIComponent(returnUrl)}&client_id=${encodeURIComponent(session?.appId || '')}`
    return makeLog(
      'POST', `${apiBase}/auth/logout`, {},
      '200 OK',
      `{ "ok": true }\n\n→ candycloud_session cookie cleared\n→ rooiam_sid cookie cleared\n→ browser navigates to:\nGET ${endSessionUrl}`,
      { resHeaders: 'Set-Cookie: candycloud_session=; Max-Age=0; HttpOnly; Path=/' }
    )
  }, [session, workspace])

  React.useEffect(() => {
    if (!session) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${getApiBase()}/identity/me`, { credentials: 'include' })
        if (res.status === 401) {
          window.sessionStorage.removeItem(DEMO_APP_SESSION_KEY)
          window.localStorage.removeItem(OIDC_AUTH_KEY)
          navigate(`/?workspace=${encodeURIComponent(session.workspace)}&revoked=true`, { replace: true })
        }
      } catch (err) {
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [session, navigate])

  if (!session && !checkingCookieSession && sessionCheckError) {
    return (
      <Shell>
        <div className="center-card" style={{ textAlign: 'center', padding: '48px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ color: '#dc2626', marginBottom: 8 }}>Session Check Failed</h2>
          <p style={{ color: '#6b7280', marginBottom: 24 }}>{sessionCheckError}</p>
          <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 24 }}>
            This may be due to rate limiting or a network issue. The login cookie may not have been set correctly.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 20px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
            <button
              onClick={() => { setSessionCheckError(null); window.location.href = `/?workspace=${workspace}` }}
              style={{
                padding: '10px 20px',
                background: 'white',
                color: '#3b82f6',
                border: '1px solid #3b82f6',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              Go to Login
            </button>
          </div>
        </div>
      </Shell>
    )
  }

  if (!session && !checkingCookieSession) {
    return <Navigate to={`/?workspace=${encodeURIComponent(workspace)}${workspaceId ? `&workspace_id=${encodeURIComponent(workspaceId)}` : ''}`} replace />
  }

  if (!session) {
    return <Shell><div className="center-card"><Loader2 className="spinner" /><p>Checking session...</p></div></Shell>
  }

  const companyName = branding?.login_display_name || branding?.name || session.workspace
  const brandColor = branding?.brand_color || '#c96b8a'
  const brandLogo = resolveDemoAssetUrl(branding?.logo_url)
  const appIconSrc = resolveDemoAssetUrl(session.appIconUrl)
  const accentSoft = alphaColor(brandColor, 0.12)
  const accentMid = alphaColor(brandColor, 0.18)
  const accentStrong = alphaColor(brandColor, 0.26)
  const displayName = typeof session.userinfo.name === 'string'
    ? session.userinfo.name
    : typeof session.userinfo.email === 'string'
      ? session.userinfo.email
      : 'Rooiam User'
  const showDemoBadge = typeof session.userinfo.email === 'string' && session.userinfo.email.endsWith('.demo')
  const workspaceGuide = getWorkspaceGuide(session.workspace, {
    magic_link_enabled: true,
    google_enabled: false,
    microsoft_enabled: false,
    passkey_enabled: Boolean(passkeys.length || mfaStatus || true),
    mfa_required: false,
    demo_mode: true,
    demo_mailbox_url: null,
  }, typeof session.userinfo.email === 'string' ? session.userinfo.email : '')
  const securityBanner = getSecurityBanner(
    session.workspace,
    Boolean(mfaStatus?.totp_enabled ? false : ['mintmallow', 'moopizza'].includes(session.workspace.toLowerCase())),
    ['roochoco', 'melonhoneytoast', 'moopizza'].includes(session.workspace.toLowerCase()),
  )
  const runUserinfoRequest = async () => {
    if (!accessToken.trim()) {
      setUserinfoResponse({
        status: 0,
        body: JSON.stringify({
          error: 'Live userinfo request is only available immediately after sign-in in this demo tab.',
        }, null, 2),
      })
      return
    }
    setUserinfoLoading(true)
    try {
      const res = await fetch(`${getApiBase()}/identity/me`, {
        credentials: 'include',
      })
      const text = await res.text()
      let body = text
      try {
        body = JSON.stringify(JSON.parse(text), null, 2)
      } catch {
        body = text
      }
      setUserinfoResponse({ status: res.status, body })
    } catch (err) {
      setUserinfoResponse({
        status: 0,
        body: JSON.stringify(
          { error: err instanceof Error ? err.message : 'Request failed' },
          null,
          2,
        ),
      })
    } finally {
      setUserinfoLoading(false)
    }
  }

  const registerPasskey = async () => {
    setRegisteringPasskey(true)
    setSelfServiceError('')
    setSelfServiceNotice('')
    const apiBase = getApiBase()
    setPasskeyAddApiLog(makeLog('POST', `${apiBase}/webauthn/register/start`, {}, '…', '→ waiting for browser WebAuthn…'))
    try {
      if (!(window.PublicKeyCredential && navigator.credentials)) {
        throw new Error('This browser does not support passkeys.')
      }
      const parseCreationOptionsFromJSON = (window.PublicKeyCredential as unknown as {
        parseCreationOptionsFromJSON?: (options: unknown) => CredentialCreationOptions['publicKey']
      }).parseCreationOptionsFromJSON
      if (!parseCreationOptionsFromJSON) {
        throw new Error('This browser is missing the WebAuthn JSON helpers needed for registration.')
      }
      const start = await demoApi.startPasskeyRegistration()
      const publicKey = parseCreationOptionsFromJSON(start.creation_options.publicKey)
      const credential = await navigator.credentials.create({ publicKey })
      if (!credential) throw new Error('Passkey registration was cancelled.')
      const finishPayload = {
        challenge_id: start.challenge_id,
        name: passkeyName.trim() || 'My Device',
        credential: (credential as unknown as { toJSON: () => unknown }).toJSON(),
      }
      const result = await demoApi.finishPasskeyRegistration(finishPayload)
      setPasskeyAddApiLog(makeLog('POST', `${apiBase}/webauthn/register/finish`, finishPayload, '200 OK', JSON.stringify(result, null, 2)))
      setSelfServiceNotice('Passkey added.')
      await loadSelfService()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to register passkey.'
      setPasskeyAddApiLog(makeLog('POST', `${apiBase}/webauthn/register/start`, {}, '4xx Error', `Error: ${msg}`))
      setSelfServiceError(msg)
    } finally {
      setRegisteringPasskey(false)
    }
  }

  const removePasskey = async (id: string) => {
    setSelfServiceError('')
    setSelfServiceNotice('')
    const apiBase = getApiBase()
    setPasskeyRemoveApiLog(makeLog('DELETE', `${apiBase}/webauthn/passkeys/${id}`, null, '…', ''))
    try {
      const result = await demoApi.deletePasskey(id)
      setPasskeyRemoveApiLog(makeLog('DELETE', `${apiBase}/webauthn/passkeys/${id}`, null, '200 OK', JSON.stringify(result, null, 2)))
      setSelfServiceNotice('Passkey removed.')
      await loadSelfService()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to remove passkey.'
      setPasskeyRemoveApiLog(makeLog('DELETE', `${apiBase}/webauthn/passkeys/${id}`, null, '4xx Error', `Error: ${msg}`))
      setSelfServiceError(msg)
    }
  }

  const startTotpEnrollment = async () => {
    setTotpLoading(true)
    setSelfServiceError('')
    setSelfServiceNotice('')
    const apiBase = getApiBase()
    setMfaStartApiLog(makeLog('POST', `${apiBase}/mfa/totp/start`, {}, '…', '', { demo: true }))
    try {
      const result = await demoApi.startTotpEnrollment()
      setTotpChallengeId(result.challenge_id)
      setTotpSecret(result.secret)
      setTotpUri(result.otpauth_uri)
      setBackupCodes([])
      setMfaStartApiLog(makeLog('POST', `${apiBase}/mfa/totp/start`, {}, '200 OK', JSON.stringify(result, null, 2), { demo: true }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start TOTP setup.'
      setMfaStartApiLog(makeLog('POST', `${apiBase}/mfa/totp/start`, {}, '4xx Error', `Error: ${msg}`, { demo: true }))
      setSelfServiceError(msg)
    } finally {
      setTotpLoading(false)
    }
  }

  const finishTotpEnrollment = async () => {
    if (!totpChallengeId) return
    setTotpLoading(true)
    setSelfServiceError('')
    setSelfServiceNotice('')
    const apiBase = getApiBase()
    const payload = { challenge_id: totpChallengeId, code: totpCode }
    setMfaFinishApiLog(makeLog('POST', `${apiBase}/mfa/totp/finish`, payload, '…', '', { demo: true }))
    try {
      const result = await demoApi.finishTotpEnrollment(payload)
      setMfaFinishApiLog(makeLog('POST', `${apiBase}/mfa/totp/finish`, payload, '200 OK', JSON.stringify(result, null, 2), { demo: true }))
      setTotpChallengeId('')
      setTotpSecret('')
      setTotpUri('')
      setTotpQrCode('')
      setTotpCode('')
      setSelfServiceNotice('Authenticator app enabled.')
      await loadSelfService()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to verify the authenticator code.'
      setMfaFinishApiLog(makeLog('POST', `${apiBase}/mfa/totp/finish`, payload, '4xx Error', `Error: ${msg}`, { demo: true }))
      setSelfServiceError(msg)
    } finally {
      setTotpLoading(false)
    }
  }

  const disableTotp = async () => {
    setTotpLoading(true)
    setSelfServiceError('')
    setSelfServiceNotice('')
    const apiBase = getApiBase()
    setMfaDisableApiLog(makeLog('DELETE', `${apiBase}/mfa/totp`, null, '…', '', { demo: true }))
    try {
      const result = await demoApi.disableTotp()
      setMfaDisableApiLog(makeLog('DELETE', `${apiBase}/mfa/totp`, null, '200 OK', JSON.stringify(result, null, 2), { demo: true }))
      setTotpChallengeId('')
      setTotpSecret('')
      setTotpUri('')
      setTotpQrCode('')
      setTotpCode('')
      setBackupCodes([])
      setSelfServiceNotice('Authenticator app disabled.')
      await loadSelfService()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to disable the authenticator app.'
      setMfaDisableApiLog(makeLog('DELETE', `${apiBase}/mfa/totp`, null, '4xx Error', `Error: ${msg}`, { demo: true }))
      setSelfServiceError(msg)
    } finally {
      setTotpLoading(false)
    }
  }

  const regenerateBackupCodes = async () => {
    setTotpLoading(true)
    setSelfServiceError('')
    setSelfServiceNotice('')
    const apiBase = getApiBase()
    setMfaCodesApiLog(makeLog('POST', `${apiBase}/mfa/recovery-codes/regenerate`, {}, '…', '', { demo: true }))
    try {
      const result = await demoApi.regenerateRecoveryCodes()
      setMfaCodesApiLog(makeLog('POST', `${apiBase}/mfa/recovery-codes/regenerate`, {}, '200 OK', JSON.stringify(result, null, 2), { demo: true }))
      setBackupCodes(result.codes)
      setSelfServiceNotice('New backup codes generated.')
      await loadSelfService()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to regenerate backup codes.'
      setMfaCodesApiLog(makeLog('POST', `${apiBase}/mfa/recovery-codes/regenerate`, {}, '4xx Error', `Error: ${msg}`, { demo: true }))
      setSelfServiceError(msg)
    } finally {
      setTotpLoading(false)
    }
  }

  const revokeSession = async (id: string) => {
    setBusySessionId(id)
    setSelfServiceError('')
    setSelfServiceNotice('')
    const apiBase = getApiBase()
    setRevokeSessionApiLogs(m => new Map(m).set(id, makeLog('DELETE', `${apiBase}/identity/me/sessions/${id}`, null, '…', '')))
    try {
      const result = await demoApi.revokeSession(id)
      setRevokeSessionApiLogs(m => new Map(m).set(id, makeLog('DELETE', `${apiBase}/identity/me/sessions/${id}`, null, '200 OK', JSON.stringify(result, null, 2))))
      setRevokedSessionIds(s => new Set(s).add(id))
      setSelfServiceNotice('Session revoked.')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke the session.'
      setRevokeSessionApiLogs(m => new Map(m).set(id, makeLog('DELETE', `${apiBase}/identity/me/sessions/${id}`, null, '4xx Error', `Error: ${msg}`)))
      setSelfServiceError(msg)
    } finally {
      setBusySessionId('')
    }
  }

  const revokeOtherSessions = async () => {
    setBusySessionId('all')
    setSelfServiceError('')
    setSelfServiceNotice('')
    const apiBase = getApiBase()
    setRevokeOtherApiLog(makeLog('POST', `${apiBase}/identity/me/sessions/revoke-all`, {}, '…', ''))
    try {
      const result = await demoApi.revokeOtherSessions()
      setRevokeOtherApiLog(makeLog('POST', `${apiBase}/identity/me/sessions/revoke-all`, {}, '200 OK', JSON.stringify(result, null, 2)))
      setSelfServiceNotice(`Revoked ${result.revoked_count} other session${result.revoked_count === 1 ? '' : 's'}.`)
      await loadSelfService()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to revoke other sessions.'
      setRevokeOtherApiLog(makeLog('POST', `${apiBase}/identity/me/sessions/revoke-all`, {}, '4xx Error', `Error: ${msg}`))
      setSelfServiceError(msg)
    } finally {
      setBusySessionId('')
    }
  }

  const saveProfile = async () => {
    setProfileSaving(true)
    setSelfServiceError('')
    setSelfServiceNotice('')
    const apiBase = getApiBase()
    const payload = { display_name: profileName.trim() || null }
    setProfileApiLog(makeLog('PATCH', `${apiBase}/identity/me/profile`, payload, '…', ''))
    try {
      const result = await demoApi.updateProfile(payload)
      setProfileApiLog(makeLog('PATCH', `${apiBase}/identity/me/profile`, payload, '200 OK', JSON.stringify(result, null, 2)))
      setSelfServiceNotice('Profile updated.')
      await loadSelfService()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update the profile.'
      setProfileApiLog(makeLog('PATCH', `${apiBase}/identity/me/profile`, payload, '4xx Error', `Error: ${msg}`))
      setSelfServiceError(msg)
    } finally {
      setProfileSaving(false)
    }
  }

  const requestEmailChange = async () => {
    if (!pendingEmail.trim()) return
    setEmailSaving(true)
    setSelfServiceError('')
    setSelfServiceNotice('')
    const apiBase = getApiBase()
    const payload = { new_email: pendingEmail.trim() }
    setEmailApiLog(makeLog('POST', `${apiBase}/identity/me/email-change/request`, payload, '…', ''))
    try {
      const result = await demoApi.requestEmailChange(pendingEmail.trim())
      setEmailApiLog(makeLog('POST', `${apiBase}/identity/me/email-change/request`, payload, '200 OK', JSON.stringify(result, null, 2)))
      setSelfServiceNotice(result.message)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to request the email change.'
      setEmailApiLog(makeLog('POST', `${apiBase}/identity/me/email-change/request`, payload, '4xx Error', `Error: ${msg}`))
      setSelfServiceError(msg)
    } finally {
      setEmailSaving(false)
    }
  }

  return (
    <Shell brandColor={brandColor}>
      <div className="demo-dashboard">
        <section
          className="demo-brand-hero"
          style={{
            background: `linear-gradient(145deg, ${accentSoft}, rgba(255, 255, 255, 0.96) 45%, ${accentMid})`,
            borderColor: accentMid,
            boxShadow: `0 30px 60px ${accentSoft}`,
          }}
        >
          <div className="dashboard-header">
            <div>
              <div className="demo-company-row">
                {appIconSrc || brandLogo ? (
                  <div className="demo-company-logo" style={{ borderColor: accentMid, background: accentSoft, position: 'relative' }}>
                    <img src={appIconSrc || brandLogo} alt={session.appName} className="brand-mark" />
                    {showDemoBadge ? <DemoBadge className="demo-overlay-badge" /> : null}
                  </div>
                ) : null}
                <div>
                  <p className="eyebrow">Downstream app dashboard</p>
                  <h1>{session.appName}</h1>
                  <p className="login-loading-copy">Rooiam already authenticated the user. This page is now the app itself, signed in to {companyName}.</p>
                </div>
              </div>
              <div className="demo-chip-row">
                <span className="demo-app-chip" style={{ background: accentSoft, color: brandColor }}>
                  Authenticated by Rooiam
                </span>
                <span className="demo-app-chip demo-neutral-chip">OIDC Authorization Code + PKCE</span>
                <span className="demo-app-chip demo-neutral-chip">{session.workspace}</span>
                <span className="demo-app-chip demo-neutral-chip">
                  <ShieldCheck className="icon-sm" />
                  {typeof session.userinfo.email === 'string' ? session.userinfo.email : 'Authenticated'}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
              <button
                type="button"
                onClick={handleLogout}
                className="secondary-btn"
                disabled={loggingOut}
                style={{ borderColor: accentMid }}
              >
                <LogOut className="icon-sm" />
                {loggingOut ? 'Signing out…' : 'Sign out'}
              </button>
              <ApiPreview log={logoutApiPreview} defaultOpen={false} />
            </div>
          </div>

          <div className="demo-stats-grid">
            <div className="demo-stat-card" style={{ borderColor: accentMid, background: accentSoft }}>
              <p className="eyebrow">Signed in as</p>
              <p className="value">{displayName}</p>
            </div>
            <div className="demo-stat-card" style={{ borderColor: accentMid, background: 'rgba(255,255,255,0.82)' }}>
              <p className="eyebrow">Workspace</p>
              <p className="value">{companyName}</p>
            </div>
            <div className="demo-stat-card" style={{ borderColor: accentMid, background: 'rgba(255,255,255,0.82)' }}>
              <p className="eyebrow">App ID</p>
              <p className="value">{session.appId}</p>
            </div>
            <div className="demo-stat-card" style={{ borderColor: accentMid, background: 'rgba(255,255,255,0.82)' }}>
              <p className="eyebrow">Scope</p>
              <p className="value">{session.scope}</p>
            </div>
          </div>
        </section>

        <section className="detail-card demo-simple-card">
          <p className="eyebrow">App session summary</p>
          <div className="keyvals demo-tight-list">
            <div>
              <span>App state</span>
              <strong>The downstream app session is active for {session.appName}.</strong>
            </div>
            <div>
              <span>User</span>
              <strong>{displayName}</strong>
            </div>
            <div>
              <span>Workspace</span>
              <strong>{companyName}</strong>
            </div>
            <div>
              <span>Handoff</span>
              <strong>Rooiam authenticated the user, completed the OIDC redirect, and handed control back to this app dashboard.</strong>
            </div>
          </div>
        </section>

        <section className="security-banner-card" style={{ borderColor: accentMid, background: `linear-gradient(145deg, ${accentSoft}, rgba(255,255,255,0.96) 52%, ${accentMid})` }}>
          <div className="security-banner-copy">
            <p className="eyebrow">Security setup</p>
            <h2>{securityBanner.title}</h2>
            <p>{securityBanner.body}</p>
          </div>
          <div className="security-banner-meta">
            <div className="demo-chip-row">
              {securityBanner.chips.map(chip => (
                <span key={chip} className="demo-app-chip demo-neutral-chip">{chip}</span>
              ))}
            </div>
            <button
              type="button"
              className="secondary-btn"
              style={{ borderColor: accentMid }}
              onClick={() => {
                const section = document.querySelector('.self-service-card')
                section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
            >
              <ShieldCheck className="icon-sm" />
              Open Security
            </button>
          </div>
        </section>

        <a
          className="demo-portal-cta"
          href={`${getLoginBase()}/app?org=${encodeURIComponent(session.workspace)}&section=apps`}
          target="_blank"
          rel="noreferrer"
          style={{ borderColor: accentMid, background: `linear-gradient(135deg, ${accentSoft}, rgba(255,255,255,0.92))` }}
        >
          <div className="demo-portal-cta-text">
            <p className="demo-portal-cta-label">
              <Palette className="icon-sm" />
              Manage the app in the workspace console
            </p>
            <p className="demo-portal-cta-desc">
              Open the operator side in the configured hosted auth / tenant app to inspect the workspace app, branding, and login policy that this demo client is using.
            </p>
          </div>
          <ExternalLink className="icon-sm demo-portal-cta-arrow" />
        </a>

        <div className="demo-dashboard-grid">
          <section className="detail-card demo-simple-card">
            <p className="eyebrow">Redirect flow</p>
            <div className="keyvals demo-tight-list">
              <div>
                <span>Authorization code</span>
                <strong>{session.callbackCode.slice(0, 14)}...</strong>
              </div>
              <div>
                <span>State</span>
                <strong>{session.callbackState.slice(0, 14)}...</strong>
              </div>
              <div>
                <span>Redirect URI</span>
                <strong>{session.redirectUri}</strong>
              </div>
            </div>
          </section>

          <section className="detail-card demo-simple-card">
            <p className="eyebrow">Token exchange</p>
            <div className="keyvals demo-tight-list">
              <div>
                <span>Type</span>
                <strong>{session.tokenMeta.token_type}</strong>
              </div>
              <div>
                <span>Expires in</span>
                <strong>{session.tokenMeta.expires_in}s</strong>
              </div>
              <div>
                <span>ID token</span>
                <strong>{session.tokenMeta.has_id_token ? 'Issued' : 'Not issued'}</strong>
              </div>
            </div>
          </section>

          <section className="detail-card demo-simple-card">
            <p className="eyebrow">Userinfo claims</p>
            <div className="keyvals demo-tight-list">
              {Object.entries(session.userinfo).map(([key, value]) => (
                <div key={key}>
                  <span>{key}</span>
                  <strong>{String(value)}</strong>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16 }}>
              <ApiInspectorBlock
                label="Run live userinfo request"
                request={`curl ${getApiBase()}/identity/me \\\n  -H 'Authorization: Bearer ${accessToken}'`}
                onRun={accessToken ? runUserinfoRequest : undefined}
                response={userinfoResponse}
                loading={userinfoLoading}
              />
            </div>
          </section>

          <section className="detail-card demo-simple-card">
            <p className="eyebrow">App details</p>
            <div className="keyvals demo-tight-list">
              <div>
                <span>Workspace</span>
                <strong>{companyName}</strong>
              </div>
              <div>
                <span>App ID</span>
                <strong>{session.appId}</strong>
              </div>
              <div>
                <span>Token handling</span>
                <strong>Access token is kept only for the current sign-in tab and not shown in the dashboard.</strong>
              </div>
            </div>
            <div className="utility-btn-row">
              <button type="button" onClick={() => navigate(`/?workspace=${encodeURIComponent(session.workspace)}&workspace_id=${encodeURIComponent(session.workspaceId)}&app_id=${encodeURIComponent(session.appId)}`, { replace: true })} className="utility-btn">
                <ArrowRightLeft size={12} />
                Restart login flow
              </button>
              <button type="button" onClick={() => window.location.reload()} className="utility-btn">
                <RefreshCcw size={12} />
                Reload app
              </button>
              <button type="button" onClick={() => { navigator.clipboard.writeText(session.appId); setCopiedAppId(true); setTimeout(() => setCopiedAppId(false), 2000) }} className="utility-btn">
                {copiedAppId ? <Check size={12} /> : <KeyRound size={12} />}
                {copiedAppId ? 'Copied!' : 'Copy app ID'}
              </button>
            </div>
          </section>
        </div>

        <section className="detail-card demo-simple-card">
          <div className="self-service-header">
            <div>
              <p className="eyebrow">End-user self-service APIs</p>
              <p className="self-service-copy">This proves Rooiam is headless-capable. Developers can embed these exact UI controls (Passkeys, MFA, Profile, Devices) directly into their own applications instead of hosted portals.</p>
            </div>
            <button type="button" onClick={() => void loadSelfService()} className="secondary-btn" style={{ borderColor: accentMid }} disabled={selfServiceLoading}>
              <RefreshCcw className="icon-sm" />
              {selfServiceLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {selfServiceError ? <p className="self-service-alert is-error">{selfServiceError}</p> : null}
          {selfServiceNotice ? <p className="self-service-alert is-success">{selfServiceNotice}</p> : null}
          <div className="self-service-grid">
            <section className="self-service-card">
              <div className="self-service-card-header">
                <div>
                  <p className="eyebrow">Account</p>
                  <h3>Profile & sign-in methods</h3>
                </div>
                <Palette className="icon-sm" />
              </div>
              <div className="self-service-block">
                <p className="self-service-label">Display name</p>
                <div className="self-service-row">
                  <input
                    value={profileName}
                    onChange={event => setProfileName(event.target.value)}
                    className="self-service-input"
                    placeholder="Your display name"
                  />
                  <button type="button" className="secondary-btn" onClick={saveProfile} disabled={profileSaving}>
                    {profileSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
                <ApiPreview log={profileApiLog} />
              </div>
              <div className="self-service-block">
                <p className="self-service-label">Email</p>
                <div className="self-service-status">
                  <strong>{linkedAccounts?.primary_email || pendingEmail || 'No email on file'}</strong>
                  <span>Requesting a change sends a verification link to the new address.</span>
                </div>
                <div className="self-service-row">
                  <input
                    value={pendingEmail}
                    onChange={event => setPendingEmail(event.target.value)}
                    className="self-service-input"
                    placeholder="new@email.example"
                  />
                  <button type="button" className="secondary-btn" onClick={requestEmailChange} disabled={emailSaving || !pendingEmail.trim()}>
                    {emailSaving ? 'Sending…' : 'Change email'}
                  </button>
                </div>
                <ApiPreview log={emailApiLog} />
              </div>
              <div className="self-service-block">
                <p className="self-service-label">Linked sign-in methods</p>
                <div className="self-service-list">
                  <div className="self-service-item">
                    <div>
                      <strong>Magic link</strong>
                      <span>{linkedAccounts?.magic_link.enabled ? 'Available for this account' : 'Not available'}</span>
                    </div>
                  </div>
                  {linkedAccounts?.providers.map(provider => (
                    <div key={provider.provider} className="self-service-item">
                      <div>
                        <strong>{provider.provider[0].toUpperCase() + provider.provider.slice(1)}</strong>
                        <span>{provider.linked ? `Linked as ${provider.linked_email || 'connected account'}` : 'Not linked'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="self-service-card">
              <div className="self-service-card-header">
                <div>
                  <p className="eyebrow">Security</p>
                  <h3>Passkeys & MFA</h3>
                </div>
                <ShieldCheck className="icon-sm" />
              </div>
              <div className="self-service-block">
                <p className="self-service-label">Passkeys</p>
                <div className="self-service-row">
                  <input
                    value={passkeyName}
                    onChange={event => setPasskeyName(event.target.value)}
                    className="self-service-input"
                    placeholder="My Device"
                  />
                  <button type="button" className="secondary-btn" onClick={registerPasskey} disabled={registeringPasskey}>
                    {registeringPasskey ? 'Adding…' : 'Add passkey'}
                  </button>
                </div>
                <ApiPreview log={passkeyAddApiLog} />
                <div className="self-service-list">
                  {passkeys.length === 0 ? (
                    <p className="self-service-empty">No passkeys registered yet.</p>
                  ) : passkeys.map(passkey => (
                    <div key={passkey.id} className="self-service-item">
                      <div>
                        <strong>{passkey.name}</strong>
                        <span>Added {formatWhen(passkey.created_at)}{passkey.last_used_at ? ` · Last used ${formatWhen(passkey.last_used_at)}` : ''}</span>
                      </div>
                      <button type="button" className="secondary-btn" onClick={() => void removePasskey(passkey.id)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <ApiPreview log={passkeyRemoveApiLog} />
              </div>

              <div className="self-service-block">
                <p className="self-service-label">Authenticator app</p>
                <div className="self-service-status">
                  <strong>{mfaStatus?.totp_enabled ? 'Enabled' : 'Not enabled'}</strong>
                  <span>{mfaStatus ? `${mfaStatus.backup_codes_remaining} backup codes remaining` : 'Loading status…'}</span>
                </div>
                {!mfaStatus?.totp_enabled && !totpChallengeId ? (
                  <button type="button" className="secondary-btn" onClick={startTotpEnrollment} disabled={totpLoading}>
                    {totpLoading ? 'Preparing…' : 'Set up authenticator'}
                  </button>
                ) : null}
                <ApiPreview log={mfaStartApiLog} />
                {totpChallengeId ? (
                  <div className="self-service-enroll">
                    {totpQrCode ? (
                      <div className="self-service-qr">
                        <img src={totpQrCode} alt="QR code for authenticator app setup" />
                      </div>
                    ) : null}
                    <div className="self-service-code-block">
                      <span>Secret</span>
                      <strong>{totpSecret}</strong>
                    </div>
                    <div className="self-service-code-block">
                      <span>OTPAuth URI</span>
                      <strong>{totpUri}</strong>
                    </div>
                    <div className="self-service-row">
                      <input
                        value={totpCode}
                        onChange={event => setTotpCode(event.target.value)}
                        className="self-service-input"
                        placeholder="123456"
                      />
                      <button type="button" className="secondary-btn" onClick={finishTotpEnrollment} disabled={totpLoading || totpCode.trim().length < 6}>
                        {totpLoading ? 'Verifying…' : 'Verify code'}
                      </button>
                    </div>
                    <ApiPreview log={mfaFinishApiLog} />
                  </div>
                ) : null}
                {mfaStatus?.totp_enabled ? (
                  <div className="self-service-actions">
                    <button type="button" className="secondary-btn" onClick={regenerateBackupCodes} disabled={totpLoading}>
                      {totpLoading ? 'Working…' : 'Generate backup codes'}
                    </button>
                    <button type="button" className="secondary-btn" onClick={disableTotp} disabled={totpLoading}>
                      Disable MFA
                    </button>
                  </div>
                ) : null}
                <ApiPreview log={mfaCodesApiLog} />
                <ApiPreview log={mfaDisableApiLog} />
                {backupCodes.length > 0 ? (
                  <div className="self-service-code-list">
                    {backupCodes.map(code => <code key={code}>{code}</code>)}
                  </div>
                ) : null}
                <div className="self-service-help">
                  <strong>Recovery</strong>
                  <span>If you lose your passkey device, use Magic Link or a backup code. If MFA is required, keep backup codes somewhere safe before signing out.</span>
                </div>
              </div>
            </section>

            <section className="self-service-card">
              <div className="self-service-card-header">
                <div>
                  <p className="eyebrow">Sessions</p>
                  <h3>Active sessions</h3>
                </div>
                <Smartphone className="icon-sm" />
              </div>
              {sessions.length === 0 ? (
                <p className="self-service-empty">No active sessions found.</p>
              ) : <>
                {/* Current session */}
                <div className="self-service-list">
                  {sessions.filter(e => e.is_current).map(entry => (
                    <div key={entry.id} className="self-service-item">
                      <div>
                        <strong>Current session</strong>
                        <span>{describeSession(entry)}</span>
                        <span>{entry.ip || 'Unknown IP'} · Last seen {formatWhen(entry.last_seen_at)} · Expires {formatWhen(entry.expires_at)}</span>
                        <span>{entry.user_agent || 'Unknown device'}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Revoke other sessions — between current and the rest */}
                <div className="self-service-block">
                  <p className="self-service-label">All other sessions</p>
                  <button type="button" className="secondary-btn" onClick={revokeOtherSessions} disabled={busySessionId === 'all'}>
                    {busySessionId === 'all' ? 'Revoking…' : 'Revoke other sessions'}
                  </button>
                  <ApiPreview log={revokeOtherApiLog} />
                </div>
                {/* Other sessions */}
                <div className="self-service-list">
                  {sessions.filter(e => !e.is_current).map(entry => {
                    const isRevoked = revokedSessionIds.has(entry.id)
                    return (
                      <div key={entry.id} className="self-service-item" style={{ flexWrap: 'wrap', opacity: isRevoked ? 0.6 : 1 }}>
                        <div style={{ flex: '1 1 0', minWidth: 0 }}>
                          <strong>
                            {entry.login_app_name || 'Signed-in session'}
                            {isRevoked ? <span style={{ marginLeft: 8, fontSize: '0.72rem', fontWeight: 900, color: '#be123c', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 6, padding: '1px 6px' }}>Revoked</span> : null}
                          </strong>
                          <span>{describeSession(entry)}</span>
                          <span>{entry.ip || 'Unknown IP'} · Last seen {formatWhen(entry.last_seen_at)} · Expires {formatWhen(entry.expires_at)}</span>
                          <span>{entry.user_agent || 'Unknown device'}</span>
                        </div>
                        {!isRevoked ? (
                          <button type="button" className="secondary-btn" onClick={() => void revokeSession(entry.id)} disabled={busySessionId === entry.id}>
                            {busySessionId === entry.id ? 'Revoking…' : 'Revoke'}
                          </button>
                        ) : null}
                        {revokeSessionApiLogs.get(entry.id) ? (
                          <div style={{ width: '100%' }}>
                            <ApiPreview log={revokeSessionApiLogs.get(entry.id) ?? null} />
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </>}
            </section>

            <section className="self-service-card">
              <div className="self-service-card-header">
                <div>
                  <p className="eyebrow">Activity</p>
                  <h3>Recent account events</h3>
                </div>
                <Sparkles className="icon-sm" />
              </div>
              <div className="self-service-list">
                {auditLogs.length === 0 ? (
                  <p className="self-service-empty">No recent account activity.</p>
                ) : auditLogs.map(log => (
                  <div key={log.id} className="self-service-item is-log">
                    <div>
                      <strong>{formatAuditAction(log.action)}</strong>
                      <span>{describeAuditAction(log.action)}</span>
                      <span>{formatWhen(log.created_at)}</span>
                    </div>
                    <code>{log.target_type}</code>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <div className="post-login-guide">
            <div className="landing-summary-card">
              <span>Security summary</span>
              <ul className="landing-guide-list">
                <li>{linkedAccounts?.passkeys || 0} passkey{linkedAccounts?.passkeys === 1 ? '' : 's'} registered</li>
                <li>{mfaStatus?.totp_enabled ? 'Authenticator app enabled' : 'Authenticator app not enabled yet'}</li>
                <li>{mfaStatus ? `${mfaStatus.backup_codes_remaining} backup codes remaining` : 'Loading backup-code status'}</li>
                <li>{sessions.filter(item => !item.is_current).length} other active session{sessions.filter(item => !item.is_current).length === 1 ? '' : 's'}</li>
              </ul>
            </div>
            {workspaceGuide.afterLogin.map(section => (
              <div key={section.title} className="landing-summary-card">
                <span>{section.title}</span>
                <ul className="landing-guide-list">
                  {section.steps.map(step => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </Shell>
  )
}

type ApiLog = {
  method: string
  url: string
  reqHeaders: string
  reqBody?: string
  resStatus?: string
  resHeaders?: string
  resBody: string
  demo?: boolean
}

function ApiPreview({ log, defaultOpen = true }: { log: ApiLog | null; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => { if (log && defaultOpen) setOpen(true) }, [log])
  if (!log) return null
  return (
    <div className="api-preview">
      <button type="button" className="api-preview-toggle" onClick={() => setOpen(v => !v)}>
        <span>API</span>
        {open ? '▲ Hide' : '▼ Show'}
      </button>
      {open && (
        <div className="api-preview-body">
          <div className="api-preview-pane">
            <p className="api-preview-label">Request{log.demo ? ' · demo stub' : ''}</p>
            <pre className="api-preview-code">{log.method} {log.url}{'\n'}{log.reqHeaders}{log.reqBody ? '\n\n' + log.reqBody : ''}</pre>
          </div>
          <div className="api-preview-pane">
            <p className="api-preview-label">Response</p>
            <pre className="api-preview-code">{log.resStatus ? log.resStatus + '\n' : ''}{log.resHeaders ? log.resHeaders + '\n\n' : ''}{log.resBody}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

function AppEntryRedirect() {
  const location = useLocation()
  return <Navigate to={`/dashboard${location.search}`} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/callback" element={<Callback />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/app" element={<AppEntryRedirect />} />
    </Routes>
  )
}
