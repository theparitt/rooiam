import { useEffect } from 'react'
import { DOCS_HOME_URL } from '../lib/site'

export default function DocsRedirectPage() {
  useEffect(() => {
    window.location.replace(DOCS_HOME_URL)
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#FFFBFD' }}>
      <div
        className="max-w-lg rounded-[2rem] border px-8 py-10 text-center"
        style={{
          borderColor: '#F1DDE7',
          background: 'rgba(255,255,255,0.9)',
          boxShadow: '0 24px 60px -40px rgba(15, 23, 42, 0.18)',
        }}
      >
        <p className="text-xs font-black uppercase tracking-[0.24em]" style={{ color: '#c96b8a' }}>
          Redirecting
        </p>
        <h1 className="mt-3 text-3xl font-black text-gray-900">Opening rooiam-docs</h1>
        <p className="mt-4 text-base font-semibold leading-relaxed text-gray-500">
          Documentation now lives in the standalone docs app instead of the landing page.
        </p>
        <a
          href={DOCS_HOME_URL}
          className="mt-7 inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-black shadow-md transition-all hover:scale-[1.02]"
          style={{ background: 'linear-gradient(135deg, #FFB5C8, #D5B7FF)', color: '#5a2d3f' }}
        >
          Open docs
        </a>
      </div>
    </div>
  )
}
