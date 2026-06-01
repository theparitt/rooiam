import React from 'react'
import { ImagePlus, Loader2, Palette, Trash2 } from 'lucide-react'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalSectionCard from '../../components/portal/PortalSectionCard'
import PortalPrimarySaveButton from '../../components/portal/PortalPrimarySaveButton'
import PortalReadonlyNotice from '../../components/portal/PortalReadonlyNotice'
import PortalHelpLabel from '../../components/portal/PortalHelpLabel'
import PortalInlineMessage from '../../components/portal/PortalInlineMessage'
import PortalFormField from '../../components/portal/PortalFormField'
import { apiFetch, getApiBase, resolveApiAssetUrl } from '../../lib/api-base'
import { BrandingForm, BrandingUploadResponse, DEFAULT_BRAND, LogoContainer, LogoSize } from '../../lib/portal-types'

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    const red = r / 255
    const green = g / 255
    const blue = b / 255
    const max = Math.max(red, green, blue)
    const min = Math.min(red, green, blue)
    let h = 0
    let s = 0
    const l = (max + min) / 2

    if (max !== min) {
        const d = max - min
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
        switch (max) {
            case red:
                h = (green - blue) / d + (green < blue ? 6 : 0)
                break
            case green:
                h = (blue - red) / d + 2
                break
            default:
                h = (red - green) / d + 4
                break
        }
        h /= 6
    }

    return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    if (s === 0) {
        const value = Math.round(l * 255)
        return [value, value, value]
    }

    const hueToRgb = (p: number, q: number, t: number): number => {
        let next = t
        if (next < 0) next += 1
        if (next > 1) next -= 1
        if (next < 1 / 6) return p + (q - p) * 6 * next
        if (next < 1 / 2) return q
        if (next < 2 / 3) return p + (q - p) * (2 / 3 - next) * 6
        return p
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    return [
        Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
        Math.round(hueToRgb(p, q, h) * 255),
        Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
    ]
}

function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (value: number) => value.toString(16).padStart(2, '0')
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

async function extractBrandColorFromImage(src: string): Promise<string> {
    const response = await fetch(src, { credentials: 'include' })
    if (!response.ok) throw new Error('Could not read that logo.')

    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)

    try {
        const image = new Image()
        image.decoding = 'async'
        const loaded = new Promise<void>((resolve, reject) => {
            image.onload = () => resolve()
            image.onerror = () => reject(new Error('Could not load that logo.'))
        })
        image.src = objectUrl
        await loaded

        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (!ctx) throw new Error('Could not inspect that logo.')

        const sampleSize = 36
        canvas.width = sampleSize
        canvas.height = sampleSize
        ctx.drawImage(image, 0, 0, sampleSize, sampleSize)

        const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize)

        let weightedR = 0
        let weightedG = 0
        let weightedB = 0
        let totalWeight = 0
        let fallbackR = 0
        let fallbackG = 0
        let fallbackB = 0
        let fallbackWeight = 0

        for (let index = 0; index < data.length; index += 4) {
            const alpha = data[index + 3] / 255
            if (alpha < 0.12) continue

            const r = data[index]
            const g = data[index + 1]
            const b = data[index + 2]
            const [, s, l] = rgbToHsl(r, g, b)
            const vivid = s > 0.12 && l > 0.16 && l < 0.9
            const weight = alpha * (0.35 + s * 1.25)

            fallbackR += r * alpha
            fallbackG += g * alpha
            fallbackB += b * alpha
            fallbackWeight += alpha

            if (!vivid) continue
            weightedR += r * weight
            weightedG += g * weight
            weightedB += b * weight
            totalWeight += weight
        }

        const useFallback = totalWeight <= 0.001
        const baseWeight = useFallback ? fallbackWeight : totalWeight
        if (baseWeight <= 0.001) throw new Error('Could not generate a color from that logo.')

        const rawR = Math.round((useFallback ? fallbackR : weightedR) / baseWeight)
        const rawG = Math.round((useFallback ? fallbackG : weightedG) / baseWeight)
        const rawB = Math.round((useFallback ? fallbackB : weightedB) / baseWeight)
        const [h, s, l] = rgbToHsl(rawR, rawG, rawB)
        const tunedS = clamp(s < 0.24 ? s * 1.55 + 0.12 : s, 0.38, 0.72)
        const tunedL = clamp(l, 0.42, 0.62)
        const [finalR, finalG, finalB] = hslToRgb(h, tunedS, tunedL)

        return rgbToHex(finalR, finalG, finalB)
    } finally {
        URL.revokeObjectURL(objectUrl)
    }
}


