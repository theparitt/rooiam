/**
 * LoginWidgetCore — single source of truth for login widget HTML.
 *
 * Both LoginWidgetPreview (portal preview) and MagicLinkPage (real login)
 * call this component. The HTML structure and CSS classes are IDENTICAL in
 * both modes. The only difference is whether inputs/buttons are interactive:
 *   - interactive=false → static, no event handlers (preview)
 *   - interactive=true  → live, handlers wired up (real login)
 */
import React from 'react'
import { Mail, ArrowRight, Loader2, KeyRound } from 'lucide-react'
import { DEFAULT_BRAND, LoginMethodKey, LogoContainer, WidgetRadius } from '../../lib/portal-types'
import { radiusClass, cardRadiusClass, shadowClass, cardBgCss } from '../../lib/login-style'
import DemoBadge from '../DemoBadge'

export type LoginWidgetBranding = {
    companyName: string
    logoUrl?: string | null
    brandColor?: string | null
    showLogo?: boolean
    showTitle?: boolean
    showSubtitle?: boolean
    showPoweredBy?: boolean
    loginTitle?: string | null
    loginSubtitle?: string | null
    widgetRadius?: WidgetRadius | string | null
    widgetShadow?: string | null
    logoContainer?: LogoContainer | string | null
    loginLogoContainer?: LogoContainer | string | null
    loginLogoSize?: 'small' | 'medium' | 'large' | string | null
    cardRadius?: string | null
    buttonStyle?: string | null
    cardBgStyle?: string | null
    cardBgColor2?: string | null
    cardBorderWidth?: string | null
    cardBorderColor?: string | null
    usingTenantBranding?: boolean
    /** Show a "Demo" badge next to the logo */
    showDemoBadge?: boolean
}

export type LoginWidgetMethods = {
    magic_link: boolean
    passkey: boolean
    google: boolean
    microsoft: boolean
}

export type LoginWidgetHandlers = {
    email: string
    setEmail: (v: string) => void
    loading: boolean
    passkeyLoading: boolean
    onMagicLink: (e: React.FormEvent) => void
    onPasskey: () => void
    onGoogle: () => void
    onMicrosoft: () => void
}

type Props = {
    branding: LoginWidgetBranding
    methods: LoginWidgetMethods
    methodOrder: LoginMethodKey[]
    interactive?: boolean
    handlers?: LoginWidgetHandlers
    error?: string
    showMagicLinkUnavailable?: boolean
    /** Render custom content inside the card instead of method buttons (e.g. MFA form) */
    children?: React.ReactNode
}

function loginLogoContainerClasses(
    container?: LogoContainer | string | null,
    size?: 'small' | 'medium' | 'large' | string | null,
): string {
    const dim = size === 'small' ? 'w-16 h-16' : size === 'large' ? 'w-32 h-32' : 'w-24 h-24'
    // wide: width-only — image natural height defines container height (no letterboxing)
    const wideWidth = size === 'small' ? 'w-40' : size === 'large' ? 'w-72' : 'w-56'
    if (container === 'wide') return `${wideWidth} rounded-xl overflow-hidden`
    if (container === 'circle') return `${dim} rounded-full overflow-hidden`
    return `${dim} rounded-2xl overflow-hidden`
}

