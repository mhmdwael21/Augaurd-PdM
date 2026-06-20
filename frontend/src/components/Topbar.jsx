import { Fragment, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useResponsive } from '../hooks/useResponsive'

const MS = ({ name, size = 19, color, style = {} }) => (
  <span
    className="ms"
    style={{
      fontFamily: "'Material Symbols Outlined'",
      fontVariationSettings: "'FILL' 0, 'wght' 300",
      fontStyle: 'normal',
      lineHeight: 1,
      display: 'inline-block',
      verticalAlign: 'middle',
      fontSize: size,
      color,
      ...style,
    }}
  >
    {name}
  </span>
)

export default function Topbar({ unreadCount = 0 }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { role, username, logout } = useAuth()
  const { isMobile } = useResponsive()
  const [menuOpen, setMenuOpen] = useState(false)

  // Grouped: Monitoring | Operations | Analytics+Admin. Notifications lives on
  // the 🔔 bell (top-right), so it's not a text tab. `divider` starts a group.
  const nav = [
    { label: 'Dashboard',     path: '/dashboard' },
    { label: 'Fleet',         path: '/fleet' },
    { label: 'Prototype',     path: '/hardware' },
    { label: 'Alerts',        path: '/alerts', divider: true },
    { label: 'Work Orders',   path: '/work-orders' },
    { label: 'Maintenance',   path: '/maintenance' },
    { label: 'Reports',       path: '/reports', divider: true },
    { label: 'Users',         path: '/users', adminOnly: true },
  ]

  const initials = username
    ? username.split('.').map(p => p[0]?.toUpperCase() || '').join('').slice(0, 2)
    : 'U'

  function handleLogout() {
    logout()
    navigate('/auth')
    setMenuOpen(false)
  }

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 40,
      background: 'rgba(27,32,39,.93)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid #333b45',
    }}>
      <div style={{
        maxWidth: 1400, margin: '0 auto', height: 58, padding: '0 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        {/* LEFT: logo */}
        <Link to="/" style={{ display: 'flex', flexDirection: 'column', gap: 5, lineHeight: 1, flexShrink: 0 }}>
          <span style={{ fontWeight: 800, fontSize: 16, color: '#948979', letterSpacing: '-.01em' }}>Auguard</span>
          {!isMobile && (
            <span style={{ fontWeight: 500, fontSize: 8.5, color: '#5d5850', letterSpacing: '.04em', textTransform: 'uppercase' }}>
              AI-Powered Predictive Maintenance For APU Systems
            </span>
          )}
        </Link>

        {/* DESKTOP: separator + nav */}
        {!isMobile && (
          <>
            <div style={{ width: 1, height: 22, background: '#333b45' }} />
            <nav style={{ display: 'flex', gap: 4, flex: 1, alignItems: 'center' }}>
              {nav.map(({ label, path, adminOnly, divider }) => {
                if (adminOnly && role !== 'admin') return null
                const active = location.pathname === path
                return (
                  <Fragment key={path}>
                    {divider && <span style={{ width: 1, height: 18, background: '#333b45', margin: '0 5px' }} />}
                    {active ? (
                      <span style={{
                        padding: '6px 13px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        color: '#DFD0B8', background: '#393E46', cursor: 'default',
                      }}>{label}</span>
                    ) : (
                      <Link to={path} style={{
                        padding: '6px 13px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                        color: '#948979',
                      }}>{label}</Link>
                    )}
                  </Fragment>
                )
              })}
            </nav>
          </>
        )}

        {/* RIGHT */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
          {!isMobile && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '6px 12px', border: '1px solid #333b45', borderRadius: 999, background: '#222831',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#CB5B3C', animation: 'scblink 1.4s infinite' }} />
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.14em', color: '#DFD0B8' }}>LIVE</span>
            </div>
          )}

          <Link to="/notifications" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, border: '1px solid #333b45', borderRadius: 10, background: '#222831' }}>
            <MS name="notifications" color="#7c756a" />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: -6, right: -6,
                minWidth: 19, height: 19, padding: '0 5px', borderRadius: 999,
                background: '#CB5B3C', color: '#fff', fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '2px solid #1B2027',
              }}>{unreadCount}</span>
            )}
          </Link>

          {!isMobile ? (
            <button
              onClick={handleLogout}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                padding: '5px 11px 5px 5px', border: '1px solid #333b45',
                borderRadius: 999, background: '#222831', cursor: 'pointer',
              }}
              title="Sign out"
            >
              <span style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'linear-gradient(150deg,#393E46,#948979)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 12, color: '#DFD0B8',
              }}>{initials}</span>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#DFD0B8' }}>
                  {username ? username.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') : 'User'}
                </span>
                <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.1em', color: '#7b8a43' }}>
                  {role?.toUpperCase()}
                </span>
              </div>
            </button>
          ) : (
            <button
              onClick={() => setMenuOpen(v => !v)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, border: '1px solid #333b45', borderRadius: 10, background: '#222831', cursor: 'pointer' }}
            >
              <MS name={menuOpen ? 'close' : 'menu'} color="#948979" size={20} />
            </button>
          )}
        </div>
      </div>

      {/* MOBILE DROPDOWN MENU */}
      {isMobile && menuOpen && (
        <div style={{ borderTop: '1px solid #333b45', background: 'rgba(27,32,39,.97)', padding: '10px 16px 14px' }}>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {nav.map(({ label, path, adminOnly }) => {
              if (adminOnly && role !== 'admin') return null
              const active = location.pathname === path
              return (
                <Link
                  key={path} to={path}
                  onClick={() => setMenuOpen(false)}
                  style={{
                    padding: '11px 14px', borderRadius: 10, fontSize: 14, fontWeight: active ? 700 : 500,
                    color: active ? '#DFD0B8' : '#948979',
                    background: active ? '#393E46' : 'transparent',
                  }}
                >{label}</Link>
              )
            })}
          </nav>
          <div style={{ marginTop: 10, borderTop: '1px solid #2f3742', paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'linear-gradient(150deg,#393E46,#948979)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 13, color: '#DFD0B8',
              }}>{initials}</span>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#DFD0B8' }}>
                  {username || 'User'}
                </span>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.1em', color: '#7b8a43' }}>
                  {role?.toUpperCase()}
                </span>
              </div>
            </div>
            <button onClick={handleLogout} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #3a414c', background: 'transparent', color: '#948979', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
