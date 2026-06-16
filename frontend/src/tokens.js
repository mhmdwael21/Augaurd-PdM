export const C = {
  // Backgrounds
  bgBase:    '#1B2027',
  bgSurface: '#222831',
  bgElevated:'#2a3140',
  bgSection: '#1e242d',

  // Borders
  borderSubtle:'#2f3742',
  borderStrong:'#333b45',
  borderAccent:'#393E46',

  // Text
  textPrimary:  '#DFD0B8',
  textSecondary:'#a59c8c',
  textMuted:    '#948979',
  textDim:      '#7c756a',
  textFaint:    '#6f6a60',

  // Status Normal
  normalBg:    'rgba(123,138,67,.14)',
  normalBd:    'rgba(123,138,67,.32)',
  normalText:  '#C6D196',
  normalDot:   '#AEBC74',
  normalSolid: '#7b8a43',

  // Status Warn/Drift
  warnBg:    'rgba(217,169,74,.14)',
  warnBd:    'rgba(217,169,74,.40)',
  warnText:  '#E4C281',
  warnSolid: '#D9A94A',

  // Status Critical/Anomaly
  critBg:    'rgba(203,91,60,.16)',
  critBd:    'rgba(203,91,60,.45)',
  critText:  '#E0987F',
  critSolid: '#CB5B3C',

  // Accent
  accentLight: '#DFD0B8',
  accentMid:   '#cabfa6',
  accentWarm:  '#948979',
}

export function scoreColor(score) {
  if (score >= 0.65) return C.critSolid
  if (score >= 0.5)  return C.warnSolid
  return C.normalDot
}

export function scoreZone(score) {
  if (score >= 0.65) return 'rust'
  if (score >= 0.5)  return 'ochre'
  return 'olive'
}

export function severityStyle(sev) {
  const m = {
    critical: { background: 'rgba(203,91,60,.18)', color: '#E0987F', border: '1px solid rgba(203,91,60,.45)' },
    high:     { background: 'rgba(217,169,74,.16)', color: '#E4C281', border: '1px solid rgba(217,169,74,.4)' },
    medium:   { background: 'rgba(148,137,121,.18)', color: '#cabfa6', border: '1px solid rgba(148,137,121,.35)' },
    low:      { background: 'rgba(123,138,67,.14)', color: '#C6D196', border: '1px solid rgba(123,138,67,.4)' },
  }
  return m[sev] || m.medium
}

export function statusStyle(st) {
  const m = {
    new:          { background: 'rgba(203,91,60,.18)', color: '#E0987F', border: '1px solid rgba(203,91,60,.45)' },
    acknowledged: { background: 'rgba(217,169,74,.16)', color: '#E4C281', border: '1px solid rgba(217,169,74,.4)' },
    resolved:     { background: 'rgba(123,138,67,.14)', color: '#C6D196', border: '1px solid rgba(123,138,67,.4)' },
  }
  return m[st] || m.new
}

export function roleStyle(role) {
  const m = {
    admin:      { background: 'rgba(148,137,121,.18)', color: '#DFD0B8', border: '1px solid rgba(148,137,121,.35)' },
    technician: { background: 'rgba(217,169,74,.14)', color: '#E4C281', border: '1px solid rgba(217,169,74,.38)' },
    operator:   { background: 'rgba(123,138,67,.13)', color: '#C6D196', border: '1px solid rgba(123,138,67,.38)' },
  }
  return m[role] || m.operator
}
