import React from 'react'
import { ArrowDown, ArrowUp, CheckCircle2, Code2, Eye, Monitor, Sparkles } from 'lucide-react'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalSectionCard from '../../components/portal/PortalSectionCard'
import { getApiOrigin } from '../../lib/api-base'
import { LOGIN_WIDGET_LABEL } from '../../lib/domain-labels'
import { BrandingForm, DEFAULT_LOGIN_METHOD_ORDER, OrgClient, Organization } from '../../lib/portal-types'
import { LOGIN_METHOD_LABELS } from '../../lib/login-style'

type AuthPolicyForm = {
    allow_magic_link: boolean
    allow_google: boolean
    allow_microsoft: boolean
    allow_passkey: boolean
    require_mfa: boolean
}

type Props = {
    currentOrg: Organization | null
    requestedAppName: string
    requestedClientId?: string | null
    availableApps: OrgClient[]
    selectedAppId?: string | null
    onOpenApp: (appId: string) => void
    brandingForm: BrandingForm
    setBrandingForm: React.Dispatch<React.SetStateAction<BrandingForm>>
    authPolicyForm: AuthPolicyForm
    canManageBranding: boolean
    savingBranding: boolean
    saveMessage: string
    onSaveBranding: (e: React.FormEvent) => void | Promise<void>
    demoMode?: boolean
}