/** Upload thumbnail — always fixed square, never changes size */
function LogoContainerPreview({
    logoUrl,
    companyName,
    size = 'md',
}: {
    logoUrl?: string | null
    companyName: string
    size?: 'md' | 'lg'
}) {
    const previewSrc = resolveApiAssetUrl(logoUrl) || '/rooiam-app-white.svg'
    return (
        <div className="shrink-0 flex items-center justify-center overflow-hidden border border-border bg-white shadow-sm h-16 w-16 rounded-2xl">
            <img
                src={previewSrc}
                alt={companyName}
                className={logoUrl ? 'h-full w-full object-cover' : size === 'lg' ? 'h-10 w-10 object-contain' : 'h-8 w-8 object-contain'}
                onError={e => { (e.currentTarget as HTMLImageElement).src = '/rooiam-app-white.svg' }}
            />
        </div>
    )
}

/** Live preview — reflects the actual container shape */
function IconLivePreview({
    logoUrl,
    companyName,
    container,
}: {
    logoUrl?: string | null
    companyName: string
    container: LogoContainer | string
}) {
    const previewSrc = resolveApiAssetUrl(logoUrl) || '/rooiam-app-white.svg'
    const isWide = container === 'wide'
    const dims = isWide ? 'h-12 w-32' : 'h-16 w-16'
    const shape = container === 'circle' ? 'rounded-full' : 'rounded-2xl'
    return (
        <div className={`shrink-0 flex items-center justify-center overflow-hidden border border-border bg-white shadow-sm ${dims} ${shape}`}>
            <img
                src={previewSrc}
                alt={companyName}
                className={logoUrl ? 'h-full w-full object-cover' : 'h-10 w-10 object-contain'}
                onError={e => { (e.currentTarget as HTMLImageElement).src = '/rooiam-app-white.svg' }}
            />
        </div>
    )
}

function loginLogoDim(size: LogoSize | string): string {
    if (size === 'small') return 'w-16 h-16'
    if (size === 'large') return 'w-32 h-32'
    return 'w-24 h-24' // medium
}

function LoginLogoPreview({
    logoUrl,
    companyName,
    container,
    size,
}: {
    logoUrl?: string | null
    companyName: string
    container: LogoContainer | string
    size: LogoSize | string
}) {
    const previewSrc = resolveApiAssetUrl(logoUrl) || '/rooiam-app-white.svg'
    const isWide = container === 'wide'
    const wideWidth = size === 'small' ? 'w-40' : size === 'large' ? 'w-72' : 'w-56'
    const dim = isWide ? wideWidth : loginLogoDim(size)
    const shape = container === 'circle' ? 'rounded-full' : 'rounded-xl'
    const base = `overflow-hidden border border-border bg-white shadow-sm${isWide ? '' : ' flex items-center justify-center'}`
    return (
        <div className={`${base} ${dim} ${shape}`}>
            <img
                src={previewSrc}
                alt={companyName}
                className={logoUrl ? (isWide ? 'w-full h-full object-cover' : 'w-full h-full object-cover') : 'h-8 w-8 object-contain'}
                onError={e => { (e.currentTarget as HTMLImageElement).src = '/rooiam-app-white.svg' }}
            />
        </div>
    )
}

type Props = {
    currentOrg: {
        id: string
        name: string
    } | null
    canManageBranding: boolean
    brandingForm: BrandingForm
    setBrandingForm: React.Dispatch<React.SetStateAction<BrandingForm>>
    savingBranding: boolean
    saveMessage: string
    onSaveBranding: (e: React.FormEvent) => void
    maxLogoBytes: number
}

