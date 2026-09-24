import { ArrowRight, BookOpen } from 'lucide-react'
import { DOCS_GETTING_STARTED_URL, DEMO_APP_URL } from '../lib/site'

export default function Hero() {
    return (
        <section className="overflow-hidden bg-gradient-to-br from-[#fff8fc] via-white to-[#f4f0ff] px-6 py-12 md:px-12 md:py-20 lg:px-20">
            <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-14">
                <div className="order-2 lg:order-1">
                    <span className="inline-flex rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-rose-700">
                        Self-hosted · Open source
                    </span>
                    <h1 className="mt-6 text-4xl font-black leading-[1.08] text-gray-900 sm:text-5xl">
                        Sign-in for<br />
                        <span className="bg-gradient-to-r from-[#ef719b] to-[#a77ce8] bg-clip-text text-transparent">every workspace.</span>
                    </h1>
                    <p className="mt-5 max-w-md text-base font-semibold leading-relaxed text-gray-600 md:text-lg">
                        Passwordless login, workspace controls, and OIDC for your SaaS. Run it on your own infrastructure.
                    </p>
                    <div className="mt-8 flex flex-wrap gap-3">
                        <a href={DEMO_APP_URL} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-2xl bg-[#2a243e] px-6 py-3.5 text-sm font-black text-white shadow-lg transition-transform hover:-translate-y-0.5">
                            See the demo <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </a>
                        <a href={DOCS_GETTING_STARTED_URL}
                            className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-white px-6 py-3.5 text-sm font-black text-violet-800 hover:bg-violet-50">
                            <BookOpen className="h-4 w-4" aria-hidden="true" /> Get started
                        </a>
                    </div>
                    <a href="#phone-sign-in" className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-violet-700 hover:text-violet-900">
                        Android phone sign-in · preview <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </a>
                </div>

                <div className="order-1 lg:order-2">
                    <a href={DEMO_APP_URL} target="_blank" rel="noreferrer" aria-label="Open the Rooiam workspace login demo"
                        className="group relative block rounded-[2rem] border border-[#e7d6ee] bg-gradient-to-br from-[#ffe4ee] via-[#ecfff8] to-[#e9e4ff] p-3 shadow-[0_30px_80px_-45px_rgba(65,38,100,0.55)] transition-transform hover:-translate-y-1 sm:p-5">
                        <div className="relative aspect-[5/4] overflow-hidden rounded-2xl border border-white/80 bg-[#ecf9f6] shadow-md">
                            <img src="/screenshots/enduser.png"
                                alt="MintMallow workspace login in the Rooiam demo"
                                className="absolute left-1/2 top-1/2 w-[170%] max-w-none -translate-x-1/2 -translate-y-1/2"
                                fetchPriority="high" />
                        </div>
                        <img src="/logo.png" alt="" aria-hidden="true"
                            className="absolute -bottom-5 -left-4 h-16 w-16 rounded-full border-4 border-white bg-[#fee3d0] shadow-lg sm:h-20 sm:w-20" />
                    </a>
                    <p className="mt-7 text-center text-xs font-semibold text-gray-500">
                        A workspace login from the current Rooiam demo
                    </p>
                </div>
            </div>
        </section>
    )
}
