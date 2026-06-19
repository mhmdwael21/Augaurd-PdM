import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  getHardware, getHardwarePipeline, getNotifications,
  setTriggerConfig, clearHardwareBanner,
} from '../api'
import Topbar from '../components/Topbar'
import SystemSchematic from '../components/SystemSchematic'
import { useResponsive } from '../hooks/useResponsive'
import { usePoll } from '../hooks/usePoll'

const MS = ({ name, size = 17, color, style = {} }) => (
  <span style={{
    fontFamily: "'Material Symbols Outlined'",
    fontVariationSettings: "'FILL' 0, 'wght' 300",
    fontStyle: 'normal', lineHeight: 1,
    display: 'inline-block', verticalAlign: 'middle',
    fontSize: size, color, ...style,
  }}>{name}</span>
)

const PANEL = { background: '#262C35', border: '1px solid #333b45', borderRadius: 16, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }
const LABEL = { fontSize: 11, letterSpacing: '.2em', color: '#948979', textTransform: 'uppercase' }

function Sparkline({ buf, color }) {
  const W = 240, H = 44, n = buf.length
  if (n < 2) return <svg width="100%" height={H} />
  const lo = Math.min(...buf), hi = Math.max(...buf), span = (hi - lo) || 1
  const X = i => (i / (n - 1)) * W
  const Y = v => H - ((v - lo) / span) * H
  let line = ''
  buf.forEach((v, i) => { line += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1) + ' ' })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: 'block' }}>
      <path d={line + `L ${W} ${H} L 0 ${H} Z`} fill={color} fillOpacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Gauge({ g, series, kind }) {
  // kind: 'pump' | 'tank' -> which series key to chart
  const offline = !g.online || g.value == null
  const color = offline ? '#5d5850' : '#AEBC74'
  return (
    <div style={{
      ...PANEL, gap: 10, opacity: offline ? 0.72 : 1,
      borderColor: g.fault ? 'rgba(203,91,60,.4)' : '#333b45',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={LABEL}>{g.label}</span>
        {g.fault ? (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', padding: '4px 9px', borderRadius: 999, background: 'rgba(203,91,60,.16)', color: '#E0987F', border: '1px solid rgba(203,91,60,.45)' }}>OFFLINE</span>
        ) : (
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', padding: '4px 9px', borderRadius: 999, background: offline ? 'rgba(148,137,121,.14)' : 'rgba(123,138,67,.14)', color: offline ? '#a59c8c' : '#C6D196', border: `1px solid ${offline ? 'rgba(148,137,121,.3)' : 'rgba(123,138,67,.4)'}` }}>
            {offline ? 'NO SIGNAL' : 'LIVE'}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 40, fontWeight: 800, color: offline ? '#6f6a60' : '#DFD0B8', letterSpacing: '-.02em' }}>
          {offline ? '—' : Math.round(g.value)}
        </span>
        {!offline && <span style={{ fontSize: 14, color: '#948979' }}>{g.unit}</span>}
      </div>
      {g.fault
        ? <div style={{ fontSize: 11.5, color: '#a59c8c' }}>P-Sensor 2 hardware fault — no live reading.</div>
        : <Sparkline buf={series.map(s => s[kind]).slice(-90)} color={color} />}
    </div>
  )
}

export default function Hardware() {
  const { isMobile } = useResponsive()
  const [busy, setBusy] = useState(false)
  const [cfg, setCfg] = useState(null)

  const { data: hw } = usePoll(getHardware, 1000)
  const { data: pipe } = usePoll(getHardwarePipeline, 2000)
  const { data: notifs } = usePoll(getNotifications, 10000)
  const unreadCount = (notifs || []).filter(n => !n.is_read).length

  const connected = hw?.connected
  const gauges = hw?.gauges || {}
  const series = hw?.series || []
  const tb = hw?.track_b || {}
  const trigger = tb.trigger || {}
  const banner = tb.banner
  const events = tb.events || []
  const draft = cfg || trigger

  // Schematic auto-fault: map the active Track B trigger to a single culprit.
  const tbKind = banner?.active ? events[0]?.kind : null
  const detectedFaults = tbKind === 'air_pump' ? ['pump'] : tbKind === 'tank_leak' ? ['tank'] : []

  async function saveCfg() {
    setBusy(true)
    try {
      await setTriggerConfig({
        delta_kpa: Number(draft.delta_kpa), window_s: Number(draft.window_s),
        scenario: draft.scenario, enabled: draft.enabled,
      })
      setCfg(null)
    } catch (e) { /* ignore */ } finally { setBusy(false) }
  }
  async function dismissBanner() { try { await clearHardwareBanner() } catch (e) { /* ignore */ } }

  return (
    <div style={{ minHeight: '100vh', background: '#1B2027', color: '#DFD0B8' }}>
      <Topbar unreadCount={unreadCount} />
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '16px 12px 60px' : '24px 16px 80px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Header + connection state */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: '-.02em' }}>Hardware · ESP32 Prototype</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#948979' }}>Live bench rig — two pressure sensors streaming at 1&nbsp;Hz.</p>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999,
            background: connected ? 'rgba(123,138,67,.14)' : 'rgba(203,91,60,.16)',
            border: `1px solid ${connected ? 'rgba(123,138,67,.4)' : 'rgba(203,91,60,.45)'}`,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: connected ? '#AEBC74' : '#CB5B3C', animation: connected ? 'scblink 1.4s infinite' : 'none' }} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.12em', color: connected ? '#C6D196' : '#E0987F' }}>
              {connected ? 'LIVE — DEVICE CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>
        </div>

        {/* Disconnect fallback note */}
        {!connected && (
          <div style={{ ...PANEL, gap: 6, borderColor: 'rgba(217,169,74,.4)', background: 'rgba(217,169,74,.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <MS name="cloud_off" color="#E4C281" />
              <strong style={{ fontSize: 13, color: '#E4C281' }}>No hardware signal</strong>
            </div>
            <span style={{ fontSize: 12.5, color: '#a59c8c' }}>
              The system has fallen back to validated dataset replay — the demo continues on the main Dashboard.
            </span>
          </div>
        )}

        {/* Track B banner — physical trigger fired */}
        {banner?.active && (
          <div style={{ ...PANEL, gap: 8, borderColor: 'rgba(203,91,60,.5)', background: 'rgba(203,91,60,.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ display: 'flex', gap: 10 }}>
                <MS name="warning" color="#E0987F" size={20} />
                <div>
                  <strong style={{ fontSize: 14, color: '#E0987F' }}>{banner.title}</strong>
                  <div style={{ fontSize: 12.5, color: '#a59c8c', marginTop: 3 }}>{banner.detail}</div>
                  <Link to="/dashboard" style={{ fontSize: 12, color: '#E4C281', fontWeight: 600 }}>View validated diagnostic on Dashboard →</Link>
                </div>
              </div>
              <button onClick={dismissBanner} style={{ background: 'transparent', border: 'none', color: '#948979', cursor: 'pointer' }}><MS name="close" /></button>
            </div>
          </div>
        )}

        {/* GAUGES — two live + broken middle */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 14 }}>
          <Gauge g={gauges.TP2 || { label: 'TP2 · After Pump', unit: 'kPa', online: false }} series={series} kind="after_pump" />
          <Gauge g={gauges.TP3 || { label: 'TP3 · After Filter (P-Sensor 2)', unit: 'kPa', online: false, fault: 'sensor offline' }} series={series} kind="after_filter" />
          <Gauge g={gauges.Reservoirs || { label: 'Reservoirs · Tank', unit: 'kPa', online: false }} series={series} kind="tank" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>

          {/* TRACK B — physical trigger + manual injection */}
          <div style={{ ...PANEL }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={LABEL}>Track B · Physical Trigger</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', padding: '4px 9px', borderRadius: 999, background: trigger.enabled ? 'rgba(123,138,67,.14)' : 'rgba(148,137,121,.14)', color: trigger.enabled ? '#C6D196' : '#a59c8c', border: `1px solid ${trigger.enabled ? 'rgba(123,138,67,.4)' : 'rgba(148,137,121,.3)'}` }}>
                {trigger.enabled ? 'ARMED' : 'OFF'}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#948979' }}>
              Primary path. A live pressure drop loads the validated <strong style={{ color: '#DFD0B8' }}>{trigger.scenario}</strong> scenario
              and renders the full diagnostic on real data.
            </p>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11.5, color: '#a59c8c', display: 'flex', flexDirection: 'column', gap: 4 }}>
                Drop ≥ (kPa)
                <input type="number" value={draft.delta_kpa ?? ''} onChange={e => setCfg({ ...draft, delta_kpa: e.target.value })}
                  style={inputStyle} />
              </label>
              <label style={{ fontSize: 11.5, color: '#a59c8c', display: 'flex', flexDirection: 'column', gap: 4 }}>
                Within (s)
                <input type="number" value={draft.window_s ?? ''} onChange={e => setCfg({ ...draft, window_s: e.target.value })}
                  style={inputStyle} />
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11.5, color: '#a59c8c' }}>Scenario</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['F3', 'F4'].map(s => (
                    <button key={s} onClick={() => setCfg({ ...draft, scenario: s })} style={{
                      padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      border: `1px solid ${draft.scenario === s ? '#DFD0B8' : '#3a414c'}`,
                      background: draft.scenario === s ? '#DFD0B8' : 'transparent',
                      color: draft.scenario === s ? '#1B2027' : '#948979',
                    }}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
            {cfg && (
              <button onClick={saveCfg} disabled={busy} style={{ alignSelf: 'flex-start', padding: '8px 16px', borderRadius: 8, border: '1px solid #7b8a43', background: 'rgba(123,138,67,.18)', color: '#C6D196', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                Save trigger config
              </button>
            )}

            <div style={{ borderTop: '1px solid #2f3742', paddingTop: 12 }}>
              <span style={{ ...LABEL, fontSize: 10 }}>Recent hardware events</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, maxHeight: 140, overflowY: 'auto' }}>
                {events.length === 0 && <span style={{ fontSize: 12, color: '#6f6a60' }}>No physical triggers yet.</span>}
                {events.map((e, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#a59c8c', display: 'flex', gap: 8 }}>
                    <MS name="bolt" size={14} color="#E0987F" />
                    <span><strong style={{ color: '#E0987F' }}>{e.channel}</strong> −{e.drop_kpa} kPa → {e.loaded_scenario}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* TRACK A — pipeline demo (NOT a detection) */}
          <div style={{ ...PANEL }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={LABEL}>Track A · Pipeline Check</span>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', padding: '4px 9px', borderRadius: 999, background: 'rgba(148,137,121,.16)', color: '#cabfa6', border: '1px solid rgba(148,137,121,.35)' }}>
                NOT A DETECTION
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#948979' }}>
              Live hardware data flows through the same pipeline used for training — preprocessing → windowing →
              scaling → feature engineering → model forward pass. Values are raw kPa (not bar), so scores
              are not meaningful. This proves the pipeline mechanics work end-to-end.
            </p>
            <div style={{ display: 'flex', gap: 18, fontSize: 12.5 }}>
              <div><span style={{ color: '#6f6a60' }}>Status</span><br /><strong style={{ color: pipe?.pipeline_status === 'OK' ? '#C6D196' : pipe?.pipeline_status === 'PARTIAL' ? '#E4C281' : '#7c756a' }}>{pipe?.pipeline_status || '—'}</strong></div>
              <div><span style={{ color: '#6f6a60' }}>1 Hz samples</span><br /><strong>{pipe?.raw_hz_samples ?? '—'}</strong></div>
              <div><span style={{ color: '#6f6a60' }}>10 s grid rows</span><br /><strong>{pipe?.grid_10s_rows ?? '—'} / 60 needed</strong></div>
            </div>

            {/* Pipeline stages */}
            <div style={{ background: '#1e242d', border: '1px solid #2f3742', borderRadius: 10, padding: '10px 12px' }}>
              <span style={{ ...LABEL, fontSize: 10 }}>Pipeline stages (same code path as live inference)</span>
              <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {Object.entries(pipe?.stages || {}).map(([key, s]) => {
                  const ok = String(s.status).startsWith('OK')
                  const warming = String(s.status).startsWith('WARMING') || String(s.status).startsWith('PENDING')
                  const color = ok ? '#C6D196' : warming ? '#E4C281' : '#a06060'
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11.5 }}>
                      <span style={{ color, fontWeight: 700, flexShrink: 0, width: 10 }}>{ok ? '✓' : warming ? '◷' : '✗'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ color: ok ? '#c8c0b4' : '#7c756a', fontFamily: 'monospace' }}>{s.name}</span>
                        {s.input_shape && s.output_shape &&
                          <span style={{ color: '#5a6070', marginLeft: 8 }}>
                            [{s.input_shape.join('×')}] → [{s.output_shape.join('×')}]
                          </span>
                        }
                        {s.raw_score !== undefined &&
                          <span style={{ color: '#5a6070', marginLeft: 8 }}>score={s.raw_score.toFixed(4)}</span>
                        }
                        {!ok && <div style={{ color: '#7c756a', fontSize: 10.5, marginTop: 1 }}>{s.status}</div>}
                        {s.note && ok && <div style={{ color: '#5a6070', fontSize: 10, marginTop: 1, fontStyle: 'italic' }}>{s.note}</div>}
                      </div>
                    </div>
                  )
                })}
                {(!pipe?.stages || Object.keys(pipe.stages).length === 0) &&
                  <span style={{ fontSize: 12, color: '#6f6a60' }}>Waiting for samples…</span>}
              </div>
            </div>

            {/* Feature vector */}
            <div style={{ background: '#1e242d', border: '1px solid #2f3742', borderRadius: 10, padding: '10px 12px', maxHeight: 150, overflowY: 'auto' }}>
              <span style={{ ...LABEL, fontSize: 10 }}>Preprocessed feature vector (latest 10 s row — stage 1 output)</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 14px', marginTop: 8, fontSize: 11.5, fontFamily: 'monospace' }}>
                {Object.entries(pipe?.feature_vector || {}).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', color: (k === 'TP2' || k === 'Reservoirs') ? '#C6D196' : '#7c756a' }}>
                    <span>{k}</span><span>{Number(v).toFixed(3)}</span>
                  </div>
                ))}
                {!pipe?.feature_vector || Object.keys(pipe.feature_vector).length === 0
                  ? <span style={{ fontSize: 12, color: '#6f6a60' }}>Waiting for samples…</span> : null}
              </div>
            </div>
          </div>
        </div>

        {/* SYSTEM SIGNATURE — live schematic, auto-fault from the physical trigger */}
        <SystemSchematic
          connected={connected}
          gauges={gauges}
          detectedFaults={detectedFaults}
          scenario={banner?.scenario}
        />
      </div>
    </div>
  )
}

const inputStyle = {
  width: 80, padding: '8px 10px', borderRadius: 8, border: '1px solid #3a414c',
  background: '#1e242d', color: '#DFD0B8', fontSize: 13,
}
