import { ArrowRight, ScanLine, ShieldCheck, Smartphone } from 'lucide-react'

const features = [
    {
        emoji: '✉️',
        title: 'Magic Link Login',
        desc: 'Send a secure sign-in link by email, with no password to remember or reset.',
        color: '#FFE5B5',
        border: '#FFD080',
    },
    {
        emoji: '🔐',
        title: 'Google + Microsoft OAuth',
        desc: 'Let people use their Google or Microsoft account and link it to one Rooiam identity.',
        color: '#B5D5FF',
        border: '#80B5FF',
    },
    {
        emoji: '🏢',
        title: 'Multi-Tenant Workspaces',
        desc: 'Keep members, roles, invitations and app access organized for each customer workspace.',
        color: '#FFB5C8',
        border: '#FF85A5',
    },
    {
        emoji: '🔑',
        title: 'TOTP MFA & Passkeys',
        desc: 'Offer passkeys and authenticator codes, with stronger sign-in where a workspace needs it.',
        color: '#D5B7FF',
        border: '#B07FFF',
    },
    {
        emoji: '🪪',
        title: 'OIDC & OAuth2 Clients',
        desc: 'Connect your product with OIDC and return users to your app with a verified identity.',
        color: '#B5EFD5',
        border: '#70D5A5',
    },
    {
        emoji: '🍪',
        title: 'Opaque Sessions',
        desc: 'Manage sign-ins with revocation, logout and limits on active sessions.',
        color: '#FFD5B5',
        border: '#FFB07F',
    },
    {
        emoji: '🎨',
        title: 'Workspace Branding',
        desc: 'Give each workspace its own logo, colors and preferred order of sign-in methods.',
        color: '#FFB5C8',
        border: '#FF85A5',
    },
    {
        emoji: '🛡️',
        title: 'Access & IP Policy',
        desc: 'Choose allowed sign-in methods, email domains, IPs and session limits per workspace.',
        color: '#B5D5FF',
        border: '#80B5FF',
    },
    {
        emoji: '📋',
        title: 'Audit Logs',
        desc: 'Review sign-ins and security changes in searchable platform and workspace activity.',
        color: '#FFE5B5',
        border: '#FFD080',
    },
]

export default function Features()
{
    return (
        <section id="features" className="px-6 md:px-12 lg:px-20 py-20">
            <div className="max-w-5xl mx-auto">
                <div className="text-center mb-14">
                    <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: '#c96b8a' }}>What you get</p>
                    <h2 className="text-4xl md:text-5xl font-black text-gray-800 mb-4">
                        One place for sign-in<br />
                        <span style={{ color: '#8d78ae' }}>across every workspace.</span>
                    </h2>
                    <p className="text-base font-semibold text-gray-400 max-w-xl mx-auto">
                        Give your users a clear way in, while each workspace keeps control over access.
                    </p>
                </div>

                <div id="phone-sign-in" className="scroll-mt-28 mb-7 overflow-hidden rounded-[2rem] border border-violet-200 bg-gradient-to-br from-[#f4ecff] via-white to-[#fff0f7] p-6 shadow-[0_22px_70px_-45px_rgba(95,58,160,0.7)] md:p-10">
                    <div className="grid items-center gap-8 lg:grid-cols-[1.05fr_.95fr]">
                        <div>
                            <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-black uppercase tracking-wider text-violet-700">
                                <Smartphone className="h-3.5 w-3.5" aria-hidden="true" /> Android preview
                            </span>
                            <h3 className="mt-5 max-w-lg text-3xl font-black leading-tight text-gray-900 md:text-4xl">
                                Sign in with a scan and a tap.
                            </h3>
                            <p className="mt-4 max-w-lg text-base font-semibold leading-relaxed text-gray-600">
                                Users scan a browser QR, check the matching code on their Android phone, and approve. Then they finish sign-in and any required MFA in the browser.
                            </p>
                            <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold text-violet-900">
                                <span className="rounded-full bg-white px-3 py-2">Scan the QR</span>
                                <span className="rounded-full bg-white px-3 py-2">Match the code</span>
                                <span className="rounded-full bg-white px-3 py-2">Approve on phone</span>
                            </div>
                            <div className="mt-6 flex items-start gap-2 text-sm font-semibold leading-relaxed text-gray-600">
                                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" aria-hidden="true" />
                                Each workspace can enable this method and choose its place on the sign-in screen.
                            </div>
                            <div className="mt-7 flex flex-wrap gap-3">
                                <a href="https://docs.rooiam.com/getting-started/android-phone-sign-in-walkthrough" className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-violet-800">
                                    See how it works <ArrowRight className="h-4 w-4" aria-hidden="true" />
                                </a>
                                <a href="https://docs.rooiam.com/reference/android-sdk-integration" className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-5 py-3 text-sm font-black text-violet-700 transition-colors hover:bg-violet-50">
                                    Build with the Android SDK
                                </a>
                            </div>
                        </div>
                        <div className="rounded-3xl border border-violet-100 bg-white/80 p-5 shadow-sm" aria-label="Illustration of browser and phone matching a sign-in code">
                            <div className="flex items-center gap-2 border-b border-violet-100 pb-4">
                                <span className="h-2.5 w-2.5 rounded-full bg-rose-200" />
                                <span className="h-2.5 w-2.5 rounded-full bg-amber-200" />
                                <span className="h-2.5 w-2.5 rounded-full bg-emerald-200" />
                                <span className="ml-2 rounded-lg bg-violet-50 px-3 py-1 text-xs font-bold text-violet-500">Your browser</span>
                            </div>
                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 py-7 sm:gap-4">
                                <div className="rounded-2xl border border-violet-100 bg-[#faf7ff] p-3 text-center sm:p-5">
                                    <ScanLine className="mx-auto mb-3 h-10 w-10 text-violet-500" aria-hidden="true" />
                                    <p className="text-xs font-bold text-gray-500">Request code</p>
                                    <p className="mt-1 whitespace-nowrap text-sm font-black tracking-wide text-gray-900 sm:text-2xl">123 456</p>
                                    <p className="mt-2 text-xs font-bold text-violet-700">42</p>
                                </div>
                                <ArrowRight className="h-5 w-5 text-violet-400" aria-hidden="true" />
                                <div className="rounded-[1.5rem] border-[5px] border-[#2e2645] bg-white p-3 text-center shadow-lg sm:p-5">
                                    <Smartphone className="mx-auto mb-3 h-9 w-9 text-violet-500" aria-hidden="true" />
                                    <p className="text-xs font-bold text-gray-500">Check on phone</p>
                                    <p className="mt-1 whitespace-nowrap text-sm font-black tracking-wide text-gray-900 sm:text-2xl">123 456</p>
                                    <p className="mt-2 text-xs font-bold text-violet-700">42 · Approve</p>
                                </div>
                            </div>
                            <p className="text-center text-xs font-semibold text-gray-400">Illustration · compare both before approving</p>
                        </div>
                    </div>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {features.map((f) => (
                        <div key={f.title}
                            className="rounded-3xl p-6 border-2 hover:-translate-y-1 transition-all duration-200 group"
                            style={{ borderColor: f.border, background: f.color + '22' }}>
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-4"
                                style={{ background: f.color }}>
                                {f.emoji}
                            </div>
                            <h3 className="font-black text-lg text-gray-800 mb-2">{f.title}</h3>
                            <p className="text-sm font-semibold text-gray-500 leading-relaxed">{f.desc}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}
