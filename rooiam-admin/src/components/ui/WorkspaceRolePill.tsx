import { Crown, ShieldCheck, Users } from 'lucide-react'

import Pill from './Pill'

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

export default function WorkspaceRolePill({
    roleCodes,
    roleNames,
    className = '',
}: Props) {
    const role = resolveWorkspaceRole(roleCodes, roleNames)

    if (role === 'owner') {
        return (
            <Pill tone="blue" className={`gap-1 ${className}`.trim()}>
                <Crown className="h-2.5 w-2.5" /> Workspace Owner
            </Pill>
        )
    }

    if (role === 'admin') {
        return (
            <Pill tone="purple" className={`gap-1 ${className}`.trim()}>
                <ShieldCheck className="h-2.5 w-2.5" /> Workspace Admin
            </Pill>
        )
    }

    return (
        <Pill tone="green" className={`gap-1 ${className}`.trim()}>
            <Users className="h-2.5 w-2.5" /> User
        </Pill>
    )
}
