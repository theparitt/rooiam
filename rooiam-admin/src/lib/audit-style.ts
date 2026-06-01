/**
 * audit-style.ts
 *
 * Shared color + icon system for audit log event badges across the admin console.
 * Each audit action string is mapped to an `ActionTone` that determines badge color
 * and icon. The same tone system is mirrored in rooiam-app's audit-events.ts.
 *
 * Tone → Color mapping summary:
 *   login     → teal       (successful sign-in — positive, calm green)
 *   logout    → slate      (sign-out — neutral, low-emphasis grey)
 *   failed    → rose       (failures, blocks, suspicious — soft red warning)
 *   delete    → red        (destructive: delete, remove, revoke, disable — strong red)
 *   create    → emerald    (creation: register, enroll, invite, accept — positive green)
 *   modify    → sky        (non-destructive changes: update, rename, rotate — light blue)
 *   workspace → indigo     (workspace-scoped events — brand indigo)
 *   admin     → amber      (operator/platform actions — elevated amber)
 *   oauth     → violet     (OAuth token flow, social login — distinctive purple)
 *   mfa       → cyan       (MFA and passkey events — security cyan)
 *   identity  → purple     (user profile, session, account — identity purple)
 *   info      → blue       (uncategorised catch-all — neutral blue)
 */
import React from 'react'
import { LogIn, LogOut, ServerCrash, Trash2, Plus, Pencil, Building2, Shield, Key, Fingerprint, User, Info } from 'lucide-react'

/** All 12 visual tones used by audit log event badges. */
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

/**
 * Tailwind classes for each tone's badge appearance.
 * Format: bg-{color}-{shade} text-{color}-{shade} border-{color}-{shade}
 */
export const TONE_STYLES: Record<ActionTone, string> = {
    login:     'bg-teal-50 text-teal-700 border-teal-200',       // teal — successful sign-in
    logout:    'bg-slate-100 text-slate-500 border-slate-300',   // slate — sign-out (neutral)
    failed:    'bg-rose-50 text-rose-700 border-rose-200',       // rose — failure / blocked / suspicious
    delete:    'bg-red-100 text-red-700 border-red-300',         // red (stronger) — destructive action
    create:    'bg-emerald-50 text-emerald-700 border-emerald-200', // emerald — creation / enrollment
    modify:    'bg-sky-50 text-sky-700 border-sky-200',          // sky — non-destructive change
    workspace: 'bg-indigo-50 text-indigo-700 border-indigo-200', // indigo — workspace-scoped event
    admin:     'bg-amber-50 text-amber-700 border-amber-200',    // amber — operator / platform action
    oauth:     'bg-violet-50 text-violet-700 border-violet-200', // violet — OAuth token / social login
    mfa:       'bg-cyan-50 text-cyan-700 border-cyan-200',       // cyan — MFA or passkey event
    identity:  'bg-purple-50 text-purple-700 border-purple-200', // purple — user profile / session
    info:      'bg-blue-50 text-blue-700 border-blue-200',       // blue — uncategorised catch-all
}

/** Icon for each tone. Uses React.createElement because this file is .ts not .tsx. */
export const TONE_ICONS: Record<ActionTone, React.ReactElement> = {
    login:     React.createElement(LogIn, { className: 'w-3.5 h-3.5' }),
    logout:    React.createElement(LogOut, { className: 'w-3.5 h-3.5' }),
    failed:    React.createElement(ServerCrash, { className: 'w-3.5 h-3.5' }),
    delete:    React.createElement(Trash2, { className: 'w-3.5 h-3.5' }),
    create:    React.createElement(Plus, { className: 'w-3.5 h-3.5' }),
    modify:    React.createElement(Pencil, { className: 'w-3.5 h-3.5' }),
    workspace: React.createElement(Building2, { className: 'w-3.5 h-3.5' }),
    admin:     React.createElement(Shield, { className: 'w-3.5 h-3.5' }),
    oauth:     React.createElement(Key, { className: 'w-3.5 h-3.5' }),
    mfa:       React.createElement(Fingerprint, { className: 'w-3.5 h-3.5' }),
    identity:  React.createElement(User, { className: 'w-3.5 h-3.5' }),
    info:      React.createElement(Info, { className: 'w-3.5 h-3.5' }),
}

/**
 * Maps an audit action string to its visual tone.
 * Rules are evaluated in priority order — more specific patterns first.
 */
export function actionTone(action: string): ActionTone {
    // Exact login/logout outcomes first (before generic '.success' or 'auth.*' rules)
    if (action.includes('login.success')) return 'login'
    if (action.includes('logout.success')) return 'logout'

    // Failures — always rose/red regardless of namespace
    if (action.includes('.failed') || action.includes('.blocked') || action.includes('.suspicious') || action.includes('.binding_mismatch')) return 'failed'

    // Destructive — strong red (delete, remove, revoke, disable, reject, account deletion)
    if (action.includes('.deleted') || action.includes('.removed') || action.includes('.revoked') || action.includes('.disabled') || action.includes('.rejected') || action.includes('account.deletion') || action.includes('account.deleted')) return 'delete'

    // Admin / platform operator actions — amber (elevated privilege indicator)
    if (action.startsWith('admin.') || action.startsWith('platform.')) return 'admin'

    // OAuth token flow and social login — violet
    if (action.startsWith('oauth.') || action.includes('token.issued') || action.includes('token.refreshed')) return 'oauth'

    // MFA and passkeys — cyan (security factor events)
    if (action.includes('auth.mfa.') || action.includes('auth.passkey.')) return 'mfa'

    // Workspace-scoped events — indigo
    if (action.startsWith('workspace.')) return 'workspace'

    // Identity / profile / session / user account — purple
    if (action.startsWith('identity.') || action.startsWith('user.') || action.includes('sessions.revoked') || action.includes('session.')) return 'identity'

    // Create / register / enroll / invite / accept — emerald (positive creation)
    if (action.includes('.created') || action.includes('.registered') || action.includes('.enrolled') || action.includes('.invited') || action.includes('.accepted') || action.includes('.sent') || action.includes('.requested')) return 'create'

    // Modify / update / change / restore / rotate — sky (non-destructive change)
    if (action.includes('.updated') || action.includes('.changed') || action.includes('.restored') || action.includes('.rotated') || action.includes('.renamed') || action.includes('_transfer.') || action.includes('role_changed') || action.includes('.reauth_required')) return 'modify'

    // Fallback — blue info badge for anything not matched above
    return 'info'
}

export function actionStyle(action: string): { className: string; icon: React.ReactElement } {
    const tone = actionTone(action)
    return { className: TONE_STYLES[tone], icon: TONE_ICONS[tone] }
}
