export const DEFAULT_BRAND = '#c96b8a'
export const DEFAULT_LOGIN_METHOD_ORDER = ['magic_link', 'passkey', 'google', 'microsoft'] as const
export type LoginMethodKey = (typeof DEFAULT_LOGIN_METHOD_ORDER)[number]
export type WidgetRadius = 'sharp' | 'compact' | 'rounded' | 'pill'
export type CardRadius = 'sharp' | 'compact' | 'rounded'
export type ButtonStyle = 'filled' | 'outline'
export type CardBgStyle = 'auto' | 'solid' | 'gradient-lr' | 'gradient-tb' | 'gradient-tl' | 'gradient-tr'
export type CardBorderWidth = 'none' | '1px' | '2px'
export type WidgetShadow = 'none' | 'soft' | 'lifted'
export type LogoContainer = 'circle' | 'square' | 'wide'
export type LogoSize = 'small' | 'medium' | 'large'

export type PortalSection =
    | 'overview'
    | 'workspaces'
    | 'branding'
    | 'workspace-access'
    | 'workspace-danger-zone'
    | 'tenant-access'
    | 'tenant-audit-logs'
    | 'workspace-login-widget'
    | 'members'
    | 'workspace-apps'
    | 'workspace-register-app'
    | 'workspace-audit-logs'
    | 'workspace-session-policy'
    | 'api-keys'
    | 'profile'
    | 'my-account'
    | 'my-security'
    | 'my-sessions'
    | 'my-audit-logs'
    | 'my-roles'
    | 'tenant-settings'
    | 'workspace-security-alerts'
    | 'tenant-security-alerts'
    | 'my-security-alerts'

export type MeResponse = {
    id: string
    email: string | null
    display_name: string | null
    avatar_url: string | null
    status: string
}

export type Organization = {
    id: string
    name: string
    slug: string
    login_display_name: string | null
    login_title: string | null
    login_subtitle: string | null
    icon_url: string | null
    login_logo_url: string | null
    brand_color: string | null
    show_login_logo: boolean
    show_login_title: boolean
    show_login_subtitle: boolean
    show_powered_by: boolean
    widget_radius: WidgetRadius
    widget_shadow: WidgetShadow
    icon_container: LogoContainer
    login_logo_container: LogoContainer
    login_logo_size: LogoSize
    card_radius: CardRadius
    button_style: ButtonStyle
    card_bg_style: CardBgStyle
    card_bg_color2: string | null
    card_border_width: CardBorderWidth
    card_border_color: string | null
    login_method_order: LoginMethodKey[]
    allow_magic_link: boolean
    allow_google: boolean
    allow_microsoft: boolean
    allow_passkey: boolean
    require_mfa: boolean
    require_mfa_for_admins: boolean
    tenant_portal_require_mfa: boolean
    allowed_email_domains: string
    max_session_age_hours: number | null
    max_concurrent_sessions: number | null
    magic_link_rate_limit_admin_override: number | null
    magic_link_rate_window_admin_override: number | null
    magic_link_rate_limit_staff_override: number | null
    magic_link_rate_window_staff_override: number | null
    status: string
    platform_locked: boolean
    created_at: string
    updated_at: string
}

export type OrganizationRole = {
    code: string
    name: string
}

export type PortalResponse = {
    current_org: Organization | null
    organizations: Organization[]
    permissions: string[]
    current_user_role_codes: string[]
    available_roles: OrganizationRole[]
    max_logo_bytes: number
    demo_mode: boolean
    max_workspaces_allowed: number | null
    max_apps_per_workspace: number | null
    max_redirect_uris_per_app: number | null
    max_allowed_embed_origins_per_app: number | null
}

export type TenantApiKey = {
    id: string
    org_id: string
    label: string
    key_prefix: string
    permission_preset: 'workspace_owner' | 'workspace_admin'
    allowed_permissions: string[]
    expires_at: string | null
    revoked: boolean
    created_at: string
    last_used_at: string | null
}

