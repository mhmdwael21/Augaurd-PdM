import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { getWorkOrders, getUsers, getEquipment, createWorkOrder, updateWorkOrderStatus, assignWorkOrder, completeWorkOrder, getSpareParts } from '../api'
import Topbar from '../components/Topbar'
import { severityStyle } from '../tokens'
import { useResponsive } from '../hooks/useResponsive'

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
  if (!ts) return '—'
  const d = new Date(ts)
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const p2 = x => String(x).padStart(2, '0')
  return `${M[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

const WO_LABEL = { open: 'Open', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' }

function woStatusStyle(st) {
  const m = {
    open:        { background: 'rgba(203,91,60,.16)', color: '#E0987F', border: '1px solid rgba(203,91,60,.4)' },
    in_progress: { background: 'rgba(217,169,74,.16)', color: '#E4C281', border: '1px solid rgba(217,169,74,.4)' },
    completed:   { background: 'rgba(123,138,67,.14)', color: '#C6D196', border: '1px solid rgba(123,138,67,.4)' },
    cancelled:   { background: 'rgba(148,137,121,.16)', color: '#948979', border: '1px solid rgba(148,137,121,.35)' },
  }
  return m[st] || m.open
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
    <div style={{ background: '#222831', border: `1px solid ${highlight ? 'rgba(203,91,60,.35)' : '#333b45'}`, borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11.5, fontWeight: 500, color: '#948979', letterSpacing: '.04em' }}>{label}</span>
        <MS name={icon} size={18} color="#948979" />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 700, color: numColor }}>{count}</span>
        <span style={{ fontSize: 11, color: '#6f6a60' }}>orders</span>
      </div>
      <div style={{ height: 3, borderRadius: 999, background: '#1B2027', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 999, width: barW, background: barColor }} />
      </div>
    </div>
  )
}

export default function WorkOrders() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const { isMobile } = useResponsive()

  const [orders, setOrders] = useState([])
  const [users, setUsers] = useState([])
  const [assetMap, setAssetMap] = useState({})
  const [equipment, setEquipment] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQ, setSearchQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [unreadCount] = useState(0)

  const [assignOpen, setAssignOpen] = useState(false)
  const [assignTargetId, setAssignTargetId] = useState(null)
  const [assignUserId, setAssignUserId] = useState(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [newEquip, setNewEquip] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPriority, setNewPriority] = useState('medium')

  // Complete-with-maintenance-log modal
  const [completeOpen, setCompleteOpen] = useState(false)
  const [completeTarget, setCompleteTarget] = useState(null)
  const [cAction, setCAction] = useState('')
  const [cOutcome, setCOutcome] = useState('failure_confirmed')
  const [cDowntime, setCDowntime] = useState('')
  const [cNotes, setCNotes] = useState('')
  const [spareParts, setSpareParts] = useState([])
  const [cParts, setCParts] = useState([])     // [{spare_part_id, quantity, name}]
  const [pickId, setPickId] = useState('')
  const [pickQty, setPickQty] = useState('1')

  const load = useCallback(async () => {
    try {
      const [wo, us] = await Promise.all([getWorkOrders(), isAdmin ? getUsers() : Promise.resolve([])])
      setOrders(wo)
      setUsers(us)
    } catch {}
    setLoading(false)
  }, [isAdmin])

  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(load, 5000); return () => clearInterval(id) }, [load])
  useEffect(() => {
    getEquipment()
      .then(list => { setEquipment(list); setAssetMap(Object.fromEntries(list.map(e => [String(e.id), e.asset_tag]))) })
      .catch(() => {})
    getSpareParts().then(setSpareParts).catch(() => {})
  }, [])

  const userMap = Object.fromEntries(users.map(u => [String(u.id), u.username]))

  const filtered = orders.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    if (searchQ) {
      const q = searchQ.toLowerCase()
      if (!(o.title || '').toLowerCase().includes(q) && !o.id.toLowerCase().includes(q)) return false
    }
    return true
  })

  const total = orders.length
  const openN = orders.filter(o => o.status === 'open').length
  const progN = orders.filter(o => o.status === 'in_progress').length
  const doneN = orders.filter(o => o.status === 'completed').length

  async function doStatus(id, status) {
    try { await updateWorkOrderStatus(id, status); await load() } catch (e) { alert(e.message) }
  }
  async function doAssign() {
    if (!assignUserId) return
    try { await assignWorkOrder(assignTargetId, assignUserId); await load() } catch (e) { alert(e.message) }
    setAssignOpen(false); setAssignTargetId(null); setAssignUserId(null)
  }
  async function doCreate() {
    if (!newEquip || !newTitle) return
    try {
      await createWorkOrder({ equipment_id: newEquip, title: newTitle, description: newDesc || undefined, priority: newPriority })
      await load()
      setCreateOpen(false); setNewEquip(''); setNewTitle(''); setNewDesc(''); setNewPriority('medium')
    } catch (e) { alert(e.message) }
  }
  function openComplete(id) {
    setCompleteTarget(id); setCAction(''); setCOutcome('failure_confirmed'); setCDowntime(''); setCNotes('')
    setCParts([]); setPickId(''); setPickQty('1'); setCompleteOpen(true)
  }
  function addPart() {
    if (!pickId) return
    const part = spareParts.find(p => String(p.id) === String(pickId))
    if (!part) return
    const qty = Math.max(1, parseInt(pickQty, 10) || 1)
    setCParts(prev => {
      const existing = prev.find(p => p.spare_part_id === part.id)
      if (existing) return prev.map(p => p.spare_part_id === part.id ? { ...p, quantity: p.quantity + qty } : p)
      return [...prev, { spare_part_id: part.id, quantity: qty, name: part.part_name }]
    })
    setPickId(''); setPickQty('1')
  }
  async function doComplete() {
    if (!cAction) return
    try {
      await completeWorkOrder(completeTarget, {
        action_taken: cAction,
        outcome: cOutcome,
        maintenance_type: 'corrective',
        downtime_minutes: cDowntime ? parseInt(cDowntime, 10) : undefined,
        notes: cNotes || undefined,
        parts_used: cParts.length ? cParts.map(p => ({ spare_part_id: p.spare_part_id, quantity: p.quantity })) : undefined,
      })
      await load()
      setCompleteOpen(false); setCompleteTarget(null)
    } catch (e) { alert(e.message) }
  }

  const prioOpts = ['low', 'medium', 'high', 'critical']
  const outcomeOpts = [
    ['failure_confirmed', 'Failure confirmed'],
    ['no_fault_found', 'No fault found'],
    ['partial', 'Partial'],
    ['inconclusive', 'Inconclusive'],
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#1B2027', color: '#DFD0B8' }}>
      <Topbar unreadCount={unreadCount} />
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: isMobile ? '16px 14px 40px' : '26px 28px 48px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.01em', color: '#DFD0B8' }}>Work Orders</h1>
            <p style={{ fontSize: 13, color: '#948979' }}>Maintenance tasks — auto-generated from high/critical alerts, or created manually.</p>
          </div>
          {isAdmin && (
            <button onClick={() => setCreateOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, border: 'none', background: '#DFD0B8', color: '#1B2027', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              <MS name="add" size={18} color="#1B2027" /> Create Work Order
            </button>
          )}
        </div>

        {/* STAT CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
          <StatCard label="Total" icon="assignment" count={total} numColor="#DFD0B8" barColor="#393E46" barW="100%" />
          <StatCard label="Open" icon="pending_actions" count={openN} numColor="#E0987F" barColor="#CB5B3C" barW={`${total ? Math.round(openN / total * 100) : 0}%`} highlight={openN > 0} />
          <StatCard label="In Progress" icon="engineering" count={progN} numColor="#E4C281" barColor="#D9A94A" barW={`${total ? Math.round(progN / total * 100) : 0}%`} />
          <StatCard label="Completed" icon="task_alt" count={doneN} numColor="#C6D196" barColor="#7b8a43" barW={`${total ? Math.round(doneN / total * 100) : 0}%`} />
        </div>

        {/* FILTERS */}
        <div style={{ background: '#222831', border: '1px solid #333b45', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 9, padding: '9px 13px', background: '#1B2027', border: '1px solid #333b45', borderRadius: 10 }}>
            <MS name="search" size={16} color="#5d5850" />
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search by title or ID…" style={{ flex: 1, background: 'none', border: 'none', color: '#DFD0B8', fontSize: 13 }} />
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11.5, fontWeight: 500, color: '#6f6a60', letterSpacing: '.04em' }}>STATUS</span>
            {['all', 'open', 'in_progress', 'completed', 'cancelled'].map(v => (
              <FilterBtn key={v} label={v === 'all' ? 'All' : WO_LABEL[v]} active={statusFilter === v} onClick={() => setStatusFilter(v)} />
            ))}
          </div>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6f6a60', fontWeight: 500 }}>{filtered.length} orders</div>
        </div>

        {/* LIST */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading && <div style={{ padding: 44, textAlign: 'center', color: '#6f6a60', fontSize: 13 }}>Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: 44, textAlign: 'center', background: '#222831', border: '1px dashed #333b45', borderRadius: 14, color: '#6f6a60', fontSize: 13 }}>
              No work orders match your filters. High/critical alerts generate them automatically.
            </div>
          )}
          {filtered.map((o, idx) => {
            const ps = severityStyle(o.priority)
            const ss = woStatusStyle(o.status)
            const assetTag = assetMap[String(o.equipment_id)]
            const canAct = isAdmin || (o.assigned_to && userMap[String(o.assigned_to)] !== undefined)  // tech/op list is already scoped to own
            return (
              <div key={o.id} className="anim-in" style={{ background: '#222831', border: `1px solid ${o.status === 'open' ? 'rgba(203,91,60,.3)' : '#333b45'}`, borderRadius: 14, padding: '15px 18px', display: 'flex', flexDirection: 'column', gap: 12, animationDelay: `${idx * 40}ms` }}>
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', padding: '5px 10px', borderRadius: 7, whiteSpace: 'nowrap', ...ps }}>{(o.priority || '').toUpperCase()}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 200 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#DFD0B8', lineHeight: 1.3 }}>{o.title}</span>
                    {o.description && <span style={{ fontSize: 12, color: '#a59c8c', lineHeight: 1.4 }}>{o.description}</span>}
                    <span style={{ fontSize: 10.5, color: '#7c756a' }}>{o.id.slice(0, 8)} · {fmtDate(o.created_at)}</span>
                  </div>
                  {assetTag && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em', padding: '4px 9px', borderRadius: 7, background: '#1B2027', border: '1px solid #333b45', color: '#cabfa6', whiteSpace: 'nowrap' }} title="Asset">
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#7b8a43' }} />
                      {assetTag}
                    </span>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', padding: '5px 11px', borderRadius: 999, whiteSpace: 'nowrap', ...ss }}>{(WO_LABEL[o.status] || o.status).toUpperCase()}</span>
                </div>

                {/* Actions row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', borderTop: '1px solid #2f3742', paddingTop: 12 }}>
                  {o.status === 'open' && (
                    <button onClick={() => doStatus(o.id, 'in_progress')} style={{ padding: '8px 15px', borderRadius: 9, border: '1px solid rgba(217,169,74,.55)', background: 'rgba(217,169,74,.1)', color: '#E4C281', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                      ▶ Start
                    </button>
                  )}
                  {o.status === 'in_progress' && (
                    <button onClick={() => openComplete(o.id)} style={{ padding: '8px 15px', borderRadius: 9, border: 'none', background: '#7b8a43', color: '#1B2027', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                      ✓ Complete &amp; Log
                    </button>
                  )}
                  {isAdmin && (o.status === 'open' || o.status === 'in_progress') && (
                    <button onClick={() => doStatus(o.id, 'cancelled')} style={{ padding: '8px 15px', borderRadius: 9, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  )}
                  {isAdmin && !o.assigned_to && o.status !== 'completed' && o.status !== 'cancelled' && (
                    <button onClick={() => { setAssignTargetId(o.id); setAssignOpen(true) }} style={{ padding: '8px 15px', borderRadius: 9, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                      Assign →
                    </button>
                  )}
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11.5, color: '#6f6a60' }}>Assigned to:</span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#DFD0B8' }}>{o.assigned_to_username || (o.assigned_to ? String(o.assigned_to).slice(0, 8) + '…' : 'Unassigned')}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* CREATE MODAL */}
      {createOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setCreateOpen(false)}>
          <div className="anim-in" style={{ width: 'min(560px,100%)', background: '#262C35', border: '1px solid #393E46', borderRadius: 18, padding: '28px 30px', display: 'flex', flexDirection: 'column', gap: 18 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#DFD0B8' }}>Create Work Order</h2>
                <p style={{ fontSize: 12.5, color: '#948979', marginTop: 3 }}>POST /work-orders — Admin only</p>
              </div>
              <button onClick={() => setCreateOpen(false)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Asset *</label>
                <select value={newEquip} onChange={e => setNewEquip(e.target.value)} style={{ padding: '11px 13px', borderRadius: 9, border: '1px solid #393E46', background: '#1B2027', color: '#DFD0B8', fontSize: 13.5 }}>
                  <option value="">Select asset…</option>
                  {equipment.map(e => <option key={e.id} value={e.id}>{e.asset_tag} — {e.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Title *</label>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="e.g. Inspect pneumatic circuit on APU-01" style={{ padding: '11px 13px', borderRadius: 9, border: '1px solid #393E46', background: '#1B2027', color: '#DFD0B8', fontSize: 13.5 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Description</label>
                <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3} placeholder="Scope / details…" style={{ padding: '11px 13px', borderRadius: 9, border: '1px solid #393E46', background: '#1B2027', color: '#DFD0B8', fontSize: 13.5, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Priority</label>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {prioOpts.map(p => {
                    const ps = severityStyle(p); const active = newPriority === p
                    return (
                      <button key={p} onClick={() => setNewPriority(p)} style={{ padding: '6px 11px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12, border: `1px solid ${active ? ps.border.replace('1px solid ', '') : '#333b45'}`, background: active ? ps.background : 'transparent', color: active ? ps.color : '#948979' }}>
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setCreateOpen(false)} style={{ padding: '10px 18px', borderRadius: 9, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={doCreate} style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: '#DFD0B8', color: '#1B2027', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGN MODAL */}
      {assignOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => { setAssignOpen(false); setAssignTargetId(null); setAssignUserId(null) }}>
          <div className="anim-in" style={{ width: 'min(420px,100%)', background: '#262C35', border: '1px solid #393E46', borderRadius: 18, padding: '28px 30px', display: 'flex', flexDirection: 'column', gap: 18 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: '#DFD0B8' }}>Assign Work Order</h2>
              <button onClick={() => setAssignOpen(false)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Select User</span>
              {users.filter(u => u.role !== 'admin').map(u => (
                <button key={u.id} onClick={() => setAssignUserId(u.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 10, border: `1px solid ${assignUserId === u.id ? '#DFD0B8' : '#333b45'}`, background: assignUserId === u.id ? 'rgba(223,208,184,.08)' : '#1B2027', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: '#DFD0B8' }}>{u.username}</span>
                    <span style={{ fontSize: 11, color: '#948979' }}>{u.role.charAt(0).toUpperCase() + u.role.slice(1)}</span>
                  </div>
                  {assignUserId === u.id && <span style={{ fontSize: 16, color: '#7b8a43' }}>✓</span>}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setAssignOpen(false)} style={{ padding: '10px 18px', borderRadius: 9, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={doAssign} style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: '#DFD0B8', color: '#1B2027', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* COMPLETE + LOG MAINTENANCE MODAL */}
      {completeOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setCompleteOpen(false)}>
          <div className="anim-in" style={{ width: 'min(540px,100%)', background: '#262C35', border: '1px solid #393E46', borderRadius: 18, padding: '28px 30px', display: 'flex', flexDirection: 'column', gap: 18 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#DFD0B8' }}>Complete &amp; Log Maintenance</h2>
                <p style={{ fontSize: 12.5, color: '#948979', marginTop: 3 }}>Records what was done + the outcome (feeds precision KPIs).</p>
              </div>
              <button onClick={() => setCompleteOpen(false)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Action Taken *</label>
                <textarea value={cAction} onChange={e => setCAction(e.target.value)} rows={3} placeholder="e.g. Sealed air leak at pneumatic valve seal." style={{ padding: '11px 13px', borderRadius: 9, border: '1px solid #393E46', background: '#1B2027', color: '#DFD0B8', fontSize: 13.5, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Outcome *</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {outcomeOpts.map(([val, lbl]) => {
                    const active = cOutcome === val
                    const isTP = val === 'failure_confirmed', isFP = val === 'no_fault_found'
                    const col = isTP ? '#C6D196' : isFP ? '#E0987F' : '#cabfa6'
                    return (
                      <button key={val} onClick={() => setCOutcome(val)} style={{ padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12, border: `1px solid ${active ? col : '#333b45'}`, background: active ? 'rgba(223,208,184,.08)' : 'transparent', color: active ? col : '#948979' }}>
                        {lbl}
                      </button>
                    )
                  })}
                </div>
                <span style={{ fontSize: 11, color: '#6f6a60', lineHeight: 1.4 }}>“Failure confirmed” = the AI alert was a true positive; “No fault found” = false positive. This is the feedback signal.</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Downtime (min)</label>
                  <input value={cDowntime} onChange={e => setCDowntime(e.target.value)} type="number" min="0" placeholder="optional" style={{ padding: '11px 13px', borderRadius: 9, border: '1px solid #393E46', background: '#1B2027', color: '#DFD0B8', fontSize: 13.5 }} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Notes</label>
                <textarea value={cNotes} onChange={e => setCNotes(e.target.value)} rows={2} placeholder="optional" style={{ padding: '11px 13px', borderRadius: 9, border: '1px solid #393E46', background: '#1B2027', color: '#DFD0B8', fontSize: 13.5, resize: 'vertical' }} />
              </div>
              {/* Parts used */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Parts Used (optional)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={pickId} onChange={e => setPickId(e.target.value)} style={{ flex: 1, padding: '10px 12px', borderRadius: 9, border: '1px solid #393E46', background: '#1B2027', color: '#DFD0B8', fontSize: 13 }}>
                    <option value="">Select a part…</option>
                    {spareParts.map(p => <option key={p.id} value={p.id}>{p.part_name} ({p.quantity_in_stock} in stock)</option>)}
                  </select>
                  <input value={pickQty} onChange={e => setPickQty(e.target.value)} type="number" min="1" style={{ width: 64, padding: '10px 10px', borderRadius: 9, border: '1px solid #393E46', background: '#1B2027', color: '#DFD0B8', fontSize: 13 }} />
                  <button onClick={addPart} style={{ padding: '0 16px', borderRadius: 9, border: '1px solid #393E46', background: 'transparent', color: '#cabfa6', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Add</button>
                </div>
                {cParts.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {cParts.map(p => (
                      <div key={p.spare_part_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 11px', background: '#1B2027', borderRadius: 8 }}>
                        <span style={{ fontSize: 12.5, color: '#DFD0B8' }}>{p.quantity}× {p.name}</span>
                        <button onClick={() => setCParts(prev => prev.filter(x => x.spare_part_id !== p.spare_part_id))} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontSize: 14, cursor: 'pointer' }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setCompleteOpen(false)} style={{ padding: '10px 18px', borderRadius: 9, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={doComplete} style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: '#7b8a43', color: '#1B2027', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Complete Work Order</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
