// Helpers for calling the Rooiam API server-side (no browser CORS involved).

const ROOIAM_API = (process.env.ROOIAM_API_URL || 'http://localhost:5180/v1').replace(/\/+$/, '')

/**
 * Exchange an OIDC authorization code for tokens.
 * Called server-side — no CORS, no browser cookie needed.
 */
export async function exchangeCode({ code, redirectUri, clientId, codeVerifier }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  })

  const res = await fetch(`${ROOIAM_API}/oidc/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error_description || data?.error || `token exchange failed: ${res.status}`
    throw Object.assign(new Error(msg), { status: res.status })
  }
  return data // { access_token, token_type, expires_in, refresh_token, id_token }
}

/**
 * Fetch userinfo from Rooiam using an access token.
 */
export async function fetchUserinfo(accessToken) {
  const res = await fetch(`${ROOIAM_API}/oidc/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw Object.assign(new Error('userinfo failed'), { status: res.status })
  }
  return data
}

/**
 * Proxy a request to Rooiam using the stored access token.
 * Returns { status, data }.
 */
export async function proxyToRooiam(path, { method = 'GET', body, accessToken, contentType } = {}) {
  const headers = {}
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`
  if (contentType) headers['Content-Type'] = contentType

  const res = await fetch(`${ROOIAM_API}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body } : {}),
  })

  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }
  return { status: res.status, data, ok: res.ok }
}
