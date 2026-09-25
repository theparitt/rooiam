import { useEffect } from 'react'
import { ArrowRight, Check, CircleAlert, Clock3, HelpCircle, Minus, SearchX } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { DOCS_BASE_URL, GITHUB_REPO_URL } from '../lib/site'

const conformanceGuide = `${DOCS_BASE_URL}/reference/compatibility-and-conformance`
const testingGuide = `${DOCS_BASE_URL}/production/openid-conformance-checks`

type Result = 'passed' | 'not-passed' | 'blocked' | 'no-verdict' | 'review' | 'skipped' | 'not-tested'

const resultStyle: Record<Result, { label: string; className: string; icon: typeof Check }> = {
    passed: { label: 'Passed', className: 'bg-[#e2f7ec] text-[#196c4a]', icon: Check },
    'not-passed': { label: 'Not passed', className: 'bg-[#ffece6] text-[#a13f38]', icon: CircleAlert },
    blocked: { label: 'Blocked', className: 'bg-[#fff2e4] text-[#985317]', icon: CircleAlert },
    'no-verdict': { label: 'No verdict', className: 'bg-[#fff2e4] text-[#985317]', icon: HelpCircle },
    review: { label: 'Review', className: 'bg-[#f2ebff] text-[#6341a2]', icon: HelpCircle },
    skipped: { label: 'Skipped', className: 'bg-[#f0f0f4] text-[#5b5968]', icon: Minus },
    'not-tested': { label: 'Not tested', className: 'bg-[#edf1f8] text-[#455b7b]', icon: SearchX },
}

