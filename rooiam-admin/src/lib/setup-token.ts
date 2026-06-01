const STORAGE_KEY = 'rooiam_setup_token'

export function getSetupToken(): string | null
{
    if (typeof window === 'undefined') return null

    try
    {
        const params = new URLSearchParams(window.location.search)
        const fromUrl = params.get('setup_token')?.trim()
        if (fromUrl) {
            window.sessionStorage.setItem(STORAGE_KEY, fromUrl)
            return fromUrl
        }

        return window.sessionStorage.getItem(STORAGE_KEY)
    } catch
    {
        return null
    }
}

export function getSetupAuthHeaders(): Record<string, string>
{
    const token = getSetupToken()
    return token ? { 'X-Rooiam-Setup-Token': token } : {}
}

export function setSetupToken(token: string): void
{
    if (typeof window === 'undefined') return

    try
    {
        const value = token.trim()
        if (value) {
            window.sessionStorage.setItem(STORAGE_KEY, value)
        } else {
            window.sessionStorage.removeItem(STORAGE_KEY)
        }
    } catch
    {
        // Ignore storage failures and let requests proceed without the token.
    }
}
