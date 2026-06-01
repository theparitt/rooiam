import React, { useEffect, useMemo } from 'react'
import { ArrowLeft, Copy, Plus } from 'lucide-react'
import PortalCodeBlockField from '../../components/portal/PortalCodeBlockField'
import PortalContentCard from '../../components/portal/PortalContentCard'
import PortalCreateFormLayout from '../../components/portal/PortalCreateFormLayout'
import PortalFormField from '../../components/portal/PortalFormField'
import PortalInlineMessage from '../../components/portal/PortalInlineMessage'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalSelectField from '../../components/portal/PortalSelectField'
import PortalSecondaryActionButton from '../../components/portal/PortalSecondaryActionButton'
import PortalSectionCard from '../../components/portal/PortalSectionCard'
import PortalSaveActionFooter from '../../components/portal/PortalSaveActionFooter'
import PortalStatTile from '../../components/portal/PortalStatTile'
import PortalTextareaField from '../../components/portal/PortalTextareaField'
import { APP_LABEL } from '../../lib/domain-labels'

function isLoopbackHostname(hostname: string) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function isSecureOrLoopbackUrl(value: string) {
    try {
        const parsed = new URL(value)
        return parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname))
    } catch {
        return false
    }
}

function isValidOriginValue(value: string) {
    try {
        const parsed = new URL(value)
        return parsed.origin === value && (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname)))
    } catch {
        return false
    }
}

type Props = {
    demoMode?: boolean
    canManageApps: boolean
    currentAppCount: number
    maxAppsPerWorkspace: number | null
    maxRedirectUrisPerApp: number | null
    maxAllowedEmbedOriginsPerApp: number | null
    newAppName: string
    setNewAppName: (v: string) => void
    newAppType: string
    setNewAppType: (v: string) => void
    newAppRedirects: string
    setNewAppRedirects: (v: string) => void
    newAppAllowedEmbedOrigins: string
    setNewAppAllowedEmbedOrigins: (v: string) => void
    newAppConfirmMultiOrigin: boolean
    setNewAppConfirmMultiOrigin: (v: boolean) => void
    creatingApp: boolean
    appMessage: string
    newAppSecret: string | null
    setNewAppSecret: (v: string | null) => void
    rotatedAppSecret: { clientId: string; clientSecret: string } | null
    setRotatedAppSecret: (v: { clientId: string; clientSecret: string } | null) => void
    onCreateApp: (e: React.FormEvent) => void
    onBack: () => void
}

