const methods = [
    { name: 'Google', mark: 'G', color: '#E9F2FF', ink: '#4285F4', y: 102 },
    { name: 'Microsoft', mark: 'M', color: '#FFF0E7', ink: '#D97738', y: 170 },
    { name: 'Email magic link', mark: '@', color: '#FFF0B9', ink: '#9A6A00', y: 238 },
    { name: 'Passkey', mark: '✦', color: '#EFE5FF', ink: '#8855C8', y: 306 },
    { name: 'Android phone QR', mark: 'QR', color: '#DDF8EC', ink: '#238763', y: 374 },
]

const apps = [
    { name: 'Your SaaS product', detail: 'Web application', y: 140 },
    { name: 'Customer portal', detail: 'Another application', y: 236 },
    { name: 'Admin dashboard', detail: 'Your own application', y: 332 },
]

function DesktopGraph()
{
    return (
        <svg className="hidden lg:block w-full h-auto" viewBox="0 0 1120 490" role="img"
            aria-labelledby="architecture-title architecture-description">
            <title id="architecture-title">How Rooiam connects sign-in methods to your applications</title>
            <desc id="architecture-description">People choose Google, Microsoft, email magic link, passkey or Android phone approval. Rooiam verifies one identity, applies workspace access rules and connects to your applications with OIDC. Each application owns its own session.</desc>
            <defs>
                <linearGradient id="architecture-background" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#FFF9FC" />
                    <stop offset="55%" stopColor="#F8F7FF" />
                    <stop offset="100%" stopColor="#F2FCF9" />
                </linearGradient>
                <linearGradient id="architecture-core" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#FFF1F7" />
                    <stop offset="55%" stopColor="#F7F0FF" />
                    <stop offset="100%" stopColor="#F0FCF8" />
                </linearGradient>
                <filter id="architecture-shadow" x="-30%" y="-40%" width="160%" height="190%">
                    <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#6B5294" floodOpacity="0.10" />
                </filter>
                <marker id="architecture-arrow" viewBox="0 0 10 10" refX="8" refY="5"
                    markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="#A58ACD" strokeWidth="2" />
                </marker>
                <marker id="architecture-arrow-green" viewBox="0 0 10 10" refX="8" refY="5"
                    markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="#83BFA5" strokeWidth="2" />
                </marker>
            </defs>

            <rect x="1" y="1" width="1118" height="488" rx="34" fill="url(#architecture-background)" stroke="#E9DDF4" strokeWidth="2" />
            <circle cx="570" cy="248" r="215" fill="#EDDEFF" opacity="0.24" />
            <circle cx="990" cy="66" r="120" fill="#C9F5E2" opacity="0.27" />

            <text x="45" y="72" fill="#9B6E91" fontSize="13" fontWeight="900" letterSpacing="2.1">HOW PEOPLE SIGN IN</text>
            <text x="428" y="72" fill="#8A6FB4" fontSize="13" fontWeight="900" letterSpacing="2.1">YOUR IDENTITY LAYER</text>
            <text x="820" y="72" fill="#5A9B81" fontSize="13" fontWeight="900" letterSpacing="2.1">YOUR APPLICATIONS</text>

            <path d="M365 128 V400 M365 264 H416" fill="none" stroke="#CCB8E7" strokeWidth="3" strokeLinecap="round" markerEnd="url(#architecture-arrow)" />
            {methods.map((method) => (
                <path key={`line-${method.name}`} d={`M305 ${method.y + 26} H365`} fill="none" stroke="#CCB8E7" strokeWidth="2.5" strokeLinecap="round" />
            ))}
            <circle cx="365" cy="264" r="6" fill="#BCA3DE" stroke="#FFF" strokeWidth="3" />

            <path d="M699 268 H764 M764 172 V364" fill="none" stroke="#A9D7C5" strokeWidth="3" strokeLinecap="round" />
            {apps.map((app) => (
                <path key={`line-${app.name}`} d={`M764 ${app.y + 32} H812`} fill="none" stroke="#A9D7C5" strokeWidth="2.5" strokeLinecap="round" markerEnd="url(#architecture-arrow-green)" />
            ))}
            <circle cx="764" cy="268" r="6" fill="#8FCCB2" stroke="#FFF" strokeWidth="3" />

            {methods.map((method) => (
                <g key={method.name}>
                    <rect x="45" y={method.y} width="260" height="52" rx="17" fill="#FFF" stroke="#E8E0EF" strokeWidth="1.5" filter="url(#architecture-shadow)" />
                    <rect x="58" y={method.y + 9} width="35" height="35" rx="11" fill={method.color} />
                    <text x="75.5" y={method.y + 32} textAnchor="middle" fill={method.ink} fontSize={method.mark === 'QR' ? '11' : '18'} fontWeight="900">{method.mark}</text>
                    <text x="107" y={method.y + 32} fill="#323046" fontSize="16" fontWeight="800">{method.name}</text>
                </g>
            ))}

            <rect x="428" y="132" width="271" height="272" rx="29" fill="url(#architecture-core)" stroke="#D9C2F3" strokeWidth="2" filter="url(#architecture-shadow)" />
            <rect x="445" y="148" width="237" height="78" rx="21" fill="#FFF" fillOpacity="0.88" stroke="#F0E5F3" />
            <image href="/wordmark.svg" x="485" y="153" width="156" height="50" preserveAspectRatio="xMidYMid meet" />
            <text x="564" y="214" textAnchor="middle" fill="#806A94" fontSize="12" fontWeight="800">One place for sign-in</text>
            {[
                { label: 'One user identity', y: 243, color: '#F7D2E0', dot: '#DC759D' },
                { label: 'Workspace access rules', y: 287, color: '#E8D8FF', dot: '#A574DC' },
                { label: 'Sessions + OIDC', y: 331, color: '#D7F3E6', dot: '#66B995' },
            ].map((item) => (
                <g key={item.label}>
                    <rect x="446" y={item.y} width="235" height="36" rx="12" fill="#FFF" fillOpacity="0.82" />
                    <circle cx="466" cy={item.y + 18} r="8" fill={item.color} />
                    <circle cx="466" cy={item.y + 18} r="3.5" fill={item.dot} />
                    <text x="486" y={item.y + 23} fill="#49415D" fontSize="14" fontWeight="800">{item.label}</text>
                </g>
            ))}
            <text x="564" y="388" textAnchor="middle" fill="#9B86AD" fontSize="11" fontWeight="800" letterSpacing="1.2">SELF-HOSTED · OPEN SOURCE</text>

            {apps.map((app) => (
                <g key={app.name}>
                    <rect x="820" y={app.y} width="260" height="64" rx="19" fill="#FFF" stroke="#D7EEE3" strokeWidth="1.5" filter="url(#architecture-shadow)" />
                    <rect x="834" y={app.y + 13} width="37" height="37" rx="11" fill="#E0F6EA" />
                    <rect x="844" y={app.y + 22} width="17" height="15" rx="3" fill="none" stroke="#429C78" strokeWidth="2" />
                    <path d={`M844 ${app.y + 26} H861`} stroke="#429C78" strokeWidth="2" />
                    <text x="883" y={app.y + 29} fill="#323046" fontSize="15" fontWeight="900">{app.name}</text>
                    <text x="883" y={app.y + 47} fill="#7E8190" fontSize="12" fontWeight="700">{app.detail}</text>
                </g>
            ))}
            <text x="950" y="429" textAnchor="middle" fill="#689981" fontSize="12" fontWeight="800">Your apps keep their own sessions</text>
        </svg>
    )
}

