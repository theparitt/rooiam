import React, { useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronDown, ChevronUp, HelpCircle, KeyRound, Loader2, Mail } from 'lucide-react'
import { getApiBase, resolveApiAssetUrl } from '../lib/api-base'

// Apply transparent background immediately — before first paint — so the
// host page gradient shows through the card's rounded corners with no flash.
if (window.parent !== window) {
    document.body.classList.add('embedded')
}
import { resolveAuthRedirect } from '../lib/redirect'
import { getTenantContext } from '../lib/tenant-context'
import { DEFAULT_LOGIN_METHOD_ORDER, LoginMethodKey } from '../lib/portal-types'
import { normalizeLoginMethodOrder, radiusClass } from '../lib/login-style'
import LoginWidgetCore from '../components/portal/LoginWidgetCore'
import DemoBadge from '../components/DemoBadge'
import DemoLoginHint from '../components/DemoLoginHint'

type AuthMethods = {
    magic_link_enabled: boolean
    google_enabled: boolean
    microsoft_enabled: boolean
    passkey_enabled: boolean
    demo_mode: boolean
    demo_mailbox_url: string | null
}

type LoginBootstrapResponse = {
    auth: AuthMethods
    workspace: WorkspaceBranding | null
    app?: {
        client_id: string
        app_name: string
        redirect_uri: string
        widget_login_context: string | null
    } | null
}

type WorkspaceBranding = {
    slug: string
    name: string
    login_display_name: string | null
    login_title: string | null
    login_subtitle: string | null
    icon_url: string | null
    icon_container: string
    login_logo_url: string | null
    brand_color: string | null
    show_login_logo: boolean
    show_login_title: boolean
    show_login_subtitle: boolean
    show_powered_by: boolean
    widget_radius: string
    widget_shadow: string
    login_logo_container: string
    login_logo_size: string
    card_radius: string
    button_style: string
    card_bg_style: string
    card_bg_color2: string | null
    card_border_width: string
    card_border_color: string | null
    login_method_order: LoginMethodKey[]
}

