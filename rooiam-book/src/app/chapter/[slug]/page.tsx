import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import MarkdownRenderer from './MarkdownRenderer';
import { CHAPTERS } from '../../chapters';

export async function generateStaticParams() {
  const dir = path.join(process.cwd(), './');
  const files = fs.readdirSync(dir);
  return files
    .filter(f => f.startsWith('chapter-') && f.endsWith('.md'))
    .map(f => ({ slug: f.replace('.md', '') }));
}

export default async function ChapterPage({ params }: { params: { slug: string } }) {
  const filePath = path.join(process.cwd(), `./${params.slug}.md`);
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    content = '# Chapter not found\n\nThis chapter has not been written yet.';
  }

  // Find prev / next in the chapter list (skip the preface entry at index 0)
  const chapterEntries = CHAPTERS.filter(c => c.slug !== '');
  const currentIdx = chapterEntries.findIndex(c => c.slug === params.slug);
  const prev = currentIdx > 0 ? chapterEntries[currentIdx - 1] : null;
  const next = currentIdx < chapterEntries.length - 1 ? chapterEntries[currentIdx + 1] : null;
  const current = chapterEntries[currentIdx];

  return (
    <>
      {/* Chapter badge */}
      {current && (
        <div style={{ marginBottom: '2rem', paddingBottom: '1.75rem', borderBottom: '2px solid var(--border)' }}>
          <span style={{
            display: 'inline-block',
            fontFamily: 'Inter, sans-serif',
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'white',
            background: 'var(--accent)',
            padding: '0.18rem 0.6rem',
            borderRadius: '4px',
            marginBottom: '0.7rem',
          }}>
            Chapter {current.num}
          </span>
        </div>
      )}

      {/* Markdown content */}
      <MarkdownRenderer content={content} />

      {/* Prev / Next navigation */}
      <div className="chapter-nav">
        {prev ? (
          <Link href={`/chapter/${prev.slug}`} className="chapter-nav-btn prev">
            <span className="chapter-nav-dir">← Previous</span>
            <span className="chapter-nav-title">Ch {prev.num}. {prev.title}</span>
          </Link>
        ) : (
          <Link href="/" className="chapter-nav-btn prev">
            <span className="chapter-nav-dir">← Back to</span>
            <span className="chapter-nav-title">Preface</span>
          </Link>
        )}
        {next && (
          <Link href={`/chapter/${next.slug}`} className="chapter-nav-btn next">
            <span className="chapter-nav-dir">Next →</span>
            <span className="chapter-nav-title">Ch {next.num}. {next.title}</span>
          </Link>
        )}
      </div>
    </>
  );
}
