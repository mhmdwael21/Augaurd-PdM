import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { login as apiLogin, register as apiRegister } from '../api'
import { useResponsive } from '../hooks/useResponsive'

const MS = ({ name, size = 19, color, style = {} }) => (
  <span style={{
    fontFamily: "'Material Symbols Outlined'",
    fontVariationSettings: "'FILL' 0, 'wght' 300",
    fontStyle: 'normal', lineHeight: 1,
    display: 'inline-block', verticalAlign: 'middle',
    fontSize: size, color, ...style,
  }}>{name}</span>
)

function DecoChart({ buf }) {
  const W = 240, H = 44, n = buf.length
  if (n < 2) return null
  const clamp = v => Math.max(0.05, Math.min(0.95, v))
  const X = i => (i / (n - 1)) * W
  const Y = v => H - clamp(v) * H
  let line = ''
  buf.forEach((v, i) => { line += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1) + ' ' })
  const area = line + `L ${W} ${H} L 0 ${H} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
      <path d={area} fill="#948979" fillOpacity={0.12} />
      <path d={line} fill="none" stroke="#948979" strokeWidth={1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={X(n - 1)} cy={Y(buf[n - 1])} r={2.6} fill="#DFD0B8" />
    </svg>
  )
}

export default function Auth() {
  const navigate = useNavigate()
  const { login: authLogin, token } = useAuth()

  const [mode, setMode] = useState('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('operator')
  const [showPw, setShowPw] = useState(false)
  const [touched, setTouched] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [doneRole, setDoneRole] = useState('')
  const [apiError, setApiError] = useState('')
  const [decoBuf, setDecoBuf] = useState(() => {
    const buf = []
    for (let i = 0; i < 46; i++) buf.push(0.5 + 0.32 * Math.sin(i * 0.45) + 0.12 * Math.sin(i * 1.7))
    return buf
  })
  const kRef = useRef(46)
  const timerRef = useRef(null)

  useEffect(() => {
    if (token) { navigate('/dashboard', { replace: true }); return }
  }, [token, navigate])

  useEffect(() => {
    timerRef.current = setInterval(() => {
      const k = kRef.current++
      const v = 0.5 + 0.32 * Math.sin(k * 0.45) + 0.12 * Math.sin(k * 1.7) + (Math.random() - 0.5) * 0.06
      setDecoBuf(prev => [...prev.slice(-45), v])
    }, 190)
    return () => clearInterval(timerRef.current)
  }, [])

  function validate() {
    const e = {}
    if (!username.trim()) e.username = 'Username is required.'
    else if (username.trim().length < 3) e.username = 'Must be at least 3 characters.'
    else if (username.trim().length > 50) e.username = 'Must be 50 characters or fewer.'
    if (mode === 'register') {
      if (!email.trim()) e.email = 'Email is required.'
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = 'Enter a valid email address.'
    }
    if (!password) e.password = 'Password is required.'
    else if (password.length < 6) e.password = 'Must be at least 6 characters.'
    return e
  }

  function touch(k) { setTouched(t => ({ ...t, [k]: true })) }

  async function handleSubmit() {
    const errs = validate()
    if (Object.keys(errs).length) {
      setTouched({ username: true, email: true, password: true })
      return
    }
    setSubmitting(true)
    setApiError('')
    try {
      if (mode === 'login') {
        const res = await apiLogin(username, password)
        authLogin(res.access_token, null, username)
        setDoneRole(localStorage.getItem('auguard_role') || 'operator')
      } else {
        await apiRegister(username, email, password, role)
        const res = await apiLogin(username, password)
        authLogin(res.access_token, role, username)
        setDoneRole(role)
      }
      setDone(true)
      setTimeout(() => {
        const r = localStorage.getItem('auguard_role')
        navigate(r === 'technician' ? '/alerts' : '/dashboard', { replace: true })
      }, 1200)
    } catch (err) {
      setApiError(err.message || 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  function quickFill(u, p, r) {
    setUsername(u); setPassword(p); setRole(r)
    setTouched({}); setApiError('')
  }

  const { isMobile } = useResponsive()
  const errs = validate()
  const showErr = k => !!(touched[k] && errs[k])
  const isReg = mode === 'register'

  const tabStyle = active => ({
    flex: 1, padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: active ? '#DFD0B8' : 'transparent',
    color: active ? '#1B2027' : '#948979',
    fontFamily: 'Satoshi, system-ui, sans-serif',
    fontWeight: active ? 700 : 600, fontSize: 13.5, letterSpacing: '.01em',
  })

  const roleDefs = [
    { key: 'operator', label: 'Operator', desc: 'read-only' },
    { key: 'technician', label: 'Technician', desc: 'act on alerts' },
    { key: 'admin', label: 'Admin', desc: 'full access' },
  ]

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: isMobile ? '0' : 28,
      background: 'radial-gradient(1100px 600px at 75% -5%, #2a3140 0%, #1B2027 58%)',
      color: '#DFD0B8',
    }}>
      <div style={{
        width: '100%', maxWidth: isMobile ? '100%' : 1040,
        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        background: '#222831', border: isMobile ? 'none' : '1px solid #333b45',
        borderRadius: isMobile ? 0 : 22, overflow: 'hidden',
        boxShadow: isMobile ? 'none' : '0 40px 90px rgba(0,0,0,.5)',
        minHeight: isMobile ? '100vh' : 'auto',
      }}>
        {/* ── BRAND PANEL ── */}
        <div style={{
          position: 'relative', padding: '38px 38px 32px',
          display: isMobile ? 'none' : 'flex', flexDirection: 'column',
          justifyContent: 'space-between', gap: 30,
          background: 'linear-gradient(160deg,#2b313c 0%,#23282f 60%,#20252d 100%)',
          borderRight: '1px solid #333b45', minHeight: 600,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, lineHeight: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 26, letterSpacing: '-.02em', color: '#948979' }}>Auguard</div>
            <div style={{ fontSize: 9.5, fontWeight: 500, letterSpacing: '.12em', color: '#5d5850', textTransform: 'uppercase' }}>AI-Powered Predictive Maintenance For APU Systems</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <h1 style={{ fontWeight: 800, fontSize: 32, lineHeight: 1.12, letterSpacing: '-.02em', color: '#DFD0B8' }}>
              Catch air-compressor failures before they happen.
            </h1>
            <p style={{ fontSize: 14, lineHeight: 1.55, color: '#a59c8c', maxWidth: 330 }}>
              Real-time anomaly detection, fault localization and remaining-useful-life forecasting for the Porto Metro APU fleet.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 6 }}>
              {[
                { dot: '#AEBC74', text: 'Isolation Forest · ', sub: '99.5% failure recall' },
                { dot: '#D9A94A', text: 'LSTM-AE · ', sub: 'fault localization' },
                { dot: '#948979', text: 'LightGBM · ', sub: 'RUL forecast, MAE ±21.6h' },
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: item.dot, boxShadow: `0 0 10px ${item.dot}`, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#cabfa6' }}>{item.text}<span style={{ color: '#7c756a' }}>{item.sub}</span></span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ height: 44, opacity: 0.85 }}>
              <DecoChart buf={decoBuf} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="blink" style={{ width: 7, height: 7, borderRadius: '50%', background: '#CB5B3C' }} />
              <span style={{ fontSize: 10, letterSpacing: '.14em', color: '#7c756a', textTransform: 'uppercase' }}>Live monitoring · MetroPT-3 dataset</span>
            </div>
          </div>
        </div>

        {/* ── FORM PANEL ── */}
        <div style={{ padding: isMobile ? '36px 20px 40px' : '38px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: isMobile ? '100vh' : 600 }}>
          {isMobile && (
            <div style={{ marginBottom: 28, display: 'flex', flexDirection: 'column', gap: 6, lineHeight: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 24, letterSpacing: '-.02em', color: '#948979' }}>Auguard</div>
              <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '.12em', color: '#5d5850', textTransform: 'uppercase' }}>AI-Powered Predictive Maintenance For APU Systems</div>
            </div>
          )}
          {done ? (
            <div className="anim-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 18 }}>
              <div className="anim-pop" style={{
                width: 74, height: 74, borderRadius: '50%',
                background: 'rgba(123,138,67,.16)', border: '1px solid rgba(123,138,67,.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 38, color: '#AEBC74', lineHeight: 1 }}>✓</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <h2 style={{ fontWeight: 800, fontSize: 25, color: '#DFD0B8' }}>
                  {mode === 'login' ? 'Welcome back' : 'Account created'}
                </h2>
                <p style={{ fontSize: 13.5, color: '#a59c8c', lineHeight: 1.5, maxWidth: 320 }}>
                  {mode === 'login'
                    ? `Signed in as ${username}. Your live monitoring session is ready.`
                    : `Account for ${username} is ready. Redirecting to dashboard…`}
                </p>
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '7px 14px', borderRadius: 999,
                background: '#1B2027', border: '1px solid #333b45',
              }}>
                <span style={{ fontSize: 10, letterSpacing: '.14em', color: '#7c756a' }}>ROLE</span>
                <span style={{ fontSize: 11.5, fontWeight: 600, color: '#DFD0B8', textTransform: 'uppercase' }}>{doneRole}</span>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              {/* tab toggle */}
              <div style={{ display: 'flex', gap: 5, padding: 5, background: '#1B2027', border: '1px solid #333b45', borderRadius: 12 }}>
                <button style={tabStyle(!isReg)} onClick={() => { setMode('login'); setTouched({}); setApiError('') }}>Sign in</button>
                <button style={tabStyle(isReg)} onClick={() => { setMode('register'); setTouched({}); setApiError('') }}>Create account</button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <h2 style={{ fontWeight: 800, fontSize: 23, letterSpacing: '-.01em', color: '#DFD0B8' }}>
                  {isReg ? 'Create your account' : 'Sign in to Auguard'}
                </h2>
                <p style={{ fontSize: 13, color: '#948979' }}>
                  {isReg ? 'Set up access for the monitoring console.' : 'Access the predictive-maintenance console.'}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                {/* username */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: showErr('username') ? '#E0987F' : '#948979' }}>Username</label>
                  <input
                    value={username} onChange={e => setUsername(e.target.value)} onBlur={() => touch('username')}
                    placeholder="e.g. m.wael" autoComplete="username"
                    style={{ width: '100%', padding: '13px 14px', borderRadius: 10, border: `1px solid ${showErr('username') ? '#E0987F' : '#3a414c'}`, background: '#1B2027', color: '#DFD0B8', fontSize: 14 }}
                  />
                  {showErr('username') && <span style={{ fontSize: 10.5, color: '#E0987F' }}>{errs.username}</span>}
                </div>

                {/* email (register only) */}
                {isReg && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <label style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: showErr('email') ? '#E0987F' : '#948979' }}>Email</label>
                    <input
                      value={email} onChange={e => setEmail(e.target.value)} onBlur={() => touch('email')}
                      type="email" placeholder="you@metro.pt" autoComplete="email"
                      style={{ width: '100%', padding: '13px 14px', borderRadius: 10, border: `1px solid ${showErr('email') ? '#E0987F' : '#3a414c'}`, background: '#1B2027', color: '#DFD0B8', fontSize: 14 }}
                    />
                    {showErr('email') && <span style={{ fontSize: 10.5, color: '#E0987F' }}>{errs.email}</span>}
                  </div>
                )}

                {/* password */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: showErr('password') ? '#E0987F' : '#948979' }}>Password</label>
                    <button onClick={() => setShowPw(p => !p)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10.5, color: '#948979', letterSpacing: '.06em' }}>
                      {showPw ? 'HIDE' : 'SHOW'}
                    </button>
                  </div>
                  <input
                    value={password} onChange={e => setPassword(e.target.value)} onBlur={() => touch('password')}
                    type={showPw ? 'text' : 'password'} placeholder="At least 6 characters"
                    autoComplete={isReg ? 'new-password' : 'current-password'}
                    style={{ width: '100%', padding: '13px 14px', borderRadius: 10, border: `1px solid ${showErr('password') ? '#E0987F' : '#3a414c'}`, background: '#1B2027', color: '#DFD0B8', fontSize: 14 }}
                  />
                  {showErr('password') && <span style={{ fontSize: 10.5, color: '#E0987F' }}>{errs.password}</span>}
                </div>

                {/* role (register only) */}
                {isReg && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: '#948979' }}>Role</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {roleDefs.map(r => {
                        const active = role === r.key
                        return (
                          <button key={r.key} onClick={() => setRole(r.key)} style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3,
                            padding: '11px 12px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                            border: `1px solid ${active ? 'rgba(223,208,184,.55)' : '#3a414c'}`,
                            background: active ? 'rgba(223,208,184,.08)' : '#1B2027',
                            color: active ? '#DFD0B8' : '#a59c8c',
                          }}>
                            <span style={{ fontWeight: 600, fontSize: 13 }}>{r.label}</span>
                            <span style={{ fontSize: 9, letterSpacing: '.04em', color: active ? '#9c917f' : '#6f6a60' }}>{r.desc}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* demo quick-fill (login only) */}
              {!isReg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, letterSpacing: '.1em', color: '#6f6a60', textTransform: 'uppercase' }}>Demo</span>
                  {[['admin', 'admin123', 'admin'], ['technician', 'tech123', 'technician'], ['operator', 'op123', 'operator']].map(([u, p, r]) => (
                    <button key={u} onClick={() => quickFill(u, p, r)} style={{
                      padding: '5px 11px', borderRadius: 999, border: '1px solid #333b45',
                      background: '#1B2027', color: '#cabfa6', fontSize: 10.5, cursor: 'pointer',
                    }}>{u}</button>
                  ))}
                </div>
              )}

              {apiError && (
                <div style={{ padding: '10px 14px', borderRadius: 9, background: 'rgba(203,91,60,.1)', border: '1px solid rgba(203,91,60,.35)' }}>
                  <span style={{ fontSize: 12.5, color: '#E0987F' }}>{apiError}</span>
                </div>
              )}

              <button onClick={handleSubmit} disabled={submitting} style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                padding: 14, borderRadius: 11, border: 'none',
                background: '#DFD0B8', color: '#1B2027',
                fontWeight: 700, fontSize: 14.5, cursor: submitting ? 'default' : 'pointer',
                opacity: submitting ? 0.7 : 1, letterSpacing: '.01em',
              }}>
                {submitting && (
                  <span className="spin" style={{ width: 15, height: 15, border: '2px solid rgba(27,32,39,.35)', borderTopColor: '#1B2027', borderRadius: '50%', display: 'inline-block' }} />
                )}
                <span>{submitting ? (isReg ? 'Creating account…' : 'Signing in…') : (isReg ? 'Create account' : 'Sign in')}</span>
              </button>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, color: '#948979' }}>
                <span>{isReg ? 'Already have an account?' : 'New to Auguard?'}</span>
                <button onClick={() => { setMode(isReg ? 'login' : 'register'); setTouched({}); setApiError('') }} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontWeight: 600, fontSize: 13, color: '#DFD0B8',
                  textDecoration: 'underline', textUnderlineOffset: 3,
                }}>
                  {isReg ? 'Sign in' : 'Create one'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
