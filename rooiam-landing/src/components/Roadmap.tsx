import { Check, Smartphone, Calendar } from 'lucide-react'
import { DOCS_ROADMAP_URL, GITHUB_REPO_URL } from '../lib/site'

type Item = { text: string; note?: string }

const done: Item[] = [
    { text: 'Magic link login' },
    { text: 'Google & Microsoft OAuth' },
    { text: 'TOTP MFA (authenticator app)' },
    { text: 'WebAuthn passkeys' },
    { text: 'Opaque session cookies with revocation' },
    { text: 'Multi-tenant workspaces, roles & invites' },
    { text: 'OIDC authorization code flow with PKCE' },
    { text: 'Per-workspace branding and access policy' },
    { text: 'Platform and workspace audit surfaces' },
    { text: 'Docker API and infrastructure stacks' },
    { text: 'OpenAPI snapshots and TypeScript SDK packages' },
    { text: 'Trusted-device login server protocol' },
]

const nextRelease: Item[] = [
    { text: 'Freeze and verify the existing device-login contract' },
    { text: 'Prove device trust and one-time browser completion', note: 'replay, revocation, tenant isolation' },
    { text: 'Android enrollment, QR scan and number-match approval' },
    { text: 'Hosted-login QR flow with workspace policy and MFA' },
    { text: 'TypeScript SDK helpers and a fresh-clone reference demo' },
    { text: 'Security release checks and self-host guidance' },
]

const planned: Item[] = [
    { text: 'Tenant and operator polish informed by real usage' },
    { text: 'iOS and push approval', note: 'follow-up candidates' },
    { text: 'Rust SDK when a real integration needs it' },
    { text: 'v1.0: stable platform for multi-tenant SaaS teams' },
    { text: 'Enterprise expansion only after real market demand' },
]

const columns = [
    {
        label: 'Available foundation',
        version: 'current checkout',
        color: '#B5EFD5',
        border: '#90DDB5',
        iconColor: '#2a8a5a',
        items: done,
        icon: <Check className="w-3.5 h-3.5" />,
    },
    {
        label: 'Next milestone',
        version: '0.2 · planned',
        color: '#B5D5FF',
        border: '#7aadff',
        iconColor: '#2255bb',
        items: nextRelease,
        icon: <Smartphone className="w-3.5 h-3.5" />,
    },
    {
        label: 'After 0.2',
        version: 'direction',
        color: '#FFE8A0',
        border: '#e8c832',
        iconColor: '#8a6a00',
        items: planned,
        icon: <Calendar className="w-3.5 h-3.5" />,
    },
]

export default function Roadmap()
{
    return (
        <section id="roadmap" className="px-6 md:px-12 lg:px-20 py-20"
            style={{ background: 'linear-gradient(180deg, #FFF8FC 0%, #F8F0FF 100%)' }}>
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-14">
                    <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: '#c96b8a' }}>Roadmap</p>
                    <h2 className="text-4xl md:text-5xl font-black text-gray-800 mb-4">
                        Where we are.<br />
                        <span style={{ color: '#aaa' }}>Where we're going.</span>
                    </h2>
                    <p className="text-base font-semibold text-gray-400 max-w-xl mx-auto">
                        Rooiam 0.2 focuses on one complete trusted-device login journey, built on our self-hosted passwordless IAM foundation.
                    </p>
                </div>

                <div className="rounded-3xl border-2 border-purple-200 bg-white p-6 md:p-8 mb-8">
                    <p className="text-xs font-black uppercase tracking-widest text-purple-700 mb-2">0.2 goal · Trusted Device &amp; QR Authentication</p>
                    <h3 className="text-3xl font-black text-gray-800 mb-3">Scan. Match. Approve.</h3>
                    <p className="text-base font-semibold text-gray-600 max-w-3xl">
                        Enroll an Android phone. Scan the browser QR. Verify the number and request details.
                        Approve on your phone, then securely finish signing in to the requesting browser.
                    </p>
                    <p className="mt-3 text-sm text-gray-600 max-w-3xl">
                        Release gate: a real Android-to-browser flow, replay and revocation checks,
                        tenant isolation, and a demo developers can run from a fresh clone.
                        The hosted flow, Android preview, and application-owned reference session are implemented.
                        An assisted test passed physical-phone approval via pasted QR text and the subsequent reference-app session.
                        Camera recovery, a continuous QR-to-app flow, and release certification remain open.
                    </p>
                    <a href={DOCS_ROADMAP_URL} className="inline-block mt-4 font-bold text-purple-700 underline underline-offset-4">
                        Read the phases and release criteria →
                    </a>
                </div>

                <div className="grid gap-6 md:grid-cols-3">
                    {columns.map((col) => (
                        <div key={col.label}
                            className="rounded-3xl p-6 border-2 flex flex-col"
                            style={{ borderColor: col.border + 'aa', background: col.color + '18' }}>
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="font-black text-lg text-gray-800">{col.label}</h3>
                                <span className="text-xs font-black px-2.5 py-1 rounded-full"
                                    style={{ background: col.color, color: col.iconColor }}>
                                    {col.version}
                                </span>
                            </div>
                            <ul className="space-y-2.5 flex-1">
                                {col.items.map((item) => (
                                    <li key={item.text} className="flex items-start gap-2.5">
                                        <span className="mt-0.5 shrink-0 flex items-center justify-center w-5 h-5 rounded-full"
                                            style={{ background: col.color, color: col.iconColor }}>
                                            {col.icon}
                                        </span>
                                        <span className="text-sm font-semibold text-gray-600">
                                            {item.text}
                                            {item.note && (
                                                <span className="ml-1 text-xs text-gray-400">({item.note})</span>
                                            )}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>

                <div className="mt-8 text-center">
                    <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-sm border-2 hover:bg-white transition-all"
                        style={{ borderColor: '#B5D5FF', color: '#2255bb' }}>
                        Follow progress on GitHub →
                    </a>
                </div>
            </div>
        </section>
    )
}
