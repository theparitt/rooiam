import React from 'react'

const entries: { label: string; value: string }[] = [
  { label: 'VITE_API_URL',  value: import.meta.env.VITE_API_URL  || '(not set)' },
  { label: 'VITE_DOCS_URL', value: import.meta.env.VITE_DOCS_URL || '(not set)' },
]

export default function DebugBadge() {
  const [clicks, setClicks] = React.useState(0)
  const [open, setOpen] = React.useState(false)

  function handleClick() {
    if (open) {
      setOpen(false)
      return
    }
    const next = clicks + 1
    if (next >= 5) {
      setOpen(true)
      setClicks(0)
    } else {
      setClicks(next)
    }
  }

  return (
    <>
      <div
        onClick={handleClick}
        style={{
          position: 'fixed', bottom: 12, right: 12, zIndex: 9999,
          fontSize: 11, fontFamily: 'monospace',
          color: '#444',
          padding: '2px 8px',
          userSelect: 'none',
        }}
      >
        {__BUILD_TIME__}
      </div>

      {open && (
        <div
          style={{
            position: 'fixed', bottom: 40, right: 12, zIndex: 9999,
            background: 'rgba(10,10,10,0.92)', color: '#e2e2e2',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, padding: '14px 18px',
            fontFamily: 'monospace', fontSize: 12,
            minWidth: 320, backdropFilter: 'blur(8px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          <div style={{ marginBottom: 10, color: '#888', fontSize: 11, letterSpacing: '0.08em' }}>
            BUILD CONFIG
          </div>
          {entries.map(e => (
            <div key={e.label} style={{ marginBottom: 6 }}>
              <span style={{ color: '#666' }}>{e.label}</span>
              <br />
              <span style={{ color: '#7dd3fc', wordBreak: 'break-all' }}>{e.value}</span>
            </div>
          ))}
          <button
            onClick={() => setOpen(false)}
            style={{
              marginTop: 10, fontSize: 11, color: '#555', background: 'none',
              border: 'none', cursor: 'pointer', padding: 0,
            }}
          >
            close
          </button>
        </div>
      )}
    </>
  )
}
