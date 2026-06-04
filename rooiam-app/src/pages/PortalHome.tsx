import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, AppWindow, Building2, Clock3, Database, Eye, Key, KeyRound, LayoutDashboard, Link2, Loader2, Monitor, Palette, Settings2, ShieldAlert, ShieldCheck, UserCircle, Users } from 'lucide-react'
import { apiFetch, getApiBase } from '../lib/api-base'
import { APP_LABEL_PLURAL, TENANT_LABEL, WORKSPACE_LABEL_PLURAL, WORKSPACE_LOGIN_POLICY_LABEL } from '../lib/domain-labels'
import { buildTenantLoginPath, buildTenantPortalRedirect } from '../lib/tenant-context'
import { portalRoutes, portalSectionToPath } from '../lib/routes'
import { AuthPolicyForm, BrandingForm, DEFAULT_BRAND, DEFAULT_LOGIN_METHOD_ORDER, MeResponse, OrgClient, OrganizationActivityItem, OrganizationInvite, OrganizationMember, OrganizationRole, OrgIpPolicyResponse, PortalResponse, PortalSection, TenantApiKey, TenantIpPolicy } from '../lib/portal-types'
import { MY_SECTION_FROM_PATH, TENANT_SECTION_FROM_PATH, WORKSPACE_SECTION_FROM_PATH } from '../lib/portal-sections'
import { normalizeLoginMethodOrder, normalizeWorkspaceIconContainer } from '../lib/login-style'
import PortalShell from '../components/portal/PortalShell'
import PortalOnboarding from './portal/PortalOnboarding'
import PortalWorkspaceOverview from './portal/PortalWorkspaceOverview'
import PortalTenantWorkspaces from './portal/PortalTenantWorkspaces'
import PortalWorkspaceBranding from './portal/PortalWorkspaceBranding'
import PortalWorkspaceMembers from './portal/PortalWorkspaceMembers'
import PortalWorkspaceAccess from './portal/PortalWorkspaceAccess'
import PortalTenantAccess from './portal/PortalTenantAccess'
import PortalWorkspaceLoginWidget from './portal/PortalWorkspaceLoginWidget'
import PortalWorkspaceAuditLogs from './portal/PortalWorkspaceAuditLogs'
import PortalWorkspaceSessionPolicy from './portal/PortalWorkspaceSessionPolicy'
import PortalWorkspaceDangerZone from './portal/PortalWorkspaceDangerZone'
import PortalWorkspaceAppOverview from './portal/PortalWorkspaceAppOverview'
import PortalWorkspaceApps from './portal/PortalWorkspaceApps'
import PortalWorkspaceRegisterApp from './portal/PortalWorkspaceRegisterApp'
import PortalWorkspaceApiKeys from './portal/PortalWorkspaceApiKeys'
import PortalMyAccount from './portal/PortalMyAccount'
import PortalMySecurity from './portal/PortalMySecurity'
import PortalMyProfile from './portal/PortalMyProfile'
import PortalTenantAuditLogs from './portal/PortalTenantAuditLogs'
import PortalMySessions from './portal/PortalMySessions'
import PortalMyAuditLogs from './portal/PortalMyAuditLogs'
import PortalMyRoles from './portal/PortalMyRoles'
import PortalTenantSettings from './portal/PortalTenantSettings'
import PortalWorkspaceSecurityAlerts from './portal/PortalWorkspaceSecurityAlerts'
import PortalTenantSecurityAlerts from './portal/PortalTenantSecurityAlerts'
import PortalMySecurityAlerts from './portal/PortalMySecurityAlerts'

export default function AppHomePage()
{
    const API = getApiBase()
    const location = useLocation()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [mobileOpen, setMobileOpen] = useState(false)
    const [user, setUser] = useState<MeResponse | null>(null)
    const [portalState, setPortalState] = useState<PortalResponse | null>(null)
    const [members, setMembers] = useState<OrganizationMember[]>([])
    const [pendingInvites, setPendingInvites] = useState<OrganizationInvite[]>([])
    const [workspaceAuditLogs, setWorkspaceAuditLogs] = useState<OrganizationActivityItem[]>([])
    const [workspaceApps, setWorkspaceApps] = useState<OrgClient[]>([])
    const [apiKeys, setApiKeys] = useState<TenantApiKey[]>([])
    const [membersLoaded, setMembersLoaded] = useState(false)
    const [invitesLoaded, setInvitesLoaded] = useState(false)
    const [activityLoaded, setActivityLoaded] = useState(false)
    const [activityRefreshKey, setActivityRefreshKey] = useState(0)
    const [clientsLoaded, setClientsLoaded] = useState(false)
    const [apiKeysLoaded, setApiKeysLoaded] = useState(false)
    const [membersLoading, setMembersLoading] = useState(false)
    const [invitesLoading, setInvitesLoading] = useState(false)
    const [activityLoading, setActivityLoading] = useState(false)
    const [clientsLoading, setClientsLoading] = useState(false)
    const [apiKeysLoading, setApiKeysLoading] = useState(false)
    const [newKeyLabel, setNewKeyLabel] = useState('')
    const [newKeyExpiry, setNewKeyExpiry] = useState('')
    const [newKeyPermissionPreset, setNewKeyPermissionPreset] = useState<'workspace_owner' | 'workspace_admin'>('workspace_admin')
    const [creatingKey, setCreatingKey] = useState(false)
    const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null)
    const [newKeyRaw, setNewKeyRaw] = useState<string | null>(null)
    const [keyMessage, setKeyMessage] = useState('')
    const [copiedKey, setCopiedKey] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [actionError, setActionError] = useState('')
    const [accessDeniedMessage, setAccessDeniedMessage] = useState('')

    const [blocked, setBlocked] = useState<'rate_limited' | 'session_expired' | null>(null)
    const [retryIn, setRetryIn] = useState(30)
    const [loggingOut, setLoggingOut] = useState(false)
    const [savingBranding, setSavingBranding] = useState(false)
    const [savingPolicy, setSavingPolicy] = useState(false)
    const [savingIpPolicy, setSavingIpPolicy] = useState(false)
    const [loadingIpPolicy, setLoadingIpPolicy] = useState(false)
    const [inviteEmail, setInviteEmail] = useState('')
    const [inviteLoading, setInviteLoading] = useState(false)
    const [inviteActionEmail, setInviteActionEmail] = useState<string | null>(null)
    const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null)
    const [inviteMessage, setInviteMessage] = useState('')
    const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({})
    const [roleSavingMemberId, setRoleSavingMemberId] = useState<string | null>(null)
    const [createWorkspaceName, setCreateWorkspaceName] = useState('')
    const [createWorkspaceSlug, setCreateWorkspaceSlug] = useState('')
    const [creatingWorkspace, setCreatingWorkspace] = useState(false)
    const [createWorkspaceMessage, setCreateWorkspaceMessage] = useState('')
    const [saveMessage, setSaveMessage] = useState('')
    const [workspaceIpPolicy, setWorkspaceIpPolicy] = useState<OrgIpPolicyResponse | null>(null)
    const pathParts = location.pathname.split('/').filter(Boolean)
    const isWorkspacePath = pathParts[0] === 'workspace'
    const isTenantPath = pathParts[0] === 'tenant'
    const isMyPath = pathParts[0] === 'my'
    const isLegacyAppPath = pathParts[0] === 'app'
    const legacyContext = !isWorkspacePath && !isTenantPath && !isMyPath ? pathParts[0] || '' : ''
    const legacySection = !isWorkspacePath && !isTenantPath && !isMyPath ? pathParts[1] || '' : ''
    const requestedOrgSlug = isWorkspacePath
        ? (pathParts[1] || '')
        : (isLegacyAppPath
            ? (searchParams.get('org') || searchParams.get('workspace') || '')
            : (legacyContext && !['tenant', 'me', 'my', 'app', 'overview', 'members', 'apps', 'register', 'branding', 'access', 'audit-logs', 'session-policy', 'danger-zone', 'login-widget', 'api-keys', 'workspaces', 'profile', 'account', 'security', 'sessions', 'roles'].includes(legacyContext) ? legacyContext : ''))
    const requestedAppName = searchParams.get('app') || 'Your App'
    const selectedMemberId = searchParams.get('member')
    const selectedWorkspaceAppId = isWorkspacePath && pathParts[2] === 'apps' && pathParts[3] && pathParts[3] !== 'register'
        ? pathParts[3]
        : ''

    function resolveSectionFromPath(): PortalSection {
        if (isMyPath) {
            return MY_SECTION_FROM_PATH[pathParts[1] || ''] || 'profile'
        }
        if (isTenantPath) {
            return TENANT_SECTION_FROM_PATH[pathParts[1] || ''] || 'workspaces'
        }
        if (isWorkspacePath) {
            if (pathParts[2] === 'apps' && pathParts[3] === 'register') {
                return 'workspace-register-app'
            }
            return WORKSPACE_SECTION_FROM_PATH[pathParts[2] || ''] || 'overview'
        }
        if (!legacyContext || legacyContext === 'app') return 'overview'
        if (legacyContext === 'me' || legacyContext === 'my') {
            return MY_SECTION_FROM_PATH[legacySection] || 'profile'
        }
        if (legacyContext === 'tenant') {
            return TENANT_SECTION_FROM_PATH[legacySection] || 'workspaces'
        }
        return WORKSPACE_SECTION_FROM_PATH[legacySection] || 'overview'
    }

    const [activeSection, setActiveSection] = useState<PortalSection>(resolveSectionFromPath)
    // Clients
    const [appMessage, setAppMessage] = useState('')
    const [newAppName, setNewAppName] = useState('')
    const [newAppType, setNewAppType] = useState('spa')
    const [newAppRedirects, setNewAppRedirects] = useState('')
    const [newAppAllowedEmbedOrigins, setNewAppAllowedEmbedOrigins] = useState('')
    const [newAppConfirmMultiOrigin, setNewAppConfirmMultiOrigin] = useState(false)
    const [creatingApp, setCreatingApp] = useState(false)
    const [newAppSecret, setNewAppSecret] = useState<string | null>(null)
    const [rotatedAppSecret, setRotatedAppSecret] = useState<{ clientId: string; clientSecret: string } | null>(null)
    const [deletingAppId, setDeletingAppId] = useState<string | null>(null)
    const [rotatingAppId, setRotatingAppId] = useState<string | null>(null)
    const [statusUpdatingAppId, setStatusUpdatingAppId] = useState<string | null>(null)
    const [savingAppId, setSavingAppId] = useState<string | null>(null)
    const [brandingForm, setBrandingForm] = useState<BrandingForm>({
        name: '',
        login_display_name: '',
        login_title: '',
        login_subtitle: '',
        icon_url: '',
        login_logo_url: '',
        brand_color: DEFAULT_BRAND,
        show_login_logo: true,
        show_login_title: false,
        show_login_subtitle: false,
        show_powered_by: false,
        widget_radius: 'rounded',
        widget_shadow: 'soft',
        icon_container: 'square',
        login_logo_container: 'square',
        login_logo_size: 'medium',
        card_radius: 'rounded',
        button_style: 'filled',
        card_bg_style: 'auto',
        card_bg_color2: '',
        card_border_width: '1px',
        card_border_color: '',
        login_method_order: [...DEFAULT_LOGIN_METHOD_ORDER],
    })
    const [authPolicyForm, setAuthPolicyForm] = useState<AuthPolicyForm>({
        allow_magic_link: true,
        allow_google: true,
        allow_microsoft: true,
        allow_passkey: true,
        require_mfa: false,
        require_mfa_for_admins: false,
        tenant_portal_require_mfa: false,
        allowed_email_domains: '',
        max_session_age_hours: '',
        max_concurrent_sessions: '',
        magic_link_rate_limit_admin_override: '',
        magic_link_rate_window_admin_override: '',
        magic_link_rate_limit_staff_override: '',
        magic_link_rate_window_staff_override: '',
    })
    const [ipPolicyForm, setIpPolicyForm] = useState<TenantIpPolicy>({
        use_custom_ip_policy: false,
        allowlist: '',
        blocklist: '',
    })
    const [authPolicyDirty, setAuthPolicyDirty] = useState(false)
    const [ipPolicyDirty, setIpPolicyDirty] = useState(false)
    const currentOrg = portalState?.current_org ?? null
    const displayName = user?.display_name || user?.email || 'Tenant Admin'
    const canManageBranding = Boolean(portalState?.permissions?.includes('branding:manage'))
    const canViewMembers = Boolean(portalState?.permissions?.includes('members:read'))
    const canInviteMembers = Boolean(portalState?.permissions?.includes('members:invite'))
    const canManageRoles = Boolean(portalState?.permissions?.includes('roles:manage'))
    const canTransferOwnership = Boolean(portalState?.permissions?.includes('org:transfer_ownership'))
    const canViewActivity = Boolean(portalState?.permissions?.includes('activity:read'))
    const canManageAuthPolicy = Boolean(portalState?.permissions?.includes('auth_policy:manage'))
    const canManageWorkspaceResources = Boolean(portalState?.permissions?.includes('org:update'))
    const currentUserRoleCodes = portalState?.current_user_role_codes ?? []
    const isWorkspaceOwner = currentUserRoleCodes.includes('owner')
    const canManageTenantAccess = canManageAuthPolicy && isWorkspaceOwner
    const availableRoles: OrganizationRole[] = portalState?.available_roles || []
    const activeBrandColor = currentOrg?.brand_color || DEFAULT_BRAND
    const workspaceCount = portalState?.organizations.length || 0
    const hasWorkspaces = workspaceCount > 0
    const canCreateWorkspace = !hasWorkspaces || isWorkspaceOwner
    const maxWorkspacesAllowed = portalState?.max_workspaces_allowed ?? null
    const maxAppsPerWorkspace = portalState?.max_apps_per_workspace ?? null
    const maxRedirectUrisPerApp = portalState?.max_redirect_uris_per_app ?? null
    const maxAllowedEmbedOriginsPerApp = portalState?.max_allowed_embed_origins_per_app ?? null
    const workspaceLimitReached =
        typeof maxWorkspacesAllowed === 'number' && workspaceCount >= maxWorkspacesAllowed
    const currentPortalTitle = currentOrg?.login_display_name || currentOrg?.name || 'Rooiam App'
    const currentLoginRedirect = useMemo(
        () => buildTenantLoginPath(currentOrg?.slug || requestedOrgSlug, requestedAppName),
        [currentOrg?.slug, requestedAppName, requestedOrgSlug],
    )