export default function PortalWorkspaceBranding({
    currentOrg,
    canManageBranding,
    brandingForm,
    setBrandingForm,
    savingBranding,
    saveMessage,
    onSaveBranding,
    maxLogoBytes,
}: Props) {
    const API = getApiBase()
    const iconInputRef = React.useRef<HTMLInputElement | null>(null)
    const loginLogoInputRef = React.useRef<HTMLInputElement | null>(null)
    const [uploadError, setUploadError] = React.useState('')
    const [uploadingField, setUploadingField] = React.useState<'icon_url' | 'login_logo_url' | null>(null)
    const [colorSuggestionError, setColorSuggestionError] = React.useState('')
    const [generatingBrandColor, setGeneratingBrandColor] = React.useState(false)
    const [workspaceIconHintOpen, setWorkspaceIconHintOpen] = React.useState(false)
    const previewName = brandingForm.name || currentOrg?.name || 'Company'
    const previewColor = brandingForm.brand_color || DEFAULT_BRAND
    const logoSource = brandingForm.login_logo_url || brandingForm.icon_url

    const generateBrandColorFromLogo = React.useCallback(async () => {
        const source = resolveApiAssetUrl(logoSource)
        if (!source) {
            setColorSuggestionError('Upload a login logo or workspace icon first.')
            return
        }

        setGeneratingBrandColor(true)
        setColorSuggestionError('')
        try {
            const nextColor = await extractBrandColorFromImage(source)
            setBrandingForm(current => ({ ...current, brand_color: nextColor }))
        } catch (error) {
            setColorSuggestionError(error instanceof Error ? error.message : 'Could not generate a brand color from that logo.')
        } finally {
            setGeneratingBrandColor(false)
        }
    }, [logoSource, setBrandingForm])

    const makeUploadHandler = (field: 'icon_url' | 'login_logo_url') =>
        async (event: React.ChangeEvent<HTMLInputElement>) => {
            const file = event.target.files?.[0]
            if (!file) return
            if (!file.type.startsWith('image/')) { setUploadError('Use an image file.'); return }
            if (file.size > maxLogoBytes) {
                const mb = (maxLogoBytes / (1024 * 1024)).toFixed(0)
                setUploadError(`Image is too large. Maximum size is ${mb}MB.`)
                return
            }
            if (!currentOrg) {
                setUploadError('Select a workspace first.')
                return
            }
            setUploadingField(field)
            setUploadError('')
            try {
                const formData = new FormData()
                formData.append('file', file)
                const kind = field === 'icon_url' ? 'icon' : 'login-logo'
                const res = await apiFetch(`${API}/orgs/current/branding/upload?kind=${encodeURIComponent(kind)}`, {
                    method: 'POST',
                    body: formData,
                })
                const data = await res.json().catch(() => ({})) as Partial<BrandingUploadResponse> & {
                    error?: { message?: string }
                }
                if (!res.ok || !data.url) {
                    throw new Error(data?.error?.message || 'Could not upload that image.')
                }
                setBrandingForm(current => ({ ...current, [field]: data.url as string }))
                setUploadError('')
            } catch (err) {
                setUploadError(err instanceof Error ? err.message : 'Could not upload that image.')
            } finally {
                setUploadingField(null)
                event.target.value = ''
            }
        }

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader title="Workspace Branding" />

            {!currentOrg ? (
                <PortalReadonlyNotice title="No workspace selected">Select a workspace first.</PortalReadonlyNotice>
            ) : !canManageBranding ? (
                <PortalReadonlyNotice>You do not have permission to change branding.</PortalReadonlyNotice>
            ) : (
                <div className="grid max-w-5xl gap-6 xl:grid-cols-[0.95fr_0.85fr]">
                    <PortalSectionCard icon={Palette} title="Workspace Identity">
                        <form onSubmit={onSaveBranding} className="space-y-5">
                            <div className="space-y-4">
                                {/* Workspace Icon */}
                                <div className="space-y-3">
                                    <div className="relative">
                                        <PortalHelpLabel
                                            label="Workspace Icon"
                                            help="Used as the workspace avatar and the default image on tenant login pages unless you upload a separate Login Widget Logo."
                                        />
                                        {workspaceIconHintOpen ? (
                                            <div className="absolute left-0 top-7 z-10 max-w-xs rounded-2xl border border-border bg-white px-3 py-2 text-xs font-medium text-muted-foreground shadow-lg">
                                                Used as the workspace avatar and the default image on tenant login pages unless you upload a separate Login Widget Logo.
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="flex items-center gap-4 rounded-3xl border border-border bg-muted/20 p-4">
                                        <LogoContainerPreview
                                            logoUrl={brandingForm.icon_url}
                                            companyName={previewName}
                                            size="lg"
                                        />
                                        <div className="space-y-2">
                                            <input ref={iconInputRef} type="file" accept="image/*" className="hidden" onChange={makeUploadHandler('icon_url')} />
                                            <div className="flex flex-wrap gap-2">
                                                <button type="button" onClick={() => iconInputRef.current?.click()} disabled={uploadingField !== null} className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-bold hover:bg-muted/30 disabled:opacity-60">
                                                    {uploadingField === 'icon_url' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                                                    {uploadingField === 'icon_url' ? 'Uploading...' : 'Upload Icon'}
                                                </button>
                                                {brandingForm.icon_url ? (
                                                    <button type="button" onClick={() => setBrandingForm(current => ({ ...current, icon_url: '' }))} className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100">
                                                        <Trash2 className="h-4 w-4" />
                                                        Remove
                                                    </button>
                                                ) : null}
                                            </div>
                                            <div>
                                                <p className="mb-1.5 text-xs font-bold text-muted-foreground">Icon Shape</p>
                                                <div className="flex gap-2">
                                                    {(['square', 'circle'] as const).map(shape => (
                                                        <button key={shape} type="button" onClick={() => setBrandingForm(current => ({ ...current, icon_container: shape }))}
                                                            className={`flex items-center justify-center border text-xs font-bold transition-colors px-2 py-1 ${brandingForm.icon_container === shape ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-border bg-background text-muted-foreground hover:bg-muted/30'} ${shape === 'circle' ? 'rounded-full' : 'rounded-lg'}`}
                                                        >
                                                            {shape === 'circle' ? '●' : '■'}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Login Widget Logo */}
                                <div className="space-y-3">
                                    <label className="text-xs font-bold text-muted-foreground">Login Widget Logo</label>
                                    <div className="flex items-center gap-4 rounded-3xl border border-border bg-muted/20 p-4">
                                        <LogoContainerPreview
                                            logoUrl={brandingForm.login_logo_url}
                                            companyName={previewName}
                                            size="lg"
                                        />
                                        <div className="space-y-2">
                                            <input ref={loginLogoInputRef} type="file" accept="image/*" className="hidden" onChange={makeUploadHandler('login_logo_url')} />
                                            <div className="flex flex-wrap gap-2">
                                                <button type="button" onClick={() => loginLogoInputRef.current?.click()} disabled={uploadingField !== null} className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-bold hover:bg-muted/30 disabled:opacity-60">
                                                    {uploadingField === 'login_logo_url' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                                                    {uploadingField === 'login_logo_url' ? 'Uploading...' : 'Upload Logo'}
                                                </button>
                                                {brandingForm.login_logo_url ? (
                                                    <button type="button" onClick={() => setBrandingForm(current => ({ ...current, login_logo_url: '' }))} className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100">
                                                        <Trash2 className="h-4 w-4" />
                                                        Remove
                                                    </button>
                                                ) : null}
                                            </div>
                                            <div>
                                                <p className="mb-1.5 text-xs font-bold text-muted-foreground">Logo Shape</p>
                                                <div className="flex gap-2">
                                                    {(['square', 'circle', 'wide'] as const).map(shape => (
                                                        <button key={shape} type="button" onClick={() => setBrandingForm(current => ({ ...current, login_logo_container: shape }))}
                                                            className={`flex items-center justify-center border text-xs font-bold transition-colors px-2 py-1 ${brandingForm.login_logo_container === shape ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-border bg-background text-muted-foreground hover:bg-muted/30'} ${shape === 'circle' ? 'rounded-full' : shape === 'wide' ? 'rounded-lg w-16' : 'rounded-lg'}`}
                                                        >
                                                            {shape === 'circle' ? '●' : shape === 'wide' ? '▬' : '■'}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="mb-1.5 text-xs font-bold text-muted-foreground">Logo Size</p>
                                                <div className="flex gap-2">
                                                    {(['small', 'medium', 'large'] as const).map(sz => (
                                                        <button key={sz} type="button" onClick={() => setBrandingForm(current => ({ ...current, login_logo_size: sz }))}
                                                            className={`rounded-lg border px-3 py-1 text-xs font-bold transition-colors ${brandingForm.login_logo_size === sz ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-border bg-background text-muted-foreground hover:bg-muted/30'}`}
                                                        >
                                                            {sz.charAt(0).toUpperCase() + sz.slice(1)}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                {uploadError ? <PortalInlineMessage tone="error">{uploadError}</PortalInlineMessage> : null}

                                <div className="space-y-4">
                                    <PortalFormField label="Workspace Name">
                                        <input
                                            type="text"
                                            value={brandingForm.name}
                                            onChange={e => setBrandingForm(current => ({ ...current, name: e.target.value }))}
                                            className="w-full rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-primary"
                                            placeholder="My Workspace"
                                            required
                                        />
                                    </PortalFormField>

                                    <PortalFormField label="Brand Color">
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="color"
                                                value={brandingForm.brand_color}
                                                onChange={e => setBrandingForm(current => ({ ...current, brand_color: e.target.value }))}
                                                className="h-12 w-14 cursor-pointer rounded-2xl border border-border bg-background p-1"
                                            />
                                            <input
                                                type="text"
                                                value={brandingForm.brand_color}
                                                onChange={e => setBrandingForm(current => ({ ...current, brand_color: e.target.value }))}
                                                className="flex-1 rounded-2xl border border-border bg-muted/50 px-4 py-3 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-primary"
                                                placeholder={DEFAULT_BRAND}
                                            />
                                            <button
                                                type="button"
                                                onClick={generateBrandColorFromLogo}
                                                disabled={generatingBrandColor || !logoSource}
                                                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-4 py-3 text-xs font-bold text-slate-700 transition-colors hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {generatingBrandColor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Palette className="h-4 w-4" />}
                                                {generatingBrandColor ? 'Generating...' : 'Generate from logo'}
                                            </button>
                                        </div>
                                        {colorSuggestionError ? <PortalInlineMessage tone="error">{colorSuggestionError}</PortalInlineMessage> : null}
                                    </PortalFormField>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3 pt-1">
                                <PortalPrimarySaveButton
                                    loading={savingBranding}
                                    label="Save Branding"
                                    type="submit"
                                />
                                {saveMessage ? <span className="text-sm font-bold text-emerald-600">{saveMessage}</span> : null}
                            </div>
                        </form>
                    </PortalSectionCard>

                    <PortalSectionCard icon={Palette} title="Live Identity Preview">
                        <div className="space-y-4">
                            {/* Workspace icon preview */}
                            <div>
                                <p className="mb-2 text-xs font-bold text-muted-foreground">Workspace Icon</p>
                                <div className="rounded-[28px] border border-border bg-muted/20 p-5">
                                    <div
                                        className="rounded-[24px] border border-white/60 bg-white p-5 shadow-sm"
                                        style={{ boxShadow: `0 18px 40px -24px ${previewColor}66` }}
                                    >
                                        <div className="flex items-center gap-4">
                                            <IconLivePreview
                                                logoUrl={brandingForm.icon_url}
                                                companyName={previewName}
                                                container={brandingForm.icon_container}
                                            />
                                            <div className="min-w-0">
                                                <p className="truncate text-lg font-black text-slate-900">{previewName}</p>
                                                <div className="mt-2 flex items-center gap-2">
                                                    <span
                                                        className="inline-flex h-3 w-3 rounded-full border border-white shadow-sm"
                                                        style={{ background: previewColor }}
                                                    />
                                                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{previewColor}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* Login widget logo preview */}
                            <div>
                                <p className="mb-2 text-xs font-bold text-muted-foreground">Login Widget Logo</p>
                                <div className="rounded-[28px] border border-border bg-muted/20 p-5">
                                    <div
                                        className="rounded-[24px] border border-white/60 bg-white p-5 shadow-sm flex justify-center"
                                        style={{ boxShadow: `0 18px 40px -24px ${previewColor}66` }}
                                    >
                                        <LoginLogoPreview
                                            logoUrl={brandingForm.login_logo_url}
                                            companyName={previewName}
                                            container={brandingForm.login_logo_container}
                                            size={brandingForm.login_logo_size}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </PortalSectionCard>
                </div>
            )}
        </div>
    )
}
