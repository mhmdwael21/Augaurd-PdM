/* Hardware schematic — the prototype's "digital signature".
 *
 * Faithful port of hardware/test.html, wired to the LIVE system:
 *   P-SENSOR 1  -> TP2 (after_pump)   live needle
 *   P-SENSOR 2  -> TP3 (after_filter) BROKEN — OFFLINE, never a number
 *   P-SENSOR 3  -> Reservoirs (tank)  live needle
 *
 * Faults are NOT manual here — they come from the Track B physical trigger:
 *   air_pump  -> AIR PUMP highlighted
 *   tank_leak -> TANK highlighted
 * `detectedFaults` is the list of culprit component ids (driven by the active
 * Track B banner); when one is present the validated `scenario` (F3/F4) loaded.
 */

const NORMAL = { stroke: '#AEBC74', fill: '#2a3140', filt: 'fn', stat: '#C6D196', dot: '#AEBC74' }
const CRIT = { stroke: '#CB5B3C', fill: 'rgba(60,28,24,.9)', filt: 'fc', stat: '#E0987F', dot: '#CB5B3C' }
const FONT = 'Satoshi, system-ui, sans-serif'

const NAMES = { pump: 'Air Pump', tank: 'Tank', valve_in: 'Valve In', valve_out: 'Valve Out', filter: 'Filter' }

function needle(cx, cy, r, v) {
  if (v == null) return { x2: cx, y2: cy - r }   // parked, straight up
  const pct = Math.min(Math.max(v / 40, 0), 1)
  const a = (pct * 200 - 100) * (Math.PI / 180)
  return { x2: +(cx + Math.sin(a) * r).toFixed(1), y2: +(cy - Math.cos(a) * r).toFixed(1) }
}

