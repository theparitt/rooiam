import { Check, Smartphone, Calendar } from 'lucide-react'
import { DOCS_ROADMAP_URL } from '../lib/site'

type Item = { text: string; note?: string }

const done: Item[] = [
    { text: 'Passwordless sign-in with magic links, passkeys and social login' },
    { text: 'Workspace branding, access policies and MFA' },
    { text: 'App integration with OIDC and TypeScript SDKs' },
    { text: 'Self-hosting with Docker' },
    { text: 'Android phone sign-in', note: 'preview' },
]

const nextRelease: Item[] = [
    { text: 'Confirm sensitive workspace changes from your phone', note: 'starting with API-key creation' },
    { text: 'Let each workspace choose when approval is required' },
]

const planned: Item[] = [
    { text: 'Easier OIDC and SDK integration' },
    { text: 'Phone approval on iOS' },
    { text: 'Safer account recovery and device replacement' },
]

const columns = [
    {
        label: 'Available today',
        version: '0.2 · preview',
        color: '#B5EFD5',
        border: '#90DDB5',
        iconColor: '#2a8a5a',
        items: done,
        icon: <Check className="w-3.5 h-3.5" />,
    },
    {
        label: 'Up next',
        version: '0.3 · planned',
        color: '#B5D5FF',
        border: '#7aadff',
        iconColor: '#2255bb',
        items: nextRelease,
        icon: <Smartphone className="w-3.5 h-3.5" />,
    },
    {
        label: 'Looking ahead',
        version: 'exploring',
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
                        Android phone sign-in is in preview. Next, 0.3 will let workspace admins confirm sensitive changes from their phone.
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
                    <a href={DOCS_ROADMAP_URL}
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-sm border-2 hover:bg-white transition-all"
                        style={{ borderColor: '#B5D5FF', color: '#2255bb' }}>
                        Explore the roadmap →
                    </a>
                </div>
            </div>
        </section>
    )
}
