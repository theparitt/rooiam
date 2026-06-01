import { useState } from 'react'
import { DEMO_ADMIN_URL, DEMO_PORTAL_URL, DEMO_APP_URL } from '../lib/site'

const demos = [
    {
        role: 'Platform Operator',
        description: 'Manage tenants, API keys, audit logs, and system settings across your entire platform.',
        url: DEMO_ADMIN_URL,
        screenshot: '/screenshots/admin.png',
        accent: '#A07BFF',
        accentBg: '#F3EEFF',
        label: 'Admin Console',
    },
    {
        role: 'Tenant Admin',
        description: 'Configure workspace branding, members, auth methods, and OIDC clients.',
        url: DEMO_PORTAL_URL,
        screenshot: '/screenshots/app.png',
        accent: '#FF7BAC',
        accentBg: '#FFF0F5',
        label: 'Tenant Portal',
    },
    {
        role: 'End User',
        description: 'The login and auth flow your users see — magic link, passkey, MFA, and more.',
        url: DEMO_APP_URL,
        screenshot: '/screenshots/enduser.png',
        accent: '#3BB87F',
        accentBg: '#EDFAF3',
        label: 'User Login Flow',
    },
]

export default function DemoShowcase()
{
    const [lightbox, setLightbox] = useState<string | null>(null)

    return (
        <>
            <section className="px-6 md:px-12 lg:px-20 py-20">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-14">
                        <p className="text-sm font-black uppercase tracking-widest mb-3" style={{ color: '#A07BFF' }}>
                            Live Demos
                        </p>
                        <h2 className="text-3xl md:text-4xl font-black text-gray-900 mb-4">
                            See it from every angle
                        </h2>
                        <p className="text-base font-semibold text-gray-400 max-w-xl mx-auto">
                            One platform, three roles. Each demo is live and interactive — no sign-up required.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {demos.map(demo => (
                            <div key={demo.role} className="rounded-3xl overflow-hidden border flex flex-col"
                                style={{ borderColor: `${demo.accent}33`, background: '#fff' }}>

                                {/* Screenshot */}
                                <div
                                    className="relative w-full overflow-hidden cursor-zoom-in"
                                    style={{ aspectRatio: '16/10', background: demo.accentBg }}
                                    onClick={() => setLightbox(demo.screenshot)}
                                >
                                    <img
                                        src={demo.screenshot}
                                        alt={`${demo.label} screenshot`}
                                        className="w-full h-full object-cover object-top transition-transform duration-300 hover:scale-105"
                                    />
                                </div>

                                {/* Card body */}
                                <div className="flex flex-col flex-1 p-6">
                                    <span className="text-xs font-black uppercase tracking-widest mb-2"
                                        style={{ color: demo.accent }}>
                                        {demo.role}
                                    </span>
                                    <h3 className="text-lg font-black text-gray-900 mb-2">{demo.label}</h3>
                                    <p className="text-sm font-semibold text-gray-400 flex-1 leading-relaxed mb-5">
                                        {demo.description}
                                    </p>
                                    <a href={demo.url} target="_blank" rel="noreferrer"
                                        className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-black transition-all hover:scale-[1.03]"
                                        style={{ background: demo.accentBg, color: demo.accent }}>
                                        Try Demo →
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 rounded-3xl border px-6 py-5 text-left"
                        style={{ borderColor: '#FFD080', background: '#FFF8E8' }}>
                        <p className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: '#b7791f' }}>
                            Demo Warning
                        </p>
                        <p className="text-sm font-semibold text-gray-600 leading-relaxed">
                            Do not use the same browser session for both the demo admin and the demo portal at the same time.
                            Their demo cookies can conflict.
                            Log out first, or use a different browser or private window if you want to keep both open.
                        </p>
                    </div>
                </div>
            </section>

            {/* Lightbox */}
            {lightbox && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-6 cursor-zoom-out"
                    style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)' }}
                    onClick={() => setLightbox(null)}
                >
                    <img
                        src={lightbox}
                        alt="Screenshot enlarged"
                        className="max-w-full max-h-full rounded-2xl shadow-2xl"
                        style={{ maxWidth: '90vw', maxHeight: '90vh' }}
                        onClick={e => e.stopPropagation()}
                    />
                </div>
            )}
        </>
    )
}
