import { useEffect, useRef, useState } from 'react'
import { Check, ImagePlus, Loader2, Trash2 } from 'lucide-react'

import PortalPageHeader from '../../components/portal/PortalPageHeader'
import { resolveApiAssetUrl } from '../../lib/api-base'
import { tenantAuthApi } from '../../lib/auth-api'
import type { MeResponse } from '../../lib/portal-types'

type Props = {
    user: MeResponse | null
    setUser: React.Dispatch<React.SetStateAction<MeResponse | null>>
    demoMode?: boolean
}

export default function PortalMyProfile({ user, setUser, demoMode = false }: Props) {
    const [displayName, setDisplayName] = useState(user?.display_name || '')
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '')
    const [saving, setSaving] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState('')
    const avatarInputRef = useRef<HTMLInputElement | null>(null)

    const [newEmail, setNewEmail] = useState('')
    const [emailChangeStatus, setEmailChangeStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')
    const [emailChangeMessage, setEmailChangeMessage] = useState('')
    const [editingEmail, setEditingEmail] = useState(false)

    useEffect(() => {
        setDisplayName(user?.display_name || '')
        setAvatarUrl(user?.avatar_url || '')
    }, [user?.avatar_url, user?.display_name])

    useEffect(() => {
        const nextDisplayName = displayName.trim()
        const currentDisplayName = (user?.display_name || '').trim()
        if (nextDisplayName === currentDisplayName) {
            return
        }

        const timeout = window.setTimeout(async () => {
            setSaving(true)
            setError('')
            try {
                const updated = await tenantAuthApi.updateProfile({
                    display_name: nextDisplayName || null,
                })
                setUser(current => current ? { ...current, ...updated } : updated)
                setSaved(true)
                window.setTimeout(() => setSaved(false), 2500)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not save profile.')
            } finally {
                setSaving(false)
            }
        }, 600)

        return () => window.clearTimeout(timeout)
    }, [displayName, setUser, user?.display_name])

    const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/')) {
            setError('Use an image file.')
            event.target.value = ''
            return
        }

        setUploading(true)
        setError('')
        try {
            const result = await tenantAuthApi.uploadAvatar(file)
            setAvatarUrl(result.url)
            setUser(current => current ? { ...current, ...result.user } : result.user)
            setSaved(true)
            window.setTimeout(() => setSaved(false), 2500)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not upload avatar.')
        } finally {
            setUploading(false)
            event.target.value = ''
        }
    }

    const handleRemoveAvatar = async () => {
        setSaving(true)
        setError('')
        try {
            const updated = await tenantAuthApi.updateProfile({
                avatar_url: '',
            })
            setAvatarUrl('')
            setUser(current => current ? { ...current, ...updated } : updated)
            setSaved(true)
            window.setTimeout(() => setSaved(false), 2500)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not remove avatar.')
        } finally {
            setSaving(false)
        }
    }

    const handleRequestEmailChange = async () => {
        if (!newEmail.trim()) {
            setEmailChangeStatus('error')
            setEmailChangeMessage('Enter a new email address.')
            return
        }
        setEmailChangeStatus('loading')
        setEmailChangeMessage('')
        try {
            const res = await tenantAuthApi.requestEmailChange(newEmail)
            setEmailChangeStatus('sent')
            setEmailChangeMessage(res.message || 'Verification link sent to the new email address.')
        } catch (err) {
            setEmailChangeStatus('error')
            setEmailChangeMessage(err instanceof Error ? err.message : 'Could not request email change.')
        }
    }

    const previewSrc = resolveApiAssetUrl(avatarUrl) || '/rooiam-app-white.svg'

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader
                title="My Profile"
                description={`Your display name and uploaded avatar shown to workspace owners and workspace admins.${demoMode ? ' Demo profile changes save automatically too.' : ' Changes save automatically.'}`}
            />

            <div className="glass-card rounded-4xl p-6 sm:p-8 max-w-lg">
                <div className="space-y-7">
                    <div className="flex items-center gap-5">
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-border bg-white shadow-md">
                            <img
                                src={previewSrc}
                                alt="Avatar preview"
                                className="h-full w-full object-cover scale-[1.06]"
                                onError={e => { (e.currentTarget as HTMLImageElement).src = '/rooiam-app-white.svg' }}
                            />
                        </div>
                        <div>
                            <p className="font-black text-sm mb-1">Profile Picture</p>
                            <p className="text-xs font-semibold text-muted-foreground">
                                Upload an image for your personal tenant avatar. Unsupported or oversized files are rejected automatically.
                            </p>
                        </div>
                    </div>

                    <div>
                        <label className="wizard-label">Display Name</label>
                        <input
                            type="text"
                            value={displayName}
                            onChange={e => setDisplayName(e.target.value)}
                            placeholder="Your name"
                            className="wizard-input"
                        />
                    </div>

                    <div>
                        <label className="wizard-label">Avatar</label>
                        <input
                            ref={avatarInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleAvatarUpload}
                        />
                        <div className="rounded-3xl border border-border bg-muted/20 p-4">
                            <div className="flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => avatarInputRef.current?.click()}
                                    disabled={uploading}
                                    className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-xs font-bold hover:bg-muted/30 disabled:opacity-60"
                                >
                                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                                    {uploading ? 'Uploading...' : 'Upload Avatar'}
                                </button>
                                {avatarUrl ? (
                                    <button
                                        type="button"
                                        onClick={handleRemoveAvatar}
                                        disabled={saving}
                                        className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        Remove
                                    </button>
                                ) : null}
                            </div>
                            {avatarUrl ? (
                                <p className="mt-3 break-all text-[11px] font-mono text-muted-foreground">{avatarUrl}</p>
                            ) : null}
                        </div>
                        <p className="text-xs font-semibold text-muted-foreground mt-1.5">
                            Uses the same server-side image size limit as workspace branding uploads.
                        </p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                        <label className="wizard-label">Email Address</label>
                        {!editingEmail ? (
                            <div className="flex items-center gap-3 mt-1">
                                <span className="wizard-input !bg-muted/30 cursor-not-allowed inline-flex items-center opacity-70 flex-1">
                                    {user?.email || 'No primary email'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingEmail(true)
                                        setEmailChangeStatus('idle')
                                        setEmailChangeMessage('')
                                        setNewEmail('')
                                    }}
                                    className="shrink-0 px-4 py-2 bg-slate-800 text-white text-[11px] font-bold rounded-xl hover:bg-slate-700 transition duration-200"
                                >
                                    Change
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3 mt-1">
                                <div className="flex items-center gap-3">
                                    <input
                                        type="email"
                                        value={newEmail}
                                        onChange={e => setNewEmail(e.target.value)}
                                        placeholder="new@example.com"
                                        className="flex-1 wizard-input text-sm"
                                        disabled={emailChangeStatus === 'loading' || emailChangeStatus === 'sent'}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') void handleRequestEmailChange()
                                            if (e.key === 'Escape') setEditingEmail(false)
                                        }}
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        onClick={handleRequestEmailChange}
                                        disabled={emailChangeStatus === 'loading' || emailChangeStatus === 'sent'}
                                        className="shrink-0 px-4 py-2 bg-slate-800 text-white text-[11px] font-bold rounded-xl hover:bg-slate-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                                    >
                                        {emailChangeStatus === 'loading' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        {emailChangeStatus === 'loading' ? 'Sending...' : emailChangeStatus === 'sent' ? 'Sent!' : 'Send link'}
                                    </button>
                                    {emailChangeStatus !== 'sent' && emailChangeStatus !== 'loading' && (
                                        <button
                                            type="button"
                                            onClick={() => setEditingEmail(false)}
                                            className="shrink-0 px-4 py-2 bg-muted text-foreground text-[11px] font-bold rounded-xl hover:bg-muted/80"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                                {emailChangeMessage && (
                                    <p className={`text-[11px] font-bold px-3 py-2 rounded-xl ${emailChangeStatus === 'sent' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                                        {emailChangeMessage}
                                    </p>
                                )}
                            </div>
                        )}
                        {!editingEmail && (
                            <p className="text-xs font-semibold text-muted-foreground mt-1.5 pl-1">
                                A verification link will be sent to your new email address.
                            </p>
                        )}
                    </div>

                    {error ? (
                        <p className="text-sm font-bold text-red-500 bg-red-50 rounded-2xl px-4 py-3">{error}</p>
                    ) : null}

                    <div className="flex items-center gap-2 text-sm font-bold text-muted-foreground">
                        {saving || uploading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Saving profile…
                            </>
                        ) : saved ? (
                            <>
                                <Check className="h-4 w-4 text-emerald-600" />
                                <span className="text-emerald-700">Saved automatically.</span>
                            </>
                        ) : (
                            'Profile updates apply automatically.'
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
