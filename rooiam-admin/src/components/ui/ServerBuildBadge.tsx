import { useEffect, useState } from 'react'
import { getApiOrigin } from '../../lib/api-base'

type ServerBuild = {
    built_at_utc: string
    git_sha: string
    source_ref: string
    release_version: string
}

function formatBuiltAt(value: string): string {
    const date = new Date(value)
    return Number.isNaN(date.getTime())
        ? value
        : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export default function ServerBuildBadge() {
    const [build, setBuild] = useState<ServerBuild | null>(null)
    const [unavailable, setUnavailable] = useState(false)
    const [open, setOpen] = useState(false)

    useEffect(() => {
        let active = true
        let controller: AbortController | null = null

        const load = async () => {
            controller?.abort()
            controller = new AbortController()
            try {
                const response = await fetch(`${getApiOrigin()}/health`, {
                    cache: 'no-store',
                    signal: controller.signal,
                })
                if (!response.ok) throw new Error('Health request failed')
                const body: { build?: Partial<ServerBuild> } = await response.json()
                const value = body.build
                if (!value?.git_sha || !value.built_at_utc) throw new Error('Build identity is unavailable')
                if (active) {
                    setBuild({
                        git_sha: value.git_sha,
                        built_at_utc: value.built_at_utc,
                        source_ref: value.source_ref || 'unknown',
                        release_version: value.release_version || 'unreleased',
                    })
                    setUnavailable(false)
                }
            } catch (error) {
                if (active && !(error instanceof DOMException && error.name === 'AbortError')) {
                    setBuild(null)
                    setUnavailable(true)
                }
            }
        }

        void load()
        const interval = window.setInterval(() => void load(), 5 * 60 * 1000)
        return () => {
            active = false
            window.clearInterval(interval)
            controller?.abort()
        }
    }, [])

    // The hosted login widget can embed this app in an iframe; keep the host page clean.
    if (window.self !== window.top) return null

    const label = unavailable
        ? 'Server build unavailable'
        : build
            ? `Server ${build.release_version === 'unreleased' ? build.git_sha.slice(0, 8) : build.release_version} · Built ${formatBuiltAt(build.built_at_utc)}`
            : 'Checking server build…'

    return (
        <div className="fixed bottom-3 right-3 z-20 max-w-[calc(100vw-1.5rem)] text-right">
            {open && build && (
                <div className="mb-2 ml-auto w-72 max-w-full rounded-2xl border border-violet-100 bg-white/95 p-3 text-left text-[11px] text-slate-600 shadow-xl backdrop-blur-md">
                    <p className="mb-2 font-bold text-slate-800">Server build</p>
                    <dl className="space-y-1.5">
                        <div><dt className="font-semibold">Source commit</dt><dd className="break-all font-mono">{build.git_sha}</dd></div>
                        <div><dt className="font-semibold">Built</dt><dd>{formatBuiltAt(build.built_at_utc)} <span className="text-slate-400">({build.built_at_utc})</span></dd></div>
                        <div><dt className="font-semibold">Git ref</dt><dd className="break-all font-mono">{build.source_ref}</dd></div>
                        <div><dt className="font-semibold">Release</dt><dd>{build.release_version}</dd></div>
                    </dl>
                </div>
            )}
            <button
                type="button"
                onClick={() => setOpen(current => !current)}
                aria-label={label}
                aria-expanded={open && !!build}
                title={build ? `Server commit ${build.git_sha} · Built ${build.built_at_utc}` : label}
                className="max-w-full rounded-full border border-violet-100/80 bg-white/85 px-2.5 py-1 text-[10px] font-medium text-slate-500 shadow-sm backdrop-blur-sm hover:bg-white hover:text-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-500"
            >
                <span className="block truncate">{label}</span>
            </button>
        </div>
    )
}
