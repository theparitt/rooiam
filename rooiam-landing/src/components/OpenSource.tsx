import { Github, Heart, GitPullRequest, Star } from 'lucide-react'
import { DOCS_HOME_URL, GITHUB_REPO_URL } from '../lib/site'

const perks = [
    { icon: <Github className="w-5 h-5" />, title: 'Source First', desc: 'The current release path is source-based, with docs and code living side by side.' },
    { icon: <Star className="w-5 h-5" />, title: 'Apache 2.0 License', desc: 'Use it freely in any project, commercial or open — permissive with patent protection.' },
    { icon: <GitPullRequest className="w-5 h-5" />, title: 'Contributions Welcome', desc: 'Bug fixes, feature work, and documentation changes are all fair game.' },
    { icon: <Heart className="w-5 h-5" />, title: 'Self-Host Friendly', desc: 'Postgres, Redis, Rust server, and frontends you can run locally without hidden hosted dependencies.' },
]

export default function OpenSource()
{
    return (
        <section className="px-6 md:px-12 lg:px-20 py-20">
            <div className="max-w-5xl mx-auto">
                {/* Main card */}
                <div className="rounded-4xl overflow-hidden border-2 shadow-xl"
                    style={{ borderColor: '#B5EFD5', background: 'linear-gradient(135deg, #F0FFF8 0%, #F8F0FF 100%)' }}>
                    <div className="p-10 md:p-14">
                        <div className="flex flex-col md:flex-row gap-10 items-start">
                            {/* Left */}
                            <div className="flex-1">
                                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gray-900 text-white text-xs font-black mb-6">
                                    <Github className="w-3.5 h-3.5" /> Open Source · Apache 2.0
                                </div>
                                <h2 className="text-4xl md:text-5xl font-black text-gray-800 mb-4 leading-tight">
                                    Own your SaaS<br />identity stack.
                                </h2>
                                <p className="text-base font-semibold text-gray-500 leading-relaxed mb-8">
                                    Rooiam is for teams that need self-hosted passwordless IAM for many customer workspaces.
                                    Inspect the code, run the stack yourself, and keep control of hosted login, workspace access, and app integration.
                                    Today it is strongest for evaluation, internal use, and early adopters that want control over convenience SaaS auth products.
                                </p>
                                <div className="flex flex-wrap gap-3">
                                    <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer"
                                        className="flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-sm bg-gray-900 text-white hover:bg-gray-700 transition-all hover:scale-[1.02]">
                                        <Github className="w-4 h-4" /> View on GitHub
                                    </a>
                                    <a href={DOCS_HOME_URL}
                                        className="flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-sm border-2 border-gray-200 hover:bg-white text-gray-700 transition-all">
                                        Read the Docs →
                                    </a>
                                </div>
                            </div>

                            {/* Right — perks grid */}
                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {perks.map((p) => (
                                    <div key={p.title}
                                        className="rounded-3xl p-5 bg-white/70 border border-white/80 backdrop-blur-sm">
                                        <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                                            style={{ background: '#B5EFD5', color: '#2d7a55' }}>
                                            {p.icon}
                                        </div>
                                        <h4 className="font-black text-sm text-gray-800 mb-1">{p.title}</h4>
                                        <p className="text-xs font-semibold text-gray-500 leading-relaxed">{p.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Bottom bar */}
                    <div className="px-10 md:px-14 py-5 border-t"
                        style={{ background: 'rgba(255,255,255,0.4)', borderColor: '#B5EFD5' }}>
                        <div className="flex flex-wrap items-center justify-between gap-4">
                            <p className="text-sm font-bold text-gray-500">
                                Built with <span className="text-orange-500">Rust 🦀</span> ·
                                React frontend · PostgreSQL + Redis · Apache 2.0 Licensed
                            </p>
                            <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer"
                                className="text-sm font-black text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-1.5">
                                <Star className="w-4 h-4 text-yellow-400" /> Leave us a star
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}