export default function LoginWidgetCore({
    branding,
    methods,
    methodOrder,
    interactive = false,
    handlers,
    error,
    showMagicLinkUnavailable = false,
    children,
}: Props) {
    const themeColor = branding.brandColor || DEFAULT_BRAND
    const usingTenant = branding.usingTenantBranding ?? Boolean(branding.brandColor || branding.logoUrl)

    const primaryBtnStyle: React.CSSProperties = branding.buttonStyle === 'outline'
        ? { background: 'white', color: themeColor, border: `1px solid ${themeColor}` }
        : usingTenant
            ? { background: themeColor, color: '#ffffff' }
            : { background: 'linear-gradient(135deg, #af9af5, #d5c0ff)', color: '#41246f' }

    const cardRClass = cardRadiusClass(branding.cardRadius)
    const cardShadowClass = shadowClass(branding.widgetShadow)
    const btnR = radiusClass(branding.widgetRadius)
    const bgImage = cardBgCss(branding.cardBgStyle, themeColor, branding.cardBgColor2)
    const borderWidth = branding.cardBorderWidth === 'none' ? '0' : (branding.cardBorderWidth || '1px')
    const borderColor = branding.cardBorderColor || (usingTenant ? themeColor : 'rgba(255,255,255,0.6)')
    const cardBorderStyle: React.CSSProperties = { border: `${borderWidth} solid ${borderColor}` }
    const showEmailInput = methods.magic_link || methods.passkey
    const logoClasses = loginLogoContainerClasses(branding.loginLogoContainer ?? branding.logoContainer, branding.loginLogoSize)

    // Shared CSS for all social/secondary buttons — identical in preview and live
    const secondaryBtnClass = `w-full flex items-center justify-center gap-3 py-3 px-4 border-2 border-gray-100 bg-white font-bold text-sm text-gray-700 shadow-sm ${btnR}`

    return (
        <div
            className={`glass-card p-7 ${cardRClass} ${cardShadowClass}`}
            style={{ backgroundImage: bgImage, ...cardBorderStyle }}
        >
            {/* Logo + optional Demo badge overlay */}
            {branding.showLogo && branding.logoUrl ? (
                <div className="flex justify-center mb-5">
                    <div className="relative inline-flex">
                        <div className={`bg-white shadow-lg border border-border/40 ${logoClasses} ${branding.loginLogoContainer === 'wide' ? '' : 'flex items-center justify-center'}`}>
                            <img src={branding.logoUrl} alt={branding.companyName} className={branding.loginLogoContainer === 'wide' ? 'w-full h-auto block' : 'w-full h-full object-contain'} />
                        </div>
                        {branding.showDemoBadge ? <DemoBadge className="absolute -bottom-2 -right-2" /> : null}
                    </div>
                </div>
            ) : branding.showDemoBadge ? (
                <div className="flex justify-center mb-5">
                    <DemoBadge />
                </div>
            ) : null}

            {/* Title / Subtitle */}
            {(branding.showTitle || branding.showSubtitle) ? (
                <div className="mb-5 text-center">
                    {branding.showTitle && branding.loginTitle ? (
                        <p className="text-xl font-black tracking-tight text-gray-800">{branding.loginTitle}</p>
                    ) : null}
                    {branding.showSubtitle && branding.loginSubtitle ? (
                        <p className={`${branding.showTitle ? 'mt-1' : ''} text-xs font-semibold text-gray-400`}>
                            {branding.loginSubtitle}
                        </p>
                    ) : null}
                </div>
            ) : null}

            {/* Method list — or custom children (e.g. MFA form) */}
            {children ?? (
                <div className="space-y-3">
                    {/* Email input — same element in both modes */}
                    {showEmailInput ? (
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="email"
                                placeholder="you@example.com"
                                readOnly={!interactive}
                                value={interactive && handlers ? handlers.email : ''}
                                onChange={interactive && handlers ? e => handlers.setEmail(e.target.value) : undefined}
                                required={interactive && methods.magic_link}
                                autoFocus={interactive}
                                className={`w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 text-sm font-semibold outline-none focus:ring-2 transition-all ${btnR}`}
                                style={{ outlineColor: themeColor }}
                            />
                        </div>
                    ) : null}

                    {methodOrder.map(method => {
                        if (method === 'magic_link') {
                            if (!methods.magic_link) return null
                            const btn = (
                                <button
                                    key={method}
                                    type={interactive ? 'submit' : 'button'}
                                    disabled={interactive ? (handlers?.loading || !handlers?.email) : false}
                                    className={`w-full flex items-center justify-center gap-2 py-3 font-black text-sm transition-all hover:scale-[1.02] disabled:opacity-50 shadow-md ${btnR}`}
                                    style={primaryBtnStyle}
                                >
                                    {interactive && handlers?.loading
                                        ? <Loader2 className="w-4 h-4 animate-spin" />
                                        : <>Send Magic Link <ArrowRight className="w-4 h-4" /></>}
                                </button>
                            )
                            return interactive && handlers
                                ? <form key={method} onSubmit={handlers.onMagicLink}>{btn}</form>
                                : btn
                        }

                        if (method === 'passkey') {
                            if (!methods.passkey) return null
                            return (
                                <button
                                    key={method}
                                    type="button"
                                    onClick={interactive ? handlers?.onPasskey : undefined}
                                    disabled={interactive ? (handlers?.passkeyLoading || handlers?.loading || !handlers?.email?.trim()) : false}
                                    className={`${secondaryBtnClass} ${interactive ? 'hover:bg-gray-50 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed' : ''}`}
                                >
                                    {interactive && handlers?.passkeyLoading
                                        ? <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
                                        : <KeyRound className="w-5 h-5 text-slate-600" />}
                                    Continue with Passkey
                                </button>
                            )
                        }

                        if (method === 'google') {
                            if (!methods.google) return null
                            return (
                                <button
                                    key={method}
                                    type="button"
                                    onClick={interactive ? handlers?.onGoogle : undefined}
                                    disabled={interactive ? (handlers?.passkeyLoading || handlers?.loading) : false}
                                    className={`${secondaryBtnClass} ${interactive ? 'hover:bg-gray-50 hover:-translate-y-0.5' : ''}`}
                                >
                                    <GoogleIcon />
                                    Continue with Google
                                </button>
                            )
                        }

                        if (method === 'microsoft') {
                            if (!methods.microsoft) return null
                            return (
                                <button
                                    key={method}
                                    type="button"
                                    onClick={interactive ? handlers?.onMicrosoft : undefined}
                                    disabled={interactive ? (handlers?.passkeyLoading || handlers?.loading) : false}
                                    className={`${secondaryBtnClass} ${interactive ? 'hover:bg-gray-50 hover:-translate-y-0.5' : ''}`}
                                >
                                    <MicrosoftIcon />
                                    Continue with Microsoft
                                </button>
                            )
                        }

                        return null
                    })}

                    {error && (
                        <p className="text-xs font-bold text-red-400 bg-red-50 rounded-2xl px-4 py-2">{error}</p>
                    )}

                    {showMagicLinkUnavailable && (
                        <div className={`${btnR} border border-amber-100 bg-amber-50 px-4 py-3 text-left`}>
                            <p className="text-sm font-bold text-amber-800">Magic link is not available</p>
                            <p className="mt-1 text-xs font-medium text-amber-700">
                                This Rooiam instance does not currently have email delivery configured.
                            </p>
                        </div>
                    )}

                </div>
            )}

            {/* Powered by */}
            {branding.showPoweredBy ? (
                <div className="mt-6 flex justify-center">
                    <img
                        src="/rooiam-powered-by.svg"
                        alt="Powered by Rooiam"
                        className="opacity-30"
                        style={{ height: '12px', width: 'auto', display: 'block' }}
                    />
                </div>
            ) : null}
        </div>
    )
}

function GoogleIcon() {
    return (
        <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
    )
}

function MicrosoftIcon() {
    return (
        <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#F25022" d="M1 1h10v10H1z" />
            <path fill="#7FBA00" d="M13 1h10v10H13z" />
            <path fill="#00A4EF" d="M1 13h10v10H1z" />
            <path fill="#FFB900" d="M13 13h10v10H13z" />
        </svg>
    )
}
