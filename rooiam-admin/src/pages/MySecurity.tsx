import { Key, Shield } from 'lucide-react'
import PaginationControls from '@/components/ui/PaginationControls'
import PageHeader from '@/components/ui/PageHeader'
import HintBox from '@/components/ui/HintBox'
import TabBar from '@/components/ui/TabBar'
import ContentCard from '@/components/ui/ContentCard'
import SettingRowCard from '@/components/ui/SettingRowCard'
import PrimaryActionButton from '@/components/ui/PrimaryActionButton'
import InlineMessage from '@/components/ui/InlineMessage'
import HelpLabel from '@/components/ui/HelpLabel'
import EmptyState from '@/components/ui/EmptyState'
import FormField from '@/components/ui/FormField'
import { useMySecurity } from '@/hooks/useMySecurity'

export default function MySecurity() {
    const {
        tab,
        handleTabChange,
        demoMode,
        adminPasskeyAllowed,
        adminRequireMfa,
        passkeys,
        loadingPasskeys,
        registeringPasskey,
        passkeyName,
        setPasskeyName,
        passkeyError,
        passkeysPage,
        setPasskeysPage,
        pagedPasskeys,
        totpEnabled,
        backupCodesRemaining,
        backupCodes,
        totpChallengeId,
        totpSecret,
        totpUri,
        totpQrCode,
        totpCode,
        setTotpCode,
        totpLoading,
        totpError,
        registerPasskey,
        removePasskey,
        startTotpEnrollment,
        finishTotpEnrollment,
        disableTotp,
        regenerateBackupCodes,
        passkeyPageSize,
    } = useMySecurity()

    return (
        <div className="space-y-5 sm:space-y-6 animate-slide-up">
            <PageHeader
                title="My Security"
                description="Set up your personal passkeys and TOTP MFA for the admin console."
            />

            {/* Tab bar */}
            <TabBar
                active={tab}
                onChange={handleTabChange}
                items={[
                    { id: 'passkeys', label: 'Passkeys', icon: <Key className="w-4 h-4" /> },
                    { id: 'totp', label: 'TOTP MFA', icon: <Shield className="w-4 h-4" /> },
                ]}
            />

            <div className="space-y-4">
                {demoMode && (
                    <HintBox title="Sign-in methods are locked in demo mode" tone="amber">
                        Seeded login flows and demo accounts remain stable.
                    </HintBox>
                )}

                {/* Passkeys */}
                {tab === 'passkeys' && <ContentCard
                    title="Passkeys"
                    subtitle="Sign in with your device unlock instead of waiting for an email link."
                    icon={Key}
                    className="space-y-4"
                >
                    {!adminPasskeyAllowed ? (
                        <SettingRowCard
                            label="Passkeys are disabled by platform policy"
                            hint="The platform owner has disabled passkey sign-in for the admin console. Contact them to enable it."
                        />
                    ) : (
                        <>
                            <div className="rounded-2xl bg-sky-50 border border-sky-100 px-4 py-3 mb-4">
                                <p className="text-xs font-bold text-sky-800">How it works</p>
                                <p className="mt-1 text-xs font-semibold text-sky-700">
                                    When you add a passkey, Rooiam will use your device's built-in sign-in — Windows Hello, fingerprint, Face ID, Touch ID, or your device PIN.
                                </p>
                            </div>
                            <div className="space-y-3">
                                <SettingRowCard
                                    label="Device Name"
                                    hint="Give it a simple name so you can recognize this device later."
                                >
                                    <input
                                        type="text"
                                        value={passkeyName}
                                        placeholder="My Device"
                                        onChange={e => setPasskeyName(e.target.value)}
                                        disabled={demoMode}
                                        className="mt-3 wizard-input"
                                    />
                                </SettingRowCard>
                                <PrimaryActionButton
                                    type="button"
                                    onClick={registerPasskey}
                                    disabled={demoMode || registeringPasskey}
                                    loading={registeringPasskey}
                                    loadingLabel="Registering…"
                                    label="Add Passkey"
                                    icon={Key}
                                />
                                {passkeyError && <InlineMessage tone="error">{passkeyError}</InlineMessage>}
                            </div>
                        </>
                    )}

                    <div className="mt-5 space-y-3">
                        {loadingPasskeys ? (
                            <p className="text-xs font-semibold text-gray-400">Loading passkeys…</p>
                        ) : passkeys.length === 0 ? (
                            <EmptyState title="No passkeys enrolled yet" description="Add a passkey to sign in with your device unlock." />
                        ) : (
                            <>
                                {pagedPasskeys.map(passkey => (
                                    <div key={passkey.id} className="rounded-2xl border border-border bg-white px-4 py-3 shadow-sm flex items-center justify-between gap-4">
                                        <div>
                                            <p className="text-sm font-bold text-gray-700">{passkey.name}</p>
                                            <p className="text-xs font-semibold text-gray-500">
                                                Added {new Date(passkey.created_at).toLocaleDateString()}
                                                {passkey.last_used_at ? ` · Last used ${new Date(passkey.last_used_at).toLocaleString()}` : ''}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => removePasskey(passkey.id)}
                                            disabled={demoMode}
                                            className="text-xs font-black px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                                <div className="rounded-2xl overflow-hidden border border-gray-100 bg-white">
                                    <PaginationControls
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
                </ContentCard>}

                {/* TOTP MFA */}
                {tab === 'totp' && <ContentCard
                    title="TOTP MFA"
                    subtitle="Add a 6-digit authenticator code after sign-in for stronger account protection."
                    icon={Shield}
                    className="space-y-4"
                >
                    {adminRequireMfa && (
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 mb-4">
                            <p className="text-sm font-black text-emerald-800">MFA is required by platform policy</p>
                            <p className="text-xs font-semibold text-emerald-700 mt-1">
                                The platform owner requires TOTP MFA for all admins. You must set it up to sign in.
                            </p>
                        </div>
                    )}

                    {totpEnabled ? (
                        <div className="space-y-3">
                            <p className="text-sm font-semibold text-gray-600">TOTP MFA is enrolled on this account.</p>
                            <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3">
                                <p className="text-xs font-black text-amber-800">MFA will be required every sign-in</p>
                                <p className="text-xs font-semibold text-amber-700 mt-1">
                                    Because TOTP is enrolled, you will always be asked for a code when signing in — even if the platform policy does not require it.
                                    To stop being prompted, click <span className="font-black">Remove TOTP</span> below to fully remove your enrollment.
                                </p>
                            </div>
                            <p className="text-xs font-semibold text-gray-500">
                                Backup codes remaining: <span className="font-black text-gray-700">{backupCodesRemaining}</span>
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={regenerateBackupCodes} disabled={demoMode || totpLoading}
                                    className="text-xs font-black px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-60">
                                    {totpLoading ? 'Generating…' : 'Regenerate Backup Codes'}
                                </button>
                                {!adminRequireMfa && (
                                    <button type="button" onClick={disableTotp} disabled={demoMode || totpLoading}
                                        className="text-xs font-black px-3 py-2 rounded-xl bg-white border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-60">
                                        {totpLoading ? 'Removing…' : 'Remove TOTP'}
                                    </button>
                                )}
                            </div>
                            {backupCodes.length > 0 && (
                                <div className="rounded-2xl bg-amber-50 px-4 py-4 border border-amber-200">
                                    <p className="text-sm font-black text-amber-800 mb-2">New backup codes</p>
                                    <p className="text-xs font-semibold text-amber-700 mb-3">These codes are shown once. Store them somewhere safe.</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {backupCodes.map(code => (
                                            <div key={code} className="font-mono text-sm font-bold text-amber-900 bg-white rounded-xl px-3 py-2 border border-amber-100">
                                                {code}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : totpChallengeId ? (
                        <div className="space-y-3">
                            <div className="rounded-2xl bg-sky-50 border border-sky-100 px-4 py-3">
                                <p className="text-xs font-bold text-sky-800">How to set it up</p>
                                <p className="mt-1 text-xs font-semibold text-sky-700">
                                    Scan the QR code with your authenticator app. If scanning does not work, enter the secret key manually.
                                </p>
                            </div>
                            {totpQrCode && (
                                <div className="rounded-2xl bg-white border border-slate-200 px-4 py-4 flex flex-col items-center">
                                    <p className="text-xs font-bold text-gray-600 mb-3">Scan with your authenticator app</p>
                                    <img src={totpQrCode} alt="QR code for authenticator app setup" className="w-44 h-44 rounded-xl border border-slate-100" />
                                </div>
                            )}
                            <div className="rounded-2xl border border-border bg-white px-4 py-3 shadow-sm">
                                <HelpLabel label="Secret key" help="If your authenticator app cannot scan the QR code, enter this secret key manually into the app." />
                                <p className="font-mono text-sm text-gray-700 break-all">{totpSecret}</p>
                            </div>
                            <div className="rounded-2xl border border-border bg-white px-4 py-3 shadow-sm">
                                <HelpLabel label="Authenticator app link" help="This is the full otpauth:// setup link used by authenticator apps. Most users do not need it unless importing manually." />
                                <p className="font-mono text-[11px] text-gray-700 break-all">{totpUri}</p>
                            </div>
                            <FormField label="Verification Code">
                                <input
                                    type="text"
                                    value={totpCode}
                                    onChange={e => setTotpCode(e.target.value)}
                                    placeholder="123456"
                                    disabled={demoMode}
                                    className="wizard-input font-mono"
                                />
                            </FormField>
                            <PrimaryActionButton
                                type="button"
                                onClick={finishTotpEnrollment}
                                disabled={demoMode || totpLoading || totpCode.trim().length < 6}
                                loading={totpLoading}
                                loadingLabel="Verifying…"
                                label="Enable TOTP"
                                icon={Shield}
                            />
                        </div>
                    ) : (
                        <PrimaryActionButton
                            type="button"
                            onClick={startTotpEnrollment}
                            disabled={demoMode || totpLoading}
                            loading={totpLoading}
                            loadingLabel="Preparing…"
                            label="Set Up TOTP"
                            icon={Shield}
                        />
                    )}
                    {totpError && <InlineMessage tone="error" className="mt-3">{totpError}</InlineMessage>}
                </ContentCard>}
            </div>
        </div>
    )
}