export default function MagicLinkPage()
{
    const API = getApiBase()
    const isSeededDemoEmail = (value: string) =>
        [
            'admin@rooiam.demo',
            'rooroo@sweetfactory.demo',
            'minmin@lovechocolate.user',
            'lulu@softmallow.user',
            'sunny@toastgarden.user',
            'poppy@jamdiner.user',
            'mozza@cheesetown.user',
            'moomoo@whitebakery.demo',
        ].includes(value.trim().toLowerCase())
    const params = useMemo(() => new URLSearchParams(window.location.search), [])
    const [email, setEmail] = useState(() => params.get('email') || '')
    const [sent, setSent] = useState(false)
    const [loading, setLoading] = useState(false)
    const [passkeyLoading, setPasskeyLoading] = useState(false)
    const [mfaLoading, setMfaLoading] = useState(false)
    const [mfaCode, setMfaCode] = useState('')
    const [mfaChallengeId, setMfaChallengeId] = useState(params.get('mfa_challenge') || '')
    const [mfaRedirectUri, setMfaRedirectUri] = useState('')
    const [error, setError] = useState(() => params.get('error') || '')
    const [showMfaRecovery, setShowMfaRecovery] = useState(false)
    const [authMethods, setAuthMethods] = useState<AuthMethods>({
        magic_link_enabled: true,
        google_enabled: false,
        microsoft_enabled: false,
        passkey_enabled: true,
        demo_mode: false,
        demo_mailbox_url: null,
    })
    const [authMethodsError, setAuthMethodsError] = useState('')
    const [workspaceBranding, setWorkspaceBranding] = useState<WorkspaceBranding | null>(null)
    const [workspaceBrandingError, setWorkspaceBrandingError] = useState('')
    const [widgetLoginContext, setWidgetLoginContext] = useState<string | null>(null)

    const { appName, redirectUri, workspaceId, workspaceSlug } = getTenantContext(window.location.search)
    const clientId = params.get('client_id') || ''
    const tenantName = workspaceBranding?.login_display_name || workspaceBranding?.name || appName
    const tenantColor = workspaceBranding?.brand_color || '#8d72d9'
    const loginTitle = workspaceBranding?.login_title || 'Sign in or create account'
    const loginSubtitle = workspaceBranding?.login_subtitle || ''
    const loginLogoUrl = resolveApiAssetUrl(workspaceBranding?.login_logo_url || workspaceBranding?.icon_url || null)
    const workspaceOperatorLogoUrl = resolveApiAssetUrl(workspaceBranding?.icon_url || null)
    const showLogo = Boolean(workspaceBranding?.show_login_logo && loginLogoUrl)
    const showTitle = Boolean(workspaceBranding?.show_login_title)
    const showSubtitle = Boolean(workspaceBranding?.show_login_subtitle && loginSubtitle)
    const showPoweredBy = Boolean(workspaceBranding?.show_powered_by)
    const widgetRadiusClass = radiusClass(workspaceBranding?.widget_radius)
    const methodOrder = normalizeLoginMethodOrder(workspaceBranding?.login_method_order || [...DEFAULT_LOGIN_METHOD_ORDER])
    const usingTenantBranding = Boolean(workspaceBranding?.brand_color || workspaceBranding?.icon_url || workspaceBranding?.login_logo_url)

    useEffect(() =>
    {
        document.title = workspaceSlug
            ? `${tenantName} - Login`
            : 'Login · Rooiam'

        return () =>
        {
            document.title = 'Sign In · Rooiam'
        }
    }, [tenantName, workspaceSlug])

    const isEmbedded = window.parent !== window
    const loginSurface = isEmbedded ? 'user' : 'tenant'
    const postEmbedMessage = (type: string, payload: Record<string, unknown> = {}) =>
    {
        if (!isEmbedded) return
        window.parent.postMessage({ type, ...payload }, '*')
    }
    const postProgress = (message: string, detail?: string) =>
        postEmbedMessage('rooiam:iframe-progress', detail ? { message, detail } : { message })
    const showHeaderDemoBadge = !workspaceSlug && !isEmbedded && authMethods.demo_mode
    const showCardDemoBadge = authMethods.demo_mode && !showHeaderDemoBadge
    const isRootOperatorLogin = !workspaceSlug && !isEmbedded
    const isDirectWorkspaceLogin = Boolean(workspaceSlug) && !isEmbedded
    // Demo mapping for rooiam-app:
    // - root "/" shows workspace links only
    // - roochoco/mintmallow → rooroo@sweetfactory.demo
    // - melonhoneytoast/berryburger/moopizza → moomoo@whitebakery.demo
    // - platform admin uses rooiam-admin, not rooiam-app
    const demoTenantEmail = ['melonhoneytoast', 'berryburger', 'moopizza'].includes(workspaceSlug || '')
        ? 'moomoo@whitebakery.demo'
        : 'rooroo@sweetfactory.demo'
    const demoWorkspaceAdminEmail = workspaceSlug === 'roochoco'
        ? 'fondue@honeychoco.demo'
        : workspaceSlug === 'mintmallow'
            ? 'peppermint@mintmallow.demo'
            : ''
    const workspaceDemoAccounts = [
        { label: 'Workspace Owner', email: demoTenantEmail, onFillEmail: () => setEmail(demoTenantEmail) },
        ...(demoWorkspaceAdminEmail
            ? [{ label: 'Workspace Admin', email: demoWorkspaceAdminEmail, onFillEmail: () => setEmail(demoWorkspaceAdminEmail) }]
            : []),
    ]

    // When embedded in an iframe, report height to parent so it can resize.
    useEffect(() => {
        if (!isEmbedded) return
        const report = () => {
            postEmbedMessage('rooiam:iframe-height', { height: document.documentElement.scrollHeight })
        }
        const observer = new ResizeObserver(report)
        observer.observe(document.documentElement)
        report()
        return () => observer.disconnect()
    }, [isEmbedded])

    useEffect(() => {
        if (!isEmbedded) return

        const handleMessage = (event: MessageEvent) => {
            if (typeof event.data !== 'object' || event.data === null) return
            if (event.data.type !== 'rooiam-login-widget:prefill-email') return
            const nextEmail = typeof event.data.email === 'string' ? event.data.email.trim() : ''
            if (!nextEmail) return
            setError('')
            setSent(false)
            setEmail(nextEmail)
        }

        window.addEventListener('message', handleMessage)
        return () => window.removeEventListener('message', handleMessage)
    }, [isEmbedded])

    useEffect(() =>
    {
        let cancelled = false

        const preloadImage = async (url: string) =>
            await new Promise<void>((resolve) =>
            {
                const img = new Image()
                img.onload = () => resolve()
                img.onerror = () => resolve()
                img.src = url
            })

        const formatEnabledMethods = (methods: AuthMethods) =>
        {
            const enabled = [
                methods.magic_link_enabled ? 'magic link' : null,
                methods.passkey_enabled ? 'passkey' : null,
                methods.google_enabled ? 'google' : null,
                methods.microsoft_enabled ? 'microsoft' : null,
            ].filter(Boolean)

            return enabled.length > 0 ? enabled.join(', ') : 'none'
        }

        const loadLegacyLoginData = async () =>
        {
            const query = workspaceId
                ? `?workspace_id=${encodeURIComponent(workspaceId)}`
                : workspaceSlug
                    ? `?workspace=${encodeURIComponent(workspaceSlug)}`
                    : ''
            postProgress('Loading fallback auth methods...', workspaceId || workspaceSlug ? `workspace=${workspaceId || workspaceSlug}` : 'root login')
            const authRes = await fetch(`${API}/setup/auth-methods${query}`, {
                credentials: 'include',
            })
            const authData = await authRes.json().catch(() => ({}))
            if (!authRes.ok)
            {
                throw new Error(authData?.error?.message || 'Could not load available sign-in methods.')
            }

            let branding: WorkspaceBranding | null = null
            if (workspaceId || workspaceSlug) {
                postProgress('Loading fallback workspace branding...', `workspace=${workspaceId || workspaceSlug}`)
                const brandingQuery = workspaceId
                    ? `?workspace_id=${encodeURIComponent(workspaceId)}`
                    : `?slug=${encodeURIComponent(workspaceSlug)}`
                const brandingRes = await fetch(`${API}/orgs/public/branding${brandingQuery}`)
                const brandingData = await brandingRes.json().catch(() => ({}))
                if (!brandingRes.ok)
                {
                    throw new Error(brandingData?.error?.message || 'Could not load workspace branding.')
                }
                branding = {
                    ...brandingData,
                    login_method_order: normalizeLoginMethodOrder(brandingData.login_method_order),
                }
            }

            return {
                auth: {
                    magic_link_enabled: Boolean(authData.magic_link_enabled),
                    google_enabled: Boolean(authData.google_enabled),
                    microsoft_enabled: Boolean(authData.microsoft_enabled),
                    passkey_enabled: Boolean(authData.passkey_enabled),
                    demo_mode: Boolean(authData.demo_mode),
                    demo_mailbox_url: authData.demo_mailbox_url || null,
                },
                workspace: branding,
            } satisfies LoginBootstrapResponse
        }

        const loadLoginBootstrap = async () =>
        {
            try
            {
                // If the user already has a valid session (e.g. just returned from
                // demo OAuth or a magic-link verify), skip the login form entirely.
                // Only do this for top-level pages — not when embedded in an iframe,
                // where the parent app manages auth state via OIDC.
                if (!isEmbedded) {
                    const meRes = await fetch(`${API}/identity/me`, { credentials: 'include' })
                    if (meRes.ok && !cancelled) {
                        const dest = workspaceSlug
                            ? `/workspace/${workspaceSlug}`
                            : '/my'
                        window.location.replace(dest)
                        return
                    }
                }

                postProgress('Loading login bootstrap...', workspaceId || workspaceSlug ? `workspace=${workspaceId || workspaceSlug}` : 'root login')
                const bootstrapParams = new URLSearchParams()
                if (workspaceId) bootstrapParams.set('workspace_id', workspaceId)
                else if (workspaceSlug) bootstrapParams.set('workspace', workspaceSlug)
                if (clientId) bootstrapParams.set('client_id', clientId)
                if (isEmbedded) bootstrapParams.set('widget_embed_origin', window.location.origin)
                const query = bootstrapParams.toString() ? `?${bootstrapParams.toString()}` : ''
                const res = await fetch(`${API}/setup/login-bootstrap${query}`, {
                    credentials: 'include',
                })
                let data: LoginBootstrapResponse
                if (!res.ok)
                {
                    postProgress('Bootstrap unavailable, switching to fallback...', `status=${res.status}`)
                    data = await loadLegacyLoginData()
                } else {
                    data = await res.json().catch(() => ({})) as LoginBootstrapResponse
                    postProgress('Login bootstrap loaded', workspaceId || workspaceSlug ? 'source=bootstrap, workspace branding included' : 'source=bootstrap, root login')
                }

                if (cancelled) {
                    return
                }

                if (isEmbedded && clientId && !data.app?.widget_login_context) {
                    postProgress('Widget login context missing', 'client_id provided but no widget_login_context returned — check client registration and allowed_embed_origins')
                }
                setWidgetLoginContext(data.app?.widget_login_context ?? null)

                const auth = data.auth
                setAuthMethods({
                    magic_link_enabled: Boolean(auth?.magic_link_enabled),
                    google_enabled: Boolean(auth?.google_enabled),
                    microsoft_enabled: Boolean(auth?.microsoft_enabled),
                    passkey_enabled: Boolean(auth?.passkey_enabled),
                    demo_mode: Boolean(auth?.demo_mode),
                    demo_mailbox_url: auth?.demo_mailbox_url || null,
                })
                setAuthMethodsError('')
                postProgress('Auth methods ready', `enabled=${formatEnabledMethods({
                    magic_link_enabled: Boolean(auth?.magic_link_enabled),
                    google_enabled: Boolean(auth?.google_enabled),
                    microsoft_enabled: Boolean(auth?.microsoft_enabled),
                    passkey_enabled: Boolean(auth?.passkey_enabled),
                    demo_mode: Boolean(auth?.demo_mode),
                    demo_mailbox_url: auth?.demo_mailbox_url || null,
                })}${auth?.demo_mailbox_url ? `, mailbox=${auth.demo_mailbox_url}` : ''}`)

                if (data.workspace) {
                    setWorkspaceBranding({
                        ...data.workspace,
                        login_method_order: normalizeLoginMethodOrder(data.workspace.login_method_order),
                    })
                    const nextLogoUrl = data.workspace.show_login_logo
                        ? (data.workspace.login_logo_url || data.workspace.icon_url || '')
                        : ''
                    if (nextLogoUrl) {
                        postProgress('Loading company logo...', data.workspace.login_logo_url ? 'asset=login_logo_url' : 'asset=icon_url fallback')
                        await preloadImage(nextLogoUrl)
                    } else {
                        postProgress('Workspace branding ready', 'logo=none')
                    }
                } else {
                    setWorkspaceBranding(null)
                    postProgress('Root login ready', 'no workspace branding')
                }
                setWorkspaceBrandingError('')
                postProgress('Preparing secure sign-in...', workspaceId || workspaceSlug ? 'waiting for first render' : 'waiting for root widget render')
                requestAnimationFrame(() =>
                {
                    if (!cancelled) {
                        postEmbedMessage('rooiam:widget-ready')
                    }
                })
            } catch (err)
            {
                if (cancelled) {
                    return
                }

                const message = err instanceof Error ? err.message : 'Could not load login settings.'
                setAuthMethodsError(message)
                setWorkspaceBranding(null)
                setWorkspaceBrandingError(workspaceId || workspaceSlug ? message : '')
                postProgress('Showing login with degraded startup state', message)
                requestAnimationFrame(() => postEmbedMessage('rooiam:widget-ready'))
            }
        }

        void loadLoginBootstrap()
        return () => {
            cancelled = true
        }
    }, [API, workspaceId, workspaceSlug])

    const handleSend = async (e: React.FormEvent) =>
    {
        e.preventDefault()
        setLoading(true)
        setError('')
        try
        {
            const res = await fetch(`${API}/auth/magic-link/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, surface: loginSurface }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok)
            {
                if (res.status === 429) {
                    throw new Error("Too many sign-in requests. Please wait a few minutes before trying again.")
                }
                throw new Error(data?.error?.message || data?.message || 'Unable to send the magic link right now.')
            }
            setSent(true)
        } catch (err)
        {
            const message = err instanceof TypeError
                ? `Could not reach ${API}. Check VITE_API_URL, CORS, and whether the Rooiam API is running.`
                : err instanceof Error
                    ? err.message
                    : `Could not reach ${API}. Check VITE_API_URL, CORS, and whether the Rooiam API is running.`
            setError(message)
        } finally
        {
            setLoading(false)
        }
    }

    const handleOAuth = (provider: string) =>
    {
        // When embedded, OAuth must use widget_login_context so the server resolves
        // redirect_uri from the registered app config — never from the widget URL.
        if (isEmbedded && !widgetLoginContext) {
            setError('Login session not ready. Refresh and try again.')
            return
        }

        let endpoint: string
        if (authMethods.demo_mode) {
            const qs = new URLSearchParams({
                provider,
                redirect_uri: redirectUri,
                surface: loginSurface,
            })
            if (email.trim()) qs.set('email', email.trim())
            if (isEmbedded && widgetLoginContext) {
                qs.set('widget_login_context', widgetLoginContext)
            }
            endpoint = `${API}/oauth/demo?${qs.toString()}`
        } else {
            const qs = new URLSearchParams({ provider, surface: loginSurface })
            if (isEmbedded && widgetLoginContext) {
                qs.set('widget_login_context', widgetLoginContext)
                qs.set('widget_embed_origin', window.location.origin)
            } else {
                qs.set('redirect_uri', redirectUri)
            }
            endpoint = `${API}/oauth/login?${qs.toString()}`
        }

        // OAuth requires a full-page navigation (sets cookies, then redirects back).
        // When embedded in a cross-origin iframe, post a message to the parent and
        // let it do the top-level navigation.
        if (isEmbedded) {
            window.parent.postMessage({ type: 'rooiam:navigate', url: endpoint }, '*')
        } else {
            window.location.href = endpoint
        }
    }

    const handleMfaVerify = async (e?: React.FormEvent) =>
    {
        e?.preventDefault()
        setMfaLoading(true)
        setError('')
        try {
            const res = await fetch(`${API}/mfa/login/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ challenge_id: mfaChallengeId, code: mfaCode }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data?.error?.message || 'Invalid MFA code.')
            }

            window.location.href = resolveAuthRedirect(data.redirect_uri || mfaRedirectUri || redirectUri)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Invalid MFA code.')
        } finally {
            setMfaLoading(false)
        }
    }

    const handlePasskey = async () =>
    {
        setPasskeyLoading(true)
        setError('')
        let failureStage: 'start' | 'browser' | 'finish' = 'start'

        try
        {
            if (!email.trim()) {
                throw new Error('Enter your email first to use your passkey.')
            }

            if (authMethods.demo_mode && isSeededDemoEmail(email)) {
                const demoRes = await fetch(`${API}/webauthn/login/demo`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ email, redirect_uri: redirectUri, surface: loginSurface }),
                })

                const demoData = await demoRes.json().catch(() => ({}))
                if (!demoRes.ok) {
                    if (demoRes.status === 404) {
                        throw new Error('Demo passkey requires the updated server. Restart rooiam-server and try again.')
                    }
                    throw new Error(demoData?.error?.message || 'Demo passkey sign-in failed.')
                }

                if (demoData.mfa_enrollment_required && demoData.challenge_id) {
                    window.location.href = `/verify?mfa_enrollment_challenge=${encodeURIComponent(demoData.challenge_id)}&redirect_uri=${encodeURIComponent(redirectUri)}`
                    return
                }

                if (demoData.mfa_required) {
                    setMfaChallengeId(demoData.challenge_id)
                    setMfaRedirectUri(redirectUri)
                    return
                }

                window.location.href = resolveAuthRedirect(demoData.redirect_uri || redirectUri)
                return
            }

            if (!(window.PublicKeyCredential && navigator.credentials)) {
                throw new Error('This browser does not support passkeys.')
            }

            const parseRequestOptionsFromJSON = (window.PublicKeyCredential as unknown as {
                parseRequestOptionsFromJSON?: (options: unknown) => CredentialRequestOptions['publicKey']
            }).parseRequestOptionsFromJSON

            if (!parseRequestOptionsFromJSON) {
                throw new Error('This browser is missing the JSON WebAuthn helpers needed for passkey sign-in.')
            }

            const startRes = await fetch(`${API}/webauthn/login/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, redirect_uri: redirectUri, surface: loginSurface }),
            })

            const startData = await startRes.json().catch(() => ({}))
            if (!startRes.ok) {
                throw new Error(startData?.error?.message || 'Failed to start passkey sign-in.')
            }

            failureStage = 'browser'
            const publicKey = parseRequestOptionsFromJSON(startData.request_options.publicKey)
            const credential = await navigator.credentials.get({ publicKey })

            if (!credential) {
                throw new Error('Passkey sign-in was cancelled.')
            }

            failureStage = 'finish'
            const finishRes = await fetch(`${API}/webauthn/login/finish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    challenge_id: startData.challenge_id,
                    credential: (credential as unknown as { toJSON: () => unknown }).toJSON(),
                }),
            })
            const finishData = await finishRes.json().catch(() => ({}))
            if (!finishRes.ok) {
                throw new Error(finishData?.error?.message || 'Passkey sign-in failed.')
            }

            if (finishData.mfa_enrollment_required && finishData.challenge_id) {
                window.location.href = `/verify?mfa_enrollment_challenge=${encodeURIComponent(finishData.challenge_id)}&redirect_uri=${encodeURIComponent(redirectUri)}`
                return
            }

            if (finishData.mfa_required) {
                setMfaChallengeId(finishData.challenge_id)
                setMfaRedirectUri(redirectUri)
                return
            }

            window.location.href = resolveAuthRedirect(finishData.redirect_uri || redirectUri)
        } catch (err) {
            if (failureStage === 'browser') {
                void fetch(`${API}/webauthn/login/report-failure`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        email,
                        stage: 'browser',
                        reason: err instanceof Error ? err.message : 'Passkey sign-in failed in the browser.',
                    }),
                }).catch(() => undefined)
            }
            setError(err instanceof Error ? err.message : 'Passkey sign-in failed.')
        } finally {
            setPasskeyLoading(false)
        }
    }

    const rootLoginMethods = methodOrder.filter(method => {
        if (method === 'magic_link') return authMethods.magic_link_enabled
        if (method === 'passkey') return authMethods.passkey_enabled
        if (method === 'google') return authMethods.google_enabled
        if (method === 'microsoft') return authMethods.microsoft_enabled
        return false
    })

    const renderMethodButtons = (tone: 'root' | 'workspace') =>
        rootLoginMethods.map(method => {
            if (method === 'magic_link') {
                return (
                    <form key={method} onSubmit={handleSend}>
                        <button
                            type="submit"
                            disabled={loading || !email.trim()}
                            className={`flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-black shadow-sm transition-all hover:scale-[1.01] disabled:opacity-50 ${
                                tone === 'root'
                                    ? 'bg-gradient-to-r from-violet-300 to-fuchsia-300 text-violet-950'
                                    : 'text-white'
                            }`}
                            style={tone === 'workspace' ? { background: tenantColor } : undefined}
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send Magic Link'}
                        </button>
                    </form>
                )
            }
            if (method === 'passkey') {
                return (
                    <button
                        key={method}
                        type="button"
                        onClick={handlePasskey}
                        disabled={passkeyLoading}
                        className={`flex w-full items-center justify-center rounded-2xl border px-4 py-3 text-sm font-black transition-all hover:scale-[1.01] disabled:opacity-50 ${
                            tone === 'root'
                                ? 'border-violet-200 bg-white text-violet-700'
                                : 'border-gray-200 bg-white text-gray-700'
                        }`}
                    >
                        {passkeyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue With Passkey'}
                    </button>
                )
            }
            if (method === 'google') {
                return (
                    <button
                        key={method}
                        type="button"
                        onClick={() => handleOAuth('google')}
                        className="flex w-full items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-700 transition-all hover:scale-[1.01]"
                    >
                        Continue With Google
                    </button>
                )
            }
            if (method === 'microsoft') {
                return (
                    <button
                        key={method}
                        type="button"
                        onClick={() => handleOAuth('microsoft')}
                        className="flex w-full items-center justify-center rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-700 transition-all hover:scale-[1.01]"
                    >
                        Continue With Microsoft
                    </button>
                )
            }
            return null
        })

    return (
        <div className={isEmbedded ? 'p-[1px]' : 'min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden'}>
            {/* Blobs — hidden when embedded */}
            {!isEmbedded && <>
                <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full blur-3xl opacity-40 animate-float" style={{ background: usingTenantBranding ? `${tenantColor}55` : '#c8b4ff' }} />
                <div className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full blur-3xl opacity-30" style={{ background: usingTenantBranding ? `${tenantColor}33` : '#eadfff', animation: 'float 4s ease-in-out 1.5s infinite' }} />
            </>}

            <div className={isEmbedded ? 'w-full' : 'w-full max-w-sm relative z-10'}>
                {/* Rooiam wordmark — only when no workspace is selected and not embedded */}
                {!workspaceSlug && !isEmbedded ? (
                    <div className="flex justify-center mb-6 animate-fade-in">
                        <div className="relative inline-flex">
                            <img src="/rooiam-logo-wordmark-horizontal-purple.svg" alt="Rooiam" className="h-16 w-auto" />
                            {showHeaderDemoBadge ? <DemoBadge className="absolute -bottom-1 -right-2" /> : null}
                        </div>
                    </div>
                ) : null}

                {workspaceBrandingError && (
                    <p className="mb-4 text-xs font-bold text-amber-700 bg-amber-50 rounded-2xl px-4 py-2 text-center animate-fade-in">
                        {workspaceBrandingError}
                    </p>
                )}

                {mfaChallengeId ? (
                    <LoginWidgetCore
                        branding={{
                            companyName: tenantName,
                            brandColor: workspaceBranding?.brand_color,
                            showLogo: false,
                            showTitle: false,
                            showSubtitle: false,
                            showPoweredBy: false,
                            widgetRadius: workspaceBranding?.widget_radius,
                            widgetShadow: workspaceBranding?.widget_shadow,
                            cardRadius: workspaceBranding?.card_radius,
                            cardBgStyle: workspaceBranding?.card_bg_style,
                            cardBgColor2: workspaceBranding?.card_bg_color2,
                            cardBorderWidth: workspaceBranding?.card_border_width,
                            cardBorderColor: workspaceBranding?.card_border_color,
                            usingTenantBranding,
                        }}
                        methods={{ magic_link: false, passkey: false, google: false, microsoft: false }}
                        methodOrder={[]}
                        interactive={false}
                    >
                        <form onSubmit={handleMfaVerify} className="space-y-4">
                            <div className="text-center">
                                <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center bg-emerald-50">
                                    <svg viewBox="0 0 24 24" className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M12 3l7 3v6c0 4.5-2.8 7.9-7 9-4.2-1.1-7-4.5-7-9V6l7-3z" />
                                        <path d="M9.5 12.5l1.8 1.8 3.2-4" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-black text-gray-800 mb-2">Enter your MFA code</h3>
                                <p className="text-sm font-semibold text-gray-500">
                                    Enter the 6-digit authenticator code or one of your backup codes.
                                </p>
                            </div>
                            <input
                                type="text"
                                inputMode="text"
                                placeholder="123456 or ABCD-EFGH"
                                value={mfaCode}
                                onChange={e => setMfaCode(e.target.value.toUpperCase().slice(0, 9))}
                                className={`w-full px-4 py-3 bg-gray-50 border border-gray-200 text-center tracking-[0.2em] text-lg font-black outline-none ${widgetRadiusClass}`}
                            />
                            {error && (
                                <p className="text-xs font-bold text-red-400 bg-red-50 rounded-2xl px-4 py-2">{error}</p>
                            )}
                            <button
                                type="submit"
                                disabled={mfaLoading || mfaCode.trim().length < 6}
                                className={`w-full flex items-center justify-center gap-2 py-3 font-black text-sm transition-all hover:scale-[1.02] disabled:opacity-50 shadow-md ${widgetRadiusClass}`}
                                style={
                                    usingTenantBranding
                                        ? workspaceBranding?.button_style === 'outline'
                                            ? { background: 'white', color: tenantColor, border: `1px solid ${tenantColor}` }
                                            : { background: tenantColor, color: '#ffffff' }
                                        : { background: 'linear-gradient(135deg, #af9af5, #d5c0ff)', color: '#41246f' }
                                }
                            >
                                {mfaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify MFA'}
                            </button>

                            {/* Account recovery toggle */}
                            <button
                                type="button"
                                onClick={() => setShowMfaRecovery(prev => !prev)}
                                className="w-full flex items-center justify-center gap-2 py-2 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <HelpCircle className="w-3.5 h-3.5" />
                                Can't access your authenticator?
                                {showMfaRecovery ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>

                            {showMfaRecovery && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-left space-y-3">
                                    <p className="text-xs font-black text-amber-800">Account Recovery Options</p>
                                    <div className="space-y-2">
                                        <div className="flex gap-2">
                                            <span className="text-xs font-black text-amber-700 shrink-0">1.</span>
                                            <p className="text-xs font-semibold text-amber-700">
                                                <strong>Use a backup code.</strong> Enter one of the codes you saved when setting up MFA. They look like <code className="font-mono bg-amber-100 px-1 rounded">ABCD-EFGH</code>. Each code works once.
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <span className="text-xs font-black text-amber-700 shrink-0">2.</span>
                                            <p className="text-xs font-semibold text-amber-700">
                                                <strong>Lost your phone and all backup codes?</strong> Contact your workspace administrator to clear your MFA enrollment so you can sign in again.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </form>
                    </LoginWidgetCore>
                ) : !sent ? (
                    <>
                    <div className="animate-slide-up">
                        {isRootOperatorLogin ? (
                            <div className="glass-card rounded-4xl p-8 shadow-xl">
                                <div className="text-center mb-6">
                                    <p className="text-sm font-semibold text-gray-400">
                                        Tenant Login · Secure Access
                                    </p>
                                </div>
                                <h2 className="text-xl font-bold text-center mb-6">
                                    Sign in with ✨ Magic Link
                                </h2>
                                <form onSubmit={handleSend} className="space-y-4">
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'hsl(var(--muted-foreground))' }} />
                                        <input
                                            type="email"
                                            placeholder="your@email.com"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            className="w-full pl-11 pr-4 py-3 rounded-2xl text-sm font-medium outline-none transition-all"
                                            style={{
                                                background: 'hsl(var(--muted))',
                                                border: '1.5px solid hsl(var(--border))',
                                            }}
                                            required
                                            autoFocus
                                        />
                                    </div>
                                    {error && (
                                        <p className="text-xs font-semibold px-4 py-2 rounded-2xl" style={{ color: '#ef4444', background: '#fef2f2' }}>
                                            {error}
                                        </p>
                                    )}
                                    <button
                                        type="submit"
                                        disabled={loading || !email}
                                        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-all hover:scale-[1.02] disabled:opacity-50 shadow-md"
                                        style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
                                    >
                                        {loading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <>Send Magic Link <ArrowRight className="w-4 h-4" /></>
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handlePasskey}
                                        disabled={passkeyLoading || !email.trim()}
                                        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm border-2 border-gray-100 hover:bg-gray-50 transition-all disabled:opacity-50"
                                    >
                                        {passkeyLoading ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <>
                                                <KeyRound className="w-4 h-4" />
                                                Continue with Passkey
                                            </>
                                        )}
                                    </button>
                                </form>
                                {(authMethods.google_enabled || authMethods.microsoft_enabled) && (
                                    <div className="pt-3 space-y-3">
                                            {authMethods.google_enabled && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleOAuth('google')}
                                                    className="w-full py-3 rounded-2xl font-bold text-sm border-2 border-gray-100 hover:bg-gray-50 transition-all"
                                                >
                                                    Continue with Google
                                                </button>
                                            )}
                                            {authMethods.microsoft_enabled && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleOAuth('microsoft')}
                                                    className="w-full py-3 rounded-2xl font-bold text-sm border-2 border-gray-100 hover:bg-gray-50 transition-all"
                                                >
                                                    Continue with Microsoft
                                                </button>
                                            )}
                                        </div>
                                )}
                                {authMethodsError && (
                                    <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700">{authMethodsError}</p>
                                )}
                            </div>
                        ) : isDirectWorkspaceLogin ? (
                            <div className="glass-card overflow-hidden rounded-3xl border border-white/70 bg-white/88 shadow-xl backdrop-blur-xl">
                                <div className="px-6 pb-5 pt-6 sm:px-7">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-3">
                                                <img src="/rooiam-logo-wordmark-horizontal-pink.svg" alt="Rooiam" className="h-6 w-auto shrink-0" />
                                            </div>
                                            <div className="mt-4 flex items-center gap-4">
                                                {workspaceOperatorLogoUrl ? (
                                                    <img
                                                        src={workspaceOperatorLogoUrl}
                                                        alt={tenantName}
                                                        className="h-24 w-24 shrink-0 rounded-full border border-white bg-white object-cover shadow-sm"
                                                    />
                                                ) : null}
                                                <div className="min-w-0 flex-1">
                                                    <h2 className="text-2xl font-black text-gray-900">{tenantName}</h2>
                                                    <p className="mt-1 text-sm font-medium text-gray-500">
                                                        For workspace owners and admins.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        {showCardDemoBadge ? <DemoBadge /> : null}
                                    </div>
                                </div>
                                <div className="border-t border-gray-100 px-6 py-5 sm:px-7">
                                    <label className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: tenantColor }}>
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        placeholder="you@company.com"
                                        className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-800 outline-none focus:ring-2"
                                        style={{ boxShadow: 'none' }}
                                    />
                                    <div className="mt-4 space-y-2.5">
                                        {renderMethodButtons('workspace')}
                                    </div>
                                    {error && (
                                        <p className="mt-3 rounded-2xl bg-red-50 px-4 py-3 text-xs font-bold text-red-500">{error}</p>
                                    )}
                                    {authMethodsError && (
                                        <p className="mt-3 rounded-2xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700">{authMethodsError}</p>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <>
                                <LoginWidgetCore
                                    branding={{
                                        companyName: tenantName,
                                        logoUrl: loginLogoUrl,
                                        brandColor: workspaceBranding?.brand_color,
                                        showLogo,
                                        showTitle,
                                        showSubtitle,
                                        showPoweredBy,
                                        loginTitle,
                                        loginSubtitle,
                                        widgetRadius: workspaceBranding?.widget_radius,
                                        widgetShadow: workspaceBranding?.widget_shadow,
                                        loginLogoContainer: workspaceBranding?.login_logo_container,
                                        loginLogoSize: workspaceBranding?.login_logo_size,
                                        cardRadius: workspaceBranding?.card_radius,
                                        buttonStyle: workspaceBranding?.button_style,
                                        cardBgStyle: workspaceBranding?.card_bg_style,
                                        cardBgColor2: workspaceBranding?.card_bg_color2,
                                        cardBorderWidth: workspaceBranding?.card_border_width,
                                        cardBorderColor: workspaceBranding?.card_border_color,
                                        usingTenantBranding,
                                        showDemoBadge: showCardDemoBadge,
                                    }}
                                    methods={{
                                        magic_link: authMethods.magic_link_enabled,
                                        passkey: authMethods.passkey_enabled,
                                        google: authMethods.google_enabled,
                                        microsoft: authMethods.microsoft_enabled,
                                    }}
                                    methodOrder={methodOrder}
                                    interactive={true}
                                    handlers={{
                                        email,
                                        setEmail,
                                        loading,
                                        passkeyLoading,
                                        onMagicLink: handleSend,
                                        onPasskey: handlePasskey,
                                        onGoogle: () => handleOAuth('google'),
                                        onMicrosoft: () => handleOAuth('microsoft'),
                                    }}
                                    error={error}
                                    showMagicLinkUnavailable={!authMethods.magic_link_enabled}
                                />
                                {authMethodsError && (
                                    <p className="mt-3 text-xs font-bold text-amber-700 bg-amber-50 rounded-2xl px-4 py-3">
                                        {authMethodsError}
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                    {authMethods.demo_mode && authMethods.magic_link_enabled && !isEmbedded ? (
                        workspaceSlug ? (
                            <DemoLoginHint
                                title="Try demo workspace"
                                accounts={workspaceDemoAccounts}
                                accentColor={tenantColor}
                                showPasskey={authMethods.passkey_enabled}
                                mailboxUrl={authMethods.demo_mailbox_url}
                            />
                        ) : (
                            <div
                                className="mt-4 rounded-2xl border px-4 py-3 text-left text-xs"
                                style={{ borderColor: '#c4b5fd', background: '#f5f3ff' }}
                            >
                                <p className="mb-2 font-black text-violet-700">Try demo tenant login</p>
                                <ol className="space-y-0.5 font-medium leading-5 text-gray-600">
                                    <li>
                                        1. Click{' '}
                                        <button
                                            type="button"
                                            onClick={() => setEmail(demoTenantEmail)}
                                            className="font-black underline text-violet-700"
                                        >
                                            {demoTenantEmail}
                                        </button>
                                    </li>
                                    <li>2. Click <strong className="text-gray-700">Send Magic Link</strong> or <strong className="text-gray-700">Passkey</strong></li>
                                    <li>3. Switch workspaces after signing in</li>
                                </ol>
                            </div>
                        )
                    ) : null}
                    </>
                ) : (
                    <div className="glass-card p-7 animate-slide-up rounded-3xl shadow-xl text-center py-9 animate-fade-in">
                        <div className="text-5xl mb-4">💌</div>
                        <h3 className="text-xl font-black text-gray-800 mb-2">Magic link sent!</h3>
                        <p className="text-sm font-semibold text-gray-500 mb-1">Check <span className="text-gray-800">{email}</span></p>
                        <p className="text-xs text-gray-400 font-medium mb-4">Link expires in 15 minutes</p>
                        {authMethods.demo_mode && authMethods.demo_mailbox_url ? (
                            <a
                                href={authMethods.demo_mailbox_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mb-3 flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-sm font-black transition-all hover:scale-[1.02] shadow-sm"
                                style={{ background: 'linear-gradient(135deg, #FFB5C8, #D5B7FF)', color: '#5a2d3f' }}
                            >
                                Open Mailhog Inbox →
                            </a>
                        ) : null}
                        <div className="flex items-center justify-center gap-2 text-xs font-bold text-gray-400 bg-gray-50 rounded-2xl px-4 py-3">
                            <Loader2 className="w-3 h-3 animate-spin" /> Waiting for verification…
                        </div>
                        <button
                            type="button"
                            onClick={() => { setSent(false); setEmail('') }}
                            className="mt-4 text-xs font-bold text-gray-400 hover:text-gray-700 transition-colors underline"
                        >
                            Try different email
                        </button>
                    </div>
                )}

            </div>
        </div>
    )
}
