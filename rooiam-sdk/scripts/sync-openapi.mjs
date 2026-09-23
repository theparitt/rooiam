import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const check = process.argv.includes('--check')
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, SQLX_OFFLINE: 'true' } })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error))
  return result.stdout
}
const spec = JSON.parse(run('cargo', ['run', '--quiet', '--example', 'export_openapi'], root + '/rooiam-server'))
const destination = root + '/rooiam-sdk/spec/openapi.json'
if (check) {
  if (JSON.stringify(spec) !== JSON.stringify(JSON.parse(readFileSync(destination, 'utf8')))) {
    throw new Error('OpenAPI snapshot differs from the server. Run node rooiam-sdk/scripts/sync-openapi.mjs')
  }
} else writeFileSync(destination, JSON.stringify(spec, null, 2) + '\n')
for (const name of ['js-browser', 'js-server']) {
  const dir = root + '/rooiam-sdk/packages/' + name
  const file = dir + '/src/generated/schema.ts'
  const previous = readFileSync(file, 'utf8')
  const generated = run('npx', ['--no-install', 'openapi-typescript', '../../spec/openapi.json'], dir)
  if (check && previous !== generated) throw new Error(name + ' generated types differ; run sync-openapi.mjs')
  if (!check) writeFileSync(file, generated)
}
console.log(check ? 'OpenAPI and both generated schemas match the server.' : 'OpenAPI and both generated schemas updated.')