export default function PortalWorkspaceLoginWidget({
    currentOrg,
    requestedAppName,
    requestedClientId = null,
    availableApps,
    selectedAppId = null,
    onOpenApp,
    brandingForm,
    setBrandingForm,
    authPolicyForm,
    canManageBranding,
    savingBranding,
    saveMessage,
    onSaveBranding,
    demoMode = false,
}: Props) {
    const [mode, setMode] = React.useState<'iframe' | 'js' | 'json'>('iframe')
    const [copied, setCopied] = React.useState(false)
    const [previewSrc, setPreviewSrc] = React.useState('')
    const [previewHeight, setPreviewHeight] = React.useState(560)
    const [previewWidth, setPreviewWidth] = React.useState(390)
    const [previewSavePending, setPreviewSavePending] = React.useState(false)
    const wasSavingBrandingRef = React.useRef(false)
    // Preview branding is rendered server-side from the DB, so the iframe URL is
    // constant and changing branding does NOT change the URL. To reload the
    // preview after "Update Preview" saves, bump this counter — it feeds the
    // iframe `key`, forcing React to remount the iframe so it re-fetches the DB
    // branding. We intentionally do NOT add a cache-busting query param: the
    // server's /login-widget allowlist rejects unknown params.
    const [previewReloadKey, setPreviewReloadKey] = React.useState(0)
    // Tracks whether the branding form has unsaved edits since the last preview
    // sync, so the "synced" indicator is honest now that the URL never changes.
    const [previewDirty, setPreviewDirty] = React.useState(false)

    if (!currentOrg) {
        return (
            <div className="space-y-5 sm:space-y-6 animate-slide-up">
                <PortalPageHeader title={`Workspace ${LOGIN_WIDGET_LABEL}`} />
                <PortalSectionCard icon={Eye} title="No Workspace Selected" className="rounded-4xl">
                    <div className="rounded-3xl border border-violet-100 bg-violet-50 p-4">
                        <p className="font-bold text-violet-900">No workspace selected</p>
                        <p className="mt-1 text-sm font-medium text-violet-800">Choose a workspace first.</p>
                    </div>
                </PortalSectionCard>
            </div>
        )
    }

    const companyName = brandingForm.login_display_name || currentOrg.login_display_name || currentOrg.name
    const selectedApp = React.useMemo(
        () => selectedAppId ? availableApps.find(entry => entry.client.id === selectedAppId) || null : null,
        [availableApps, selectedAppId],
    )
    const widgetApp = React.useMemo(() => {
        if (selectedApp) return selectedApp
        const normalizedRequestedName = requestedAppName.trim().toLowerCase()
        const byName = normalizedRequestedName
            ? availableApps.find(entry => entry.client.app_name.trim().toLowerCase() === normalizedRequestedName) || null
            : null
        if (byName) return byName
        return availableApps.length === 1 ? availableApps[0] : null
    }, [availableApps, requestedAppName, selectedApp])
    // Branding is rendered server-side from the DB in preview mode, so these
    // values are no longer threaded into the preview URL. Only the ones still
    // used by the page UI (method order, card border color) are kept.
    const brandColor = brandingForm.brand_color || currentOrg.brand_color
    const methodOrder = brandingForm.login_method_order || currentOrg.login_method_order || [...DEFAULT_LOGIN_METHOD_ORDER]
    const effectiveCardBorderColor = brandingForm.card_border_color || brandColor || '#8d72d9'

    const apiOrigin = getApiOrigin()
    const loginUrlObject = new URL(`${apiOrigin}/login-widget`)
    loginUrlObject.searchParams.set('workspace_id', currentOrg.id)
    loginUrlObject.searchParams.set('app', companyName)
    if (requestedClientId?.trim()) {
        loginUrlObject.searchParams.set('client_id', requestedClientId.trim())
    }
    const loginUrl = loginUrlObject.toString()
    // The server's /login-widget endpoint uses a strict query allowlist
    // (deny_unknown_fields): only preview, workspace_id, workspace, org, client_id.
    // Any other param -> HTTP 400 -> the server's error page sends
    // X-Frame-Options: DENY, which makes the iframe render as a blocked box.
    // In preview mode the server renders branding from the DB (that is why
    // "Update Preview" saves branding first, then refreshes the iframe), so the
    // branding values must NOT be threaded through the URL here.
    const previewUrlObject = new URL(`${apiOrigin}/login-widget`)
    previewUrlObject.searchParams.set('preview', '1')
    previewUrlObject.searchParams.set('workspace_id', currentOrg.id)
    if (requestedClientId?.trim()) {
        previewUrlObject.searchParams.set('client_id', requestedClientId.trim())
    }
    const previewUrl = previewUrlObject.toString()
    React.useEffect(() => {
        setPreviewSrc(previewUrl)
    }, [currentOrg.slug])

    // After "Update Preview" finishes saving branding successfully, remount the
    // iframe (bump reload key) so it re-fetches the freshly-saved DB branding,
    // and clear the dirty flag.
    React.useEffect(() => {
        if (previewSavePending && wasSavingBrandingRef.current && !savingBranding) {
            if (saveMessage) {
                setPreviewReloadKey(k => k + 1)
                setPreviewDirty(false)
            }
            setPreviewSavePending(false)
        }
        wasSavingBrandingRef.current = savingBranding
    }, [previewSavePending, saveMessage, savingBranding])

    // Any branding form change since the last sync means the preview is stale.
    const didMountBrandingRef = React.useRef(false)
    React.useEffect(() => {
        if (!didMountBrandingRef.current) {
            didMountBrandingRef.current = true
            return
        }
        setPreviewDirty(true)
    }, [brandingForm])

    React.useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            if (event.origin !== apiOrigin) return
            if (!event.data || event.data.type !== 'rooiam-login-widget:size') return
            const nextHeight = Number(event.data.height)
            if (Number.isFinite(nextHeight) && nextHeight > 0) {
                setPreviewHeight(Math.max(320, nextHeight))
            }
            const nextWidth = Number(event.data.width)
            if (Number.isFinite(nextWidth) && nextWidth > 0) {
                setPreviewWidth(Math.max(320, nextWidth))
            }
        }
        window.addEventListener('message', onMessage)
        return () => window.removeEventListener('message', onMessage)
    }, [apiOrigin])

    const iframeSnippet = `<iframe
  src="${loginUrl}"
  width="420"
  height="520"
  allow="publickey-credentials-get *"
></iframe>`

    const jsSnippet = `<div id="rooiam-login"></div>
<script>
  (function() {
    var iframe = document.createElement('iframe');
    iframe.src = '${loginUrl}';
    iframe.width = '420';
    iframe.height = '520';
    iframe.allow = 'publickey-credentials-get *';
    iframe.style.maxWidth = '100%';
    document.getElementById('rooiam-login').appendChild(iframe);
  })();
<\/script>`
    const exampleConfigJson = JSON.stringify(
        {
            workspace_id: currentOrg.id,
            workspace_slug: currentOrg.slug,
            client_id: widgetApp?.client.client_id || requestedClientId?.trim() || '',
            app_name: widgetApp?.client.app_name || companyName,
            widget_base_url: `${apiOrigin}/login-widget`,
        },
        null,
        2,
    )

    const snippet = mode === 'iframe' ? iframeSnippet : mode === 'js' ? jsSnippet : exampleConfigJson

    const handleCopy = () => {
        navigator.clipboard.writeText(snippet).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    const handleUpdatePreview = async () => {
        if (canManageBranding) {
            // Save branding first; the post-save effect bumps the reload key once
            // the save succeeds, which remounts the iframe with fresh DB branding.
            setPreviewSavePending(true)
            const fakeEvent = {
                preventDefault() {},
            } as React.FormEvent
            await onSaveBranding(fakeEvent)
        } else {
            // Read-only viewer: nothing to save, just force a reload.
            setPreviewReloadKey(k => k + 1)
        }
    }

    const widgetIsSynced = !previewSavePending && !previewDirty

    const moveMethod = (index: number, direction: -1 | 1) => {
        setBrandingForm(current => {
            const nextIndex = index + direction
            if (nextIndex < 0 || nextIndex >= current.login_method_order.length) return current
            const order = [...current.login_method_order]
            const [moved] = order.splice(index, 1)
            order.splice(nextIndex, 0, moved)
            return { ...current, login_method_order: order }
        })
    }

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader title={`Workspace ${LOGIN_WIDGET_LABEL}`} />

            <PortalSectionCard icon={Eye} title="Using App" className="rounded-4xl">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                    <div className="space-y-3">
                        <div>
                            <label className="mb-1.5 block text-xs font-bold text-muted-foreground">Workspace App</label>
                            <select
                                value={widgetApp?.client.id || ''}
                                onChange={e => {
                                    if (e.target.value) onOpenApp(e.target.value)
                                }}
                                className="w-full px-4 py-3 bg-muted/50 border border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all"
                            >
                                <option value="" disabled>{availableApps.length ? 'Select a workspace app' : 'No workspace apps yet'}</option>
                                {availableApps.map(entry => (
                                    <option key={entry.client.id} value={entry.client.id}>
                                        {entry.client.app_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        {widgetApp ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                                    <p className="text-xs font-bold text-muted-foreground">Client ID</p>
                                    <p className="mt-1 break-all text-sm font-bold">{widgetApp.client.client_id}</p>
                                </div>
                                <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                                    <p className="text-xs font-bold text-muted-foreground">App Callbacks & Allowed Origins</p>
                                    <p className="mt-1 text-sm font-medium text-muted-foreground">Managed in Workspace Apps for this app.</p>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                                Create or choose a workspace app first. The widget snippet needs a real app client, and callbacks or allowed origins are managed in <span className="font-black">Workspace Apps</span>.
                            </div>
                        )}
                    </div>
                    {widgetApp ? (
                        <button
                            type="button"
                            onClick={() => onOpenApp(widgetApp.client.id)}
                            className="inline-flex items-center justify-center rounded-full border border-border bg-background px-4 py-2 text-xs font-bold hover:bg-muted/30"
                        >
                            Open App Settings
                        </button>
                    ) : null}
                </div>
            </PortalSectionCard>

            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="space-y-6">
                    <PortalSectionCard
                        icon={Sparkles}
                        title="Widget Settings"
                        className="rounded-4xl"
                    >
                        {!canManageBranding ? (
                            <div className="rounded-3xl border border-violet-100 bg-violet-50 p-4">
                                <p className="font-bold text-violet-900">Read-only access</p>
                                <p className="mt-1 text-sm font-medium text-violet-800">
                                    Only members with the <code className="font-black">branding:manage</code> permission can change widget styling.
                                </p>
                            </div>
                        ) : (
                            <form onSubmit={onSaveBranding} className="space-y-8">
                                <div className="space-y-4">
                                    <div>
                                        <ToggleRow
                                            label="Show login logo"
                                            checked={brandingForm.show_login_logo}
                                            onChange={checked => setBrandingForm(current => ({ ...current, show_login_logo: checked }))}
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-xs font-bold text-muted-foreground">Login Title</label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="text"
                                                value={brandingForm.login_title}
                                                onChange={e => setBrandingForm(current => ({ ...current, login_title: e.target.value }))}
                                                className="min-w-0 flex-1 px-4 py-3 bg-muted/50 border border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all"
                                                placeholder="Sign in or create account"
                                            />
                                            <ToggleRow
                                                label="Show title"
                                                checked={brandingForm.show_login_title}
                                                onChange={checked => setBrandingForm(current => ({ ...current, show_login_title: checked }))}
                                                compact
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="mb-1.5 block text-xs font-bold text-muted-foreground">Login Subtitle</label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="text"
                                                value={brandingForm.login_subtitle}
                                                onChange={e => setBrandingForm(current => ({ ...current, login_subtitle: e.target.value }))}
                                                className="min-w-0 flex-1 px-4 py-3 bg-muted/50 border border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all"
                                                placeholder={`Secure access for ${requestedAppName}`}
                                            />
                                            <ToggleRow
                                                label="Show subtitle"
                                                checked={brandingForm.show_login_subtitle}
                                                onChange={checked => setBrandingForm(current => ({ ...current, show_login_subtitle: checked }))}
                                                compact
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <ToggleRow
                                            label="Show “Powered by Rooiam”"
                                            checked={brandingForm.show_powered_by}
                                            onChange={checked => setBrandingForm(current => ({ ...current, show_powered_by: checked }))}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4 pt-2">
                                <div className="grid gap-4 lg:grid-cols-3">
                                    <div>
                                        <label className="text-xs font-bold text-muted-foreground mb-1.5 block">Card Corner</label>
                                        <select
                                            value={brandingForm.card_radius}
                                            onChange={e => setBrandingForm(current => ({ ...current, card_radius: e.target.value as BrandingForm['card_radius'] }))}
                                            className="w-full px-4 py-3 bg-muted/50 border border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all"
                                        >
                                            <option value="sharp">Sharp</option>
                                            <option value="compact">Soft</option>
                                            <option value="rounded">Rounded</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-muted-foreground mb-1.5 block">Button Corner</label>
                                        <select
                                            value={brandingForm.widget_radius}
                                            onChange={e => setBrandingForm(current => ({ ...current, widget_radius: e.target.value as BrandingForm['widget_radius'] }))}
                                            className="w-full px-4 py-3 bg-muted/50 border border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all"
                                        >
                                            <option value="sharp">Sharp</option>
                                            <option value="compact">Soft</option>
                                            <option value="rounded">Rounded</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-muted-foreground mb-1.5 block">Shadow Style</label>
                                        <select
                                            value={brandingForm.widget_shadow}
                                            onChange={e => setBrandingForm(current => ({ ...current, widget_shadow: e.target.value as BrandingForm['widget_shadow'] }))}
                                            className="w-full px-4 py-3 bg-muted/50 border border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all"
                                        >
                                            <option value="none">No shadow</option>
                                            <option value="soft">Soft</option>
                                            <option value="lifted">Lifted</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <div>
                                        <label className="text-xs font-bold text-muted-foreground mb-1.5 block">Button Style</label>
                                        <div className="inline-flex rounded-2xl bg-muted/50 border border-border p-1 gap-1">
                                            {(['filled', 'outline'] as const).map(style => (
                                                <button
                                                    key={style}
                                                    type="button"
                                                    onClick={() => setBrandingForm(current => ({ ...current, button_style: style }))}
                                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                                                        brandingForm.button_style === style
                                                            ? 'bg-[linear-gradient(135deg,rgba(255,235,242,0.95),rgba(245,241,255,0.98))] shadow-sm text-foreground border border-border'
                                                            : 'text-muted-foreground'
                                                    }`}
                                                >
                                                    {style === 'filled' ? 'Filled' : 'Outline'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-muted-foreground mb-1.5 block">Card Background</label>
                                        <select
                                            value={brandingForm.card_bg_style}
                                            onChange={e => setBrandingForm(current => ({ ...current, card_bg_style: e.target.value as BrandingForm['card_bg_style'] }))}
                                            className="w-full px-4 py-3 bg-muted/50 border border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all"
                                        >
                                            <option value="auto">Auto (radial tint)</option>
                                            <option value="solid">Solid tint</option>
                                            <option value="gradient-lr">Gradient → right</option>
                                            <option value="gradient-tb">Gradient → down</option>
                                            <option value="gradient-tl">Gradient → bottom-right</option>
                                            <option value="gradient-tr">Gradient → bottom-left</option>
                                        </select>
                                    </div>
                                </div>
                                {brandingForm.card_bg_style !== 'auto' && brandingForm.card_bg_style !== 'solid' ? (
                                    <div>
                                        <label className="text-xs font-bold text-muted-foreground mb-1.5 block">Gradient End Color</label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="color"
                                                value={brandingForm.card_bg_color2 || '#ffffff'}
                                                onChange={e => setBrandingForm(current => ({ ...current, card_bg_color2: e.target.value }))}
                                                className="h-10 w-14 cursor-pointer rounded-xl border border-border bg-muted/50 p-1"
                                            />
                                            <span className="text-xs font-mono text-muted-foreground">{brandingForm.card_bg_color2 || '#ffffff'}</span>
                                            <button
                                                type="button"
                                                onClick={() => setBrandingForm(current => ({ ...current, card_bg_color2: '' }))}
                                                className="text-xs font-bold text-muted-foreground hover:text-foreground"
                                            >
                                                Reset
                                            </button>
                                        </div>
                                    </div>
                                ) : null}

                                <div>
                                    <label className="text-xs font-bold text-muted-foreground mb-1.5 block">Card Border</label>
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={brandingForm.card_border_width}
                                            onChange={e => setBrandingForm(current => ({ ...current, card_border_width: e.target.value as BrandingForm['card_border_width'] }))}
                                            className="flex-1 px-4 py-3 bg-muted/50 border border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all"
                                        >
                                            <option value="none">None</option>
                                            <option value="1px">Thin (1px)</option>
                                            <option value="2px">Thick (2px)</option>
                                        </select>
                                        {brandingForm.card_border_width !== 'none' && (
                                            <input
                                                type="color"
                                                value={effectiveCardBorderColor}
                                                onChange={e => setBrandingForm(current => ({ ...current, card_border_color: e.target.value }))}
                                                className="h-10 w-14 cursor-pointer rounded-xl border border-border bg-muted/50 p-1"
                                            />
                                        )}
                                    </div>
                                </div>
                                </div>

                            <div className="space-y-3 pt-2">
                                <div className="flex items-center justify-between gap-3">
                                    <label className="text-xs font-bold text-muted-foreground block">Sign-In Method Order</label>
                                </div>
                                    <div className="space-y-2">
                                        {methodOrder.map((method, index) => {
                                            const enabled = authPolicyForm[
                                                method === 'magic_link'
                                                    ? 'allow_magic_link'
                                                    : method === 'passkey'
                                                        ? 'allow_passkey'
                                                        : method === 'google'
                                                            ? 'allow_google'
                                                            : 'allow_microsoft'
                                            ]
                                            return (
                                                <div key={method} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3">
                                                    <div>
                                                        <p className="text-sm font-bold">{LOGIN_METHOD_LABELS[method]}</p>
                                                        <p className="text-xs font-medium text-muted-foreground">{enabled ? 'Enabled for this workspace' : 'Currently disabled in Login'}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => moveMethod(index, -1)}
                                                            disabled={index === 0}
                                                            className="rounded-xl border border-border bg-background p-2 text-muted-foreground disabled:opacity-40"
                                                            aria-label={`Move ${LOGIN_METHOD_LABELS[method]} up`}
                                                        >
                                                            <ArrowUp className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => moveMethod(index, 1)}
                                                            disabled={index === methodOrder.length - 1}
                                                            className="rounded-xl border border-border bg-background p-2 text-muted-foreground disabled:opacity-40"
                                                            aria-label={`Move ${LOGIN_METHOD_LABELS[method]} down`}
                                                        >
                                                            <ArrowDown className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                            </form>
                        )}
                    </PortalSectionCard>

                    <PortalSectionCard
                        icon={Code2}
                        title="Embed Snippet"
                        className="rounded-4xl"
                        action={
                            <div className="inline-flex rounded-full bg-muted/50 p-1 border border-border">
                                <button
                                    type="button"
                                    onClick={() => setMode('iframe')}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${mode === 'iframe' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                                >
                                    <Monitor className="w-3.5 h-3.5 inline mr-1.5" />
                                    iFrame
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMode('js')}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${mode === 'js' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                                >
                                    <Code2 className="w-3.5 h-3.5 inline mr-1.5" />
                                    JS
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMode('json')}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${mode === 'json' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                                >
                                    <Code2 className="w-3.5 h-3.5 inline mr-1.5" />
                                    JSON
                                </button>
                            </div>
                        }
                    >
                        <div className="space-y-3">
                            <HighlightedSnippet code={snippet} language={mode} />
                            {mode === 'json' ? (
                                <p className="text-xs font-medium text-muted-foreground">
                                    Copy this into <code className="font-black">config.local.json</code> for the examples. Runtime widget embeds use app identity only. The preview iframe is the only place that carries a preview-only redirect.
                                </p>
                            ) : null}
                            <button
                                type="button"
                                onClick={handleCopy}
                                className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-bold hover:bg-muted/30"
                            >
                                <Code2 className="w-3.5 h-3.5" />
                                {copied ? 'Copied' : 'Copy snippet'}
                            </button>
                        </div>
                    </PortalSectionCard>
                </div>

                <PortalSectionCard
                    icon={Eye}
                    title="Live Login Widget"
                    className="rounded-4xl"
                    bodyClassName="p-4 sm:p-6"
                >
                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-muted-foreground">
                                Click Update Preview to refresh. Preview mode is special and not the same contract as the real embed.
                            </p>
                            <div className="flex items-center gap-3">
                                <span className="inline-flex h-8 w-8 items-center justify-center">
                                    {widgetIsSynced ? (
                                        <span
                                            title="Login widget is synced."
                                            aria-label="Synced"
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-100 text-emerald-700 shadow-sm"
                                        >
                                            <CheckCircle2 className="h-4 w-4" />
                                        </span>
                                    ) : null}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => void handleUpdatePreview()}
                                    disabled={savingBranding}
                                    className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-bold hover:bg-muted/30"
                                >
                                    <Sparkles className="h-3.5 w-3.5" />
                                    {savingBranding ? 'Saving...' : canManageBranding ? 'Update Preview' : 'Refresh Preview'}
                                </button>
                            </div>
                        </div>
                        <div className="flex justify-center">
                            <iframe
                                key={`${currentOrg.slug}-${previewReloadKey}`}
                                src={previewSrc || previewUrl}
                                title="Hosted login widget preview"
                                width={previewWidth}
                                height={previewHeight}
                                frameBorder={0}
                                scrolling="no"
                                style={{
                                    background: 'transparent',
                                    display: 'block',
                                    width: `${previewWidth}px`,
                                    maxWidth: '100%',
                                }}
                                allow="publickey-credentials-get *"
                            />
                        </div>
                    </div>
                </PortalSectionCard>
            </div>
        </div>
    )
}

function HighlightedSnippet({
    code,
    language,
}: {
    code: string
    language: 'iframe' | 'js' | 'json'
}) {
    const lines = code.split('\n')
    const languageLabel = language === 'iframe' ? 'HTML' : language === 'js' ? 'JavaScript' : 'JSON'

    return (
        <div className="overflow-hidden rounded-3xl border border-border bg-[#fffdfd] shadow-[0_18px_48px_rgba(83,42,73,0.08)]">
            <div className="flex items-center justify-between border-b border-border bg-[linear-gradient(135deg,rgba(255,235,242,0.9),rgba(245,241,255,0.95))] px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
                </div>
                <span className="rounded-full border border-white/70 bg-white/80 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                    {languageLabel}
                </span>
            </div>
            <div className="overflow-x-auto px-0 py-2">
                <pre className="min-w-full text-xs font-mono leading-6 text-slate-700">
                    {lines.map((line, index) => (
                        <div key={`${language}-${index}`} className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-start px-4">
                            <span className="select-none pr-4 text-right text-[10px] font-bold text-slate-300">
                                {index + 1}
                            </span>
                            <code className="whitespace-pre">
                                {renderHighlightedLine(line, language)}
                            </code>
                        </div>
                    ))}
                </pre>
            </div>
        </div>
    )
}

function renderHighlightedLine(line: string, language: 'iframe' | 'js' | 'json') {
    const tokens = language === 'iframe' ? tokenizeHtmlLine(line) : tokenizeJsLine(line)
    return tokens.map((token, index) => (
        <span key={`${token.type}-${index}`} className={tokenClassName(token.type)}>
            {token.value}
        </span>
    ))
}

function tokenizeHtmlLine(line: string): Array<{ type: string; value: string }> {
    const tokens: Array<{ type: string; value: string }> = []
    const pattern = /(<\/?)([\w-]+)|([\w:-]+)(=)("(?:[^"]*)")|(\/?>)/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = pattern.exec(line)) !== null) {
        if (match.index > lastIndex) {
            tokens.push({ type: 'plain', value: line.slice(lastIndex, match.index) })
        }

        if (match[1] && match[2]) {
            tokens.push({ type: 'punctuation', value: match[1] })
            tokens.push({ type: 'tag', value: match[2] })
        } else if (match[3] && match[4] && match[5]) {
            tokens.push({ type: 'attribute', value: match[3] })
            tokens.push({ type: 'punctuation', value: match[4] })
            tokens.push({ type: 'string', value: match[5] })
        } else if (match[6]) {
            tokens.push({ type: 'punctuation', value: match[6] })
        }

        lastIndex = pattern.lastIndex
    }

    if (lastIndex < line.length) {
        tokens.push({ type: 'plain', value: line.slice(lastIndex) })
    }

    return tokens.length > 0 ? tokens : [{ type: 'plain', value: line }]
}

function tokenizeJsLine(line: string): Array<{ type: string; value: string }> {
    const tokens: Array<{ type: string; value: string }> = []
    const pattern = /(\b(?:var|const|let|function|return)\b)|(\b(?:document|window)\b)|(\.[a-zA-Z_]\w*)|("(?:[^"]*)"|'(?:[^']*)')|(\b[a-zA-Z_]\w*(?=\s*:))/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = pattern.exec(line)) !== null) {
        if (match.index > lastIndex) {
            tokens.push({ type: 'plain', value: line.slice(lastIndex, match.index) })
        }

        if (match[1]) {
            tokens.push({ type: 'keyword', value: match[1] })
        } else if (match[2]) {
            tokens.push({ type: 'builtin', value: match[2] })
        } else if (match[3]) {
            tokens.push({ type: 'property', value: match[3] })
        } else if (match[4]) {
            tokens.push({ type: 'string', value: match[4] })
        } else if (match[5]) {
            tokens.push({ type: 'attribute', value: match[5] })
        }

        lastIndex = pattern.lastIndex
    }

    if (lastIndex < line.length) {
        tokens.push({ type: 'plain', value: line.slice(lastIndex) })
    }

    return tokens.length > 0 ? tokens : [{ type: 'plain', value: line }]
}

function tokenClassName(type: string) {
    switch (type) {
        case 'tag':
            return 'text-rose-500 font-bold'
        case 'attribute':
            return 'text-sky-600 font-semibold'
        case 'string':
            return 'text-emerald-600'
        case 'keyword':
            return 'text-fuchsia-600 font-bold'
        case 'builtin':
            return 'text-violet-600 font-semibold'
        case 'property':
            return 'text-amber-600'
        case 'punctuation':
            return 'text-slate-400'
        default:
            return 'text-slate-700'
    }
}

function ToggleRow({
    label,
    checked,
    onChange,
    compact = false,
}: {
    label: string
    checked: boolean
    onChange: (checked: boolean) => void
    compact?: boolean
}) {
    return (
        <label
            className={
                compact
                    ? 'flex w-40 shrink-0 items-center justify-between gap-3 pr-4'
                    : 'flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3'
            }
        >
            <span className={compact ? 'text-xs font-bold text-muted-foreground' : 'text-sm font-bold text-foreground'}>
                {label}
            </span>
            <button
                type="button"
                onClick={() => onChange(!checked)}
                className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-violet-500' : 'bg-slate-200'}`}
                aria-pressed={checked}
            >
                <span
                    className={`absolute top-1 h-5 w-5 rounded-full border border-slate-200 bg-white shadow-sm transition-transform ${checked ? 'left-6' : 'left-1'}`}
                />
            </button>
        </label>
    )
}
