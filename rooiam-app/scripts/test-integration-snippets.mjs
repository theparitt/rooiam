// Compile the actual TypeScript template shown by the portal, against the built
// browser package. A normal app build cannot typecheck code inside a string.
import ts from 'typescript'
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
import { buildHostedLoginUrl } from '@rooiam/sdk-browser'

const file = resolve('src/pages/portal/PortalWorkspaceAppIntegration.tsx')
const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let template
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'tsClient') template = node.initializer.getText(source)
  ts.forEachChild(node, visit)
}
visit(source)
assert.ok(template, 'portal must expose its TypeScript integration snippet')
const snippet = new Function('apiBase', 'clientId', 'redirectUri', `return ${template}`)(
  'https://api.example.test/v1', 'public-client', 'https://app.example.test/callback',
)
const directory = mkdtempSync(resolve('.snippet-test-'))
try {
  const consumer = join(directory, 'consumer.ts')
  writeFileSync(consumer, snippet + `\nasync function verifyTokenTypes() {
    const tokens = await rooiam.oidc.exchangeCode({clientId: CLIENT_ID, redirectUri: REDIRECT_URI, code: 'code', codeVerifier: 'verifier'})
    const access: string = tokens.access_token
    const expiry: number = tokens.expires_in
    const refresh: string | null | undefined = tokens.refresh_token
    return { access, expiry, refresh }
  }\n`)
  const program = ts.createProgram([consumer], { noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler })
  const diagnostics = ts.getPreEmitDiagnostics(program)
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: name => name, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n',
  }))
  for (const fixture of JSON.parse(readFileSync('../rooiam-sdk/spec/widget-contract.json', 'utf8'))) {
    assert.equal(new URL(buildHostedLoginUrl(fixture.options)).search.slice(1), fixture.query)
  }
  // Evaluate the actual URL and iframe templates copied from the widget page.
  const widgetFile = resolve('src/pages/portal/PortalWorkspaceLoginWidget.tsx')
  const widgetSource = ts.createSourceFile(widgetFile, readFileSync(widgetFile, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const initializers = new Map()
  function collect(node) {
    if (ts.isVariableDeclaration(node) && node.initializer) initializers.set(node.name.getText(widgetSource), node.initializer.getText(widgetSource))
    ts.forEachChild(node, collect)
  }
  collect(widgetSource)
  const fixture = JSON.parse(readFileSync('../rooiam-sdk/spec/widget-contract.json', 'utf8'))[0]
  const loginUrl = new Function('buildHostedLoginUrl', 'apiOrigin', 'currentOrg', 'clientId', `return ${initializers.get('loginUrl')}`)(buildHostedLoginUrl, fixture.options.apiOrigin, {id: fixture.options.workspaceId}, fixture.options.clientId)
  const iframe = new Function('loginUrl', `return ${initializers.get('iframeSnippet')}`)(loginUrl)
  const src = /src="([^"]+)"/.exec(iframe)?.[1]
  assert.equal(new URL(src).search.slice(1), fixture.query)
  // The selected app wins over a stale requested client, including JSON output.
  const selectClient = new Function('widgetApp', 'requestedClientId', `return ${initializers.get('clientId')}`)
  assert.equal(selectClient({client: {client_id: 'selected-client'}}, 'stale-client'), 'selected-client')
  assert.equal(selectClient(null, ' requested-client '), 'requested-client')
  console.log('Portal TypeScript snippet compiles; generated iframe matches the server widget contract.')
} finally {
  rmSync(directory, { recursive: true, force: true })
}
