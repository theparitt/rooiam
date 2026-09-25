import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Activity, ArrowRight, Check, CircleAlert, Code2, HelpCircle, Minus, SearchX, ShieldCheck, Smartphone } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { testingCategories, type Result, type TestingCategory } from './testingResults'

const resultStyle: Record<Result, { label: string; className: string; icon: typeof Check }> = {
    passed: { label: 'Passed', className: 'bg-[#e2f7ec] text-[#196c4a]', icon: Check },
    'not-passed': { label: 'Not passed', className: 'bg-[#ffece6] text-[#a13f38]', icon: CircleAlert },
    blocked: { label: 'Blocked', className: 'bg-[#fff2e4] text-[#985317]', icon: CircleAlert },
    'no-verdict': { label: 'No verdict', className: 'bg-[#fff2e4] text-[#985317]', icon: HelpCircle },
    review: { label: 'Review', className: 'bg-[#f2ebff] text-[#6341a2]', icon: HelpCircle },
    skipped: { label: 'Skipped', className: 'bg-[#f0f0f4] text-[#5b5968]', icon: Minus },
    'not-tested': { label: 'Not tested', className: 'bg-[#edf1f8] text-[#455b7b]', icon: SearchX },
}

const categoryIcons: Record<TestingCategory['id'], typeof ShieldCheck> = {
    openid: ShieldCheck,
    android: Smartphone,
    sdk: Code2,
    operations: Activity,
}

function ResultBadge({ result }: { result: Result }) {
    const { label, className, icon: Icon } = resultStyle[result]
    return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-black ${className}`}>
        <Icon className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />{label}
    </span>
}

export default function TestingPage() {
    const [searchParams, setSearchParams] = useSearchParams()
    const activeId = searchParams.get('category')
    const category = testingCategories.find((item) => item.id === activeId) ?? testingCategories[0]

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
                    <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight sm:text-5xl">What we tested.</h1>
                    <p className="mt-4 max-w-2xl text-base font-semibold leading-relaxed text-[#635b72] sm:text-lg">
                        Choose a category to see each topic, its result, and the environment that was actually checked.
                    </p>
                </header>

                <nav aria-label="Testing categories" className="mt-9 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {testingCategories.map((item) => {
                        const Icon = categoryIcons[item.id]
                        const active = category.id === item.id
                        return <button
                            key={item.id}
                            type="button"
                            aria-pressed={active}
                            aria-controls="testing-category-panel"
                            onClick={() => setSearchParams(item.id === 'openid' ? {} : { category: item.id })}
                            className={`min-w-0 rounded-[1.25rem] border px-3 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 sm:px-4 ${active
                                ? 'border-[#bca0ec] bg-[#f4ebff] shadow-[0_12px_35px_-25px_rgba(80,47,105,0.45)]'
                                : 'border-[#e8daed] bg-white hover:border-[#cbb5e9] hover:bg-[#fcf8ff]'}`}
                        >
                            <span className="flex items-center gap-2 text-sm font-black"><Icon className={`h-4 w-4 ${active ? 'text-violet-700' : 'text-[#81768d]'}`} aria-hidden="true" />{item.label}</span>
                            <span className="mt-1 block pl-6 text-xs font-bold text-[#736983]">{item.shortLabel}</span>
                        </button>
                    })}
                </nav>

                <section id="testing-category-panel" aria-labelledby="category-heading" aria-live="polite" className="mt-7">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.17em] text-violet-700">{category.label} testing</p>
                            <h2 id="category-heading" className="mt-1 text-2xl font-black sm:text-3xl">{category.summary}</h2>
                        </div>
                        <p className="rounded-full border border-[#e8daed] bg-white px-4 py-2 text-xs font-bold text-[#645876]">Latest evidence · {category.lastEvidence}</p>
                    </div>
                    <p className="mt-3 max-w-3xl text-sm font-semibold leading-relaxed text-[#70677c]">{category.scope}</p>

                    <div className="mt-6 overflow-x-auto rounded-[1.5rem] border border-[#e8daed] bg-white shadow-[0_18px_55px_-45px_rgba(80,47,105,0.35)]" tabIndex={0} role="region" aria-label={`${category.label} test results; scroll horizontally for details`}>
                        <table className="w-full min-w-[830px] border-collapse text-left text-sm">
                            <thead className="bg-[#f8f1fb] text-xs font-black uppercase tracking-wider text-[#685b7c]">
                                <tr>
                                    <th scope="col" className="w-36 px-5 py-4">Status</th>
                                    <th scope="col" className="w-56 px-5 py-4">Test topic</th>
                                    <th scope="col" className="px-5 py-4">What happened</th>
                                    <th scope="col" className="w-52 px-5 py-4">Evidence</th>
                                </tr>
                            </thead>
                            <tbody>
                                {category.rows.map((row) => <tr key={row.topic} className="border-t border-[#f0e8f3] align-top">
                                    <td className="px-5 py-4"><ResultBadge result={row.result} /></td>
                                    <th scope="row" className="px-5 py-4 font-black">{row.topic}</th>
                                    <td className="px-5 py-4 font-semibold leading-relaxed text-[#5c536c]">{row.description}</td>
                                    <td className="px-5 py-4 text-xs font-bold leading-relaxed text-[#756b82]">
                                        {row.evidenceHref
                                            ? <a href={row.evidenceHref} target="_blank" rel="noreferrer" className="text-violet-700 underline-offset-2 hover:underline">{row.evidence} ↗</a>
                                            : row.evidence}
                                    </td>
                                </tr>)}
                            </tbody>
                        </table>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-[#756b82] sm:hidden">Swipe sideways for descriptions and evidence →</p>
                    <p className="mt-3 rounded-2xl border border-[#e9dff0] bg-[#fbf7ff] px-4 py-3 text-sm font-semibold leading-relaxed text-[#665978]">{category.note}</p>
                    <div className="mt-6 flex flex-wrap gap-x-7 gap-y-3 text-sm font-black text-violet-700">
                        {category.links.map((link) => <a key={link.href} href={link.href} className="inline-flex items-center gap-1.5 hover:text-violet-900">{link.label} <ArrowRight className="h-4 w-4" /></a>)}
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    )
}
