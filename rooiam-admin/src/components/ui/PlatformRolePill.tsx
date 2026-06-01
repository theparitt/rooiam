import { Crown, ShieldCheck } from 'lucide-react'

import type { AdminUserDetail, AdminUser } from '@/lib/api'

import Pill from './Pill'

type PlatformRoleSubject = Pick<AdminUser, 'is_platform_owner' | 'is_superuser'> | Pick<AdminUserDetail['user'], 'is_platform_owner' | 'is_superuser'>

type Props = {
    user: PlatformRoleSubject
    className?: string
}

export default function PlatformRolePill({
    user,
    className = '',
}: Props) {
    if (user.is_platform_owner) {
        return (
            <Pill tone="amber" className={`gap-1 ${className}`.trim()}>
                <Crown className="h-2.5 w-2.5" /> Platform Owner
            </Pill>
        )
    }

    if (user.is_superuser) {
        return (
            <Pill tone="purple" className={`gap-1 ${className}`.trim()}>
                <ShieldCheck className="h-2.5 w-2.5" /> Platform Admin
            </Pill>
        )
    }

    return null
}
