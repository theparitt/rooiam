import type { PortalSection } from './portal-types'

export const WORKSPACE_SECTION_FROM_PATH: Record<string, PortalSection> = {
    overview: 'overview',
    members: 'members',
    apps: 'workspace-apps',
    register: 'workspace-register-app',
    'audit-logs': 'workspace-audit-logs',
    'security-alerts': 'workspace-security-alerts',
    'session-policy': 'workspace-session-policy',
    access: 'workspace-access',
    'danger-zone': 'workspace-danger-zone',
    branding: 'branding',
    'login-widget': 'workspace-login-widget',
    'api-keys': 'api-keys',
}

export const TENANT_SECTION_FROM_PATH: Record<string, PortalSection> = {
    workspaces: 'workspaces',
    access: 'tenant-access',
    'audit-logs': 'tenant-audit-logs',
    'security-alerts': 'tenant-security-alerts',
    settings: 'tenant-settings',
}

export const MY_SECTION_FROM_PATH: Record<string, PortalSection> = {
    profile: 'profile',
    account: 'my-account',
    security: 'my-security',
    sessions: 'my-sessions',
    'audit-logs': 'my-audit-logs',
    'security-alerts': 'my-security-alerts',
    roles: 'my-roles',
}

export const RESERVED_WORKSPACE_SLUGS = [
    'tenant',
    'workspace',
    'my',
    'me',
    'app',
    'verify',
    'success',
    'oauth',
    'api',
    'admin',
    'health',
] as const
