export function resolveAuthRedirect(target: string, fallback = '/'): string
{
    const value = target.trim()
    if (!value) return fallback

    if (value.startsWith('/') && !value.startsWith('//'))
    {
        return value
    }

    try
    {
        const url = new URL(value)
        if (url.protocol === 'http:' || url.protocol === 'https:')
        {
            return url.toString()
        }
    } catch
    {
        // Invalid absolute URL. Fall through to the safe fallback.
    }

    return fallback
}
