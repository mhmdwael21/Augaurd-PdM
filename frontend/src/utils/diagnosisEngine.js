const RULES = [
  {
    trigger: pf => pf.includes('DV_pressure'),
    title: 'Pneumatic circuit anomaly',
    description:
      'DV_pressure deviation indicates abnormal flow in the pneumatic circuit, consistent with an air leak or valve malfunction upstream of the compressor.',
    factors: [
      'Air leak in pneumatic lines or fittings',
      'Solenoid valve partial blockage or failure',
      'Pressure regulator malfunction',
      'Damaged seals or O-rings in circuit',
    ],
  },
  {
    trigger: pf => pf.includes('TP2'),
    title: 'Compressor output pressure deviation',
    description:
      'TP2 abnormality indicates irregular compressor output pressure, suggesting reduced compression efficiency or a downstream obstruction.',
    factors: [
      'Worn compressor valves reducing compression ratio',
      'Air filter blockage increasing intake resistance',
      'Downstream pressure relief valve fault',
      'Compressor piston ring wear',
    ],
  },
  {
    trigger: pf => pf.includes('Oil_temperature'),
    title: 'Thermal anomaly detected',
    description:
      'Oil temperature deviation indicates abnormal heat generation in the lubrication or mechanical subsystem.',
    factors: [
      'Insufficient oil flow or low oil level',
      'Oil cooler fouling or blockage',
      'Excessive friction in compressor bearings',
      'Cooling fan malfunction',
    ],
  },
  {
    trigger: pf => pf.includes('Towers') || pf.includes('COMP') || pf.includes('DV_eletric'),
    title: 'Digital subsystem anomaly',
    description:
      'Abnormal state in switching or control components suggests an electrical or control system fault.',
    factors: [
      'Cooling tower fan failure',
      'Control relay or contactor fault',
      'Electrical actuator malfunction',
      'Wiring or connector intermittent fault',
    ],
  },
  {
    trigger: pf => /degradation/i.test(pf),
    title: 'Progressive degradation pattern',
    description:
      'Anomaly score is trending upward without a discrete fault signature, indicating gradual mechanical wear or a developing fault.',
    factors: [
      'General mechanical wear across multiple components',
      'Gradual seal degradation',
      'Progressive fouling of filters or heat exchangers',
      'Developing bearing wear',
    ],
  },
]

/**
 * Returns 0–3 matched diagnosis rules for the given predicted_failure string.
 */
export function getDiagnosis(predictedFailure) {
  if (!predictedFailure) return []
  return RULES.filter(r => r.trigger(predictedFailure))
    .slice(0, 3)
    .map(({ title, description, factors }) => ({ title, description, factors }))
}

function fmtDiff(ms) {
  const totalMin = Math.floor(Math.abs(ms) / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${m}m`
}

/**
 * Returns display strings for the three resolution timeline fields.
 * acknowledged_at / resolved_at may be absent — falls back to status-aware labels.
 */
export function getResolutionMetrics({ timestamp, acknowledged_at, resolved_at, status }) {
  const start = new Date(timestamp).getTime()

  let timeToAck
  if (acknowledged_at) {
    timeToAck = fmtDiff(new Date(acknowledged_at).getTime() - start)
  } else if (status === 'acknowledged' || status === 'resolved') {
    timeToAck = 'Acknowledged (time not tracked)'
  } else {
    timeToAck = 'Pending'
  }

  let timeToResolve
  if (resolved_at) {
    timeToResolve = fmtDiff(new Date(resolved_at).getTime() - start)
  } else if (status === 'resolved') {
    timeToResolve = 'Resolved (duration not tracked)'
  } else {
    timeToResolve = 'Pending'
  }

  let totalDuration
  if (resolved_at) {
    totalDuration = fmtDiff(new Date(resolved_at).getTime() - start)
  } else if (status === 'resolved') {
    totalDuration = 'Resolved (duration not tracked)'
  } else {
    totalDuration = fmtDiff(Date.now() - start) + ' (ongoing)'
  }

  return { timeToAck, timeToResolve, totalDuration }
}
