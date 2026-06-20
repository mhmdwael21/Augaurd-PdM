import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { getDashboard, getAlerts, getNotifications, controlReplay } from '../api'
import Topbar from '../components/Topbar'
import AnomalyChart from '../components/AnomalyChart'
import Toast from '../components/Toast'
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

function clamp(v, a, b) { return v < a ? a : v > b ? b : v }
function scoreColor(s) { return s >= 0.65 ? '#CB5B3C' : s >= 0.5 ? '#D9A94A' : '#AEBC74' }
function scoreZone(s) { return s >= 0.65 ? 'rust' : s >= 0.5 ? 'ochre' : 'olive' }

function fmtDate(d) {
  if (!d) return '—'
  const x = new Date(d)
  if (isNaN(x)) return String(d)
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const p2 = n => String(n).padStart(2, '0')
  return `${M[x.getMonth()]} ${x.getDate()}, ${x.getFullYear()} · ${p2(x.getHours())}:${p2(x.getMinutes())}:${p2(x.getSeconds())}`
}

function Sparkline({ buf, color, min, max }) {
  const W = 240, H = 50, n = buf.length
  if (n < 2) return <svg width="100%" height={H} />
  const lo = min ?? Math.min(...buf), hi = max ?? Math.max(...buf)
  const span = hi - lo || 1
  const X = i => (i / (n - 1)) * W
  const Y = v => H - ((clamp(v, lo, hi) - lo) / span) * H
  let line = ''
  buf.forEach((v, i) => { line += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1) + ' ' })
  const area = line + `L ${W} ${H} L 0 ${H} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%" style={{ display: 'block' }}>
      <path d={area} fill={color} fillOpacity={0.13} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={X(n - 1)} cy={Y(buf[n - 1])} r={3} fill={color} stroke="#1B2027" strokeWidth={2} />
    </svg>
  )
}

function SpeedBtn({ label, active, onClick, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '7px 13px', borderRadius: 8, cursor: disabled ? 'default' : 'pointer', fontSize: 12, fontWeight: 600,
      border: `1px solid ${active ? '#DFD0B8' : '#3a414c'}`,
      background: active ? '#DFD0B8' : 'transparent',
      color: active ? '#1B2027' : '#948979', opacity: disabled ? 0.6 : 1,
    }}>{label}</button>
  )
}

const PHASE = {
  NORMAL:  { bg: 'rgba(123,138,67,.14)', col: '#C6D196', bd: 'rgba(123,138,67,.4)' },
  DRIFT:   { bg: 'rgba(201,154,63,.16)', col: '#E4C281', bd: 'rgba(201,154,63,.42)' },
  ANOMALY: { bg: 'rgba(190,80,52,.16)',  col: '#E0987F', bd: 'rgba(190,80,52,.45)' },
  WARMING: { bg: 'rgba(148,137,121,.13)', col: '#a59c8c', bd: 'rgba(148,137,121,.3)' },
}
const SEV = {
  critical: { bg: 'rgba(203,91,60,.18)', col: '#E0987F' },
  high:     { bg: 'rgba(217,169,74,.16)', col: '#E4C281' },
  medium:   { bg: 'rgba(148,137,121,.16)', col: '#cabfa6' },
  low:      { bg: 'rgba(123,138,67,.14)', col: '#C6D196' },
}

const PANEL = { background: '#262C35', border: '1px solid #333b45', borderRadius: 16, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }
const LABEL = { fontSize: 11, letterSpacing: '.2em', color: '#948979' }

export default function Dashboard() {
  const { isMobile } = useResponsive()
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)
  const [liveReplay, setLiveReplay] = useState(null)  // instant feedback before next poll
  const liveTimer = useRef(null)                       // safety net to drop stale optimistic state
  const seenAlerts = useRef(null)

  const [pollMs, setPollMs] = useState(1000)
  const { data: snap } = usePoll(getDashboard, pollMs)
  const { data: alerts } = usePoll(getAlerts, 5000)
  const { data: notifs } = usePoll(getNotifications, 10000)

  const unreadCount = (notifs || []).filter(n => !n.is_read).length

  // toast when a new alert id appears
  useEffect(() => {
    if (!alerts) return
    const ids = new Set(alerts.map(a => a.id))
    if (seenAlerts.current === null) { seenAlerts.current = ids; return }
    const fresh = alerts.find(a => !seenAlerts.current.has(a.id))
    if (fresh) {
      setToast(fresh)
      setTimeout(() => setToast(null), 5200)
    }
    seenAlerts.current = ids
  }, [alerts])

  async function ctrl(body) {
    if (body.speed != null) {
      setPollMs(Math.max(250, Math.round(1000 / body.speed)))
    }
    try {
      setBusy(true)
      const res = await controlReplay(body)
      // Optimistically reflect the returned control fields so the buttons
      // update instantly; cleared once the poll confirms (or after a timeout).
      if (res && (res.scenario !== undefined || res.speed !== undefined || res.playing !== undefined)) {
        setLiveReplay({ playing: res.playing, speed: res.speed, scenario: res.scenario })
        // Safety net: a scenario rebuild can take ~1-2 s, so guarantee the
        // optimistic override is dropped even if the poll never exactly matches.
        if (liveTimer.current) clearTimeout(liveTimer.current)
        liveTimer.current = setTimeout(() => setLiveReplay(null), 2500)
      }
    } catch (e) { /* ignore */ } finally { setBusy(false) }
  }

  // Drop the optimistic override once the live snapshot reports the same
  // control state — from then on the poll is the single source of truth.
  useEffect(() => {
    if (!liveReplay || !snap?.replay) return
    const r = snap.replay
    if (r.playing === liveReplay.playing &&
        r.speed === liveReplay.speed &&
        r.scenario === liveReplay.scenario) {
      if (liveTimer.current) { clearTimeout(liveTimer.current); liveTimer.current = null }
      setLiveReplay(null)
    }
  }, [snap, liveReplay])

  // Base state always comes from the live poll (so cursor/progress never freeze);
  // only the three control fields get the brief optimistic override.
  const base = snap?.replay || { playing: true, speed: 1, scenario: 'F4', cursor: 0, scenario_len: 1 }
  const replay = liveReplay
    ? { ...base, playing: liveReplay.playing, speed: liveReplay.speed, scenario: liveReplay.scenario }
    : base
  const status = snap?.status || 'WARMING'
  const phaseC = PHASE[status] || PHASE.WARMING
  const ready = snap && snap.anomaly

  const score = ready ? snap.anomaly.score : 0
  const history = ready ? snap.anomaly.history : []
  const zone = scoreZone(score)
  const isAnom = status === 'ANOMALY'
  const progress = replay.scenario_len ? clamp((replay.cursor / replay.scenario_len) * 100, 0, 100) : 0

  // classifier badge
  const clf = snap?.classifier
  const verdictMap = {
    NORMAL:  { label: 'NORMAL',  col: '#AEBC74', bg: 'rgba(123,138,67,.14)', bd: 'rgba(123,138,67,.4)' },
    KNOWN:   { label: 'KNOWN',   col: '#E4C281', bg: 'rgba(201,154,63,.16)', bd: 'rgba(201,154,63,.42)' },
    UNKNOWN: { label: 'NOVEL',   col: '#E0987F', bg: 'rgba(190,80,52,.16)',  bd: 'rgba(190,80,52,.45)' },
  }
  const cv = verdictMap[clf?.verdict] || verdictMap.NORMAL

  // The classifier outputs P(matches a KNOWN leak signature). Showing that raw
  // number next to "NOVEL" reads as "the system is unsure" to non-technical
  // viewers — when a low match is exactly WHY it's flagged novel. So for a NOVEL
  // verdict we surface the complement as a NOVELTY score (high = strongly novel);
  // KNOWN/NORMAL keep showing the signature MATCH. Both then reinforce the verdict.
  const clfProb = clf?.confidence
  const clfMetric = clf?.verdict === 'UNKNOWN'
    ? { label: 'NOVELTY', pct: clfProb != null ? Math.round((1 - clfProb) * 100) : null }
    : { label: 'MATCH',   pct: clfProb != null ? Math.round(clfProb * 100) : null }

  // RUL
  const rul = snap?.rul
  const rulCol = !rul?.available ? '#AEBC74' : rul.zone === 'CRITICAL' ? '#CB5B3C' : rul.zone === 'DEGRADATION' ? '#D9A94A' : '#AEBC74'

  // localization
  const loc = snap?.localization
  const per = loc?.available ? (loc.per_sensor || []) : []
  const maxErr = per.length ? Math.max(...per.map(p => p.error)) || 1 : 1

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(1200px 600px at 80% -10%, #232a33 0%, #1B2027 60%)', color: '#DFD0B8' }}>
      <Topbar unreadCount={unreadCount} activePage="Dashboard" />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '16px 14px 36px' : '22px 26px 36px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* CONTROL STRIP */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16, padding: isMobile ? '10px 12px' : '12px 16px', background: '#222831', border: '1px solid #333b45', borderRadius: 14, flexWrap: 'wrap' }}>
          <button onClick={() => ctrl({ playing: !replay.playing })} disabled={busy} style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '9px 16px', borderRadius: 10, border: 'none',
            background: '#DFD0B8', color: '#1B2027', fontWeight: 700, fontSize: 13, cursor: 'pointer', letterSpacing: '.02em',
          }}>
            <MS name={replay.playing ? 'pause' : 'play_arrow'} size={17} color="#1B2027" />
            {replay.playing ? 'PAUSE' : 'PLAY'}
          </button>
          <button onClick={() => ctrl({ reset: true })} disabled={busy} style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 10,
            border: '1px solid #3a414c', background: 'transparent', color: '#948979', fontWeight: 600, fontSize: 12, cursor: 'pointer',
          }}>
            <MS name="refresh" size={15} color="#948979" style={{ marginRight: 2 }} /> RESET
          </button>

          <div style={{ width: 1, height: 26, background: '#333b45' }} />
          <span style={{ fontSize: 10, letterSpacing: '.14em', color: '#7c756a' }}>SPEED</span>
          <div style={{ display: 'flex', gap: 6 }}>
            {[0.5, 1, 2, 4].map(s => <SpeedBtn key={s} label={`${s}×`} active={replay.speed === s} onClick={() => ctrl({ speed: s })} disabled={false} />)}
          </div>

          <div style={{ width: 1, height: 26, background: '#333b45' }} />
          <span style={{ fontSize: 10, letterSpacing: '.14em', color: '#7c756a' }}>SCENARIO</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <SpeedBtn label="F3 · KNOWN"    active={replay.scenario === 'F3'} onClick={() => ctrl({ scenario: 'F3' })} disabled={false} />
            <SpeedBtn label="F4 · UNKNOWN"  active={replay.scenario === 'F4'} onClick={() => ctrl({ scenario: 'F4' })} disabled={false} />
          </div>

          <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10.5, fontWeight: 600, letterSpacing: '.16em', padding: '3px 9px', borderRadius: 6, background: phaseC.bg, color: phaseC.col }}>{status}</span>
              <span style={{ fontSize: 11, color: '#948979' }}>{fmtDate(snap?.timestamp)}</span>
            </div>
            <div style={{ height: 6, borderRadius: 999, background: '#1B2027', overflow: 'hidden', border: '1px solid #2c333d' }}>
              <div style={{ height: '100%', borderRadius: 999, width: `${progress}%`, background: scoreColor(score), transition: 'width .3s linear' }} />
            </div>
          </div>
        </div>

        {/* MAIN GRID */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16, alignItems: 'stretch' }}>
          {/* LEFT */}
          <div style={{ flex: 1.9, display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
            {/* ANOMALY */}
            <div style={{ ...PANEL, padding: '20px 22px', gap: 16, ...(isAnom ? { boxShadow: '0 0 0 1px rgba(190,80,52,.25), 0 14px 40px rgba(190,80,52,.12)' } : {}) }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={LABEL}>ISOLATION FOREST · ANOMALY DETECTION</span>
                <span style={{ fontSize: 12.5, color: '#6f6a60' }}>Primary detector · 99.5% failure recall · ROC-AUC 0.957</span>
              </div>
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 22, alignItems: 'stretch' }}>
                <div style={{ flex: isMobile ? 'unset' : '0 0 220px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, padding: 18, borderRadius: 14, background: phaseC.bg, border: `1px solid ${phaseC.bd}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 11, height: 11, borderRadius: '50%', background: phaseC.col, boxShadow: `0 0 10px ${phaseC.col}` }} />
                    <span style={{ fontSize: 11, letterSpacing: '.18em', color: '#948979' }}>STATUS</span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 38, lineHeight: .95, letterSpacing: '-.02em', color: phaseC.col }}>{status}</div>
                  <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 34, color: scoreColor(score) }}>{ready ? score.toFixed(2) : '—'}</span>
                    <span style={{ fontSize: 12, color: '#7c756a' }}>/ thr 0.65</span>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'flex-end' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6f6a60', letterSpacing: '.1em' }}>
                    <span>ANOMALY SCORE</span><span>1.0</span>
                  </div>
                  <div style={{ flex: 1, minHeight: 150 }}>
                    <AnomalyChart buf={history} zone={zone} threshold={0.65} big />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6f6a60' }}>
                    <span>history</span><span style={{ color: '#CB5B3C' }}>— — threshold 0.65</span><span>now</span>
                  </div>
                </div>
              </div>
            </div>

            {/* SENSORS */}
            <div style={{ ...PANEL }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={LABEL}>LIVE SENSORS · HEADLINE CHANNELS</span>
                <span style={{ fontSize: 10.5, color: '#6f6a60' }}>15 channels · 7 analog / 8 digital</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                {(ready ? snap.sensors.headline : []).map(s => (
                  <div key={s.key} style={{ background: '#222831', border: '1px solid #2f3742', borderRadius: 12, padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#cabfa6' }}>{s.label}</span>
                      <span style={{ fontSize: 11, color: '#7c756a' }}>{s.unit}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 24, color: '#DFD0B8' }}>{Number(s.value).toFixed(2)}</span>
                    </div>
                    <div style={{ height: 50 }}><Sparkline buf={s.history} color={phaseC.col} min={s.min} max={s.max} /></div>
                  </div>
                ))}
                {!ready && <div style={{ gridColumn: '1 / -1', padding: 24, textAlign: 'center', color: '#6f6a60', fontSize: 13 }}>warming up…</div>}
              </div>
            </div>
          </div>

          {/* RIGHT RAIL */}
          <div style={{ flex: isMobile ? 'unset' : '0 0 340px', width: isMobile ? '100%' : 340, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* CLASSIFIER — compact badge (demoted) */}
            <div style={{ ...PANEL, gap: 12 }}>
              <span style={LABEL}>XGBOOST · SIGNATURE CHECK</span>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: 11, background: cv.bg, border: `1px solid ${cv.bd}` }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 10, letterSpacing: '.16em', color: '#948979' }}>VERDICT</span>
                  <span style={{ fontWeight: 800, fontSize: 22, color: cv.col }}>{cv.label}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 10, letterSpacing: '.12em', color: '#948979' }}>{clfMetric.label}</span>
                  <div style={{ fontWeight: 700, fontSize: 20, color: cv.col }}>
                    {clfMetric.pct != null ? `${clfMetric.pct}%` : '—'}
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 10.5, color: '#6f6a60', lineHeight: 1.4 }}>
                {clf?.verdict === 'UNKNOWN'
                  ? `Below ${clf.gate?.toFixed?.(2) ?? '0.60'} gate → novel; the Isolation Forest is the detector.`
                  : clf?.verdict === 'KNOWN'
                  ? 'Matches a learned leak signature.'
                  : 'No failure signature.'}
              </span>
            </div>

            {/* RUL */}
            <div style={{ ...PANEL, gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={LABEL}>REMAINING USEFUL LIFE</span>
                <span style={{ fontSize: 10, letterSpacing: '.1em', padding: '3px 9px', borderRadius: 6, background: rul?.available ? PHASE[rul.zone === 'CRITICAL' ? 'ANOMALY' : rul.zone === 'DEGRADATION' ? 'DRIFT' : 'NORMAL'].bg : 'rgba(123,138,67,.14)', color: rulCol }}>
                  {rul?.available ? rul.zone : 'NOMINAL'}
                </span>
              </div>
              {rul?.available ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 42, color: rulCol }}>{Math.round(rul.hours)}</span>
                    <span style={{ fontSize: 15, color: '#7c756a' }}>hours</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6f6a60' }}>LightGBM · MAE ±21.6h</span>
                  </div>
                  <div style={{ height: 9, borderRadius: 999, background: '#1B2027', overflow: 'hidden', border: '1px solid #2c333d' }}>
                    <div style={{ height: '100%', borderRadius: 999, width: `${clamp(rul.hours / 72 * 100, 2, 100)}%`, background: rulCol, transition: 'width .3s ease' }} />
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontWeight: 700, fontSize: 30, color: '#AEBC74' }}>NOMINAL</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6f6a60' }}>est. only in degradation</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* FAULT LOCALIZATION — PRIMARY DIAGNOSTIC (promoted) */}
        <div style={{ ...PANEL, ...(loc?.available ? { border: '1px solid rgba(190,80,52,.45)' } : {}) }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={LABEL}>FAULT LOCALIZATION · LSTM-AE · PER-SENSOR RECONSTRUCTION ERROR</span>
            {loc?.available && <span style={{ fontWeight: 700, fontSize: 16, color: '#E0987F' }}>{loc.fault_type}</span>}
          </div>
          {loc?.available ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px 28px' }}>
                {per.map(p => {
                  const top = p.rank <= 3
                  return (
                    <div key={p.sensor} style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: top ? 1 : 0.6 }}>
                      <span style={{ fontSize: 11.5, fontWeight: top ? 700 : 500, color: top ? '#DFD0B8' : '#a59c8c', width: 116 }}>
                        {top && <span style={{ color: '#E0987F', marginRight: 4 }}>#{p.rank}</span>}{p.sensor}
                      </span>
                      <div style={{ flex: 1, height: 8, borderRadius: 999, background: '#1B2027', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 999, width: `${clamp(p.error / maxErr * 100, 1, 100)}%`, background: top ? 'linear-gradient(90deg,#CB5B3C,#E0987F)' : '#5a6470' }} />
                      </div>
                      <span style={{ fontSize: 10.5, color: '#948979', width: 46, textAlign: 'right' }}>{p.error.toFixed(3)}</span>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 9, padding: '11px 13px', borderRadius: 10, background: 'rgba(190,80,52,.1)', border: '1px solid rgba(190,80,52,.28)' }}>
                <MS name="build" size={16} color="#DFD0B8" />
                <span style={{ fontSize: 12.5, lineHeight: 1.4, color: '#e7d9c0' }}>{loc.action}</span>
              </div>
            </>
          ) : (
            <div style={{ padding: 22, textAlign: 'center', fontSize: 13, color: '#6f6a60' }}>
              No active fault — sensors within the learned envelope. Localization runs once the detector flags an anomaly.
            </div>
          )}
        </div>

        {/* AI ALERTS FEED — real DB alerts (read-only; lifecycle on the Alerts page) */}
        <div style={{ ...PANEL }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={LABEL}>AI-GENERATED ALERTS</span>
            <span style={{ fontSize: 10.5, color: '#6f6a60' }}>auto-fired by auguard-ai · manage on the Alerts page</span>
          </div>
          {(alerts || []).length === 0 ? (
            <div style={{ padding: 26, textAlign: 'center', fontSize: 13, color: '#6f6a60', border: '1px dashed #333b45', borderRadius: 12 }}>
              No alerts. The detector raises one automatically when the anomaly score breaches threshold for 3 consecutive windows.
            </div>
          ) : (alerts || []).slice(0, 6).map(a => {
            const sev = SEV[a.severity] || SEV.medium
            return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', background: '#222831', border: '1px solid #2f3742', borderRadius: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.1em', padding: '5px 10px', borderRadius: 7, background: sev.bg, color: sev.col }}>{a.severity.toUpperCase()}</span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 200, flex: 1 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#DFD0B8' }}>{a.predicted_failure}</span>
                  <span style={{ fontSize: 12, color: '#a59c8c', lineHeight: 1.35 }}>{a.recommended_action}</span>
                  <span style={{ fontSize: 10.5, color: '#7c756a' }}>{a.id.slice(0, 8)} · {fmtDate(a.timestamp)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
                  <span style={{ fontSize: 10, color: '#6f6a60' }}>SCORE</span>
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#E0987F' }}>{a.anomaly_score != null ? Number(a.anomaly_score).toFixed(2) : '—'}</span>
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '.08em', padding: '5px 11px', borderRadius: 999, background: a.status === 'new' ? 'rgba(203,91,60,.18)' : a.status === 'acknowledged' ? 'rgba(217,169,74,.16)' : 'rgba(123,138,67,.14)', color: a.status === 'new' ? '#E0987F' : a.status === 'acknowledged' ? '#E4C281' : '#C6D196' }}>
                  {a.status.toUpperCase()}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {toast && (
        <Toast
          title={
            toast.severity === 'critical' ? 'Critical anomaly detected'
              : toast.severity === 'high' ? 'Anomaly detected'
              : 'Drift detected'
          }
          titleColor={
            toast.severity === 'critical' ? '#C0392B'   // dark red
              : toast.severity === 'high' ? '#E8675A'    // light red
              : toast.severity === 'medium' ? '#E8923C'  // orange
              : '#E8C24A'                                // low — yellow
          }
          sub={toast.predicted_failure}
          time={fmtDate(toast.timestamp)}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  )
}
