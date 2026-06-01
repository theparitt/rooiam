import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import PortalDangerActionButton from '../../components/portal/PortalDangerActionButton'
import PortalConfigChangeNote from '../../components/portal/PortalConfigChangeNote'
import PortalDangerZoneCard from '../../components/portal/PortalDangerZoneCard'
import PortalInlineMessage from '../../components/portal/PortalInlineMessage'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalSelectField from '../../components/portal/PortalSelectField'
import { apiFetch } from '../../lib/api-base'
import type { MeResponse, Organization, OrganizationActivityItem, OrganizationMember } from '../../lib/portal-types'

type Props = {
    API: string
    user: MeResponse | null
    currentOrg: Organization | null
    members: OrganizationMember[]
    membersLoaded: boolean
    membersLoading: boolean
    canManageDangerZone: boolean
    canTransferOwnership: boolean
    onWorkspaceStatusUpdated: (status: 'active' | 'suspended') => void
    lastChange: OrganizationActivityItem | null
}

export default function PortalWorkspaceDangerZone({
    API,
    user,
    currentOrg,
    members,
    membersLoaded,
    membersLoading,
    canManageDangerZone,
    canTransferOwnership,
    onWorkspaceStatusUpdated,
    lastChange,
}: Props) {
    const [transferTargetUserId, setTransferTargetUserId] = useState('')
    const [transferToken, setTransferToken] = useState('')
    const [transferBusy, setTransferBusy] = useState(false)
    const [transferMessage, setTransferMessage] = useState('')
    const [transferError, setTransferError] = useState('')
    const [issuedTransferToken, setIssuedTransferToken] = useState('')
    const [issuedTransferExpiresAt, setIssuedTransferExpiresAt] = useState('')
    const [statusBusy, setStatusBusy] = useState(false)
    const [statusMessage, setStatusMessage] = useState('')
    const [statusError, setStatusError] = useState('')

    const eligibleTransferTargets = useMemo(
        () => members.filter(member => member.user_id !== user?.id && member.status === 'active' && !member.role_codes?.includes('owner')),
        [members, user?.id],
    )
    const isSuspended = currentOrg?.status === 'suspended'

    useEffect(() => {
        if (!eligibleTransferTargets.length) {
            setTransferTargetUserId('')
            return
        }
        setTransferTargetUserId(current => (
            current && eligibleTransferTargets.some(member => member.user_id === current)
                ? current
                : eligibleTransferTargets[0].user_id
        ))
    }, [eligibleTransferTargets])

    const initiateOwnerTransfer = async (event: React.FormEvent) => {
        event.preventDefault()
        if (!transferTargetUserId) return
        setTransferBusy(true)
        setTransferError('')
        setTransferMessage('')
        try {
            const res = await apiFetch(`${API}/orgs/current/owner-transfer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ to_user_id: transferTargetUserId }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error?.message || 'Could not start ownership transfer.')
            setIssuedTransferToken(data.token || '')
            setIssuedTransferExpiresAt(data.expires_at || '')
            setTransferMessage('Ownership transfer started. Share the token with the target member so they can accept it.')
        } catch (err) {
            setTransferError(err instanceof Error ? err.message : 'Could not start ownership transfer.')
        } finally {
            setTransferBusy(false)
        }
    }

    const acceptOwnerTransfer = async (event: React.FormEvent) => {
        event.preventDefault()
        if (!transferToken.trim()) return
        setTransferBusy(true)
        setTransferError('')
        setTransferMessage('')
        try {
            const res = await apiFetch(`${API}/orgs/current/owner-transfer/accept`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: transferToken.trim() }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error?.message || 'Could not accept ownership transfer.')
            setTransferToken('')
            setTransferMessage(data?.message || 'Ownership transfer accepted.')
        } catch (err) {
            setTransferError(err instanceof Error ? err.message : 'Could not accept ownership transfer.')
        } finally {
            setTransferBusy(false)
        }
    }

    const updateWorkspaceStatus = async (nextStatus: 'active' | 'suspended') => {
        setStatusBusy(true)
        setStatusError('')
        setStatusMessage('')
        try {
            const res = await apiFetch(`${API}/orgs/current/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: nextStatus }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error?.message || `Could not update workspace status to ${nextStatus}.`)
            onWorkspaceStatusUpdated(nextStatus)
            setStatusMessage(nextStatus === 'suspended'
                ? 'Workspace suspended. Sign-in and normal use are now blocked until it is resumed.'
                : 'Workspace resumed.')
        } catch (err) {
            setStatusError(err instanceof Error ? err.message : 'Could not update workspace status.')
        } finally {
            setStatusBusy(false)
        }
    }

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader
                eyebrow="Workspace Settings"
                title="Workspace Danger Zone"
                description="High-risk workspace actions belong here, not on the overview dashboard."
            />

            <PortalConfigChangeNote
                item={lastChange}
                emptyText="No danger-zone actions recorded yet."
            />

            {!currentOrg ? (
                <PortalInlineMessage tone="info">
                    No workspace selected. Select a workspace first to manage ownership transfer.
                </PortalInlineMessage>
            ) : (
                <PortalDangerZoneCard
                    title="Ownership and irreversible actions"
                    subtitle="Keep ownership transfer and destructive lifecycle actions grouped in one deliberate place."
                >
                    {canTransferOwnership ? (
                        <form onSubmit={initiateOwnerTransfer} className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                            <p className="text-sm font-black text-foreground">Transfer ownership</p>
                            <p className="mt-1 text-sm font-medium text-muted-foreground">
                                Only transfer ownership to an active workspace member you trust to become the new owner.
                            </p>
                            {membersLoading ? (
                                <div className="mt-3 flex items-center gap-2 rounded-2xl border border-border bg-slate-50 px-3 py-3 text-sm font-semibold text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Loading eligible members…
                                </div>
                            ) : (
                                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                                    <PortalSelectField
                                        value={transferTargetUserId}
                                        onChange={setTransferTargetUserId}
                                        className="flex-1 text-sm font-bold"
                                    >
                                        {eligibleTransferTargets.length === 0 ? (
                                            <option value="">No eligible members</option>
                                        ) : (
                                            eligibleTransferTargets.map(member => (
                                                <option key={member.id} value={member.user_id}>
                                                    {member.display_name || member.email || member.user_id}
                                                </option>
                                            ))
                                        )}
                                    </PortalSelectField>
                                    <PortalDangerActionButton
                                        label="Start Transfer"
                                        loading={transferBusy}
                                        type="submit"
                                        disabled={transferBusy || eligibleTransferTargets.length === 0}
                                    />
                                </div>
                            )}
                            {membersLoaded && eligibleTransferTargets.length === 0 ? (
                                <p className="mt-3 text-xs font-medium text-muted-foreground">
                                    There is no eligible active member to transfer ownership to yet.
                                </p>
                            ) : null}
                            {issuedTransferToken ? (
                                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50/60 p-3">
                                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-rose-700">Transfer Token</p>
                                    <code className="mt-1 block break-all text-xs font-mono text-foreground">{issuedTransferToken}</code>
                                    {issuedTransferExpiresAt ? (
                                        <p className="mt-2 text-xs font-medium text-muted-foreground">
                                            Expires {new Date(issuedTransferExpiresAt).toLocaleString()}
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}
                        </form>
                    ) : null}

                    <form onSubmit={acceptOwnerTransfer} className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                        <p className="text-sm font-black text-foreground">Accept ownership transfer</p>
                        <p className="mt-1 text-sm font-medium text-muted-foreground">
                            If a current owner initiated a transfer to you, paste the transfer token here to accept ownership.
                        </p>
                        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                            <input
                                type="text"
                                value={transferToken}
                                onChange={event => setTransferToken(event.target.value)}
                                placeholder="Paste transfer token"
                                className="flex-1 rounded-2xl border border-border bg-white px-4 py-3 text-sm font-mono outline-none"
                            />
                            <PortalDangerActionButton
                                label="Accept Transfer"
                                loading={transferBusy}
                                type="submit"
                                disabled={transferBusy || !transferToken.trim()}
                            />
                        </div>
                    </form>

                    <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
                            <div>
                                <p className="text-sm font-black text-foreground">Workspace lifecycle</p>
                                <p className="mt-1 text-sm font-medium text-muted-foreground">
                                    Suspension is the safe destructive action available here. Archive and permanent deletion should stay platform-controlled until lifecycle semantics are fully defined.
                                </p>
                                {canManageDangerZone ? (
                                    <div className="mt-4 flex flex-wrap gap-3">
                                        {isSuspended ? (
                                            <PortalDangerActionButton
                                                label="Resume Workspace"
                                                loading={statusBusy}
                                                disabled={statusBusy || Boolean(currentOrg?.platform_locked)}
                                                onClick={() => void updateWorkspaceStatus('active')}
                                                className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                            />
                                        ) : (
                                            <PortalDangerActionButton
                                                label="Suspend Workspace"
                                                loading={statusBusy}
                                                disabled={statusBusy}
                                                onClick={() => void updateWorkspaceStatus('suspended')}
                                            />
                                        )}
                                    </div>
                                ) : (
                                    <p className="mt-3 text-xs font-semibold text-muted-foreground">
                                        Only the workspace owner can change workspace lifecycle status here.
                                    </p>
                                )}
                                {currentOrg?.platform_locked ? (
                                    <p className="mt-3 text-xs font-semibold text-rose-700">
                                        This workspace was suspended by the platform administrator and cannot be resumed here.
                                    </p>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    {transferError ? <PortalInlineMessage tone="error">{transferError}</PortalInlineMessage> : null}
                    {transferMessage ? <PortalInlineMessage tone="success">{transferMessage}</PortalInlineMessage> : null}
                    {statusError ? <PortalInlineMessage tone="error">{statusError}</PortalInlineMessage> : null}
                    {statusMessage ? <PortalInlineMessage tone="success">{statusMessage}</PortalInlineMessage> : null}
                </PortalDangerZoneCard>
            )}
        </div>
    )
}
