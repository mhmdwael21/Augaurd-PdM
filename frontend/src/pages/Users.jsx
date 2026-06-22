import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { getUsers, register, setUserActive } from '../api'
import Topbar from '../components/Topbar'
import { roleStyle } from '../tokens'
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
  return `${M[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

function initials(username) {
  if (!username) return '?'
  const parts = username.split(/[\s_\-]/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return username.slice(0, 2).toUpperCase()
}

const ROLE_PALETTE = {
  admin: { bg: 'rgba(203,91,60,.22)', color: '#E0987F' },
  technician: { bg: 'rgba(217,169,74,.22)', color: '#E4C281' },
  operator: { bg: 'rgba(174,188,116,.22)', color: '#C6D196' },
}

function Avatar({ username, size = 36 }) {
  const pal = ROLE_PALETTE['operator']
  return (
    <div style={{ width: size, height: size, borderRadius: 10, background: pal.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: size * 0.38, fontWeight: 700, color: '#DFD0B8' }}>
      {initials(username)}
    </div>
  )
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
        <span style={{ fontSize: 11, color: '#6f6a60' }}>users</span>
      </div>
      <div style={{ height: 3, borderRadius: 999, background: '#1B2027', overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 999, width: barW, background: barColor }} />
      </div>
    </div>
  )
}

export default function Users() {
  const { role, username } = useAuth()
  const { isMobile } = useResponsive()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQ, setSearchQ] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [addOpen, setAddOpen] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('technician')
  const [showPass, setShowPass] = useState(false)
  const [addErr, setAddErr] = useState('')
  const [adding, setAdding] = useState(false)
  const [unreadCount] = useState(0)

  const load = useCallback(async () => {
    try { const u = await getUsers(); setUsers(u) } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(load, 8000); return () => clearInterval(id) }, [load])

  const filtered = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false
    if (searchQ) {
      const q = searchQ.toLowerCase()
      if (!(u.username || '').toLowerCase().includes(q) && !(u.email || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const total = users.length
  const adminN = users.filter(u => u.role === 'admin').length
  const techN = users.filter(u => u.role === 'technician').length
  const opN = users.filter(u => u.role === 'operator').length

  async function doAdd() {
    if (!newUsername || !newPassword || !newEmail) { setAddErr('All fields are required.'); return }
    setAdding(true); setAddErr('')
    try {
      await register(newUsername, newEmail, newPassword, newRole)
      await load()
      setAddOpen(false); setNewUsername(''); setNewEmail(''); setNewPassword(''); setNewRole('technician')
    } catch (err) {
      setAddErr(err?.message || 'Registration failed.')
    }
    setAdding(false)
  }

  async function doToggleActive(u) {
    try { await setUserActive(u.id, !(u.is_active !== false)); await load() }
    catch (e) { let m = e?.message || 'Failed'; try { m = JSON.parse(m).detail || m } catch {} ; alert(m) }
  }

  const roleOpts = ['all', 'admin', 'technician', 'operator']

  // SVG donut
  const DONUT_R = 38, DONUT_CX = 55, DONUT_CY = 55, DONUT_SW = 14
  const DONUT_CIRC = 2 * Math.PI * DONUT_R
  const donutSegs = [
    { role: 'admin', n: adminN, col: '#CB5B3C' },
    { role: 'technician', n: techN, col: '#D9A94A' },
    { role: 'operator', n: opN, col: '#AEBC74' },
  ]
  let donutOffset = 0
  const donutPaths = donutSegs.map(seg => {
    const frac = total ? seg.n / total : 0
    const dash = frac * DONUT_CIRC
    const gap = DONUT_CIRC - dash
    const el = { ...seg, dasharray: `${dash} ${gap}`, dashoffset: -donutOffset * DONUT_CIRC }
    donutOffset += frac
    return el
  })

  return (
    <div style={{ minHeight: '100vh', background: '#1B2027', color: '#DFD0B8' }}>
      <Topbar unreadCount={unreadCount} activePage="Users" />

      <div style={{ maxWidth: 1440, margin: '0 auto', padding: isMobile ? '16px 14px 40px' : '26px 28px 48px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 22 }}>

        {/* MAIN COLUMN */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* HEADER */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.01em', color: '#DFD0B8' }}>User Management</h1>
              <p style={{ fontSize: 13, color: '#948979' }}>Manage accounts, roles, and access control for the Auguard system.</p>
            </div>
            <button onClick={() => setAddOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, border: 'none', background: '#DFD0B8', color: '#1B2027', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              <MS name="person_add" size={17} color="#1B2027" /> Add User
            </button>
          </div>

          {/* STAT CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 12 }}>
            <StatCard label="Total Users" icon="group" count={total} numColor="#DFD0B8" barColor="#393E46" barW="100%" />
            <StatCard label="Admins" icon="admin_panel_settings" count={adminN} numColor="#E0987F" barColor="#CB5B3C" barW={`${total ? Math.round(adminN / total * 100) : 0}%`} />
            <StatCard label="Technicians" icon="engineering" count={techN} numColor="#E4C281" barColor="#D9A94A" barW={`${total ? Math.round(techN / total * 100) : 0}%`} />
            <StatCard label="Operators" icon="person" count={opN} numColor="#C6D196" barColor="#7b8a43" barW={`${total ? Math.round(opN / total * 100) : 0}%`} />
          </div>

          {/* SEARCH + FILTER */}
          <div style={{ background: '#222831', border: '1px solid #333b45', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 9, padding: '9px 13px', background: '#1B2027', border: '1px solid #333b45', borderRadius: 10 }}>
              <MS name="search" size={16} color="#5d5850" />
              <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search by username or email…" style={{ flex: 1, background: 'none', border: 'none', color: '#DFD0B8', fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11.5, fontWeight: 500, color: '#6f6a60', letterSpacing: '.04em' }}>ROLE</span>
              {roleOpts.map(v => {
                const active = roleFilter === v
                return (
                  <button key={v} onClick={() => setRoleFilter(v)} style={{
                    padding: '6px 12px', borderRadius: 8, border: `1px solid ${active ? '#DFD0B8' : '#333b45'}`,
                    background: active ? 'rgba(223,208,184,.12)' : 'transparent',
                    color: active ? '#DFD0B8' : '#948979', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                  }}>{v === 'all' ? 'All' : v.charAt(0).toUpperCase() + v.slice(1)}</button>
                )
              })}
            </div>
            <div style={{ marginLeft: 'auto', fontSize: 12, color: '#6f6a60', fontWeight: 500 }}>{filtered.length} users</div>
          </div>

          {/* USER TABLE */}
          <div style={{ background: '#222831', border: '1px solid #333b45', borderRadius: 14, overflow: 'hidden' }}>
            {/* header row */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '32px 1fr 70px 88px' : '40px 1fr 1fr 100px 110px 120px', gap: 12, padding: '11px 18px', borderBottom: '1px solid #2f3742', alignItems: 'center' }}>
              {(isMobile ? ['', 'Username', 'Role', 'Status'] : ['', 'Username', 'Email', 'Role', 'Joined', 'Status']).map((h, i) => (
                <span key={i} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.12em', color: '#6f6a60', textTransform: 'uppercase', textAlign: h === 'Status' ? 'right' : 'left' }}>{h}</span>
              ))}
            </div>
            {loading && <div style={{ padding: 44, textAlign: 'center', color: '#6f6a60', fontSize: 13 }}>Loading…</div>}
            {!loading && filtered.length === 0 && <div style={{ padding: 44, textAlign: 'center', color: '#6f6a60', fontSize: 13 }}>No users found.</div>}
            {filtered.map((u, idx) => {
              const rs = roleStyle(u.role)
              const active = u.is_active !== false
              const locked = u.username === username || u.username === 'auguard-ai'  // can't toggle self or system
              return (
                <div key={u.id} className="anim-in" style={{ display: 'grid', gridTemplateColumns: isMobile ? '32px 1fr 70px 88px' : '40px 1fr 1fr 100px 110px 120px', gap: 12, padding: '13px 18px', alignItems: 'center', borderBottom: '1px solid #2a303a', animationDelay: `${idx * 35}ms`, opacity: active ? 1 : 0.5 }}>
                  <Avatar username={u.username} size={isMobile ? 32 : 36} />
                  <span style={{ fontSize: isMobile ? 13 : 13.5, fontWeight: 600, color: '#DFD0B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.username}</span>
                  {!isMobile && <span style={{ fontSize: 12.5, color: '#948979', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email || '—'}</span>}
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', padding: '4px 8px', borderRadius: 7, textTransform: 'uppercase', ...rs, alignSelf: 'center', display: 'inline-block' }}>{u.role}</span>
                  {!isMobile && <span style={{ fontSize: 12, color: '#7c756a' }}>{fmtDate(u.created_at)}</span>}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    {locked ? (
                      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', color: active ? '#C6D196' : '#948979' }}>{active ? 'ACTIVE' : 'INACTIVE'}</span>
                    ) : (
                      <button onClick={() => doToggleActive(u)} style={{
                        padding: '6px 11px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 11.5, whiteSpace: 'nowrap',
                        border: `1px solid ${active ? 'rgba(203,91,60,.45)' : 'rgba(123,138,67,.5)'}`,
                        background: active ? 'rgba(203,91,60,.1)' : 'rgba(123,138,67,.12)',
                        color: active ? '#E0987F' : '#C6D196',
                      }}>{active ? 'Deactivate' : 'Reactivate'}</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* RIGHT RAIL */}
        <div style={{ display: isMobile ? 'none' : 'flex', flex: '0 0 280px', width: 280, flexDirection: 'column', gap: 14, paddingTop: 4 }}>

          {/* Donut chart */}
          <div style={{ background: '#222831', border: '1px solid #333b45', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: '#948979', textTransform: 'uppercase' }}>Role Distribution</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <svg width={110} height={110} viewBox="0 0 110 110">
                <circle cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R} fill="none" stroke="#1B2027" strokeWidth={DONUT_SW} />
                {total > 0 ? donutPaths.map((seg, i) => (
                  <circle key={i} cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R} fill="none"
                    stroke={seg.col} strokeWidth={DONUT_SW}
                    strokeDasharray={seg.dasharray}
                    strokeDashoffset={seg.dashoffset}
                    style={{ transform: 'rotate(-90deg)', transformOrigin: `${DONUT_CX}px ${DONUT_CY}px`, transition: 'stroke-dasharray .4s' }}
                  />
                )) : (
                  <circle cx={DONUT_CX} cy={DONUT_CY} r={DONUT_R} fill="none" stroke="#2f3742" strokeWidth={DONUT_SW} />
                )}
                <text x={DONUT_CX} y={DONUT_CY + 1} textAnchor="middle" dominantBaseline="middle" fontSize="18" fontWeight="700" fill="#DFD0B8">{total}</text>
                <text x={DONUT_CX} y={DONUT_CY + 17} textAnchor="middle" dominantBaseline="middle" fontSize="9" fill="#6f6a60" letterSpacing="1">USERS</text>
              </svg>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {donutSegs.map(({ role: r, n: rn, col }) => (
                  <div key={r} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: col }} />
                        <span style={{ fontSize: 11.5, fontWeight: 500, color: '#cabfa6' }}>{r.charAt(0).toUpperCase() + r.slice(1)}</span>
                      </div>
                      <span style={{ fontSize: 11.5, fontWeight: 700, color: col }}>{rn}</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 999, background: '#1B2027', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 999, width: `${total ? Math.max(4, Math.round(rn / total * 100)) : 4}%`, background: col }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Role Permissions */}
          <div style={{ background: '#222831', border: '1px solid #333b45', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: '#948979', textTransform: 'uppercase' }}>Role Permissions</span>
            {[
              { r: 'admin', perms: ['Full access', 'Manage users', 'Create alerts', 'Send notifications'] },
              { r: 'technician', perms: ['View dashboard', 'Ack & resolve alerts', 'View notifications'] },
              { r: 'operator', perms: ['View dashboard', 'View alerts (read-only)', 'View notifications'] },
            ].map(({ r, perms }) => {
              const col = { admin: '#CB5B3C', technician: '#D9A94A', operator: '#AEBC74' }[r]
              return (
                <div key={r} style={{ padding: '11px 13px', background: '#1B2027', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.09em', color: col, textTransform: 'uppercase' }}>{r}</span>
                  {perms.map(p => (
                    <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <div style={{ width: 4, height: 4, borderRadius: 999, background: col, flexShrink: 0 }} />
                      <span style={{ fontSize: 11.5, color: '#cabfa6' }}>{p}</span>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>

          {/* API Ref */}
          <div style={{ background: '#222831', border: '1px solid #333b45', borderRadius: 14, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: '#948979', textTransform: 'uppercase' }}>API Endpoints</span>
            {[
              { method: 'GET', path: '/', col: '#C6D196', bg: 'rgba(123,138,67,.2)' },
              { method: 'POST', path: '/register', col: '#E4C281', bg: 'rgba(217,169,74,.2)' },
              { method: 'PUT', path: '/users/{id}/active', col: '#cabfa6', bg: 'rgba(148,137,121,.2)' },
            ].map(ep => (
              <div key={ep.path + ep.method} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', background: '#1B2027', borderRadius: 8 }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: ep.bg, color: ep.col }}>{ep.method}</span>
                <span style={{ fontSize: 11, fontWeight: 500, color: '#cabfa6' }}>/auth{ep.path}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ADD USER MODAL */}
      {addOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setAddOpen(false)}>
          <div className="anim-in" style={{ width: 'min(480px,100%)', background: '#262C35', border: '1px solid #393E46', borderRadius: 18, padding: '28px 30px', display: 'flex', flexDirection: 'column', gap: 18 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: '#DFD0B8' }}>Add New User</h2>
                <p style={{ fontSize: 12.5, color: '#948979', marginTop: 3 }}>POST /auth/register — Admin only</p>
              </div>
              <button onClick={() => setAddOpen(false)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>

            {addErr && (
              <div style={{ padding: '10px 14px', borderRadius: 9, background: 'rgba(203,91,60,.12)', border: '1px solid rgba(203,91,60,.3)', fontSize: 12.5, color: '#E0987F' }}>{addErr}</div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Username *</label>
                <input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="smartmetro-user" style={{ padding: '11px 13px', borderRadius: 9, border: '1px solid #393E46', background: '#1B2027', color: '#DFD0B8', fontSize: 13.5 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Email *</label>
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="user@metro.pt" type="email" style={{ padding: '11px 13px', borderRadius: 9, border: '1px solid #393E46', background: '#1B2027', color: '#DFD0B8', fontSize: 13.5 }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Password *</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 0, border: '1px solid #393E46', borderRadius: 9, overflow: 'hidden', background: '#1B2027' }}>
                  <input value={newPassword} onChange={e => setNewPassword(e.target.value)} type={showPass ? 'text' : 'password'} placeholder="Min 8 characters" style={{ flex: 1, padding: '11px 13px', background: 'none', border: 'none', color: '#DFD0B8', fontSize: 13.5 }} />
                  <button onClick={() => setShowPass(v => !v)} style={{ padding: '0 13px', background: 'none', border: 'none', color: '#6f6a60', cursor: 'pointer' }}>
                    <MS name={showPass ? 'visibility_off' : 'visibility'} size={16} color="#6f6a60" />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Role</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['admin','technician','operator'].map(rv => {
                    const col = { admin: '#CB5B3C', technician: '#D9A94A', operator: '#AEBC74' }[rv]
                    const active = newRole === rv
                    return (
                      <button key={rv} onClick={() => setNewRole(rv)} style={{
                        flex: 1, padding: '9px 8px', borderRadius: 9, cursor: 'pointer', fontWeight: 600, fontSize: 12.5,
                        border: `1px solid ${active ? col + 'aa' : '#333b45'}`,
                        background: active ? col + '22' : 'transparent',
                        color: active ? col : '#6f6a60',
                      }}>{rv.charAt(0).toUpperCase() + rv.slice(1)}</button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setAddOpen(false)} style={{ padding: '10px 18px', borderRadius: 9, border: '1px solid #393E46', background: 'transparent', color: '#948979', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              <button onClick={doAdd} disabled={adding} style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: '#DFD0B8', color: '#1B2027', fontWeight: 700, fontSize: 13, cursor: adding ? 'wait' : 'pointer', opacity: adding ? 0.7 : 1 }}>
                {adding ? 'Creating…' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
