import { BookOpen, ChevronRight, ExternalLink, Menu, Search, X, Code, FileText, Layout, ShieldCheck, Zap, Moon, Sun } from 'lucide-react'
import { ReactNode, useMemo, useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { Link, Navigate, useLocation } from 'react-router-dom'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import {
  docList,
  docsBySection,
  getDocByRoute,
  getPreviousAndNext,
  resolveDocHref,
} from './docs'

const BOOK_URL = import.meta.env.VITE_BOOK_URL?.trim() || 'http://localhost:5176'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function textFromChildren(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') {
    return String(children)
  }
  if (Array.isArray(children)) {
    return children.map(textFromChildren).join('')
  }
  if (children && typeof children === 'object' && 'props' in children) {
    return textFromChildren((children as { props?: { children?: ReactNode } }).props?.children)
  }
  return ''
}

function DocMarkdown({ sourcePath, body }: { sourcePath: string; body: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        h1: ({ children }) => {
          const id = slugify(textFromChildren(children))
          return <h1 id={id} className="text-4xl sm:text-5xl font-extrabold text-foreground tracking-tight font-display mb-6 leading-tight">{children}</h1>
        },
        h2: ({ children }) => {
          const id = slugify(textFromChildren(children))
          return <h2 id={id} className="mt-12 text-2xl font-bold text-foreground font-display border-b-2 border-border pb-3 mb-5 flex items-center gap-3">
            <div className="h-3 w-3 rounded-full bg-primary/40"></div>
            {children}
          </h2>
        },
        h3: ({ children }) => {
          const id = slugify(textFromChildren(children))
          return (
            <h3
              id={id}
              className="mt-10 mb-3 text-xl font-bold text-foreground font-display tracking-tight"
            >
              {children}
            </h3>
          )
        },
        p: ({ children }) => <p className="mt-4 leading-8 text-muted-foreground font-medium text-base">{children}</p>,
        ul: ({ children }) => <ul className="mt-4 list-disc space-y-2 pl-6 text-muted-foreground">{children}</ul>,
        ol: ({ children }) => <ol className="mt-4 list-decimal space-y-2 pl-6 text-muted-foreground">{children}</ol>,
        li: ({ children }) => <li className="leading-7 pl-1">{children}</li>,
        blockquote: ({ children }) => (
          <blockquote className="my-8 rounded-2xl border-l-[8px] border-amber-400 bg-amber-50/80 dark:bg-amber-950/20 px-8 py-6 text-foreground italic font-semibold shadow-sm ring-1 ring-amber-200/50 dark:ring-amber-500/20 backdrop-blur-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
              <Zap size={64} className="text-amber-600" />
            </div>
            {children}
          </blockquote>
        ),
        pre: ({ children, ...props }) => {
          let language = ''
          if (children && typeof children === 'object' && 'props' in children) {
            const className = (children as any).props?.className || ''
            const match = /language-(\w+)/.exec(className)
            if (match) language = match[1]
          }
          return (
            <div className="group relative my-6 overflow-hidden rounded-2xl shadow-sm border border-border bg-muted/30">
              {language && (
                <div className="absolute top-0 right-0 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-primary z-10 opacity-70 bg-card border-b border-l border-border rounded-bl-2xl">
                   {language}
                </div>
              )}
              <pre className="selection:bg-primary/20 text-[13px] font-mono leading-relaxed p-6 overflow-x-auto m-0 bg-transparent text-foreground" {...props}>
                {children}
              </pre>
            </div>
          )

        },
        code: ({ className, children, ...props }) => {
          const isHighlight = className && (className.includes('hljs') || className.includes('language-'))
          if (!isHighlight) {
            return (
              <code className="rounded-xl bg-muted/60 px-2.5 py-0.5 text-[0.9em] text-foreground font-black border border-border" {...props}>
                {children}
              </code>
            )
          }
          return (
            <code className={className} style={{ background: 'transparent', padding: 0 }} {...props}>
              {children}
            </code>
          )
        },
        table: ({ children }) => (
          <div className="mt-6 overflow-x-auto rounded-2xl border border-border shadow-sm bg-card/70 backdrop-blur-md">
            <table className="min-w-full divide-y divide-border">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
        th: ({ children }) => (
          <th className="px-10 py-6 text-left text-[11px] font-bold uppercase tracking-[0.25em] text-muted-foreground/80">
            {children}
          </th>
        ),
        td: ({ children }) => <td className="px-10 py-6 text-sm text-foreground font-semibold border-t border-border/50">{children}</td>,
        a: ({ href, children }) => {
          const resolvedHref = href ? resolveDocHref(sourcePath, href) : null
          if (!resolvedHref) {
            return <span className="text-muted-foreground">{children}</span>
          }
          const isExternal = resolvedHref.startsWith('http://') || resolvedHref.startsWith('https://')
          const baseClasses = "font-bold text-foreground hover:text-foreground/80 underline decoration-primary/60 hover:decoration-primary underline-offset-4 transition-all duration-300"
          
          if (isExternal) {
            return (
              <a href={resolvedHref} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-2 ${baseClasses}`}>
                {children}
                <ExternalLink size={14} className="mb-0.5" />
              </a>
            )
          }
          return (
            <Link to={resolvedHref} className={baseClasses}>
              {children}
            </Link>
          )
        },
      }}
    >
      {body}
    </ReactMarkdown>
  )
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('theme')) {
      return localStorage.getItem('theme') as 'light' | 'dark'
    }
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark'
    }
    return 'light'
  })
  
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])

  const routePath = location.pathname === '' ? '/' : location.pathname
  const currentDoc = getDocByRoute(routePath)

  const filteredSections = useMemo(() => {
    const trimmed = query.trim().toLowerCase()
    if (!trimmed) return docsBySection
    return docsBySection
      .map((section) => ({
        ...section,
        docs: section.docs.filter((doc) => doc.title.toLowerCase().includes(trimmed)),
      }))
      .filter((section) => section.docs.length > 0)
  }, [query])

  if (!currentDoc) {
    return <Navigate to="/" replace />
  }

  const { previous, next } = getPreviousAndNext(currentDoc.routePath)

  return (
    <div className="min-h-screen font-sans selection:bg-primary/20 selection:text-primary-foreground animate-fade-in flex flex-col transition-colors duration-500">
      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-border/40 pr-4 sm:pr-0 bg-transparent backdrop-blur-xl transition-all">
        <div className="mx-auto w-full flex max-w-[1700px] items-center gap-8 px-8 py-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card/60 text-muted-foreground shadow-sm transition-all hover:bg-card lg:hidden active:scale-90"
            aria-label="Open navigation"
          >
            <Menu size={24} />
          </button>
          
          <Link to="/" className="flex items-center gap-5 hover:scale-105 transition-transform">
            <img src={theme === 'dark' ? "/wordmark-light.svg" : "/wordmark-dark.svg"} alt="Rooiam" className="h-9 w-auto transition-all" />
            <div className="h-8 w-[1.5px] bg-border mx-1 hidden sm:block"></div>
            <div className="hidden sm:flex items-center gap-4">
              <span className="text-[11px] font-bold uppercase tracking-[0.35em] text-primary-foreground bg-primary px-4 py-1.5 rounded-full shadow-sm ring-1 ring-border">Docs ✨</span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">v0.1.0</span>
            </div>
          </Link>

          <div className="ml-auto hidden max-w-lg flex-1 items-center gap-6 lg:flex">
            <div className="relative flex-1 group">
              <Search size={20} className="absolute left-6 top-1/2 -translate-y-1/2 text-muted-foreground/80 group-focus-within:text-primary transition-colors duration-300" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search Guide..."
                className="w-full rounded-2xl border border-border bg-card/60 py-4 pl-16 pr-6 text-sm font-bold outline-none transition-all placeholder:text-muted-foreground/70 focus:border-border focus:bg-card text-foreground focus:shadow-sm tracking-tight"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
             <a
              href={BOOK_URL}
              className="hidden sm:inline-flex items-center gap-3 rounded-2xl border border-border bg-card/50 px-6 py-3 text-sm font-bold text-foreground transition-all hover:bg-card hover:scale-105 shadow-sm active:scale-95"
              target="_blank"
              rel="noreferrer"
            >
              <BookOpen size={18} />
            </a>
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card/50 text-muted-foreground transition-all hover:bg-card shadow-sm hover:scale-105 active:scale-95"
              aria-label="Toggle dark mode"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full flex-1 flex max-w-[1700px]">
        {/* SIDEBAR */}
        <aside
          className={[
            'fixed inset-y-0 left-0 z-50 w-[340px] bg-transparent backdrop-blur-3xl transition-transform lg:sticky lg:top-[93px] lg:h-[calc(100vh-93px)] lg:translate-x-0',
            sidebarOpen ? 'translate-x-0 shadow-[0_0_50px_rgba(0,0,0,0.1)]' : '-translate-x-full lg:translate-x-0',
          ].join(' ')}
        >
          <div className="flex h-full flex-col px-6 py-8">
            <div className="mb-10 flex items-center justify-between lg:hidden">
              <div className="text-[12px] font-bold uppercase tracking-[0.4em] text-foreground/80">
                Navigation
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground shadow-sm active:scale-90"
              >
                <X size={20} />
              </button>
            </div>

            <div className="relative mb-10 lg:hidden">
              <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground/80" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search..."
                className="w-full rounded-2xl border border-border bg-card/60 py-4 pl-14 pr-5 text-sm font-bold outline-none focus:border-border text-foreground"
              />
            </div>

            <nav className="docs-sidebar-scroll flex-1 overflow-y-auto space-y-8 pr-2 pb-16 overflow-x-hidden">
              <div className="rounded-3xl border border-border bg-card/40 p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-muted-foreground">Current Status</p>
                <div className="mt-3 space-y-2 text-sm font-semibold text-foreground/80 leading-6">
                  <p>Rooiam is the self-hosted passwordless IAM for multi-tenant SaaS.</p>
                  <p className="text-muted-foreground">It already has real product surfaces, but it is still early-stage and best for evaluation, internal use, and early adopters today.</p>
                </div>
              </div>

              <div className="rounded-3xl border border-border bg-card/40 p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-muted-foreground">More Reading</p>
                <div className="mt-3 space-y-2">
                  <a
                    href={BOOK_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between rounded-2xl bg-card px-4 py-3 text-sm font-bold text-foreground transition-all hover:translate-x-1 shadow-sm"
                  >
                    <span className="inline-flex items-center gap-2">
                      <BookOpen size={16} className="text-muted-foreground" />
                      Rooiam Book
                    </span>
                    <ExternalLink size={15} className="text-muted-foreground/60" />
                  </a>
                </div>
              </div>

              {filteredSections.map((section) => (
                <div key={section.id} className="group/section">
                  <div className="mb-3 px-3 text-[11px] font-black uppercase tracking-[0.3em] text-foreground/75 flex items-center gap-3 group-hover/section:text-foreground transition-colors cursor-default">
                    <div className="h-1 w-5 rounded-full bg-primary/35 group-hover/section:bg-primary transition-colors"></div>
                    {section.label}
                  </div>
                  <div className="space-y-2">
                    {section.docs.map((doc) => {
                      const active = doc.routePath === currentDoc.routePath
                      return (
                        <Link
                          key={doc.sourcePath}
                          to={doc.routePath}
                          title={doc.title}
                          onClick={() => setSidebarOpen(false)}
                          className={[
                            'group flex items-center justify-between rounded-xl px-4 py-3 text-[14px] transition-all duration-300 focus:outline-none relative overflow-hidden border',
                            active
                              ? 'border-primary/30 bg-primary/12 font-bold text-foreground shadow-sm z-10 translate-x-1'
                              : 'border-transparent font-semibold text-foreground/72 hover:border-border hover:bg-card/80 hover:text-foreground hover:translate-x-1 hover:shadow-sm',
                          ].join(' ')}
                        >
                          <span className="truncate pr-2 relative z-10">{doc.title}</span>
                          <ChevronRight
                            size={16}
                            className={active ? 'text-primary relative z-10' : 'text-foreground/25 opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0 relative z-10'}
                          />
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </nav>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="min-w-0 flex-1 px-5 py-10 md:px-10 lg:px-16 lg:py-12 bg-card transition-colors duration-500 lg:rounded-tl-[3rem] lg:border-l lg:border-t lg:border-border shadow-sm">
          <div className="mx-auto max-w-[850px]">
            {/* ARTICLE WRAPPER */}
            <article className="min-h-[60vh] animate-slide-up">
              {/* STATUS BAR */}
              <div className="mb-6 flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-2.5 rounded-full bg-card/80 border border-border px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.3em] text-foreground shadow-sm">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse-slow shadow-[0_0_12px_rgba(52,211,153,0.6)]"></div>
                  {currentDoc.sectionLabel}
                </span>
                <span className="text-[12px] font-bold text-muted-foreground font-mono tracking-tight bg-muted/40 px-3 py-1.5 rounded-lg border border-border shadow-sm">path: {currentDoc.sourcePath}</span>
              </div>

              <DocMarkdown sourcePath={currentDoc.sourcePath} body={currentDoc.body} />
            </article>

            {/* PAGINATION */}
            <div className="mt-32 flex flex-col sm:flex-row gap-10 border-t border-border pt-20 pb-28">
              {previous ? (
                <Link
                  to={previous.routePath}
                  className="group flex-1 flex flex-col items-start gap-4 rounded-[2.5rem] border border-border bg-card/40 p-10 transition-all hover:bg-card hover:scale-105 shadow-sm active:scale-95"
                >
                  <span className="text-[11px] font-bold uppercase tracking-[0.4em] text-muted-foreground group-hover:text-primary transition-colors">← Previous</span>
                  <span className="text-2xl font-bold text-foreground transition-colors group-hover:text-foreground leading-tight">{previous.title}</span>
                </Link>
              ) : <div className="flex-1 invisible sm:visible" />}

              {next ? (
                <Link
                  to={next.routePath}
                  className="group flex-1 flex flex-col items-end gap-4 rounded-[2.5rem] border border-border bg-card/40 p-10 transition-all hover:bg-card hover:scale-105 shadow-sm active:scale-95"
                >
                  <span className="text-[11px] font-bold uppercase tracking-[0.4em] text-muted-foreground group-hover:text-secondary transition-colors">Next →</span>
                  <span className="text-2xl font-bold text-foreground transition-colors group-hover:text-foreground leading-tight">{next.title}</span>
                </Link>
              ) : <div className="flex-1 invisible sm:visible" />}
            </div>
          </div>
        </main>
      </div>

      {/* OVERLAY */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-pink-100/20 backdrop-blur-md lg:hidden transition-all duration-500"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}
