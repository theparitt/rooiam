import React from 'react'
import { Building2, Loader2, LogOut, Menu, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import DemoBadge from '../DemoBadge'
import { resolveApiAssetUrl } from '../../lib/api-base'

type NavItem = {
    id: string
    label: string
    icon: LucideIcon
    group?: string
}

const groupDescriptions: Record<string, string> = {
    Workspace: 'Workspace overview, members, apps, and audit',
    'Workspace Settings': 'Workspace access, session policy, branding, login widget, API keys, and danger actions',
    Tenant: 'Workspace owners, workspace admins, access, and audit',
    My: 'My profile, sessions, and security',
    Navigation: 'Portal navigation',
}

type Props = {
    brandSrc: string
    displayName: string
    mobileLabel: string
    demoMode?: boolean
    currentWorkspaceLabel: string
    currentWorkspaceLogoSrc?: string
    currentUserRoleCodes?: string[]
    navItems: NavItem[]
    activeSection: string
    mobileOpen: boolean
    loggingOut: boolean
    onOpenMobile: () => void
    onCloseMobile: () => void
    onSelectSection: (id: string) => void
    onOpenWorkspaces: () => void
    onLogout: () => void
    userAvatarUrl?: string | null
    children: React.ReactNode
}

const shellBackground = {
    background: `
        radial-gradient(circle at top left, rgba(202, 174, 255, 0.55) 0%, transparent 32%),
        radial-gradient(circle at bottom right, rgba(244, 193, 255, 0.4) 0%, transparent 30%),
        linear-gradient(180deg, hsl(263 82% 96%) 0%, hsl(275 68% 95%) 48%, hsl(252 72% 96%) 100%)
    `,
    borderRight: '1px solid rgba(181, 156, 255, 0.38)',
}

const workspaceBackground = {
    background: `
        radial-gradient(circle at top right, rgba(207, 192, 255, 0.34) 0%, transparent 28%),
        radial-gradient(circle at bottom left, rgba(244, 205, 255, 0.24) 0%, transparent 26%),
        linear-gradient(180deg, rgba(246, 241, 255, 0.95) 0%, rgba(242, 238, 255, 0.92) 42%, rgba(238, 241, 255, 0.94) 100%)
    `,
}

export default function PortalShell({
    brandSrc,
    displayName,
    mobileLabel,
    demoMode = false,
    currentWorkspaceLabel,
    currentWorkspaceLogoSrc,
    currentUserRoleCodes = [],
    navItems,
    activeSection,
    mobileOpen,
    loggingOut,
    onOpenMobile,
    onCloseMobile,
    onSelectSection,
    onOpenWorkspaces,
    onLogout,
    userAvatarUrl,
    children,
}: Props) {
    const [openGroupHelp, setOpenGroupHelp] = React.useState<string | null>(null)
    const currentWorkspaceIconSrc = resolveApiAssetUrl(currentWorkspaceLogoSrc)
    const currentUserAvatarSrc = resolveApiAssetUrl(userAvatarUrl) || '/rooiam-app-white.svg'
    const currentUserRolePill = currentUserRoleCodes.includes('owner')
        ? { label: 'Owner', className: 'bg-amber-100 text-amber-700' }
        : currentUserRoleCodes.includes('admin')
            ? { label: 'Admin', className: 'bg-violet-100 text-violet-700' }
            : currentUserRoleCodes.length > 0
                ? { label: 'User', className: 'bg-slate-100 text-slate-500' }
                : null
    // ── Sidebar layout — DO NOT CHANGE ──────────────────────────────────────
    // Finalized scrollbar design. Track is always 4px wide (no layout shift).
    // Thumb invisible at rest, fades in on hover. Flush to right edge via -mr-4 pr-4.
    const sidebarContent = (
        <>
            <div className="px-3 py-4 flex items-center justify-between gap-3 shrink-0">
                <div className="relative inline-flex">
                    <img
                        src={brandSrc}
                        alt="Rooiam"
                        className="h-10 w-auto"
                        style={{ maxWidth: '170px' }}
                    />
                    {demoMode ? <DemoBadge className="absolute -bottom-1 -right-2" /> : null}
                </div>
                <button
                    type="button"
                    onClick={onCloseMobile}
                    className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-2xl border border-white/80 bg-white/70 text-slate-500 hover:text-slate-700 hover:bg-white transition-colors"
                    aria-label="Close navigation"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <button
                type="button"
                onClick={onOpenWorkspaces}
                className="mx-1 mt-1 px-4 py-2.5 rounded-2xl bg-white/65 border border-white/85 shadow-sm shrink-0 text-left w-[calc(100%-0.5rem)] hover:bg-white/85 transition-colors"
                style={{ boxShadow: '0 10px 30px -20px rgba(98, 61, 173, 0.35)' }}
            >
                <p className="text-[10px] font-bold flex items-center gap-1 text-muted-foreground">
                    <Building2 className="w-3 h-3" />
                    Active Workspace
                </p>
                <div className="mt-2 flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-white border border-white/90 shadow-sm flex items-center justify-center shrink-0 overflow-hidden">
                        {currentWorkspaceIconSrc ? (
                            <img
                                src={currentWorkspaceIconSrc}
                                alt={currentWorkspaceLabel}
                                className="w-full h-full rounded-full object-cover"
                            />
                        ) : (
                            <img
                                src="/rooiam-app-white.svg"
                                alt="Workspace"
                                className="w-5 h-5 object-contain"
                            />
                        )}
                    </div>
                    <p className="font-black text-[13px] truncate leading-tight min-w-0">
                        {currentWorkspaceLabel}
                    </p>
                </div>
            </button>

            <div className="portal-nav-scroll min-h-0 flex-1 overflow-y-auto pt-2 -mr-4 pr-4">
                <nav className="flex flex-col gap-4">
                    {Array.from(new Set(navItems.map(item => item.group || 'Navigation'))).map(group => (
                        <div key={group} className="space-y-1">
                            <div className="px-4">
                                <div className="flex items-center gap-2">
                                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-500/80">
                                        {group}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setOpenGroupHelp(current => current === group ? null : group)}
                                        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-violet-200 bg-white/80 text-[10px] font-black text-violet-500 transition-colors hover:bg-white hover:text-violet-600"
                                        aria-label={`About ${group}`}
                                        aria-expanded={openGroupHelp === group}
                                    >
                                        ?
                                    </button>
                                </div>
                                {openGroupHelp === group ? (
                                    <div className="mt-1.5 rounded-2xl border border-white/80 bg-white/85 px-3 py-2 shadow-sm">
                                        <p className="text-[11px] font-medium leading-tight text-slate-500">
                                            {groupDescriptions[group] || groupDescriptions.Navigation}
                                        </p>
                                    </div>
                                ) : null}
                            </div>
                            <div className="flex flex-col gap-1">
                                {navItems
                                    .filter(item => (item.group || 'Navigation') === group)
                                    .map(item => {
                                        const Icon = item.icon
                                        const active = activeSection === item.id
                                        return (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => onSelectSection(item.id)}
                                                className={`nav-link ${active ? 'nav-link-active' : 'nav-link-inactive'} text-left`}
                                            >
                                                <Icon className="w-4 h-4 shrink-0" />
                                                <span className="truncate">{item.label}</span>
                                            </button>
                                        )
                                    })}
                            </div>
                        </div>
                    ))}
                </nav>
            </div>

            <div className="pt-4 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.5)' }}>
                <div
                    className="rounded-3xl bg-white/72 border border-white/85 p-3"
                    style={{ boxShadow: '0 14px 36px -26px rgba(82, 49, 160, 0.45)' }}
                >
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl overflow-hidden shrink-0 shadow-sm">
                            <img src={currentUserAvatarSrc} alt={displayName} className="w-full h-full object-cover scale-[1.06]" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate" title={displayName}>{displayName}</p>
                            {currentUserRolePill && (
                                <span className={`inline-block mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-black leading-none ${currentUserRolePill.className}`}>
                                    {currentUserRolePill.label}
                                </span>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={onLogout}
                            disabled={loggingOut}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-black border border-violet-100 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors disabled:opacity-50 shrink-0"
                        >
                            {loggingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                            Logout
                        </button>
                    </div>
                </div>
            </div>
        </>
    )

    return (
        <div className="h-screen overflow-hidden flex" style={workspaceBackground}>
            <aside className="hidden lg:flex h-screen w-72 shrink-0 flex-col p-4 gap-3 overflow-hidden" style={shellBackground}>
                {sidebarContent}
            </aside>

            {mobileOpen ? (
                <div className="lg:hidden fixed inset-0 z-40">
                    <button
                        type="button"
                        className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"
                        onClick={onCloseMobile}
                        aria-label="Close navigation overlay"
                    />
                    <aside className="absolute inset-y-0 left-0 w-[18.5rem] max-w-[calc(100vw-2rem)] flex flex-col p-4 gap-3 shadow-2xl overflow-hidden" style={shellBackground}>
                        {sidebarContent}
                    </aside>
                </div>
            ) : null}

            <main className="portal-main-scroll flex-1 min-w-0 h-screen overflow-y-auto">
                <div className="lg:hidden sticky top-0 z-30 px-4 py-3 border-b border-violet-100/80 bg-white/75 backdrop-blur-xl">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={onOpenMobile}
                            className="inline-flex items-center justify-center w-11 h-11 rounded-2xl border border-violet-100 bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors shrink-0"
                            aria-label="Open navigation"
                        >
                            <Menu className="w-5 h-5" />
                        </button>
                        <div className="min-w-0">
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-500">{mobileLabel}</p>
                            <p className="text-sm font-black truncate">{displayName}</p>
                        </div>
                    </div>
                </div>

                <div className="p-4 sm:p-6 lg:p-8">
                    <div className="max-w-6xl mx-auto min-h-[calc(100vh-4rem)]">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    )
}
