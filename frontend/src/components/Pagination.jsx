/**
 * Reusable pagination control (dark theme). Pairs with the usePagination hook.
 * Renders "Showing X–Y of Z" + Prev / windowed page numbers / Next.
 * Renders nothing when there's a single page (but still shows the count when
 * `alwaysShowCount` is set).
 */

// Build a compact page window: 1 … (p-1) p (p+1) … last
function pageWindow(page, pageCount) {
  const pages = new Set([1, pageCount, page, page - 1, page + 1])
  const sorted = [...pages].filter(p => p >= 1 && p <= pageCount).sort((a, b) => a - b)
  const out = []
  let prev = 0
  for (const p of sorted) {
    if (p - prev > 1) out.push('…')
    out.push(p)
    prev = p
  }
  return out
}

const btn = (active, disabled) => ({
  minWidth: 32,
  padding: '6px 10px',
  borderRadius: 8,
  border: `1px solid ${active ? '#DFD0B8' : '#333b45'}`,
  background: active ? 'rgba(223,208,184,.12)' : 'transparent',
  color: disabled ? '#4f4a43' : active ? '#DFD0B8' : '#948979',
  fontSize: 12.5,
  fontWeight: 600,
  cursor: disabled ? 'not-allowed' : 'pointer',
})

export default function Pagination({ page, pageCount, from, to, total, onPage, label = 'items', alwaysShowCount = true }) {
  if (total === 0) return null
  const showControls = pageCount > 1
  if (!showControls && !alwaysShowCount) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', paddingTop: 4 }}>
      <span style={{ fontSize: 12, color: '#6f6a60', fontWeight: 500 }}>
        Showing {from}–{to} of {total} {label}
      </span>
      {showControls && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => onPage(page - 1)} disabled={page <= 1} style={btn(false, page <= 1)}>‹ Prev</button>
          {pageWindow(page, pageCount).map((p, i) =>
            p === '…'
              ? <span key={`e${i}`} style={{ color: '#6f6a60', fontSize: 12.5, padding: '0 2px' }}>…</span>
              : <button key={p} onClick={() => onPage(p)} style={btn(p === page, false)}>{p}</button>
          )}
          <button onClick={() => onPage(page + 1)} disabled={page >= pageCount} style={btn(false, page >= pageCount)}>Next ›</button>
        </div>
      )}
    </div>
  )
}