function MobileGraph()
{
    return (
        <div className="lg:hidden rounded-[2rem] border-2 border-purple-100 bg-gradient-to-br from-pink-50 via-purple-50 to-emerald-50 p-5 shadow-sm"
            aria-label="Sign-in methods connect through Rooiam to your applications">
            <p className="mb-3 text-center text-xs font-black uppercase tracking-widest text-pink-500">How people sign in</p>
            <div className="grid grid-cols-2 gap-2">
                {methods.map((method) => (
                    <div key={method.name} className="flex min-h-12 items-center gap-2 rounded-2xl border border-purple-100 bg-white px-3 py-2 shadow-sm">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black"
                            style={{ background: method.color, color: method.ink }}>{method.mark}</span>
                        <span className="text-xs font-extrabold text-gray-700">{method.name}</span>
                    </div>
                ))}
            </div>
            <div aria-hidden="true" className="mx-auto my-3 h-8 w-px bg-purple-300 relative after:absolute after:-bottom-0.5 after:-left-[3px] after:h-2 after:w-2 after:rotate-45 after:border-b-2 after:border-r-2 after:border-purple-400" />
            <div className="rounded-3xl border-2 border-purple-200 bg-white/90 p-5 text-center shadow-lg shadow-purple-100">
                <img src="/wordmark.svg" alt="Rooiam" className="mx-auto h-10 w-auto" />
                <p className="mt-3 text-sm font-extrabold text-gray-700">One identity · Workspace rules · OIDC</p>
            </div>
            <div aria-hidden="true" className="mx-auto my-3 h-8 w-px bg-emerald-300 relative after:absolute after:-bottom-0.5 after:-left-[3px] after:h-2 after:w-2 after:rotate-45 after:border-b-2 after:border-r-2 after:border-emerald-400" />
            <p className="mb-3 text-center text-xs font-black uppercase tracking-widest text-emerald-600">Your applications</p>
            <div className="grid gap-2 sm:grid-cols-3">
                {apps.map((app) => (
                    <div key={app.name} className="rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-center text-sm font-extrabold text-gray-700 shadow-sm">{app.name}</div>
                ))}
            </div>
        </div>
    )
}

export default function ArchitectureGraph()
{
    return (
        <section aria-labelledby="architecture-heading" className="px-6 py-20 md:px-12 lg:px-20">
            <div className="mx-auto max-w-6xl">
                <div className="mx-auto mb-10 max-w-2xl text-center">
                    <p className="mb-3 text-xs font-black uppercase tracking-widest" style={{ color: '#c96b8a' }}>How Rooiam fits</p>
                    <h2 id="architecture-heading" className="mb-4 text-4xl font-black text-gray-800 md:text-5xl">
                        Many ways to sign in.<br /><span style={{ color: '#8d78ae' }}>One identity layer.</span>
                    </h2>
                    <p className="text-base font-semibold leading-relaxed text-gray-500">
                        Your users choose a sign-in method. Rooiam verifies them, applies workspace rules, and connects to your apps.
                    </p>
                </div>
                <DesktopGraph />
                <MobileGraph />
                <p className="mx-auto mt-5 max-w-2xl text-center text-sm font-semibold text-gray-500">
                    Your product keeps its own users, roles, and sessions. Rooiam handles sign-in and identity.
                </p>
            </div>
        </section>
    )
}
