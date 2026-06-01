import React from 'react'
import { Check, KeyRound, Loader2, Pencil, ShieldCheck, X } from 'lucide-react'
import PortalPageHeader from '../../components/portal/PortalPageHeader'
import PortalContentCard from '../../components/portal/PortalContentCard'
import PortalSettingRow from '../../components/portal/PortalSettingRow'
import PortalPrimaryActionButton from '../../components/portal/PortalPrimaryActionButton'
import PortalInlineMessage from '../../components/portal/PortalInlineMessage'
import PortalHelpLabel from '../../components/portal/PortalHelpLabel'
import PortalEmptyState from '../../components/portal/PortalEmptyState'
import PortalFormField from '../../components/portal/PortalFormField'
import PortalPaginationControls from '../../components/portal/PortalPaginationControls'
import PortalTabBar from '../../components/portal/PortalTabBar'
import { usePortalMySecurity } from '../../hooks/usePortalMySecurity'

type Props = {
    demoMode?: boolean
}

export default function PortalMySecurity({ demoMode = false }: Props) {
    const {
        loading,
        passkeys,
        totpEnabled,
        backupCodesRemaining,
        backupCodes,
        registeringPasskey,
        passkeyName,
        setPasskeyName,
        passkeyError,
        totpLoading,
        totpError,
        totpChallengeId,
        totpSecret,
        totpUri,
        totpCode,
        setTotpCode,
        totpQrCode,
        statusMessage,
        errorMessage,
        passkeysPage,
        setPasskeysPage,
        pagedPasskeys,
        tab,
        handleTabChange,
        registerPasskey,
        removePasskey,
        renamePasskeyLocally,
        startTotpEnrollment,
        finishTotpEnrollment,
        disableTotp,
        regenerateBackupCodes,
        passkeyPageSize,
    } = usePortalMySecurity()

    // Inline rename state
    const [renamingId, setRenamingId] = React.useState<string | null>(null)
    const [renameValue, setRenameValue] = React.useState('')
    const [renameLoading, setRenameLoading] = React.useState(false)
    const [renameError, setRenameError] = React.useState('')

    const startRename = (id: string, currentName: string) => {
        setRenamingId(id)
        setRenameValue(currentName)
        setRenameError('')
    }

    const cancelRename = () => {
        setRenamingId(null)
        setRenameValue('')
        setRenameError('')
    }

    const saveRename = async (id: string) => {
        const trimmed = renameValue.trim()
        if (!trimmed) { setRenameError('Name cannot be empty.'); return }
        setRenameLoading(true)
        setRenameError('')
        try {
            await (await import('../../lib/auth-api')).tenantAuthApi.renamePasskey(id, trimmed)
            renamePasskeyLocally(id, trimmed)
            setRenamingId(null)
        } catch (err) {
            setRenameError(err instanceof Error ? err.message : 'Could not rename passkey.')
        } finally {
            setRenameLoading(false)
        }
    }

    const TABS: { id: 'passkeys' | 'totp'; label: string; icon: React.ReactNode }[] = [
        { id: 'passkeys', label: 'Passkeys', icon: <KeyRound className="w-4 h-4" /> },
        { id: 'totp', label: 'TOTP MFA', icon: <ShieldCheck className="w-4 h-4" /> },
    ]

    return (
        <div className="max-w-lg space-y-5 sm:space-y-6 animate-slide-up">
            <PortalPageHeader title="My Security" />

            {demoMode ? (
                <PortalInlineMessage tone="warning">Personal account changes are locked in demo mode.</PortalInlineMessage>
            ) : null}

            {statusMessage ? <PortalInlineMessage tone="success">{statusMessage}</PortalInlineMessage> : null}
            {errorMessage ? <PortalInlineMessage tone="error">{errorMessage}</PortalInlineMessage> : null}

            {/* Tab bar */}
            <PortalTabBar active={tab} onChange={handleTabChange} items={TABS} />

            {/* Passkeys tab */}
            {tab === 'passkeys' && <div className="space-y-5">
                <PortalContentCard title="Passkeys" subtitle="Use your device unlock instead of waiting for email." icon={KeyRound} className="space-y-4">
                    <div className="rounded-2xl bg-sky-50 border border-sky-100 px-4 py-3 mb-4">
                        <p className="text-xs font-bold text-sky-800">How it works</p>
                        <p className="mt-1 text-xs font-semibold text-sky-700">
                            Sign in with Windows Hello, fingerprint, Face ID, Touch ID, or your device PIN.
                        </p>
                    </div>
                    <div className="space-y-3">
                        <PortalSettingRow label="Device Name" hint="Give it a simple name so you can recognize this device later.">
                            <input
                                type="text"
                                value={passkeyName}
                                onChange={e => setPasskeyName(e.target.value)}
                                placeholder="My Device"
                                className="mt-3 w-full px-4 py-3 bg-muted/50 border border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all"
                            />
                        </PortalSettingRow>
                        <PortalPrimaryActionButton
                            type="button"
                            onClick={registerPasskey}
                            disabled={demoMode || registeringPasskey}
                            loading={registeringPasskey}
                            loadingLabel="Registering…"
                            label="Add Passkey"
                            icon={KeyRound}
                        />
                        {passkeyError ? <PortalInlineMessage tone="error">{passkeyError}</PortalInlineMessage> : null}
                    </div>
                    <div className="mt-5 space-y-3">
                        {loading ? (
                            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground py-2">
                                <Loader2 className="w-4 h-4 animate-spin" /> Loading passkeys…
                            </div>
                        ) : passkeys.length === 0 ? (
                            <PortalEmptyState title="No passkeys added yet" description="Add a passkey to sign in with your device unlock." />
                        ) : (
                            <>
                                {pagedPasskeys.map(passkey => (
                                    <div key={passkey.id} className="rounded-2xl bg-slate-50 px-4 py-3 flex flex-col gap-2">
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="min-w-0">
                                                {renamingId === passkey.id ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="text"
                                                            value={renameValue}
                                                            onChange={e => setRenameValue(e.target.value)}
                                                            autoFocus
                                                            maxLength={100}
                                                            className="px-3 py-1.5 text-sm font-semibold border border-border rounded-xl bg-white outline-none focus:ring-2 focus:ring-primary transition-all w-36"
                                                            onKeyDown={e => { if (e.key === 'Enter') { void saveRename(passkey.id) } else if (e.key === 'Escape') { cancelRename() } }}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => void saveRename(passkey.id)}
                                                            disabled={renameLoading}
                                                            className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 disabled:opacity-50"
                                                            title="Save"
                                                        >
                                                            {renameLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={cancelRename}
                                                            className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"
                                                            title="Cancel"
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1.5">
                                                        <p className="text-sm font-bold text-slate-700">{passkey.name}</p>
                                                        <button
                                                            type="button"
                                                            onClick={() => startRename(passkey.id, passkey.name)}
                                                            disabled={demoMode}
                                                            className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-200 disabled:opacity-40 transition-colors"
                                                            title="Rename"
                                                        >
                                                            <Pencil className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                )}
                                                <p className="text-xs font-semibold text-slate-500">
                                                    Added {new Date(passkey.created_at).toLocaleDateString()}
                                                    {passkey.last_used_at ? ` · Last used ${new Date(passkey.last_used_at).toLocaleString()}` : ''}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removePasskey(passkey.id)}
                                                disabled={demoMode || renamingId === passkey.id}
                                                className="text-xs font-black px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 shrink-0"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                        {renamingId === passkey.id && renameError && (
                                            <p className="text-xs font-bold text-red-500">{renameError}</p>
                                        )}
                                    </div>
                                ))}
                                <div className="rounded-2xl overflow-hidden border border-border bg-white">
                                    <PortalPaginationControls
                                        page={passkeysPage}
                                        totalItems={passkeys.length}
                                        pageSize={passkeyPageSize}
                                        label="passkeys"
                                        onPageChange={setPasskeysPage}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                </PortalContentCard>
            </div>}

            {/* TOTP tab */}
            {tab === 'totp' && <div className="space-y-5">
                <PortalContentCard title="TOTP MFA" subtitle="Add a 6-digit authenticator code after sign-in for stronger protection." icon={ShieldCheck} className="space-y-4">
                    {totpEnabled ? (
                        <div className="space-y-3">
                            <p className="text-sm font-semibold text-slate-600">TOTP MFA is enabled.</p>
                            <p className="text-xs font-semibold text-slate-500">
                                Backup codes remaining: <span className="font-black text-slate-700">{backupCodesRemaining}</span>
                            </p>
                            <div className="flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    onClick={regenerateBackupCodes}
                                    disabled={demoMode || totpLoading}
                                    className="text-xs font-black px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                                >
                                    {totpLoading ? 'Generating…' : 'Regenerate Backup Codes'}
                                </button>
                                <button
                                    type="button"
                                    onClick={disableTotp}
                                    disabled={demoMode || totpLoading}
                                    className="text-xs font-black px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                                >
                                    {totpLoading ? 'Disabling…' : 'Disable TOTP'}
                                </button>
                            </div>
                            {backupCodes.length > 0 ? (
                                <div className="rounded-2xl bg-amber-50 px-4 py-4 border border-amber-200">
                                    <p className="text-sm font-black text-amber-800 mb-2">New backup codes</p>
                                    <p className="text-xs font-semibold text-amber-700 mb-3">Shown once. Store them somewhere safe.</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {backupCodes.map(code => (
                                            <div key={code} className="font-mono text-sm font-bold text-amber-900 bg-white rounded-xl px-3 py-2 border border-amber-100">{code}</div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    ) : totpChallengeId ? (
                        <div className="space-y-4">
                            <div className="rounded-2xl bg-sky-50 border border-sky-100 px-4 py-3">
                                <p className="text-xs font-bold text-sky-800">How to set it up</p>
                                <p className="mt-1 text-xs font-semibold text-sky-700">
                                    Scan the QR code with your authenticator app, or enter the secret key manually.
                                </p>
                            </div>
                            {totpQrCode ? (
                                <div className="rounded-2xl bg-white border border-slate-200 px-4 py-4 flex flex-col items-center">
                                    <p className="text-xs font-bold text-slate-600 mb-3">Scan with your authenticator app</p>
                                    <img src={totpQrCode} alt="QR code for authenticator app setup" className="w-44 h-44 rounded-xl border border-slate-100" />
                                </div>
                            ) : null}
                            <div className="rounded-2xl border border-border bg-white px-4 py-3 shadow-sm">
                                <PortalHelpLabel label="Secret key" help="Use this secret if your authenticator app cannot scan a QR code. Add it manually in the app." />
                                <p className="font-mono text-sm text-slate-700 break-all">{totpSecret}</p>
                            </div>
                            <div className="rounded-2xl border border-border bg-white px-4 py-3 shadow-sm">
                                <PortalHelpLabel label="Authenticator app link" help="This is the raw otpauth link for manual import. Most users do not need it." />
                                <p className="font-mono text-[11px] text-slate-700 break-all">{totpUri}</p>
                            </div>
                            <PortalFormField label="Verification Code">
                                <input
                                    type="text"
                                    value={totpCode}
                                    onChange={e => setTotpCode(e.target.value)}
                                    placeholder="123456"
                                    className="w-full px-4 py-3 bg-muted/50 border border-border rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-primary transition-all font-mono"
                                />
                            </PortalFormField>
                            <PortalPrimaryActionButton
                                type="button"
                                onClick={finishTotpEnrollment}
                                disabled={demoMode || totpLoading || totpCode.trim().length < 6}
                                loading={totpLoading}
                                loadingLabel="Verifying…"
                                label="Enable TOTP"
                                icon={ShieldCheck}
                            />
                        </div>
                    ) : (
                        <PortalPrimaryActionButton
                            type="button"
                            onClick={startTotpEnrollment}
                            disabled={demoMode || totpLoading}
                            loading={totpLoading}
                            loadingLabel="Preparing…"
                            label="Set Up TOTP"
                            icon={ShieldCheck}
                        />
                    )}
                    {totpError ? <PortalInlineMessage tone="error" className="mt-3">{totpError}</PortalInlineMessage> : null}
                </PortalContentCard>
            </div>}

        </div>
    )
}
