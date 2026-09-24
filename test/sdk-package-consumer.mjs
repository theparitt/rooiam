import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const browserDir = path.join(root, 'rooiam-sdk/packages/js-browser')
const serverDir = path.join(root, 'rooiam-sdk/packages/js-server')
const tsc = path.join(browserDir, 'node_modules/.bin/tsc')
const temp = mkdtempSync(path.join(tmpdir(), 'rooiam-sdk-consumer-'))

function run(command, args, cwd) {
  try {
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    process.stderr.write(error.stderr?.toString() || error.message)
    throw error
  }
}

try {
  const archives = [browserDir, serverDir].map(dir => {
    const filename = run('npm', ['pack', '--offline', '--pack-destination', temp, '--silent'], dir).split('\n').at(-1)
    assert.ok(filename?.endsWith('.tgz'), `npm pack did not produce an archive for ${dir}`)
    const archive = path.join(temp, filename)
    const contents = run('tar', ['-tzf', archive], temp).split('\n')
    assert.ok(contents.includes('package/dist/index.js'), `${filename} has no runtime entry`)
    assert.ok(contents.includes('package/dist/index.d.ts'), `${filename} has no types entry`)
    assert.ok(contents.every(name => !name.startsWith('package/src/')), `${filename} includes development source`)
    return archive
  })

  const consumer = path.join(temp, 'consumer')
  mkdirSync(path.join(consumer, 'src'), { recursive: true })
  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name: 'external-rooiam-consumer', private: true, type: 'module' }))
  run('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', ...archives], consumer)
  const sample = `import { RooiamBrowser, buildHostedLoginUrl } from '@rooiam/sdk-browser'
import { RooiamServer } from '@rooiam/sdk-server'

const browser = new RooiamBrowser({ apiBase: 'https://auth.example.com/v1' })
const server = new RooiamServer({ apiBase: 'https://auth.example.com/v1', apiKey: 'test-only' })
const login = buildHostedLoginUrl({ apiOrigin: 'https://auth.example.com', workspaceId: '00000000-0000-4000-8000-000000000001', clientId: 'test-client' })
if (!login.startsWith('https://auth.example.com/') || !browser.deviceLogin || !server) throw new Error('SDK entry points unavailable')
console.log('PASS: packed TypeScript SDKs type-check and run outside the monorepo')
`
  writeFileSync(path.join(consumer, 'src/index.ts'), sample)
  writeFileSync(path.join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, outDir: 'dist', lib: ['ES2022', 'DOM'] }, include: ['src/**/*.ts'] }))
  run(tsc, ['-p', consumer], consumer)
  process.stdout.write(run('node', ['dist/index.js'], consumer) + '\n')
  const installed = ['@rooiam/sdk-browser', '@rooiam/sdk-server'].map(name => JSON.parse(readFileSync(path.join(consumer, 'node_modules', name, 'package.json'), 'utf8')).version)
  process.stdout.write(`Packed SDK versions: browser ${installed[0]}, server ${installed[1]}\n`)
} finally {
  rmSync(temp, { recursive: true, force: true })
}
