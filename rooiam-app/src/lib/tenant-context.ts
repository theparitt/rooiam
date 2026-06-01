export type TenantContext = {
    appName: string
    workspaceId: string
    workspaceSlug: string
    redirectUri: string
}

export const DEFAULT_APP_NAME = 'Your App'

function normalizedValue(value?: string | null): string
{
    return value?.trim() || ''
}

function isMeaningfulAppName(appName?: string | null): boolean
{
    const value = normalizedValue(appName)
    return value.length > 0 && value !== DEFAULT_APP_NAME
}

function buildRedirectParams(workspaceSlug: string, appName?: string, workspaceId?: string): URLSearchParams
{
    const params = new URLSearchParams()
    const normalizedWorkspaceId = normalizedValue(workspaceId)
    if (normalizedWorkspaceId) {
        params.set('workspace_id', normalizedWorkspaceId)
    }
    const normalizedWorkspaceSlug = normalizedValue(workspaceSlug)
    if (normalizedWorkspaceSlug) {
        params.set('workspace', normalizedWorkspaceSlug)
    }

    if (isMeaningfulAppName(appName)) {
        params.set('app', normalizedValue(appName))
    }

    return params
}

function resolveRedirectTarget(value: string): string
{
    try {
        return new URL(value, window.location.origin).toString()
    } catch {
        return value
    }
}

export function buildTenantLoginPath(workspaceSlug: string, appName?: string, workspaceId?: string): string
{
    const params = buildRedirectParams(workspaceSlug, appName, workspaceId)
    const query = params.toString()
    return query ? `/?${query}` : '/'
}

export function buildTenantPortalRedirect(workspaceSlug: string, appName?: string): string
{
    const normalizedSlug = normalizedValue(workspaceSlug)
    if (normalizedSlug) {
        const base = `/workspace/${normalizedSlug}/overview`
        if (isMeaningfulAppName(appName)) {
            return `${base}?app=${encodeURIComponent(normalizedValue(appName))}`
        }
        return base
    }
    return '/tenant/workspaces'
}

export function getTenantContext(search = window.location.search): TenantContext
{
    // New contract: the client never supplies the login destination. The server
    // resolves it from the registered app config (workspace_id + client_id) and
    // returns it as `redirect_uri`. The only thing the client computes here is its
    // own first-party default portal landing path, used when the server returns no
    // destination (a plain tenant-portal login with no specific target).
    // See project_rooiam_widget_redirect_contract.
    const params = new URLSearchParams(search)
    const workspaceId = params.get('workspace_id') || ''
    const workspaceSlug =
        params.get('org') ||
        params.get('workspace') ||
        ''
    const explicitAppName = params.get('app') || ''
    const appName = explicitAppName || DEFAULT_APP_NAME
    const resolvedRedirectUri = resolveRedirectTarget(buildTenantPortalRedirect(workspaceSlug, explicitAppName))

    return {
        appName,
        workspaceId,
        workspaceSlug,
        redirectUri: resolvedRedirectUri,
    }
}
