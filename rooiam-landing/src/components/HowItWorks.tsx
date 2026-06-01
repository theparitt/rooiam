import { DOCS_GETTING_STARTED_URL, GITHUB_REPO_URL } from '../lib/site'

const steps = [
    {
        num: '01',
        emoji: '🐳',
        title: 'Clone & start with Docker',
        desc: 'One command starts the API server, Postgres, Redis, and all frontends. No Rust toolchain or manual setup required.',
        code: `git clone ${GITHUB_REPO_URL}\ncd rooiam && docker compose --profile demo up`,
        color: '#B5D5FF',
    },
    {
        num: '02',
        emoji: '⚙️',
        title: 'Open admin and finish setup',
        desc: 'Use the admin console to finish first-time setup, review the seeded demo workspaces, or prepare your own real deployment config.',
        code: 'open http://localhost:5181  →  Admin console',
        color: '#FFB5C8',
    },
    {
        num: '03',
        emoji: '🔌',
        title: 'Connect your app',
        desc: 'Use the hosted login UI or OIDC flow. Rooiam handles magic links, social login, MFA, sessions, and workspace context.',
        code: 'OIDC authorize  →  callback  →  session',
        color: '#D5B7FF',
    },
    {
        num: '04',
        emoji: '✅',
        title: 'Check who is logged in',
        desc: 'Call /v1/identity/me from any protected route. Returns the current user and their workspace context, or 401.',
        code: 'GET /v1/identity/me  →  { id, email, org }',
        color: '#B5EFD5',
    },
]

export default function HowItWorks()
{
    return (
        <section id="how-it-works" className="px-6 md:px-12 lg:px-20 py-20"
            style={{ background: 'linear-gradient(180deg, #FFFBFD 0%, #F8F0FF 100%)' }}>
            <div className="max-w-5xl mx-auto">
                <div className="text-center mb-14">
                    <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: '#c96b8a' }}>Self-Host Guide</p>
                    <h2 className="text-4xl md:text-5xl font-black text-gray-800 mb-4">
                        Self-hosted IAM for multi-tenant SaaS.<br />
                        <span style={{ color: '#aaa' }}>Start local, then move to hosted.</span>
                    </h2>
                    <p className="text-base font-semibold text-gray-400 max-w-xl mx-auto">
                        Rooiam starts with Docker on localhost, then moves to a real hosted deployment with explicit public URLs and infrastructure config.
                    </p>
                </div>

                <div className="space-y-4">
                    {steps.map((s) => (
                        <div key={s.num}
                            className="flex gap-6 items-start rounded-3xl p-6 border-2 hover:-translate-y-0.5 transition-all"
                            style={{ borderColor: s.color + 'aa', background: s.color + '15' }}>
                            <div className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm"
                                style={{ background: s.color, color: '#333' }}>
                                {s.num}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xl">{s.emoji}</span>
                                    <h3 className="font-black text-lg text-gray-800">{s.title}</h3>
                                </div>
                                <p className="text-sm font-semibold text-gray-500 mb-3">{s.desc}</p>
                                <code className="block text-xs font-mono px-4 py-3 rounded-2xl text-green-300 overflow-x-auto whitespace-pre"
                                    style={{ background: '#1a1a2e' }}>
                                    {s.code.split('\n').map((line, i) => (
                                        <span key={i} className="block"><span className="text-pink-400 select-none mr-2">$</span>{line}</span>
                                    ))}
                                </code>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="mt-8 text-center">
                    <a href={DOCS_GETTING_STARTED_URL}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-sm border-2 hover:bg-white transition-all"
                        style={{ borderColor: '#D5B7FF', color: '#7a4db5' }}>
                        Full setup guide in the Docs →
                    </a>
                </div>
            </div>
        </section>
    )
}
