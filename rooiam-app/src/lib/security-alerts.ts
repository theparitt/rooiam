import { actionLabel, actionStatusTone } from './audit-events'
import type { OrganizationActivityItem } from './portal-types'

export const TONE_STYLES: Record<string, string> = {
    failed:    'bg-rose-50 text-rose-700 border-rose-200',
    delete:    'bg-red-100 text-red-700 border-red-300',
    info:      'bg-slate-50 text-slate-700 border-slate-200',
    mfa:       'bg-cyan-50 text-cyan-700 border-cyan-200',
    login:     'bg-teal-50 text-teal-700 border-teal-200',
    logout:    'bg-slate-100 text-slate-500 border-slate-300',
    create:    'bg-emerald-50 text-emerald-700 border-emerald-200',
    modify:    'bg-sky-50 text-sky-700 border-sky-200',
    workspace: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    admin:     'bg-amber-50 text-amber-700 border-amber-200',
    oauth:     'bg-violet-50 text-violet-700 border-violet-200',
    identity:  'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
}

export const BRUTE_FORCE_THRESHOLD = 3
export const SPRAY_THRESHOLD = 3

export const SECURITY_FILTER_ACTIONS = ['failed', 'suspicious', 'blocked', 'mismatch', 'denied']

export function isSecurityLog(action: string): boolean {
    return SECURITY_FILTER_ACTIONS.some(a => action.includes(a))
}

export function alertReason(action: string, metadata: Record<string, unknown> | null): string {
    const meta = metadata
    const metaReason = typeof meta?.reason === 'string' ? meta.reason : null
    if (action === 'auth.login.suspicious') {
        if (metaReason === 'new_ip') return `Sign-in from an IP address not seen in this account's login history.`
        if (metaReason === 'rapid_ip_change') return `IP address changed within a short time window — sign-in from ${meta?.current_ip ?? 'unknown'}, previous was ${meta?.previous_ip ?? 'unknown'}.`
        if (metaReason === 'new_user_agent') return `Sign-in from an unrecognized browser or device.`
        if (metaReason === 'new_device_class') return `Device type changed from previous sessions.`
        if (metaReason === 'repeated_blocked_embed_origin_probe') return `Repeated login attempts from a blocked embed origin.`
        if (metaReason === 'repeated_failed_magic_link_verification') return `Repeated magic link failures from this IP.`
        return `Risk engine flagged this sign-in.`
    }
    if (action === 'auth.session.binding_mismatch') return `Session cookie did not match the request context — possible replay or hijack attempt.`
    if (action === 'auth.ip_policy.blocked') return `IP address is on the workspace blocklist.`
    if (action === 'auth.widget.embed_origin_blocked') return `Login widget request from an origin not in the allowed embed list.`
    if (action === 'auth.mfa.challenge.failed') return `Wrong MFA code.`
    if (action === 'auth.mfa.enrollment.failed') return `MFA setup code rejected.`
    if (action === 'auth.passkey.login.failed') return `Passkey assertion rejected by the server.`
    if (action === 'oauth.login.failed') return `OAuth provider rejected the login request.`
    if (action === 'auth.login.failed') return `Wrong password.`
    return `Credential rejected.`
}

export type AlertSignal = {
    type: 'brute-force' | 'spray' | 'suspicious'
    detail: string
    count: number
    accounts?: string[]
    workspaceSlug?: string
}

export type OperatorAlert = {
    key: string
    severity: 'high' | 'medium'
    event: string
    eventTone: string
    actor: string
    ip: string
    timestamp: string
    reason: string
    context: string
    searchTerm: string
    workspaceSlug: string
}

