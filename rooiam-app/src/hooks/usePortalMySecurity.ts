import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { tenantAuthApi, type TenantPasskey } from '../lib/auth-api'

const PASSKEY_PAGE_SIZE = 6

export type PortalMySecurityTab = 'passkeys' | 'totp'

export function usePortalMySecurity() {
    const [loading, setLoading] = useState(true)
    const [passkeys, setPasskeys] = useState<TenantPasskey[]>([])
    const [totpEnabled, setTotpEnabled] = useState(false)
    const [backupCodesRemaining, setBackupCodesRemaining] = useState(0)
    const [backupCodes, setBackupCodes] = useState<string[]>([])
    const [registeringPasskey, setRegisteringPasskey] = useState(false)
    const [passkeyName, setPasskeyName] = useState('My Device')
    const [passkeyError, setPasskeyError] = useState('')
    const [totpLoading, setTotpLoading] = useState(false)
    const [totpError, setTotpError] = useState('')
    const [totpChallengeId, setTotpChallengeId] = useState('')
    const [totpSecret, setTotpSecret] = useState('')
    const [totpUri, setTotpUri] = useState('')
    const [totpCode, setTotpCode] = useState('')
    const [totpQrCode, setTotpQrCode] = useState('')
    const [statusMessage, setStatusMessage] = useState('')
    const [errorMessage, setErrorMessage] = useState('')
    const [passkeysPage, setPasskeysPage] = useState(1)

    const savedTab = localStorage.getItem('rooiam_tab_portal_my_access') as PortalMySecurityTab | null
    const [tab, setTab] = useState<PortalMySecurityTab>(
        savedTab && ['passkeys', 'totp'].includes(savedTab) ? savedTab : 'passkeys'
    )
    const handleTabChange = (nextTab: PortalMySecurityTab) => {
        setTab(nextTab)
        localStorage.setItem('rooiam_tab_portal_my_access', nextTab)
    }

    const load = async () => {
        setLoading(true)
        setErrorMessage('')
        try {
            const [passkeyData, mfaData] = await Promise.all([
                tenantAuthApi.passkeys(),
                tenantAuthApi.mfaStatus(),
            ])
            setPasskeys(passkeyData)
            setTotpEnabled(mfaData.totp_enabled)
            setBackupCodesRemaining(mfaData.backup_codes_remaining)
        } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : 'Failed to load account data. Please refresh.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void load()
    }, [])

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

    const pagedPasskeys = useMemo(() => {
        const start = (passkeysPage - 1) * PASSKEY_PAGE_SIZE
        return passkeys.slice(start, start + PASSKEY_PAGE_SIZE)
    }, [passkeys, passkeysPage])

    const registerPasskey = async () => {
        setRegisteringPasskey(true)
        setPasskeyError('')
        setErrorMessage('')
        setStatusMessage('')
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
            const start = await tenantAuthApi.startPasskeyRegistration()
            const publicKey = parseCreationOptionsFromJSON(start.creation_options.publicKey)
            const credential = await navigator.credentials.create({ publicKey })
            if (!credential) {
                throw new Error('Passkey registration was cancelled.')
            }
            await tenantAuthApi.finishPasskeyRegistration({
                challenge_id: start.challenge_id,
                name: passkeyName.trim() || 'My Device',
                credential: (credential as unknown as { toJSON: () => unknown }).toJSON(),
            })
            setStatusMessage('Passkey added.')
            await load()
        } catch (error) {
            setPasskeyError(error instanceof Error ? error.message : 'Failed to register passkey.')
        } finally {
            setRegisteringPasskey(false)
        }
    }

    const removePasskey = async (id: string) => {
        setPasskeyError('')
        setErrorMessage('')
        setStatusMessage('')
        try {
            await tenantAuthApi.deletePasskey(id)
            setStatusMessage('Passkey removed.')
            await load()
        } catch (error) {
            setPasskeyError(error instanceof Error ? error.message : 'Failed to remove passkey.')
        }
    }

    const startTotpEnrollment = async () => {
        setTotpLoading(true)
        setTotpError('')
        setErrorMessage('')
        setStatusMessage('')
        try {
            const result = await tenantAuthApi.startTotpEnrollment()
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
        if (!totpChallengeId) return

        setTotpLoading(true)
        setTotpError('')
        setErrorMessage('')
        setStatusMessage('')
        try {
            const result = await tenantAuthApi.finishTotpEnrollment({ challenge_id: totpChallengeId, code: totpCode })
            setTotpChallengeId('')
            setTotpSecret('')
            setTotpUri('')
            setTotpQrCode('')
            setTotpCode('')
            setBackupCodes(result.backup_codes)
            setBackupCodesRemaining(result.backup_codes.length)
            setStatusMessage('TOTP MFA enabled. Save your backup codes — they are shown only once.')
            await load()
        } catch (error) {
            setTotpError(error instanceof Error ? error.message : 'Failed to verify the TOTP code.')
        } finally {
            setTotpLoading(false)
        }
    }

    const disableTotp = async () => {
        setTotpLoading(true)
        setTotpError('')
        setErrorMessage('')
        setStatusMessage('')
        try {
            await tenantAuthApi.disableTotp()
            setTotpEnabled(false)
            setTotpChallengeId('')
            setTotpSecret('')
            setTotpUri('')
            setTotpQrCode('')
            setTotpCode('')
            setBackupCodes([])
            setBackupCodesRemaining(0)
            setStatusMessage('TOTP MFA disabled.')
        } catch (error) {
            setTotpError(error instanceof Error ? error.message : 'Failed to disable TOTP.')
        } finally {
            setTotpLoading(false)
        }
    }

    const regenerateBackupCodes = async () => {
        setTotpLoading(true)
        setTotpError('')
        setErrorMessage('')
        setStatusMessage('')
        try {
            const result = await tenantAuthApi.regenerateRecoveryCodes()
            setBackupCodes(result.codes)
            setBackupCodesRemaining(result.remaining)
            setStatusMessage('New backup codes generated.')
        } catch (error) {
            setTotpError(error instanceof Error ? error.message : 'Failed to generate backup codes.')
        } finally {
            setTotpLoading(false)
        }
    }

    const renamePasskeyLocally = (id: string, name: string) => {
        setPasskeys(prev => prev.map(p => p.id === id ? { ...p, name } : p))
    }

    return {
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
        passkeyPageSize: PASSKEY_PAGE_SIZE,
    }
}
