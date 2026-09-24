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
        emoji: '📱',
        title: 'Android Phone Sign-In',
        desc: 'In preview: scan a browser QR, match the code on your phone and approve sign-in.',
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
