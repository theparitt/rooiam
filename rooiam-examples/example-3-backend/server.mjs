import express from 'express'
import dotenv from 'dotenv'
import path from 'node:path'
import {
  callWorkspaceApi,
  normalizeBaseUrl,
} from '../shared/example-helpers.mjs'

dotenv.config({ path: path.join(process.cwd(), '.env') })

const app = express()
const port = Number(process.env.PORT || 5182)
const apiBase = normalizeBaseUrl(process.env.ROOIAM_API_BASE, 'http://localhost:5170/v1')
const apiKey = (process.env.ROOIAM_API_KEY || '').trim()
app.use(express.json())

async function fetchWorkspaceInfo() {
  const result = await callWorkspaceApi({
    apiBase,
    apiKey,
    pathname: '/orgs/integrations/workspace',
  })
  return result.ok ? { data: result.data } : { error: result.error || 'Could not reach Rooiam API.' }
}

function resolveApiKeyFromExampleRequest(req) {
  const fromInput = String(req.get('x-example-api-key') || '').trim()
  return fromInput || apiKey
}

async function callRooiamIntegration(pathname, options = {}, rawApiKey = apiKey) {
  // Example 3 is deliberately a thin backend proxy. Keep this wrapper small so
  // a developer can see the exact handoff from browser -> example server ->
  // workspace API-key endpoint on Rooiam.
  const result = await callWorkspaceApi({
    apiBase,
    apiKey: rawApiKey,
    pathname,
    method: options.method || 'GET',
    body: options.body,
  })

  if (!result.ok) {
    const missingKey = !String(rawApiKey || '').trim()
    return {
      error: missingKey
        ? 'Missing workspace API key. Paste it into the page input or set ROOIAM_API_KEY in example-3-backend/.env'
        : (result.error || 'Could not reach Rooiam API.'),
    }
  }

  return { data: result.data }
}

async function callRooiamFromRequest(req, pathname, options = {}) {
  return callRooiamIntegration(pathname, options, resolveApiKeyFromExampleRequest(req))
}