function ResultBadge({ result }: { result: Result }) {
    const { label, className, icon: Icon } = resultStyle[result]
    return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-black ${className}`}>
        <Icon className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />{label}
    </span>
}

const suiteRows: { suite: string; topic: string; result: Result; detail: string; run: string; revision: string }[] = [
    {
        suite: 'OpenID Foundation 5.3.1', topic: 'Config OP', result: 'passed',
        detail: '35 / 35 discovery and signing-key checks.', run: '24 Sep 2026', revision: '81068f4',
    },
    {
        suite: 'OpenID Foundation 5.3.1', topic: 'Basic OP', result: 'not-passed',
        detail: '17 failed · 3 review · 3 skipped · 12 no verdict. None passed.', run: '25 Sep 2026', revision: '860fcb0',
    },
    {
        suite: 'Rooiam source tests', topic: 'OIDC regression', result: 'passed',
        detail: '11 / 11 local tests, including the new PKCE policy.', run: '25 Sep 2026', revision: '752bf3e',
    },
]

const topicRows: { topic: string; result: Result; detail: string }[] = [
    { topic: 'Discovery & signing keys', result: 'passed', detail: 'Config OP passed on an isolated HTTPS candidate.' },
    { topic: 'Basic browser sign-in', result: 'not-passed', detail: 'Strict PKCE rejects requests without S256; even with S256, a direct request cannot continue through hosted login.' },
    { topic: 'Token, UserInfo & refresh', result: 'blocked', detail: 'Many modules stopped at authorization. Their downstream behavior was not independently established by this suite run.' },
    { topic: 'POST authorization', result: 'no-verdict', detail: 'The suite did not reach a verdict; a direct POST to /v1/oidc/authorize returned 404 on the candidate.' },
    { topic: 'Error & redirect handling', result: 'review', detail: '3 modules need human review of screenshots. Review is not a pass.' },
    { topic: 'Optional address/phone scopes', result: 'skipped', detail: '3 modules skipped because these optional scopes were not advertised.' },
    { topic: 'Basic OP with optional PKCE', result: 'not-tested', detail: 'The official suite has not been rerun with confidential_optional. Local source tests do not count as an OpenID result.' },
    { topic: 'Live production conformance', result: 'not-tested', detail: 'These official suite results came from isolated candidates, not api.rooiam.com.' },
]

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
                    <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-5xl">Testing, at a glance.</h1>
                    <p className="mt-4 max-w-2xl text-base font-semibold leading-relaxed text-[#635b72] sm:text-lg">
                        OpenID coverage is partial: Config OP passed, Basic OP did not. Rooiam is not OpenID-certified.
                    </p>
                </header>

                <section aria-labelledby="suite-results" className="mt-9">
                    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.17em] text-violet-700">Results by test suite</p>
                            <h2 id="suite-results" className="mt-1 text-2xl font-black">The quick answer</h2>
                        </div>
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#756b82]"><Clock3 className="h-4 w-4" aria-hidden="true" /> Latest run: 25 Sep 2026</span>
                    </div>
                    <div className="overflow-x-auto rounded-[1.5rem] border border-[#e8daed] bg-white shadow-[0_18px_55px_-45px_rgba(80,47,105,0.35)]" tabIndex={0} role="region" aria-label="Test suite results; scroll horizontally for details">
                        <table className="w-full min-w-[800px] border-collapse text-left text-sm">
                            <thead className="bg-[#f8f1fb] text-xs font-black uppercase tracking-wider text-[#685b7c]">
                                <tr><th scope="col" className="w-36 px-5 py-4">Status</th><th scope="col" className="w-56 px-5 py-4">Test suite / topic</th><th scope="col" className="px-5 py-4">Result</th><th scope="col" className="w-36 px-5 py-4">Last run</th></tr>
                            </thead>
                            <tbody>
                                {suiteRows.map((row) => <tr key={row.topic} className="border-t border-[#f0e8f3] align-top">
                                    <td className="px-5 py-4"><ResultBadge result={row.result} /></td>
                                    <th scope="row" className="px-5 py-4 font-black"><span className="block text-xs font-bold text-[#81768d]">{row.suite}</span><span className="mt-1 block text-base">{row.topic}{row.topic === 'Basic OP' ? '*' : ''}</span></th>
                                    <td className="px-5 py-4 font-semibold leading-relaxed text-[#5c536c]">{row.detail}</td>
                                    <td className="px-5 py-4 text-xs font-bold text-[#756b82]">{row.run}<br /><a href={`${GITHUB_REPO_URL}/commit/${row.revision}`} target="_blank" rel="noreferrer" className="mt-1 inline-block text-violet-700 hover:underline">Source {row.revision}</a></td>
                                </tr>)}
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-[#756b82]">* A failed Basic OP module may stop before testing its intended feature. See the topic table below.</p>
                    <p className="mt-2 text-xs font-semibold text-[#756b82] sm:hidden">Swipe the table sideways for results and test dates →</p>
                </section>

                <section aria-labelledby="topic-results" className="mt-12">
                    <div className="mb-4">
                        <p className="text-xs font-black uppercase tracking-[0.17em] text-violet-700">OpenID Foundation · Conformance Suite 5.3.1</p>
                        <h2 id="topic-results" className="mt-1 text-2xl font-black">What each result means</h2>
                        <p className="mt-2 text-sm font-semibold text-[#70677c]">The Basic OP run used strict PKCE on 25 Sep 2026. A failed module may have stopped before the feature it intended to test.</p>
                    </div>
                    <div className="overflow-x-auto rounded-[1.5rem] border border-[#e8daed] bg-white" tabIndex={0} role="region" aria-label="OpenID test topics; scroll horizontally for explanations">
                        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                            <thead className="bg-[#f8f1fb] text-xs font-black uppercase tracking-wider text-[#685b7c]">
                                <tr><th scope="col" className="w-36 px-5 py-4">Status</th><th scope="col" className="w-64 px-5 py-4">Topic</th><th scope="col" className="px-5 py-4">Why</th></tr>
                            </thead>
                            <tbody>
                                {topicRows.map((row) => <tr key={row.topic} className="border-t border-[#f0e8f3] align-top">
                                    <td className="px-5 py-3.5"><ResultBadge result={row.result} /></td>
                                    <th scope="row" className="px-5 py-3.5 font-black">{row.topic}</th>
                                    <td className="px-5 py-3.5 font-semibold leading-relaxed text-[#5c536c]">{row.detail}</td>
                                </tr>)}
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-3 rounded-2xl border border-[#e9dff0] bg-[#fbf7ff] px-4 py-3 text-sm font-semibold leading-relaxed text-[#665978]">
                        <strong>Reading the table:</strong> “Blocked” means the intended downstream check never ran; “No verdict” means the suite did not finish that module; “Not tested” means there has been no official run for that configuration or environment. None of these means passed.
                    </p>
                </section>

                <div className="mt-9 flex flex-wrap gap-x-7 gap-y-3 text-sm font-black text-violet-700">
                    <a href={conformanceGuide} className="inline-flex items-center gap-1.5 hover:text-violet-900">Read the compatibility status <ArrowRight className="h-4 w-4" /></a>
                    <a href={testingGuide} className="inline-flex items-center gap-1.5 hover:text-violet-900">How we run the OpenID suite <ArrowRight className="h-4 w-4" /></a>
                </div>
            </main>
            <Footer />
        </div>
    )
}
