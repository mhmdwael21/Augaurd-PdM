import { useState, useEffect, useCallback } from 'react'
import { getMaintenanceRecords, getMaintenanceStats, getEquipment } from '../api'
import Topbar from '../components/Topbar'
import { useResponsive } from '../hooks/useResponsive'
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
  const { isMobile } = useResponsive()
  const [records, setRecords] = useState([])
  const [stats, setStats] = useState(null)
  const [assetMap, setAssetMap] = useState({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [recs, st] = await Promise.all([getMaintenanceRecords(), getMaintenanceStats().catch(() => null)])
      setRecords(Array.isArray(recs) ? recs : [])
      setStats(st)
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(load, 8000); return () => clearInterval(id) }, [load])
  useEffect(() => {
    getEquipment().then(list => setAssetMap(Object.fromEntries(list.map(e => [String(e.id), e.asset_tag])))).catch(() => {})
  }, [])

  const precision = stats?.precision_pct
  const precColor = precision == null ? C.textDim : precision >= 75 ? C.normalText : precision >= 50 ? C.warnText : C.critText

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
              {records.map(r => {
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
                      {r.notes && <span style={{ color: C.textMuted }}>· {r.notes}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
