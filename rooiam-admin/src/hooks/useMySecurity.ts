import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { authApi, setupApi } from '@/lib/api'
import type { ApiPasskey } from '@/lib/api'
import { apiFetch, getApiBase } from '@/lib/api-base'
import { getSetupAuthHeaders } from '@/lib/setup-token'

const PASSKEY_PAGE_SIZE = 6

export type MySecurityTab = 'passkeys' | 'totp'

export function useMySecurity() {
    const apiBase = getApiBase()

    const savedTab = localStorage.getItem('rooiam_tab_my_account') as MySecurityTab | null
    const validTabs: MySecurityTab[] = ['passkeys', 'totp']
    const [tab, setTab] = useState<MySecurityTab>(
        validTabs.includes(savedTab as MySecurityTab) ? (savedTab as MySecurityTab) : 'passkeys'
    )
    const handleTabChange = (nextTab: MySecurityTab) => {
        setTab(nextTab)
        localStorage.setItem('rooiam_tab_my_account', nextTab)
    }

    const [adminPasskeyAllowed, setAdminPasskeyAllowed] = useState(true)
    const [adminRequireMfa, setAdminRequireMfa] = useState(false)
    const [demoMode, setDemoMode] = useState(false)

    const [passkeys, setPasskeys] = useState<ApiPasskey[]>([])
    const [loadingPasskeys, setLoadingPasskeys] = useState(true)
    const [registeringPasskey, setRegisteringPasskey] = useState(false)
    const [passkeyName, setPasskeyName] = useState('My Device')
    const [passkeyError, setPasskeyError] = useState('')
    const [passkeysPage, setPasskeysPage] = useState(1)

    const [totpEnabled, setTotpEnabled] = useState(false)
    const [backupCodesRemaining, setBackupCodesRemaining] = useState(0)
    const [backupCodes, setBackupCodes] = useState<string[]>([])
    const [totpChallengeId, setTotpChallengeId] = useState('')
    const [totpSecret, setTotpSecret] = useState('')
    const [totpUri, setTotpUri] = useState('')
    const [totpQrCode, setTotpQrCode] = useState('')
    const [totpCode, setTotpCode] = useState('')
    const [totpLoading, setTotpLoading] = useState(false)
    const [totpError, setTotpError] = useState('')

    const load = async () => {
        try {
            const myPasskeys = await authApi.passkeys()
            setPasskeys(myPasskeys)
        } catch {
            setPasskeys([])
        } finally {
            setLoadingPasskeys(false)
        }

        try {
            const mfa = await authApi.mfaStatus()
            setTotpEnabled(mfa.totp_enabled)
            setBackupCodesRemaining(mfa.backup_codes_remaining)
        } catch {
            setTotpEnabled(false)
            setBackupCodesRemaining(0)
        }
    }

    useEffect(() => {
        const init = async () => {
            const statusRes = await apiFetch(`${apiBase}/setup/status`, {
                headers: { ...getSetupAuthHeaders() },
            }).catch(() => null)
            if (statusRes?.ok) {
                const status = await statusRes.json()
                setDemoMode(Boolean(status?.demo_mode))
            }

            const accessPolicy = await setupApi.adminAccess().catch(() => null)
            if (accessPolicy) {
                setAdminPasskeyAllowed(accessPolicy.admin_passkey_allowed !== false)
                setAdminRequireMfa(Boolean(accessPolicy.admin_require_mfa))
            }

            await load()
        }

        void init()
    }, [apiBase])

    useEffect(() => {
        setPasskeysPage(1)
    }, [passkeys.length])

    useEffect(() => {
        if (!totpUri) {
            setTotpQrCode('')
            return
        }

        let cancelled = false
        QRCode.toDataURL(totpUri, {
            margin: 1,
            width: 180,
            color: { dark: '#334155', light: '#FFFFFF' },
        })
            .then((dataUrl: string) => {
                if (!cancelled) setTotpQrCode(dataUrl)
            })
            .catch(() => {
                if (!cancelled) setTotpQrCode('')
            })

        return () => {
            cancelled = true
        }
    }, [totpUri])

    const pagedPasskeys = useMemo(
        () => passkeys.slice((passkeysPage - 1) * PASSKEY_PAGE_SIZE, passkeysPage * PASSKEY_PAGE_SIZE),
        [passkeys, passkeysPage]
    )

    const registerPasskey = async () => {
        if (demoMode || !adminPasskeyAllowed) return

        setRegisteringPasskey(true)
        setPasskeyError('')
        try {
            if (!(window.PublicKeyCredential && navigator.credentials)) {
                throw new Error('This browser does not support passkeys.')
            }
            const parseCreationOptionsFromJSON = (window.PublicKeyCredential as unknown as {
                parseCreationOptionsFromJSON?: (options: unknown) => CredentialCreationOptions['publicKey']
            }).parseCreationOptionsFromJSON
            if (!parseCreationOptionsFromJSON) {
                throw new Error('This browser is missing the JSON WebAuthn helpers needed for registration.')
            }
            const start = await authApi.startPasskeyRegistration()
            const publicKey = parseCreationOptionsFromJSON(start.creation_options.publicKey)
            const credential = await navigator.credentials.create({ publicKey })
            if (!credential) {
                throw new Error('Passkey registration was cancelled.')
            }
            await authApi.finishPasskeyRegistration({
                challenge_id: start.challenge_id,
                name: passkeyName.trim() || 'Security Key',
                credential: (credential as unknown as { toJSON: () => unknown }).toJSON(),
            })
            await load()
        } catch (error) {
            setPasskeyError(error instanceof Error ? error.message : 'Failed to register passkey.')
        } finally {
            setRegisteringPasskey(false)
        }
    }

    const removePasskey = async (id: string) => {
        setPasskeyError('')
        try {
            await authApi.deletePasskey(id)
            await load()
        } catch (error) {
            setPasskeyError(error instanceof Error ? error.message : 'Failed to remove passkey.')
        }
    }

    const startTotpEnrollment = async () => {
        if (demoMode) return

        setTotpLoading(true)
        setTotpError('')
        try {
            const result = await authApi.startTotpEnrollment()
            setTotpChallengeId(result.challenge_id)
            setTotpSecret(result.secret)
            setTotpUri(result.otpauth_uri)
        } catch (error) {
            setTotpError(error instanceof Error ? error.message : 'Failed to start TOTP setup.')
        } finally {
            setTotpLoading(false)
        }
    }

    const finishTotpEnrollment = async () => {
        if (demoMode || !totpChallengeId) return

        setTotpLoading(true)
        setTotpError('')
        try {
            await authApi.finishTotpEnrollment({ challenge_id: totpChallengeId, code: totpCode })
            setTotpChallengeId('')
            setTotpSecret('')
            setTotpUri('')
            setTotpQrCode('')
            setTotpCode('')
            setBackupCodes([])
            await load()
        } catch (error) {
            setTotpError(error instanceof Error ? error.message : 'Failed to verify TOTP code.')
        } finally {
            setTotpLoading(false)
        }
    }

    const disableTotp = async () => {
        if (demoMode || adminRequireMfa) return

        setTotpLoading(true)
        setTotpError('')
        try {
            await authApi.disableTotp()
            setTotpEnabled(false)
            setTotpChallengeId('')
            setTotpSecret('')
            setTotpUri('')
            setTotpQrCode('')
            setTotpCode('')
            setBackupCodes([])
            setBackupCodesRemaining(0)
        } catch (error) {
            setTotpError(error instanceof Error ? error.message : 'Failed to disable TOTP.')
        } finally {
            setTotpLoading(false)
        }
    }

    const regenerateBackupCodes = async () => {
        if (demoMode) return

        setTotpLoading(true)
        setTotpError('')
        try {
            const result = await authApi.regenerateRecoveryCodes()
            setBackupCodes(result.codes)
            setBackupCodesRemaining(result.remaining)
        } catch (error) {
            setTotpError(error instanceof Error ? error.message : 'Failed to generate backup codes.')
        } finally {
            setTotpLoading(false)
        }
    }

    return {
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
        passkeyPageSize: PASSKEY_PAGE_SIZE,
    }
}
