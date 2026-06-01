import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, ImagePlus, Trash2 } from 'lucide-react'
import { authApi } from '@/lib/api'
import { resolveApiAssetUrl } from '@/lib/api-base'
import { useAuthStore } from '@/lib/store'
import PageHeader from '@/components/ui/PageHeader'

export default function MyProfile() {
    const { user, setUser } = useAuthStore()
    const [displayName, setDisplayName] = useState(user?.display_name || '')
    const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url || '')
    const [saving, setSaving] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState('')
    const [newEmail, setNewEmail] = useState('')
    const [emailChangeStatus, setEmailChangeStatus] = useState<'idle' | 'loading' | 'sent'>('idle')
    const [emailChangeMessage, setEmailChangeMessage] = useState('')
    const [emailChangeError, setEmailChangeError] = useState('')
    const [editingEmail, setEditingEmail] = useState(false)
    const avatarInputRef = useRef<HTMLInputElement | null>(null)

    useEffect(() => {
        setDisplayName(user?.display_name || '')
        setAvatarUrl(user?.avatar_url || '')
    }, [user?.avatar_url, user?.display_name])

    const previewSrc = resolveApiAssetUrl(avatarUrl) || '/rooiam-app-white.svg'

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
                const updated = await authApi.updateProfile({
                    display_name: nextDisplayName || null,
                })
                setUser(updated)
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
            const result = await authApi.uploadAvatar(file)
            setAvatarUrl(result.url)
            setUser(result.user)
            setSaved(true)
            setTimeout(() => setSaved(false), 2500)
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
            const updated = await authApi.updateProfile({
                avatar_url: '',
            })
            setAvatarUrl('')
            setUser(updated)
            setSaved(true)
            setTimeout(() => setSaved(false), 2500)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not remove avatar.')
        } finally {
            setSaving(false)
        }
    }

    const handleRequestEmailChange = async () => {
        if (!newEmail.trim()) return
        if (newEmail.trim() === user?.email) {
            setEditingEmail(false)
            return
        }

        setEmailChangeStatus('loading')
        setEmailChangeError('')
        try {
            const res = await authApi.requestEmailChange(newEmail.trim())
            setEmailChangeStatus('sent')
            setEmailChangeMessage(res.message)
            setTimeout(() => {
                setEditingEmail(false)
                setEmailChangeStatus('idle')
                setEmailChangeMessage('')
                setNewEmail('')
            }, 8000)
        } catch (err) {
            setEmailChangeError(err instanceof Error ? err.message : 'Could not request email change.')
            setEmailChangeStatus('idle')
        }
    }

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PageHeader
                title="My Profile"
                description="Your display name and uploaded avatar shown in the admin console. Changes save automatically."
            />

            <div className="glass-card rounded-4xl p-6 sm:p-8 max-w-lg">
                <div className="space-y-7">
                    {/* Avatar preview */}
                    <div className="flex items-center gap-5">
                        <div className="w-20 h-20 rounded-full overflow-hidden border border-border bg-white shadow-md shrink-0">
                            <img
                                src={previewSrc}
                                alt="Avatar preview"
                                className="w-full h-full object-cover scale-[1.06]"
                                onError={e => { (e.currentTarget as HTMLImageElement).src = '/rooiam-app-white.svg' }}
                            />
                        </div>
                        <div>
                            <p className="font-black text-sm mb-1">Profile Picture</p>
                            <p className="text-xs font-semibold text-muted-foreground">
                                Upload an image for your admin avatar. Unsupported or oversized files are rejected automatically.
                            </p>
                        </div>
                    </div>

                    {/* Email address */}
                    <div className="pt-2">
                        <label className="wizard-label">Email Address</label>
                        {!editingEmail ? (
                            <div className="flex items-center gap-3">
                                <span className="wizard-input !bg-muted/30 cursor-not-allowed inline-flex items-center opacity-70">
                                    {user?.email || 'No email on file'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setEditingEmail(true)}
                                    className="shrink-0 px-4 py-2 bg-slate-800 text-white text-[11px] font-bold rounded-xl hover:bg-slate-700 transition duration-200"
                                >
                                    Change
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center gap-3">
                                    <input
                                        type="email"
                                        value={newEmail}
                                        onChange={e => setNewEmail(e.target.value)}
                                        placeholder="new@email.example"
                                        className="wizard-input text-sm"
                                        disabled={emailChangeStatus !== 'idle'}
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
                                        {emailChangeStatus === 'sent' ? 'Sent!' : 'Send link'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditingEmail(false)}
                                        disabled={emailChangeStatus !== 'idle'}
                                        className="shrink-0 px-4 py-2 bg-muted text-foreground text-[11px] font-bold rounded-xl hover:bg-muted/80 disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                </div>
                                {emailChangeError && (
                                    <p className="text-sm font-bold text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">
                                        {emailChangeError}
                                    </p>
                                )}
                                {emailChangeMessage && (
                                    <p className="text-sm font-bold text-emerald-700 bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                                        {emailChangeMessage}
                                    </p>
                                )}
                            </div>
                        )}
                        {!editingEmail && (
                            <p className="text-xs font-semibold text-muted-foreground mt-1.5 pl-1">
                                An email change applies to your entire Rooiam platform account.
                            </p>
                        )}
                    </div>

                    {/* Display name */}
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

                    {error && (
                        <p className="text-sm font-bold text-red-500 bg-red-50 rounded-2xl px-4 py-3">{error}</p>
                    )}
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
