import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { getNotifications, markNotifRead, sendNotification, getUsers } from '../api'
import Topbar from '../components/Topbar'
import Pagination from '../components/Pagination'
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

const TYPE_META = {
  alert: { icon: 'warning', col: '#E0987F', bg: 'rgba(203,91,60,.15)', label: 'Alert' },
  system: { icon: 'settings', col: '#E4C281', bg: 'rgba(217,169,74,.15)', label: 'System' },
  broadcast: { icon: 'campaign', col: '#C6D196', bg: 'rgba(174,188,116,.15)', label: 'Broadcast' },
}

function fmtDate(ts) {
  const d = new Date(ts)
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const p2 = x => String(x).padStart(2, '0')
  return `${M[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

function StatCard({ label, icon, count, numColor, barColor, barW }) {
  return (
    <div style={{ background: '#222831', border: '1px solid #333b45', borderRadius: 14, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11.5, fontWeight: 500, color: '#948979', letterSpacing: '.04em' }}>{label}</span>
        <MS name={icon} size={18} color="#948979" />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 700, color: numColor }}>{count}</span>
        <span style={{ fontSize: 11, color: '#6f6a60' }}>notifs</span>
      </div>
      <div style={{ height: 3, borderRadius: 999, background: '#1B2027', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 999, width: barW, background: barColor }} />
      </div>
    </div>
  )
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

export default function Notifications() {
  const { role, username } = useAuth()
  const isAdmin = role === 'admin'
  const { isMobile } = useResponsive()

  const [notifs, setNotifs] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})
  const [typeFilter, setTypeFilter] = useState('all')
  const [readFilter, setReadFilter] = useState('all')
  const [sendOpen, setSendOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  // send form state
  const [sub, setSub] = useState('')
  const [body, setBody] = useState('')
  const [sType, setSType] = useState('system')
  const [audience, setAudience] = useState('all')
  const [byRole, setByRole] = useState('technician')
  const [directUser, setDirectUser] = useState('')
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    try {
      const [nl, ul] = await Promise.all([getNotifications(), isAdmin ? getUsers() : Promise.resolve([])])
      setNotifs(nl)
      setUsers(ul)
      setUnreadCount(nl.filter(n => !n.is_read).length)
    } catch {}
    setLoading(false)
  }, [isAdmin])

  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(load, 5000); return () => clearInterval(id) }, [load])

  const filtered = notifs.filter(n => {
    if (typeFilter !== 'all' && n.type !== typeFilter) return false
    if (readFilter === 'unread' && n.is_read) return false
    if (readFilter === 'read' && !n.is_read) return false
    return true
  })

  const { pageItems, page, setPage, pageCount, from, to } = usePagination(filtered, 8)
  useEffect(() => { setPage(1) }, [typeFilter, readFilter, setPage])

  const total = notifs.length
  const unread = notifs.filter(n => !n.is_read).length
  const alertN = notifs.filter(n => n.type === 'alert').length
  const broadN = notifs.filter(n => n.type === 'broadcast').length

  async function doMarkRead(id) {
    try { await markNotifRead(id); await load() } catch {}
  }
  async function doMarkAll() {
    try {
      await Promise.all(notifs.filter(n => !n.is_read).map(n => markNotifRead(n.id)))
      await load()
    } catch {}
  }
  async function doSend() {
    if (!sub || !body) return
    setSending(true)
    try {
      const payload = {
        subject: sub, body, type: sType,
        recipient_type: audience === 'direct' ? 'user' : audience === 'role' ? 'group' : 'all',
        ...(audience === 'role' ? { target_role: byRole } : {}),
        ...(audience === 'direct' && directUser ? { recipient_id: directUser } : {}),
      }
      await sendNotification(payload)
      await load()
      setSendOpen(false); setSub(''); setBody(''); setSType('system'); setAudience('all')
    } catch {}
    setSending(false)
  }

  const audienceOpts = [
    { v: 'all', label: 'All Users' },
    { v: 'role', label: 'By Role' },
    { v: 'direct', label: 'Direct User' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#1B2027', color: '#DFD0B8' }}>
      <Topbar unreadCount={unreadCount} activePage="Notifications" />

      <div style={{ maxWidth: 1440, margin: '0 auto', padding: isMobile ? '16px 14px 40px' : '26px 28px 48px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 22 }}>

        {/* MAIN COLUMN */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* HEADER */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.01em', color: '#DFD0B8' }}>Notification Center</h1>
              <p style={{ fontSize: 13, color: '#948979' }}>System messages, alert notifications, and broadcasts.</p>
            </div>
            <div style={{ display: 'flex', gap: 9 }}>
              {unread > 0 && (
                <button onClick={doMarkAll} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                  <MS name="done_all" size={16} color="#948979" /> Mark all read
                </button>
              )}
              {isAdmin && (
                <button onClick={() => setSendOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, border: 'none', background: '#DFD0B8', color: '#1B2027', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  <MS name="send" size={16} color="#1B2027" /> Send Notification
                </button>
              )}
            </div>
          </div>

          {/* STAT CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
            <StatCard label="Total" icon="notifications" count={total} numColor="#DFD0B8" barColor="#393E46" barW="100%" />
            <StatCard label="Unread" icon="mark_email_unread" count={unread} numColor="#E0997F" barColor="#CB5B3C" barW={`${total ? Math.round(unread / total * 100) : 0}%`} />
            <StatCard label="Alert Type" icon="warning" count={alertN} numColor="#E4C281" barColor="#D9A94A" barW={`${total ? Math.round(alertN / total * 100) : 0}%`} />
            <StatCard label="Broadcast" icon="campaign" count={broadN} numColor="#C6D196" barColor="#7b8a43" barW={`${total ? Math.round(broadN / total * 100) : 0}%`} />
          </div>

          {/* FILTERS */}
          <div style={{ background: '#222831', border: '1px solid #333b45', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: '#6f6a60', letterSpacing: '.04em' }}>TYPE</span>
              {['all', 'alert', 'system', 'broadcast'].map(v => (
                <FilterBtn key={v} label={v === 'all' ? 'All' : (TYPE_META[v]?.label || v)} active={typeFilter === v} onClick={() => setTypeFilter(v)} />
              ))}
            </div>
            <div style={{ width: 1, height: 22, background: '#333b45' }} />
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: '#6f6a60', letterSpacing: '.04em' }}>READ</span>
              <FilterBtn label="All" active={readFilter === 'all'} onClick={() => setReadFilter('all')} />
              <FilterBtn label="Unread" active={readFilter === 'unread'} onClick={() => setReadFilter('unread')} />
              <FilterBtn label="Read" active={readFilter === 'read'} onClick={() => setReadFilter('read')} />
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6f6a60', fontWeight: 500 }}>{filtered.length} notifications</div>
          </div>

          {/* NOTIF LIST */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loading && <div style={{ padding: 44, textAlign: 'center', color: '#6f6a60', fontSize: 13 }}>Loading…</div>}
            {!loading && filtered.length === 0 && (
              <div style={{ padding: 44, textAlign: 'center', background: '#222831', border: '1px dashed #333b45', borderRadius: 14, color: '#6f6a60', fontSize: 13 }}>No notifications match your filters.</div>
            )}
            {pageItems.map((n, idx) => {
              const isExp = !!expanded[n.id]
              const tm = TYPE_META[n.type] || TYPE_META.system
              const unreadStyle = !n.is_read ? { borderLeft: '3px solid rgba(203,91,60,.6)', background: 'rgba(203,91,60,.04)' } : {}
              return (
                <div key={n.id} className="anim-in" style={{ background: '#222831', border: `1px solid ${isExp ? '#393E46' : '#333b45'}`, borderRadius: 14, overflow: 'hidden', cursor: 'pointer', animationDelay: `${idx * 35}ms`, ...unreadStyle }}
                  onClick={() => setExpanded(e => ({ ...e, [n.id]: !e[n.id] }))}>
                  {/* SUMMARY */}
                  <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 13 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: tm.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <MS name={tm.icon} size={18} color={tm.col} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13.5, fontWeight: n.is_read ? 500 : 700, color: n.is_read ? '#a59c8c' : '#DFD0B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {n.subject || n.title || '(No subject)'}
                      </span>
                      <span style={{ fontSize: 11, color: '#6f6a60' }}>
                        {fmtDate(n.timestamp)} · {n.recipient_type === 'all' ? 'all users' : n.recipient_type === 'group' ? `role: ${n.target_role}` : 'direct'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.09em', padding: '4px 9px', borderRadius: 6, background: tm.bg, color: tm.col, textTransform: 'uppercase' }}>{tm.label}</span>
                      {n.target_role && (
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: '#7c756a', padding: '4px 9px', borderRadius: 6, background: '#1B2027' }}>→ {n.target_role}</span>
                      )}
                      {!n.is_read && <div style={{ width: 8, height: 8, borderRadius: 999, background: '#CB5B3C', flexShrink: 0 }} />}
                      <span style={{ color: '#6f6a60', fontSize: 16, transform: isExp ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform .2s' }}>›</span>
                    </div>
                  </div>

                  {/* EXPANDED */}
                  {isExp && (
                    <div className="anim-in" style={{ borderTop: '1px solid #2f3742', padding: '14px 18px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}
                      onClick={e => e.stopPropagation()}>
                      <p style={{ fontSize: 13, color: '#cabfa6', lineHeight: 1.55, margin: 0 }}>{n.body || n.message || '—'}</p>
                      {n.alert_id && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 11px', background: 'rgba(203,91,60,.12)', border: '1px solid rgba(203,91,60,.3)', borderRadius: 8, alignSelf: 'flex-start' }}>
                          <MS name="link" size={14} color="#E0987F" />
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: '#E0987F' }}>Alert {String(n.alert_id).slice(0, 8)}…</span>
                        </div>
                      )}
                      {!n.is_read && (
                        <button onClick={() => doMarkRead(n.id)} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 9, border: '1px solid rgba(174,188,116,.4)', background: 'rgba(174,188,116,.08)', color: '#C6D196', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                          <MS name="done" size={15} color="#C6D196" /> Mark as read
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {!loading && (
            <Pagination page={page} pageCount={pageCount} from={from} to={to} total={filtered.length} onPage={setPage} label="notifications" />
          )}
        </div>

        {/* RIGHT RAIL */}
        <div style={{ display: isMobile ? 'none' : 'flex', flex: '0 0 280px', width: 280, flexDirection: 'column', gap: 14, paddingTop: 4 }}>

          {/* Type Breakdown */}
          <div style={{ background: '#222831', border: '1px solid #333b45', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: '#948979', textTransform: 'uppercase' }}>Type Breakdown</span>
            {['alert','system','broadcast'].map(tp => {
              const tm = TYPE_META[tp]
              const n = notifs.filter(x => x.type === tp).length
              return (
                <div key={tp} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <MS name={tm.icon} size={14} color={tm.col} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#cabfa6' }}>{tm.label}</span>
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: tm.col }}>{n}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: '#1B2027', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 999, width: `${total ? Math.max(4, Math.round(n / total * 100)) : 4}%`, background: tm.col }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Audience Split */}
          <div style={{ background: '#222831', border: '1px solid #333b45', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: '#948979', textTransform: 'uppercase' }}>Read Status</span>
            {[{ label: 'Unread', n: unread, col: '#CB5B3C', nc: '#E0997F' }, { label: 'Read', n: total - unread, col: '#7b8a43', nc: '#C6D196' }].map(({ label, n: rn, col, nc }) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: '#cabfa6' }}>{label}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: nc }}>{rn}</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: '#1B2027', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 999, width: `${total ? Math.max(4, Math.round(rn / total * 100)) : 4}%`, background: col }} />
                </div>
              </div>
            ))}
          </div>

          {/* API Ref */}
          <div style={{ background: '#222831', border: '1px solid #333b45', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: '#948979', textTransform: 'uppercase' }}>API Endpoints</span>
            {[
              { method: 'GET', path: '/', col: '#C6D196', bg: 'rgba(123,138,67,.2)' },
              { method: 'POST', path: '/', col: '#E4C281', bg: 'rgba(217,169,74,.2)' },
              { method: 'PUT', path: '/{id}/read', col: '#cabfa6', bg: 'rgba(148,137,121,.2)' },
            ].map(ep => (
              <div key={ep.path + ep.method} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', background: '#1B2027', borderRadius: 8 }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: ep.bg, color: ep.col }}>{ep.method}</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: '#cabfa6' }}>/notifications{ep.path}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SEND MODAL */}
      {sendOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setSendOpen(false)}>
          <div className="anim-in" style={{ width: 'min(560px,100%)', background: '#262C35', border: '1px solid #393E46', borderRadius: 18, padding: '28px 30px', display: 'flex', flexDirection: 'column', gap: 20 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#DFD0B8' }}>Send Notification</h2>
                <p style={{ fontSize: 12.5, color: '#948979', marginTop: 3 }}>POST /notifications — Admin only</p>
              </div>
              <button onClick={() => setSendOpen(false)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Subject *</label>
                <input value={sub} onChange={e => setSub(e.target.value)} placeholder="Notification subject…" style={{ padding: '11px 13px', borderRadius: 9, border: '1px solid #393E46', background: '#1B2027', color: '#DFD0B8', fontSize: 13.5 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Body *</label>
                <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Notification message body…" rows={3} style={{ padding: '11px 13px', borderRadius: 9, border: '1px solid #393E46', background: '#1B2027', color: '#DFD0B8', fontSize: 13.5, resize: 'vertical' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Type</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {['system','alert','broadcast'].map(tp => {
                      const tm = TYPE_META[tp]
                      return (
                        <button key={tp} onClick={() => setSType(tp)} style={{
                          display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderRadius: 9, cursor: 'pointer',
                          border: `1px solid ${sType === tp ? tm.col + '88' : '#333b45'}`,
                          background: sType === tp ? tm.bg : 'transparent',
                        }}>
                          <MS name={tm.icon} size={15} color={tm.col} />
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: sType === tp ? tm.col : '#948979' }}>{tm.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Audience</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {audienceOpts.map(opt => (
                      <button key={opt.v} onClick={() => setAudience(opt.v)} style={{
                        padding: '9px 12px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                        border: `1px solid ${audience === opt.v ? '#DFD0B8' : '#333b45'}`,
                        background: audience === opt.v ? 'rgba(223,208,184,.08)' : 'transparent',
                        color: audience === opt.v ? '#DFD0B8' : '#948979', fontSize: 12.5, fontWeight: 600,
                      }}>{opt.label}</button>
                    ))}
                  </div>

                  {audience === 'role' && (
                    <select value={byRole} onChange={e => setByRole(e.target.value)} style={{ marginTop: 6, padding: '9px 12px', borderRadius: 9, border: '1px solid #393E46', background: '#1B2027', color: '#DFD0B8', fontSize: 13 }}>
                      <option value="technician">Technician</option>
                      <option value="operator">Operator</option>
                      <option value="admin">Admin</option>
                    </select>
                  )}
                  {audience === 'direct' && (
                    <select value={directUser} onChange={e => setDirectUser(e.target.value)} style={{ marginTop: 6, padding: '9px 12px', borderRadius: 9, border: '1px solid #393E46', background: '#1B2027', color: '#DFD0B8', fontSize: 13 }}>
                      <option value="">Select user…</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                    </select>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setSendOpen(false)} style={{ padding: '10px 18px', borderRadius: 9, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={doSend} disabled={sending} style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: '#DFD0B8', color: '#1B2027', fontWeight: 700, fontSize: 13, cursor: sending ? 'wait' : 'pointer', opacity: sending ? 0.7 : 1 }}>
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
