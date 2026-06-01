'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

type Chapter = { num: string; title: string; slug: string };

// ── Reading progress bar ─────────────────────────────────────────────────────
function ReadingProgress() {
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const update = () => {
      const el = document.documentElement;
      const pct = el.scrollHeight - el.clientHeight > 0
        ? (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100
        : 0;
      if (barRef.current) barRef.current.style.width = `${pct}%`;
    };
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return (
    <div className="reading-progress">
      <div className="reading-progress-bar" ref={barRef} />
    </div>
  );
}

// ── highlight.js trigger on route change ────────────────────────────────────
function HighlightTrigger() {
  const pathname = usePathname();
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof (window as any).hljs !== 'undefined') {
        (window as any).hljs.highlightAll();
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [pathname]);
  return null;
}

// ── Sidebar nav ──────────────────────────────────────────────────────────────
export default function SidebarClient({ chapters }: { chapters: Chapter[] }) {
  const pathname = usePathname();

  const isActive = (slug: string) =>
    slug === '' ? pathname === '/' : pathname === `/chapter/${slug}`;

  return (
    <>
      <ReadingProgress />
      <HighlightTrigger />
      <nav className="sidebar" aria-label="Table of contents">
        <div className="sidebar-header">
          <img 
            src="/logo.svg" 
            alt="Rooiam Logo" 
            style={{ height: '32px', marginBottom: '1.25rem', display: 'block' }} 
          />
          <div className="sidebar-book-label">Rooiam Textbook</div>
          <div className="sidebar-book-title">
            Design &amp; Implementation<br />of an Identity Platform
          </div>
        </div>

        <div className="sidebar-toc">
          <div className="toc-section-label">Contents</div>
          {chapters.map((ch) => (
            <Link
              key={ch.slug || 'preface'}
              href={ch.slug === '' ? '/' : `/chapter/${ch.slug}`}
              className={`nav-link${isActive(ch.slug) ? ' active' : ''}`}
            >
              {ch.num && <span className="nav-link-num">{ch.num}.</span>}
              <span>{ch.title}</span>
            </Link>
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-edition">
            <strong>First Edition</strong><br />
            Rust · Actix-web · PostgreSQL · Redis
          </div>
        </div>
      </nav>
    </>
  );
}
