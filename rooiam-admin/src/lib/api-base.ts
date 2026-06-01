const rawApiBase = import.meta.env.VITE_API_URL?.trim() ?? ''
const rawDocsBase = import.meta.env.VITE_DOCS_URL?.trim() ?? ''

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

export async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, { credentials: 'include', ...init })
  if (res.status === 401) {
    throw new Error('UNAUTHORIZED')
  }
  return res
}

export function getOAuthCallbackUrl(provider: 'google' | 'microsoft', issuerUrl?: string): string
{
  const origin = issuerUrl ? new URL(issuerUrl).toString().replace(/\/+$/, '') : getApiOrigin()
  return `${origin}/api/v1/auth/${provider}/callback`
}

function normalizeExternalBase(url: string): string
{
  return new URL(url, window.location.origin).toString().replace(/\/+$/, '')
}

export function getDocsUrl(path = '/docs/quick-start'): string
{
  const normalizedPath = path.startsWith('/') ? path : `/${path}`

  if (rawDocsBase)
  {
    return `${normalizeExternalBase(rawDocsBase)}${normalizedPath}`
  }

    const current = new URL(window.location.href)
    if (current.hostname === 'localhost' || current.hostname === '127.0.0.1')
    {
        return `${current.protocol}//${current.hostname}:5175${normalizedPath}`
    }

    if (current.port === '5171')
    {
        return `${current.protocol}//${current.hostname}:5175${normalizedPath}`
    }

  return `${current.origin}${normalizedPath}`
}
