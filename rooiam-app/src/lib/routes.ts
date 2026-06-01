import type { PortalSection } from './portal-types'

export const portalRoutes = {
    workspaceOverview: (orgSlug: string) => `/workspace/${orgSlug}/overview`,
    workspaceMembers: (orgSlug: string) => `/workspace/${orgSlug}/members`,
    workspaceApps: (orgSlug: string, appId?: string) => appId ? `/workspace/${orgSlug}/apps/${appId}` : `/workspace/${orgSlug}/apps`,
    workspaceRegisterApp: (orgSlug: string) => `/workspace/${orgSlug}/apps/register`,
    workspaceAuditLogs: (orgSlug: string) => `/workspace/${orgSlug}/audit-logs`,
    workspaceSessionPolicy: (orgSlug: string) => `/workspace/${orgSlug}/session-policy`,
    workspaceAccess: (orgSlug: string) => `/workspace/${orgSlug}/access`,
    workspaceDangerZone: (orgSlug: string) => `/workspace/${orgSlug}/danger-zone`,
    workspaceBranding: (orgSlug: string) => `/workspace/${orgSlug}/branding`,
    workspaceLoginWidget: (orgSlug: string) => `/workspace/${orgSlug}/login-widget`,
    workspaceApiKeys: (orgSlug: string) => `/workspace/${orgSlug}/api-keys`,
    workspaceSecurityAlerts: (orgSlug: string) => `/workspace/${orgSlug}/security-alerts`,
    tenantWorkspaces: () => '/tenant/workspaces',
    tenantAccess: () => '/tenant/access',
    tenantAuditLogs: () => '/tenant/audit-logs',
    tenantSecurityAlerts: () => '/tenant/security-alerts',
    tenantSettings: () => '/tenant/settings',
    myProfile: () => '/my/profile',
    myAccount: () => '/my/account',
    mySecurity: () => '/my/security',
    mySessions: () => '/my/sessions',
    myAuditLogs: () => '/my/audit-logs',
    mySecurityAlerts: () => '/my/security-alerts',
    myRoles: () => '/my/roles',
} as const

export function portalSectionToPath(section: PortalSection, orgSlug: string): string {
    if (section === 'workspaces') return portalRoutes.tenantWorkspaces()
    if (section === 'tenant-access') return portalRoutes.tenantAccess()
    if (section === 'tenant-audit-logs') return portalRoutes.tenantAuditLogs()
    if (section === 'tenant-security-alerts') return portalRoutes.tenantSecurityAlerts()
    if (section === 'tenant-settings') return portalRoutes.tenantSettings()
    if (section === 'profile') return portalRoutes.myProfile()
    if (section === 'my-account') return portalRoutes.myAccount()
    if (section === 'my-security') return portalRoutes.mySecurity()
    if (section === 'my-sessions') return portalRoutes.mySessions()
    if (section === 'my-audit-logs') return portalRoutes.myAuditLogs()
    if (section === 'my-security-alerts') return portalRoutes.mySecurityAlerts()
    if (section === 'my-roles') return portalRoutes.myRoles()
    if (section === 'members') return portalRoutes.workspaceMembers(orgSlug)
    if (section === 'workspace-apps') return portalRoutes.workspaceApps(orgSlug)
    if (section === 'workspace-register-app') return portalRoutes.workspaceRegisterApp(orgSlug)
    if (section === 'workspace-audit-logs') return portalRoutes.workspaceAuditLogs(orgSlug)
    if (section === 'workspace-session-policy') return portalRoutes.workspaceSessionPolicy(orgSlug)
    if (section === 'workspace-access') return portalRoutes.workspaceAccess(orgSlug)
    if (section === 'workspace-danger-zone') return portalRoutes.workspaceDangerZone(orgSlug)
    if (section === 'branding') return portalRoutes.workspaceBranding(orgSlug)
    if (section === 'workspace-login-widget') return portalRoutes.workspaceLoginWidget(orgSlug)
    if (section === 'api-keys') return portalRoutes.workspaceApiKeys(orgSlug)
    if (section === 'workspace-security-alerts') return portalRoutes.workspaceSecurityAlerts(orgSlug)
    return portalRoutes.workspaceOverview(orgSlug)
}
