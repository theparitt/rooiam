import React from 'react'
import { AlertTriangle, Check, Link2, Loader2, Trash2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalContentCard from '../../components/portal/PortalContentCard'
import PortalSettingRow from '../../components/portal/PortalSettingRow'
import PortalInlineMessage from '../../components/portal/PortalInlineMessage'
import PortalEmptyState from '../../components/portal/PortalEmptyState'
import PortalPrimaryActionButton from '../../components/portal/PortalPrimaryActionButton'
import { tenantAuthApi, type TenantLinkedAccounts } from '../../lib/auth-api'

type Props = {
    currentLoginRedirect: string
    demoMode?: boolean
}

export default function PortalMyAccount({ currentLoginRedirect, demoMode = false }: Props) {
    const [searchParams, setSearchParams] = useSearchParams()
    const [data, setData] = React.useState<TenantLinkedAccounts | null>(null)
    const [loading, setLoading] = React.useState(true)
    const [workingProvider, setWorkingProvider] = React.useState<string | null>(null)
    const [error, setError] = React.useState('')
    const [status, setStatus] = React.useState('')
    const [deleteRequesting, setDeleteRequesting] = React.useState(false)
    const [deleteRequested, setDeleteRequested] = React.useState(false)
    const [deleteError, setDeleteError] = React.useState('')

    const load = React.useCallback(async () => {
        setLoading(true)
        try {
            const linked = await tenantAuthApi.linkedAccounts()
            setData(linked)
            setError('')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load linked accounts.')
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        void load()
    }, [load])

    React.useEffect(() => {
        const provider = searchParams.get('link_provider')
        const result = searchParams.get('link_result')
        const message = searchParams.get('link_message')
        if (!provider || !result) return

        if (result === 'success') {
            setStatus(message || `${provider} linked successfully.`)
            void load()
        } else {
            setError(message || `Could not link ${provider}.`)
        }

        const next = new URLSearchParams(searchParams)
        next.delete('link_provider')
        next.delete('link_result')
        next.delete('link_message')
        setSearchParams(next, { replace: true })
    }, [load, searchParams, setSearchParams])

    const startLink = async (provider: 'google' | 'microsoft') => {
        if (demoMode) return
        setWorkingProvider(provider)
        setError('')
        setStatus('')
        try {
            const res = await tenantAuthApi.startLinkProvider(provider, currentLoginRedirect)
            window.location.href = res.authorization_url
        } catch (err) {
            setError(err instanceof Error ? err.message : `Could not start ${provider} linking.`)
            setWorkingProvider(null)
        }
    }

    const unlinkProvider = async (provider: 'google' | 'microsoft') => {
        if (demoMode) return
        setWorkingProvider(provider)
        setError('')
        setStatus('')
        try {
            const res = await tenantAuthApi.unlinkProvider(provider)
            setStatus(res.message || `${provider} unlinked successfully.`)
            await load()
        } catch (err) {
            setError(err instanceof Error ? err.message : `Could not unlink ${provider}.`)
        } finally {
            setWorkingProvider(null)
        }
    }

    const requestDeleteAccount = async () => {
        if (demoMode) return
        setDeleteRequesting(true)
        setDeleteError('')
        try {
            await tenantAuthApi.requestDeleteAccount()
            setDeleteRequested(true)
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message : 'Failed to send deletion email.')
        } finally {
            setDeleteRequesting(false)
        }
    }

    const providers = data?.providers ?? []

    const cannotUnlink = (providerName: string): string | null => {
        if (!data) return null
        const provider = providers.find(p => p.provider === providerName)
        if (!provider?.linked) return null
        // Block if provider email matches primary email
        if (provider.linked_email && data.primary_email && provider.linked_email.toLowerCase() === data.primary_email.toLowerCase()) {
            return 'This provider is linked to your primary email. Unlink your primary email first to remove it.'
        }
        // Block if this is the last login method
        const hasMagicLink = data.magic_link.enabled
        const hasPasskey = data.passkeys > 0
        const otherLinked = providers.filter(p => p.provider !== providerName && p.linked).length > 0
        if (!hasMagicLink && !hasPasskey && !otherLinked) {
            return 'Cannot unlink — this is your only way to sign in. Enable magic link or add a passkey first.'
        }
        return null
    }

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader
                eyebrow="My"
                title="My Account"
                description="Link Google or Microsoft to your Rooiam identity so you can sign in with them."
            />

            {demoMode ? <PortalInlineMessage tone="warning">Account linking is locked in demo mode.</PortalInlineMessage> : null}
            {status ? <PortalInlineMessage tone="success">{status}</PortalInlineMessage> : null}
            {error ? <PortalInlineMessage tone="error">{error}</PortalInlineMessage> : null}

            <PortalContentCard
                title="Linked Accounts"
                subtitle="Link additional providers to this Rooiam identity. Linking is separate from platform-level OAuth configuration."
                icon={Link2}
            >
                <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 mb-4">
                    <p className="text-xs font-bold text-amber-700">
                        For security, linking and unlinking requires a recent sign-in. If your session is older than 10 minutes, sign out and sign in again first.
                    </p>
                </div>
                {data ? (
                    <PortalSettingRow
                        label="Primary identity"
                        hint={`Magic link: ${data.magic_link.enabled ? 'available' : 'not available'} · Passkeys: ${data.passkeys} · TOTP: ${data.totp_enabled ? 'enabled' : 'off'}`}
                    >
                        <p className="mt-1 text-sm font-black text-slate-800">{data.primary_email || 'No primary email on this account'}</p>
                    </PortalSettingRow>
                ) : null}
            </PortalContentCard>

            {loading ? <p className="text-xs font-semibold text-gray-400">Loading linked accounts…</p> : null}
            {!loading && providers.length === 0 ? (
                <PortalEmptyState title="No linked accounts yet" description="Connect Google or Microsoft to sign in without a separate magic link." />
            ) : null}

            {providers.map(provider => (
                <PortalContentCard
                    key={provider.provider}
                    title={provider.provider === 'google' ? 'Google' : 'Microsoft'}
                    action={
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${provider.linked ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                            {provider.linked ? <Check className="h-3.5 w-3.5" /> : null}
                            {provider.linked ? 'Linked' : 'Not linked'}
                        </span>
                    }
                >
                    <p className="text-xs font-semibold text-slate-500 mt-1">
                        {provider.linked
                            ? `Linked${provider.linked_email ? ` as ${provider.linked_email}` : ''}`
                            : 'Not linked yet'}
                    </p>
                    <p className="mt-4 text-xs font-semibold text-slate-500">
                        Linking adds this provider to your current Rooiam identity. If linking fails, the provider may already belong to another account in this instance.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                        {!provider.linked ? (
                            <PortalPrimaryActionButton
                                type="button"
                                onClick={() => void startLink(provider.provider as 'google' | 'microsoft')}
                                disabled={demoMode || workingProvider === provider.provider}
                                loading={workingProvider === provider.provider}
                                loadingLabel="Working…"
                                label={`Link ${provider.provider === 'google' ? 'Google' : 'Microsoft'}`}
                                icon={Link2}
                            />
                        ) : (
                            <div className="flex flex-col gap-2">
                                <button
                                    type="button"
                                    onClick={() => !cannotUnlink(provider.provider) && void unlinkProvider(provider.provider as 'google' | 'microsoft')}
                                    disabled={demoMode || workingProvider === provider.provider || !!cannotUnlink(provider.provider)}
                                    title={cannotUnlink(provider.provider) ?? undefined}
                                    className="inline-flex w-fit items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-black shadow-md transition-all hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 border border-red-200 bg-white text-red-600 hover:bg-red-50"
                                >
                                    {workingProvider === provider.provider ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                                    {`Unlink ${provider.provider === 'google' ? 'Google' : 'Microsoft'}`}
                                </button>
                                {cannotUnlink(provider.provider) ? (
                                    <p className="text-[11px] font-semibold text-amber-600 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3 shrink-0" />
                                        {cannotUnlink(provider.provider)}
                                    </p>
                                ) : null}
                            </div>
                        )}
                    </div>
                </PortalContentCard>
            ))}

            {/* Danger Zone */}
            <PortalContentCard
                title="Danger Zone"
                subtitle="Permanent, irreversible actions."
                icon={Trash2}
            >
                <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 mb-4">
                    <p className="text-xs font-bold text-red-700">
                        Deleting your account permanently removes all your data, sessions, and credentials. This cannot be undone.
                    </p>
                </div>
                {deleteError ? <PortalInlineMessage tone="error">{deleteError}</PortalInlineMessage> : null}
                {deleteRequested ? (
                    <PortalInlineMessage tone="success">
                        A confirmation email has been sent. Click the link in the email to permanently delete your account.
                    </PortalInlineMessage>
                ) : (
                    <button
                        type="button"
                        onClick={() => void requestDeleteAccount()}
                        disabled={demoMode || deleteRequesting}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                    >
                        {deleteRequesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        {deleteRequesting ? 'Sending…' : 'Delete My Account'}
                    </button>
                )}
            </PortalContentCard>
        </div>
    )
}
