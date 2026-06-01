import { DEFAULT_LOGIN_METHOD_ORDER, LoginMethodKey, WidgetRadius, WidgetShadow } from './portal-types'

export const LOGIN_METHOD_LABELS: Record<LoginMethodKey, string> = {
    magic_link: 'Magic Link',
    passkey: 'Passkey',
    google: 'Google',
    microsoft: 'Microsoft',
}

export function normalizeLoginMethodOrder(order?: string[] | null): LoginMethodKey[] {
    const seen = new Set<LoginMethodKey>()
    const cleaned: LoginMethodKey[] = []
    for (const item of order || []) {
        if ((DEFAULT_LOGIN_METHOD_ORDER as readonly string[]).includes(item) && !seen.has(item as LoginMethodKey)) {
            seen.add(item as LoginMethodKey)
            cleaned.push(item as LoginMethodKey)
        }
    }
    for (const fallback of DEFAULT_LOGIN_METHOD_ORDER) {
        if (!seen.has(fallback)) {
            seen.add(fallback)
            cleaned.push(fallback)
        }
    }
    return cleaned
}

export function normalizeWorkspaceIconContainer(container?: string | null): 'circle' | 'square' {
    return container === 'circle' ? 'circle' : 'square'
}

export function workspaceIconContainerClass(container?: string | null): string {
    return normalizeWorkspaceIconContainer(container) === 'circle' ? 'rounded-full' : 'rounded-2xl'
}

export function radiusClass(radius?: WidgetRadius | string | null, card = false): string {
    switch (radius) {
        case 'sharp':
            return 'rounded-none'
        case 'compact':
            return 'rounded-xl'
        case 'pill':
            return card ? 'rounded-3xl' : 'rounded-[999px]'
        case 'rounded':
        default:
            return 'rounded-3xl'
    }
}

export function cardRadiusClass(radius?: string | null): string {
    switch (radius) {
        case 'sharp':
            return 'rounded-none'
        case 'compact':
            return 'rounded-2xl'
        case 'rounded':
        default:
            return 'rounded-3xl'
    }
}

export function shadowClass(shadow?: WidgetShadow | string | null): string {
    switch (shadow) {
        case 'none':
            return 'shadow-none'
        case 'lifted':
            return 'shadow-[0_24px_80px_rgba(15,23,42,0.18)]'
        case 'soft':
        default:
            return 'shadow-[0_12px_36px_rgba(15,23,42,0.12)]'
    }
}

export function widgetRadiusPx(radius?: WidgetRadius | string | null): number {
    switch (radius) {
        case 'sharp':
            return 0
        case 'compact':
            return 12
        case 'pill':
            return 999
        case 'rounded':
        default:
            return 24
    }
}

// Returns a CSS backgroundImage value for the login card background
export function cardBgCss(style?: string | null, brandColor?: string | null, color2?: string | null): string {
    const c1 = brandColor || '#c96b8a'
    const c2 = color2 || '#ffffff'
    switch (style) {
        case 'solid':
            return `linear-gradient(135deg, color-mix(in srgb, ${c1} 12%, white) 0%, color-mix(in srgb, ${c1} 6%, white) 100%)`
        case 'gradient-lr':
            return `linear-gradient(to right, color-mix(in srgb, ${c1} 18%, white), color-mix(in srgb, ${c2} 18%, white))`
        case 'gradient-tb':
            return `linear-gradient(to bottom, color-mix(in srgb, ${c1} 18%, white), color-mix(in srgb, ${c2} 18%, white))`
        case 'gradient-tl':
            return `linear-gradient(to bottom right, color-mix(in srgb, ${c1} 18%, white), color-mix(in srgb, ${c2} 18%, white))`
        case 'gradient-tr':
            return `linear-gradient(to bottom left, color-mix(in srgb, ${c1} 18%, white), color-mix(in srgb, ${c2} 18%, white))`
        case 'auto':
        default:
            return `radial-gradient(circle at top, color-mix(in srgb, ${c1} 14%, white) 0%, rgba(255,255,255,0.94) 55%)`
    }
}

export function widgetShadowCss(shadow?: WidgetShadow | string | null): string {
    switch (shadow) {
        case 'none':
            return 'none'
        case 'lifted':
            return '0 24px 80px rgba(15,23,42,0.18)'
        case 'soft':
        default:
            return '0 12px 36px rgba(15,23,42,0.12)'
    }
}