export default function PortalWorkspaceRegisterApp({
    demoMode = false,
    canManageApps,
    currentAppCount,
    maxAppsPerWorkspace,
    maxRedirectUrisPerApp,
    maxAllowedEmbedOriginsPerApp,
    newAppName,
    setNewAppName,
    newAppType,
    setNewAppType,
    newAppRedirects,
    setNewAppRedirects,
    newAppAllowedEmbedOrigins,
    setNewAppAllowedEmbedOrigins,
    newAppConfirmMultiOrigin,
    setNewAppConfirmMultiOrigin,
    creatingApp,
    appMessage,
    newAppSecret,
    setNewAppSecret,
    rotatedAppSecret,
    setRotatedAppSecret,
    onCreateApp,
    onBack,
}: Props) {
    const inputClass = 'w-full px-4 py-3 bg-muted/50 border border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all'
    const workspaceAppLimitReached = typeof maxAppsPerWorkspace === 'number' && currentAppCount >= maxAppsPerWorkspace
    const redirectUriCount = useMemo(
        () => newAppRedirects.split('\n').map(value => value.trim()).filter(Boolean).length,
        [newAppRedirects],
    )
    const allowedEmbedOriginCount = useMemo(
        () => newAppAllowedEmbedOrigins.split('\n').map(value => value.trim()).filter(Boolean).length,
        [newAppAllowedEmbedOrigins],
    )
    const redirectUriLimitReached = typeof maxRedirectUrisPerApp === 'number' && redirectUriCount > maxRedirectUrisPerApp
    const allowedEmbedOriginLimitReached =
        typeof maxAllowedEmbedOriginsPerApp === 'number' && allowedEmbedOriginCount > maxAllowedEmbedOriginsPerApp
    const suggestedEmbedOrigins = useMemo(() => {
        const origins = new Set<string>()
        for (const raw of newAppRedirects.split('\n')) {
            const value = raw.trim()
            if (!value) continue
            try {
                origins.add(new URL(value).origin)
            } catch {
                continue
            }
        }
        return Array.from(origins)
    }, [newAppRedirects])
    const normalizedAllowedEmbedOrigins = useMemo(
        () => newAppAllowedEmbedOrigins.split('\n').map(value => value.trim()).filter(Boolean),
        [newAppAllowedEmbedOrigins],
    )
    const invalidRedirectUris = useMemo(
        () => newAppRedirects.split('\n').map(value => value.trim()).filter(Boolean).filter(value => {
            try {
                new URL(value)
                return false
            } catch {
                return true
            }
        }),
        [newAppRedirects],
    )
    const insecureRedirectUris = useMemo(
        () => newAppRedirects.split('\n').map(value => value.trim()).filter(Boolean).filter(value => {
            try {
                return !isSecureOrLoopbackUrl(value)
            } catch {
                return false
            }
        }),
        [newAppRedirects],
    )
    const invalidAllowedEmbedOrigins = useMemo(
        () => normalizedAllowedEmbedOrigins.filter(value => !isValidOriginValue(value)),
        [normalizedAllowedEmbedOrigins],
    )
    const missingSuggestedOrigins = useMemo(
        () => suggestedEmbedOrigins.filter(origin => !normalizedAllowedEmbedOrigins.includes(origin)),
        [normalizedAllowedEmbedOrigins, suggestedEmbedOrigins],
    )
    const requiresMultiOriginConfirmation = suggestedEmbedOrigins.length > 1 || new Set(normalizedAllowedEmbedOrigins).size > 1

    useEffect(() => {
        if (!requiresMultiOriginConfirmation) {
            setNewAppConfirmMultiOrigin(false)
        }
    }, [requiresMultiOriginConfirmation, setNewAppConfirmMultiOrigin])

    const applySuggestedEmbedOrigins = () => {
        if (missingSuggestedOrigins.length === 0) return
        const next = [...normalizedAllowedEmbedOrigins, ...missingSuggestedOrigins]
        setNewAppAllowedEmbedOrigins(next.join('\n'))
    }

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader
                eyebrow="Workspace"
                title={`Register ${APP_LABEL}`}
                description="Create a new app registration for this workspace."
                actions={(
                    <PortalSecondaryActionButton
                        label="Back to Apps"
                        icon={ArrowLeft}
                        onClick={onBack}
                    />
                )}
            />

            <PortalContentCard
                title={`About ${APP_LABEL} Registration`}
                subtitle="Register a workspace app to issue a client ID, redirect URIs, and workspace-scoped audit events."
                icon={Plus}
            >
                <div className="grid gap-4 sm:grid-cols-3">
                    <PortalStatTile
                        label="Current Apps"
                        value={currentAppCount}
                        className="bg-blue-50 border-blue-200 text-blue-900"
                    />
                    <PortalStatTile
                        label="Workspace Limit"
                        value={typeof maxAppsPerWorkspace === 'number' ? maxAppsPerWorkspace : 'Unlimited'}
                        className="bg-violet-50 border-violet-200 text-violet-900"
                    />
                    <PortalStatTile
                        label="Confidential Secret"
                        value="Web Only"
                        description="Only web apps receive a client secret."
                        className="bg-amber-50 border-amber-200 text-amber-900"
                    />
                </div>
            </PortalContentCard>

            <PortalSectionCard icon={Plus} title={`Register ${APP_LABEL}`} subtitle="Choose the app type, then add the callback URLs and embed origins the app is allowed to use." className="rounded-4xl">
                <div id="register-app-form" className="space-y-5">
                    {demoMode ? (
                        <PortalInlineMessage tone="warning">
                            App registration is read-only in demo mode so seeded OAuth apps remain stable.
                        </PortalInlineMessage>
                    ) : !canManageApps ? (
                        <PortalInlineMessage tone="info">
                            You can view this page, but you do not have permission to register apps in this workspace.
                        </PortalInlineMessage>
                    ) : null}
                    {typeof maxAppsPerWorkspace === 'number' ? (
                        <PortalInlineMessage tone={workspaceAppLimitReached ? 'warning' : 'info'}>
                            {workspaceAppLimitReached
                                ? `This workspace already has ${currentAppCount} apps and has reached the limit of ${maxAppsPerWorkspace}.`
                                : `This workspace can register up to ${maxAppsPerWorkspace} apps. ${currentAppCount} currently exist.`}
                        </PortalInlineMessage>
                    ) : null}

                    <form onSubmit={onCreateApp} className="space-y-5">
                        <PortalCreateFormLayout
                            title="App Configuration"
                            subtitle="Define the app identity first, then add the app callback URLs and the website origins that are allowed to embed the hosted widget."
                        >
                            <PortalContentCard title="App Details" subtitle="Start with the identity and app type.">
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <PortalFormField
                                        label="App Name"
                                        hint="This name is shown in the workspace app inventory and audit logs."
                                    >
                                        <input
                                            type="text"
                                            value={newAppName}
                                            onChange={e => setNewAppName(e.target.value)}
                                            placeholder="Acme Web App"
                                            required
                                            className={inputClass}
                                        />
                                    </PortalFormField>
                                    <PortalFormField
                                        label="App Type"
                                        hint="Not sure? Most frontend-only apps are SPA. Backend apps that can keep a secret are Web."
                                    >
                                        <PortalSelectField value={newAppType} onChange={setNewAppType}>
                                            <option value="spa">SPA — Single-Page App (no secret)</option>
                                            <option value="web">Web — Server-side App (client secret)</option>
                                            <option value="native">Native — Mobile / Desktop App (no secret)</option>
                                        </PortalSelectField>
                                        <div className="mt-2 rounded-2xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
                                            {newAppType === 'spa' && (
                                                <>
                                                    <p className="font-bold text-foreground">Single-Page Application (SPA)</p>
                                                    <p>React, Vue, Angular, or any frontend app running in the browser. Uses PKCE — no client secret needed because the code runs on the user's device.</p>
                                                </>
                                            )}
                                            {newAppType === 'web' && (
                                                <>
                                                    <p className="font-bold text-foreground">Web Application (Server-side)</p>
                                                    <p>Traditional server-rendered apps (Next.js SSR, Django, Rails, Laravel, etc.) that can securely store a client secret on the server. A secret will be generated for you.</p>
                                                </>
                                            )}
                                            {newAppType === 'native' && (
                                                <>
                                                    <p className="font-bold text-foreground">Native Application (Mobile / Desktop)</p>
                                                    <p>iOS, Android, React Native, Flutter, Electron, or any app installed on a user's device. Uses PKCE — no client secret because the app binary is not a safe place to store secrets.</p>
                                                </>
                                            )}
                                        </div>
                                    </PortalFormField>
                                </div>
                            </PortalContentCard>

                            <PortalContentCard title="Redirect URIs and Embed Origins" subtitle="Redirect URIs are exact app callback URLs. Embed origins are the website origins allowed to load the hosted widget. If one app supports multiple origins, Rooiam matches the current embedding site to the registered callback with the same origin.">
                                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                                    <PortalInlineMessage tone={redirectUriLimitReached ? 'warning' : 'info'}>
                                        {typeof maxRedirectUrisPerApp === 'number'
                                            ? `${redirectUriCount} / ${maxRedirectUrisPerApp} redirect URIs for this app.`
                                            : `${redirectUriCount} redirect URIs for this app.`}
                                    </PortalInlineMessage>
                                    <PortalInlineMessage tone={allowedEmbedOriginLimitReached ? 'warning' : 'info'}>
                                        {typeof maxAllowedEmbedOriginsPerApp === 'number'
                                            ? `${allowedEmbedOriginCount} / ${maxAllowedEmbedOriginsPerApp} allowed embed origins for this app.`
                                            : `${allowedEmbedOriginCount} allowed embed origins for this app.`}
                                    </PortalInlineMessage>
                                </div>
                                <PortalInlineMessage tone={suggestedEmbedOrigins.length > 1 ? 'warning' : 'info'}>
                                    {suggestedEmbedOrigins.length > 1
                                        ? 'This app is being configured for multiple sites. That is valid, but it is easier to misroute users if the callback and embed origin lists drift apart. If these sites are separate products or environments, prefer separate app registrations.'
                                        : 'Keep redirect URIs and allowed embed origins explicit. Rooiam loads the widget only from listed origins, and the final app callback must use the same origin as the embedding site.'}
                                </PortalInlineMessage>
                                {requiresMultiOriginConfirmation ? (
                                    <PortalInlineMessage tone="warning">
                                        This app spans multiple site origins. Confirm that this is intentional. Rooiam recommends one app per site or environment unless you explicitly want one shared app registration.
                                    </PortalInlineMessage>
                                ) : null}
                                {invalidRedirectUris.length > 0 ? (
                                    <PortalInlineMessage tone="error">
                                        Some redirect URIs are not valid URLs yet. Fix these lines before saving: {invalidRedirectUris.slice(0, 3).join(', ')}{invalidRedirectUris.length > 3 ? '…' : ''}
                                    </PortalInlineMessage>
                                ) : null}
                                {insecureRedirectUris.length > 0 ? (
                                    <PortalInlineMessage tone="warning">
                                        Non-loopback callback URLs should use <span className="font-black">https://</span>. Rooiam only expects plain <span className="font-black">http://</span> for localhost or loopback development.
                                    </PortalInlineMessage>
                                ) : null}
                                {invalidAllowedEmbedOrigins.length > 0 ? (
                                    <PortalInlineMessage tone="error">
                                        Allowed embed origins must be plain site origins like <span className="font-black">https://app.example.com</span>. Do not paste callback paths here.
                                    </PortalInlineMessage>
                                ) : null}
                                {missingSuggestedOrigins.length > 0 ? (
                                    <PortalInlineMessage tone="warning">
                                        Some callback origins are not in the allowed embed-origin list yet. The hosted widget will stay blocked for those sites until you add them explicitly.
                                    </PortalInlineMessage>
                                ) : null}
                                <PortalInlineMessage tone="info">
                                    Hosted-widget checklist: keep the host page free of XSS, use a strict Content Security Policy, prefer one app per site or environment, and use <span className="font-black">https://</span> outside localhost. Rooiam validates widget origin and app callback selection, but it cannot protect a host page that is already compromised.
                                </PortalInlineMessage>
                                <PortalInlineMessage tone="info">
                                    Production-ready app checklist: every real embedding site should have both an allowed embed origin and a redirect URI on the same origin. Prefer one app per real site or environment when possible.
                                </PortalInlineMessage>
                                <div className="grid gap-4 lg:grid-cols-2">
                                    <div className="space-y-2">
                                        <label className="block text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                                            Allowed Redirect URIs
                                        </label>
                                        <PortalTextareaField
                                            value={newAppRedirects}
                                            onChange={setNewAppRedirects}
                                            placeholder={'https://app.example.com/callback\nhttp://localhost:5180/callback'}
                                            rows={6}
                                        />
                                        <p className="text-xs font-semibold text-muted-foreground">
                                            Exact callback URLs only. Rooiam uses these after login completes and matches the current embedding site to the callback with the same origin. Use <span className="font-black">https://</span> for normal sites. Plain <span className="font-black">http://</span> should only be used for localhost or loopback development, for example <span className="font-black">http://localhost:5180/callback</span>.
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
                                            Allowed Embed Origins
                                        </label>
                                        <PortalTextareaField
                                            value={newAppAllowedEmbedOrigins}
                                            onChange={setNewAppAllowedEmbedOrigins}
                                            placeholder={'https://app.example.com\nhttps://staging.example.com\nhttp://localhost:5180'}
                                            rows={6}
                                        />
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex flex-wrap gap-2">
                                                {suggestedEmbedOrigins.map(origin => (
                                                    <span key={origin} className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-black text-violet-700">
                                                        {origin}
                                                    </span>
                                                ))}
                                            </div>
                                            {missingSuggestedOrigins.length > 0 ? (
                                                <button
                                                    type="button"
                                                    onClick={applySuggestedEmbedOrigins}
                                                    className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-[11px] font-black text-violet-700 transition hover:bg-violet-50"
                                                >
                                                    Add {missingSuggestedOrigins.length === 1 ? 'Suggested Origin' : `All ${missingSuggestedOrigins.length} Suggested Origins`}
                                                </button>
                                            ) : null}
                                        </div>
                                        <p className="text-xs font-semibold text-muted-foreground">
                                            List site origins only, for example <span className="font-black">https://app.example.com</span>, not <span className="font-black">https://app.example.com/callback</span>. If this app supports multiple sites, add each site origin here and Rooiam will only load the widget when the current site and callback origin match. Plain <span className="font-black">http://</span> should only be used for localhost or loopback development.
                                        </p>
                                    </div>
                                </div>
                                {requiresMultiOriginConfirmation ? (
                                    <label className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                                        <input
                                            type="checkbox"
                                            checked={newAppConfirmMultiOrigin}
                                            onChange={e => setNewAppConfirmMultiOrigin(e.target.checked)}
                                            className="mt-1 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                        />
                                        <span>
                                            I confirm this app is intentionally shared across multiple origins, and I want Rooiam to route each hosted-widget sign-in by matching the current site origin to the registered callback origin.
                                        </span>
                                    </label>
                                ) : null}
                            </PortalContentCard>

                            <PortalSaveActionFooter
                                note="Registering the app creates a new client ID immediately. Web apps will also receive a secret that is shown only once."
                                loading={creatingApp}
                                disabled={!canManageApps || demoMode || workspaceAppLimitReached || redirectUriLimitReached || allowedEmbedOriginLimitReached || invalidRedirectUris.length > 0 || invalidAllowedEmbedOrigins.length > 0 || creatingApp || !newAppName.trim() || !newAppRedirects.trim() || !newAppAllowedEmbedOrigins.trim() || (requiresMultiOriginConfirmation && !newAppConfirmMultiOrigin)}
                                label={`Register ${APP_LABEL}`}
                                type="submit"
                                success={appMessage}
                            />
                        </PortalCreateFormLayout>
                    </form>

                    {newAppSecret ? (
                        <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-bold text-emerald-900">App secret — shown once</p>
                                    <p className="mt-1 text-xs font-medium text-emerald-700">Copy it now and store it securely. It will not be shown again.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setNewAppSecret(null)}
                                    className="text-xs font-bold text-emerald-700 underline"
                                >
                                    Dismiss
                                </button>
                            </div>
                            <div className="mt-3 flex items-center gap-2">
                                <PortalCodeBlockField value={newAppSecret} tone="emerald" copyable className="flex-1" />
                            </div>
                        </div>
                    ) : null}

                    {rotatedAppSecret ? (
                        <div className="rounded-3xl border border-sky-200 bg-sky-50 p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-bold text-sky-900">App secret rotated</p>
                                    <p className="mt-1 text-xs font-medium text-sky-700">Copy the new secret now. The previous secret is no longer valid.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setRotatedAppSecret(null)}
                                    className="text-xs font-bold text-sky-700 underline"
                                >
                                    Dismiss
                                </button>
                            </div>
                            <div className="mt-3 space-y-3">
                                <PortalCodeBlockField label="Client ID" value={rotatedAppSecret.clientId} tone="sky" />
                                <PortalCodeBlockField value={rotatedAppSecret.clientSecret} tone="sky" copyable />
                            </div>
                        </div>
                    ) : null}
                </div>
            </PortalSectionCard>
        </div>
    )
}
