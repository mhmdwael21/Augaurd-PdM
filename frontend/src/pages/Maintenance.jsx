import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { getMaintenanceRecords, getMaintenanceStats, getEquipment, getSpareParts, updateSparePart } from '../api'
import Topbar from '../components/Topbar'
import Pagination from '../components/Pagination'
import { useResponsive } from '../hooks/useResponsive'
import { usePagination } from '../hooks/usePagination'
import { C } from '../tokens'

const MS = ({ name, size = 18, color, style = {} }) => (
  <span style={{
    fontFamily: "'Material Symbols Outlined'",
    fontVariationSettings: "'FILL' 0, 'wght' 300",
    fontStyle: 'normal', lineHeight: 1,
    display: 'inline-block', verticalAlign: 'middle',
    fontSize: size, color, ...style,
  }}>{name}</span>
)

function fmtDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const p2 = x => String(x).padStart(2, '0')
  return `${M[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

const OUTCOME_LABEL = {
  failure_confirmed: 'Failure Confirmed', no_fault_found: 'No Fault Found',
  partial: 'Partial', inconclusive: 'Inconclusive',
}
function outcomeStyle(o) {
  const m = {
    failure_confirmed: { bg: C.critBg, fg: C.critText, bd: C.critBd },
    no_fault_found:    { bg: C.normalBg, fg: C.normalText, bd: C.normalBd },
    partial:           { bg: C.warnBg, fg: C.warnText, bd: C.warnBd },
    inconclusive:      { bg: 'rgba(148,137,121,.16)', fg: C.textMuted, bd: C.borderStrong },
  }
  return m[o] || m.inconclusive
}

function Kpi({ label, value, unit, accent, sub }) {
  return (
    <div style={{ background: C.bgSurface, border: `1px solid ${C.borderStrong}`, borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11, fontWeight: 500, color: C.textMuted, letterSpacing: '.04em', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 30, fontWeight: 700, color: accent || C.textPrimary }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: C.textDim }}>{unit}</span>}
      </div>
      {sub && <span style={{ fontSize: 11, color: C.textDim }}>{sub}</span>}
    </div>
  )
}

export default function Maintenance() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const { isMobile } = useResponsive()
  const [records, setRecords] = useState([])
  const [stats, setStats] = useState(null)
  const [assetMap, setAssetMap] = useState({})
  const [parts, setParts] = useState([])
  const [loading, setLoading] = useState(true)
  const [restockTarget, setRestockTarget] = useState(null)  // part being restocked
  const [restockQty, setRestockQty] = useState('')
  const [restockMin, setRestockMin] = useState('')

  const load = useCallback(async () => {
    try {
      const [recs, st, pts] = await Promise.all([
        getMaintenanceRecords(),
        getMaintenanceStats().catch(() => null),
        getSpareParts().catch(() => []),
      ])
      setRecords(Array.isArray(recs) ? recs : [])
      setStats(st)
      setParts(Array.isArray(pts) ? pts : [])
    } catch {}
    setLoading(false)
  }, [])

  function openRestock(p) {
    setRestockTarget(p); setRestockQty(String(p.quantity_in_stock)); setRestockMin(String(p.min_stock_level))
  }
  async function doRestock() {
    if (!restockTarget) return
    try {
      await updateSparePart(restockTarget.id, {
        quantity_in_stock: parseInt(restockQty, 10),
        min_stock_level: parseInt(restockMin, 10),
      })
      await load()
      setRestockTarget(null)
    } catch (e) { alert(e.message) }
  }

  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(load, 8000); return () => clearInterval(id) }, [load])
  useEffect(() => {
    getEquipment().then(list => setAssetMap(Object.fromEntries(list.map(e => [String(e.id), e.asset_tag])))).catch(() => {})
  }, [])

  const precision = stats?.precision_pct
  const precColor = precision == null ? C.textDim : precision >= 75 ? C.normalText : precision >= 50 ? C.warnText : C.critText
  const { pageItems, page, setPage, pageCount, from, to } = usePagination(records, 8)

  return (
    <div style={{ minHeight: '100vh', background: C.bgBase, color: C.textPrimary }}>
      <Topbar />
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '16px 14px 40px' : '26px 28px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* HEADER */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.01em', color: C.textPrimary }}>Maintenance</h1>
          <p style={{ fontSize: 13, color: C.textMuted }}>Completed-work log and reliability KPIs. Outcomes close the loop on AI alert accuracy.</p>
        </div>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(5,1fr)', gap: 12 }}>
          <Kpi label="AI Precision" value={precision == null ? '—' : precision} unit={precision == null ? '' : '%'} accent={precColor} sub="confirmed ÷ (confirmed + false)" />
          <Kpi label="Confirmed (TP)" value={stats?.confirmed ?? 0} accent={C.normalText} sub="real failures found" />
          <Kpi label="False Positives" value={stats?.false_positive ?? 0} accent={C.critText} sub="no fault found" />
          <Kpi label="Avg Downtime" value={stats?.avg_downtime_minutes ?? '—'} unit={stats?.avg_downtime_minutes != null ? 'min' : ''} sub="MTTR proxy" />
          <Kpi label="Records" value={stats?.total ?? 0} sub={`${stats?.total_downtime_minutes ?? 0} min total downtime`} />
        </div>

        {/* INVENTORY */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary }}>Inventory</h2>
            {parts.some(p => p.low_stock)
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: C.critText }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: C.critSolid }} />{parts.filter(p => p.low_stock).length} low on stock</span>
              : <span style={{ fontSize: 12, color: C.textDim }}>{parts.length} parts</span>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
            {parts.map(p => {
              const pct = p.min_stock_level > 0 ? Math.min(100, Math.round(p.quantity_in_stock / (p.min_stock_level * 2) * 100)) : 100
              return (
                <div key={p.id} style={{ background: C.bgSurface, border: `1px solid ${p.low_stock ? C.critBd : C.borderStrong}`, borderRadius: 12, padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: C.textPrimary }}>{p.part_name}</span>
                      <span style={{ fontSize: 10.5, color: C.textDim, fontFamily: 'monospace' }}>{p.part_number}</span>
                    </div>
                    {p.low_stock && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.06em', padding: '3px 8px', borderRadius: 999, background: C.critBg, color: C.critText, border: `1px solid ${C.critBd}`, whiteSpace: 'nowrap' }}>LOW</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 22, fontWeight: 700, color: p.low_stock ? C.critText : C.textPrimary }}>{p.quantity_in_stock}</span>
                    <span style={{ fontSize: 11, color: C.textDim }}>in stock · min {p.min_stock_level}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 999, background: C.bgBase, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 999, width: `${pct}%`, background: p.low_stock ? C.critSolid : C.normalDot }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 10.5, color: C.textDim }}>{p.location || '—'}</span>
                    {isAdmin && <button onClick={() => openRestock(p)} style={{ fontSize: 11, fontWeight: 600, color: '#cabfa6', background: 'transparent', border: `1px solid ${C.borderStrong}`, borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>Restock</button>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* RECORDS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary }}>Maintenance Records</h2>
            <span style={{ fontSize: 12, color: C.textDim }}>{records.length} total</span>
          </div>
          {loading ? (
            <div style={{ padding: 44, textAlign: 'center', color: C.textDim, fontSize: 13 }}>Loading…</div>
          ) : records.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', background: C.bgSurface, border: `1px dashed ${C.borderStrong}`, borderRadius: 14, color: C.textDim, fontSize: 13 }}>
              No maintenance records yet. Completing a work order logs one here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pageItems.map(r => {
                const os = r.outcome ? outcomeStyle(r.outcome) : null
                const assetTag = assetMap[String(r.equipment_id)]
                return (
                  <div key={r.id} style={{ background: C.bgSurface, border: `1px solid ${C.borderStrong}`, borderRadius: 12, padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', padding: '4px 10px', borderRadius: 7, textTransform: 'uppercase', background: 'rgba(148,137,121,.16)', color: C.textSecondary, border: `1px solid ${C.borderStrong}` }}>{r.maintenance_type}</span>
                      <span style={{ fontSize: 13.5, color: C.textPrimary, flex: 1, minWidth: 200, lineHeight: 1.4 }}>{r.action_taken}</span>
                      {assetTag && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, padding: '4px 9px', borderRadius: 7, background: C.bgBase, border: `1px solid ${C.borderStrong}`, color: '#cabfa6', whiteSpace: 'nowrap' }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#7b8a43' }} />{assetTag}
                        </span>
                      )}
                      {os && <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', padding: '4px 10px', borderRadius: 999, textTransform: 'uppercase', background: os.bg, color: os.fg, border: `1px solid ${os.bd}` }}>{OUTCOME_LABEL[r.outcome]}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: 11, color: C.textDim, borderTop: `1px solid ${C.borderSubtle}`, paddingTop: 8 }}>
                      <span>{fmtDate(r.completed_at)}</span>
                      <span>By: {r.performed_by_username || '—'}</span>
                      {r.downtime_minutes != null && <span>Downtime: {r.downtime_minutes} min</span>}
                      {r.parts && r.parts.length > 0 && (
                        <span style={{ color: C.textSecondary }}>Parts: {r.parts.map(p => `${p.quantity_used}× ${p.part_name}`).join(', ')}</span>
                      )}
                      {r.notes && <span style={{ color: C.textMuted }}>· {r.notes}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {!loading && (
            <Pagination page={page} pageCount={pageCount} from={from} to={to} total={records.length} onPage={setPage} label="records" />
          )}
        </div>
      </div>

      {/* RESTOCK MODAL (admin) */}
      {restockTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setRestockTarget(null)}>
          <div className="anim-in" style={{ width: 'min(420px,100%)', background: '#262C35', border: '1px solid #393E46', borderRadius: 18, padding: '26px 28px', display: 'flex', flexDirection: 'column', gap: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: C.textPrimary }}>Restock</h2>
                <p style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>{restockTarget.part_name} · {restockTarget.part_number}</p>
              </div>
              <button onClick={() => setRestockTarget(null)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>In Stock</label>
                <input value={restockQty} onChange={e => setRestockQty(e.target.value)} type="number" min="0" style={{ padding: '11px 13px', borderRadius: 9, border: '1px solid #393E46', background: '#1B2027', color: '#DFD0B8', fontSize: 13.5 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Min Level</label>
                <input value={restockMin} onChange={e => setRestockMin(e.target.value)} type="number" min="0" style={{ padding: '11px 13px', borderRadius: 9, border: '1px solid #393E46', background: '#1B2027', color: '#DFD0B8', fontSize: 13.5 }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setRestockTarget(null)} style={{ padding: '10px 18px', borderRadius: 9, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={doRestock} style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: '#DFD0B8', color: '#1B2027', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
