import fs from 'node:fs'
import path from 'node:path'

/**
 * Shared helpers for the small Rooiam examples.
 *
 * These examples are intentionally simple, but they still repeat the same
 * setup tasks:
 * - read local config
 * - normalize Rooiam base URLs
 * - build the hosted-widget iframe URL
 * - parse cookies
 * - call the Rooiam API and return friendly errors
 *
 * Keeping those tasks here makes each example server easier to follow:
 * the route handlers can focus on the actual auth or API flow being taught.
 */

export function normalizeBaseUrl(value, fallback) {
  return String(value || fallback || '').replace(/\/+$/, '')
}

/**
 * Load example config from `config.local.json` first, then fall back to the
 * checked-in example config. This keeps the examples runnable out of the box
 * while still letting a developer override values locally.
 */
export function readExampleConfig(exampleDir = process.cwd()) {
  const localPath = path.join(exampleDir, 'config.local.json')
  const examplePath = path.join(exampleDir, 'config.example.json')
  const filePath = fs.existsSync(localPath) ? localPath : examplePath
  const base = JSON.parse(fs.readFileSync(filePath, 'utf8'))

  // Docker and deployed examples are easier to operate when the same
  // checked-in config can be overridden by environment variables.
  return {
    ...base,
    workspace_id: process.env.EXAMPLE_WORKSPACE_ID ?? base.workspace_id,
    workspace_slug: process.env.EXAMPLE_WORKSPACE_SLUG ?? base.workspace_slug,
    client_id: process.env.EXAMPLE_CLIENT_ID ?? base.client_id,
    app_name: process.env.EXAMPLE_APP_NAME ?? base.app_name,
    widget_base_url: process.env.EXAMPLE_WIDGET_BASE_URL ?? base.widget_base_url,
  }
}

/**
 * Build the strict hosted-widget URL.
 *
 * The widget contract is intentionally narrow:
 * - identify the workspace
 * - identify the app
 * - identify the client
 *
 * The browser does not choose the final app callback here.
 */
export function buildHostedWidgetUrl(config = {}) {
  const url = new URL(config.widget_base_url || 'http://localhost:5170/login-widget')

  if ((config.workspace_id || '').trim()) {
    url.searchParams.set('workspace_id', config.workspace_id.trim())
  } else if ((config.workspace_slug || '').trim()) {
    url.searchParams.set('org', config.workspace_slug.trim())
  }

  url.searchParams.set('app', config.app_name || 'Rooiam Example')

  if ((config.client_id || '').trim()) {
    url.searchParams.set('client_id', config.client_id.trim())
  }

  return url.toString()
}

export function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=')
        if (index < 0) return [part, '']
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))]
      }),
  )
}

/**
 * Small JSON fetch wrapper used by the example servers.
 *
 * It intentionally returns a friendly object instead of throwing framework-ish
 * errors so the examples can show readable failure states in the browser.
 */
export async function requestJson(url, options = {}) {
  try {
    const response = await fetch(url, options)
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: data?.error?.message || `${response.status} ${response.statusText}`,
        data,
      }
    }

    return {
      ok: true,
      status: response.status,
      data,
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'Request failed.',
      data: {},
    }
  }
}

/**
 * Workspace API-key helper used by examples 2 and 3.
 *
 * The Rooiam integration APIs always require a workspace API key. We keep the
 * wrapper small and explicit here so a developer can see exactly what is being
 * proxied to the real server.
 */
export async function callWorkspaceApi({
  apiBase,
  apiKey,
  pathname,
  method = 'GET',
  body,
  headers = {},
}) {
  if (!String(apiKey || '').trim()) {
    return {
      ok: false,
      status: 0,
      error: 'Missing workspace API key.',
      data: {},
    }
  }

  return requestJson(`${normalizeBaseUrl(apiBase, '')}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${String(apiKey).trim()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}
