import { BookOpen, Copy, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DOCS_GETTING_STARTED_URL, DOCS_ROADMAP_URL, DEMO_APP_URL, GITHUB_REPO_URL } from '../lib/site'

const dockerSnippet = `git clone ${GITHUB_REPO_URL}\ncd rooiam\n# Create .env.docker.local.demo from the Quick Start guide\ndocker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo up -d`

export default function Hero()
{
    const [copied, setCopied] = useState(false)

    useEffect(() =>
    {
        if (!copied) return
        const timeout = window.setTimeout(() => setCopied(false), 1600)
        return () => window.clearTimeout(timeout)
    }, [copied])

    async function copySnippet()
    {
        await navigator.clipboard.writeText(dockerSnippet)
        setCopied(true)
    }

    return (
        <section className="relative overflow-hidden px-6 md:px-12 lg:px-20 pt-16 pb-12 min-h-[92vh] flex flex-col justify-center">
            {/* Background blobs */}
            <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full blur-3xl opacity-30 pointer-events-none"
                style={{ background: 'radial-gradient(circle, #FFB5C8, #D5B7FF)' }} />
            <div className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full blur-3xl opacity-20 pointer-events-none"
                style={{ background: 'radial-gradient(circle, #B5D5FF, #B5EFD5)' }} />

            <div className="relative z-10 max-w-5xl mx-auto w-full">
                {/* Badge */}
                <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full mb-5 border"
                    style={{ background: '#F0FFF8', borderColor: '#90DDB5' }}>
                    <span className="text-sm font-black text-gray-700">Open Source · Apache 2.0 · Free Forever</span>
                </div>

                <h1 className="text-3xl md:text-5xl font-black text-gray-900 leading-[1.08] mb-6">
                    The self-hosted passwordless IAM<br />
                    <span style={{
                        background: 'linear-gradient(135deg, #FF7BAC, #A07BFF)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}>for multi-tenant SaaS.</span><br />
                    <span className="text-2xl md:text-3xl font-bold text-gray-500">Hosted login, workspace access, and OIDC you run yourself.</span>
                </h1>

                <p className="text-lg font-semibold text-gray-400 max-w-2xl mb-10 leading-relaxed">
                    Rooiam is built for SaaS teams that need one identity system for many customer workspaces.
                    It already gives you hosted login, workspace access control, admin surfaces, and OIDC.
                    Self-host it, inspect it, and keep control of your auth stack.
                </p>

                <div className="flex flex-wrap gap-4 mb-12">
                    <a href={DOCS_GETTING_STARTED_URL}
                        className="flex items-center gap-2.5 px-7 py-4 rounded-2xl font-black text-base shadow-xl hover:scale-[1.03] transition-all"
                        style={{ background: 'linear-gradient(135deg, #FFB5C8 0%, #D5B7FF 100%)', color: '#5a2d3f' }}>
                        <BookOpen className="w-5 h-5" /> Get Started
                    </a>
                    <a href={DEMO_APP_URL} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2.5 px-7 py-4 rounded-2xl font-black text-base border-2 border-gray-200 hover:bg-gray-50 hover:scale-[1.03] transition-all text-gray-700">
                        Try the Live Demo →
                    </a>
                </div>

                <a href={DOCS_ROADMAP_URL}
                    className="block max-w-2xl rounded-2xl border border-purple-200 bg-purple-50 p-5 mb-8 hover:bg-purple-100 transition-colors">
                    <span className="text-xs font-black uppercase tracking-widest text-purple-700">Next milestone · 0.2 in development</span>
                    <span className="block mt-2 text-xl font-black text-gray-800">Scan. Match. Approve.</span>
                    <span className="block mt-2 text-sm font-semibold text-gray-600">
                        Our next goal: scan a browser QR code, verify the number, and approve sign-in from your trusted Android phone.
                        The server foundation exists; the complete mobile experience is planned.
                    </span>
                    <span className="block mt-3 text-sm font-bold text-purple-700">Read the 0.2 goals →</span>
                </a>

                {/* Docker snippet */}
                <div className="rounded-2xl overflow-hidden shadow-lg max-w-2xl"
                    style={{ background: '#1a1a2e' }}>
                    <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ background: '#111122' }}>
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-red-400" />
                            <div className="w-3 h-3 rounded-full bg-yellow-400" />
                            <div className="w-3 h-3 rounded-full bg-green-400" />
                            <span className="ml-2 text-xs font-bold text-gray-400">Quick Start — Docker</span>
                        </div>
                        <button
                            type="button"
                            onClick={copySnippet}
                            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-gray-200 transition-all hover:bg-white/10"
                        >
                            {copied ? <Check className="h-3.5 w-3.5 text-green-300" /> : <Copy className="h-3.5 w-3.5" />}
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                    <div className="p-5 font-mono text-sm space-y-2">
                        <div className="flex items-center gap-3">
                            <span className="text-pink-400 select-none">$</span>
                            <span className="text-green-300">git clone {GITHUB_REPO_URL}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-pink-400 select-none">$</span>
                            <span className="text-green-300">cd rooiam</span>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="text-pink-400 select-none">$</span>
                            <span className="text-gray-400"># Create .env.docker.local.demo from the Quick Start guide</span>
                        </div>
                        <div className="flex items-start gap-3">
                            <span className="text-pink-400 select-none">$</span>
                            <span className="text-green-300 break-all">docker compose -f docker-compose.demo.yml --env-file .env.docker.local.demo up -d</span>
                        </div>
                        <div className="mt-3 space-y-1 pl-1">
                            <div className="text-xs" style={{ color: '#90DDB5' }}>✓  Demo API    → http://localhost:5180</div>
                            <div className="text-xs" style={{ color: '#90DDB5' }}>✓  Mailhog     → http://localhost:8026</div>
                            <div className="text-xs" style={{ color: '#90DDB5' }}>✓  MinIO       → http://localhost:19001</div>
                        </div>
                    </div>
                </div>

                <p className="mt-4 text-xs font-semibold text-gray-400">
                    Requires Docker and the local demo env file from the setup guide. Frontends run separately. No host Rust toolchain is needed.
                    Rooiam is early-stage and best for evaluation, internal use, and early adopters today.
                </p>
            </div>
        </section>
    )
}
