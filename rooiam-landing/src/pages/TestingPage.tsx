import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Activity, ArrowRight, Check, ChevronRight, CircleAlert, Code2, HelpCircle, Minus, Search, SearchX, ShieldCheck, Smartphone } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { BUG_REPORT_URL } from '../lib/site'
import { testingCategories, testingCategoryGroups, type Result, type TestingCategory } from './testingResults'

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
    const [categoryQuery, setCategoryQuery] = useState('')
    const activeId = searchParams.get('category')
    const category = testingCategories.find((item) => item.id === activeId) ?? testingCategories[0]
    const query = categoryQuery.trim().toLowerCase()
    const visibleCategories = testingCategories.filter((item) =>
        !query || [item.label, item.shortLabel, item.summary, ...item.rows.map((row) => row.topic)]
            .some((value) => value.toLowerCase().includes(query)))

    function selectCategory(id: TestingCategory['id']) {
        setSearchParams(id === 'openid' ? {} : { category: id })
    }

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

                <div className="mt-9 lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:items-start lg:gap-7">
                    <aside className="hidden rounded-[1.5rem] border border-[#e8daed] bg-white p-3 lg:sticky lg:top-28 lg:block" aria-label="Browse testing categories">
                        <div className="px-2 pb-3 pt-1">
                            <p className="text-xs font-black uppercase tracking-[0.15em] text-violet-700">Browse tests</p>
                            <p className="mt-1 text-xs font-semibold text-[#81768d]">{testingCategories.length} categories</p>
                        </div>
                        <label htmlFor="testing-category-search" className="sr-only">Search testing categories or topics</label>
                        <div className="relative mb-3">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a7e97]" aria-hidden="true" />
                            <input id="testing-category-search" type="search" value={categoryQuery} onChange={(event) => setCategoryQuery(event.target.value)} placeholder="Find a test…"
                                className="w-full rounded-xl border border-[#e8daed] bg-[#fffcff] py-2.5 pl-9 pr-3 text-sm font-semibold text-[#29243b] outline-none placeholder:text-[#958b9e] focus:border-violet-400 focus:ring-2 focus:ring-violet-100" />
                        </div>
                        <nav aria-label="Testing categories" className="max-h-[calc(100vh-15rem)] space-y-4 overflow-y-auto px-1 pb-1">
                            {testingCategoryGroups.map((group) => {
                                const items = visibleCategories.filter((item) => item.group === group.id)
                                if (items.length === 0) return null
                                return <div key={group.id}>
                                    <p className="px-2 pb-1.5 text-[10px] font-black uppercase tracking-[0.13em] text-[#8b7e97]">{group.label}</p>
                                    <div className="space-y-1">
                                        {items.map((item) => {
                                            const Icon = categoryIcons[item.id]
                                            const active = category.id === item.id
                                            return <button key={item.id} type="button" aria-pressed={active} aria-controls="testing-category-panel" onClick={() => selectCategory(item.id)}
                                                className={`w-full rounded-xl px-2.5 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${active ? 'bg-[#f4ebff] text-violet-900' : 'text-[#4e455b] hover:bg-[#fcf8ff]'}`}>
                                                <span className="flex items-center gap-2 text-sm font-black"><Icon className={`h-4 w-4 shrink-0 ${active ? 'text-violet-700' : 'text-[#8a7e97]'}`} aria-hidden="true" /><span className="min-w-0 flex-1">{item.label}</span>{active && <ChevronRight className="h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />}</span>
                                                <span className="mt-0.5 block pl-6 text-xs font-semibold text-[#81768d]">{item.shortLabel}</span>
                                            </button>
                                        })}
                                    </div>
                                </div>
                            })}
                            {visibleCategories.length === 0 && <p className="px-2 py-4 text-sm font-semibold text-[#756b82]">No matching categories or topics.</p>}
                        </nav>
                    </aside>

                    <div className="lg:hidden">
                        <label htmlFor="testing-category-select" className="mb-2 block text-xs font-black uppercase tracking-[0.15em] text-violet-700">Browse testing categories</label>
                        <select id="testing-category-select" value={category.id} onChange={(event) => selectCategory(event.target.value as TestingCategory['id'])}
                            className="w-full rounded-2xl border border-[#cbb5e9] bg-white px-4 py-3.5 text-base font-black text-[#29243b] outline-none focus:ring-2 focus:ring-violet-400">
                            {testingCategoryGroups.map((group) => <optgroup key={group.id} label={group.label}>
                                {testingCategories.filter((item) => item.group === group.id).map((item) => <option key={item.id} value={item.id}>{item.label} · {item.shortLabel}</option>)}
                            </optgroup>)}
                        </select>
                    </div>

                    <section id="testing-category-panel" aria-labelledby="category-heading" aria-live="polite" className="mt-7 min-w-0 lg:mt-0">
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <p className="text-xs font-black uppercase tracking-[0.17em] text-violet-700">{category.label} testing</p>
                            <h2 id="category-heading" className="mt-1 text-2xl font-black sm:text-3xl">{category.summary}</h2>
                        </div>
                        <p className="rounded-full border border-[#e8daed] bg-white px-4 py-2 text-xs font-bold text-[#645876]">Latest evidence · {category.lastEvidence}</p>
                    </div>
                    <p className="mt-3 max-w-3xl text-sm font-semibold leading-relaxed text-[#70677c]">{category.scope}</p>

                    <div className="mt-6 overflow-x-auto rounded-[1.5rem] border border-[#e8daed] bg-white shadow-[0_18px_55px_-45px_rgba(80,47,105,0.35)]" tabIndex={0} role="region" aria-label={`${category.label} test results; scroll horizontally for details`}>
                        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                            <thead className="bg-[#f8f1fb] text-xs font-black uppercase tracking-wider text-[#685b7c]">
                                <tr>
                                    <th scope="col" className="w-32 px-4 py-4">Status</th>
                                    <th scope="col" className="w-44 px-4 py-4">Test topic</th>
                                    <th scope="col" className="px-5 py-4">What happened</th>
                                    <th scope="col" className="w-40 px-4 py-4">Evidence</th>
                                </tr>
                            </thead>
                            <tbody>
                                {category.rows.map((row) => <tr key={row.topic} className="border-t border-[#f0e8f3] align-top">
                                    <td className="px-4 py-4"><ResultBadge result={row.result} /></td>
                                    <th scope="row" className="px-4 py-4 font-black">{row.topic}</th>
                                    <td className="px-5 py-4 font-semibold leading-relaxed text-[#5c536c]">{row.description}</td>
                                    <td className="px-4 py-4 text-xs font-bold leading-relaxed text-[#756b82]">
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
                    <div className="mt-8 rounded-2xl border border-[#e8daed] bg-white px-5 py-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
                        <div>
                            <p className="text-sm font-black">Found a bug or an outdated result?</p>
                            <p className="mt-1 text-sm font-semibold text-[#70677c]">Tell us what happened and how to reproduce it.</p>
                        </div>
                        <a href={BUG_REPORT_URL} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-black text-violet-700 hover:text-violet-900 sm:mt-0">
                            Report a bug <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </a>
                    </div>
                    </section>
                </div>
            </main>
            <Footer />
        </div>
    )
}
