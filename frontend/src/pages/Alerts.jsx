import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { getAlerts, getUsers, createAlert, updateAlertStatus, escalateAlert, assignAlert, getFailureModes, getEquipment } from '../api'
import Topbar from '../components/Topbar'
import Pagination from '../components/Pagination'
import { severityStyle, statusStyle } from '../tokens'
import { useResponsive } from '../hooks/useResponsive'
import { usePagination } from '../hooks/usePagination'

const MS = ({ name, size = 17, color, style = {} }) => (
  <span style={{
    fontFamily: "'Material Symbols Outlined'",
    fontVariationSettings: "'FILL' 0, 'wght' 300",
    fontStyle: 'normal', lineHeight: 1,
    display: 'inline-block', verticalAlign: 'middle',
    fontSize: size, color, ...style,
  }}>{name}</span>
)

function fmtDate(ts) {
  const d = new Date(ts)
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const p2 = x => String(x).padStart(2, '0')
  return `${M[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

function scoreColor(s) {
  if (s >= 0.65) return '#E0987F'
  if (s >= 0.5) return '#E4C281'
  return '#C6D196'
}

// FMEA fault-category chip palette (matches the design-token status colours).
const FAULT_CAT_STYLE = {
  pressure: { bg: 'rgba(203,91,60,.14)', fg: '#E0987F', bd: 'rgba(203,91,60,.4)' },
  thermal:  { bg: 'rgba(217,169,74,.14)', fg: '#E4C281', bd: 'rgba(217,169,74,.4)' },
  flow:     { bg: 'rgba(123,138,67,.14)', fg: '#C6D196', bd: 'rgba(123,138,67,.4)' },
  digital:  { bg: 'rgba(148,137,121,.16)', fg: '#cabfa6', bd: 'rgba(148,137,121,.35)' },
}

function FilterBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', borderRadius: 8, border: `1px solid ${active ? '#DFD0B8' : '#333b45'}`,
      background: active ? 'rgba(223,208,184,.12)' : 'transparent',
      color: active ? '#DFD0B8' : '#948979',
      fontWeight: 600, fontSize: 12, cursor: 'pointer', letterSpacing: '.02em',
    }}>{label}</button>
  )
}

function StatCard({ label, icon, count, numColor, barColor, barW, highlight }) {
  return (
    <div style={{
      background: '#222831', border: `1px solid ${highlight ? 'rgba(203,91,60,.35)' : '#333b45'}`,
      borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11.5, fontWeight: 500, color: '#948979', letterSpacing: '.04em' }}>{label}</span>
        <MS name={icon} size={18} color="#948979" />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 700, color: numColor }}>{count}</span>
        <span style={{ fontSize: 11, color: '#6f6a60' }}>alerts</span>
      </div>
      <div style={{ height: 3, borderRadius: 999, background: '#1B2027', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 999, width: barW, background: barColor }} />
      </div>
    </div>
  )
}

export default function Alerts() {
  const { role, username } = useAuth()
  const isAdmin = role === 'admin'
  const isTech = role === 'technician'
  const { isMobile } = useResponsive()

  const [alerts, setAlerts] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQ, setSearchQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sevFilter, setSevFilter] = useState('all')
  const [expanded, setExpanded] = useState({})
  const [createOpen, setCreateOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignTargetId, setAssignTargetId] = useState(null)
  const [assignUserId, setAssignUserId] = useState(null)
  const [assignError, setAssignError] = useState(null)
  const [newFailure, setNewFailure] = useState('')
  const [newAction, setNewAction] = useState('')
  const [newSev, setNewSev] = useState('medium')
  const [newScore, setNewScore] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [fmodes, setFmodes] = useState({})  // failure_mode_id -> failure mode (FMEA catalog)
  const [assetMap, setAssetMap] = useState({})  // equipment_id -> asset_tag

  const load = useCallback(async () => {
    try {
      const [al, us] = await Promise.all([getAlerts(), isAdmin ? getUsers() : Promise.resolve([])])
      setAlerts(al)
      setUsers(us)
    } catch {}
    setLoading(false)
  }, [isAdmin])

  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(load, 5000); return () => clearInterval(id) }, [load])

  // FMEA catalog + asset registry are tiny + static — fetch once, key by id.
  useEffect(() => {
    getFailureModes()
      .then(list => setFmodes(Object.fromEntries(list.map(m => [String(m.id), m]))))
      .catch(() => {})
    getEquipment()
      .then(list => setAssetMap(Object.fromEntries(list.map(e => [String(e.id), e.asset_tag]))))
      .catch(() => {})
  }, [])

  const userMap = Object.fromEntries(users.map(u => [String(u.id), u.username]))

  const filtered = alerts.filter(a => {
    if (statusFilter !== 'all' && a.status !== statusFilter) return false
    if (sevFilter !== 'all' && a.severity !== sevFilter) return false
    if (searchQ) {
      const q = searchQ.toLowerCase()
      if (!(a.predicted_failure || '').toLowerCase().includes(q) && !a.id.toLowerCase().includes(q) && !(a.recommended_action || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const total = alerts.length
  const newN = alerts.filter(a => a.status === 'new').length
  const critN = alerts.filter(a => a.severity === 'critical').length
  const resolvedN = alerts.filter(a => a.status === 'resolved').length

  const { pageItems, page, setPage, pageCount, from, to } = usePagination(filtered, 8)
  // Jump back to page 1 whenever the filters/search change the result set.
  useEffect(() => { setPage(1) }, [statusFilter, sevFilter, searchQ, setPage])

  function surfaceError(e) {
    let m = e?.message || 'Action failed'
    try { m = JSON.parse(m).detail || m } catch {}
    alert(m)
  }
  async function doStatus(id, status) {
    try { await updateAlertStatus(id, status); await load() } catch (e) { surfaceError(e) }
  }
  async function doEscalate(id) {
    try { await escalateAlert(id); await load() } catch (e) { surfaceError(e) }
  }
  async function doAssign() {
    if (!assignUserId) return
    setAssignError(null)
    try {
      await assignAlert(assignTargetId, assignUserId)
      await load()
      setAssignOpen(false); setAssignTargetId(null); setAssignUserId(null)
    } catch (e) {
      // Surface the backend reason (e.g. role not assignable) instead of failing silently.
      let msg = e?.message || 'Assignment failed'
      try { msg = JSON.parse(msg).detail || msg } catch {}
      setAssignError(msg)
    }
  }
  async function doCreate() {
    if (!newFailure || !newAction) return
    try {
      await createAlert({ predicted_failure: newFailure, recommended_action: newAction, severity: newSev, anomaly_score: newScore ? parseFloat(newScore) : undefined })
      await load()
      setCreateOpen(false); setNewFailure(''); setNewAction(''); setNewSev('medium'); setNewScore('')
    } catch {}
  }

  const sevOpts = ['low', 'medium', 'high', 'critical']

  return (
    <div style={{ minHeight: '100vh', background: '#1B2027', color: '#DFD0B8' }}>
      <Topbar unreadCount={unreadCount} activePage="Alerts" />

      <div style={{ maxWidth: 1440, margin: '0 auto', padding: isMobile ? '16px 14px 40px' : '26px 28px 48px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 22 }}>

        {/* MAIN COLUMN */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* PAGE HEADER */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.01em', color: '#DFD0B8' }}>Alert Management</h1>
              <p style={{ fontSize: 13, color: '#948979' }}>Monitor, assign, and resolve AI-generated predictive-maintenance alerts.</p>
            </div>
            {isAdmin && (
              <button onClick={() => setCreateOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, border: 'none', background: '#DFD0B8', color: '#1B2027', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                <MS name="add" size={18} color="#1B2027" /> Create Alert
              </button>
            )}
          </div>

          {/* STAT CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
            <StatCard label="Total Alerts" icon="assignment" count={total} numColor="#DFD0B8" barColor="#393E46" barW="100%" />
            <StatCard label="New" icon="circle_notifications" count={newN} numColor="#E0987F" barColor="#CB5B3C" barW={`${total ? Math.round(newN / total * 100) : 0}%`} highlight={newN > 0} />
            <StatCard label="Critical" icon="warning" count={critN} numColor="#E0987F" barColor="#CB5B3C" barW={`${total ? Math.round(critN / total * 100) : 0}%`} highlight={critN > 0} />
            <StatCard label="Resolved" icon="check_circle" count={resolvedN} numColor="#C6D196" barColor="#7b8a43" barW={`${total ? Math.round(resolvedN / total * 100) : 0}%`} />
          </div>

          {/* FILTERS */}
          <div style={{ background: '#222831', border: '1px solid #333b45', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 9, padding: '9px 13px', background: '#1B2027', border: '1px solid #333b45', borderRadius: 10 }}>
              <MS name="search" size={16} color="#5d5850" />
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search by failure type, ID, action…" style={{ flex: 1, background: 'none', border: 'none', color: '#DFD0B8', fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: '#6f6a60', letterSpacing: '.04em' }}>STATUS</span>
              {['all', 'new', 'acknowledged', 'resolved'].map(v => (
                <FilterBtn key={v} label={v === 'all' ? 'All' : v.charAt(0).toUpperCase() + v.slice(1)} active={statusFilter === v} onClick={() => setStatusFilter(v)} />
              ))}
            </div>
            <div style={{ width: 1, height: 22, background: '#333b45' }} />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: '#6f6a60', letterSpacing: '.04em' }}>SEV</span>
              {['all', 'critical', 'high', 'medium', 'low'].map(v => (
                <FilterBtn key={v} label={v === 'all' ? 'All' : v.charAt(0).toUpperCase() + v.slice(1)} active={sevFilter === v} onClick={() => setSevFilter(v)} />
              ))}
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6f6a60', fontWeight: 500 }}>{filtered.length} alerts</div>
          </div>

          {/* ALERT LIST */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loading && <div style={{ padding: 44, textAlign: 'center', color: '#6f6a60', fontSize: 13 }}>Loading…</div>}
            {!loading && filtered.length === 0 && (
              <div style={{ padding: 44, textAlign: 'center', background: '#222831', border: '1px dashed #333b45', borderRadius: 14, color: '#6f6a60', fontSize: 13 }}>No alerts match your current filters.</div>
            )}
            {pageItems.map((a, idx) => {
              const isExp = !!expanded[a.id]
              const ss = severityStyle(a.severity)
              const sts = statusStyle(a.status)
              const scoreNum = a.anomaly_score != null ? parseFloat(a.anomaly_score) : null
              const mode = a.failure_mode_id ? fmodes[String(a.failure_mode_id)] : null
              const assetTag = assetMap[String(a.equipment_id)]
              return (
                <div key={a.id} className="anim-in" style={{ background: '#222831', border: `1px solid ${isExp ? (a.severity === 'critical' ? 'rgba(203,91,60,.45)' : '#393E46') : '#333b45'}`, borderRadius: 14, overflow: 'hidden', cursor: 'pointer', animationDelay: `${idx * 40}ms` }}
                  onClick={() => setExpanded(e => ({ ...e, [a.id]: !e[a.id] }))}>
                  {/* SUMMARY ROW */}
                  <div style={{ padding: '15px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', padding: '5px 10px', borderRadius: 7, whiteSpace: 'nowrap', ...ss }}>{(a.severity || '').toUpperCase()}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 180 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: '#DFD0B8', lineHeight: 1.3 }}>{a.predicted_failure || '—'}</span>
                      <span style={{ fontSize: 11, color: '#7c756a' }}>{a.id.slice(0, 8)}… · {fmtDate(a.timestamp || a.created_at)}</span>
                    </div>
                    <span style={{ fontSize: 12.5, color: '#a59c8c', flex: 1, minWidth: 140, lineHeight: 1.4 }}>
                      {((a.recommended_action || '').slice(0, 80))}…
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      {assetTag && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', padding: '4px 9px', borderRadius: 7, background: '#1B2027', border: '1px solid #333b45', color: '#cabfa6', whiteSpace: 'nowrap' }} title="Asset">
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#7b8a43' }} />
                          {assetTag}
                        </span>
                      )}
                      {scoreNum != null && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                          <span style={{ fontSize: 9.5, color: '#6f6a60', fontWeight: 500, letterSpacing: '.08em' }}>SCORE</span>
                          <span style={{ fontSize: 15, fontWeight: 700, color: scoreColor(scoreNum) }}>{scoreNum.toFixed(2)}</span>
                        </div>
                      )}
                      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', padding: '5px 11px', borderRadius: 999, whiteSpace: 'nowrap', ...sts }}>{(a.status || '').toUpperCase()}</span>
                      <span style={{ color: '#6f6a60', fontSize: 16, transform: isExp ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform .2s' }}>›</span>
                    </div>
                  </div>

                  {/* EXPANDED DETAIL */}
                  {isExp && (
                    <div className="anim-in" style={{ borderTop: '1px solid #2f3742', padding: '16px 18px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}
                      onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: 12 }}>
                        {[['Alert ID', a.id.slice(0, 8) + '…'], ['Timestamp', fmtDate(a.timestamp || a.created_at)], ['Created By', (a.created_by ? (userMap[a.created_by] || 'system') : 'system')]].map(([k, v]) => (
                          <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '12px 14px', background: '#1B2027', borderRadius: 10 }}>
                            <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '.1em', color: '#6f6a60', textTransform: 'uppercase' }}>{k}</span>
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#DFD0B8' }}>{v}</span>
                          </div>
                        ))}
                      </div>
                      {mode && (
                        <div style={{ padding: '14px 15px', background: '#1B2027', borderRadius: 10, border: '1px solid #2f3742', display: 'flex', flexDirection: 'column', gap: 11 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <MS name="troubleshoot" size={16} color="#948979" />
                              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '.1em', color: '#6f6a60', textTransform: 'uppercase' }}>Matched Failure Mode · FMEA</span>
                            </div>
                            {(() => {
                              const cs = FAULT_CAT_STYLE[mode.fault_category] || FAULT_CAT_STYLE.digital
                              return <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', padding: '3px 9px', borderRadius: 999, textTransform: 'uppercase', background: cs.bg, color: cs.fg, border: `1px solid ${cs.bd}` }}>{mode.fault_category}</span>
                            })()}
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#DFD0B8' }}>{mode.name}</span>
                          {mode.affected_component && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: '.1em', color: '#6f6a60', textTransform: 'uppercase' }}>Affected Component</span>
                              <span style={{ fontSize: 12.5, color: '#cabfa6' }}>{mode.affected_component}</span>
                            </div>
                          )}
                          {mode.typical_symptoms && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: '.1em', color: '#6f6a60', textTransform: 'uppercase' }}>Typical Symptoms</span>
                              <span style={{ fontSize: 12.5, color: '#cabfa6', lineHeight: 1.5 }}>{mode.typical_symptoms}</span>
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{ padding: '13px 15px', background: '#1B2027', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '.1em', color: '#6f6a60', textTransform: 'uppercase' }}>Recommended Action</span>
                        <span style={{ fontSize: 13, color: '#cabfa6', lineHeight: 1.5 }}>{a.recommended_action}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                        {(isAdmin || isTech) && a.status === 'new' && (
                          <button onClick={() => doStatus(a.id, 'acknowledged')} style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid rgba(217,169,74,.55)', background: 'rgba(217,169,74,.1)', color: '#E4C281', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                            Acknowledge
                          </button>
                        )}
                        {(isAdmin || isTech) && a.status === 'acknowledged' && (
                          <button onClick={() => doStatus(a.id, 'resolved')} style={{ padding: '9px 16px', borderRadius: 9, border: 'none', background: '#7b8a43', color: '#1B2027', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                            Mark Resolved
                          </button>
                        )}
                        {isAdmin && a.status !== 'resolved' && a.severity !== 'critical' && (
                          <button onClick={() => doEscalate(a.id)} style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid rgba(203,91,60,.45)', background: 'rgba(203,91,60,.1)', color: '#E0987F', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                            ↑ Escalate to Critical
                          </button>
                        )}
                        {isAdmin && !a.assigned_to && a.status !== 'resolved' && (
                          <button onClick={() => { setAssignTargetId(a.id); setAssignError(null); setAssignUserId(null); setAssignOpen(true) }} style={{ padding: '9px 16px', borderRadius: 9, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                            Assign →
                          </button>
                        )}
                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11.5, color: '#6f6a60' }}>Assigned to:</span>
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#DFD0B8' }}>{a.assigned_to ? (userMap[String(a.assigned_to)] || String(a.assigned_to).slice(0, 8) + '…') : 'Unassigned'}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {!loading && (
            <Pagination page={page} pageCount={pageCount} from={from} to={to} total={filtered.length} onPage={setPage} label="alerts" />
          )}
        </div>

        {/* RIGHT RAIL */}
        <div style={{ display: isMobile ? 'none' : 'flex', flex: '0 0 280px', width: 280, flexDirection: 'column', gap: 14, paddingTop: 4 }}>

          {/* Lifecycle Breakdown */}
          <div style={{ background: '#222831', border: '1px solid #333b45', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: '#948979', textTransform: 'uppercase' }}>Lifecycle Breakdown</span>
            {[
              { label: 'New', n: newN, col: '#CB5B3C', nc: '#E0987F' },
              { label: 'Acknowledged', n: alerts.filter(a => a.status === 'acknowledged').length, col: '#D9A94A', nc: '#E4C281' },
              { label: 'Resolved', n: resolvedN, col: '#7b8a43', nc: '#C6D196' },
            ].map(({ label, n, col, nc }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#cabfa6' }}>{label}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: nc }}>{n}</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: '#1B2027', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 999, width: `${total ? Math.max(4, Math.round(n / total * 100)) : 4}%`, background: col }} />
                </div>
              </div>
            ))}
          </div>

          {/* Severity Split */}
          <div style={{ background: '#222831', border: '1px solid #333b45', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: '#948979', textTransform: 'uppercase' }}>Severity Split</span>
            {[
              { label: 'Critical', sev: 'critical', col: '#CB5B3C', nc: '#E0987F' },
              { label: 'High', sev: 'high', col: '#D9A94A', nc: '#E4C281' },
              { label: 'Medium', sev: 'medium', col: '#948979', nc: '#cabfa6' },
              { label: 'Low', sev: 'low', col: '#AEBC74', nc: '#C6D196' },
            ].map(({ label, sev, col, nc }) => {
              const n = alerts.filter(a => a.severity === sev).length
              return (
                <div key={sev} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#cabfa6' }}>{label}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: nc }}>{n}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: '#1B2027', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 999, width: `${total ? Math.max(4, Math.round(n / total * 100)) : 4}%`, background: col }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* API Ref */}
          <div style={{ background: '#222831', border: '1px solid #333b45', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: '#948979', textTransform: 'uppercase' }}>API Endpoints</span>
            {[
              { method: 'GET', path: '/', col: '#C6D196', bg: 'rgba(123,138,67,.2)' },
              { method: 'POST', path: '/', col: '#E4C281', bg: 'rgba(217,169,74,.2)' },
              { method: 'PUT', path: '/{id}/status', col: '#cabfa6', bg: 'rgba(148,137,121,.2)' },
              { method: 'PUT', path: '/{id}/assign', col: '#cabfa6', bg: 'rgba(148,137,121,.2)' },
              { method: 'PUT', path: '/{id}/escalate', col: '#E0987F', bg: 'rgba(203,91,60,.2)' },
            ].map(ep => (
              <div key={ep.path + ep.method} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', background: '#1B2027', borderRadius: 8 }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: ep.bg, color: ep.col }}>{ep.method}</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: '#cabfa6' }}>/alerts{ep.path}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CREATE ALERT MODAL */}
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setCreateOpen(false)}>
          <div className="anim-in" style={{ width: 'min(560px,100%)', background: '#262C35', border: '1px solid #393E46', borderRadius: 18, padding: '28px 30px', display: 'flex', flexDirection: 'column', gap: 20 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#DFD0B8' }}>Create New Alert</h2>
                <p style={{ fontSize: 12.5, color: '#948979', marginTop: 3 }}>POST /alerts — Admin only</p>
              </div>
              <button onClick={() => setCreateOpen(false)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Predicted Failure *</label>
                <input value={newFailure} onChange={e => setNewFailure(e.target.value)} placeholder="e.g. Novel Pressure Fault — TP2, H1" style={{ padding: '11px 13px', borderRadius: 9, border: '1px solid #393E46', background: '#1B2027', color: '#DFD0B8', fontSize: 13.5 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Recommended Action *</label>
                <textarea value={newAction} onChange={e => setNewAction(e.target.value)} placeholder="Inspect pneumatic circuit for air leaks…" rows={3} style={{ padding: '11px 13px', borderRadius: 9, border: '1px solid #393E46', background: '#1B2027', color: '#DFD0B8', fontSize: 13.5, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Severity</label>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    {sevOpts.map(sv => {
                      const ss = severityStyle(sv)
                      const active = newSev === sv
                      return (
                        <button key={sv} onClick={() => setNewSev(sv)} style={{ padding: '6px 11px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12, border: `1px solid ${active ? ss.border.replace('1px solid ', '') : '#333b45'}`, background: active ? ss.background : 'transparent', color: active ? ss.color : '#948979' }}>
                          {sv.charAt(0).toUpperCase() + sv.slice(1)}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Anomaly Score</label>
                  <input value={newScore} onChange={e => setNewScore(e.target.value)} placeholder="0.00 – 1.00" type="number" min="0" max="1" step="0.01" style={{ padding: '11px 13px', borderRadius: 9, border: '1px solid #393E46', background: '#1B2027', color: '#DFD0B8', fontSize: 13.5 }} />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setCreateOpen(false)} style={{ padding: '10px 18px', borderRadius: 9, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={doCreate} style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: '#DFD0B8', color: '#1B2027', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Create Alert</button>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGN MODAL */}
      {assignOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => { setAssignOpen(false); setAssignTargetId(null); setAssignUserId(null) }}>
          <div className="anim-in" style={{ width: 'min(420px,100%)', background: '#262C35', border: '1px solid #393E46', borderRadius: 18, padding: '28px 30px', display: 'flex', flexDirection: 'column', gap: 18 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: '#DFD0B8' }}>Assign Alert</h2>
              <button onClick={() => { setAssignOpen(false) }} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <p style={{ fontSize: 12.5, color: '#948979', marginTop: -10 }}>PUT /alerts/{'{id}'}/assign — Admin only</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Select User</span>
              {users.filter(u => u.role === 'technician').map(u => (
                <button key={u.id} onClick={() => setAssignUserId(u.id)} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 14px', borderRadius: 10,
                  border: `1px solid ${assignUserId === u.id ? '#DFD0B8' : '#333b45'}`,
                  background: assignUserId === u.id ? 'rgba(223,208,184,.08)' : '#1B2027', cursor: 'pointer',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: '#DFD0B8' }}>{u.username}</span>
                    <span style={{ fontSize: 11, color: '#948979' }}>{u.role.charAt(0).toUpperCase() + u.role.slice(1)}</span>
                  </div>
                  {assignUserId === u.id && <span style={{ fontSize: 16, color: '#7b8a43' }}>✓</span>}
                </button>
              ))}
            </div>
            {assignError && (
              <p style={{ fontSize: 12.5, color: '#CB5B3C', background: 'rgba(203,91,60,.12)', border: '1px solid rgba(203,91,60,.4)', borderRadius: 8, padding: '8px 12px' }}>{assignError}</p>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setAssignOpen(false)} style={{ padding: '10px 18px', borderRadius: 9, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={doAssign} style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: '#DFD0B8', color: '#1B2027', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Confirm Assignment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
