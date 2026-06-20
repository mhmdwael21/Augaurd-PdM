import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getEquipment, getAlerts } from '../api'
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

// Equipment status → pill + dot colours (reuses the design-token palette).
function eqStatusStyle(status) {
  const m = {
    active:         { bg: C.normalBg, fg: C.normalText, bd: C.normalBd, dot: C.normalDot },
    idle:           { bg: 'rgba(148,137,121,.14)', fg: C.textSecondary, bd: C.borderStrong, dot: C.textMuted },
    maintenance:    { bg: C.warnBg, fg: C.warnText, bd: C.warnBd, dot: C.warnSolid },
    decommissioned: { bg: C.critBg, fg: C.critText, bd: C.critBd, dot: C.critSolid },
  }
  return m[status] || m.idle
}

function sevColor(sev) {
  return { critical: C.critText, high: C.warnText, medium: C.accentMid, low: C.normalText }[sev] || C.textSecondary
}

function fmtDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const p2 = x => String(x).padStart(2, '0')
  return `${M[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

export default function Fleet() {
  const navigate = useNavigate()
  const { isMobile } = useResponsive()
  const [assets, setAssets] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [eq, al] = await Promise.all([getEquipment(), getAlerts().catch(() => [])])
      setAssets(eq)
      setAlerts(Array.isArray(al) ? al : [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(load, 8000); return () => clearInterval(id) }, [load])

  // Group alerts by asset (all current alerts belong to the live unit).
  const alertsByAsset = {}
  for (const a of alerts) {
    const k = String(a.equipment_id)
    ;(alertsByAsset[k] ||= []).push(a)
  }

  const activeCount = assets.filter(a => a.status === 'active').length

  return (
    <div style={{ minHeight: '100vh', background: C.bgBase, color: C.textPrimary }}>
      <Topbar />
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: isMobile ? '16px 14px 40px' : '26px 28px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* PAGE HEADER */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.01em', color: C.textPrimary }}>Fleet Overview</h1>
            <p style={{ fontSize: 13, color: C.textMuted }}>Air-production units monitored by AuGuard. Select an asset to view its sensors and alerts.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', border: `1px solid ${C.borderStrong}`, borderRadius: 999, background: C.bgSurface }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.normalDot }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary }}>{activeCount} active · {assets.length} total</span>
          </div>
        </div>

        {/* ASSET GRID */}
        {loading ? (
          <div style={{ padding: 44, textAlign: 'center', color: C.textDim, fontSize: 13 }}>Loading fleet…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {assets.map((a, idx) => {
              const st = eqStatusStyle(a.status)
              const list = alertsByAsset[String(a.id)] || []
              const open = list.filter(x => x.status !== 'resolved')
              const isLive = a.status === 'active'
              const latest = list.slice().sort((x, y) => new Date(y.timestamp) - new Date(x.timestamp))[0]
              return (
                <div key={a.id} className="anim-in"
                  onClick={() => navigate(`/fleet/${a.id}`)}
                  style={{
                    background: C.bgSurface, border: `1px solid ${open.length ? 'rgba(203,91,60,.3)' : C.borderStrong}`,
                    borderRadius: 16, padding: 18, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 14,
                    animationDelay: `${idx * 50}ms`, transition: 'border-color .2s',
                  }}>
                  {/* Card header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 11, background: C.bgBase, border: `1px solid ${C.borderStrong}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <MS name="precision_manufacturing" size={21} color={st.dot} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 16, fontWeight: 700, color: C.textPrimary, letterSpacing: '-.01em' }}>{a.asset_tag}</span>
                        <span style={{ fontSize: 11.5, color: C.textMuted }}>{a.name}</span>
                      </div>
                    </div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', padding: '5px 10px', borderRadius: 999, background: st.bg, color: st.fg, border: `1px solid ${st.bd}`, textTransform: 'uppercase' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />
                      {a.status}
                    </span>
                  </div>

                  {/* Meta */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '12px 14px', background: C.bgBase, borderRadius: 11 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <MS name="location_on" size={15} color={C.textDim} />
                      <span style={{ fontSize: 12.5, color: C.textSecondary }}>{a.location || '—'}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <MS name="memory" size={15} color={C.textDim} />
                      <span style={{ fontSize: 12.5, color: C.textSecondary }}>{a.model || '—'}</span>
                    </div>
                  </div>

                  {/* Alert summary / live state */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    {isLive ? (
                      open.length > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: sevColor(latest?.severity) }} />
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.textPrimary }}>{open.length} open alert{open.length > 1 ? 's' : ''}</span>
                          <span style={{ fontSize: 11, color: C.textDim }}>· last {fmtDate(latest?.timestamp)}</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.normalDot }} />
                          <span style={{ fontSize: 12.5, fontWeight: 600, color: C.normalText }}>All clear</span>
                        </div>
                      )
                    ) : (
                      <span style={{ fontSize: 12, color: C.textDim, fontStyle: 'italic' }}>No live data — registered</span>
                    )}
                    <MS name="chevron_right" size={20} color={C.textDim} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
