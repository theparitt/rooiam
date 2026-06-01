import { Crown, ShieldCheck, Users } from 'lucide-react'

import PortalPill from './PortalPill'

type Props = {
    roleCodes?: string[] | null
    roleNames?: string[] | null
    className?: string
}

function resolveWorkspaceRole(roleCodes?: string[] | null, roleNames?: string[] | null): 'owner' | 'admin' | 'user' {
    const codes = (roleCodes ?? []).map(code => code.toLowerCase())
    const names = (roleNames ?? []).map(name => name.toLowerCase())

    if (codes.includes('owner') || names.some(name => name.includes('owner'))) return 'owner'
    if (codes.includes('admin') || names.some(name => name.includes('admin'))) return 'admin'
    return 'user'
}

export default function PortalWorkspaceRolePill({
    roleCodes,
    roleNames,
    className = '',
}: Props) {
    const role = resolveWorkspaceRole(roleCodes, roleNames)

    if (role === 'owner') {
        return (
            <PortalPill tone="sky" className={`gap-1 ${className}`.trim()}>
                <Crown className="h-2.5 w-2.5" /> Workspace Owner
            </PortalPill>
        )
    }

    if (role === 'admin') {
        return (
            <PortalPill tone="purple" className={`gap-1 ${className}`.trim()}>
                <ShieldCheck className="h-2.5 w-2.5" /> Workspace Admin
            </PortalPill>
        )
    }

    return (
        <PortalPill tone="green" className={`gap-1 ${className}`.trim()}>
            <Users className="h-2.5 w-2.5" /> User
        </PortalPill>
    )
}
