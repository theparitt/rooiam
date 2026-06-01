import { DEFAULT_LOGIN_METHOD_ORDER, LoginMethodKey, LogoContainer, WidgetRadius, WidgetShadow } from '../../lib/portal-types'
import { normalizeLoginMethodOrder } from '../../lib/login-style'
import LoginWidgetCore from './LoginWidgetCore'

type Props = {
    companyName: string
    title: string
    subtitle: string
    logoUrl?: string | null
    brandColor?: string | null
    showLogo?: boolean
    showTitle?: boolean
    showSubtitle?: boolean
    showPoweredBy?: boolean
    enabledMethods: Partial<Record<LoginMethodKey, boolean>>
    methodOrder?: LoginMethodKey[]
    widgetRadius?: WidgetRadius | string | null
    widgetShadow?: WidgetShadow | string | null
    logoContainer?: LogoContainer | string | null
    loginLogoContainer?: LogoContainer | string | null
    loginLogoSize?: 'small' | 'medium' | 'large' | string | null
    cardRadius?: string | null
    buttonStyle?: string | null
    cardBgStyle?: string | null
    cardBgColor2?: string | null
    cardBorderWidth?: string | null
    cardBorderColor?: string | null
    showDemoBadge?: boolean
}

export default function LoginWidgetPreview({
    companyName,
    title,
    subtitle,
    logoUrl,
    brandColor,
    showLogo = true,
    showTitle = false,
    showSubtitle = false,
    showPoweredBy = false,
    enabledMethods,
    methodOrder,
    widgetRadius,
    widgetShadow,
    logoContainer,
    loginLogoContainer,
    loginLogoSize,
    cardRadius,
    buttonStyle = 'filled',
    cardBgStyle = 'auto',
    cardBgColor2,
    cardBorderWidth,
    cardBorderColor,
    showDemoBadge = false,
}: Props) {
    const orderedMethods = normalizeLoginMethodOrder(methodOrder || [...DEFAULT_LOGIN_METHOD_ORDER])

    return (
        <div className="mx-auto w-full max-w-[430px]">
            <LoginWidgetCore
                branding={{
                    companyName,
                    logoUrl,
                    brandColor,
                    showLogo,
                    showTitle,
                    showSubtitle,
                    showPoweredBy,
                    loginTitle: title,
                    loginSubtitle: subtitle,
                    widgetRadius,
                    widgetShadow,
                    logoContainer,
                    loginLogoContainer,
                    loginLogoSize,
                    cardRadius,
                    buttonStyle,
                    cardBgStyle,
                    cardBgColor2,
                    cardBorderWidth,
                    cardBorderColor,
                    usingTenantBranding: Boolean(brandColor || logoUrl),
                    showDemoBadge,
                }}
                methods={{
                    magic_link: Boolean(enabledMethods.magic_link),
                    passkey: Boolean(enabledMethods.passkey),
                    google: Boolean(enabledMethods.google),
                    microsoft: Boolean(enabledMethods.microsoft),
                }}
                methodOrder={orderedMethods}
                interactive={false}
            />
        </div>
    )
}