const panelClass = 'glass-card rounded-3xl shadow-xl'
    const selectedWorkspaceApp = useMemo(
        () => selectedWorkspaceAppId
            ? workspaceApps.find(entry => entry.client.id === selectedWorkspaceAppId) || null
            : null,
        [selectedWorkspaceAppId, workspaceApps],
    )
    const widgetWorkspaceApp = useMemo(() => {
        if (selectedWorkspaceApp) return selectedWorkspaceApp
        const normalizedRequestedName = requestedAppName.trim().toLowerCase()
        const byName = normalizedRequestedName
            ? workspaceApps.find(entry => entry.client.app_name.trim().toLowerCase() === normalizedRequestedName) || null
            : null
        if (byName) return byName
        return workspaceApps.length === 1 ? workspaceApps[0] : null
    }, [requestedAppName, selectedWorkspaceApp, workspaceApps])

    useEffect(() => {
        setNewKeyPermissionPreset(isWorkspaceOwner ? 'workspace_owner' : 'workspace_admin')
    }, [isWorkspaceOwner])
    const updateCurrentWorkspaceInPortalState = (nextOrg: PortalResponse['current_org']) =>
    {
        setPortalState(current =>
        {
            if (!current || !nextOrg) {
                return current
            }

            return {
                ...current,
                current_org: nextOrg,
                organizations: current.organizations.map(org =>
                    org.id === nextOrg.id ? { ...org, ...nextOrg } : org,
                ),
            }
        })
    }
    const navItems = hasWorkspaces
        ? [
            { id: 'overview' as PortalSection, label: 'Overview', icon: LayoutDashboard, group: 'Workspace' },
            { id: 'members' as PortalSection, label: 'Members', icon: Users, group: 'Workspace' },
            { id: 'workspace-apps' as PortalSection, label: APP_LABEL_PLURAL, icon: AppWindow, group: 'Workspace' },
            { id: 'workspace-security-alerts' as PortalSection, label: 'Security Alerts', icon: ShieldAlert, group: 'Workspace' },
            { id: 'workspace-audit-logs' as PortalSection, label: 'Audit Logs', icon: Database, group: 'Workspace' },
            { id: 'workspace-access' as PortalSection, label: 'Access', icon: ShieldCheck, group: 'Workspace Settings' },
            { id: 'workspace-session-policy' as PortalSection, label: 'Session Policy', icon: Clock3, group: 'Workspace Settings' },
            { id: 'branding' as PortalSection, label: 'Branding', icon: Palette, group: 'Workspace Settings' },
            { id: 'workspace-login-widget' as PortalSection, label: 'Login Widget', icon: Eye, group: 'Workspace Settings' },
            { id: 'api-keys' as PortalSection, label: 'API Keys', icon: Key, group: 'Workspace Settings' },
            ...(isWorkspaceOwner
                ? [{ id: 'workspace-danger-zone' as PortalSection, label: 'Danger Zone', icon: AlertTriangle, group: 'Workspace Settings' }]
                : []),
            { id: 'workspaces' as PortalSection, label: WORKSPACE_LABEL_PLURAL, icon: Building2, group: TENANT_LABEL },
            ...(isWorkspaceOwner
                ? [{ id: 'tenant-access' as PortalSection, label: 'Access', icon: ShieldCheck, group: TENANT_LABEL }]
                : []),
            { id: 'tenant-security-alerts' as PortalSection, label: 'Security Alerts', icon: ShieldAlert, group: TENANT_LABEL },
            { id: 'tenant-audit-logs' as PortalSection, label: 'Audit Logs', icon: Database, group: TENANT_LABEL },
            ...(isWorkspaceOwner
                ? [{ id: 'tenant-settings' as PortalSection, label: 'Settings', icon: Settings2, group: TENANT_LABEL }]
                : []),
            { id: 'profile' as PortalSection, label: 'Profile', icon: UserCircle, group: 'My' },
            { id: 'my-account' as PortalSection, label: 'Account', icon: Link2, group: 'My' },
            { id: 'my-security' as PortalSection, label: 'Security', icon: KeyRound, group: 'My' },
            { id: 'my-sessions' as PortalSection, label: 'Sessions', icon: Monitor, group: 'My' },
            { id: 'my-security-alerts' as PortalSection, label: 'Security Alerts', icon: ShieldAlert, group: 'My' },
            { id: 'my-audit-logs' as PortalSection, label: 'Audit Logs', icon: Database, group: 'My' },
            { id: 'my-roles' as PortalSection, label: 'Roles & Permissions', icon: ShieldCheck, group: 'My' },
        ]
        : [
            { id: 'overview' as PortalSection, label: 'Get Started', icon: LayoutDashboard, group: 'Workspace' },
            ...(isWorkspaceOwner
                ? [{ id: 'tenant-access' as PortalSection, label: 'Access', icon: ShieldCheck, group: TENANT_LABEL }]
                : []),
            { id: 'profile' as PortalSection, label: 'Profile', icon: UserCircle, group: 'My' },
            { id: 'my-account' as PortalSection, label: 'Account', icon: Link2, group: 'My' },
            { id: 'my-security' as PortalSection, label: 'Security', icon: KeyRound, group: 'My' },
            { id: 'my-sessions' as PortalSection, label: 'Sessions', icon: Monitor, group: 'My' },
            { id: 'my-security-alerts' as PortalSection, label: 'Security Alerts', icon: ShieldAlert, group: 'My' },
            { id: 'my-audit-logs' as PortalSection, label: 'Audit Logs', icon: Database, group: 'My' },
            { id: 'my-roles' as PortalSection, label: 'Roles & Permissions', icon: ShieldCheck, group: 'My' },
        ]
    useEffect(() =>
    {
        setActiveSection(resolveSectionFromPath())
    }, [location.pathname])

    useEffect(() => {
        setMobileOpen(false)
    }, [activeSection, requestedOrgSlug, requestedAppName, currentOrg?.id])

    useEffect(() => {
        if (loading) return
        if (!hasWorkspaces && activeSection !== 'overview' && activeSection !== 'profile' && activeSection !== 'my-account' && activeSection !== 'my-security' && activeSection !== 'my-sessions' && activeSection !== 'my-audit-logs' && activeSection !== 'my-security-alerts' && activeSection !== 'my-roles' && activeSection !== 'tenant-settings') {
            setActiveSection('overview')
        }
    }, [activeSection, hasWorkspaces, loading])

    useEffect(() => {
        if (loading || !portalState) return
        if (!portalState.current_org && portalState.organizations.length > 0 && activeSection !== 'workspaces' && activeSection !== 'tenant-settings') {
            setActiveSection('workspaces')
            navigate(portalRoutes.tenantWorkspaces())
        }
    }, [activeSection, loading, portalState, requestedOrgSlug])


    useEffect(() =>
    {
        let cancelled = false

        const load = async () =>
        {
            try
            {
                setAccessDeniedMessage('')
                const [meRes, portalRes] = await Promise.all([
                    apiFetch(`${API}/identity/me`),
                    apiFetch(`${API}/orgs/current/portal`),
                ])

                if (meRes.status === 429 || portalRes.status === 429) {
                    if (!cancelled) { setBlocked('rate_limited'); setLoading(false) }
                    return
                }

                if (meRes.status === 401 || portalRes.status === 401) {
                    if (!cancelled) { setBlocked('session_expired'); setLoading(false) }
                    return
                }

                const meData = await meRes.json().catch(() => ({}))
                let portalData = await portalRes.json().catch(() => ({}))

                if (!meRes.ok) {
                    throw new Error(meData?.error?.message || 'Could not load the signed-in user.')
                }
                if (portalRes.status === 403) {
                    setAccessDeniedMessage(
                        portalData?.error?.message || 'This workspace operator area is only for workspace owners and workspace admins.',
                    )
                    setError('')
                    setLoading(false)
                    return
                }
                if (!portalRes.ok) {
                    throw new Error(portalData?.error?.message || 'Could not load the workspace owner and admin area.')
                }

                // Auto-select first workspace if none is active
                if (!portalData.current_org && Array.isArray(portalData.organizations) && portalData.organizations.length > 0 && !requestedOrgSlug) {
                    const firstOrg = portalData.organizations[0]
                    const autoSwitchRes = await apiFetch(`${API}/orgs/switch`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ organization_id: firstOrg.id }),
                    })
                    if (autoSwitchRes.ok) {
                        const refreshedPortalRes = await apiFetch(`${API}/orgs/current/portal`)
                        if (refreshedPortalRes.ok) {
                            portalData = await refreshedPortalRes.json().catch(() => portalData)
                        }
                    }
                }

                const hasOrgs = Array.isArray(portalData.organizations) && portalData.organizations.length > 0

                if (requestedOrgSlug && hasOrgs) {
                    const requestedOrg = portalData.organizations.find((org: { id: string; slug: string }) => org.slug === requestedOrgSlug)

                    if (!requestedOrg) {
                        throw new Error(`You do not have access to workspace '${requestedOrgSlug}'.`)
                    }

                    if (requestedOrg && portalData.current_org?.id !== requestedOrg.id) {
                        const switchRes = await apiFetch(`${API}/orgs/switch`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ organization_id: requestedOrg.id }),
                        })
                        const switchData = await switchRes.json().catch(() => ({}))
                        if (!switchRes.ok) {
                            throw new Error(switchData?.error?.message || 'Could not switch to the requested workspace.')
                        }

                        const refreshedPortalRes = await apiFetch(`${API}/orgs/current/portal`)
                        const refreshedPortalData = await refreshedPortalRes.json().catch(() => ({}))
                        if (!refreshedPortalRes.ok) {
                            throw new Error(refreshedPortalData?.error?.message || 'Could not refresh the tenant portal.')
                        }

                        portalData = refreshedPortalData
                    }
                }

                if (!cancelled) {
                    setUser(meData)
                    setPortalState(portalData)
                    setMembers([])
                    setPendingInvites([])
                    setWorkspaceAuditLogs([])
                    setWorkspaceApps([])
                    setApiKeys([])
                    setMembersLoaded(false)
                    setInvitesLoaded(false)
                    setActivityLoaded(false)
                    setClientsLoaded(false)
                    setApiKeysLoaded(false)
                    setMembersLoading(false)
                    setInvitesLoading(false)
                    setActivityLoading(false)
                    setClientsLoading(false)
                    setApiKeysLoading(false)
                    setRoleDrafts({})
                    setWorkspaceIpPolicy(null)
                    setAccessDeniedMessage('')
                    if (portalData.current_org) {
                        setBrandingForm({
                            name: portalData.current_org.name || '',
                            login_display_name: '',
                            login_title: portalData.current_org.login_title || '',
                            login_subtitle: portalData.current_org.login_subtitle || '',
                            icon_url: portalData.current_org.icon_url || '',
                            login_logo_url: portalData.current_org.login_logo_url || '',
                            brand_color: portalData.current_org.brand_color || DEFAULT_BRAND,
                            show_login_logo: portalData.current_org.show_login_logo,
                            show_login_title: portalData.current_org.show_login_title,
                            show_login_subtitle: portalData.current_org.show_login_subtitle,
                            show_powered_by: portalData.current_org.show_powered_by,
                            widget_radius: portalData.current_org.widget_radius || 'rounded',
                            widget_shadow: portalData.current_org.widget_shadow || 'soft',
                            icon_container: normalizeWorkspaceIconContainer(portalData.current_org.icon_container),
                            login_logo_container: portalData.current_org.login_logo_container || 'square',
                            login_logo_size: portalData.current_org.login_logo_size || 'medium',
                            card_radius: portalData.current_org.card_radius || 'rounded',
                            button_style: portalData.current_org.button_style || 'filled',
                            card_bg_style: portalData.current_org.card_bg_style || 'auto',
                            card_bg_color2: portalData.current_org.card_bg_color2 || '',
                            card_border_width: portalData.current_org.card_border_width || '1px',
                            card_border_color: portalData.current_org.card_border_color || '',
                            login_method_order: normalizeLoginMethodOrder(portalData.current_org.login_method_order),
                        })
                        const loadedAuthPolicy: AuthPolicyForm = {
                            allow_magic_link: Boolean(portalData.current_org.allow_magic_link),
                            allow_google: Boolean(portalData.current_org.allow_google),
                            allow_microsoft: Boolean(portalData.current_org.allow_microsoft),
                            allow_passkey: Boolean(portalData.current_org.allow_passkey),
                            require_mfa: Boolean(portalData.current_org.require_mfa),
                            require_mfa_for_admins: Boolean(portalData.current_org.require_mfa_for_admins),
                            tenant_portal_require_mfa: Boolean(portalData.current_org.tenant_portal_require_mfa),
                            allowed_email_domains: portalData.current_org.allowed_email_domains ?? '',
                            max_session_age_hours: portalData.current_org.max_session_age_hours != null
                                ? String(portalData.current_org.max_session_age_hours)
                                : '',
                            max_concurrent_sessions: portalData.current_org.max_concurrent_sessions != null
                                ? String(portalData.current_org.max_concurrent_sessions)
                                : '',
                            magic_link_rate_limit_admin_override: portalData.current_org.magic_link_rate_limit_admin_override != null
                                ? String(portalData.current_org.magic_link_rate_limit_admin_override)
                                : '',
                            magic_link_rate_window_admin_override: portalData.current_org.magic_link_rate_window_admin_override != null
                                ? String(portalData.current_org.magic_link_rate_window_admin_override)
                                : '',
                            magic_link_rate_limit_staff_override: portalData.current_org.magic_link_rate_limit_staff_override != null
                                ? String(portalData.current_org.magic_link_rate_limit_staff_override)
                                : '',
                            magic_link_rate_window_staff_override: portalData.current_org.magic_link_rate_window_staff_override != null
                                ? String(portalData.current_org.magic_link_rate_window_staff_override)
                                : '',
                        }
                        setAuthPolicyForm(loadedAuthPolicy)
                        setIpPolicyForm({
                            use_custom_ip_policy: false,
                            allowlist: '',
                            blocklist: '',
                        })
                    }
                    setError('')
                    setLoading(false)
                }

                if (!portalData.current_org) {
                    return
                }
            } catch (err) {
                if (!cancelled) {
                    setAccessDeniedMessage('')
                    setError(err instanceof Error ? err.message : 'Could not load the workspace owner and admin area.')
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        void load()
        return () => {
            cancelled = true
        }
    }, [API, requestedOrgSlug]) // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (blocked !== 'rate_limited') return
        if (retryIn <= 0) { window.location.reload(); return }
        const t = setTimeout(() => setRetryIn(s => s - 1), 1000)
        return () => clearTimeout(t)
    }, [blocked, retryIn])

    useEffect(() => {
        if (!portalState?.current_org || activeSection !== 'workspace-access') return
        let cancelled = false
        setLoadingIpPolicy(true)
        void apiFetch(`${API}/orgs/current/ip-policy`)
            .then(async ipPolicyRes => {
                if (ipPolicyRes.status === 401) {
                    setBlocked('session_expired')
                    return
                }
                const ipPolicyData = await ipPolicyRes.json().catch(() => ({}))
                if (!ipPolicyRes.ok) {
                    throw new Error(ipPolicyData?.error?.message || 'Could not load workspace IP policy.')
                }
                if (cancelled) return
                setWorkspaceIpPolicy(ipPolicyData)
                const loadedIpPolicy: TenantIpPolicy = {
                    use_custom_ip_policy: Boolean(ipPolicyData?.tenant?.use_custom_ip_policy),
                    allowlist: typeof ipPolicyData?.tenant?.allowlist === 'string' ? ipPolicyData.tenant.allowlist : '',
                    blocklist: typeof ipPolicyData?.tenant?.blocklist === 'string' ? ipPolicyData.tenant.blocklist : '',
                }
                setIpPolicyForm(loadedIpPolicy)
            })
            .catch(err => {
                if (!cancelled) {
                    setActionError(err instanceof Error ? err.message : 'Could not load workspace IP policy.')
                }
            })
            .finally(() => {
                if (!cancelled) setLoadingIpPolicy(false)
            })
        return () => { cancelled = true }
    }, [API, activeSection, currentLoginRedirect, portalState?.current_org])

    useEffect(() => {
        if (!portalState?.current_org || membersLoaded || !['overview', 'members', 'workspace-danger-zone'].includes(activeSection)) return
        if (!(canViewMembers || (activeSection === 'workspace-danger-zone' && canTransferOwnership))) return
        let cancelled = false
        const controller = new AbortController()
        const timeoutId = window.setTimeout(() => controller.abort(), 10000)
        setMembersLoading(true)
        void apiFetch(`${API}/orgs/current/members`, { signal: controller.signal })
            .then(async membersRes => {
                if (membersRes.status === 401) {
                    setBlocked('session_expired')
                    return
                }
                const membersJson = await membersRes.json().catch(() => ({}))
                if (!membersRes.ok) {
                    if (!cancelled) {
                        setMembers([])
                        setMembersLoaded(true)
                        setActionError(
                            typeof membersJson === 'object' && membersJson !== null
                                ? (membersJson as { error?: { message?: string } }).error?.message || 'Could not load workspace members.'
                                : 'Could not load workspace members.',
                        )
                    }
                    return
                }
                const memberData = Array.isArray(membersJson) ? membersJson as OrganizationMember[] : []
                if (!cancelled) {
                    setMembers(memberData)
                    setRoleDrafts(
                        memberData.reduce<Record<string, string>>((acc, member) => {
                            acc[member.id] = member.role_codes?.find(code => code !== 'owner') || 'member'
                            return acc
                        }, {}),
                    )
                    setMembersLoaded(true)
                }
            })
            .catch(err => {
                if (!cancelled) {
                    setMembers([])
                    setMembersLoaded(true)
                    setActionError(
                        err instanceof DOMException && err.name === 'AbortError'
                            ? 'Loading members timed out.'
                            : err instanceof Error
                                ? err.message
                                : 'Could not load workspace members.',
                    )
                }
            })
            .finally(() => {
                window.clearTimeout(timeoutId)
                if (!cancelled) setMembersLoading(false)
            })
        return () => {
            cancelled = true
            window.clearTimeout(timeoutId)
            controller.abort()
        }
    }, [API, activeSection, canTransferOwnership, canViewMembers, currentLoginRedirect, membersLoaded, portalState?.current_org])

    useEffect(() => {
        if (!portalState?.current_org || !canInviteMembers || invitesLoaded || activeSection !== 'members') return
        let cancelled = false
        const controller = new AbortController()
        const timeoutId = window.setTimeout(() => controller.abort(), 10000)
        setInvitesLoading(true)
        void apiFetch(`${API}/orgs/current/invites`, { signal: controller.signal })
            .then(async invitesRes => {
                if (invitesRes.status === 401) {
                    setBlocked('session_expired')
                    return
                }
                const invitesJson = await invitesRes.json().catch(() => ({}))
                if (!invitesRes.ok) {
                    if (!cancelled) {
                        setPendingInvites([])
                        setInvitesLoaded(true)
                        setActionError(
                            typeof invitesJson === 'object' && invitesJson !== null
                                ? (invitesJson as { error?: { message?: string } }).error?.message || 'Could not load pending invitations.'
                                : 'Could not load pending invitations.',
                        )
                    }
                    return
                }
                if (!cancelled) {
                    setPendingInvites(Array.isArray(invitesJson) ? invitesJson as OrganizationInvite[] : [])
                    setInvitesLoaded(true)
                }
            })
            .catch(err => {
                if (!cancelled) {
                    setPendingInvites([])
                    setInvitesLoaded(true)
                    setActionError(
                        err instanceof DOMException && err.name === 'AbortError'
                            ? 'Loading pending invitations timed out.'
                            : err instanceof Error
                                ? err.message
                                : 'Could not load pending invitations.',
                    )
                }
            })
            .finally(() => {
                window.clearTimeout(timeoutId)
                if (!cancelled) setInvitesLoading(false)
            })
        return () => {
            cancelled = true
            window.clearTimeout(timeoutId)
            controller.abort()
        }
    }, [API, activeSection, canInviteMembers, currentLoginRedirect, invitesLoaded, portalState?.current_org])

    useEffect(() => {
        const needsWorkspaceActivity = ['overview', 'workspace-audit-logs', 'workspace-security-alerts', 'tenant-access', 'workspace-access', 'workspace-session-policy', 'api-keys', 'workspace-danger-zone'].includes(activeSection)
            || (activeSection === 'workspace-apps' && Boolean(selectedWorkspaceAppId))
        if (!portalState?.current_org || !canViewActivity || activityLoaded || !needsWorkspaceActivity) return
        let cancelled = false
        const controller = new AbortController()
        const timeoutId = window.setTimeout(() => controller.abort(), 10000)
        setActivityLoading(true)
        void apiFetch(`${API}/orgs/workspace/activity`, { signal: controller.signal })
            .then(async activityRes => {
                if (activityRes.status === 401) {
                    setBlocked('session_expired')
                    return
                }
                const activityJson = await activityRes.json().catch(() => ({}))
                if (!activityRes.ok) {
                    if (!cancelled) {
                        setWorkspaceAuditLogs([])
                        setActivityLoaded(true)
                        setActionError(
                            typeof activityJson === 'object' && activityJson !== null
                                ? (activityJson as { error?: { message?: string } }).error?.message || 'Could not load activity.'
                                : 'Could not load activity.',
                        )
                    }
                    return
                }
                if (!cancelled) {
                    const items = Array.isArray(activityJson)
                        ? activityJson
                        : Array.isArray(activityJson?.items)
                            ? activityJson.items
                            : []
                    setWorkspaceAuditLogs(items)
                    setActivityLoaded(true)
                }
            })
            .catch(err => {
                if (!cancelled) {
                    setWorkspaceAuditLogs([])
                    setActivityLoaded(true)
                    setActionError(
                        err instanceof DOMException && err.name === 'AbortError'
                            ? 'Loading activity timed out.'
                            : err instanceof Error
                                ? err.message
                                : 'Could not load activity.',
                    )
                }
            })
            .finally(() => {
                window.clearTimeout(timeoutId)
                if (!cancelled) setActivityLoading(false)
            })
        return () => {
            cancelled = true
            window.clearTimeout(timeoutId)
            controller.abort()
        }
    }, [API, activeSection, activityLoaded, activityRefreshKey, canViewActivity, currentLoginRedirect, portalState?.current_org, selectedWorkspaceAppId])

    const latestMatchingWorkspaceActivity = (actions: string[]) =>
        workspaceAuditLogs.find(item => actions.includes(item.action)) || null

    const latestPolicyChange = latestMatchingWorkspaceActivity([
        'workspace.auth_policy.updated',
        'workspace.auth_policy.snapshot_restored',
    ])
    const latestApiKeyChange = latestMatchingWorkspaceActivity([
        'api_key.created',
        'api_key.revoked',
    ])
    const latestDangerZoneChange = latestMatchingWorkspaceActivity([
        'workspace.owner_transfer.initiated',
        'workspace.owner_transfer.accepted',
        'workspace.status.updated',
    ])

    useEffect(() => {
        if (
            !portalState?.current_org
            || !portalState.permissions?.includes('org:update')
            || clientsLoaded
            || !['workspace-apps', 'login-widget'].includes(activeSection)
        ) return
        let cancelled = false
        const controller = new AbortController()
        const timeoutId = window.setTimeout(() => controller.abort(), 10000)
        setClientsLoading(true)
        void apiFetch(`${API}/orgs/current/clients`, { signal: controller.signal })
            .then(async clientsRes => {
                if (clientsRes.status === 401) {
                    setBlocked('session_expired')
                    return
                }
                const clientsJson = await clientsRes.json().catch(() => ({}))
                if (!clientsRes.ok) {
                    if (!cancelled) {
                        setWorkspaceApps([])
                        setClientsLoaded(true)
                        setAppMessage(
                            typeof clientsJson === 'object' && clientsJson !== null
                                ? (clientsJson as { error?: { message?: string } }).error?.message || 'Could not load workspace apps.'
                                : 'Could not load workspace apps.',
                        )
                    }
                    return
                }
                if (!cancelled) {
                    setWorkspaceApps(Array.isArray(clientsJson) ? clientsJson : [])
                    setClientsLoaded(true)
                    setAppMessage('')
                }
            })
            .catch(err => {
                if (!cancelled) {
                    setWorkspaceApps([])
                    setClientsLoaded(true)
                        setAppMessage(
                            err instanceof DOMException && err.name === 'AbortError'
                            ? 'Loading workspace apps timed out.'
                            : err instanceof Error
                                ? err.message
                                : 'Could not load workspace apps.',
                    )
                }
            })
            .finally(() => {
                window.clearTimeout(timeoutId)
                if (!cancelled) setClientsLoading(false)
            })
        return () => {
            cancelled = true
            window.clearTimeout(timeoutId)
            controller.abort()
        }
    }, [API, activeSection, clientsLoaded, currentLoginRedirect, portalState])

    useEffect(() => {
        if (!portalState?.current_org || !portalState.permissions?.includes('org:update') || apiKeysLoaded || activeSection !== 'api-keys') return
        let cancelled = false
        const controller = new AbortController()
        const timeoutId = window.setTimeout(() => controller.abort(), 10000)
        setApiKeysLoading(true)
        setKeyMessage('')
        void apiFetch(`${API}/orgs/current/api-keys`, { signal: controller.signal })
            .then(async apiKeysRes => {
                if (apiKeysRes.status === 401) {
                    setBlocked('session_expired')
                    return
                }
                const apiKeysJson = await apiKeysRes.json().catch(() => ({}))
                if (!apiKeysRes.ok) {
                    if (!cancelled) {
                        setApiKeys([])
                        setApiKeysLoaded(true)
                        setKeyMessage(
                            typeof apiKeysJson === 'object' && apiKeysJson !== null
                                ? (apiKeysJson as { error?: { message?: string } }).error?.message || 'Could not load API keys.'
                                : 'Could not load API keys.',
                        )
                    }
                    return
                }
                if (!cancelled) {
                    setApiKeys(Array.isArray(apiKeysJson) ? apiKeysJson : [])
                    setApiKeysLoaded(true)
                    setKeyMessage('')
                }
            })
            .catch(err => {
                if (!cancelled) {
                    setApiKeys([])
                    setApiKeysLoaded(true)
                    setKeyMessage(
                        err instanceof DOMException && err.name === 'AbortError'
                            ? 'Loading API keys timed out.'
                            : err instanceof Error
                                ? err.message
                                : 'Could not load API keys.',
                    )
                }
            })
            .finally(() => {
                window.clearTimeout(timeoutId)
                if (!cancelled) setApiKeysLoading(false)
            })
        return () => {
            cancelled = true
            window.clearTimeout(timeoutId)
            controller.abort()
        }
    }, [API, activeSection, apiKeysLoaded, currentLoginRedirect, portalState])

    const navigateToSection = (section: PortalSection, orgSlug?: string, memberId?: string | null) =>
    {
        const path = portalSectionToPath(section, orgSlug || currentOrg?.slug || requestedOrgSlug)
        if (memberId) {
            navigate(`${path}?member=${encodeURIComponent(memberId)}`)
        } else {
            navigate(path)
        }
    }

    const handleLogout = async () =>
    {
        setLoggingOut(true)
        try {
            await apiFetch(`${API}/auth/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            })
        } finally {
            window.location.href = currentLoginRedirect
        }
    }

    const switchWorkspace = async (organizationId: string) =>
    {
        setLoading(true)
        setActionError('')
        setSaveMessage('')
        try {
            const res = await apiFetch(`${API}/orgs/switch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ organization_id: organizationId }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data?.error?.message || 'Could not switch workspace.')
            }

            const nextOrg = portalState?.organizations.find(org => org.id === organizationId)
            if (nextOrg?.slug) {
                navigate(portalRoutes.workspaceOverview(nextOrg.slug))
            } else {
                // Org not in local list yet — reload fully from root
                window.location.href = portalRoutes.tenantWorkspaces()
            }
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not switch workspace.')
            setLoading(false)
        }
    }

    const saveBranding = async (e: React.FormEvent) =>
    {
        e.preventDefault()
        setSavingBranding(true)
        setActionError('')
        setSaveMessage('')
        try {
            const res = await apiFetch(`${API}/orgs/current/branding`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: brandingForm.name.trim() || undefined,
                    login_title: brandingForm.login_title,
                    login_subtitle: brandingForm.login_subtitle,
                    icon_url: brandingForm.icon_url,
                    login_logo_url: brandingForm.login_logo_url,
                    brand_color: brandingForm.brand_color,
                    show_login_logo: brandingForm.show_login_logo,
                    show_login_title: brandingForm.show_login_title,
                    show_login_subtitle: brandingForm.show_login_subtitle,
                    show_powered_by: brandingForm.show_powered_by,
                    widget_radius: brandingForm.widget_radius,
                    widget_shadow: brandingForm.widget_shadow,
                    icon_container: normalizeWorkspaceIconContainer(brandingForm.icon_container),
                    login_logo_container: brandingForm.login_logo_container,
                    login_logo_size: brandingForm.login_logo_size,
                    card_radius: brandingForm.card_radius,
                    button_style: brandingForm.button_style,
                    card_bg_style: brandingForm.card_bg_style,
                    card_bg_color2: brandingForm.card_bg_color2 || null,
                    card_border_width: brandingForm.card_border_width,
                    card_border_color: brandingForm.card_border_color || null,
                    login_method_order: brandingForm.login_method_order,
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data?.error?.message || 'Could not save workspace branding.')
            }

            // Re-fetch full portal state so org name/slug changes are reflected everywhere
            const refreshRes = await apiFetch(`${API}/orgs/current/portal`)
            if (refreshRes.ok) {
                const refreshed = await refreshRes.json().catch(() => null)
                if (refreshed) setPortalState(refreshed)
            }
            setSaveMessage('Workspace branding saved.')
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not save workspace branding.')
        } finally {
            setSavingBranding(false)
        }
    }

    const saveAuthPolicy = async (e: React.FormEvent) =>
    {
        e.preventDefault()
        setSavingPolicy(true)
        setActionError('')
        setSaveMessage('')
        try {
            // Send only the fields the server's auth-policy DTO accepts
            // (deny_unknown_fields). The magic_link_rate_*_override values are
            // read-only here — they come back in GET but are NOT in the update
            // struct, so including them would make the whole PATCH 400.
            const res = await apiFetch(`${API}/orgs/current/auth-policy`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    allow_magic_link: authPolicyForm.allow_magic_link,
                    allow_google: authPolicyForm.allow_google,
                    allow_microsoft: authPolicyForm.allow_microsoft,
                    allow_passkey: authPolicyForm.allow_passkey,
                    require_mfa: authPolicyForm.require_mfa,
                    require_mfa_for_admins: authPolicyForm.require_mfa_for_admins,
                    tenant_portal_require_mfa: authPolicyForm.tenant_portal_require_mfa,
                    allowed_email_domains: authPolicyForm.allowed_email_domains,
                    max_session_age_hours: authPolicyForm.max_session_age_hours !== ''
                        ? parseInt(authPolicyForm.max_session_age_hours, 10)
                        : null,
                    max_concurrent_sessions: authPolicyForm.max_concurrent_sessions !== ''
                        ? parseInt(authPolicyForm.max_concurrent_sessions, 10)
                        : null,
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data?.error?.message || `Could not save ${WORKSPACE_LOGIN_POLICY_LABEL.toLowerCase()}.`)
            }

            updateCurrentWorkspaceInPortalState(data)
            const savedPolicy: AuthPolicyForm = {
                allow_magic_link: Boolean(data.allow_magic_link),
                allow_google: Boolean(data.allow_google),
                allow_microsoft: Boolean(data.allow_microsoft),
                allow_passkey: Boolean(data.allow_passkey),
                require_mfa: Boolean(data.require_mfa),
                require_mfa_for_admins: Boolean(data.require_mfa_for_admins),
                tenant_portal_require_mfa: Boolean(data.tenant_portal_require_mfa),
                allowed_email_domains: data.allowed_email_domains ?? '',
                max_session_age_hours: data.max_session_age_hours != null
                    ? String(data.max_session_age_hours)
                    : '',
                max_concurrent_sessions: data.max_concurrent_sessions != null
                    ? String(data.max_concurrent_sessions)
                    : '',
                magic_link_rate_limit_admin_override: data.magic_link_rate_limit_admin_override != null
                    ? String(data.magic_link_rate_limit_admin_override)
                    : '',
                magic_link_rate_window_admin_override: data.magic_link_rate_window_admin_override != null
                    ? String(data.magic_link_rate_window_admin_override)
                    : '',
                magic_link_rate_limit_staff_override: data.magic_link_rate_limit_staff_override != null
                    ? String(data.magic_link_rate_limit_staff_override)
                    : '',
                magic_link_rate_window_staff_override: data.magic_link_rate_window_staff_override != null
                    ? String(data.magic_link_rate_window_staff_override)
                    : '',
            }
            setAuthPolicyForm(savedPolicy)
            setAuthPolicyDirty(false)
        } catch (err) {
            setActionError(err instanceof Error ? err.message : `Could not save ${WORKSPACE_LOGIN_POLICY_LABEL.toLowerCase()}.`)
        } finally {
            setSavingPolicy(false)
        }
    }

    const saveIpPolicy = async (e: React.FormEvent) =>
    {
        e.preventDefault()
        setSavingIpPolicy(true)
        setActionError('')
        try {
            const res = await apiFetch(`${API}/orgs/current/ip-policy`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ipPolicyForm),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data?.error?.message || 'Could not save workspace IP policy.')
            }
            setWorkspaceIpPolicy(data)
            const savedIp: TenantIpPolicy = {
                use_custom_ip_policy: Boolean(data?.tenant?.use_custom_ip_policy),
                allowlist: typeof data?.tenant?.allowlist === 'string' ? data.tenant.allowlist : '',
                blocklist: typeof data?.tenant?.blocklist === 'string' ? data.tenant.blocklist : '',
            }
            setIpPolicyForm(savedIp)
            setIpPolicyDirty(false)
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not save workspace IP policy.')
        } finally {
            setSavingIpPolicy(false)
        }
    }

    const inviteMember = async (e: React.FormEvent) =>
    {
        e.preventDefault()
        setInviteLoading(true)
        setInviteActionEmail(inviteEmail.trim().toLowerCase())
        setActionError('')
        setInviteMessage('')
        try {
            const res = await apiFetch(`${API}/orgs/current/invites`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: inviteEmail }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data?.error?.message || 'Could not send the member invitation.')
            }

            setInviteEmail('')
            setInviteMessage('Invitation email sent. They will join as a member after acceptance.')
            setInvitesLoaded(false)
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not send the member invitation.')
        } finally {
            setInviteActionEmail(null)
            setInviteLoading(false)
        }
    }

    const resendInvite = async (email: string) => {
        setInviteLoading(true)
        setInviteActionEmail(email.toLowerCase())
        setActionError('')
        setInviteMessage('')
        try {
            const res = await apiFetch(`${API}/orgs/current/invites`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data?.error?.message || 'Could not resend the member invitation.')
            }
            setInviteMessage(`Invitation resent to ${email}.`)
            setInvitesLoaded(false)
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not resend the member invitation.')
        } finally {
            setInviteActionEmail(null)
            setInviteLoading(false)
        }
    }

    const revokeInvite = async (inviteId: string) => {
        setRevokingInviteId(inviteId)
        setActionError('')
        setInviteMessage('')
        try {
            const res = await apiFetch(`${API}/orgs/current/invites/${inviteId}`, {
                method: 'DELETE',
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data?.error?.message || 'Could not revoke the invitation.')
            }
            setPendingInvites(current => current.filter(invite => invite.id !== inviteId))
            setInviteMessage('Invitation revoked.')
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not revoke the invitation.')
        } finally {
            setRevokingInviteId(null)
        }
    }

    const updateMemberRole = async (memberId: string) =>
    {
        const roleCode = roleDrafts[memberId]
        if (!roleCode) {
            return
        }

        setRoleSavingMemberId(memberId)
        setActionError('')
        setInviteMessage('')
        try {
            const res = await apiFetch(`${API}/orgs/current/members/${memberId}/role`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role_code: roleCode }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data?.error?.message || 'Could not update the workspace member role.')
            }

            setMembers(current => current.map(member => {
                if (member.id !== memberId) {
                    return member
                }

                const selectedRole = availableRoles.find(role => role.code === roleCode)
                return {
                    ...member,
                    role_codes: [roleCode],
                    role_names: [selectedRole?.name || roleCode],
                }
            }))
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not update the workspace member role.')
        } finally {
            setRoleSavingMemberId(null)
        }
    }

    // Slugs that cannot be used for a workspace because they are top-level path
    // segments in the rooiam-app router or the Rooiam server.  A workspace named
    // "tenant" would make /tenant/overview resolve to the wrong page for all users.
    // Keep in sync with: service.rs create_tenant() and docs/internal/23_reserved_slugs.md
    const createWorkspace = async (e: React.FormEvent) =>
    {
        e.preventDefault()
        setCreatingWorkspace(true)
        setActionError('')
        setCreateWorkspaceMessage('')

        if (hasWorkspaces && !isWorkspaceOwner) {
            setActionError('Only workspace owners can create additional workspaces from this operator portal.')
            setCreatingWorkspace(false)
            return
        }

        const base = (createWorkspaceSlug.trim() || createWorkspaceName.trim()).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
        const suffix = Math.random().toString(36).slice(2, 6)
        const slug = `${base}-${suffix}`

        try {
            const res = await apiFetch(`${API}/orgs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: createWorkspaceName.trim(),
                    slug,
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                throw new Error(data?.error?.message || 'Could not create the workspace.')
            }

            setCreateWorkspaceMessage('Workspace created. Opening workspace owner and admin area...')
            setCreateWorkspaceSlug('')
            window.location.href = buildTenantPortalRedirect(data.slug, requestedAppName)
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not create the workspace.')
        } finally {
            setCreatingWorkspace(false)
        }
    }

    const createApp = async (e: React.FormEvent) => {
        e.preventDefault()
        setCreatingApp(true)
        setAppMessage('')
        setNewAppSecret(null)
        setRotatedAppSecret(null)
        setActionError('')
        try {
            const redirectUris = newAppRedirects
                .split('\n')
                .map(u => u.trim())
                .filter(u => u.length > 0)
            const allowedEmbedOrigins = newAppAllowedEmbedOrigins
                .split('\n')
                .map(u => u.trim())
                .filter(u => u.length > 0)
            const res = await apiFetch(`${API}/orgs/current/clients`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    app_name: newAppName.trim(),
                    app_type: newAppType,
                    redirect_uris: redirectUris,
                    allowed_embed_origins: allowedEmbedOrigins,
                    confirm_multi_origin: newAppConfirmMultiOrigin,
                }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error?.message || 'Could not create app.')
            setWorkspaceApps(prev => [data, ...prev])
            if (data.client_secret) setNewAppSecret(data.client_secret)
            setNewAppName('')
            setNewAppRedirects('')
            setNewAppAllowedEmbedOrigins('')
            setNewAppConfirmMultiOrigin(false)
            setNewAppType('spa')
            setAppMessage('App created.')
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not create app.')
        } finally {
            setCreatingApp(false)
        }
    }

    const deleteApp = async (id: string) => {
        if (!window.confirm('Delete this app? This cannot be undone.')) return
        setDeletingAppId(id)
        setAppMessage('')
        setActionError('')
        try {
            const res = await apiFetch(`${API}/orgs/current/clients/${id}`, {
                method: 'DELETE',
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error?.message || 'Could not delete app.')
            setWorkspaceApps(prev => prev.filter(c => c.client.id !== id))
            setAppMessage('App deleted.')
            if (selectedWorkspaceAppId === id) {
                navigate(portalRoutes.workspaceApps(currentOrg?.slug || requestedOrgSlug))
            }
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not delete app.')
        } finally {
            setDeletingAppId(null)
        }
    }

    const rotateAppSecret = async (id: string) => {
        setRotatingAppId(id)
        setAppMessage('')
        setActionError('')
        setNewAppSecret(null)
        try {
            const res = await apiFetch(`${API}/orgs/current/clients/${id}/rotate-secret`, {
                method: 'POST',
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error?.message || 'Could not rotate app secret.')
            setRotatedAppSecret({
                clientId: data.client_id,
                clientSecret: data.client_secret,
            })
            setAppMessage('App secret rotated.')
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not rotate app secret.')
        } finally {
            setRotatingAppId(null)
        }
    }

    const saveApp = async (id: string, payload: { app_name: string; redirect_uris: string[]; allowed_embed_origins: string[]; confirm_multi_origin?: boolean }) => {
        setSavingAppId(id)
        setAppMessage('')
        setActionError('')
        try {
            const res = await apiFetch(`${API}/orgs/current/clients/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error?.message || 'Could not update app.')
            setWorkspaceApps(prev => prev.map(entry => entry.client.id === id ? data : entry))
            setAppMessage('App updated.')
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not update app.')
        } finally {
            setSavingAppId(null)
        }
    }

    const toggleAppStatus = async (id: string) => {
        setStatusUpdatingAppId(id)
        setAppMessage('')
        setActionError('')
        try {
            const current = workspaceApps.find(entry => entry.client.id === id)
            const nextStatus = current?.client.status === 'active' ? 'suspended' : 'active'
            const res = await apiFetch(`${API}/orgs/current/clients/${id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: nextStatus }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data?.error?.message || 'Could not update app status.')
            setWorkspaceApps(prev => prev.map(entry => entry.client.id === id ? { ...entry, client: data } : entry))
            setAppMessage(nextStatus === 'suspended' ? 'App suspended.' : 'App resumed.')
            if (nextStatus === 'suspended') {
                setRotatedAppSecret(null)
            }
        } catch (err) {
            setActionError(err instanceof Error ? err.message : 'Could not update app status.')
        } finally {
            setStatusUpdatingAppId(null)
        }
    }

    const handleNavigate = (section: PortalSection) => {
        navigate(portalSectionToPath(section, currentOrg?.slug || requestedOrgSlug))
    }

    const handleSidebarSelect = (section: PortalSection) => {
        const orgSlug = currentOrg?.slug || requestedOrgSlug
        if (section === 'workspace-apps') {
            navigate(portalRoutes.workspaceApps(orgSlug))
            return
        }
        navigateToSection(section, orgSlug)
    }

    const renderSection = () => {
        if (!hasWorkspaces && activeSection !== 'profile' && activeSection !== 'my-account' && activeSection !== 'my-security' && activeSection !== 'my-sessions' && activeSection !== 'my-audit-logs' && activeSection !== 'my-roles' && activeSection !== 'tenant-settings') {
            return (
                <PortalOnboarding
                    user={user}
                    requestedAppName={requestedAppName}
                    createWorkspaceName={createWorkspaceName}
                    setCreateWorkspaceName={setCreateWorkspaceName}
                    creatingWorkspace={creatingWorkspace}
                    createWorkspaceMessage={createWorkspaceMessage}
                    maxWorkspacesAllowed={maxWorkspacesAllowed}
                    workspaceLimitReached={workspaceLimitReached}
                    onCreateWorkspace={createWorkspace}
                    error={error}
                />
            )
        }
        switch (activeSection) {
            case 'my-account':
                return (
                    <PortalMyAccount
                        currentLoginRedirect={currentLoginRedirect}
                        demoMode={portalState?.demo_mode ?? false}
                    />
                )
            case 'overview':
                return (
                    <PortalWorkspaceOverview
                        currentOrg={currentOrg}
                        members={members}
                        activity={workspaceAuditLogs}
                        membersLoaded={membersLoaded}
                        activityLoaded={activityLoaded}
                        currentPortalTitle={currentPortalTitle}
                    />
                )
            case 'workspaces':
                return (
                    <PortalTenantWorkspaces
                        portal={portalState}
                        demoMode={portalState?.demo_mode ?? false}
                        currentOrg={currentOrg}
                        canCreateWorkspace={canCreateWorkspace}
                        onSwitchWorkspace={switchWorkspace}
                        createWorkspaceName={createWorkspaceName}
                        setCreateWorkspaceName={setCreateWorkspaceName}
                        createWorkspaceSlug={createWorkspaceSlug}
                        setCreateWorkspaceSlug={setCreateWorkspaceSlug}
                        creatingWorkspace={creatingWorkspace}
                        createWorkspaceMessage={createWorkspaceMessage}
                        maxWorkspacesAllowed={maxWorkspacesAllowed}
                        workspaceLimitReached={workspaceLimitReached}
                        onCreateWorkspace={createWorkspace}
                    />
                )
            case 'branding':
                return (
                    <PortalWorkspaceBranding
                        currentOrg={currentOrg}
                        canManageBranding={canManageBranding}
                        brandingForm={brandingForm}
                        setBrandingForm={setBrandingForm}
                        savingBranding={savingBranding}
                        saveMessage={saveMessage}
                        onSaveBranding={saveBranding}
                        maxLogoBytes={portalState?.max_logo_bytes ?? 8 * 1024 * 1024}
                    />
                )
            case 'members':
                return (
                    <PortalWorkspaceMembers
                        currentOrg={currentOrg}
                        members={members}
                        pendingInvites={pendingInvites}
                        demoMode={portalState?.demo_mode ?? false}
                        loading={membersLoading}
                        invitesLoading={invitesLoading}
                        availableRoles={availableRoles}
                        canViewMembers={canViewMembers}
                        canInviteMembers={canInviteMembers}
                        canManageRoles={canManageRoles}
                        canViewActivity={canViewActivity}
                        activeBrandColor={activeBrandColor}
                        selectedMemberId={selectedMemberId}
                        activity={workspaceAuditLogs}
                        activityLoaded={activityLoaded}
                        inviteEmail={inviteEmail}
                        setInviteEmail={setInviteEmail}
                        inviteLoading={inviteLoading}
                        inviteActionEmail={inviteActionEmail}
                        inviteMessage={inviteMessage}
                        revokingInviteId={revokingInviteId}
                        roleDrafts={roleDrafts}
                        setRoleDrafts={setRoleDrafts}
                        roleSavingMemberId={roleSavingMemberId}
                        onInviteMember={inviteMember}
                        onResendInvite={resendInvite}
                        onRevokeInvite={revokeInvite}
                        onUpdateMemberRole={updateMemberRole}
                        onOpenMember={(memberId) => navigateToSection('members', currentOrg?.slug || requestedOrgSlug, memberId)}
                        onCloseMemberDetail={() => navigateToSection('members', currentOrg?.slug || requestedOrgSlug, null)}
                    />
                )
            case 'workspace-access':
                return (
                    <PortalWorkspaceAccess
                        currentOrg={currentOrg}
                        demoMode={portalState?.demo_mode ?? false}
                        canManageAuthPolicy={canManageAuthPolicy}
                        activeBrandColor={activeBrandColor}
                        authPolicyForm={authPolicyForm}
                        setAuthPolicyForm={v => { setAuthPolicyForm(v); setAuthPolicyDirty(true) }}
                        savingPolicy={savingPolicy}
                        policyMessage={authPolicyDirty}
                        onSaveAuthPolicy={saveAuthPolicy}
                        orgIpPolicy={workspaceIpPolicy}
                        ipPolicyForm={ipPolicyForm}
                        setIpPolicyForm={v => { setIpPolicyForm(v); setIpPolicyDirty(true) }}
                        loadingIpPolicy={loadingIpPolicy}
                        savingIpPolicy={savingIpPolicy}
                        ipPolicyMessage={ipPolicyDirty}
                        onSaveIpPolicy={saveIpPolicy}
                        lastChange={latestPolicyChange}
                    />
                )
            case 'workspace-session-policy':
                return (
                    <PortalWorkspaceSessionPolicy
                        currentOrg={currentOrg}
                        demoMode={portalState?.demo_mode ?? false}
                        canManageAuthPolicy={canManageAuthPolicy}
                        authPolicyForm={authPolicyForm}
                        setAuthPolicyForm={v => { setAuthPolicyForm(v); setAuthPolicyDirty(true) }}
                        savingPolicy={savingPolicy}
                        policyMessage={authPolicyDirty}
                        onSaveAuthPolicy={saveAuthPolicy}
                        lastChange={latestPolicyChange}
                    />
                )
            case 'workspace-danger-zone':
                return (
                    <PortalWorkspaceDangerZone
                        API={API}
                        user={user}
                        currentOrg={currentOrg}
                        members={members}
                        membersLoaded={membersLoaded}
                        membersLoading={membersLoading}
                        canManageDangerZone={isWorkspaceOwner}
                        canTransferOwnership={canTransferOwnership}
                        onWorkspaceStatusUpdated={(status) => {
                            if (!currentOrg) return
                            updateCurrentWorkspaceInPortalState({
                                ...currentOrg,
                                status,
                            })
                        }}
                        lastChange={latestDangerZoneChange}
                    />
                )
            case 'tenant-access':
                return (
                    <PortalTenantAccess
                        demoMode={portalState?.demo_mode ?? false}
                        canManageTenantAccess={canManageTenantAccess}
                        authPolicyForm={authPolicyForm}
                        setAuthPolicyForm={v => { setAuthPolicyForm(v); setAuthPolicyDirty(true) }}
                        savingPolicy={savingPolicy}
                        policyMessage={authPolicyDirty}
                        onSaveAuthPolicy={saveAuthPolicy}
                        lastChange={latestPolicyChange}
                    />
                )
            case 'tenant-audit-logs':
                return <PortalTenantAuditLogs />
            case 'tenant-security-alerts':
                return <PortalTenantSecurityAlerts />
            case 'tenant-settings':
                return <PortalTenantSettings />
            case 'workspace-login-widget':
                return (
                    <PortalWorkspaceLoginWidget
                        currentOrg={currentOrg}
                        requestedAppName={requestedAppName}
                        requestedClientId={widgetWorkspaceApp?.client.client_id || null}
                        availableApps={workspaceApps}
                        selectedAppId={widgetWorkspaceApp?.client.id || null}
                        onOpenApp={(appId) => navigate(portalRoutes.workspaceApps(currentOrg?.slug || requestedOrgSlug, appId))}
                        onOpenRegisterApp={() => navigate(portalRoutes.workspaceRegisterApp(currentOrg?.slug || requestedOrgSlug))}
                        brandingForm={brandingForm}
                        setBrandingForm={setBrandingForm}
                        authPolicyForm={authPolicyForm}
                        canManageBranding={canManageBranding}
                        savingBranding={savingBranding}
                        saveMessage={saveMessage}
                        onSaveBranding={saveBranding}
                        demoMode={portalState?.demo_mode ?? false}
                    />
                )
            case 'my-security':
                return (
                    <PortalMySecurity
                        demoMode={portalState?.demo_mode ?? false}
                    />
                )
            case 'my-sessions':
                return <PortalMySessions />
            case 'my-audit-logs':
                return <PortalMyAuditLogs />
            case 'my-security-alerts':
                return <PortalMySecurityAlerts />
            case 'my-roles':
                return (
                    <PortalMyRoles
                        user={user}
                        portalState={portalState}
                        currentOrgSlug={currentOrg?.slug || requestedOrgSlug}
                    />
                )
            case 'profile':
                return (
                    <PortalMyProfile
                        user={user}
                        setUser={setUser}
                        demoMode={portalState?.demo_mode ?? false}
                    />
                )
            case 'workspace-security-alerts':
                return (
                    <PortalWorkspaceSecurityAlerts
                        currentOrg={currentOrg}
                        activity={workspaceAuditLogs}
                        activityLoaded={activityLoaded}
                    />
                )
            case 'workspace-audit-logs':
                return (
                    <PortalWorkspaceAuditLogs
                        currentOrg={currentOrg}
                        canViewActivity={canViewActivity}
                        activity={workspaceAuditLogs}
                        loading={activityLoading}
                        onRefresh={() => {
                            setActionError('')
                            setActivityLoaded(false)
                            setActivityRefreshKey(value => value + 1)
                        }}
                    />
                )
            case 'workspace-apps':
                return selectedWorkspaceApp ? (
                    <PortalWorkspaceAppOverview
                        app={selectedWorkspaceApp}
                        activity={workspaceAuditLogs}
                        activityLoaded={activityLoaded}
                        canViewActivity={canViewActivity}
                        canManageApps={canManageWorkspaceResources}
                        deletingAppId={deletingAppId}
                        rotatingAppId={rotatingAppId}
                        statusUpdatingAppId={statusUpdatingAppId}
                        rotatedAppSecret={rotatedAppSecret}
                        appMessage={appMessage}
                        appError={actionError}
                        appSaving={savingAppId === selectedWorkspaceApp.client.id}
                        maxRedirectUrisPerApp={maxRedirectUrisPerApp}
                        maxAllowedEmbedOriginsPerApp={maxAllowedEmbedOriginsPerApp}
                        onBack={() => navigate(portalRoutes.workspaceApps(currentOrg?.slug || requestedOrgSlug))}
                        onSaveApp={saveApp}
                        onDeleteApp={deleteApp}
                        onRotateAppSecret={rotateAppSecret}
                        onToggleAppStatus={toggleAppStatus}
                    />
                ) : (
                    <PortalWorkspaceApps
                        canManageApps={canManageWorkspaceResources}
                        apps={workspaceApps}
                        loading={clientsLoading}
                        maxAppsPerWorkspace={maxAppsPerWorkspace}
                        maxRedirectUrisPerApp={maxRedirectUrisPerApp}
                        maxAllowedEmbedOriginsPerApp={maxAllowedEmbedOriginsPerApp}
                        deletingAppId={deletingAppId}
                        rotatingAppId={rotatingAppId}
                        statusUpdatingAppId={statusUpdatingAppId}
                        onDeleteApp={deleteApp}
                        onRotateAppSecret={rotateAppSecret}
                        onToggleAppStatus={toggleAppStatus}
                        onOpenApp={(appId) => navigate(portalRoutes.workspaceApps(currentOrg?.slug || requestedOrgSlug, appId))}
                        onOpenRegisterApp={() => navigate(portalRoutes.workspaceRegisterApp(currentOrg?.slug || requestedOrgSlug))}
                    />
                )
            case 'workspace-register-app':
                return (
                    <PortalWorkspaceRegisterApp
                        demoMode={portalState?.demo_mode ?? false}
                        canManageApps={canManageWorkspaceResources}
                        currentAppCount={workspaceApps.length}
                        maxAppsPerWorkspace={maxAppsPerWorkspace}
                        maxRedirectUrisPerApp={maxRedirectUrisPerApp}
                        maxAllowedEmbedOriginsPerApp={maxAllowedEmbedOriginsPerApp}
                        newAppName={newAppName}
                        setNewAppName={setNewAppName}
                        newAppType={newAppType}
                        setNewAppType={setNewAppType}
                        newAppRedirects={newAppRedirects}
                        setNewAppRedirects={setNewAppRedirects}
                        newAppAllowedEmbedOrigins={newAppAllowedEmbedOrigins}
                        setNewAppAllowedEmbedOrigins={setNewAppAllowedEmbedOrigins}
                        newAppConfirmMultiOrigin={newAppConfirmMultiOrigin}
                        setNewAppConfirmMultiOrigin={setNewAppConfirmMultiOrigin}
                        creatingApp={creatingApp}
                        appMessage={appMessage}
                        newAppSecret={newAppSecret}
                        setNewAppSecret={setNewAppSecret}
                        rotatedAppSecret={rotatedAppSecret}
                        setRotatedAppSecret={setRotatedAppSecret}
                        onCreateApp={createApp}
                        onBack={() => navigate(portalRoutes.workspaceApps(currentOrg?.slug || requestedOrgSlug))}
                    />
                )
            case 'api-keys':
                return (
                    <PortalWorkspaceApiKeys
                        apiKeys={apiKeys}
                        demoMode={portalState?.demo_mode ?? false}
                        isWorkspaceOwner={isWorkspaceOwner}
                        loading={apiKeysLoading}
                        setApiKeys={setApiKeys}
                        newKeyLabel={newKeyLabel}
                        setNewKeyLabel={setNewKeyLabel}
                        newKeyExpiry={newKeyExpiry}
                        setNewKeyExpiry={setNewKeyExpiry}
                        newKeyPermissionPreset={newKeyPermissionPreset}
                        setNewKeyPermissionPreset={setNewKeyPermissionPreset}
                        creatingKey={creatingKey}
                        setCreatingKey={setCreatingKey}
                        revokingKeyId={revokingKeyId}
                        setRevokingKeyId={setRevokingKeyId}
                        newKeyRaw={newKeyRaw}
                        setNewKeyRaw={setNewKeyRaw}
                        keyMessage={keyMessage}
                        setKeyMessage={setKeyMessage}
                        copiedKey={copiedKey}
                        setCopiedKey={setCopiedKey}
                        API={API}
                        lastChange={latestApiKeyChange}
                    />
                )
            default:
                return (
                    <PortalWorkspaceOverview
                        currentOrg={currentOrg}
                        members={members}
                        activity={workspaceAuditLogs}
                        membersLoaded={membersLoaded}
                        activityLoaded={activityLoaded}
                        currentPortalTitle={currentPortalTitle}
                    />
                )
        }
    }

    return (
        <PortalShell
            brandSrc="/rooiam-logo-wordmark-horizontal-blue.svg"
            displayName={displayName}
            mobileLabel="Rooiam App"
            demoMode={portalState?.demo_mode ?? false}
            currentWorkspaceLabel={currentOrg?.login_display_name || currentOrg?.name || 'No workspace selected'}
            currentWorkspaceLogoSrc={currentOrg?.icon_url || ''}
            currentUserRoleCodes={currentUserRoleCodes}
            userAvatarUrl={user?.avatar_url}
            navItems={navItems}
            activeSection={activeSection}
            mobileOpen={mobileOpen}
            loggingOut={loggingOut}
            onOpenMobile={() => setMobileOpen(true)}
            onCloseMobile={() => setMobileOpen(false)}
            onSelectSection={section => handleSidebarSelect(section as PortalSection)}
            onOpenWorkspaces={() => handleNavigate('workspaces')}
            onLogout={handleLogout}
        >
            {blocked === 'rate_limited' ? (
                <div className="min-h-[70vh] flex items-center justify-center">
                    <div className={`${panelClass} w-full max-w-md p-8 text-center`}>
                        <div className="text-4xl mb-4">⏳</div>
                        <h2 className="text-xl sm:text-2xl font-black text-gray-800 mb-2">Too Many Requests</h2>
                        <p className="text-sm font-semibold text-gray-500 mb-4">
                            The server is temporarily limiting requests. Please wait a moment.
                        </p>
                        <p className="text-sm font-bold text-amber-600 bg-amber-50 rounded-2xl px-4 py-3">
                            {retryIn > 0 ? `Retrying automatically in ${retryIn}s…` : 'Reloading…'}
                        </p>
                    </div>
                </div>
            ) : blocked === 'session_expired' ? (
                <div className="min-h-[70vh] flex items-center justify-center">
                    <div className={`${panelClass} w-full max-w-md p-8 text-center`}>
                        <div className="text-4xl mb-4">🔒</div>
                        <h2 className="text-xl sm:text-2xl font-black text-gray-800 mb-2">Session Expired</h2>
                        <p className="text-sm font-semibold text-gray-500 mb-6">
                            Your session has ended. Please sign in again to continue.
                        </p>
                        <button
                            type="button"
                            onClick={() => { window.location.href = currentLoginRedirect }}
                            className="px-5 py-2.5 rounded-2xl font-black text-sm shadow-md"
                            style={{ background: 'linear-gradient(135deg, #FFB5C8, #D5B7FF)', color: '#5a2d3f' }}
                        >
                            Sign In
                        </button>
                    </div>
                </div>
            ) : loading ? (
                <div className="min-h-[70vh] flex items-center justify-center">
                    <div className={`${panelClass} p-10 text-center`}>
                        <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center bg-emerald-50">
                            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                        </div>
                        <h2 className="text-xl sm:text-2xl font-black text-gray-800 mb-2">Loading workspace owner and admin area</h2>
                        <p className="text-sm font-semibold text-gray-400">Checking your workspace access and current workspace…</p>
                    </div>
                </div>
            ) : accessDeniedMessage ? (
                <div className="min-h-[70vh] flex items-center justify-center">
                    <div className={`${panelClass} w-full max-w-2xl p-8 text-center`}>
                        <div className="w-16 h-16 rounded-full mx-auto mb-5 flex items-center justify-center bg-amber-50">
                            <AlertTriangle className="w-8 h-8 text-amber-500" />
                        </div>
                        <h2 className="text-xl sm:text-2xl font-black text-gray-800 mb-2">Workspace Operator Access Required</h2>
                        <p className="text-sm font-semibold text-gray-500 mb-5">
                            {requestedOrgSlug
                                ? 'This workspace-specific operator area is only for the workspace owner and workspace admins of this workspace.'
                                : 'This operator area is only for workspace owners and workspace admins. Normal members and end users should use the actual workspace app instead.'}
                        </p>
                        <p className="text-sm font-bold text-amber-700 bg-amber-50 rounded-2xl px-4 py-3">{accessDeniedMessage}</p>
                        <div className="mt-5 flex flex-wrap gap-3 justify-center">
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="px-5 py-3 rounded-2xl font-black text-sm border border-gray-200 bg-white text-gray-600"
                            >
                                Sign Out
                            </button>
                        </div>
                    </div>
                </div>
            ) : error ? (
                <div className="min-h-[70vh] flex items-center justify-center">
                    <div className={`${panelClass} w-full max-w-xl p-8 text-center`}>
                        <p className="text-sm font-bold text-red-500 bg-red-50 rounded-2xl px-4 py-3">{error}</p>
                        <button
                            type="button"
                            onClick={() => { window.location.href = currentLoginRedirect }}
                            className="mt-5 px-5 py-3 rounded-2xl font-black text-sm shadow-md"
                            style={{ background: 'linear-gradient(135deg, #FFB5C8, #D5B7FF)', color: '#5a2d3f' }}
                        >
                            Back to Sign In
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    {actionError ? (
                        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                            <p className="flex-1 text-sm font-medium text-red-700">{actionError}</p>
                            <button
                                type="button"
                                onClick={() => setActionError('')}
                                className="shrink-0 text-xs font-bold text-red-500 underline"
                            >
                                Dismiss
                            </button>
                        </div>
                    ) : null}
                    {renderSection()}
                </div>
            )}
        </PortalShell>
    )
}
