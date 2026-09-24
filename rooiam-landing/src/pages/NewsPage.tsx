import { useEffect } from 'react'
import { ArrowRight } from 'lucide-react'
import Navbar from '../components/Navbar'
import Footer from '../components/Footer'
import { DOCS_BASE_URL, GITHUB_REPO_URL } from '../lib/site'

const walkthroughUrl = `${DOCS_BASE_URL}/getting-started/android-phone-sign-in-walkthrough`
const integrationUrl = `${DOCS_BASE_URL}/reference/android-sdk-integration`
const exampleUrl = `${GITHUB_REPO_URL}/tree/main/rooiam-examples/example-5-android-reference-app`
const recoveryUrl = `${DOCS_BASE_URL}/reference/lost-phone-and-replacement`

export default function NewsPage() {
    useEffect(() => {
        const previousTitle = document.title
        document.title = 'News | Rooiam'
        return () => { document.title = previousTitle }
    }, [])

    return (
        <div className="min-h-screen bg-[#FFFBFD]">
            <Navbar />
            <main>
                <header className="mx-auto max-w-6xl px-6 pb-10 pt-16 md:px-12 md:pb-14 md:pt-20">
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-violet-700">Rooiam News</p>
                    <h1 className="mt-3 text-4xl font-black leading-tight text-[#29243b] md:text-5xl">What’s new at Rooiam</h1>
                    <p className="mt-4 max-w-xl text-base font-semibold leading-relaxed text-gray-600 md:text-lg">
                        Major product updates, with a clear view of what you can try today.
                    </p>
                </header>

                <section className="mx-auto max-w-6xl px-6 pb-24 md:px-12">
                    <article className="grid overflow-hidden rounded-[2rem] border border-[#ead9ef] bg-white shadow-[0_24px_70px_-50px_rgba(80,47,105,0.4)] lg:grid-cols-[0.9fr_1.1fr]">
                        <div className="relative flex min-h-[300px] items-center justify-center overflow-hidden bg-gradient-to-br from-[#e9fff7] via-[#f9f2ff] to-[#ffe8f0] p-3 sm:min-h-[360px] sm:p-5">
                            <div className="absolute -left-16 -top-16 h-48 w-48 rounded-full bg-white/45" aria-hidden="true" />
                            <div className="absolute -bottom-20 -right-14 h-52 w-52 rounded-full bg-white/40" aria-hidden="true" />
                            <img src="/characters/telmi-phone-recovery.webp" alt="Telmi holds a replacement phone after securing her account" loading="lazy"
                                className="relative z-10 h-[290px] w-full object-contain sm:h-[350px] lg:h-full lg:max-h-[440px]" />
                        </div>
                        <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
                            <div className="flex flex-wrap items-center gap-3 text-xs font-black uppercase tracking-widest">
                                <span className="rounded-full bg-violet-100 px-3 py-1.5 text-violet-700">Android beta · 0.4</span>
                                <time dateTime="2026-09-24" className="text-gray-500">24 September 2026</time>
                            </div>
                            <h2 className="mt-5 text-3xl font-black leading-tight text-[#29243b] sm:text-4xl">A safer way back when a phone is lost</h2>
                            <p className="mt-4 text-base font-semibold leading-relaxed text-gray-600">
                                Sign in with another method, revoke the lost phone, and enroll a replacement. Rooiam stops unfinished approvals from the old phone and keeps your workspace’s phone-confirmation policy in place.
                            </p>
                            <p className="mt-3 text-sm font-semibold leading-relaxed text-gray-500">
                                Available for the Android beta. The recovery flow has been tested with a Play-installed phone; apps built by other teams need their own verification.
                            </p>
                            <a href={recoveryUrl} className="mt-6 inline-flex items-center gap-1.5 text-sm font-black text-violet-700 hover:text-violet-900">
                                See the recovery steps <ArrowRight className="h-4 w-4" />
                            </a>
                        </div>
                    </article>
                    <article className="mt-8 overflow-hidden rounded-[2rem] border border-[#ead9ef] bg-white shadow-[0_24px_70px_-50px_rgba(80,47,105,0.4)]">
                        <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
                            <div className="relative flex min-h-[330px] items-center justify-center overflow-hidden bg-gradient-to-br from-[#ffe8f0] via-[#f9f2ff] to-[#e9fff7] p-3 sm:min-h-[410px] sm:p-5">
                                <div className="absolute -left-12 -top-12 h-44 w-44 rounded-full bg-white/40" aria-hidden="true" />
                                <div className="absolute -bottom-16 -right-10 h-52 w-52 rounded-full bg-white/40" aria-hidden="true" />
                                <img src="/characters/telmi-qr-signin.webp" alt="Telmi scans a browser QR code using her phone" loading="lazy"
                                    className="relative z-10 h-[320px] w-full object-contain sm:h-[400px] lg:h-full lg:max-h-[470px]" />
                            </div>

                            <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
                                <div className="flex flex-wrap items-center gap-3 text-xs font-black uppercase tracking-widest">
                                    <span className="rounded-full bg-violet-100 px-3 py-1.5 text-violet-700">Preview</span>
                                    <time dateTime="2026-09-24" className="text-gray-500">24 September 2026</time>
                                </div>
                                <h2 className="mt-6 text-3xl font-black leading-tight text-[#29243b] sm:text-4xl">Sign in with your Android phone</h2>
                                <p className="mt-5 text-base font-semibold leading-relaxed text-gray-600">
                                    Scan a QR code in your browser, check the sign-in request on your enrolled phone, and approve. Your browser then finishes signing in.
                                </p>
                                <p className="mt-4 text-base font-semibold leading-relaxed text-gray-600">
                                    Workspace owners can offer phone sign-in alongside their other login methods and choose where it appears. Developers can explore the Android SDK and reference app in the repository.
                                </p>
                                <p className="mt-5 rounded-2xl border border-[#f0e2f5] bg-[#fbf7ff] px-4 py-3 text-sm font-semibold leading-relaxed text-[#665978]">
                                    Available as a 0.2 preview for self-hosted evaluation and invited Play testers. Public release follows production review.
                                </p>
                                <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-sm font-black text-violet-700">
                                    <a href={walkthroughUrl} className="inline-flex items-center gap-1.5 hover:text-violet-900">Try the walkthrough <ArrowRight className="h-4 w-4" /></a>
                                    <a href={integrationUrl} className="inline-flex items-center gap-1.5 hover:text-violet-900">Android SDK guide <ArrowRight className="h-4 w-4" /></a>
                                    <a href={exampleUrl} className="inline-flex items-center gap-1.5 hover:text-violet-900">Reference app <ArrowRight className="h-4 w-4" /></a>
                                </div>
                            </div>
                        </div>
                    </article>
                    <article className="mt-8 grid overflow-hidden rounded-[2rem] border border-[#ead9ef] bg-white shadow-[0_24px_70px_-50px_rgba(80,47,105,0.4)] lg:grid-cols-[0.9fr_1.1fr]">
                        <div className="relative flex min-h-[290px] items-center justify-center overflow-hidden bg-gradient-to-br from-[#fff1df] via-[#f9f2ff] to-[#e9fff7] p-3 sm:p-5">
                            <img src="/characters/telmi-first-release.webp" alt="Telmi welcomes visitors to the first Rooiam release" loading="lazy"
                                className="relative h-[290px] w-full object-contain sm:h-[350px] lg:h-full lg:max-h-[400px]" />
                        </div>
                        <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
                            <div className="flex flex-wrap items-center gap-3 text-xs font-black uppercase tracking-widest">
                                <span className="rounded-full bg-[#e2f7ec] px-3 py-1.5 text-[#277454]">Release</span>
                                <time dateTime="2026-03" className="text-gray-500">March 2026</time>
                            </div>
                            <h2 className="mt-5 text-2xl font-black text-[#29243b] sm:text-3xl">Rooiam 0.1.0 is here</h2>
                            <p className="mt-3 max-w-3xl text-base font-semibold leading-relaxed text-gray-600">
                                The first public release brings passwordless sign-in, multi-tenant workspaces, OIDC integration and a self-hosted deployment path together in one identity platform.
                            </p>
                            <a href={`${DOCS_BASE_URL}/changelog`} className="mt-5 inline-flex items-center gap-1.5 text-sm font-black text-violet-700 hover:text-violet-900">
                                Read the release notes <ArrowRight className="h-4 w-4" />
                            </a>
                        </div>
                    </article>
                </section>
            </main>
            <Footer />
        </div>
    )
}