export default function SystemSchematic({ connected, gauges = {}, detectedFaults = [], scenario }) {
  const faulted = id => detectedFaults.includes(id)

  const sPump = faulted('pump') ? CRIT : NORMAL
  const sTank = faulted('tank') ? CRIT : NORMAL

  // live sensor values
  const tp2 = connected ? gauges?.TP2?.value : null            // P-SENSOR 1
  const res = connected ? gauges?.Reservoirs?.value : null      // P-SENSOR 3
  const n1 = needle(660, 170, 14, tp2)
  const n3 = needle(216, 45, 17, res)

  const liveColor = connected ? '#AEBC74' : '#5d5850'
  const liveStat = connected ? '#C6D196' : '#a59c8c'
  const liveTxt = connected ? 'LIVE' : 'NO SIGNAL'

  const spinning = connected && !faulted('pump')

  return (
    <div style={{ background: '#1B2027', border: '1px solid #2f3742', borderRadius: 16, overflow: 'hidden', userSelect: 'none' }}>
      {/* topbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 20px', borderBottom: '1px solid #2f3742', background: 'rgba(27,32,39,.96)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#DFD0B8', fontSize: 11.5, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase' }}>APU Compressor</span>
          <span style={{ width: 1, height: 16, background: '#2f3742' }} />
          <span style={{ color: '#948979', fontSize: 10, fontWeight: 500 }}>System Signature · live sensors, physical-trigger faults</span>
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: liveStat, background: connected ? 'rgba(123,138,67,.13)' : 'rgba(203,91,60,.13)', border: `1px solid ${connected ? 'rgba(123,138,67,.3)' : 'rgba(203,91,60,.3)'}`, borderRadius: 6, padding: '3px 9px' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#AEBC74' : '#CB5B3C', animation: connected ? 'scblink 1.5s infinite' : 'none' }} />
          {connected ? 'LIVE' : 'OFFLINE'}
        </span>
      </div>

      <svg viewBox="0 0 900 340" style={{ display: 'block', width: '100%' }}>
        <defs>
          <filter id="fn" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="fc" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="9" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M1 1L9 5L1 9" fill="none" stroke="context-stroke" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </marker>
        </defs>

        {/* board plate */}
        <rect x="18" y="110" width="864" height="120" rx="14" fill="#222831" stroke="#2f3742" strokeWidth="1" />
        <circle cx="36" cy="128" r="5" fill="#1e242d" stroke="#333b45" strokeWidth="1" />
        <circle cx="864" cy="128" r="5" fill="#1e242d" stroke="#333b45" strokeWidth="1" />
        <circle cx="36" cy="212" r="5" fill="#1e242d" stroke="#333b45" strokeWidth="1" />
        <circle cx="864" cy="212" r="5" fill="#1e242d" stroke="#333b45" strokeWidth="1" />

        {/* pipes (neutral — single-culprit highlighting is on the component node) */}
        <line x1="786" y1="170" x2="748" y2="170" stroke="#2f3742" strokeWidth="7" strokeLinecap="round" />
        <line x1="716" y1="170" x2="676" y2="170" stroke="#2f3742" strokeWidth="7" strokeLinecap="round" />
        <line x1="644" y1="170" x2="594" y2="170" stroke="#2f3742" strokeWidth="7" strokeLinecap="round" />
        <line x1="534" y1="170" x2="494" y2="170" stroke="#2f3742" strokeWidth="7" strokeLinecap="round" />
        <line x1="462" y1="170" x2="422" y2="170" stroke="#2f3742" strokeWidth="7" strokeLinecap="round" />
        <line x1="390" y1="170" x2="300" y2="170" stroke="#2f3742" strokeWidth="7" strokeLinecap="round" />
        <line x1="216" y1="110" x2="216" y2="62" stroke="#2f3742" strokeWidth="5" strokeLinecap="round" />
        <line x1="136" y1="170" x2="108" y2="170" stroke="#2f3742" strokeWidth="7" strokeLinecap="round" />
        <line x1="76" y1="170" x2="46" y2="170" stroke="#2f3742" strokeWidth="7" strokeLinecap="round" markerEnd="url(#arr)" />
        <text x="860" y="162" textAnchor="end" fontSize="9" fill="#4a5360" fontFamily={FONT}>AIR IN</text>
        <text x="30" y="162" textAnchor="start" fontSize="9" fill="#4a5360" fontFamily={FONT}>OUT</text>

        {/* 1 · AIR PUMP */}
        <g>
          <rect x="790" y="128" width="80" height="84" rx="11" fill={sPump.fill} stroke={sPump.stroke} strokeWidth={faulted('pump') ? 2.5 : 1.5} filter={`url(#${sPump.filt})`} />
          <circle cx="830" cy="165" r="22" fill="#1e242d" stroke="#393E46" strokeWidth="1" />
          <g>
            {[['830', '143', '830', '155'], ['830', '175', '830', '187'], ['808', '165', '820', '165'], ['840', '165', '852', '165'],
              ['814', '149', '822', '157'], ['838', '173', '846', '181'], ['846', '149', '838', '157'], ['822', '173', '814', '181']].map((c, i) => (
              <line key={i} x1={c[0]} y1={c[1]} x2={c[2]} y2={c[3]} stroke={sPump.dot} strokeWidth={i < 4 ? 1.5 : 1.2} strokeLinecap="round" />
            ))}
            {spinning && (
              <animateTransform attributeName="transform" type="rotate"
                from="0 830 165" to="360 830 165" dur="1.6s" repeatCount="indefinite" />
            )}
          </g>
          <circle cx="830" cy="165" r="5" fill={sPump.dot} filter={`url(#${sPump.filt})`} />
          <text x="830" y="97" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#DFD0B8" fontFamily={FONT}>AIR PUMP</text>
          <text x="830" y="228" textAnchor="middle" fontSize="8.5" fontWeight="600" fill={sPump.stat} fontFamily={FONT} letterSpacing=".05em">{faulted('pump') ? 'FAULT' : 'NORMAL'}</text>
        </g>

        {/* 2 · VALVE 1 */}
        <g>
          <polygon points="732,152 748,170 732,188 716,170" fill="#2a3140" stroke="#AEBC74" strokeWidth="1.5" />
          <line x1="724" y1="170" x2="740" y2="170" stroke="#AEBC74" strokeWidth="1" opacity=".5" />
          <line x1="732" y1="162" x2="732" y2="178" stroke="#AEBC74" strokeWidth="1" opacity=".5" />
          <text x="732" y="97" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#DFD0B8" fontFamily={FONT}>VALVE 1</text>
          <text x="732" y="228" textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#C6D196" fontFamily={FONT} letterSpacing=".05em">NORMAL</text>
        </g>

        {/* 3 · P-SENSOR 1 -> TP2 (after_pump) LIVE */}
        <g>
          <circle cx="660" cy="170" r="28" fill="#2a3140" stroke={liveColor} strokeWidth="1.5" />
          <circle cx="660" cy="170" r="18" fill="#1e242d" stroke="#333b45" strokeWidth="1" />
          <line x1="660" y1="153" x2="660" y2="157" stroke="#4a5360" strokeWidth="1" />
          <line x1="673" y1="157" x2="670" y2="160" stroke="#4a5360" strokeWidth="1" />
          <line x1="647" y1="157" x2="650" y2="160" stroke="#4a5360" strokeWidth="1" />
          <line x1="677" y1="170" x2="673" y2="170" stroke="#4a5360" strokeWidth="1" />
          <line x1="647" y1="170" x2="643" y2="170" stroke="#4a5360" strokeWidth="1" />
          <line x1="660" y1="170" x2={n1.x2} y2={n1.y2} stroke={liveColor} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="660" cy="170" r="3" fill={liveColor} />
          <text x="660" y="97" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#DFD0B8" fontFamily={FONT}>P-SENSOR 1</text>
          <text x="660" y="210" textAnchor="middle" fontSize="8" fill="#948979" fontFamily={FONT}>{tp2 == null ? '-- kPa' : tp2.toFixed(1) + ' kPa'}</text>
          <text x="660" y="228" textAnchor="middle" fontSize="8.5" fontWeight="600" fill={liveStat} fontFamily={FONT} letterSpacing=".05em">{liveTxt}</text>
        </g>

        {/* 4 · AIR FILTER */}
        <g>
          <rect x="534" y="132" width="60" height="76" rx="10" fill="#2a3140" stroke="#AEBC74" strokeWidth="1.5" />
          {[148, 157, 166, 175, 184].map(y => (
            <line key={y} x1="544" y1={y} x2="584" y2={y} stroke="#393E46" strokeWidth="2" strokeLinecap="round" />
          ))}
          <text x="564" y="97" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#DFD0B8" fontFamily={FONT}>AIR FILTER</text>
          <text x="564" y="228" textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#C6D196" fontFamily={FONT} letterSpacing=".05em">NORMAL</text>
        </g>

        {/* 5 · VALVE 2 */}
        <g>
          <polygon points="478,152 494,170 478,188 462,170" fill="#2a3140" stroke="#AEBC74" strokeWidth="1.5" />
          <line x1="470" y1="170" x2="486" y2="170" stroke="#AEBC74" strokeWidth="1" opacity=".5" />
          <line x1="478" y1="162" x2="478" y2="178" stroke="#AEBC74" strokeWidth="1" opacity=".5" />
          <text x="478" y="97" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#DFD0B8" fontFamily={FONT}>VALVE 2</text>
          <text x="478" y="228" textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#C6D196" fontFamily={FONT} letterSpacing=".05em">NORMAL</text>
        </g>

        {/* 6 · P-SENSOR 2 -> TP3 (after_filter) BROKEN — OFFLINE, never a number */}
        <g>
          <circle cx="406" cy="170" r="28" fill="#23272e" stroke="#5d5850" strokeWidth="1.5" strokeDasharray="4 3" />
          <circle cx="406" cy="170" r="18" fill="#1a1d22" stroke="#333b45" strokeWidth="1" />
          <line x1="406" y1="170" x2="406" y2="156" stroke="#5d5850" strokeWidth="1.5" strokeLinecap="round" opacity=".5" />
          <circle cx="406" cy="170" r="3" fill="#5d5850" />
          <text x="406" y="97" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#948979" fontFamily={FONT}>P-SENSOR 2</text>
          <text x="406" y="210" textAnchor="middle" fontSize="8" fill="#6f6a60" fontFamily={FONT}>no reading</text>
          <text x="406" y="228" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#E0987F" fontFamily={FONT} letterSpacing=".05em">OFFLINE</text>
        </g>

        {/* 7 · TANK */}
        <g>
          <rect x="136" y="120" width="160" height="100" rx="14" fill={sTank.fill} stroke={sTank.stroke} strokeWidth={faulted('tank') ? 2.5 : 1.5} filter={`url(#${sTank.filt})`} />
          <rect x="138" y="172" width="156" height="46" fill={faulted('tank') ? 'rgba(203,91,60,.14)' : 'rgba(123,138,67,.14)'} />
          <rect x="152" y="136" width="128" height="8" rx="3" fill="#1e242d" />
          <rect x="152" y="150" width="96" height="8" rx="3" fill="#1e242d" />
          <circle cx="216" cy="190" r="9" fill="#1e242d" stroke="#333b45" strokeWidth="1" />
          <circle cx="216" cy="190" r="4" fill={sTank.dot} filter={`url(#${sTank.filt})`} />
          <text x="216" y="97" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#DFD0B8" fontFamily={FONT}>TANK</text>
          <text x="216" y="240" textAnchor="middle" fontSize="8.5" fontWeight="600" fill={sTank.stat} fontFamily={FONT} letterSpacing=".05em">{faulted('tank') ? 'FAULT' : 'NORMAL'}</text>
        </g>

        {/* 8 · P-SENSOR 3 -> Reservoirs (tank) LIVE — on tank riser */}
        <g>
          <rect x="210" y="98" width="12" height="14" rx="3" fill="#1e242d" stroke="#333b45" strokeWidth="1" />
          <circle cx="216" cy="45" r="26" fill="#2a3140" stroke={liveColor} strokeWidth="1.5" />
          <circle cx="216" cy="45" r="17" fill="#1e242d" stroke="#333b45" strokeWidth="1" />
          <line x1="216" y1="28" x2="216" y2="32" stroke="#4a5360" strokeWidth="1" />
          <line x1="229" y1="32" x2="226" y2="35" stroke="#4a5360" strokeWidth="1" />
          <line x1="203" y1="32" x2="206" y2="35" stroke="#4a5360" strokeWidth="1" />
          <line x1="216" y1="45" x2={n3.x2} y2={n3.y2} stroke={liveColor} strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="216" cy="45" r="3" fill={liveColor} />
          <text x="280" y="30" textAnchor="start" fontSize="9.5" fontWeight="700" fill="#DFD0B8" fontFamily={FONT}>P-SENSOR 3</text>
          <line x1="244" y1="45" x2="276" y2="33" stroke="#333b45" strokeWidth="1" strokeDasharray="3 2" />
          <text x="280" y="46" textAnchor="start" fontSize="8" fill="#948979" fontFamily={FONT}>{res == null ? '-- kPa' : res.toFixed(1) + ' kPa'}</text>
          <text x="280" y="60" textAnchor="start" fontSize="8.5" fontWeight="600" fill={liveStat} fontFamily={FONT} letterSpacing=".05em">{liveTxt}</text>
        </g>

        {/* 9 · VALVE 3 */}
        <g>
          <polygon points="92,152 108,170 92,188 76,170" fill="#2a3140" stroke="#AEBC74" strokeWidth="1.5" />
          <line x1="84" y1="170" x2="100" y2="170" stroke="#AEBC74" strokeWidth="1" opacity=".5" />
          <line x1="92" y1="162" x2="92" y2="178" stroke="#AEBC74" strokeWidth="1" opacity=".5" />
          <text x="92" y="97" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#DFD0B8" fontFamily={FONT}>VALVE 3</text>
          <text x="92" y="228" textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#C6D196" fontFamily={FONT} letterSpacing=".05em">NORMAL</text>
        </g>

        {/* board number labels */}
        {[['830', '① AIR PUMP'], ['732', '② VALVE'], ['660', '③ SENSOR'], ['564', '④ FILTER'],
          ['478', '⑤ VALVE'], ['406', '⑥ SENSOR'], ['216', '⑦ TANK'], ['92', '⑨ VALVE']].map(([x, t]) => (
          <text key={x} x={x} y="276" textAnchor="middle" fontSize="8" fill="#4a5360" fontFamily={FONT}>{t}</text>
        ))}
        <text x="216" y="290" textAnchor="middle" fontSize="8" fill="#4a5360" fontFamily={FONT}>⑧ SENSOR (on tank)</text>
      </svg>

      {/* status strip — driven by the Track B physical trigger */}
      <div style={{ borderTop: '1px solid #2f3742', background: '#1e242d', padding: '10px 20px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {!connected ? (
          <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '3px 9px', background: 'rgba(148,137,121,.13)', border: '1px solid rgba(148,137,121,.3)', color: '#a59c8c' }}>● NO HARDWARE SIGNAL — schematic idle</span>
        ) : detectedFaults.length === 0 ? (
          <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '3px 9px', background: 'rgba(123,138,67,.13)', border: '1px solid rgba(123,138,67,.3)', color: '#C6D196' }}>● SYSTEM NORMAL</span>
        ) : (
          detectedFaults.map(id => (
            <span key={id} style={{ fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '3px 9px', background: 'rgba(203,91,60,.15)', border: '1px solid rgba(203,91,60,.44)', color: '#E0987F' }}>
              ⚡ DETECTED: {NAMES[id] || id}{scenario ? ` — validated ${scenario} loaded` : ''}
            </span>
          ))
        )}
        <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 600, letterSpacing: '.07em', color: '#6f6a60' }}>
          PHYSICAL TRIGGER · LIVE SENSORS
        </span>
      </div>
    </div>
  )
}
