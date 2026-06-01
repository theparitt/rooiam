import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { authRouter } from './routes/auth.js'
import { proxyRouter } from './routes/proxy.js'
import { meRouter } from './routes/me.js'
import { redis } from './session.js'

const app = express()
const PORT = process.env.CANDYCLOUD_PORT || 4000
const ROOIAM_API_URL = (process.env.ROOIAM_API_URL || 'http://localhost:5180/v1').replace(/\/+$/, '')

function rooiamHealthUrl() {
  return `${ROOIAM_API_URL.replace(/\/v1$/, '')}/health`
}

async function runDependencyChecks() {
  const checks = {}

  try {
    await redis.ping()
    checks.redis = 'ok'
  } catch (err) {
    checks.redis = `error: ${err.message}`
  }

  try {
    const r = await fetch(rooiamHealthUrl(), { signal: AbortSignal.timeout(3000) })
    checks.rooiam = r.ok ? 'ok' : `error: ${r.status}`
  } catch (err) {
    checks.rooiam = `error: ${err.message}`
  }

  return checks
}

function printDependencyChecks(checks) {
  console.log('  DEPENDENCY CHECKS')
  console.log(`  Redis            : ${checks.redis === 'ok' ? 'PASS' : `FAIL (${checks.redis})`}`)
  console.log(`  Rooiam API       : ${checks.rooiam === 'ok' ? 'PASS' : `FAIL (${checks.rooiam})`}`)
  console.log(`  Rooiam health URL: ${rooiamHealthUrl()}`)
}

// ── CORS ──────────────────────────────────────────────────────────────────────
// Allow requests from the frontend origin with credentials
const allowedOrigins = (process.env.CANDYCLOUD_ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (e.g. server-to-server) or matching origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
    cb(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
}))

app.use(express.json())
app.use(cookieParser())

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth', authRouter)
app.use('/', meRouter)
app.use('/', proxyRouter)

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const checks = await runDependencyChecks()
  const ok = Object.values(checks).every(v => v === 'ok')
  res.status(ok ? 200 : 503).json({ ok, checks })
})

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  const status = err.status || 500
  res.status(status).json({ error: { message: err.message || 'Internal server error' } })
})

app.listen(PORT, '0.0.0.0', async () => {
  console.log('─────────────────────────────────────────')
  console.log(`  candycloud-api started`)
  console.log(`  PORT             : ${PORT}`)
  console.log(`  ROOIAM_API_URL   : ${ROOIAM_API_URL}`)
  console.log(`  REDIS_URL        : ${process.env.CANDYCLOUD_REDIS_URL || '(not set)'}`)
  console.log(`  COOKIE_SECURE    : ${process.env.CANDYCLOUD_COOKIE_SECURE || 'false'}`)
  console.log(`  COOKIE_DOMAIN    : ${process.env.CANDYCLOUD_COOKIE_DOMAIN || '(not set)'}`)
  console.log(`  ALLOWED_ORIGINS  : ${allowedOrigins.join(', ') || '(none)'}`)
  console.log(`  DB_PATH          : ${process.env.CANDYCLOUD_DB_PATH || '(default)'}`)
  printDependencyChecks(await runDependencyChecks())
  console.log('─────────────────────────────────────────')
})
