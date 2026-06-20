import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getEquipmentItem, getAlerts, getSensors, getWorkOrders } from '../api'
import Topbar from '../components/Topbar'
import { useResponsive } from '../hooks/useResponsive'
import { C, severityStyle, statusStyle } from '../tokens'

const MS = ({ name, size = 18, color, style = {} }) => (
  <span style={{
    fontFamily: "'Material Symbols Outlined'",
    fontVariationSettings: "'FILL' 0, 'wght' 300",
    fontStyle: 'normal', lineHeight: 1,
    display: 'inline-block', verticalAlign: 'middle',
    fontSize: size, color, ...style,
  }}>{name}</span>
)

function eqStatusStyle(status) {
  const m = {
    active:         { bg: C.normalBg, fg: C.normalText, bd: C.normalBd, dot: C.normalDot },
    idle:           { bg: 'rgba(148,137,121,.14)', fg: C.textSecondary, bd: C.borderStrong, dot: C.textMuted },
    maintenance:    { bg: C.warnBg, fg: C.warnText, bd: C.warnBd, dot: C.warnSolid },
    decommissioned: { bg: C.critBg, fg: C.critText, bd: C.critBd, dot: C.critSolid },
  }
  return m[status] || m.idle
}

function sensorStatusStyle(s) {
  const m = {
    online:  { bg: C.normalBg, fg: C.normalText, bd: C.normalBd, dot: C.normalDot },
    faulty:  { bg: C.critBg, fg: C.critText, bd: C.critBd, dot: C.critSolid },
    offline: { bg: 'rgba(148,137,121,.14)', fg: C.textMuted, bd: C.borderStrong, dot: C.textDim },
  }
  return m[s] || m.offline
}

