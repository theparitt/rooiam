import { Check, Loader2, Calendar } from 'lucide-react'
import { GITHUB_REPO_URL } from '../lib/site'

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
    { text: 'Docker self-host (one command)' },
]

const inProgress: Item[] = [
    { text: 'Make Rooiam easier to self-host', note: 'setup, deploy, operator trust' },
    { text: 'Make app integration easier to understand', note: 'hosted login, OIDC, examples' },
    { text: 'Polish tenant and operator flows for real use' },
]

const planned: Item[] = [
    { text: 'v0.3: safer and more polished tenant/operator workflows' },
    { text: 'v1.0: a credible product for small and mid-size multi-tenant SaaS teams' },
    { text: 'Enterprise expansion only after real market demand' },
]

const columns = [
    {
        label: 'Done',
        version: 'v0.1',
        color: '#B5EFD5',
        border: '#90DDB5',
        iconColor: '#2a8a5a',
        items: done,
        icon: <Check className="w-3.5 h-3.5" />,
    },
    {
        label: 'In Progress',
        version: 'now',
        color: '#B5D5FF',
        border: '#7aadff',
        iconColor: '#2255bb',
        items: inProgress,
        icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
    },
    {
        label: 'Planned',
        version: 'upcoming',
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
                        Built in the open. The goal is not to promise everything. The goal is to become a strong self-hosted passwordless IAM for multi-tenant SaaS.
                    </p>
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
