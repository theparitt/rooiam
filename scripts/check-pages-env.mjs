import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const [mode, ...requiredKeys] = process.argv.slice(2)
if (!mode || requiredKeys.length === 0) {
  console.error('Usage: node check-pages-env.mjs <vite-mode> <required VITE_ keys...>')
  process.exit(2)
}

const values = {}
for (const name of ['.env', '.env.local', `.env.${mode}`, `.env.${mode}.local`]) {
  const file = resolve(process.cwd(), name)
  if (!existsSync(file)) continue

  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    const raw = match[2]
    values[match[1]] = /^(['"]).*\1$/.test(raw) ? raw.slice(1, -1) : raw
  }
}

for (const key of requiredKeys) {
  const value = (process.env[key] ?? values[key] ?? '').trim()
  let url
  try {
    url = new URL(value)
  } catch {
    console.error(`${key} must be set to an absolute HTTPS URL before deploying Pages.`)
    process.exit(1)
  }

  if (url.protocol !== 'https:' || url.username || url.password) {
    console.error(`${key} must be an HTTPS URL without credentials.`)
    process.exit(1)
  }
  if (key === 'VITE_API_URL' && url.pathname.replace(/\/+$/, '') !== '/v1') {
    console.error('VITE_API_URL must include the /v1 API base path.')
    process.exit(1)
  }
}

console.log(`Pages ${mode} configuration checked: ${requiredKeys.join(', ')}`)
