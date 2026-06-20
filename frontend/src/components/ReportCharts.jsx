import {
  ComposedChart, LineChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceArea, ReferenceLine,
  PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts'

// ── Shared palette (matches the app design tokens) ───────────────────
const C = {
  olive: '#AEBC74', ochre: '#D9A94A', amber: '#E4C281',
  rust: '#CB5B3C', rustLite: '#E0987F', tan: '#DFD0B8',
  muted: '#948979', grid: '#2f3742', axis: '#6f6a60', blue: '#7BA5C9',
}

const FAULT_COLORS = {
  'Pressure Fault': C.rustLite,
  'Thermal Fault':  C.amber,
  'Flow Fault':     C.olive,
  'Digital Fault':  C.blue,
}

const VERDICT_COLORS = {
  KNOWN:   C.amber,
  UNKNOWN: C.rustLite,
  NORMAL:  C.olive,
}

function fmtClock(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const p2 = x => String(x).padStart(2, '0')
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`
}

// Dark-theme tooltip shared by every chart
const tooltipProps = {
  contentStyle: {
    background: '#161b22', border: '1px solid #333b45',
    borderRadius: 8, fontSize: 12,
  },
  labelStyle: { color: '#6f6a60', fontWeight: 600, marginBottom: 4 },
  itemStyle:  { padding: 0 },
}

const axisProps = { stroke: C.axis, tick: { fill: C.axis, fontSize: 11 } }

// ── 1. Sensor + Anomaly Score overlay (dual Y-axis) ──────────────────
export function SensorOverlayChart({ data, sensorKey, sensorLabel, threshold = 0.65 }) {
  const rows = data
    .filter(e => e[sensorKey] != null)
    .map(e => ({ t: fmtClock(e.timestamp), score: e.anomaly_score, sensor: e[sensorKey] }))

  if (rows.length < 2) return <Empty text="Not enough data for this scenario yet." />

  return (
    <ResponsiveContainer width="100%" height={250}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 5" vertical={false} />
        <XAxis dataKey="t" {...axisProps} minTickGap={48} />
        <YAxis yAxisId="score" domain={[0, 1]} {...axisProps}
               label={{ value: 'Anomaly score', angle: -90, position: 'insideLeft',
                        fill: C.axis, fontSize: 11, dy: 40 }} />
        <YAxis yAxisId="sensor" orientation="right" {...axisProps}
               label={{ value: sensorLabel, angle: 90, position: 'insideRight',
                        fill: C.axis, fontSize: 11 }} />
        <Tooltip {...tooltipProps} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine yAxisId="score" y={threshold} stroke={C.rust}
                       strokeDasharray="6 4" label={{ value: 'threshold', fill: C.rust, fontSize: 10, position: 'right' }} />
        <Line yAxisId="sensor" type="monotone" dataKey="sensor" name={sensorLabel}
              stroke={C.blue} strokeWidth={1.6} dot={false} />
        <Line yAxisId="score" type="monotone" dataKey="score" name="Anomaly score"
              stroke={C.rustLite} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

// ── 2. RUL degradation curve with zone bands ─────────────────────────
export function RulCurveChart({ data, cap = 168 }) {
  const rows = data
    .filter(e => e.rul_hours != null)
    .map(e => ({ t: fmtClock(e.timestamp), rul: e.rul_hours }))

  if (rows.length < 2)
    return <Empty text="No remaining-useful-life data yet — RUL is only computed once the detector flags an anomaly." />

  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 5" vertical={false} />
        {/* Zone bands: CRITICAL <12h, DEGRADATION 12–48h, NOMINAL >48h */}
        <ReferenceArea y1={0}  y2={12}  fill={C.rust}  fillOpacity={0.10} />
        <ReferenceArea y1={12} y2={48}  fill={C.ochre} fillOpacity={0.09} />
        <ReferenceArea y1={48} y2={cap} fill={C.olive} fillOpacity={0.07} />
        <ReferenceLine y={12} stroke={C.rust}  strokeDasharray="4 4"
                       label={{ value: 'Critical', fill: C.rustLite, fontSize: 10, position: 'insideTopLeft' }} />
        <ReferenceLine y={48} stroke={C.ochre} strokeDasharray="4 4"
                       label={{ value: 'Degradation', fill: C.amber, fontSize: 10, position: 'insideTopLeft' }} />
        <XAxis dataKey="t" {...axisProps} minTickGap={48} />
        <YAxis domain={[0, cap]} {...axisProps}
               label={{ value: 'Hours to failure', angle: -90, position: 'insideLeft',
                        fill: C.axis, fontSize: 11, dy: 50 }} />
        <Tooltip {...tooltipProps} formatter={v => [`${Number(v).toFixed(1)} h`, 'RUL']} />
        <Line type="monotone" dataKey="rul" name="RUL (h)"
              stroke={C.amber} strokeWidth={2.2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── 3. Fault localization donut ──────────────────────────────────────
export function FaultDonutChart({ distribution }) {
  const data = Object.entries(distribution || {})
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
  const total = data.reduce((s, d) => s + d.value, 0)

  if (total === 0) return <Empty text="No localized faults recorded yet." />

  return (
    <div style={{ position: 'relative' }}>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name"
               innerRadius={62} outerRadius={92} paddingAngle={2} stroke="none">
            {data.map(d => <Cell key={d.name} fill={FAULT_COLORS[d.name] || C.muted} />)}
          </Pie>
          <Tooltip {...tooltipProps}
                   formatter={(v, n) => [`${v} (${(v / total * 100).toFixed(1)}%)`, n]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      {/* center total */}
      <div style={{
        position: 'absolute', top: '42%', left: 0, right: 0,
        textAlign: 'center', pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: C.tan, lineHeight: 1 }}>{total}</div>
        <div style={{ fontSize: 10, color: C.axis, letterSpacing: '.05em' }}>WINDOWS</div>
      </div>
    </div>
  )
}

// ── 4. Known vs Novel — F3 vs F4 verdict comparison ──────────────────
export function KnownVsNovelChart({ f3, f4 }) {
  const mk = (sc, dist) => ({
    scenario: sc,
    KNOWN:   dist?.KNOWN   || 0,
    UNKNOWN: dist?.UNKNOWN || 0,
    NORMAL:  dist?.NORMAL  || 0,
  })
  const data = [mk('F3 — Known', f3), mk('F4 — Novel', f4)]
  const hasData = data.some(d => d.KNOWN + d.UNKNOWN + d.NORMAL > 0)

  if (!hasData) return <Empty text="No classifier verdicts recorded yet." />

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
        <CartesianGrid stroke={C.grid} strokeDasharray="2 5" vertical={false} />
        <XAxis dataKey="scenario" {...axisProps} />
        <YAxis {...axisProps} label={{ value: 'Windows', angle: -90, position: 'insideLeft',
                                       fill: C.axis, fontSize: 11, dy: 24 }} />
        <Tooltip {...tooltipProps} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="NORMAL"  stackId="v" fill={VERDICT_COLORS.NORMAL}  radius={[0, 0, 0, 0]} />
        <Bar dataKey="KNOWN"   stackId="v" fill={VERDICT_COLORS.KNOWN} />
        <Bar dataKey="UNKNOWN" stackId="v" fill={VERDICT_COLORS.UNKNOWN} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── shared empty state ───────────────────────────────────────────────
function Empty({ text }) {
  return (
    <div style={{
      height: 250, display: 'flex', alignItems: 'center', justifyContent: 'center',
      textAlign: 'center', color: '#4a5260', fontSize: 12.5, padding: '0 32px',
    }}>
      {text}
    </div>
  )
}

export const ANALOG_SENSORS = [
  { key: 'tp2',             label: 'TP2 · Compressor (bar)' },
  { key: 'reservoirs',      label: 'Reservoirs (bar)' },
  { key: 'h1',              label: 'H1 (bar)' },
  { key: 'dv_pressure',     label: 'DV pressure (bar)' },
  { key: 'tp3',             label: 'TP3 (bar)' },
  { key: 'oil_temperature', label: 'Oil temperature (°C)' },
  { key: 'motor_current',   label: 'Motor current (A)' },
]
