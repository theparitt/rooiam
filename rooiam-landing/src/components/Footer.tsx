import {
    DEMO_APP_URL,
    DOCS_DEMO_URL,
    DOCS_DEVELOPERS_URL,
    DOCS_DEVELOPMENT_URL,
    DOCS_HOME_URL,
    DOCS_PRODUCTION_URL,
} from '../lib/site'

export default function Footer()
{
    return (
        <footer className="px-6 md:px-12 lg:px-20 py-16" style={{ borderTop: '1px solid #FFE8F0', background: '#FFF8FC' }}>
            <div className="max-w-6xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between gap-10">
                    {/* Brand */}
                    <div className="max-w-xs">
                        <a href="/" className="inline-block mb-4">
                            <img src="/wordmark.svg" alt="Rooiam" className="h-9 w-auto" style={{ maxWidth: '150px' }} />
                        </a>
                        <p className="text-sm font-semibold text-gray-400 leading-relaxed">
                            Open-source identity infrastructure for multi-product ecosystems. Rust backend, React frontends, Postgres as source of truth.
                        </p>
                    </div>

                    {/* Links */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-8 text-sm">
                        <div>
                            <h4 className="font-black text-gray-700 mb-4">Product</h4>
                            <ul className="space-y-2.5">
                                <li><a href="/#features" className="font-semibold text-gray-400 hover:text-gray-700 transition-colors">Features</a></li>
                                <li><a href="/#pricing" className="font-semibold text-gray-400 hover:text-gray-700 transition-colors">Pricing</a></li>
                                <li><a href={DOCS_PRODUCTION_URL} className="font-semibold text-gray-400 hover:text-gray-700 transition-colors">Self-Host</a></li>
                                <li><a href={DEMO_APP_URL} className="font-semibold text-gray-400 hover:text-gray-700 transition-colors">Live Demo</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-black text-gray-700 mb-4">Developers</h4>
                            <ul className="space-y-2.5">
                                <li><a href={DOCS_HOME_URL} className="font-semibold text-gray-400 hover:text-gray-700 transition-colors">Docs</a></li>
<li><a href={DOCS_DEVELOPERS_URL} className="font-semibold text-gray-400 hover:text-gray-700 transition-colors">API & Embed</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-black text-gray-700 mb-4">Resources</h4>
                            <ul className="space-y-2.5">
                                <li><a href={DOCS_DEVELOPMENT_URL} className="font-semibold text-gray-400 hover:text-gray-700 transition-colors">Local Setup</a></li>
                                <li><a href={DOCS_PRODUCTION_URL} className="font-semibold text-gray-400 hover:text-gray-700 transition-colors">Production</a></li>
                                <li><a href={DOCS_DEMO_URL} className="font-semibold text-gray-400 hover:text-gray-700 transition-colors">Demo Guide</a></li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="mt-12 pt-6 border-t border-pink-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-gray-400">
                        © 2026 Rooiam. Built for teams that want to own their identity model.
                    </p>
                    <p className="text-xs font-semibold text-gray-400">
                        Open Source · AGPL v3 · Rust + React + Postgres
                    </p>
                </div>
            </div>
        </footer>
    )
}
