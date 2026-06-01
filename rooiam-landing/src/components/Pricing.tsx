import { Check, Github, Cloud } from 'lucide-react'
import {
    DOCS_HOME_URL,
    DOCS_GETTING_STARTED_URL,
    DOCS_OVERVIEW_URL,
    DOCS_PRODUCTION_URL,
    GITHUB_REPO_URL,
} from '../lib/site'

const plans = [
    {
        icon: <Github className="w-7 h-7" />,
        name: 'Self-Host',
        tagline: 'Open Source · Apache 2.0',
        price: 'Free',
        priceNote: 'forever',
        color: '#B5EFD5',
        border: '#90DDB5',
        bg: 'white',
        badge: null as string | null,
        features: [
            'Magic link + Google/Microsoft login',
            'TOTP MFA and WebAuthn passkeys',
            'Opaque cookie sessions with revocation',
            'Multi-tenant workspaces, roles, and invites',
            'OIDC authorization code flow with PKCE',
            'Per-workspace branding and access policy',
            'Workspace and tenant audit logs',
            'Docs and source code you can inspect',
        ],
        cta: 'Get Started →',
        ctaHref: DOCS_GETTING_STARTED_URL,
        ctaStyle: { background: '#1a1a1a', color: '#fff' },
    },
    {
        icon: <Cloud className="w-7 h-7" />,
        name: 'Hosted',
        tagline: 'Managed by us',
        price: 'Coming',
        priceNote: 'soon',
        color: '#FFB5C8',
        border: '#FF85A5',
        bg: 'white',
        badge: 'Coming Soon',
        features: [
            'Everything in Self-Host',
            'We run the infrastructure for you',
            'Good fit for hobby projects and early startups',
            'Simple hosted onboarding',
            'Managed upgrades and operations',
            'Low-cost way to avoid self-hosting',
        ],
        cta: 'Follow on GitHub',
        ctaHref: GITHUB_REPO_URL,
        ctaStyle: { background: 'linear-gradient(135deg, #FFB5C8, #D5B7FF)', color: '#5a2d3f' },
    },
]

export default function Pricing()
{
    return (
        <section id="pricing" className="section-padding" style={{ background: 'linear-gradient(180deg, #F8F0FF 0%, #FFF8FC 100%)' }}>
            <div className="max-w-6xl mx-auto">

                {/* Header */}
                <div className="text-center mb-6">
                    <p className="text-sm font-black uppercase tracking-widest mb-4" style={{ color: '#c96b8a' }}>Pricing</p>
                    <h2 className="text-4xl md:text-5xl font-black text-gray-800 mb-4">
                        Self-host free. <span className="gradient-text">Hosted tier coming soon.</span>
                    </h2>
                    <p className="text-lg font-semibold text-gray-400 max-w-xl mx-auto">
                        The core product is free to self-host forever. A managed hosted option is in progress.
                    </p>
                </div>

                {/* Open Source Banner */}
                <div className="mb-10 mx-auto max-w-2xl rounded-3xl overflow-hidden border-2"
                    style={{ borderColor: '#B5EFD5', background: 'linear-gradient(135deg, #F0FFF8, #F8F0FF)' }}>
                    <div className="flex flex-col sm:flex-row items-center gap-4 px-6 py-5">
                        <div className="w-12 h-12 rounded-2xl bg-gray-900 flex items-center justify-center shrink-0">
                            <Github className="w-6 h-6 text-white" />
                        </div>
                        <div className="text-center sm:text-left">
                            <p className="font-black text-gray-800">100% Open Source · Apache 2.0</p>
                            <p className="text-sm font-semibold text-gray-500">
                                No vendor lock-in. Run it yourself, inspect the code, and use it freely in commercial or open projects.
                            </p>
                        </div>
                        <a
                            href={DOCS_OVERVIEW_URL}
                            className="shrink-0 px-5 py-2.5 rounded-full text-sm font-black bg-gray-900 text-white hover:bg-gray-700 transition-all whitespace-nowrap"
                        >
                            Open the Docs →
                        </a>
                    </div>
                </div>

                {/* Pricing Cards */}
                <div className="grid gap-6 md:grid-cols-2 max-w-4xl mx-auto">
                    {plans.map((plan) => (
                        <div
                            key={plan.name}
                            className={`rounded-4xl p-7 border-2 flex flex-col transition-all duration-300 hover:-translate-y-2 ${plan.badge ? 'shadow-2xl scale-[1.02]' : 'shadow-sm hover:shadow-lg'}`}
                            style={{ borderColor: plan.border, background: plan.bg }}
                        >
                            {plan.badge && (
                                <div className="self-start font-black text-xs mb-4 px-3 py-1.5 rounded-full"
                                    style={{ background: plan.color, color: '#5a2d3f' }}>
                                    {plan.badge}
                                </div>
                            )}

                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                                style={{ background: plan.color + '50', color: '#555' }}>
                                {plan.icon}
                            </div>

                            <h3 className="text-2xl font-black text-gray-800 mb-0.5">{plan.name}</h3>
                            <p className="text-xs font-bold mb-4" style={{ color: '#c96b8a' }}>{plan.tagline}</p>

                            <div className="flex items-baseline gap-1.5 mb-6">
                                <span className="text-4xl font-black text-gray-800">{plan.price}</span>
                                <span className="text-sm font-semibold text-gray-400">{plan.priceNote}</span>
                            </div>

                            <ul className="space-y-3 flex-1 mb-8">
                                {plan.features.map((f) => (
                                    <li key={f} className="flex items-start gap-3 text-sm font-semibold text-gray-600">
                                        <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: plan.border }} />
                                        {f}
                                    </li>
                                ))}
                            </ul>

                            <a
                                href={plan.ctaHref}
                                target="_blank"
                                rel="noreferrer"
                                className="block text-center py-3.5 rounded-2xl font-black text-sm transition-all hover:scale-[1.02] hover:opacity-90 shadow-sm"
                                style={plan.ctaStyle}
                            >
                                {plan.cta}
                            </a>
                        </div>
                    ))}
                </div>

                {/* Bottom note */}
                <p className="text-center text-sm font-semibold text-gray-400 mt-10">
                    Free to self-host forever. Hosted tier pricing will be announced when ready.
                    {' '}·{' '}
                    <a href={DOCS_HOME_URL} className="underline hover:text-gray-700 transition-colors">Read the docs</a>
                    {' '}·{' '}
                    <a href={DOCS_PRODUCTION_URL} className="underline hover:text-gray-700 transition-colors">Self-hosting guide</a>
                </p>
            </div>
        </section>
    )
}