function withForwardedQuery(req, pathname, allowedKeys = []) {
  const query = new URLSearchParams()
  for (const key of allowedKeys) {
    const raw = req.query?.[key]
    if (raw === undefined || raw === null) continue
    const value = String(raw).trim()
    if (!value) continue
    query.set(key, value)
  }
  const qs = query.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

function jsonError(message, status = 500) {
  return {
    ok: false,
    error: { message, status },
  }
}

function layout({ title, body }) {
  // Example 3 intentionally keeps all UI in one file so the browser demo is
  // easy to run. The helpers above keep the noisy config/fetch plumbing out of
  // the route handlers, and the large HTML block below acts like a static docs
  // page with a thin dynamic API proxy underneath it.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap');
    :root {
      --bg: #f1f3f9;
      --ink: #1f2937;
      --muted: #6b7280;
      --border: #e8eaf3;
      --card: #ffffff;
      --sky: #eef7ff;
      --sky-border: #bfdcf8;
      --green: #effcf3;
      --green-border: #bfe7c8;
      --amber: #fff7d6;
      --amber-border: #f0d57b;
      --rose: #fff1f2;
      --rose-border: #fecdd3;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: 'Nunito', system-ui, sans-serif;
      color: var(--ink);
      background: var(--bg);
    }
    .shell { max-width: 1180px; margin: 0 auto; padding: 20px 18px 40px; }
    .hero {
      display:flex; justify-content:space-between; align-items:flex-start; gap:16px;
      margin-bottom:14px; padding-bottom:14px; border-bottom:1px solid var(--border);
    }
    .hero h1 { margin:0; font-size:1.55rem; line-height:1.1; letter-spacing:-0.02em; }
    .hero p { margin:6px 0 0; color:var(--muted); font-weight:600; line-height:1.55; font-size:0.95rem; max-width:760px; }
    .grid { display:grid; gap:18px; grid-template-columns:repeat(2, minmax(0, 1fr)); align-items:start; }
    .stack { display:grid; gap:12px; }
    .card {
      background:var(--card);
      border:1px solid var(--border);
      border-radius:18px;
      padding:18px;
    }
    .card h2 { margin:0 0 8px; font-size:1.05rem; }
    .card p { margin:0; color:var(--muted); font-size:0.95rem; font-weight:600; line-height:1.6; }
    .hint {
      border-radius:14px; padding:12px 14px; border:1px solid var(--sky-border); background:var(--sky);
      font-size:14px; font-weight:700; line-height:1.6;
    }
    .hint.ok { background: var(--green); border-color: var(--green-border); }
    .hint.warn { background: var(--amber); border-color: var(--amber-border); }
    .hint.danger { background: var(--rose); border-color: var(--rose-border); }
    .meta-grid { display:grid; gap:12px; grid-template-columns:repeat(2, minmax(0, 1fr)); }
    .meta-item {
      border-radius:14px; background:white; border:1px solid var(--border); padding:12px 14px; min-height:78px;
    }
    .meta-item .k {
      font-size:11px; font-weight:800; letter-spacing:.14em; text-transform:uppercase;
      color:#9ca3af; margin-bottom:6px;
    }
    .meta-item .v { font-size:0.98rem; font-weight:800; word-break:break-word; }
    .list { margin: 14px 0 0; padding-left: 18px; color: #334155; font-size: 14px; line-height: 1.65; font-weight: 700; }
    .list li + li { margin-top: 6px; }
    .checklist {
      display:none;
    }
    .check-item {
      display:flex; gap:10px; align-items:flex-start;
      border-radius:12px; background:white; border:1px solid var(--border); padding:10px 12px;
      font-size:14px; line-height:1.55; font-weight:700; color:#334155;
    }
    .check-mark {
      width:22px; height:22px; border-radius:999px; flex:0 0 auto;
      display:inline-flex; align-items:center; justify-content:center;
      font-size:12px; font-weight:900;
    }
    .check-mark.done {
      background:var(--green); border:1px solid var(--green-border); color:#166534;
    }
    .check-mark.todo {
      background:var(--amber); border:1px solid var(--amber-border); color:#92400e;
    }
    .check-mark.info {
      background:#eef2ff; border:1px solid #c7d2fe; color:#4338ca;
    }
    .code {
      margin-top: 10px; padding: 12px 14px; border-radius: 12px; background: #0f172a; color: #f8fafc;
      font: 12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; overflow-x: auto; white-space: pre-wrap;
      border:1px solid #1e293b;
    }
    .action-list { display:grid; gap:28px; margin-top:12px; }
    .docs-layout {
      display:grid;
      grid-template-columns:292px minmax(0, 1fr);
      gap:22px;
      align-items:start;
    }
    .docs-sidebar {
      position:sticky;
      top:24px;
      border-radius:14px;
      border:1px solid var(--border);
      background:#ffffff;
      padding:10px;
      max-height:calc(100vh - 48px);
      overflow:auto;
      overscroll-behavior:contain;
      scrollbar-gutter: stable;
      z-index:10;
      scrollbar-width:none;
    }
    .docs-sidebar::-webkit-scrollbar {
      width:0;
      height:0;
    }
    .docs-sidebar:hover {
      scrollbar-width:thin;
    }
    .docs-sidebar:hover::-webkit-scrollbar {
      width:10px;
      height:10px;
    }
    .docs-sidebar:hover::-webkit-scrollbar-track {
      background:transparent;
    }
    .docs-sidebar:hover::-webkit-scrollbar-thumb {
      background:#cbd5e1;
      border-radius:999px;
      border:2px solid transparent;
      background-clip:padding-box;
    }
    .docs-sidebar h3 {
      margin:0 0 10px;
      font-size:12px;
      font-weight:900;
      letter-spacing:.12em;
      text-transform:uppercase;
      color:#64748b;
    }
    .docs-nav {
      display:grid;
      gap:6px;
      max-height:none;
      overflow:visible;
      padding-right:0;
    }
    .docs-nav-section {
      display:grid;
      gap:4px;
    }
    .docs-nav-top {
      display:grid;
      grid-template-columns:minmax(0, 1fr) 28px;
      gap:6px;
      align-items:center;
    }
    .docs-nav a {
      display:flex;
      align-items:center;
      gap:10px;
      border-radius:10px;
      padding:8px 9px;
      color:#334155;
      text-decoration:none;
      font-size:12px;
      font-weight:800;
      line-height:1.4;
      border:1px solid transparent;
      background:#f8fafc;
    }
    .docs-nav a:hover {
      background:#eef2ff;
      border-color:#dbe4ff;
      color:#312e81;
    }
    .docs-nav a.active {
      background:#ede9fe;
      border-color:#d8b4fe;
      color:#5b21b6;
    }
    .docs-nav-toggle {
      display:inline-flex;
      align-items:center;
      justify-content:center;
      width:28px;
      height:28px;
      border-radius:9px;
      border:1px solid var(--border);
      background:#fff;
      color:#64748b;
      font-size:13px;
      font-weight:900;
      cursor:pointer;
    }
    .docs-nav-toggle-spacer {
      display:block;
      width:28px;
      height:28px;
      flex:0 0 auto;
    }
    .docs-nav-toggle:hover {
      background:#f8fafc;
      border-color:#cbd5e1;
      color:#334155;
    }
    .docs-nav-submenu {
      display:grid;
      gap:4px;
      padding-left:10px;
      border-left:2px solid #ebe7ff;
      margin-left:10px;
    }
    .docs-nav-submenu[hidden] {
      display:none !important;
    }
    .docs-nav-subitem {
      display:flex;
      align-items:center;
      gap:8px;
      border-radius:9px;
      padding:6px 8px;
      color:#475569;
      text-decoration:none;
      font-size:11px;
      font-weight:700;
      line-height:1.4;
      border:1px solid transparent;
      background:transparent;
    }
    .docs-nav-subitem:hover {
      background:#f8fafc;
      border-color:#e2e8f0;
      color:#312e81;
    }
    .docs-nav-subitem.sync-active {
      background:transparent;
      border-color:transparent;
      color:#4338ca;
      box-shadow: inset 0 -2px 0 #c4b5fd;
    }
    .docs-nav-submethod {
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-width:42px;
      border-radius:999px;
      padding:3px 7px;
      color:#fff;
      font-size:9px;
      font-weight:900;
      letter-spacing:.08em;
      text-transform:uppercase;
      flex:0 0 auto;
    }
    .docs-nav-submethod.get { background:#0f172a; }
    .docs-nav-submethod.post { background:#14532d; }
    .docs-nav-submethod.patch { background:#4c1d95; }
    .docs-nav-submethod.delete { background:#7f1d1d; }
    .docs-nav-subpath {
      min-width:0;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    .docs-nav-index {
      display:inline-flex;
      width:22px;
      height:22px;
      align-items:center;
      justify-content:center;
      border-radius:999px;
      background:#fff;
      border:1px solid var(--border);
      font-size:11px;
      font-weight:900;
      color:#64748b;
      flex:0 0 auto;
    }
    .docs-main {
      min-width:0;
      padding-bottom:85vh;
    }
    .action-card {
      border-radius:12px; background:white; border:1px solid var(--border); padding:12px;
      scroll-margin-top:24px;
    }
    #workspace-objects-section > .action-card:nth-child(odd) {
      background:#fcfbff;
    }
    #workspace-objects-section > .action-card:nth-child(even) {
      background:#fbfdff;
    }
    .action-card h3 {
      display:block;
      margin:0 0 4px;
      padding:0;
      background:transparent;
      color:#312e81;
      font-size:15px;
      font-weight:900;
      line-height:1.2;
    }
    .action-card p { margin:0; font-size:13px; color:#64748b; }
    .card-head {
      display:flex;
      align-items:flex-start;
      justify-content:space-between;
      gap:14px;
      margin-bottom:8px;
    }
    .card-title {
      min-width:0;
      display:flex;
      flex-direction:column;
      gap:8px;
    }
    .card-toggle {
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:12px;
      border:1px solid var(--border);
      background:#fff;
      color:#475569;
      width:36px;
      height:36px;
      font-size:16px;
      font-weight:900;
      cursor:pointer;
      flex:0 0 auto;
    }
    .card-toggle:hover {
      background:#f8fafc;
      border-color:#cbd5e1;
    }
    .card-toggle[aria-expanded="false"] {
      color:#64748b;
    }
    .card-body[hidden] {
      display:none !important;
    }
    .action-bar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:10px; }
    .method {
      display:inline-flex; align-items:center; justify-content:center; min-width:64px;
      border-radius:999px; padding:6px 10px; color:#fff;
      font-size:11px; font-weight:800; letter-spacing:.08em; text-transform:uppercase;
    }
    .method.get { background:#0f172a; }
    .method.post { background:#14532d; }
    .method.patch { background:#4c1d95; }
    .method.delete { background:#7f1d1d; }
    .request-path {
      display:flex;
      align-items:center;
      gap:10px;
      flex-wrap:wrap;
      margin-top:2px;
      padding:8px 10px;
      border-radius:10px;
      background:#f8fafc;
      border:1px solid #e6ebf4;
      cursor:pointer;
      transition:background-color .14s ease, border-color .14s ease;
    }
    .request-path:hover {
      background:#f3f6fb;
      border-color:#d6dfef;
    }
    .request-path.is-disabled {
      opacity:.55;
      cursor:not-allowed;
      background:#f8fafc;
      border-color:#e6ebf4;
    }
    .request-path code {
      font-size:12px;
      color:#1e293b;
      font-weight:800;
      white-space:pre-wrap;
      word-break:break-word;
    }
    .request-clear {
      display:inline-flex;
      align-items:center;
      justify-content:center;
      margin-left:auto;
      width:28px;
      height:28px;
      border-radius:999px;
      border:1px solid #e2e8f0;
      background:#fff;
      color:#64748b;
      font-size:16px;
      font-weight:900;
      line-height:1;
      cursor:pointer;
      flex:0 0 auto;
    }
    .request-clear:hover {
      background:#f8fafc;
      border-color:#cbd5e1;
      color:#334155;
    }
    .request-clear[hidden] {
      display:none !important;
    }
    .request-copy {
      margin-top:8px;
      font-size:13px;
      line-height:1.55;
      color:#475569;
      font-weight:700;
    }
    .param-toggle {
      display:inline-flex;
      align-items:center;
      gap:6px;
      margin-top:10px;
      padding:0;
      border:0;
      background:transparent;
      color:#6d28d9;
      font-size:12px;
      font-weight:800;
      letter-spacing:.02em;
      cursor:pointer;
    }
    .param-toggle:hover {
      color:#5b21b6;
      text-decoration:underline;
    }
    .param-toggle-icon {
      display:inline-flex;
      align-items:center;
      justify-content:center;
      width:18px;
      height:18px;
      border-radius:999px;
      border:1px solid #ddd6fe;
      background:#f5f3ff;
      color:#7c3aed;
      font-size:11px;
      line-height:1;
    }
    .param-panel {
      display:grid;
      gap:10px;
      margin-top:10px;
      padding:12px;
      border:1px solid #e9e5ff;
      border-radius:12px;
      background:#faf7ff;
    }
    .param-panel[hidden] {
      display:none !important;
    }
    .param-meta {
      font-size:12px;
      color:#7c3aed;
      font-weight:700;
    }
    .meta-line {
      margin-top:8px; font-size:13px; line-height:1.7; color:#334155; font-weight:700;
    }
    .meta-line.request-trigger {
      display:flex;
      align-items:center;
      gap:10px;
      flex-wrap:wrap;
      cursor:pointer;
      border:1px solid #e5e7eb;
      background:#f8fafc;
      border-radius:12px;
      padding:8px 10px;
      margin-top:12px;
      transition:background-color .16s ease, border-color .16s ease;
    }
    .meta-line.request-trigger:hover {
      background:#f1f5f9;
      border-color:#cbd5e1;
    }
    .meta-line.request-trigger:focus-visible {
      outline:none;
      box-shadow:0 0 0 3px rgba(148, 163, 184, 0.22);
    }
    .meta-line code { font-size:12px; }
    .kv {
      display:grid; gap:8px; margin-top:12px;
    }
    .kv-table {
      display:grid;
      gap:0;
      border:1px solid var(--border);
      border-radius:10px;
      overflow:hidden;
      background:#fbfcfe;
    }
    .kv-entry {
      display:grid;
      grid-template-columns:136px 1fr;
      gap:0;
      align-items:stretch;
    }
    .kv-entry div {
      padding:7px 10px;
    }
    .kv-entry div + div {
      border-left:1px solid var(--border);
    }
    .kv-entry-name,
    .kv-entry-value {
      font-size:13px;
      line-height:1.7;
      color:#334155;
      font-weight:700;
    }
    .kv-entry-name {
      background:#f3f6fb;
      color:#64748b;
      text-transform:uppercase;
      letter-spacing:.08em;
      font-size:11px;
      font-weight:800;
    }
    .kv-entry-value code { font-size:12px; white-space:pre-wrap; word-break:break-word; }
    .kv-row {
      display:grid; grid-template-columns:160px 1fr; gap:12px; align-items:start;
      font-size:13px; line-height:1.7; color:#334155; font-weight:700;
    }
    .kv-name {
      color:#64748b;
      text-transform:uppercase;
      letter-spacing:.08em;
      font-size:11px;
      font-weight:800;
    }
    .kv-value code { font-size:12px; white-space:pre-wrap; word-break:break-word; }
    .badge {
      display:inline-flex; align-items:center; border-radius:999px; padding:4px 10px;
      font-size:11px; font-weight:800; letter-spacing:.05em; text-transform:uppercase;
      border:1px solid var(--border); background:#fff;
    }
    .badge.ok { background:var(--green); border-color:var(--green-border); }
    .badge.warn { background:var(--amber); border-color:var(--amber-border); }
    .btn {
      display:inline-flex; align-items:center; justify-content:center; gap:8px;
      text-decoration:none; border-radius:12px; padding:10px 14px;
      font-size:14px; font-weight:800; border:1px solid transparent;
      cursor:pointer;
    }
    .btn.get { background:#0f172a; color:#fff; border-color:#0f172a; }
    .btn.post { background:#14532d; color:#fff; border-color:#14532d; }
    .btn.patch { background:#4c1d95; color:#fff; border-color:#4c1d95; }
    .btn.delete { background:#7f1d1d; color:#fff; border-color:#7f1d1d; }
    .btn[disabled] {
      opacity:.6; cursor:wait;
    }
    .input, .select {
      width: 100%;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: #fff;
      color: var(--ink);
      padding: 12px 14px;
      font: 700 14px/1.5 'Nunito', system-ui, sans-serif;
      outline: none;
    }
    .input:focus, .select:focus {
      border-color: #cdb4ff;
      box-shadow: 0 0 0 3px rgba(205, 180, 255, 0.18);
    }
    .control-grid {
      display:grid; gap:10px; grid-template-columns:repeat(2, minmax(0, 1fr)); margin-top:12px;
    }
    .label {
      display:block; margin-bottom:6px; font-size:11px; font-weight:800; letter-spacing:.08em;
      text-transform:uppercase; color:#9ca3af;
    }
    .endpoint-list { display:grid; gap:10px; margin-top:12px; }
    .endpoint {
      border-radius:14px; background:white; border:1px solid var(--border); padding:12px 14px;
      font-size:14px; font-weight:700; line-height:1.6;
    }
    .request-list {
      display:grid;
      gap:12px;
      margin-top:12px;
    }
    .request-item {
      border:1px solid var(--border);
      border-radius:14px;
      padding:12px 14px;
      background:#fff;
    }
    .request-item + .request-item {
      margin-top:2px;
    }
    .preset-grid {
      display:grid;
      gap:14px;
      grid-template-columns:repeat(2, minmax(0, 1fr));
      margin-top:12px;
    }
    .preset-card {
      border-radius:14px;
      border:1px solid var(--border);
      background:#fff;
      padding:14px;
    }
    .preset-card.owner {
      background:#effcf3;
      border-color:#bfe7c8;
    }
    .preset-card.admin {
      background:#eef7ff;
      border-color:#bfdcf8;
    }
    .preset-card h4 {
      margin:0;
      font-size:14px;
      font-weight:900;
    }
    .preset-card p {
      margin:6px 0 0;
      font-size:13px;
      color:var(--muted);
      font-weight:700;
      line-height:1.6;
    }
    .preset-list {
      display:grid;
      gap:8px;
      margin-top:12px;
    }
    .preset-item {
      border-radius:12px;
      background:rgba(255,255,255,.8);
      border:1px solid rgba(255,255,255,.8);
      padding:9px 11px;
      font-size:13px;
      line-height:1.55;
      font-weight:800;
      color:#334155;
    }
    .preset-item.blocked {
      background:#fff1f2;
      border-color:#fecdd3;
      color:#9f1239;
    }
    .matrix-table {
      margin-top:14px;
      border-radius:14px;
      border:1px solid var(--border);
      overflow:hidden;
      background:#fff;
    }
    .matrix-table table {
      width:100%;
      border-collapse:collapse;
      min-width:760px;
    }
    .matrix-table th {
      padding:12px 14px;
      border-bottom:1px solid var(--border);
      background:#f8fafc;
      color:#64748b;
      font-size:11px;
      font-weight:900;
      letter-spacing:.12em;
      text-transform:uppercase;
      text-align:left;
    }
    .matrix-table td {
      padding:12px 14px;
      border-bottom:1px solid var(--border);
      font-size:13px;
      font-weight:800;
      color:#334155;
      vertical-align:top;
    }
    .matrix-table tbody tr:last-child td {
      border-bottom:none;
    }
    .matrix-pill {
      display:inline-flex;
      border-radius:999px;
      padding:5px 10px;
      font-size:11px;
      font-weight:900;
      letter-spacing:.08em;
      text-transform:uppercase;
      background:#f1f5f9;
      color:#475569;
    }
    .matrix-yes.owner {
      background:#dcfce7;
      color:#166534;
    }
    .matrix-yes.admin {
      background:#e0f2fe;
      color:#0369a1;
    }
    .matrix-no {
      background:#f1f5f9;
      color:#94a3b8;
    }
    .perm-verb {
      display:inline-flex;
      border-radius:999px;
      padding:5px 10px;
      margin-right:8px;
      border:1px solid transparent;
      font-size:11px;
      font-weight:900;
      letter-spacing:.08em;
      text-transform:uppercase;
      vertical-align:middle;
    }
    .perm-verb.read { background:#e0f2fe; border-color:#bae6fd; color:#0369a1; }
    .perm-verb.write { background:#fef3c7; border-color:#fde68a; color:#b45309; }
    .perm-verb.create { background:#dcfce7; border-color:#bbf7d0; color:#166534; }
    .perm-verb.update { background:#ede9fe; border-color:#ddd6fe; color:#6d28d9; }
    .perm-verb.delete { background:#ffe4e6; border-color:#fecdd3; color:#be123c; }
    .perm-verb.rotate { background:#fae8ff; border-color:#f5d0fe; color:#a21caf; }
    .perm-verb.revoke { background:#fee2e2; border-color:#fecaca; color:#b91c1c; }
    .perm-verb.creates,
    .perm-verb.works { background:#e2e8f0; border-color:#cbd5e1; color:#475569; }
    .section-note-list {
      display:grid;
      gap:10px;
      margin-top:14px;
    }
    .section-note {
      border-radius:12px;
      border:1px solid var(--border);
      background:#fff;
      padding:10px 12px;
      font-size:13px;
      line-height:1.6;
      font-weight:800;
      color:#334155;
    }
    .request-path {
      display:flex;
      align-items:center;
      gap:10px;
      flex-wrap:wrap;
      margin-bottom:10px;
      cursor:pointer;
      border-radius:12px;
      padding:8px 10px;
      border:1px solid #e5e7eb;
      background:#f8fafc;
      transition:background-color .16s ease, border-color .16s ease;
    }
    .request-path:hover {
      background:#f1f5f9;
      border-color:#cbd5e1;
    }
    .request-path:focus-visible {
      outline:none;
      box-shadow:0 0 0 3px rgba(148, 163, 184, 0.22);
    }
    .request-path code {
      color:#0f172a;
      font-size:14px;
      font-weight:800;
    }
    .request-copy {
      color:var(--muted);
      font-size:14px;
      font-weight:700;
      line-height:1.6;
      margin-bottom:8px;
    }
    .endpoint strong {
      display:inline-flex; min-width:96px; border-radius:999px; padding:4px 10px; margin-right:10px;
      background:#111827; color:#fff; font-size:12px; letter-spacing:.08em;
    }
    .muted { color: var(--muted); }
    .action-bar,
    .action-bar.inline-hidden {
      display:none !important;
    }
    .json-view { white-space: pre-wrap; }
    .json-key { color:#93c5fd; }
    .json-string { color:#86efac; }
    .json-number { color:#fca5a5; }
    .json-boolean { color:#f9a8d4; }
    .json-null { color:#c4b5fd; }
    @media (max-width: 980px) {
      .docs-layout { grid-template-columns:1fr; }
      .docs-sidebar { position:static; }
      .grid, .meta-grid { grid-template-columns: 1fr; }
      .hero { flex-direction:column; }
      .kv-row { grid-template-columns: 1fr; gap:4px; }
      .preset-grid { grid-template-columns:1fr; }
    }
  </style>
</head>
<body>
  <main class="shell">${body}</main>
  <script>
    const byId = (id) => document.getElementById(id)
    const RESPONSE_PLACEHOLDER = 'The JSON response will appear here.'

    // These tracked objects power the small "docs UI" state on 5182.
    // The goal is to keep enough local state to make repeated requests easier
    // to demo, without turning this file into a full frontend framework app.
    const state = {
      lastClientId: null,
      invites: [],
      members: [],
    }

    // --- Small UI helpers -------------------------------------------------

    function currentExampleApiKey() {
      const input = byId('workspace-api-key')
      if (!input) return ''
      if (input.dataset.prefilled === 'env') return ''
      return input.value.trim()
    }

    function renderHint(target, level, html) {
      target.className = 'hint ' + level
      target.innerHTML = html
    }

    function syncClearButton(note, code) {
      const item = note?.closest('.request-item') || code?.closest('.request-item')
      const clear = item?.querySelector('.request-clear')
      if (!clear) return
      clear.hidden = Boolean(note?.hidden !== false && code?.hidden !== false)
    }

    function escapeHtml(value) {
      return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
    }

    function renderJson(code, payload) {
      const json = JSON.stringify(payload, null, 2)
      const html = escapeHtml(json).replace(
        /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?/g,
        (match, stringLiteral, keySuffix, keyword) => {
          if (stringLiteral) {
            if (keySuffix) return '<span class="json-key">' + stringLiteral + '</span>' + keySuffix
            return '<span class="json-string">' + stringLiteral + '</span>'
          }
          if (keyword === 'true' || keyword === 'false') return '<span class="json-boolean">' + match + '</span>'
          if (keyword === 'null') return '<span class="json-null">' + match + '</span>'
          return '<span class="json-number">' + match + '</span>'
        }
      )
      code.innerHTML = html
    }

    async function requestJson(url, options = {}) {
      const headers = { ...(options.headers || {}) }
      const apiKeyValue = currentExampleApiKey()
      if (apiKeyValue) {
        headers['X-Example-Api-Key'] = apiKeyValue
      }
      let body
      if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json'
        body = JSON.stringify(options.body)
      }
      const response = await fetch(url, {
        method: options.method || 'GET',
        credentials: 'same-origin',
        headers,
        body,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error?.message || response.statusText || 'Request failed.')
      }
      return data
    }

    function setLoading(button, code, label) {
      button.dataset.loading = 'true'
      if (button instanceof HTMLButtonElement) {
        button.disabled = true
        button.dataset.originalLabel = button.textContent
        button.textContent = label
      } else {
        button.classList.add('is-loading')
        button.setAttribute('aria-busy', 'true')
      }
      code.hidden = false
      code.textContent = 'Loading...'
      const note = code.closest('.request-item')?.querySelector('.hint')
      syncClearButton(note, code)
    }

    function clearLoading(button) {
      delete button.dataset.loading
      if (button instanceof HTMLButtonElement) {
        button.disabled = false
        button.textContent = button.dataset.originalLabel || 'Run request'
      } else {
        button.classList.remove('is-loading')
        button.removeAttribute('aria-busy')
      }
    }

    function setIdle(note, html) {
      note.hidden = false
      renderHint(note, 'warn', html)
      const code = note.closest('.request-item')?.querySelector('.json-view')
      syncClearButton(note, code)
    }

    function setSuccess(note, html) {
      note.hidden = false
      renderHint(note, 'ok', html)
      const code = note.closest('.request-item')?.querySelector('.json-view')
      syncClearButton(note, code)
    }

    function setFailure(note, html) {
      note.hidden = false
      renderHint(note, 'danger', html)
      const code = note.closest('.request-item')?.querySelector('.json-view')
      syncClearButton(note, code)
    }

    function resetResponseBlock(item) {
      const note = item.querySelector('.hint')
      const code = item.querySelector('.json-view')
      if (note) {
        note.hidden = true
        note.className = 'hint'
        note.innerHTML = ''
      }
      if (code) {
        code.hidden = true
        code.textContent = RESPONSE_PLACEHOLDER
      }
      syncClearButton(note, code)
    }

    function buildUrlWithParams(baseUrl, actionId) {
      const fields = requestParamMap[actionId] || []
      const query = new URLSearchParams()
      fields.forEach((field) => {
        if (field.kind !== 'query') return
        const value = getRequestParamValue(actionId, field.name, field.source || '')
        if (!value) return
        query.set(field.name, value)
      })
      const qs = query.toString()
      return qs ? baseUrl + '?' + qs : baseUrl
    }

    async function bindAction(id, url) {
      const button = byId(id + '-btn')
      const trigger = byId(id + '-trigger') || button?.closest('.request-item')?.querySelector('.request-path') || button
      const code = byId(id + '-code')
      const note = byId(id + '-note')
      if (!trigger || !code || !note) return
      const run = async () => {
        setLoading(trigger, code, 'Calling...')
        try {
          const resolvedUrl = buildUrlWithParams(url, id)
          const data = await requestJson(resolvedUrl)
          renderJson(code, data)
          setSuccess(note, '<strong>Request succeeded.</strong><br />The browser called <code>' + resolvedUrl + '</code> on <code>5182</code>.')
          if (id === 'clients') {
            await syncClients(true)
          }
          if (id === 'invites') {
            await syncInvites(true)
          }
          if (id === 'members') {
            await syncMembers(true)
          }
        } catch (error) {
          renderJson(code, { ok: false, error: error.message || 'Request failed.' })
          setFailure(note, '<strong>Request failed.</strong><br />' + (error && error.message ? error.message : 'Unknown error.'))
        } finally {
          clearLoading(trigger)
        }
      }
      trigger.addEventListener('click', run)
      trigger.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          run()
        }
      })
    }

    function refreshClientBadge() {
      const target = byId('client-target')
      if (!target) return
      if (!state.lastClientId) {
        target.textContent = 'No tracked test client yet.'
        syncParamDefaults()
        return
      }
      const client = (state.clients || []).find(item => item.client.id === state.lastClientId)
      if (!client) {
        target.textContent = 'Tracked client is no longer present.'
        syncParamDefaults()
        return
      }
      target.textContent = client.client.app_name + ' (' + client.client.status + ')'
      syncParamDefaults()
    }

    function populateInviteSelect() {
      const select = byId('invite-select')
      if (!select) return
      const currentValue = select.value
      select.innerHTML = ''
      if (!state.invites.length) {
        const option = document.createElement('option')
        option.value = ''
        option.textContent = 'No pending invites'
        select.appendChild(option)
        refreshInviteActions()
        syncParamDefaults()
        return
      }
      state.invites.forEach((invite) => {
        const option = document.createElement('option')
        option.value = invite.id
        option.textContent = invite.email + ' · ' + new Date(invite.created_at).toLocaleString()
        select.appendChild(option)
      })
      select.value = state.invites.some((invite) => invite.id === currentValue) ? currentValue : state.invites[0].id
      refreshInviteActions()
      syncParamDefaults()
    }

    function setActionEnabled(id, enabled, emptyHtml) {
      const button = byId(id + '-btn')
      const trigger = byId(id + '-trigger') || button?.closest('.request-item')?.querySelector('.request-path') || button
      const note = byId(id + '-note')
      if (button) button.disabled = !enabled
      if (trigger instanceof HTMLElement) {
        trigger.classList.toggle('is-disabled', !enabled)
        trigger.setAttribute('aria-disabled', enabled ? 'false' : 'true')
      }
      if (!note) return
      if (enabled) {
        note.hidden = true
        return
      }
      note.hidden = false
      renderHint(note, 'warn', emptyHtml)
    }

    function refreshInviteActions() {
      const hasInvite = Boolean(byId('invite-select')?.value)
      setActionEnabled('invite-detail', hasInvite, '<strong>No pending invite selected.</strong><br />Create or load an invite first.')
      setActionEnabled('revoke-invite', hasInvite, '<strong>No pending invite selected.</strong><br />Create or load an invite first.')
    }

    function populateMemberSelect() {
      const select = byId('member-select')
      if (!select) return
      const currentValue = select.value
      select.innerHTML = ''
      if (!state.members.length) {
        const option = document.createElement('option')
        option.value = ''
        option.textContent = 'No members loaded'
        select.appendChild(option)
        syncParamDefaults()
        return
      }
      state.members.forEach((member) => {
        const option = document.createElement('option')
        option.value = member.id
        const roleCodes = Array.isArray(member.role_codes) ? member.role_codes.join(', ') : ''
        option.textContent = member.display_name + ' · ' + member.email + (roleCodes ? ' · ' + roleCodes : '')
        select.appendChild(option)
      })
      select.value = state.members.some((member) => member.id === currentValue) ? currentValue : state.members[0].id
      syncMemberProfileDraft()
      syncParamDefaults()
    }

    function syncMemberProfileDraft() {
      const selectedId = byId('member-select')?.value || ''
      const member = state.members.find((item) => item.id === selectedId)
      const displayNameInput = byId('member-display-name')
      const avatarUrlInput = byId('member-avatar-url')
      if (displayNameInput) displayNameInput.value = member?.display_name || ''
      if (avatarUrlInput) avatarUrlInput.value = member?.avatar_url || ''
    }

    // --- Request parameter model -----------------------------------------
    //
    // Each request row can optionally expose editable path/query parameters.
    // Keeping the definitions in one map makes it easier to understand which
    // UI fields belong to which Rooiam endpoint.
    const requestParamMap = {
      'clients': [
        { name: 'page', label: 'Page', kind: 'query' },
        { name: 'page_size', label: 'Page Size', kind: 'query' },
        { name: 'q', label: 'Search', kind: 'query' },
        { name: 'status', label: 'Status', kind: 'query' },
        { name: 'app_type', label: 'App Type', kind: 'query' },
        { name: 'sort_by', label: 'Sort By', kind: 'query' },
        { name: 'sort_order', label: 'Sort Order', kind: 'query' },
      ],
      'members': [
        { name: 'page', label: 'Page', kind: 'query' },
        { name: 'page_size', label: 'Page Size', kind: 'query' },
        { name: 'q', label: 'Search', kind: 'query' },
        { name: 'role', label: 'Role', kind: 'query' },
        { name: 'status', label: 'Status', kind: 'query' },
        { name: 'sort_by', label: 'Sort By', kind: 'query' },
        { name: 'sort_order', label: 'Sort Order', kind: 'query' },
      ],
      'invites': [
        { name: 'page', label: 'Page', kind: 'query' },
        { name: 'page_size', label: 'Page Size', kind: 'query' },
        { name: 'q', label: 'Search', kind: 'query' },
        { name: 'sort_by', label: 'Sort By', kind: 'query' },
        { name: 'sort_order', label: 'Sort Order', kind: 'query' },
      ],
      'activity': [
        { name: 'page', label: 'Page', kind: 'query' },
        { name: 'page_size', label: 'Page Size', kind: 'query' },
        { name: 'q', label: 'Search', kind: 'query' },
        { name: 'action', label: 'Action', kind: 'query' },
        { name: 'date_from', label: 'Date From', kind: 'query' },
        { name: 'date_to', label: 'Date To', kind: 'query' },
        { name: 'sort_by', label: 'Sort By', kind: 'query' },
        { name: 'sort_order', label: 'Sort Order', kind: 'query' },
      ],
      'client-detail': [{ name: 'client_id', label: 'Client ID', source: 'client' }],
      'client-secret-metadata': [{ name: 'client_id', label: 'Client ID', source: 'client' }],
      'update-client': [{ name: 'client_id', label: 'Client ID', source: 'client' }],
      'suspend-client': [{ name: 'client_id', label: 'Client ID', source: 'client' }],
      'resume-client': [{ name: 'client_id', label: 'Client ID', source: 'client' }],
      'rotate-client-secret': [{ name: 'client_id', label: 'Client ID', source: 'client' }],
      'delete-client': [{ name: 'client_id', label: 'Client ID', source: 'client' }],
      'invite-detail': [{ name: 'invite_id', label: 'Invite ID', source: 'invite' }],
      'revoke-invite': [{ name: 'invite_id', label: 'Invite ID', source: 'invite' }],
      'member-detail': [{ name: 'member_id', label: 'Member ID', source: 'member' }],
      'member-activity': [
        { name: 'member_id', label: 'Member ID', source: 'member' },
        { name: 'page', label: 'Page', kind: 'query' },
        { name: 'page_size', label: 'Page Size', kind: 'query' },
        { name: 'sort_by', label: 'Sort By', kind: 'query' },
        { name: 'sort_order', label: 'Sort Order', kind: 'query' },
      ],
      'update-member-profile': [{ name: 'member_id', label: 'Member ID', source: 'member' }],
      'member-sessions': [{ name: 'member_id', label: 'Member ID', source: 'member' }],
      'revoke-member-sessions': [{ name: 'member_id', label: 'Member ID', source: 'member' }],
      'change-role': [{ name: 'member_id', label: 'Member ID', source: 'member' }],
      'remove-member': [{ name: 'member_id', label: 'Member ID', source: 'member' }],
    }

    function trackedParamValue(source) {
      if (source === 'client') return state.lastClientId || ''
      if (source === 'invite') return byId('invite-select')?.value || ''
      if (source === 'member') return byId('member-select')?.value || ''
      return ''
    }

    function getRequestParamValue(actionId, paramName, source) {
      const input = byId(actionId + '-' + paramName + '-input')
      if (input) return input.value.trim()
      return trackedParamValue(source)
    }

    function syncParamDefaults() {
      Object.entries(requestParamMap).forEach(([actionId, fields]) => {
        fields.forEach((field) => {
          const input = byId(actionId + '-' + field.name + '-input')
          if (!input) return
          if (input.dataset.manual === 'true') return
          if (field.kind === 'query') return
          input.value = trackedParamValue(field.source)
        })
      })
    }

    async function syncClients(silent = false) {
      try {
        const result = await requestJson('/api/rooiam/clients')
        state.clients = Array.isArray(result.data) ? result.data : []
        if (state.lastClientId && !state.clients.some((item) => item.client.id === state.lastClientId)) {
          state.lastClientId = null
        }
        if (!state.lastClientId && state.clients.length) {
          state.lastClientId = state.clients[0]?.client?.id || null
        }
        refreshClientBadge()
      } catch (error) {
        if (!silent) throw error
      }
    }

    async function syncInvites(silent = false) {
      try {
        const result = await requestJson('/api/rooiam/invites')
        state.invites = Array.isArray(result.data) ? result.data : []
        populateInviteSelect()
      } catch (error) {
        if (!silent) throw error
      }
    }

    async function syncMembers(silent = false) {
      try {
        const result = await requestJson('/api/rooiam/members')
        state.members = Array.isArray(result.data) ? result.data : []
        populateMemberSelect()
      } catch (error) {
        if (!silent) throw error
      }
    }

    function bindJsonAction(config) {
      const button = byId(config.id + '-btn')
      const trigger = byId(config.id + '-trigger') || button?.closest('.request-item')?.querySelector('.request-path') || button
      const outputId = config.outputId || config.id
      const code = byId(outputId + '-code')
      const note = byId(outputId + '-note')
      if (!trigger || !code || !note) return
      const run = async () => {
        if (button?.disabled) return
        if (config.beforeRun) {
          const errorMessage = config.beforeRun()
          if (errorMessage) {
            setFailure(note, '<strong>Cannot run yet.</strong><br />' + errorMessage)
            return
          }
        }
        setLoading(trigger, code, config.loadingLabel || 'Calling...')
        try {
          const request = config.buildRequest()
          const data = await requestJson(request.url, {
            method: request.method,
            body: request.body,
          })
          renderJson(code, data)
          if (config.afterSuccess) {
            await config.afterSuccess(data)
          }
          setSuccess(
            note,
            '<strong>Request succeeded.</strong><br /><code>' +
              request.method +
              ' ' +
              request.pathLabel +
              '</code> completed through <code>5182</code>.'
          )
        } catch (error) {
          renderJson(code, { ok: false, error: error.message || 'Request failed.' })
          setFailure(note, '<strong>Request failed.</strong><br />' + (error && error.message ? error.message : 'Unknown error.'))
        } finally {
          clearLoading(trigger)
        }
      }
      trigger.addEventListener('click', run)
      trigger.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          run()
        }
      })
    }

    // --- Read-only request bindings --------------------------------------
    //
    // These are the simple "click row -> call local example endpoint" cases.
    bindAction('workspace', '/api/rooiam/workspace')
    bindAction('api-key-me', '/api/rooiam/api-keys/me')
    bindAction('policy-summary', '/api/rooiam/policy-summary')
    bindAction('branding', '/api/rooiam/branding')
    bindAction('widget-preview-config', '/api/rooiam/widget-preview-config')
    bindAction('auth-config', '/api/rooiam/auth-config')
    bindAction('clients', '/api/rooiam/clients')
    bindAction('roles', '/api/rooiam/roles')
    bindAction('permissions', '/api/rooiam/permissions')
    bindAction('members', '/api/rooiam/members')
    bindAction('invites', '/api/rooiam/invites')
    bindAction('activity', '/api/rooiam/activity')
    bindAction('audit-actions', '/api/rooiam/audit/actions')
    bindAction('effective-policy', '/api/rooiam/effective-policy')

    // --- Mutating / tracked-object request bindings ----------------------
    //
    // These calls usually depend on a tracked client, invite, or member.
    // The helper keeps the request lifecycle consistent while each block keeps
    // the interesting request body close to the endpoint it teaches.
    bindJsonAction({
      id: 'client-detail',
      loadingLabel: 'Loading...',
      beforeRun: () => !getRequestParamValue('client-detail', 'client_id', 'client') ? 'Create or load a test client first.' : '',
      buildRequest: () => ({
        method: 'GET',
        url: '/api/rooiam/clients/' + getRequestParamValue('client-detail', 'client_id', 'client'),
        pathLabel: '/v1/orgs/integrations/clients/{client_id}',
      }),
    })

    bindJsonAction({
      id: 'client-secret-metadata',
      loadingLabel: 'Loading...',
      beforeRun: () => !getRequestParamValue('client-secret-metadata', 'client_id', 'client') ? 'Create or load a test client first.' : '',
      buildRequest: () => ({
        method: 'GET',
        url: '/api/rooiam/clients/' + getRequestParamValue('client-secret-metadata', 'client_id', 'client') + '/secret-metadata',
        pathLabel: '/v1/orgs/integrations/clients/{client_id}/secret-metadata',
      }),
    })

    bindJsonAction({
      id: 'create-client',
      loadingLabel: 'Creating...',
      buildRequest: () => {
        const stamp = Date.now()
        return {
          method: 'POST',
          url: '/api/rooiam/clients',
          pathLabel: '/v1/orgs/integrations/clients',
          body: {
            app_name: 'API Key Test App ' + stamp,
            app_type: 'web',
            redirect_uris: ['http://localhost:5199/callback'],
          },
        }
      },
      afterSuccess: async (payload) => {
        state.lastClientId = payload?.data?.client?.id || null
        await syncClients(true)
      },
    })

    bindJsonAction({
      id: 'update-client',
      loadingLabel: 'Updating...',
      beforeRun: () => !getRequestParamValue('update-client', 'client_id', 'client') ? 'Create a test client first.' : '',
      buildRequest: () => {
        const clientId = getRequestParamValue('update-client', 'client_id', 'client')
        const client = state.clients.find((item) => item.client.id === clientId)
        return {
          method: 'PATCH',
          url: '/api/rooiam/clients/' + clientId,
          pathLabel: '/v1/orgs/integrations/clients/{client_id}',
          body: {
            app_name: (client?.client?.app_name || 'API Key Test App') + ' Updated',
            redirect_uris: ['http://localhost:5199/callback', 'http://localhost:5199/alt-callback'],
          },
        }
      },
      afterSuccess: async () => {
        await syncClients(true)
      },
    })

    bindJsonAction({
      id: 'suspend-client',
      loadingLabel: 'Suspending...',
      beforeRun: () => !getRequestParamValue('suspend-client', 'client_id', 'client') ? 'Create a test client first.' : '',
      buildRequest: () => ({
        method: 'PATCH',
        url: '/api/rooiam/clients/' + getRequestParamValue('suspend-client', 'client_id', 'client') + '/status',
        pathLabel: '/v1/orgs/integrations/clients/{client_id}/status',
        body: { status: 'suspended' },
      }),
      afterSuccess: async () => {
        await syncClients(true)
      },
    })

    bindJsonAction({
      id: 'resume-client',
      loadingLabel: 'Resuming...',
      beforeRun: () => !getRequestParamValue('resume-client', 'client_id', 'client') ? 'Create a test client first.' : '',
      buildRequest: () => ({
        method: 'PATCH',
        url: '/api/rooiam/clients/' + getRequestParamValue('resume-client', 'client_id', 'client') + '/status',
        pathLabel: '/v1/orgs/integrations/clients/{client_id}/status',
        body: { status: 'active' },
      }),
      afterSuccess: async () => {
        await syncClients(true)
      },
    })

    bindJsonAction({
      id: 'rotate-client-secret',
      loadingLabel: 'Rotating...',
      beforeRun: () => !getRequestParamValue('rotate-client-secret', 'client_id', 'client') ? 'Create a confidential web app first.' : '',
      buildRequest: () => ({
        method: 'POST',
        url: '/api/rooiam/clients/' + getRequestParamValue('rotate-client-secret', 'client_id', 'client') + '/rotate-secret',
        pathLabel: '/v1/orgs/integrations/clients/{client_id}/rotate-secret',
      }),
    })

    bindJsonAction({
      id: 'delete-client',
      loadingLabel: 'Deleting...',
      beforeRun: () => !getRequestParamValue('delete-client', 'client_id', 'client') ? 'Create a test client first.' : '',
      buildRequest: () => ({
        method: 'DELETE',
        url: '/api/rooiam/clients/' + getRequestParamValue('delete-client', 'client_id', 'client'),
        pathLabel: '/v1/orgs/integrations/clients/{client_id}',
      }),
      afterSuccess: async () => {
        state.lastClientId = null
        await syncClients(true)
      },
    })

    bindJsonAction({
      id: 'invite-detail',
      loadingLabel: 'Loading...',
      buildRequest: () => ({
        method: 'GET',
        url: '/api/rooiam/invites/' + getRequestParamValue('invite-detail', 'invite_id', 'invite'),
        pathLabel: '/v1/orgs/integrations/invites/{invite_id}',
      }),
    })

    bindJsonAction({
      id: 'send-invite',
      loadingLabel: 'Sending...',
      beforeRun: () => {
        const email = byId('invite-email').value.trim()
        return email ? '' : 'Enter an email address first.'
      },
      buildRequest: () => ({
        method: 'POST',
        url: '/api/rooiam/invites',
        pathLabel: '/v1/orgs/integrations/invites',
        body: { email: byId('invite-email').value.trim() },
      }),
      afterSuccess: async () => {
        await syncInvites(true)
      },
    })

    bindJsonAction({
      id: 'revoke-invite',
      loadingLabel: 'Revoking...',
      buildRequest: () => ({
        method: 'DELETE',
        url: '/api/rooiam/invites/' + getRequestParamValue('revoke-invite', 'invite_id', 'invite'),
        pathLabel: '/v1/orgs/integrations/invites/{invite_id}',
      }),
      afterSuccess: async () => {
        await syncInvites(true)
      },
    })

    bindJsonAction({
      id: 'member-activity',
      loadingLabel: 'Loading...',
      beforeRun: () => !getRequestParamValue('member-activity', 'member_id', 'member') ? 'Load members first.' : '',
      buildRequest: () => ({
        method: 'GET',
        url: '/api/rooiam/members/' + getRequestParamValue('member-activity', 'member_id', 'member') + '/activity',
        pathLabel: '/v1/orgs/integrations/members/{member_id}/activity',
      }),
    })

    bindJsonAction({
      id: 'change-role',
      loadingLabel: 'Updating...',
      beforeRun: () => !getRequestParamValue('change-role', 'member_id', 'member') ? 'Load members first.' : '',
      buildRequest: () => ({
        method: 'PATCH',
        url: '/api/rooiam/members/' + getRequestParamValue('change-role', 'member_id', 'member') + '/role',
        pathLabel: '/v1/orgs/integrations/members/{member_id}/role',
        body: { role_code: byId('role-select').value },
      }),
      afterSuccess: async () => {
        await syncMembers(true)
      },
    })

    bindJsonAction({
      id: 'remove-member',
      loadingLabel: 'Removing...',
      beforeRun: () => {
        if (!getRequestParamValue('remove-member', 'member_id', 'member')) return 'Load members first.'
        if (!window.confirm('Remove this member from the workspace?')) return 'Removal canceled.'
        return ''
      },
      buildRequest: () => ({
        method: 'DELETE',
        url: '/api/rooiam/members/' + getRequestParamValue('remove-member', 'member_id', 'member'),
        pathLabel: '/v1/orgs/integrations/members/{member_id}',
      }),
      afterSuccess: async () => {
        await syncMembers(true)
      },
    })

    bindJsonAction({
      id: 'member-detail',
      loadingLabel: 'Loading...',
      beforeRun: () => !getRequestParamValue('member-detail', 'member_id', 'member') ? 'Load members first.' : '',
      buildRequest: () => ({
        method: 'GET',
        url: '/api/rooiam/members/' + getRequestParamValue('member-detail', 'member_id', 'member'),
        pathLabel: '/v1/orgs/integrations/members/{member_id}',
      }),
    })

    bindJsonAction({
      id: 'update-member-profile',
      loadingLabel: 'Updating...',
      beforeRun: () => !getRequestParamValue('update-member-profile', 'member_id', 'member') ? 'Load members first.' : '',
      buildRequest: () => ({
        method: 'PATCH',
        url: '/api/rooiam/members/' + getRequestParamValue('update-member-profile', 'member_id', 'member') + '/profile',
        pathLabel: '/v1/orgs/integrations/members/{member_id}/profile',
        body: {
          display_name: byId('member-display-name').value.trim() || null,
          avatar_url: byId('member-avatar-url').value.trim() || null,
        },
      }),
      afterSuccess: async () => {
        await syncMembers(true)
      },
    })

    bindJsonAction({
      id: 'member-sessions',
      loadingLabel: 'Loading...',
      beforeRun: () => !getRequestParamValue('member-sessions', 'member_id', 'member') ? 'Load members first.' : '',
      buildRequest: () => ({
        method: 'GET',
        url: '/api/rooiam/members/' + getRequestParamValue('member-sessions', 'member_id', 'member') + '/sessions',
        pathLabel: '/v1/orgs/integrations/members/{member_id}/sessions',
      }),
    })

    bindJsonAction({
      id: 'revoke-member-sessions',
      loadingLabel: 'Revoking...',
      beforeRun: () => !getRequestParamValue('revoke-member-sessions', 'member_id', 'member') ? 'Load members first.' : '',
      buildRequest: () => ({
        method: 'DELETE',
        url: '/api/rooiam/members/' + getRequestParamValue('revoke-member-sessions', 'member_id', 'member') + '/sessions',
        pathLabel: '/v1/orgs/integrations/members/{member_id}/sessions',
      }),
    })

    Promise.allSettled([syncClients(true), syncInvites(true), syncMembers(true)]).then(() => {
      refreshClientBadge()
      syncMemberProfileDraft()
    })

    const labelMap = {
      'workspace-btn': ['Get', 'get'],
      'branding-btn': ['Get', 'get'],
      'widget-preview-config-btn': ['Get', 'get'],
      'auth-config-btn': ['Get', 'get'],
      'clients-btn': ['Get', 'get'],
      'client-detail-btn': ['Get', 'get'],
      'client-secret-metadata-btn': ['Get', 'get'],
      'roles-btn': ['Get', 'get'],
      'permissions-btn': ['Get', 'get'],
      'members-btn': ['Get', 'get'],
      'member-activity-btn': ['Get', 'get'],
      'invites-btn': ['Get', 'get'],
      'invite-detail-btn': ['Get', 'get'],
      'activity-btn': ['Get', 'get'],
      'audit-actions-btn': ['Get', 'get'],
      'policy-summary-btn': ['Get', 'get'],
      'effective-policy-btn': ['Get', 'get'],
      'api-key-me-btn': ['Get', 'get'],
      'create-client-btn': ['Create', 'post'],
      'update-client-btn': ['Patch', 'patch'],
      'suspend-client-btn': ['Patch', 'patch'],
      'resume-client-btn': ['Patch', 'patch'],
      'rotate-client-secret-btn': ['Post', 'post'],
      'delete-client-btn': ['Delete', 'delete'],
      'send-invite-btn': ['Post', 'post'],
      'revoke-invite-btn': ['Delete', 'delete'],
      'change-role-btn': ['Patch', 'patch'],
      'remove-member-btn': ['Delete', 'delete'],
      'member-detail-btn': ['Get', 'get'],
      'update-member-profile-btn': ['Patch', 'patch'],
      'member-sessions-btn': ['Get', 'get'],
      'revoke-member-sessions-btn': ['Delete', 'delete'],
    }
    Object.entries(labelMap).forEach(([id, config]) => {
      const button = byId(id)
      if (!button) return
      button.textContent = config[0]
      button.className = 'btn ' + config[1]
    })

    document.querySelectorAll('.method').forEach((node) => {
      const value = (node.textContent || '').trim().toLowerCase()
      if (value) node.classList.add(value)
    })

    const highlightedVerbs = new Set(['Read', 'Write', 'Create', 'Update', 'Delete', 'Rotate', 'Revoke', 'Creates', 'Works'])
    document.querySelectorAll('.matrix-table tbody tr td:nth-child(2)').forEach((cell) => {
      if (!(cell instanceof HTMLElement)) return
      const raw = (cell.textContent || '').trim()
      if (!raw) return
      const parts = raw.split(/\s+/)
      const verb = parts[0]
      if (!highlightedVerbs.has(verb) || parts.length < 2) return
      const rest = raw.slice(verb.length).trim()
      cell.innerHTML = '<span class="perm-verb ' + verb.toLowerCase() + '">' + verb + '</span><span>' + escapeHtml(rest) + '</span>'
    })

    document.querySelectorAll('.meta-line').forEach((node) => {
      const text = (node.textContent || '').trim()
      if (!text.startsWith('Headers:')) return
      const raw = text.replace(/^Headers:\s*/, '')
      const headerName = raw.split(':')[0].trim()
      const headerValue = raw.slice(raw.indexOf(':') + 1).trim()
      node.className = 'kv'
      node.innerHTML =
        '<div class="kv-table">' +
          '<div class="kv-entry"><div class="kv-entry-name"><code>' + escapeHtml(headerName) + '</code></div><div class="kv-entry-value"><code>' + escapeHtml(headerValue) + '</code></div></div>' +
        '</div>'
    })

    document.querySelectorAll('.kv').forEach((node) => {
      const rows = Array.from(node.querySelectorAll(':scope > .kv-row'))
      if (rows.length < 2) return
      const firstLabel = rows[0]?.querySelector('.kv-name')?.textContent?.trim()
      const secondLabel = rows[1]?.querySelector('.kv-name')?.textContent?.trim()
      if (firstLabel !== 'Header Name' || secondLabel !== 'Header Value') return
      const headerName = rows[0]?.querySelector('.kv-value')?.innerHTML || ''
      const headerValue = rows[1]?.querySelector('.kv-value')?.innerHTML || ''
      node.innerHTML =
        '<div class="kv-table">' +
          '<div class="kv-entry"><div class="kv-entry-name">' + headerName + '</div><div class="kv-entry-value">' + headerValue + '</div></div>' +
        '</div>'
    })

    ;[
      'workspace',
      'branding',
      'widget-preview-config',
      'auth-config',
      'clients',
      'client-detail',
      'client-secret-metadata',
      'roles',
      'permissions',
      'members',
      'member-activity',
      'invites',
      'invite-detail',
      'activity',
      'audit-actions',
      'policy-summary',
      'effective-policy',
      'api-key-me',
      'create-client',
      'update-client',
      'suspend-client',
      'resume-client',
      'rotate-client-secret',
      'delete-client',
      'send-invite',
      'revoke-invite',
      'change-role',
      'remove-member',
      'member-detail',
      'update-member-profile',
      'member-sessions',
      'revoke-member-sessions',
    ].forEach((id) => {
      const note = byId(id + '-note')
      const code = byId(id + '-code')
      if (note) note.hidden = true
      if (code) code.hidden = true
      syncClearButton(note, code)
    })

    // --- Request-row UI chrome -------------------------------------------
    //
    // This turns each request row into something that behaves like API docs:
    // - click anywhere on the row to run
    // - optional parameter drawer
    // - per-row clear button
    document.querySelectorAll('.request-item').forEach((item) => {
      const trigger = item.querySelector('.request-path')
      const actionBar = item.querySelector('.action-bar')
      const button = actionBar?.querySelector('button')
      if (!trigger || !button || !(trigger instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) return
      const actionId = button.id.replace(/-btn$/, '')
      const paramFields = requestParamMap[actionId] || []
      if (paramFields.length) {
        const toggle = document.createElement('button')
        toggle.type = 'button'
        toggle.className = 'param-toggle'
        toggle.innerHTML = '<span class="param-toggle-icon">+</span><span>Parameters</span>'
        const panel = document.createElement('div')
        panel.className = 'param-panel'
        panel.hidden = true
        panel.innerHTML = '<div class="param-meta">Tracked value is prefilled. Edit it here to override this request.</div>'
        const grid = document.createElement('div')
        grid.className = 'control-grid'
        paramFields.forEach((field) => {
          const wrap = document.createElement('div')
          wrap.innerHTML =
            '<label class="label" for="' + actionId + '-' + field.name + '-input">' + field.label + '</label>' +
            '<input id="' + actionId + '-' + field.name + '-input" class="input" type="text" placeholder="' + field.name + '" />'
          const input = wrap.querySelector('input')
          if (input) {
            input.value = trackedParamValue(field.source)
            input.addEventListener('input', () => {
              input.dataset.manual = input.value.trim() ? 'true' : ''
            })
          }
          grid.appendChild(wrap)
        })
        panel.appendChild(grid)
        toggle.addEventListener('click', () => {
          panel.hidden = !panel.hidden
          const icon = toggle.querySelector('.param-toggle-icon')
          if (icon) icon.textContent = panel.hidden ? '+' : '−'
        })
        const copy = item.querySelector('.request-copy')
        if (copy) {
          copy.insertAdjacentElement('afterend', toggle)
          toggle.insertAdjacentElement('afterend', panel)
        }
      }
      const clear = document.createElement('button')
      clear.type = 'button'
      clear.className = 'request-clear'
      clear.hidden = true
      clear.setAttribute('aria-label', 'Clear response')
      clear.textContent = '×'
      clear.addEventListener('click', (event) => {
        event.stopPropagation()
        resetResponseBlock(item)
      })
      trigger.appendChild(clear)
      trigger.setAttribute('role', 'button')
      trigger.setAttribute('tabindex', '0')
      trigger.addEventListener('click', () => button.click())
      trigger.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          button.click()
        }
      })
      actionBar.classList.add('inline-hidden')
      syncClearButton(item.querySelector('.hint'), item.querySelector('.json-view'))
    })

    document.querySelectorAll('.action-card').forEach((card) => {
      if (card.querySelector('.request-item')) return
      const trigger = card.querySelector('.meta-line')
      const actionBar = card.querySelector('.action-bar')
      const button = actionBar?.querySelector('button')
      if (!trigger || !button || !(trigger instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) return
      trigger.classList.add('request-trigger')
      trigger.setAttribute('role', 'button')
      trigger.setAttribute('tabindex', '0')
      trigger.addEventListener('click', () => button.click())
      trigger.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          button.click()
        }
      })
      actionBar.classList.add('inline-hidden')
    })

    const workspaceApiKeyInput = byId('workspace-api-key')
    if (workspaceApiKeyInput) {
      workspaceApiKeyInput.addEventListener('input', () => {
        delete workspaceApiKeyInput.dataset.prefilled
      })
    }

    // --- Sidebar table of contents ---------------------------------------
    //
    // The page is intentionally long. Build a docs-style sidebar so a reader
    // can jump to a section or a single endpoint without scanning everything.
    const docsNav = byId('docs-nav')
    const sectionCards = Array.from(document.querySelectorAll('.action-card'))
    if (docsNav && sectionCards.length) {
      const slugify = (value) =>
        String(value || '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')

      sectionCards.forEach((card, index) => {
        if (!(card instanceof HTMLElement)) return
        const heading = card.querySelector('h3')
        const intro = card.querySelector(':scope > p')
        if (!(heading instanceof HTMLElement)) return
        const title = card.dataset.navTitle || heading.textContent?.trim() || ('Section ' + (index + 1))
        if (!card.id) card.id = 'section-' + slugify(title)

        const cardHead = document.createElement('div')
        cardHead.className = 'card-head'

        const cardTitle = document.createElement('div')
        cardTitle.className = 'card-title'
        cardHead.appendChild(cardTitle)

        cardTitle.appendChild(heading)
        if (intro instanceof HTMLElement) {
          cardTitle.appendChild(intro)
        }

        const toggle = document.createElement('button')
        toggle.type = 'button'
        toggle.className = 'card-toggle'
        toggle.setAttribute('aria-expanded', 'true')
        toggle.setAttribute('aria-label', 'Toggle ' + title)
        toggle.textContent = '−'
        cardHead.appendChild(toggle)

        const body = document.createElement('div')
        body.className = 'card-body'

        const nodesToMove = Array.from(card.childNodes).filter((node) => node !== cardHead && node !== heading && node !== intro)
        nodesToMove.forEach((node) => body.appendChild(node))

        card.appendChild(cardHead)
        card.appendChild(body)

        toggle.addEventListener('click', () => {
          const collapsed = !body.hidden
          body.hidden = collapsed
          toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true')
          toggle.textContent = collapsed ? '+' : '−'
        })

        const navSection = document.createElement('div')
        navSection.className = 'docs-nav-section'

        const navTop = document.createElement('div')
        navTop.className = 'docs-nav-top'

        const link = document.createElement('a')
        link.href = '#' + card.id
        link.dataset.target = card.id
        link.className = 'docs-nav-link'
        link.innerHTML = '<span class="docs-nav-index">' + (index + 1) + '</span><span>' + title + '</span>'
        navTop.appendChild(link)

        const requestItems = Array.from(card.querySelectorAll('.request-item'))
        let submenu = null
        let submenuToggle = null
        if (requestItems.length) {
          submenuToggle = document.createElement('button')
          submenuToggle.type = 'button'
          submenuToggle.className = 'docs-nav-toggle'
          submenuToggle.setAttribute('aria-expanded', 'false')
          submenuToggle.setAttribute('aria-label', 'Toggle ' + title + ' endpoints')
          submenuToggle.textContent = '+'
          navTop.appendChild(submenuToggle)

          submenu = document.createElement('div')
          submenu.className = 'docs-nav-submenu'
          submenu.hidden = true

          const duplicateCounts = new Map()
          requestItems.forEach((item) => {
            if (!(item instanceof HTMLElement)) return
            const pathNode = item.querySelector('.request-path code')
            const methodNode = item.querySelector('.request-path .method')
            const pathText = pathNode?.textContent?.trim() || ''
            const methodText = methodNode?.textContent?.trim() || 'GET'
            const signature = methodText + ' ' + pathText
            duplicateCounts.set(signature, (duplicateCounts.get(signature) || 0) + 1)
          })

          requestItems.forEach((item, requestIndex) => {
            if (!(item instanceof HTMLElement)) return
            const pathNode = item.querySelector('.request-path code')
            const methodNode = item.querySelector('.request-path .method')
            const copyNode = item.querySelector('.request-copy')
            const pathText = pathNode?.textContent?.trim() || ('request-' + (requestIndex + 1))
            const methodText = methodNode?.textContent?.trim() || 'GET'
            const copyText = copyNode?.textContent?.trim() || pathText
            const signature = methodText + ' ' + pathText
            const hasDuplicate = (duplicateCounts.get(signature) || 0) > 1
            const submenuLabel = hasDuplicate ? copyText.replace(/\.$/, '') : pathText
            const requestId = card.id + '-request-' + slugify(methodText + '-' + pathText + '-' + submenuLabel + '-' + String(requestIndex + 1))
            item.id = requestId

            const requestLink = document.createElement('a')
            requestLink.href = '#' + requestId
            requestLink.dataset.target = requestId
            requestLink.className = 'docs-nav-subitem'
            requestLink.innerHTML =
              '<span class="docs-nav-submethod ' + methodText.toLowerCase() + '">' + methodText + '</span>' +
              '<span class="docs-nav-subpath">' + submenuLabel + '</span>'
            submenu.appendChild(requestLink)
          })

          submenuToggle.addEventListener('click', () => {
            const willOpen = submenu.hidden
            submenu.hidden = !willOpen
            submenuToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false')
            submenuToggle.textContent = willOpen ? '−' : '+'
          })
        } else {
          const spacer = document.createElement('span')
          spacer.className = 'docs-nav-toggle-spacer'
          spacer.setAttribute('aria-hidden', 'true')
          navTop.appendChild(spacer)
        }

        navSection.appendChild(navTop)
        if (submenu) {
          navSection.appendChild(submenu)
        }
        docsNav.appendChild(navSection)
      })

      const navLinks = Array.from(docsNav.querySelectorAll('a'))
      const syncActiveLink = () => {
        let activeId = ''
        let activeRequestId = ''
        let activeRequestDistance = Number.POSITIVE_INFINITY
        sectionCards.forEach((card) => {
          if (!(card instanceof HTMLElement)) return
          const rect = card.getBoundingClientRect()
          if (rect.top <= 160) {
            activeId = card.id
          }
          const requestItems = Array.from(card.querySelectorAll('.request-item'))
          requestItems.forEach((item) => {
            if (!(item instanceof HTMLElement)) return
            const rect = item.getBoundingClientRect()
            const distance = Math.abs(rect.top - 220)
            if (rect.top <= 260 && distance < activeRequestDistance) {
              activeRequestId = item.id
              activeRequestDistance = distance
            }
          })
        })
        const scroller = document.scrollingElement || document.documentElement
        const nearBottom = scroller.scrollTop + window.innerHeight >= scroller.scrollHeight - 4
        if (nearBottom) {
          const lastCard = sectionCards[sectionCards.length - 1]
          if (lastCard instanceof HTMLElement) {
            activeId = lastCard.id
            const requestItems = Array.from(lastCard.querySelectorAll('.request-item'))
            const lastRequest = requestItems[requestItems.length - 1]
            if (lastRequest instanceof HTMLElement) {
              activeRequestId = lastRequest.id
            }
          }
        }
        navLinks.forEach((link) => {
          if (!(link instanceof HTMLAnchorElement)) return
          const isSection = link.classList.contains('docs-nav-link')
          link.classList.toggle('active', isSection && link.dataset.target === activeId)
          link.classList.toggle('sync-active', !isSection && link.dataset.target === activeRequestId)
        })
        docsNav.querySelectorAll('.docs-nav-section').forEach((section) => {
          if (!(section instanceof HTMLElement)) return
          const topLink = section.querySelector('.docs-nav-link')
          const submenu = section.querySelector('.docs-nav-submenu')
          const submenuToggle = section.querySelector('.docs-nav-toggle')
          const shouldOpen = topLink instanceof HTMLAnchorElement && topLink.dataset.target === activeId
          if (submenu instanceof HTMLElement && submenuToggle instanceof HTMLButtonElement) {
            submenu.hidden = !shouldOpen
            submenuToggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false')
            submenuToggle.textContent = shouldOpen ? '−' : '+'
          }
        })
      }
      navLinks.forEach((link) => {
        if (!(link instanceof HTMLAnchorElement)) return
        link.addEventListener('click', (event) => {
          const targetId = link.dataset.target
          const target = targetId ? byId(targetId) : null
          if (!target) return
          event.preventDefault()
          target.scrollIntoView({ block: 'start', behavior: 'smooth' })
          history.replaceState(null, '', '#' + targetId)
          syncActiveLink()
        })
      })
      syncActiveLink()
      window.addEventListener('scroll', syncActiveLink, { passive: true })
    }

    byId('member-select')?.addEventListener('change', syncMemberProfileDraft)
    byId('member-select')?.addEventListener('change', syncParamDefaults)
    byId('invite-select')?.addEventListener('change', refreshInviteActions)
    byId('invite-select')?.addEventListener('change', syncParamDefaults)
    refreshInviteActions()
  </script>
</body>
</html>`
}

function maskApiKey(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  if (trimmed.length <= 12) return '********'
  return `${trimmed.slice(0, 10)}${'*'.repeat(Math.max(4, trimmed.length - 14))}${trimmed.slice(-4)}`
}

function proxyPayload(pathLabel, data) {
  return { ok: true, rooiam_path: pathLabel, data }
}

function sendProxyResult(res, result, pathLabel) {
  if (result.error) {
    res.status(502).json(jsonError(result.error, 502))
    return
  }
  res.json(proxyPayload(pathLabel, result.data))
}

/**
 * Register one local example route that simply forwards to the real Rooiam
 * workspace API-key surface.
 *
 * This keeps the example readable:
 * - the route table shows what exists
 * - the helper shows how proxying works once
 * - the reader does not need to scan the same fetch/error boilerplate 30 times
 */
function registerProxyRoute({
  method = 'get',
  localPath,
  rooiamPath,
  queryKeys = [],
  includeBody = false,
}) {
  app[method](localPath, async (req, res) => {
    const basePath = rooiamPath(req)
    const requestPath = queryKeys.length ? withForwardedQuery(req, basePath, queryKeys) : basePath
    const result = await callRooiamFromRequest(req, requestPath, includeBody
      ? { method: method.toUpperCase(), body: req.body || {} }
      : method === 'get'
        ? {}
        : { method: method.toUpperCase() })

    sendProxyResult(res, result, `/v1${basePath}`)
  })
}

// Read routes are grouped here so a developer can see the supported machine
// surface without jumping through a long wall of repeated handlers.
const READ_PROXY_ROUTES = [
  { localPath: '/api/rooiam/workspace', rooiamPath: () => '/orgs/integrations/workspace' },
  { localPath: '/api/rooiam/branding', rooiamPath: () => '/orgs/integrations/branding' },
  { localPath: '/api/rooiam/auth-config', rooiamPath: () => '/orgs/integrations/auth-config' },
  {
    localPath: '/api/rooiam/clients',
    rooiamPath: () => '/orgs/integrations/clients',
    queryKeys: ['page', 'page_size', 'q', 'status', 'app_type', 'sort_by', 'sort_order'],
  },
  { localPath: '/api/rooiam/clients/:clientId', rooiamPath: (req) => `/orgs/integrations/clients/${req.params.clientId}` },
  { localPath: '/api/rooiam/clients/:clientId/secret-metadata', rooiamPath: (req) => `/orgs/integrations/clients/${req.params.clientId}/secret-metadata` },
  {
    localPath: '/api/rooiam/members',
    rooiamPath: () => '/orgs/integrations/members',
    queryKeys: ['page', 'page_size', 'q', 'role', 'status', 'sort_by', 'sort_order'],
  },
  { localPath: '/api/rooiam/members/:memberId', rooiamPath: (req) => `/orgs/integrations/members/${req.params.memberId}` },
  {
    localPath: '/api/rooiam/members/:memberId/activity',
    rooiamPath: (req) => `/orgs/integrations/members/${req.params.memberId}/activity`,
    queryKeys: ['page', 'page_size', 'sort_by', 'sort_order'],
  },
  { localPath: '/api/rooiam/members/:memberId/sessions', rooiamPath: (req) => `/orgs/integrations/members/${req.params.memberId}/sessions` },
  {
    localPath: '/api/rooiam/invites',
    rooiamPath: () => '/orgs/integrations/invites',
    queryKeys: ['page', 'page_size', 'q', 'sort_by', 'sort_order'],
  },
  { localPath: '/api/rooiam/invites/:inviteId', rooiamPath: (req) => `/orgs/integrations/invites/${req.params.inviteId}` },
  {
    localPath: '/api/rooiam/activity',
    rooiamPath: () => '/orgs/integrations/activity',
    queryKeys: ['page', 'page_size', 'q', 'action', 'date_from', 'date_to', 'sort_by', 'sort_order'],
  },
  { localPath: '/api/rooiam/effective-policy', rooiamPath: () => '/orgs/integrations/effective-policy' },
  { localPath: '/api/rooiam/roles', rooiamPath: () => '/orgs/integrations/roles' },
  { localPath: '/api/rooiam/permissions', rooiamPath: () => '/orgs/integrations/permissions' },
  { localPath: '/api/rooiam/api-keys/me', rooiamPath: () => '/orgs/integrations/api-keys/me' },
  { localPath: '/api/rooiam/audit/actions', rooiamPath: () => '/orgs/integrations/audit/actions' },
  { localPath: '/api/rooiam/policy-summary', rooiamPath: () => '/orgs/integrations/policy-summary' },
  { localPath: '/api/rooiam/widget-preview-config', rooiamPath: () => '/orgs/integrations/widget-preview-config' },
]

// Write routes are grouped separately so the mutating operations stand out.
const WRITE_PROXY_ROUTES = [
  { method: 'patch', localPath: '/api/rooiam/branding', rooiamPath: () => '/orgs/integrations/branding', includeBody: true },
  { method: 'patch', localPath: '/api/rooiam/auth-config', rooiamPath: () => '/orgs/integrations/auth-config', includeBody: true },
  { method: 'post', localPath: '/api/rooiam/clients', rooiamPath: () => '/orgs/integrations/clients', includeBody: true },
  { method: 'patch', localPath: '/api/rooiam/clients/:clientId', rooiamPath: (req) => `/orgs/integrations/clients/${req.params.clientId}`, includeBody: true },
  { method: 'patch', localPath: '/api/rooiam/clients/:clientId/status', rooiamPath: (req) => `/orgs/integrations/clients/${req.params.clientId}/status`, includeBody: true },
  { method: 'post', localPath: '/api/rooiam/clients/:clientId/rotate-secret', rooiamPath: (req) => `/orgs/integrations/clients/${req.params.clientId}/rotate-secret`, includeBody: true },
  { method: 'delete', localPath: '/api/rooiam/clients/:clientId', rooiamPath: (req) => `/orgs/integrations/clients/${req.params.clientId}` },
  { method: 'post', localPath: '/api/rooiam/invites', rooiamPath: () => '/orgs/integrations/invites', includeBody: true },
  { method: 'delete', localPath: '/api/rooiam/invites/:inviteId', rooiamPath: (req) => `/orgs/integrations/invites/${req.params.inviteId}` },
  { method: 'patch', localPath: '/api/rooiam/members/:memberId/profile', rooiamPath: (req) => `/orgs/integrations/members/${req.params.memberId}/profile`, includeBody: true },
  { method: 'delete', localPath: '/api/rooiam/members/:memberId/sessions', rooiamPath: (req) => `/orgs/integrations/members/${req.params.memberId}/sessions` },
  { method: 'patch', localPath: '/api/rooiam/members/:memberId/role', rooiamPath: (req) => `/orgs/integrations/members/${req.params.memberId}/role`, includeBody: true },
  { method: 'delete', localPath: '/api/rooiam/members/:memberId', rooiamPath: (req) => `/orgs/integrations/members/${req.params.memberId}` },
]

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'example-3-backend',
    machine_to_machine_only: true,
    api_key_configured: Boolean(apiKey),
    rooiam_api_base: apiBase,
  })
})

READ_PROXY_ROUTES.forEach(registerProxyRoute)
WRITE_PROXY_ROUTES.forEach(registerProxyRoute)

app.get('/api/capabilities', (_req, res) => {
  res.json({
    ok: true,
    title: 'Backend API Key Capabilities',
    machine_to_machine_only: true,
    real_rooiam_api_key_endpoints: [
      {
        method: 'GET',
        path: '/v1/orgs/integrations/workspace',
        description: 'Real Rooiam endpoint that accepts a workspace API key and returns workspace integration metadata.',
      },
      {
        method: 'GET',
        path: '/v1/orgs/integrations/branding',
        description: 'Real Rooiam endpoint that returns workspace branding and hosted login widget settings.',
      },
      {
        method: 'GET',
        path: '/v1/orgs/integrations/auth-config',
        description: 'Real Rooiam endpoint that returns non-secret auth configuration state for the workspace.',
      },
      {
        method: 'GET',
        path: '/v1/orgs/integrations/clients',
        description: 'Real Rooiam endpoint that returns workspace apps and redirect URIs.',
      },
      {
        method: 'GET',
        path: '/v1/orgs/integrations/clients/{client_id}',
        description: 'Real Rooiam endpoint that returns one workspace app detail.',
      },
      {
        method: 'GET',
        path: '/v1/orgs/integrations/clients/{client_id}/secret-metadata',
        description: 'Real Rooiam endpoint that returns secret presence and rotation metadata for one app.',
      },
      {
        method: 'GET',
        path: '/v1/orgs/integrations/members',
        description: 'Real Rooiam endpoint that returns workspace members and their roles.',
      },
      {
        method: 'GET',
        path: '/v1/orgs/integrations/members/{member_id}/activity',
        description: 'Real Rooiam endpoint that returns audit activity linked to one member.',
      },
      {
        method: 'GET',
        path: '/v1/orgs/integrations/invites',
        description: 'Real Rooiam endpoint that returns pending workspace invitations.',
      },
      {
        method: 'GET',
        path: '/v1/orgs/integrations/invites/{invite_id}',
        description: 'Real Rooiam endpoint that returns one pending workspace invite.',
      },
      {
        method: 'GET',
        path: '/v1/orgs/integrations/activity',
        description: 'Real Rooiam endpoint that returns paginated workspace activity.',
      },
      {
        method: 'GET',
        path: '/v1/orgs/integrations/audit/actions',
        description: 'Real Rooiam endpoint that returns known audit action names for the workspace.',
      },
      {
        method: 'GET',
        path: '/v1/orgs/integrations/roles',
        description: 'Real Rooiam endpoint that returns available role definitions for the workspace.',
      },
      {
        method: 'GET',
        path: '/v1/orgs/integrations/permissions',
        description: 'Real Rooiam endpoint that returns available permission codes.',
      },
      {
        method: 'GET',
        path: '/v1/orgs/integrations/api-keys/me',
        description: 'Real Rooiam endpoint that returns metadata about the current workspace API key.',
      },
      {
        method: 'GET',
        path: '/v1/orgs/integrations/policy-summary',
        description: 'Real Rooiam endpoint that returns a summarized MFA, session, IP, and client policy view.',
      },
      {
        method: 'GET',
        path: '/v1/orgs/integrations/effective-policy',
        description: 'Real Rooiam endpoint that returns auth, client, and IP policy state for the workspace.',
      },
      {
        method: 'GET',
        path: '/v1/orgs/integrations/widget-preview-config',
        description: 'Real Rooiam endpoint that returns the hosted widget preview/runtime config payload.',
      },
      {
        method: 'PATCH',
        path: '/v1/orgs/integrations/branding',
        description: 'Update workspace branding and hosted login widget settings.',
      },
      {
        method: 'PATCH',
        path: '/v1/orgs/integrations/auth-config',
        description: 'Update Google, Microsoft, and SMTP configuration for the workspace.',
      },
      {
        method: 'POST',
        path: '/v1/orgs/integrations/clients',
        description: 'Create a new workspace app/client.',
      },
      {
        method: 'PATCH',
        path: '/v1/orgs/integrations/clients/{client_id}',
        description: 'Update app name and redirect URIs for a workspace app.',
      },
      {
        method: 'PATCH',
        path: '/v1/orgs/integrations/clients/{client_id}/status',
        description: 'Suspend or resume a workspace app.',
      },
      {
        method: 'POST',
        path: '/v1/orgs/integrations/clients/{client_id}/rotate-secret',
        description: 'Rotate the client secret for a confidential web app.',
      },
      {
        method: 'DELETE',
        path: '/v1/orgs/integrations/clients/{client_id}',
        description: 'Delete a workspace app.',
      },
      {
        method: 'POST',
        path: '/v1/orgs/integrations/invites',
        description: 'Send a workspace invitation.',
      },
      {
        method: 'DELETE',
        path: '/v1/orgs/integrations/invites/{invite_id}',
        description: 'Revoke a pending workspace invitation.',
      },
      {
        method: 'PATCH',
        path: '/v1/orgs/integrations/members/{member_id}/role',
        description: 'Promote or demote a workspace member by changing the role code.',
      },
      {
        method: 'DELETE',
        path: '/v1/orgs/integrations/members/{member_id}',
        description: 'Remove a workspace member.',
      },
    ],
    endpoints: [
      {
        method: 'GET',
        path: '/api/rooiam/workspace',
        description: 'Local backend wrapper for the real workspace integration endpoint.',
      },
      {
        method: 'GET',
        path: '/api/rooiam/branding',
        description: 'Local backend wrapper for the real branding integration endpoint.',
      },
      {
        method: 'GET',
        path: '/api/rooiam/auth-config',
        description: 'Local backend wrapper for the real auth-config integration endpoint.',
      },
      {
        method: 'GET',
        path: '/api/rooiam/clients',
        description: 'Local backend wrapper for the real clients integration endpoint.',
      },
      {
        method: 'GET',
        path: '/api/rooiam/clients/:clientId',
        description: 'Local backend wrapper for one workspace app detail.',
      },
      {
        method: 'GET',
        path: '/api/rooiam/clients/:clientId/secret-metadata',
        description: 'Local backend wrapper for one workspace app secret metadata payload.',
      },
      {
        method: 'GET',
        path: '/api/rooiam/members',
        description: 'Local backend wrapper for the real members integration endpoint.',
      },
      {
        method: 'GET',
        path: '/api/rooiam/members/:memberId/activity',
        description: 'Local backend wrapper for member-linked audit activity.',
      },
      {
        method: 'GET',
        path: '/api/rooiam/invites',
        description: 'Local backend wrapper for the real invites integration endpoint.',
      },
      {
        method: 'GET',
        path: '/api/rooiam/invites/:inviteId',
        description: 'Local backend wrapper for one pending invite.',
      },
      {
        method: 'GET',
        path: '/api/rooiam/activity',
        description: 'Local backend wrapper for the real activity integration endpoint.',
      },
      {
        method: 'GET',
        path: '/api/rooiam/audit/actions',
        description: 'Local backend wrapper for the audit action catalog.',
      },
      {
        method: 'GET',
        path: '/api/rooiam/roles',
        description: 'Local backend wrapper for available workspace roles.',
      },
      {
        method: 'GET',
        path: '/api/rooiam/permissions',
        description: 'Local backend wrapper for available permission codes.',
      },
      {
        method: 'GET',
        path: '/api/rooiam/api-keys/me',
        description: 'Local backend wrapper for current API key metadata.',
      },
      {
        method: 'GET',
        path: '/api/rooiam/policy-summary',
        description: 'Local backend wrapper for summarized workspace policy.',
      },
      {
        method: 'GET',
        path: '/api/rooiam/effective-policy',
        description: 'Local backend wrapper for the real effective-policy integration endpoint.',
      },
      {
        method: 'GET',
        path: '/api/rooiam/widget-preview-config',
        description: 'Local backend wrapper for the hosted widget preview/runtime config.',
      },
      {
        method: 'PATCH',
        path: '/api/rooiam/branding',
        description: 'Local backend wrapper for updating workspace branding.',
      },
      {
        method: 'PATCH',
        path: '/api/rooiam/auth-config',
        description: 'Local backend wrapper for updating auth config.',
      },
      {
        method: 'POST',
        path: '/api/rooiam/clients',
        description: 'Local backend wrapper for creating a workspace app.',
      },
      {
        method: 'PATCH',
        path: '/api/rooiam/clients/:clientId',
        description: 'Local backend wrapper for updating a workspace app.',
      },
      {
        method: 'PATCH',
        path: '/api/rooiam/clients/:clientId/status',
        description: 'Local backend wrapper for suspending or resuming a workspace app.',
      },
      {
        method: 'POST',
        path: '/api/rooiam/clients/:clientId/rotate-secret',
        description: 'Local backend wrapper for rotating a workspace app secret.',
      },
      {
        method: 'DELETE',
        path: '/api/rooiam/clients/:clientId',
        description: 'Local backend wrapper for deleting a workspace app.',
      },
      {
        method: 'POST',
        path: '/api/rooiam/invites',
        description: 'Local backend wrapper for creating a workspace invite.',
      },
      {
        method: 'DELETE',
        path: '/api/rooiam/invites/:inviteId',
        description: 'Local backend wrapper for revoking a workspace invite.',
      },
      {
        method: 'PATCH',
        path: '/api/rooiam/members/:memberId/role',
        description: 'Local backend wrapper for promoting or demoting a member.',
      },
      {
        method: 'DELETE',
        path: '/api/rooiam/members/:memberId',
        description: 'Local backend wrapper for removing a member.',
      },
      {
        method: 'GET',
        path: '/api/capabilities',
        description: 'Lists the real Rooiam API-key endpoints and the local backend wrappers in this example.',
      },
    ],
  })
})

app.get('/', (_req, res) => {
  const maskedApiKey = maskApiKey(apiKey)
  res.send(
    layout({
      title: 'Example 3: Backend API',
      body: `
        <header class="hero">
          <div>
            <h1>Example 3: Backend API</h1>
            <p>Examples of API calls with REST endpoints through the example backend server.</p>
          </div>
        </header>

        <section class="docs-layout">
          <aside class="docs-sidebar">
            <h3>Sections</h3>
            <nav id="docs-nav" class="docs-nav" aria-label="Section navigation"></nav>
          </aside>
          <div class="docs-main stack">
          <section class="action-card" data-nav-title="Workspace API Key">
            <h3>Workspace API Key</h3>
            <p>Paste the key used for these requests. If this is blank, the page falls back to the example server key from <code>.env</code>.</p>
            <div class="control-grid">
              <div style="grid-column:1 / -1;">
                <label class="label" for="workspace-api-key">Workspace API Key</label>
                <input
                  id="workspace-api-key"
                  class="input"
                  type="text"
                  placeholder="rooiam_..."
                  value="${maskedApiKey}"
                  ${maskedApiKey ? 'data-prefilled="env"' : ''}
                />
              </div>
            </div>
            <div class="preset-grid">
              <div class="preset-card owner">
                <h4>Workspace owner key</h4>
                <p>Full workspace control plane for one workspace.</p>
                <div class="preset-list">
                  <div class="preset-item">Workspace info, policy summary, current key metadata, and effective policy</div>
                  <div class="preset-item">Branding, widget preview config, and auth config read/write</div>
                  <div class="preset-item">Apps, invites, members, roles, permissions, audit actions, and activity</div>
                  <div class="preset-item">Can rotate app secret, delete app, update member profile, remove member, and revoke member sessions</div>
                </div>
              </div>
              <div class="preset-card admin">
                <h4>Workspace admin key</h4>
                <p>Reduced workspace machine key for admins.</p>
                <div class="preset-list">
                  <div class="preset-item">Read workspace, policy summary, current key metadata, and effective policy</div>
                  <div class="preset-item">Read branding, widget preview config, auth config, apps, members, invites, roles, permissions, audit actions, and activity</div>
                  <div class="preset-item">Can create and update apps, invites, and member roles</div>
                  <div class="preset-item blocked">No branding write, auth config write, secret rotate, app delete, member profile update, member remove, or member session revoke</div>
                </div>
              </div>
            </div>
            <div class="matrix-table">
              <table>
                <thead>
                  <tr>
                    <th>Area</th>
                    <th>Permission</th>
                    <th>Workspace Owner</th>
                    <th>Workspace Admin</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td><span class="matrix-pill">Preset Model</span></td><td>workspace_owner preset exists</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-no">No</span></td><td>Owner-only key type</td></tr>
                  <tr><td><span class="matrix-pill">Preset Model</span></td><td>workspace_admin preset exists</td><td><span class="matrix-pill matrix-no">No</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Reduced admin key type</td></tr>
                  <tr><td><span class="matrix-pill">Auth Channel</span></td><td>Creates a human session</td><td><span class="matrix-pill matrix-no">No</span></td><td><span class="matrix-pill matrix-no">No</span></td><td>Human login only</td></tr>
                  <tr><td><span class="matrix-pill">Scope</span></td><td>Works across many workspaces</td><td><span class="matrix-pill matrix-no">No</span></td><td><span class="matrix-pill matrix-no">No</span></td><td>Needs tenant or platform key</td></tr>
                  <tr><td><span class="matrix-pill">Workspace</span></td><td>Read workspace</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Single-workspace scope</td></tr>
                  <tr><td><span class="matrix-pill">Workspace</span></td><td>Read policy summary</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>MFA, sessions, IP, and client summary</td></tr>
                  <tr><td><span class="matrix-pill">Workspace</span></td><td>Read effective policy</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Single-workspace scope</td></tr>
                  <tr><td><span class="matrix-pill">API Key</span></td><td>Read current API key metadata</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Current key label, prefix, and preset</td></tr>
                  <tr><td><span class="matrix-pill">Branding</span></td><td>Read branding + widget</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Read machine config</td></tr>
                  <tr><td><span class="matrix-pill">Branding</span></td><td>Read widget preview config</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Hosted widget runtime preview payload</td></tr>
                  <tr><td><span class="matrix-pill">Branding</span></td><td>Write branding + widget</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-no">No</span></td><td>Owner write only</td></tr>
                  <tr><td><span class="matrix-pill">Auth Config</span></td><td>Read auth config</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Read machine config</td></tr>
                  <tr><td><span class="matrix-pill">Auth Config</span></td><td>Write auth config</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-no">No</span></td><td>Owner write only</td></tr>
                  <tr><td><span class="matrix-pill">Apps</span></td><td>Read apps</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>List registered apps</td></tr>
                  <tr><td><span class="matrix-pill">Apps</span></td><td>Read app detail</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>One app with redirects and status</td></tr>
                  <tr><td><span class="matrix-pill">Apps</span></td><td>Read app secret metadata</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Has secret and can rotate state</td></tr>
                  <tr><td><span class="matrix-pill">Apps</span></td><td>Create app</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Create in this workspace</td></tr>
                  <tr><td><span class="matrix-pill">Apps</span></td><td>Update app</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Edit name and redirects</td></tr>
                  <tr><td><span class="matrix-pill">Apps</span></td><td>Update app status</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Suspend or resume</td></tr>
                  <tr><td><span class="matrix-pill">Apps</span></td><td>Rotate app secret</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-no">No</span></td><td>Owner-only sensitive write</td></tr>
                  <tr><td><span class="matrix-pill">Apps</span></td><td>Delete app</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-no">No</span></td><td>Owner-only destructive write</td></tr>
                  <tr><td><span class="matrix-pill">Members</span></td><td>Read members</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Workspace membership list</td></tr>
                  <tr><td><span class="matrix-pill">Members</span></td><td>Read member detail</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Display name, avatar, email, roles</td></tr>
                  <tr><td><span class="matrix-pill">Members</span></td><td>Read member activity</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Member-linked audit history</td></tr>
                  <tr><td><span class="matrix-pill">Members</span></td><td>Update member profile</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-no">No</span></td><td>Owner-only write</td></tr>
                  <tr><td><span class="matrix-pill">Members</span></td><td>Update member role</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Promote or demote</td></tr>
                  <tr><td><span class="matrix-pill">Members</span></td><td>Remove member</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-no">No</span></td><td>Owner-only destructive write</td></tr>
                  <tr><td><span class="matrix-pill">Members</span></td><td>Read member sessions</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Session visibility only</td></tr>
                  <tr><td><span class="matrix-pill">Members</span></td><td>Revoke member sessions</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-no">No</span></td><td>Owner-only disruptive action</td></tr>
                  <tr><td><span class="matrix-pill">Invites</span></td><td>Read invites</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Pending invite list</td></tr>
                  <tr><td><span class="matrix-pill">Invites</span></td><td>Read invite detail</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>One pending invite record</td></tr>
                  <tr><td><span class="matrix-pill">Invites</span></td><td>Create invite</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Invite into this workspace</td></tr>
                  <tr><td><span class="matrix-pill">Invites</span></td><td>Delete invite</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Revoke pending invite</td></tr>
                  <tr><td><span class="matrix-pill">Catalog</span></td><td>Read roles</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Available workspace roles</td></tr>
                  <tr><td><span class="matrix-pill">Catalog</span></td><td>Read permissions</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Available permission codes</td></tr>
                  <tr><td><span class="matrix-pill">Catalog</span></td><td>Read audit actions</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Known audit action names</td></tr>
                  <tr><td><span class="matrix-pill">Activity</span></td><td>Read activity</td><td><span class="matrix-pill matrix-yes owner">Yes</span></td><td><span class="matrix-pill matrix-yes admin">Yes</span></td><td>Audit visibility</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="workspace-objects-section" class="action-list">
              <section class="action-card" data-nav-title="Workspace">
                <h3>Workspace</h3>
                <p>Workspace-level metadata and top-level workspace management.</p>
                <div class="request-list">
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/workspace</code></div>
                    <div class="request-copy">Get workspace identity and top-level integration metadata for the current key.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="workspace-btn" class="btn" type="button">Get</button></div>
                    <div id="workspace-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="workspace-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/policy-summary</code></div>
                    <div class="request-copy">Get one summarized policy payload for MFA, sessions, IP rules, and client posture.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="policy-summary-btn" class="btn" type="button">Get</button></div>
                    <div id="policy-summary-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="policy-summary-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/api-keys/me</code></div>
                    <div class="request-copy">Get metadata about the current workspace API key, including preset and allowed permission set.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="api-key-me-btn" class="btn" type="button">Get</button></div>
                    <div id="api-key-me-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="api-key-me-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                </div>
              </section>

              <section class="action-card" data-nav-title="Branding & Login Widget">
                <h3>Branding & Login Widget</h3>
                <p>Workspace identity styling and hosted login widget display settings.</p>
                <div class="request-list">
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/branding</code></div>
                    <div class="request-copy">Read workspace branding and saved login widget settings.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="branding-btn" class="btn" type="button">Get</button></div>
                    <div id="branding-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="branding-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/widget-preview-config</code></div>
                    <div class="request-copy">Read the hosted widget runtime preview payload with enabled methods, logo, and style tokens.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="widget-preview-config-btn" class="btn" type="button">Get</button></div>
                    <div id="widget-preview-config-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="widget-preview-config-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                </div>
              </section>

              <section class="action-card" data-nav-title="Auth Config">
                <h3>Auth Config</h3>
                <p>Workspace auth-provider and SMTP configuration state.</p>
                <div class="request-list">
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/auth-config</code></div>
                    <div class="request-copy">Read workspace auth-provider, SMTP, and login policy config state.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="auth-config-btn" class="btn" type="button">Get</button></div>
                    <div id="auth-config-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="auth-config-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                </div>
              </section>

              <section class="action-card" data-nav-title="Apps / Clients">
                <h3>Apps / Clients</h3>
                <p>Workspace app registration and lifecycle management.</p>
                <div class="meta-line" style="margin-top:18px;"><span class="badge ok">Lifecycle test</span> <span id="client-target">No tracked test client yet.</span></div>
                <div class="request-list">
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/clients</code></div>
                    <div class="request-copy">List apps and redirect URIs.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="clients-btn" class="btn" type="button">Get</button></div>
                    <div id="clients-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="clients-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/clients/{client_id}</code></div>
                    <div class="request-copy">Read the tracked app detail with redirects, status, and app type.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="client-detail-btn" class="btn" type="button">Get</button></div>
                    <div id="client-detail-note" class="hint" style="margin-top:12px;">Create or load a test client first.</div>
                    <pre id="client-detail-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/clients/{client_id}/secret-metadata</code></div>
                    <div class="request-copy">Read whether the tracked app has a secret and whether secret rotation is available.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="client-secret-metadata-btn" class="btn" type="button">Get</button></div>
                    <div id="client-secret-metadata-note" class="hint" style="margin-top:12px;">Create or load a test client first.</div>
                    <pre id="client-secret-metadata-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">POST</span> <code>/v1/orgs/integrations/clients</code></div>
                    <div class="request-copy">Create a throwaway test client.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="create-client-btn" class="btn" type="button">Create</button></div>
                    <div id="create-client-note" class="hint" style="margin-top:12px;">Create the throwaway test client first, then run the rest of the lifecycle requests.</div>
                    <pre id="create-client-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">PATCH</span> <code>/v1/orgs/integrations/clients/{client_id}</code></div>
                    <div class="request-copy">Rename the tracked client and update its redirect URIs.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="update-client-btn" class="btn" type="button">Patch</button></div>
                    <div id="update-client-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="update-client-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">PATCH</span> <code>/v1/orgs/integrations/clients/{client_id}/status</code></div>
                    <div class="request-copy">Suspend the tracked client.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="suspend-client-btn" class="btn" type="button">Patch</button></div>
                    <div id="suspend-client-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="suspend-client-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">PATCH</span> <code>/v1/orgs/integrations/clients/{client_id}/status</code></div>
                    <div class="request-copy">Resume the tracked client back to active.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="resume-client-btn" class="btn" type="button">Patch</button></div>
                    <div id="resume-client-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="resume-client-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">POST</span> <code>/v1/orgs/integrations/clients/{client_id}/rotate-secret</code></div>
                    <div class="request-copy">Rotate the tracked confidential client secret.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="rotate-client-secret-btn" class="btn" type="button">Post</button></div>
                    <div id="rotate-client-secret-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="rotate-client-secret-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">DELETE</span> <code>/v1/orgs/integrations/clients/{client_id}</code></div>
                    <div class="request-copy">Delete the tracked test client.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="delete-client-btn" class="btn" type="button">Delete</button></div>
                    <div id="delete-client-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="delete-client-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                </div>
              </section>

              <section class="action-card" data-nav-title="Members">
                <h3>Members</h3>
                <p>Workspace member list and workspace membership management.</p>
                <div class="control-grid">
                  <div>
                    <label class="label" for="member-select">Member</label>
                    <select id="member-select" class="select">
                      <option value="">No members loaded</option>
                    </select>
                  </div>
                  <div>
                    <label class="label" for="role-select">Role Code</label>
                    <select id="role-select" class="select">
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>
                  <div>
                    <label class="label" for="member-display-name">Display Name</label>
                    <input id="member-display-name" class="input" type="text" placeholder="Display name" />
                  </div>
                  <div style="grid-column:1 / -1;">
                    <label class="label" for="member-avatar-url">Avatar URL</label>
                    <input id="member-avatar-url" class="input" type="text" placeholder="https://example.com/avatar.png" />
                  </div>
                </div>
                <div class="request-list">
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/members</code></div>
                    <div class="request-copy">List workspace members and current roles.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="members-btn" class="btn" type="button">Get</button></div>
                    <div id="members-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="members-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/members/{member_id}</code></div>
                    <div class="request-copy">Get one member profile with display name, avatar, email, roles, and last seen time.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="member-detail-btn" class="btn" type="button">Get</button></div>
                    <div id="member-detail-note" class="hint" style="margin-top:12px;">Select a member first.</div>
                    <pre id="member-detail-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/members/{member_id}/activity</code></div>
                    <div class="request-copy">Read audit activity linked to the selected member.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="member-activity-btn" class="btn" type="button">Get</button></div>
                    <div id="member-activity-note" class="hint" style="margin-top:12px;">Select a member first.</div>
                    <pre id="member-activity-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">PATCH</span> <code>/v1/orgs/integrations/members/{member_id}/profile</code></div>
                    <div class="request-copy">Update the selected member display name and avatar URL.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="update-member-profile-btn" class="btn" type="button">Patch</button></div>
                    <div id="update-member-profile-note" class="hint" style="margin-top:12px;">Select a member first.</div>
                    <pre id="update-member-profile-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/members/{member_id}/sessions</code></div>
                    <div class="request-copy">List active sessions for the selected member in this workspace.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="member-sessions-btn" class="btn" type="button">Get</button></div>
                    <div id="member-sessions-note" class="hint" style="margin-top:12px;">Select a member first.</div>
                    <pre id="member-sessions-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">DELETE</span> <code>/v1/orgs/integrations/members/{member_id}/sessions</code></div>
                    <div class="request-copy">Revoke all active sessions for the selected member in this workspace.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="revoke-member-sessions-btn" class="btn" type="button">Delete</button></div>
                    <div id="revoke-member-sessions-note" class="hint" style="margin-top:12px;">Select a member first.</div>
                    <pre id="revoke-member-sessions-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">PATCH</span> <code>/v1/orgs/integrations/members/{member_id}/role</code></div>
                    <div class="request-copy">Promote or demote the selected member.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="change-role-btn" class="btn" type="button">Patch</button></div>
                    <div id="change-role-note" class="hint" style="margin-top:12px;">Load members first, then choose a member and role.</div>
                    <pre id="change-role-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">DELETE</span> <code>/v1/orgs/integrations/members/{member_id}</code></div>
                    <div class="request-copy">Remove the selected member from the workspace.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="remove-member-btn" class="btn" type="button">Delete</button></div>
                    <div id="remove-member-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="remove-member-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                </div>
              </section>

              <section class="action-card" data-nav-title="Invites">
                <h3>Invites</h3>
                <p>Pending workspace invitations and invite lifecycle actions.</p>
                <div class="control-grid">
                  <div>
                    <label class="label" for="invite-email">Invite Email</label>
                    <input id="invite-email" class="input" type="email" placeholder="invitee@example.com" />
                  </div>
                  <div>
                    <label class="label" for="invite-select">Pending Invite</label>
                    <select id="invite-select" class="select">
                      <option value="">No pending invites</option>
                    </select>
                  </div>
                </div>
                <div class="request-list">
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/invites</code></div>
                    <div class="request-copy">List pending invites.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="invites-btn" class="btn" type="button">Get</button></div>
                    <div id="invites-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="invites-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/invites/{invite_id}</code></div>
                    <div class="request-copy">Read the selected pending invite detail.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="invite-detail-btn" class="btn" type="button">Get</button></div>
                    <div id="invite-detail-note" class="hint" style="margin-top:12px;">No pending invite selected.</div>
                    <pre id="invite-detail-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">POST</span> <code>/v1/orgs/integrations/invites</code></div>
                    <div class="request-copy">Send an invite to the entered email address.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="send-invite-btn" class="btn" type="button">Post</button></div>
                    <div id="send-invite-note" class="hint" style="margin-top:12px;">Enter an email and send the invite.</div>
                    <pre id="send-invite-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">DELETE</span> <code>/v1/orgs/integrations/invites/{invite_id}</code></div>
                    <div class="request-copy">Revoke the selected pending invite.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="revoke-invite-btn" class="btn" type="button">Delete</button></div>
                    <div id="revoke-invite-note" class="hint" style="margin-top:12px;">No pending invite selected.</div>
                    <pre id="revoke-invite-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                </div>
              </section>

              <section class="action-card" data-nav-title="Roles & Permissions">
                <h3>Roles & Permissions</h3>
                <p>Workspace role catalog and permission code catalog for automation clients.</p>
                <div class="request-list">
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/roles</code></div>
                    <div class="request-copy">Read the available workspace role definitions.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="roles-btn" class="btn" type="button">Get</button></div>
                    <div id="roles-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="roles-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/permissions</code></div>
                    <div class="request-copy">Read the available permission codes exposed by Rooiam.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="permissions-btn" class="btn" type="button">Get</button></div>
                    <div id="permissions-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="permissions-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                </div>
              </section>

              <section class="action-card" data-nav-title="Activity & Policy">
                <h3>Activity & Policy</h3>
                <p>Read-only audit and effective policy state for the current workspace.</p>
                <div class="request-list">
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/activity</code></div>
                    <div class="request-copy">Read workspace audit activity.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="activity-btn" class="btn" type="button">Get</button></div>
                    <div id="activity-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="activity-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/audit/actions</code></div>
                    <div class="request-copy">Read the distinct audit action names currently present in the workspace audit log.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="audit-actions-btn" class="btn" type="button">Get</button></div>
                    <div id="audit-actions-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="audit-actions-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                  <div class="request-item">
                    <div class="request-path"><span class="method">GET</span> <code>/v1/orgs/integrations/effective-policy</code></div>
                    <div class="request-copy">Read effective auth, client, and IP policy state.</div>
                    <div class="kv">
                      <div class="kv-row"><div class="kv-name">Header Name</div><div class="kv-value"><code>Authorization</code></div></div>
                      <div class="kv-row"><div class="kv-name">Header Value</div><div class="kv-value"><code>Bearer &lt;workspace_api_key&gt;</code></div></div>
                    </div>
                    <div class="action-bar"><button id="effective-policy-btn" class="btn" type="button">Get</button></div>
                    <div id="effective-policy-note" class="hint" style="margin-top:12px;">Not called yet.</div>
                    <pre id="effective-policy-code" class="code json-view">The JSON response will appear here.</pre>
                  </div>
                </div>
              </section>

              <section class="action-card" data-nav-title="API Keys">
                <h3>API Keys</h3>
                <p>Workspace API keys can use this page, but they cannot mint or revoke other keys.</p>
                <div class="checklist">
                  <div class="check-item"><span class="check-mark info">i</span><div><code>POST /v1/orgs/current/api-keys</code><br />Key creation stays in the human workspace UI. A workspace key cannot mint another workspace key.</div></div>
                  <div class="check-item"><span class="check-mark info">i</span><div><code>DELETE /v1/orgs/current/api-keys/{key_id}</code><br />Key revoke stays in the human workspace UI. A workspace key cannot revoke another workspace key.</div></div>
                </div>
              </section>

              <section class="action-card" data-nav-title="Identity, Sessions, and Login">
                <h3>Identity, Sessions, and Login</h3>
                <p>These belong to human users, not machine-to-machine workspace keys.</p>
                <div class="checklist">
                  <div class="check-item"><span class="check-mark info">i</span><div>Magic link, Google, Microsoft, logout, <code>/identity/me</code>, passkeys, and personal MFA are session-based flows.</div></div>
                  <div class="check-item"><span class="check-mark info">i</span><div><code>/v1/oidc/authorize</code>, <code>/token</code>, and <code>/userinfo</code> are app/OIDC routes, not workspace-key management routes.</div></div>
                </div>
              </section>
          </section>
          </div>
        </section>
      `,
    }),
  )
})

app.listen(port, () => {
  console.log(`example-3-backend running on http://localhost:${port}`)
})
