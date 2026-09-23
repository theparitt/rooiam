import { build } from '../../rooiam-app/node_modules/esbuild/lib/main.js'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
const notices = await Promise.all(['qrcode/license', 'dijkstrajs/LICENSE.md'].map(path =>
    readFile(new URL('../../rooiam-app/node_modules/' + path, import.meta.url), 'utf8')))
await build({
    entryPoints: [fileURLToPath(new URL('./device-login.js', import.meta.url))],
    outfile: fileURLToPath(new URL('../assets/device-login.js', import.meta.url)),
    nodePaths: [fileURLToPath(new URL('../../rooiam-app/node_modules', import.meta.url))],
    bundle: true, minify: true, format: 'iife', platform: 'browser', target: 'es2020', legalComments: 'eof',
    banner: { js: '/*! Bundled third-party notices:\n' + notices.join('\n\n') + '\n*/' },
})