const WO_LABEL = { open: 'Open', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' }

function woStatusStyle(st) {
  const m = {
    open:        { background: C.critBg, color: C.critText, border: `1px solid ${C.critBd}` },
    in_progress: { background: C.warnBg, color: C.warnText, border: `1px solid ${C.warnBd}` },
    completed:   { background: C.normalBg, color: C.normalText, border: `1px solid ${C.normalBd}` },
    cancelled:   { background: 'rgba(148,137,121,.16)', color: C.textMuted, border: `1px solid ${C.borderStrong}` },
  }
  return m[st] || m.open
}

function fmtDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const p2 = x => String(x).padStart(2, '0')
  return `${M[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

function Field({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '12px 14px', background: C.bgBase, borderRadius: 10 }}>
      <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '.1em', color: C.textDim, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>{value || '—'}</span>
    </div>
  )
}

export default function AssetDetail() {
  const { assetId } = useParams()
  const navigate = useNavigate()
  const { isMobile } = useResponsive()
  const [asset, setAsset] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [sensors, setSensors] = useState([])
  const [workOrders, setWorkOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const load = useCallback(async () => {
    try {
      const [eq, al, sn, wo] = await Promise.all([
        getEquipmentItem(assetId),
        getAlerts().catch(() => []),
        getSensors(assetId).catch(() => []),
        getWorkOrders({ equipment_id: assetId }).catch(() => []),
      ])
      setAsset(eq)
      setSensors(Array.isArray(sn) ? sn : [])
      setWorkOrders(Array.isArray(wo) ? wo : [])
      setAlerts((Array.isArray(al) ? al : []).filter(a => String(a.equipment_id) === String(assetId)))
    } catch {
      setNotFound(true)
    }
    setLoading(false)
  }, [assetId])

  useEffect(() => { load() }, [load])
  useEffect(() => { const id = setInterval(load, 8000); return () => clearInterval(id) }, [load])

  const st = asset ? eqStatusStyle(asset.status) : null
  const sorted = alerts.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  return (
    <div style={{ minHeight: '100vh', background: C.bgBase, color: C.textPrimary }}>
      <Topbar />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '16px 14px 40px' : '26px 28px 48px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Back link */}
        <button onClick={() => navigate('/fleet')} style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', padding: '6px 12px 6px 8px', borderRadius: 9, border: `1px solid ${C.borderStrong}`, background: C.bgSurface, color: C.textMuted, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
          <MS name="chevron_left" size={18} color={C.textMuted} /> Fleet
        </button>

        {loading ? (
          <div style={{ padding: 44, textAlign: 'center', color: C.textDim, fontSize: 13 }}>Loading asset…</div>
        ) : notFound || !asset ? (
          <div style={{ padding: 44, textAlign: 'center', background: C.bgSurface, border: `1px dashed ${C.borderStrong}`, borderRadius: 14, color: C.textDim, fontSize: 13 }}>Asset not found.</div>
        ) : (
          <>
            {/* ASSET HEADER */}
            <div style={{ background: C.bgSurface, border: `1px solid ${C.borderStrong}`, borderRadius: 16, padding: isMobile ? 18 : 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 50, height: 50, borderRadius: 13, background: C.bgBase, border: `1px solid ${C.borderStrong}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MS name="precision_manufacturing" size={26} color={st.dot} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <h1 style={{ fontSize: 23, fontWeight: 700, letterSpacing: '-.01em', color: C.textPrimary }}>{asset.asset_tag}</h1>
                    <span style={{ fontSize: 13, color: C.textMuted }}>{asset.name}</span>
                  </div>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '.08em', padding: '6px 12px', borderRadius: 999, background: st.bg, color: st.fg, border: `1px solid ${st.bd}`, textTransform: 'uppercase' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.dot }} />
                  {asset.status}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
                <Field label="Model" value={asset.model} />
                <Field label="Location" value={asset.location} />
                <Field label="Installed" value={asset.install_date ? fmtDate(asset.install_date).split(' ').slice(0, 3).join(' ') : '—'} />
                <Field label="Registered" value={fmtDate(asset.created_at).split(' ').slice(0, 3).join(' ')} />
              </div>
            </div>

            {/* SENSOR REGISTRY FOR THIS ASSET */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, letterSpacing: '.01em' }}>Sensors</h2>
                {sensors.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11.5, color: C.textDim }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.normalDot }} />
                      {sensors.filter(s => s.status === 'online').length} online
                    </span>
                    {sensors.some(s => s.status === 'faulty') && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.critSolid }} />
                        {sensors.filter(s => s.status === 'faulty').length} faulty
                      </span>
                    )}
                    <span>{sensors.length} channels</span>
                  </div>
                )}
              </div>
              {sensors.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', background: C.bgSurface, border: `1px dashed ${C.borderStrong}`, borderRadius: 14, color: C.textDim, fontSize: 13 }}>
                  No sensors registered for this asset.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                  {sensors.map(s => {
                    const ss = sensorStatusStyle(s.status)
                    return (
                      <div key={s.id} style={{ background: C.bgSurface, border: `1px solid ${s.status === 'faulty' ? C.critBd : C.borderStrong}`, borderRadius: 12, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 700, color: C.textPrimary, fontFamily: 'monospace', letterSpacing: '.01em' }}>{s.channel_name}</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9.5, fontWeight: 700, letterSpacing: '.07em', padding: '3px 8px', borderRadius: 999, background: ss.bg, color: ss.fg, border: `1px solid ${ss.bd}`, textTransform: 'uppercase' }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: ss.dot }} />
                            {s.status}
                          </span>
                        </div>
                        <span style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.3 }}>{s.display_name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8, borderTop: `1px solid ${C.borderSubtle}` }}>
                          <span style={{ fontSize: 10.5, color: C.textDim, letterSpacing: '.03em' }}>
                            {s.sensor_type}{s.unit ? ` · ${s.unit}` : ''}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ALERTS FOR THIS ASSET */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, letterSpacing: '.01em' }}>Alerts</h2>
                <span style={{ fontSize: 12, color: C.textDim }}>{sorted.length} total</span>
              </div>
              {sorted.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', background: C.bgSurface, border: `1px dashed ${C.borderStrong}`, borderRadius: 14, color: C.textDim, fontSize: 13 }}>
                  No alerts recorded for this asset.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sorted.map(a => {
                    const ss = severityStyle(a.severity)
                    const sts = statusStyle(a.status)
                    return (
                      <div key={a.id} style={{ background: C.bgSurface, border: `1px solid ${C.borderStrong}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', padding: '5px 10px', borderRadius: 7, whiteSpace: 'nowrap', ...ss }}>{(a.severity || '').toUpperCase()}</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 180 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.textPrimary, lineHeight: 1.3 }}>{a.predicted_failure || '—'}</span>
                          <span style={{ fontSize: 11, color: C.textDim }}>{fmtDate(a.timestamp)}</span>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', padding: '5px 11px', borderRadius: 999, whiteSpace: 'nowrap', ...sts }}>{(a.status || '').toUpperCase()}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* WORK ORDERS FOR THIS ASSET */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, letterSpacing: '.01em' }}>Work Orders</h2>
                <span style={{ fontSize: 12, color: C.textDim }}>{workOrders.length} total</span>
              </div>
              {workOrders.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', background: C.bgSurface, border: `1px dashed ${C.borderStrong}`, borderRadius: 14, color: C.textDim, fontSize: 13 }}>
                  No work orders for this asset.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {workOrders.map(o => {
                    const ps = severityStyle(o.priority)
                    const ws = woStatusStyle(o.status)
                    return (
                      <div key={o.id} style={{ background: C.bgSurface, border: `1px solid ${C.borderStrong}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.1em', padding: '5px 10px', borderRadius: 7, whiteSpace: 'nowrap', ...ps }}>{(o.priority || '').toUpperCase()}</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 180 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 600, color: C.textPrimary, lineHeight: 1.3 }}>{o.title}</span>
                          <span style={{ fontSize: 11, color: C.textDim }}>{fmtDate(o.created_at)} · {o.assigned_to_username || 'Unassigned'}</span>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', padding: '5px 11px', borderRadius: 999, whiteSpace: 'nowrap', ...ws }}>{(WO_LABEL[o.status] || o.status).toUpperCase()}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
