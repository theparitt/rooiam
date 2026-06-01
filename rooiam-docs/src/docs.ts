export type DocSectionId =
  | 'getting-started'
  | 'overview'
  | 'demo'
  | 'development'
  | 'production'
  | 'tenant-admin'
  | 'developers'
  | 'security'
  | 'troubleshooting'
  | 'reference'
  | 'internal'
  | 'changelog'
  | 'misc'

export type DocMeta = {
  sourcePath: string
  routePath: string
  title: string
  section: DocSectionId
  sectionLabel: string
  body: string
  isIndex: boolean
  order: number
}

const SECTION_LABELS: Record<DocSectionId, string> = {
  'getting-started': 'Getting Started',
  overview: 'Overview',
  demo: 'Demo',
  development: 'Development',
  production: 'Production & Ops',
  'tenant-admin': 'Tenant Admin Guide',
  developers: 'Developer Guides',
  security: 'Security & Auth',
  troubleshooting: 'Troubleshooting',
  reference: 'Reference',
  internal: 'Inside Rooiam',
  changelog: 'Changelog',
  misc: 'Misc',
}

const SECTION_ORDER: DocSectionId[] = [
  'getting-started',
  'overview',
  'demo',
  'development',
  'production',
  'tenant-admin',
  'developers',
  'security',
  'troubleshooting',
  'reference',
  'internal',
  'changelog',
  'misc',
]

const rawDocs = import.meta.glob('../../docs/**/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

function stripPrefix(value: string): string {
  return value.replace(/^\d+_/, '')
}

function stripDisplayEmoji(value: string): string {
  return value
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function slugify(value: string): string {
  return stripPrefix(value)
    .replace(/\.md$/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function getTitle(markdown: string, fallback: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim()
  if (heading) {
    return stripDisplayEmoji(heading)
  }
  return stripDisplayEmoji(stripPrefix(fallback)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase()))
}

function classifySection(sourcePath: string, title: string): DocSectionId {
  if (sourcePath.startsWith('internal/')) return 'internal'
  if (sourcePath === 'changelog.md') return 'changelog'

  if (sourcePath.startsWith('getting-started/')) return 'getting-started'
  if (sourcePath.startsWith('demo/')) return 'demo'
  if (sourcePath.startsWith('development/')) return 'development'
  if (sourcePath.startsWith('production/')) return 'production'
  if (sourcePath.startsWith('troubleshooting/')) return 'troubleshooting'
  if (sourcePath.startsWith('reference/')) return 'reference'

  if (title.toLowerCase().includes('tenant')) {
    return 'tenant-admin'
  }

  if (
    sourcePath === 'hosted_login_urls.md' ||
    sourcePath === 'client_workspace_context.md' ||
    sourcePath === 'tenant_api_access.md'
  ) {
    return 'developers'
  }

  if (
    sourcePath === 'account_linking.md' ||
    sourcePath === 'account_linking_implementation.md' ||
    sourcePath === 'identity_data_boundary.md' ||
    title.toLowerCase().includes('security')
  ) {
    return 'security'
  }

  if (
    sourcePath === '00_docs_index.md' ||
    sourcePath === 'architecture.md' ||
    sourcePath === 'marketing.md'
  ) {
    return 'overview'
  }

  return 'misc'
}

function routeFromSource(sourcePath: string): string {
  if (sourcePath === 'getting-started/00_index.md') {
    return '/'
  }
  if (sourcePath === '00_docs_index.md') {
    return '/docs-index'
  }
  const parts = sourcePath.split('/')
  const file = parts.pop() ?? ''
  const stem = file.replace(/\.md$/, '')

  if (file === '00_index.md') {
    return `/${parts.join('/')}`
  }

  const slug = slugify(stem)
  return `/${[...parts, slug].join('/')}`
}

function orderFromSource(sourcePath: string, isIndex: boolean): number {
  if (sourcePath === 'getting-started/00_index.md') return 0
  if (sourcePath === '00_docs_index.md') return 50
  if (isIndex) return 1
  const file = sourcePath.split('/').pop() ?? ''
  const prefix = Number.parseInt(file, 10)
  return Number.isFinite(prefix) ? prefix + 10 : 999
}

const IGNORE_FILES = [
  'marketing.md',
  '00_docs_index.md',
  '01_mission_one_docker.md',
  '02_the_map_of_apps.md',
  '03_mission_two_manual.md',
  '04_mastering_identity_and_roles.md',
  '04_the_identity_lab.md',
  '05_troubleshooting_101.md',
  '06_production_setup.md',
  '05_the_identity_lab.md',
  '06_troubleshooting_101.md',
  '07_production_setup.md'
]

const IGNORE_PATHS: string[] = []

const docs = Object.entries(rawDocs)
  .filter(([importPath]) => {
    if (importPath.includes('/docs/internal/')) return false
    
    // Path-based ignore
    if (IGNORE_PATHS.some(path => importPath.includes(`/docs/${path}`))) return false
    
    // Filename-based ignore
    const file = importPath.split('/').pop() || ''
    if (IGNORE_FILES.includes(file)) return false
    
    return true
  })
  .map(([importPath, body]) => {
    const sourcePath = importPath.replace(/^.*\/docs\//, '')
    const file = sourcePath.split('/').pop() ?? sourcePath
    const title = getTitle(body, file)
    const isIndex = file === '00_index.md' || sourcePath === '00_docs_index.md'
    const section = classifySection(sourcePath, title)
    return {
      sourcePath,
      routePath: routeFromSource(sourcePath),
      title,
      section,
      sectionLabel: SECTION_LABELS[section],
      body,
      isIndex,
      order: orderFromSource(sourcePath, isIndex),
    } satisfies DocMeta
  })
  .sort((left, right) => {
    const sectionOrder =
      SECTION_ORDER.indexOf(left.section) - SECTION_ORDER.indexOf(right.section)
    if (sectionOrder !== 0) return sectionOrder
    if (left.order !== right.order) return left.order - right.order
    return left.title.localeCompare(right.title)
  })

export const docsByRoute = new Map(docs.map((doc) => [doc.routePath, doc]))
export const docsBySource = new Map(docs.map((doc) => [doc.sourcePath, doc]))

export const docsBySection = SECTION_ORDER.map((section) => ({
  id: section,
  label: SECTION_LABELS[section],
  docs: docs.filter((doc) => doc.section === section),
})).filter((group) => group.docs.length > 0)

export const docList = docs

export function getDocByRoute(routePath: string): DocMeta | undefined {
  return docsByRoute.get(routePath)
}

function normalizePath(parts: string[]): string {
  const next: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      next.pop()
      continue
    }
    next.push(part)
  }
  return next.join('/')
}

export function resolveDocHref(currentSource: string, href: string): string | null {
  if (!href) return null
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) {
    return href
  }
  if (href.startsWith('#')) {
    return href
  }

  const [rawPath, rawHash] = href.split('#')
  if (!rawPath.endsWith('.md')) {
    return href
  }

  const baseDir = currentSource.split('/').slice(0, -1)
  const resolvedSource = normalizePath([...baseDir, ...rawPath.split('/')])
  const doc = docsBySource.get(resolvedSource)
  if (!doc) return null
  return rawHash ? `${doc.routePath}#${rawHash}` : doc.routePath
}

export function getPreviousAndNext(routePath: string): {
  previous?: DocMeta
  next?: DocMeta
} {
  const index = docs.findIndex((doc) => doc.routePath === routePath)
  if (index === -1) return {}
  return {
    previous: docs[index - 1],
    next: docs[index + 1],
  }
}
