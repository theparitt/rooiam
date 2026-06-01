import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, Link2, Loader2 } from 'lucide-react'
import { authApi } from '@/lib/api'
import type { ApiLinkedAccounts } from '@/lib/api'
import { apiFetch, getApiBase } from '@/lib/api-base'
import { getSetupAuthHeaders } from '@/lib/setup-token'
import PageHeader from '@/components/ui/PageHeader'
import HintBox from '@/components/ui/HintBox'
import ContentCard from '@/components/ui/ContentCard'
import SettingRowCard from '@/components/ui/SettingRowCard'
import InlineMessage from '@/components/ui/InlineMessage'
import EmptyState from '@/components/ui/EmptyState'
import PrimaryActionButton from '@/components/ui/PrimaryActionButton'

export default function MyAccount() {
    const apiBase = getApiBase()
    const [searchParams, setSearchParams] = useSearchParams()
    const [demoMode, setDemoMode] = useState(false)
    const [data, setData] = useState<ApiLinkedAccounts | null>(null)
    const [loading, setLoading] = useState(true)
    const [workingProvider, setWorkingProvider] = useState<string | null>(null)
    const [error, setError] = useState('')
    const [status, setStatus] = useState('')

    const load = async () => {
        setLoading(true)
        try {
            const linked = await authApi.linkedAccounts()
            setData(linked)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load linked accounts.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        const init = async () => {
            try {
                const statusRes = await apiFetch(`${apiBase}/setup/status`, {
                    headers: { ...getSetupAuthHeaders() },
                })
                if (statusRes.ok) {
                    const s = await statusRes.json()
                    setDemoMode(Boolean(s?.demo_mode))
                }
            } catch {
                // demo mode check is best-effort — not critical
            }
            await load()
        }
        void init()
    }, [apiBase])

    useEffect(() => {
        const provider = searchParams.get('link_provider')
        const result = searchParams.get('link_result')
        const message = searchParams.get('link_message')
        if (!provider || !result) return

        if (result === 'success') {
            setStatus(message || `${provider} linked successfully.`)
            load()
        } else {
            setError(message || `Could not link ${provider}.`)
        }

        const next = new URLSearchParams(searchParams)
        next.delete('link_provider')
        next.delete('link_result')
        next.delete('link_message')
        setSearchParams(next, { replace: true })
    }, [searchParams, setSearchParams])

    const startLink = async (provider: 'google' | 'microsoft') => {
        if (demoMode) return
        setWorkingProvider(provider)
        setError('')
        setStatus('')
        try {
            const base = `${window.location.origin}/my/account`
            const res = await authApi.startLinkProvider(provider, base)
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
            const res = await authApi.unlinkProvider(provider)
            setStatus(res.message || `${provider} unlinked successfully.`)
            await load()
        } catch (err) {
            setError(err instanceof Error ? err.message : `Could not unlink ${provider}.`)
        } finally {
            setWorkingProvider(null)
        }
    }

    const providers = data?.providers ?? []

    const cannotUnlink = (providerName: string): string | null => {
        if (!data) return null
        const provider = providers.find(p => p.provider === providerName)
        if (!provider?.linked) return null
        if (provider.linked_email && data.primary_email && provider.linked_email.toLowerCase() === data.primary_email.toLowerCase()) {
            return 'This provider is linked to your primary email. Unlink your primary email first to remove it.'
        }
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
            <PageHeader
                title="My Account"
                description="Link external providers to your Rooiam identity so you can sign in with them."
            />

            {demoMode && (
                <HintBox title="Account linking is locked in demo mode" tone="amber">
                    Seeded demo identities remain reusable for every visitor.
                </HintBox>
            )}

            <ContentCard
                title="Linked Accounts"
                subtitle="Link additional providers to this Rooiam identity. Linking is separate from platform-level OAuth configuration."
                icon={Link2}
            >
                <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 mb-4">
                    <p className="text-xs font-bold text-amber-700">
                        For security, linking and unlinking requires a recent sign-in. If your session is older than 60 minutes, sign out and sign in again first.
                    </p>
                </div>
                {data && (
                    <SettingRowCard
                        label="Primary identity"
                        hint={`Magic link: ${data.magic_link.enabled ? 'available' : 'not available'} · Passkeys: ${data.passkeys} · TOTP: ${data.totp_enabled ? 'enabled' : 'off'}`}
                    >
                        <p className="mt-1 text-sm font-black text-gray-800">{data.primary_email || 'No primary email on this account'}</p>
                    </SettingRowCard>
                )}
            </ContentCard>

            {loading && <p className="text-xs font-semibold text-gray-400">Loading linked accounts…</p>}
            {status && <InlineMessage tone="success">{status}</InlineMessage>}
            {error && <InlineMessage tone="error">{error}</InlineMessage>}
            {!loading && providers.length === 0 ? (
                <EmptyState title="No linked accounts yet" description="Connect Google or Microsoft to sign in without a separate magic link." />
            ) : null}

            {providers.map(provider => (
                <ContentCard
                    key={provider.provider}
                    title={provider.provider === 'google' ? 'Google' : 'Microsoft'}
                    action={
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black ${provider.linked ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                            {provider.linked && <Check className="h-3.5 w-3.5" />}
                            {provider.linked ? 'Linked' : 'Not linked'}
                        </span>
                    }
                >
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-xs font-semibold text-gray-500 mt-1">
                                {provider.linked
                                    ? `Linked${provider.linked_email ? ` as ${provider.linked_email}` : ''}`
                                    : 'Not linked yet'}
                            </p>
                        </div>
                    </div>
                    {!provider.linked ? (
                        <p className="mt-4 text-xs font-semibold text-gray-500">
                            Linking adds this provider to your current Rooiam identity. If linking fails, the provider may already belong to another account in this instance.
                        </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-3">
                        {!provider.linked && (
                            <PrimaryActionButton
                                type="button"
                                onClick={() => startLink(provider.provider as 'google' | 'microsoft')}
                                disabled={demoMode || workingProvider === provider.provider}
                                loading={workingProvider === provider.provider}
                                loadingLabel="Working…"
                                label={`Link ${provider.provider === 'google' ? 'Google' : 'Microsoft'}`}
                                icon={Link2}
                            />
                        )}
                        {provider.linked && (
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
                </ContentCard>
            ))}
        </div>
    )
}