export type OrgClient = {
    client: {
        id: string
        client_id: string
        app_name: string
        app_icon_url?: string | null
        app_type: string
        status: string
        is_first_party: boolean
        created_at: string
    }
    redirect_uris: string[]
    allowed_embed_origins: string[]
    client_secret?: string | null
}

export type OrganizationMember = {
    id: string
    organization_id: string
    user_id: string
    status: string
    created_at: string
    display_name: string | null
    avatar_url: string | null
    email: string | null
    role_names: string[]
    role_codes: string[]
    last_seen_at: string | null
}

export type OrganizationInvite = {
    id: string
    organization_id: string
    email: string
    inviter_user_id: string
    inviter_display_name: string | null
    inviter_email: string | null
    expires_at: string
    created_at: string
}

export type OrganizationActivityItem = {
    id: number
    actor_user_id: string | null
    actor_display_name: string | null
    actor_email: string | null
    action: string
    target_type: string
    target_id: string | null
    ip: string | null
    metadata: Record<string, unknown>
    created_at: string
}

export type BrandingForm = {
    name: string
    login_display_name: string
    login_title: string
    login_subtitle: string
    icon_url: string
    login_logo_url: string
    brand_color: string
    show_login_logo: boolean
    show_login_title: boolean
    show_login_subtitle: boolean
    show_powered_by: boolean
    widget_radius: WidgetRadius
    widget_shadow: WidgetShadow
    icon_container: LogoContainer
    login_logo_container: LogoContainer
    login_logo_size: LogoSize
    card_radius: CardRadius
    button_style: ButtonStyle
    card_bg_style: CardBgStyle
    card_bg_color2: string
    card_border_width: CardBorderWidth
    card_border_color: string
    login_method_order: LoginMethodKey[]
}

export type AuthPolicyForm = {
    allow_magic_link: boolean
    allow_google: boolean
    allow_microsoft: boolean
    allow_passkey: boolean
    require_mfa: boolean
    require_mfa_for_admins: boolean
    tenant_portal_require_mfa: boolean
    allowed_email_domains: string
    max_session_age_hours: string
    max_concurrent_sessions: string
    magic_link_rate_limit_admin_override: string
    magic_link_rate_window_admin_override: string
    magic_link_rate_limit_staff_override: string
    magic_link_rate_window_staff_override: string
}

export type TenantAuthConfig = {
    google_configured: boolean
    google_client_id: string | null
    microsoft_configured: boolean
    microsoft_client_id: string | null
    microsoft_tenant_id: string | null
    smtp_configured: boolean
    smtp_host: string | null
    smtp_port: number | null
    smtp_from: string | null
    smtp_security: string | null
}

export type TenantAuthConfigForm = {
    use_custom_google: boolean
    google_client_id: string
    google_client_secret: string
    use_custom_microsoft: boolean
    microsoft_client_id: string
    microsoft_client_secret: string
    microsoft_tenant_id: string
    use_custom_smtp: boolean
    smtp_host: string
    smtp_port: string
    smtp_user: string
    smtp_password: string
    smtp_from: string
    smtp_security: string
}

export type PlatformIpPolicy = {
    tenant_ip_policy_editable: boolean
    default_allowlist: string
    default_blocklist: string
}

export type TenantIpPolicy = {
    use_custom_ip_policy: boolean
    allowlist: string
    blocklist: string
}

export type EffectiveIpPolicy = {
    source: string
    allowlist: string
    blocklist: string
}

export type OrgIpPolicyResponse = {
    platform: PlatformIpPolicy
    tenant: TenantIpPolicy
    effective: EffectiveIpPolicy
}

export type BrandingUploadKind = 'icon' | 'login-logo'

export type BrandingUploadResponse = {
    url: string
    kind: BrandingUploadKind
}
