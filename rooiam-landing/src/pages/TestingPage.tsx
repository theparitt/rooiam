import { useEffect } from 'react'
import { ArrowRight, Check, CircleAlert, ExternalLink, FlaskConical, Info } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { DOCS_BASE_URL, GITHUB_REPO_URL } from '../lib/site'

const conformanceGuide = `${DOCS_BASE_URL}/reference/compatibility-and-conformance`
const testingGuide = `${DOCS_BASE_URL}/production/openid-conformance-checks`
const sourceRevision = `${GITHUB_REPO_URL}/commit/752bf3e`

function StatusPill({ status }: { status: 'passed' | 'not-passed' }) {
    const passed = status === 'passed'
    return (
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black ${passed
            ? 'bg-[#e2f7ec] text-[#196c4a]'
            : 'bg-[#fff0e4] text-[#9b4b20]'}`}>
            {passed ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <CircleAlert className="h-3.5 w-3.5" />}
            {passed ? 'Passed' : 'Not passed'}
        </span>
    )
}

export default function TestingPage() {
    useEffect(() => {
        const previousTitle = document.title
        document.title = 'Testing status | Rooiam'
        return () => { document.title = previousTitle }
    }, [])

    return (
        <div className="min-h-screen bg-[#fffbfd] text-[#29243b]">
            <Navbar />
            <main className="mx-auto max-w-6xl px-6 pb-24 pt-12 md:px-12 md:pt-16">
                <header className="max-w-4xl">
                    <div className="flex flex-wrap items-center gap-3 text-xs font-black uppercase tracking-[0.16em] text-violet-700">
                        <span>Testing status</span>
                        <span className="h-1 w-1 rounded-full bg-violet-300" aria-hidden="true" />
                        <time dateTime="2026-09-25">Updated 25 September 2026</time>
                    </div>
                    <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-5xl">What passes. What still needs work.</h1>
                    <p className="mt-4 max-w-2xl text-base font-semibold leading-relaxed text-[#635b72] sm:text-lg">
                        OpenID coverage is partial: Config OP passed, Basic OP did not. Rooiam is not OpenID-certified. These results describe isolated source builds, not the live service.
                    </p>
                </header>

                <section aria-label="Results at a glance" className="mt-9 grid gap-3 md:grid-cols-3">
                    <div className="rounded-[1.5rem] border border-[#ccebdc] bg-[#effbf5] p-5">
                        <div className="flex items-center justify-between gap-3"><span className="text-xs font-black uppercase tracking-wider text-[#41785d]">OpenID suite 5.3.1</span><span className="text-lg" aria-hidden="true">✓</span></div>
                        <p className="mt-2 text-2xl font-black">Config OP</p>
                        <p className="mt-1 text-sm font-bold text-[#196c4a]">Passed · 35 checks</p>
                    </div>
                    <div className="rounded-[1.5rem] border border-[#f1d6bf] bg-[#fff7ee] p-5">
                        <div className="flex items-center justify-between gap-3"><span className="text-xs font-black uppercase tracking-wider text-[#9b6545]">OpenID suite 5.3.1</span><CircleAlert className="h-5 w-5 text-[#b76a34]" aria-hidden="true" /></div>
                        <p className="mt-2 text-2xl font-black">Basic OP</p>
                        <p className="mt-1 text-sm font-bold text-[#9b4b20]">Not passed · 17 failed of 35*</p>
                    </div>
                    <div className="rounded-[1.5rem] border border-[#e5d8f8] bg-[#f6f0ff] p-5">
                        <div className="flex items-center justify-between gap-3"><span className="text-xs font-black uppercase tracking-wider text-violet-700">Rooiam source tests</span><FlaskConical className="h-5 w-5 text-violet-600" aria-hidden="true" /></div>
                        <p className="mt-2 text-2xl font-black">OIDC regression</p>
                        <p className="mt-1 text-sm font-bold text-violet-700">Passed · 11 of 11</p>
                    </div>
                </section>

                <p className="mt-3 text-sm font-semibold text-[#70677c]">
                    * The other 18 Basic OP modules were 3 awaiting review, 3 skipped, and 12 without a verdict. None is counted as passed.
                </p>

                <section aria-labelledby="openid-title" className="mt-14">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.17em] text-violet-700">Independent suite</p>
                            <h2 id="openid-title" className="mt-2 text-2xl font-black sm:text-3xl">OpenID Foundation</h2>
                        </div>
                        <p className="rounded-full border border-[#e8daed] bg-white px-4 py-2 text-xs font-bold text-[#645876]">Conformance Suite 5.3.1 · isolated candidate</p>
                    </div>
                    <div className="mt-5 grid gap-5 lg:grid-cols-2">
                        <article className="rounded-[1.75rem] border border-[#e8daed] bg-white p-6 shadow-[0_18px_55px_-45px_rgba(80,47,105,0.35)] sm:p-7">
                            <div className="flex items-start justify-between gap-3"><h3 className="text-xl font-black">Config OP</h3><StatusPill status="passed" /></div>
                            <p className="mt-2 text-sm font-semibold leading-relaxed text-[#635b72]">Discovery and signing-key metadata passed all 35 checks on a temporary HTTPS issuer.</p>
                            <div className="mt-5 border-t border-[#f0e8f3] pt-4 text-xs font-bold text-[#756b82]">Tested 24 Sep 2026 · source <code className="rounded bg-[#f7f2fb] px-1.5 py-0.5">81068f4</code></div>
                        </article>
                        <article className="rounded-[1.75rem] border border-[#e8daed] bg-white p-6 shadow-[0_18px_55px_-45px_rgba(80,47,105,0.35)] sm:p-7">
                            <div className="flex items-start justify-between gap-3"><h3 className="text-xl font-black">Basic OP</h3><StatusPill status="not-passed" /></div>
                            <p className="mt-2 text-sm font-semibold leading-relaxed text-[#635b72]">17 failed · 3 review* · 3 skipped · 12 no verdict. A direct sign-in request cannot yet continue through Rooiam’s hosted login; the POST authorization route is also missing.</p>
                            <div className="mt-5 border-t border-[#f0e8f3] pt-4 text-xs font-bold text-[#756b82]">Tested 25 Sep 2026 · source <code className="rounded bg-[#f7f2fb] px-1.5 py-0.5">860fcb0</code> · Strict PKCE</div>
                        </article>
                    </div>
                    <p className="mt-4 flex items-start gap-2 rounded-2xl border border-[#e9dff0] bg-[#fbf7ff] px-4 py-3 text-sm font-semibold leading-relaxed text-[#665978]">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
                        <span><strong>* Review is not a pass.</strong> These runs used different candidate revisions. The optional PKCE mode was added later and has not been run through Basic OP; Rooiam is not OpenID-certified.</span>
                    </p>
                </section>

                <section aria-labelledby="local-title" className="mt-12">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.17em] text-violet-700">Project test suite</p>
                        <h2 id="local-title" className="mt-2 text-2xl font-black sm:text-3xl">Rooiam OIDC checks</h2>
                    </div>
                    <div className="mt-5 flex flex-col gap-5 rounded-[1.75rem] border border-[#e8daed] bg-white p-6 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
                        <div className="max-w-2xl">
                            <div className="flex flex-wrap items-center gap-3"><StatusPill status="passed" /><span className="text-sm font-black">11 / 11 tests</span></div>
                            <p className="mt-3 text-sm font-semibold leading-relaxed text-[#635b72]">Local tests cover OIDC client authentication, callback handling, signing keys, and the new PKCE policy. They do not replace an independent OpenID Foundation result.</p>
                        </div>
                        <div className="shrink-0 text-sm font-bold text-[#756b82]">25 Sep 2026<br /><a href={sourceRevision} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-violet-700 hover:text-violet-900">Source 752bf3e <ExternalLink className="h-3.5 w-3.5" /></a></div>
                    </div>
                </section>

                <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm font-black text-violet-700">
                    <a href={conformanceGuide} className="inline-flex items-center gap-1.5 hover:text-violet-900">Read the compatibility status <ArrowRight className="h-4 w-4" /></a>
                    <a href={testingGuide} className="inline-flex items-center gap-1.5 hover:text-violet-900">How we run the OpenID suite <ArrowRight className="h-4 w-4" /></a>
                </div>
            </main>
            <Footer />
        </div>
    )
}