export function detectAlerts(activity: OrganizationActivityItem[], workspaceSlug = ''): AlertSignal[] {
    const last1h = Date.now() - 60 * 60 * 1000
    const recent = activity.filter(l => new Date(l.created_at).getTime() >= last1h)
    const failures = recent.filter(l => l.action.includes('failed') || l.action.includes('suspicious'))
    const signals: AlertSignal[] = []

    const byAccount: Record<string, number> = {}
    for (const f of failures) {
        const key = f.actor_email || f.actor_user_id || ''
        if (key) byAccount[key] = (byAccount[key] ?? 0) + 1
    }
    for (const [account, count] of Object.entries(byAccount)) {
        if (count >= BRUTE_FORCE_THRESHOLD) {
            signals.push({ type: 'brute-force', detail: account, count, workspaceSlug })
        }
    }

    const byIp: Record<string, Set<string>> = {}
    for (const f of failures) {
        const ip = f.ip || ''
        const account = f.actor_email || f.actor_user_id || ''
        if (ip && account) {
            if (!byIp[ip]) byIp[ip] = new Set()
            byIp[ip].add(account)
        }
    }
    for (const [ip, accounts] of Object.entries(byIp)) {
        if (accounts.size >= SPRAY_THRESHOLD) {
            signals.push({ type: 'spray', detail: ip, count: accounts.size, accounts: [...accounts], workspaceSlug })
        }
    }

    const suspicious = recent.filter(l => l.action.includes('suspicious'))
    if (suspicious.length > 0) {
        signals.push({
            type: 'suspicious',
            detail: suspicious[0].actor_email || suspicious[0].ip || '',
            count: suspicious.length,
            workspaceSlug,
        })
    }

    return signals
}

export function buildAlerts(signals: AlertSignal[], securityLogs: OrganizationActivityItem[]): OperatorAlert[] {
    const grouped: OperatorAlert[] = signals.map((signal, i) => {
        let event = ''
        let reason = ''
        if (signal.type === 'brute-force') {
            event = `Brute-force: ${signal.count} failed sign-ins`
            reason = `${signal.count} failed/suspicious sign-in attempts on account "${signal.detail}" within the last hour — alert threshold is ${BRUTE_FORCE_THRESHOLD} failures`
        } else if (signal.type === 'spray') {
            event = `Password spray: ${signal.count} accounts targeted`
            const sample = signal.accounts?.slice(0, 3).join(', ')
            reason = `${signal.count} different accounts failed sign-in from IP "${signal.detail}" in the last hour — alert threshold is ${SPRAY_THRESHOLD} accounts. Targeted: ${sample}${(signal.accounts?.length ?? 0) > 3 ? ` +${(signal.accounts?.length ?? 0) - 3} more` : ''}`
        } else {
            event = `Suspicious: ${signal.count} flagged event${signal.count > 1 ? 's' : ''}`
            reason = `Server-side risk engine explicitly flagged ${signal.count} sign-in event${signal.count > 1 ? 's' : ''} as suspicious — not inferred from patterns, directly marked by the auth system`
        }
        return {
            key: `group:${signal.type}:${signal.detail}:${i}`,
            severity: (signal.type === 'suspicious' ? 'medium' : 'high') as 'high' | 'medium',
            event,
            eventTone: signal.type === 'brute-force' || signal.type === 'spray' ? 'failed' : 'admin',
            actor: signal.detail || 'Unknown',
            ip: signal.type === 'spray' ? signal.detail : '—',
            timestamp: 'Last 1h',
            reason,
            context: signal.workspaceSlug || '',
            searchTerm: signal.detail,
            workspaceSlug: signal.workspaceSlug || '',
        }
    })

    const events: OperatorAlert[] = securityLogs.map(log => {
        const tone = actionStatusTone(log.action)
        const isBlocked = log.action.includes('blocked') || log.action.includes('denied') || log.action.includes('mismatch')
        const ws = typeof log.metadata?.workspace_slug === 'string' ? log.metadata.workspace_slug : ''
        const meta = log.metadata as Record<string, unknown> | null
        return {
            key: `event:${log.id}`,
            severity: (isBlocked ? 'high' : 'medium') as 'high' | 'medium',
            event: actionLabel(log.action),
            eventTone: tone,
            actor: log.actor_email || log.actor_display_name || log.actor_user_id || 'System',
            ip: log.ip || '—',
            timestamp: new Date(log.created_at).toLocaleString(),
            reason: alertReason(log.action, meta),
            context: ws,
            searchTerm: log.actor_email || log.ip || log.target_id || log.action,
            workspaceSlug: ws,
        }
    })

    return [...grouped, ...events]
}
