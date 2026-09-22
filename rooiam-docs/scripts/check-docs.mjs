import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const siteRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = path.resolve(siteRoot, '..')
const server = await createServer({
  root: siteRoot,
  server: { middlewareMode: true },
  appType: 'custom',
})

try {
  const { docList, getDocByRoute, resolveDocHref } = await server.ssrLoadModule('/src/docs.ts')
  assert.equal(getDocByRoute('/')?.sourcePath, 'getting-started/00_index.md')
  assert.equal(getDocByRoute('/docs-index')?.sourcePath, '00_docs_index.md')
  assert.equal(new Set(docList.map(doc => doc.routePath)).size, docList.length, 'Duplicate public routes')

  const errors = []
  for (const doc of docList) {
    for (const match of doc.body.matchAll(/\]\(([^)]+)\)/g)) {
      const href = match[1]
      if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('#')) continue
      const [file] = href.split('#')
      if (!file.endsWith('.md')) continue
      const target = file.startsWith('/')
        ? path.join(repoRoot, file)
        : path.resolve(repoRoot, 'docs', path.dirname(doc.sourcePath), file)
      if (!fs.existsSync(target)) errors.push(`${doc.sourcePath}: missing ${href}`)
      if (resolveDocHref(doc.sourcePath, href) === null) errors.push(`${doc.sourcePath}: unroutable ${href}`)
    }
  }

  const bookRoot = path.join(repoRoot, 'rooiam-book')
  const { CHAPTERS } = await server.ssrLoadModule('/@fs/' + path.join(bookRoot, 'src/app/chapters.ts'))
  const slugs = CHAPTERS.map(chapter => chapter.slug).filter(Boolean)
  const files = fs.readdirSync(bookRoot).filter(file => /^chapter-.*\.md$/.test(file)).map(file => file.slice(0, -3))
  assert.equal(new Set(slugs).size, slugs.length, 'Duplicate book chapter slugs')
  assert.deepEqual([...slugs].sort(), files.sort(), 'Book navigation must include every chapter exactly once')
  assert.deepEqual(errors, [], 'Public Markdown links must resolve to a site page or repository file')
  console.log(`Checked ${docList.length} public pages and ${slugs.length} book chapters: links, routes, and navigation passed.`)
} finally {
  await server.close()
}
