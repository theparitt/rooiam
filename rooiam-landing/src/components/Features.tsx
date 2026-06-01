const features = [
    {
        emoji: '✉️',
        title: 'Magic Link Login',
        desc: 'Passwordless email sign-in with server-side rate limiting, secure token verification, and HTML email delivery.',
        color: '#FFE5B5',
        border: '#FFD080',
    },
    {
        emoji: '🔐',
        title: 'Google + Microsoft OAuth',
        desc: 'Google and Microsoft sign-in, linked identities, and workspace-aware auth policy controls.',
        color: '#B5D5FF',
        border: '#80B5FF',
    },
    {
        emoji: '🏢',
        title: 'Multi-Tenant Workspaces',
        desc: 'Workspaces with memberships, roles, invites, and active workspace switching built into the model.',
        color: '#FFB5C8',
        border: '#FF85A5',
    },
    {
        emoji: '🔑',
        title: 'TOTP MFA & Passkeys',
        desc: 'Authenticator-app TOTP and WebAuthn passkeys. Enforce MFA per-workspace or require it for admins only.',
        color: '#D5B7FF',
        border: '#B07FFF',
    },
    {
        emoji: '🪪',
        title: 'OIDC & OAuth2 Clients',
        desc: 'OIDC authorization code flow with PKCE, JWKS, token exchange, and workspace-scoped app clients.',
        color: '#B5EFD5',
        border: '#70D5A5',
    },
    {
        emoji: '🍪',
        title: 'Opaque Sessions',
        desc: 'HttpOnly cookie sessions backed by Postgres. Revocation, logout, and concurrent session limits all stay simple.',
        color: '#FFD5B5',
        border: '#FFB07F',
    },
    {
        emoji: '🎨',
        title: 'Workspace Branding',
        desc: 'Per-workspace login page customisation — logo, brand colour, widget style, and login method order.',
        color: '#FFB5C8',
        border: '#FF85A5',
    },
    {
        emoji: '🛡️',
        title: 'Access & IP Policy',
        desc: 'Per-workspace sign-in policy: allowed auth methods, email domain allowlists, IP allowlists, and session age limits.',
        color: '#B5D5FF',
        border: '#80B5FF',
    },
    {
        emoji: '📋',
        title: 'Audit Logs',
        desc: 'Platform and workspace activity history with filtering, export, and security-focused event tracking.',
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
                        Built for SaaS with many workspaces.<br />
                        <span style={{ color: '#aaa' }}>Not just a login widget.</span>
                    </h2>
                    <p className="text-base font-semibold text-gray-400 max-w-xl mx-auto">
                        Rooiam focuses on the parts that matter in real multi-tenant SaaS: hosted login, workspace context, admin control, app clients, and audit trails.
                    </p>
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
