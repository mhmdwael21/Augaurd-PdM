import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getMe, changePassword } from '../api'
import Topbar from '../components/Topbar'
import { roleStyle } from '../tokens'
import { useResponsive } from '../hooks/useResponsive'

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
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${M[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

function initials(username) {
  if (!username) return '?'
  const parts = username.split(/[\s_.\-]/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return username.slice(0, 2).toUpperCase()
}

const ROLE_PERMS = {
  admin: ['Full access', 'Manage users', 'Create & assign alerts', 'Send notifications', 'Manage inventory'],
  technician: ['View dashboard & fleet', 'Acknowledge & resolve assigned alerts', 'Execute & complete work orders', 'Log maintenance + parts'],
  operator: ['View dashboard & fleet (read-only)', 'View alerts & reports', 'Monitor equipment health'],
}
const ROLE_COL = { admin: '#CB5B3C', technician: '#D9A94A', operator: '#AEBC74' }

function Field({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 15px', background: '#1B2027', borderRadius: 10 }}>
      <MS name={icon} size={18} color="#7c756a" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '.1em', color: '#6f6a60', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: '#DFD0B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      </div>
    </div>
  )
}

const inputStyle = { flex: 1, padding: '11px 13px', background: 'none', border: 'none', color: '#DFD0B8', fontSize: 13.5 }
const inputWrap = { display: 'flex', alignItems: 'center', border: '1px solid #393E46', borderRadius: 9, overflow: 'hidden', background: '#1B2027' }

export default function Profile() {
  const { role, username, logout } = useAuth()
  const { isMobile } = useResponsive()
  const navigate = useNavigate()

  const [me, setMe] = useState(null)
  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)      // { kind: 'ok'|'err', text }

  useEffect(() => {
    getMe().then(setMe).catch(() => {})
  }, [])

  // Fall back to auth context until /auth/me resolves.
  const u = me || { username, role, email: '—', is_active: true, created_at: null }
  const r = u.role || role
  const rs = roleStyle(r)
  const active = u.is_active !== false

  function handleLogout() {
    logout()
    navigate('/auth')
  }

  async function doChangePassword() {
    setMsg(null)
    if (!curPw || !newPw) { setMsg({ kind: 'err', text: 'Fill in your current and new password.' }); return }
    if (newPw.length < 6) { setMsg({ kind: 'err', text: 'New password must be at least 6 characters.' }); return }
    if (newPw !== confirmPw) { setMsg({ kind: 'err', text: 'New password and confirmation do not match.' }); return }
    if (newPw === curPw) { setMsg({ kind: 'err', text: 'New password must differ from the current one.' }); return }
    setSaving(true)
    try {
      await changePassword(curPw, newPw)
      setMsg({ kind: 'ok', text: 'Password updated successfully.' })
      setCurPw(''); setNewPw(''); setConfirmPw('')
    } catch (e) {
      let text = e?.message || 'Could not update password.'
      try { text = JSON.parse(text).detail || text } catch {}
      setMsg({ kind: 'err', text })
    }
    setSaving(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1B2027', color: '#DFD0B8' }}>
      <Topbar />
      <div style={{ maxWidth: 760, margin: '0 auto', padding: isMobile ? '16px 14px 40px' : '26px 28px 48px', display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* HEADER */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.01em' }}>My Profile</h1>
          <p style={{ fontSize: 13, color: '#948979' }}>Your account details and security settings.</p>
        </div>

        {/* IDENTITY CARD */}
        <div style={{ background: '#222831', border: '1px solid #333b45', borderRadius: 14, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ width: 60, height: 60, borderRadius: 16, background: 'linear-gradient(150deg,#393E46,#948979)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 22, color: '#DFD0B8', flexShrink: 0 }}>
              {initials(u.username)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minWidth: 160 }}>
              <span style={{ fontSize: 19, fontWeight: 700, color: '#DFD0B8' }}>{u.username}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.08em', padding: '4px 9px', borderRadius: 7, textTransform: 'uppercase', ...rs }}>{r}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: active ? '#C6D196' : '#948979' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? '#7b8a43' : '#6f6a60' }} />
                  {active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
            <Field icon="mail" label="Email" value={u.email || '—'} />
            <Field icon="calendar_today" label="Member Since" value={fmtDate(u.created_at)} />
          </div>
        </div>

        {/* YOUR ACCESS */}
        <div style={{ background: '#222831', border: '1px solid #333b45', borderRadius: 14, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: '#948979', textTransform: 'uppercase' }}>Your Access</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(ROLE_PERMS[r] || []).map(p => (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <MS name="check_circle" size={15} color={ROLE_COL[r] || '#948979'} />
                <span style={{ fontSize: 13, color: '#cabfa6' }}>{p}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CHANGE PASSWORD */}
        <div style={{ background: '#222831', border: '1px solid #333b45', borderRadius: 14, padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: '#948979', textTransform: 'uppercase' }}>Change Password</span>

          {msg && (
            <div style={{
              padding: '10px 14px', borderRadius: 9, fontSize: 12.5,
              background: msg.kind === 'ok' ? 'rgba(123,138,67,.14)' : 'rgba(203,91,60,.12)',
              border: `1px solid ${msg.kind === 'ok' ? 'rgba(123,138,67,.4)' : 'rgba(203,91,60,.35)'}`,
              color: msg.kind === 'ok' ? '#C6D196' : '#E0987F',
            }}>{msg.text}</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 11, maxWidth: 420 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Current Password</label>
              <div style={inputWrap}>
                <input value={curPw} onChange={e => setCurPw(e.target.value)} type={show ? 'text' : 'password'} placeholder="Current password" style={inputStyle} />
                <button onClick={() => setShow(v => !v)} style={{ padding: '0 13px', background: 'none', border: 'none', color: '#6f6a60', cursor: 'pointer' }}>
                  <MS name={show ? 'visibility_off' : 'visibility'} size={16} color="#6f6a60" />
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>New Password</label>
              <div style={inputWrap}>
                <input value={newPw} onChange={e => setNewPw(e.target.value)} type={show ? 'text' : 'password'} placeholder="At least 6 characters" style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.1em', color: '#948979', textTransform: 'uppercase' }}>Confirm New Password</label>
              <div style={inputWrap}>
                <input value={confirmPw} onChange={e => setConfirmPw(e.target.value)} type={show ? 'text' : 'password'} placeholder="Re-enter new password" style={inputStyle} />
              </div>
            </div>
            <div>
              <button onClick={doChangePassword} disabled={saving} style={{ padding: '10px 20px', borderRadius: 9, border: 'none', background: '#DFD0B8', color: '#1B2027', fontWeight: 700, fontSize: 13, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                {saving ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>

        {/* SIGN OUT */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, border: '1px solid rgba(203,91,60,.45)', background: 'rgba(203,91,60,.1)', color: '#E0987F', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            <MS name="logout" size={17} color="#E0987F" /> Sign Out
          </button>
        </div>
      </div>
    </div>
  )
}
