const rawApiBase = import.meta.env.VITE_API_URL?.trim() ?? ''

function normalizeApiBase(apiBase: string): string
{
    return new URL(apiBase, window.location.origin).toString().replace(/\/+$/, '')
}

export function getApiConfigError(): string | null
{
    if (!rawApiBase)
    {
        return 'Missing VITE_API_URL. Set it to your Rooiam API base, for example https://auth.example.com/v1.'
    }

    try
    {
        normalizeApiBase(rawApiBase)
        return null
    } catch
    {
        return 'Invalid VITE_API_URL. Use a valid absolute URL like https://auth.example.com/v1 or an explicit path like /v1.'
    }
}

export function getApiBase(): string
{
    const error = getApiConfigError()
    if (error)
    {
        throw new Error(error)
    }

    return normalizeApiBase(rawApiBase)
}

export function getApiOrigin(): string
{
    return new URL(getApiBase()).origin
}

/** Fetch wrapper that throws on non-2xx. On 401 reloads the page (forces re-login). */
export async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response>
{
    const res = await fetch(input, { credentials: 'include', ...init })
    if (res.status === 401)
    {
        // Return the 401 response — callers check res.status themselves and handle redirect.
        // Do NOT reload here — that causes an infinite loop when the session is genuinely expired.
        return res
    }
    return res
}

export function resolveApiAssetUrl(assetUrl: string | null | undefined): string
{
    const value = assetUrl?.trim()
    if (!value)
    {
        return ''
    }

    if (value.startsWith('http://') || value.startsWith('https://'))
    {
        return value
    }

    return new URL(value, getApiOrigin()).toString()
}
