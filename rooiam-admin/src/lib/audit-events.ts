type AuditLike = {
    action: string
    metadata: Record<string, unknown>
}

const ACTION_LABELS: Record<string, string> = {
    'auth.widget.expired': 'Hosted login session expired',
    'auth.widget.context_invalid': 'Hosted login session rejected',
    'auth.widget.embed_origin_blocked': 'Hosted login site blocked',
    'auth.widget.app_callback_rejected': 'Hosted login app callback rejected',
    'auth.app_callback_rejected': 'App callback rejected',
    'auth.logout.redirect_rejected': 'Logout callback rejected',
    'api_key.used': 'API key used',
}

export function actionLabel(action: string): string {
    return ACTION_LABELS[action] ?? action.replace(/\./g, ' › ')
}

type ActionTone = 'login' | 'logout' | 'failed' | 'delete' | 'create' | 'modify' | 'workspace' | 'admin' | 'oauth' | 'mfa' | 'identity' | 'info'

export function actionStatusTone(action: string): ActionTone {
    if (action.includes('login.success')) return 'login'
    if (action.includes('logout.success')) return 'logout'
    if (action.includes('.failed') || action.includes('.blocked') || action.includes('.suspicious') || action.includes('.binding_mismatch') || action.includes('.expired') || action.includes('.invalid')) return 'failed'
    if (action.includes('.deleted') || action.includes('.removed') || action.includes('.revoked') || action.includes('.disabled') || action.includes('.rejected')) return 'delete'
    if (action.startsWith('admin.') || action.startsWith('platform.')) return 'admin'
    if (action.startsWith('oauth.') || action.includes('token.issued') || action.includes('token.refreshed')) return 'oauth'
    if (action.includes('auth.mfa.') || action.includes('auth.passkey.')) return 'mfa'
    if (action.startsWith('workspace.')) return 'workspace'
    if (action.startsWith('identity.') || action.startsWith('user.') || action.includes('sessions.revoked') || action.includes('session.')) return 'identity'
    if (action.includes('.created') || action.includes('.registered') || action.includes('.enrolled') || action.includes('.invited') || action.includes('.accepted') || action.includes('.sent') || action.includes('.requested')) return 'create'
    if (action.includes('.updated') || action.includes('.changed') || action.includes('.restored') || action.includes('.rotated') || action.includes('.renamed')) return 'modify'
    return 'info'
}

export function auditActionContext(log: AuditLike): string {
    const appName = typeof log.metadata?.app_name === 'string' ? log.metadata.app_name : null
    const workspaceSlug = typeof log.metadata?.workspace_slug === 'string' ? log.metadata.workspace_slug : null
    const apiKeyLabel = typeof log.metadata?.label === 'string' ? log.metadata.label : null

    if (log.action === 'api_key.used') {
        return apiKeyLabel || 'Workspace API key'
    }

    return appName || (workspaceSlug ? `Workspace ${workspaceSlug}` : '')
}

export function apiRouteArea(path: string | null | undefined): string {
    const value = path?.trim() || ''
    if (!value) return 'Workspace'
    if (value.includes('/integrations/workspace')) return 'Workspace'
    if (value.includes('/integrations/branding') || value.includes('/integrations/widget-preview-config')) return 'Branding'
    if (value.includes('/integrations/auth-config')) return 'Auth Config'
    if (value.includes('/integrations/clients')) return 'Apps'
    if (value.includes('/integrations/members')) return 'Members'
    if (value.includes('/integrations/invites')) return 'Invites'
    if (value.includes('/integrations/activity') || value.includes('/integrations/audit/actions')) return 'Activity'
    if (value.includes('/integrations/effective-policy') || value.includes('/integrations/policy-summary') || value.includes('/integrations/permissions') || value.includes('/integrations/roles')) return 'Policy'
    if (value.includes('/integrations/api-keys')) return 'API Keys'
    return 'Workspace'
}

export function apiRoutePurpose(path: string | null | undefined): string {
    const value = path?.trim() || ''
    if (!value) return ''
    if (value.includes('/integrations/workspace')) return 'Read workspace profile'
    if (value.includes('/integrations/branding')) return 'Read or update branding'
    if (value.includes('/integrations/auth-config')) return 'Read or update auth config'
    if (value.includes('/integrations/clients')) return 'Manage workspace apps'
    if (value.includes('/integrations/members') && value.includes('/sessions')) return 'Read or revoke member sessions'
    if (value.includes('/integrations/members') && value.includes('/activity')) return 'Read member activity'
    if (value.includes('/integrations/members')) return 'Manage workspace members'
    if (value.includes('/integrations/invites')) return 'Manage workspace invites'
    if (value.includes('/integrations/activity')) return 'Read workspace audit activity'
    if (value.includes('/integrations/effective-policy')) return 'Read effective policy'
    if (value.includes('/integrations/policy-summary')) return 'Read policy summary'
    if (value.includes('/integrations/widget-preview-config')) return 'Read widget preview config'
    if (value.includes('/integrations/roles')) return 'Read role catalog'
    if (value.includes('/integrations/permissions')) return 'Read permission catalog'
    if (value.includes('/integrations/api-keys/me')) return 'Read current API key details'
    if (value.includes('/integrations/audit/actions')) return 'Read audit action catalog'
    return 'Workspace API request'
}
