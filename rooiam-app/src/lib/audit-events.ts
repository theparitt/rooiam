import type { OrganizationActivityItem } from './portal-types'

const ACTION_LABELS: Record<string, string> = {
    'workspace.auth_policy.updated': 'Workspace access policy updated',
    'workspace.auth_policy.snapshot_restored': 'Workspace access policy restored',
    'workspace.status.updated': 'Workspace lifecycle updated',
    'workspace.owner_transfer.initiated': 'Workspace ownership transfer started',
    'workspace.owner_transfer.accepted': 'Workspace ownership transfer accepted',
    'tenant_auth_config.updated': 'Tenant access provider configuration updated',
    'api_key.created': 'API key created',
    'api_key.revoked': 'API key revoked',
    'api_key.used': 'API key used',
    'oauth.token.issued': 'User signed in via OAuth client',
    'oauth.login.success': 'OAuth social login succeeded',
    'oauth.login.failed': 'OAuth social login failed',
    'auth.widget.expired': 'Hosted login session expired',
    'auth.widget.context_invalid': 'Hosted login session rejected',
    'auth.widget.embed_origin_blocked': 'Hosted login site blocked',
    'auth.widget.app_callback_rejected': 'Hosted login app callback rejected',
    'auth.app_callback_rejected': 'App callback rejected',
    'auth.logout.redirect_rejected': 'Logout callback rejected',
    'member.invited': 'Member invited',
    'member.role.updated': 'Member role changed',
    'member.removed': 'Member removed',
    'org.branding.updated': 'Branding updated',
    'org.auth_policy.updated': 'Access policy updated',
    'org.auth_config.updated': 'Provider credentials updated',
    'org.api_key.created': 'API key created',
    'org.api_key.revoked': 'API key revoked',
    'org.client.created': 'OAuth client created',
    'org.client.deleted': 'OAuth client deleted',
    'auth.magic_link.sent': 'Magic link sent',
    'auth.magic_link.verified': 'Magic link verified',
    'auth.mfa.required': 'MFA challenge required',
    'auth.mfa.verified': 'MFA verified',
}

export function actionLabel(action: string): string {
    return ACTION_LABELS[action] ?? action.replace(/\./g, ' › ')
}

export type ActionTone =
    | 'login' | 'logout'
    | 'failed'
    | 'delete'
    | 'create'
    | 'modify'
    | 'workspace'
    | 'admin'
    | 'oauth'
    | 'mfa'
    | 'identity'
    | 'info'

export function actionStatusTone(action: string): ActionTone {
    if (action.includes('login.success')) return 'login'
    if (action.includes('logout.success')) return 'logout'

    // Failures — always rose/red regardless of namespace
    if (action.includes('.failed') || action.includes('.blocked') || action.includes('.suspicious') || action.includes('.binding_mismatch') || action.includes('.expired') || action.includes('.invalid')) return 'failed'

    // Destructive — strong red
    if (action.includes('.deleted') || action.includes('.removed') || action.includes('.revoked') || action.includes('.disabled') || action.includes('.rejected') || action.includes('account.deletion') || action.includes('account.deleted')) return 'delete'

    // Admin / platform operator actions — amber
    if (action.startsWith('admin.') || action.startsWith('platform.')) return 'admin'

    // OAuth tokens — violet
    if (action.startsWith('oauth.') || action.includes('token.issued') || action.includes('token.refreshed')) return 'oauth'

    // MFA and passkeys — cyan
    if (action.includes('auth.mfa.') || action.includes('auth.passkey.')) return 'mfa'

    // Workspace-scoped events — indigo
    if (action.startsWith('workspace.')) return 'workspace'

    // Identity / profile / session / user — purple
    if (action.startsWith('identity.') || action.startsWith('user.') || action.includes('sessions.revoked') || action.includes('session.')) return 'identity'

    // Create / register / enroll / invite / accept — emerald
    if (action.includes('.created') || action.includes('.registered') || action.includes('.enrolled') || action.includes('.invited') || action.includes('.accepted') || action.includes('.sent') || action.includes('.requested')) return 'create'

    // Modify / update / change / restore — sky
    if (action.includes('.updated') || action.includes('.changed') || action.includes('.restored') || action.includes('.rotated') || action.includes('.renamed') || action.includes('_transfer.') || action.includes('role_changed') || action.includes('.reauth_required')) return 'modify'

    return 'info'
}

export function activityContextSummary(item: OrganizationActivityItem): string {
    const appName = typeof item.metadata?.app_name === 'string' ? item.metadata.app_name : null
    const workspaceSlug = typeof item.metadata?.workspace_slug === 'string' ? item.metadata.workspace_slug : null

    if (item.action === 'api_key.used') {
        return ''
    }

    return [appName, workspaceSlug ? `Workspace ${workspaceSlug}` : null].filter(Boolean).join(' · ')
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
