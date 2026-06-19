import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { getReportsAlerts, getNotifications } from '../api'
import Topbar from '../components/Topbar'
import { severityStyle, statusStyle } from '../tokens'
import { useResponsive } from '../hooks/useResponsive'
import { getDiagnosis, getResolutionMetrics } from '../utils/diagnosisEngine'

// ── Shared helpers ───────────────────────────────────────────────────

const MS = ({ name, size = 17, color, style: s = {} }) => (
  <span style={{
    fontFamily: "'Material Symbols Outlined'",
    fontVariationSettings: "'FILL' 0, 'wght' 300",
    fontStyle: 'normal', lineHeight: 1,
    display: 'inline-block', verticalAlign: 'middle',
    fontSize: size, color, ...s,
  }}>{name}</span>
)

function fmtDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const p2 = x => String(x).padStart(2, '0')
  return `${M[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

function fmtDateShort(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${M[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

function scoreColor(s) {
  if (s == null) return '#6f6a60'
  if (s >= 0.65) return '#E0987F'
  if (s >= 0.5)  return '#E4C281'
  return '#C6D196'
}

// Deterministic: the decision engine writes "(known signature)" or "(UNKNOWN)" / "Novel " prefix
function detectScenario(pf) {
  if (!pf) return 'Unknown'
  if (pf.includes('(known signature)')) return 'F3'
  if (pf.includes('(UNKNOWN)') || pf.startsWith('Novel ')) return 'F4'
  return 'Unknown'
}

function scenarioStyle(sc) {
  if (sc === 'F3') return { background: 'rgba(217,169,74,.16)', color: '#E4C281', border: '1px solid rgba(217,169,74,.4)' }
  if (sc === 'F4') return { background: 'rgba(203,91,60,.18)', color: '#E0987F', border: '1px solid rgba(203,91,60,.45)' }
  return { background: 'rgba(148,137,121,.18)', color: '#cabfa6', border: '1px solid rgba(148,137,121,.35)' }
}

function Chip({ label, style: s = {} }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 9px', borderRadius: 6,
      fontSize: 11, fontWeight: 600, letterSpacing: '.03em', whiteSpace: 'nowrap',
      ...s,
    }}>{label}</span>
  )
}

function FilterBtn({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 12px', borderRadius: 8,
      border: `1px solid ${active ? '#DFD0B8' : '#333b45'}`,
      background: active ? 'rgba(223,208,184,.12)' : 'transparent',
      color: active ? '#DFD0B8' : '#948979',
      fontWeight: 600, fontSize: 12, cursor: 'pointer', letterSpacing: '.02em',
    }}>{label}</button>
  )
}

// ── Sort helpers ─────────────────────────────────────────────────────

const SEV_ORDER    = { critical: 0, high: 1, medium: 2, low: 3 }
const STATUS_ORDER = { new: 0, acknowledged: 1, resolved: 2 }

function sortRows(rows, field, dir) {
  return [...rows].sort((a, b) => {
    let av, bv
    if (field === 'timestamp') {
      av = new Date(a.timestamp).getTime()
      bv = new Date(b.timestamp).getTime()
    } else if (field === 'severity') {
      av = SEV_ORDER[a.severity] ?? 99
      bv = SEV_ORDER[b.severity] ?? 99
    } else if (field === 'status') {
      av = STATUS_ORDER[a.status] ?? 99
      bv = STATUS_ORDER[b.status] ?? 99
    } else if (field === 'anomaly_score') {
      av = a.anomaly_score ?? -1
      bv = b.anomaly_score ?? -1
    } else {
      av = (a[field] || '').toLowerCase()
      bv = (b[field] || '').toLowerCase()
    }
    if (av < bv) return dir === 'asc' ? -1 : 1
    if (av > bv) return dir === 'asc' ?  1 : -1
    return 0
  })
}

// ── PDF helpers ──────────────────────────────────────────────────────

function buildFilterSummary(fromDate, toDate, sevFilter, statusFilter, scenarioFilter) {
  const parts = []
  if (fromDate || toDate) {
    parts.push(`Date: ${fromDate ? fmtDateShort(fromDate) : 'start'} – ${toDate ? fmtDateShort(toDate) : 'now'}`)
  } else {
    parts.push('Date: All time')
  }
  parts.push(`Severity: ${sevFilter === 'all' ? 'All' : sevFilter}`)
  parts.push(`Status: ${statusFilter === 'all' ? 'All' : statusFilter}`)
  parts.push(`Scenario: ${scenarioFilter === 'all' ? 'All' : scenarioFilter}`)
  return parts.join('   ·   ')
}

function maybeNewPage(doc, y, needed = 18) {
  if (y + needed > 272) {
    doc.addPage()
    return 20
  }
  return y
}

async function exportEpisodePdf(alert, username) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210, mg = 18
  const scenario = detectScenario(alert.predicted_failure)
  const genAt = fmtDate(new Date().toISOString())

  // Header bar
  doc.setFillColor(203, 91, 60)
  doc.rect(0, 0, W, 13, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'bold')
  doc.text('AUGUARD', mg, 8.5)
  doc.setFont('helvetica', 'normal')
  doc.text('Predictive Maintenance System', mg + 23, 8.5)
  doc.text(`Generated: ${genAt}   ·   Exported by: ${username || 'user'}`, W - mg, 8.5, { align: 'right' })

  let y = 23

  // Title
  doc.setTextColor(35, 35, 35)
  doc.setFontSize(15)
  doc.setFont('helvetica', 'bold')
  doc.text('Maintenance Episode Report', mg, y)
  y += 2
  doc.setDrawColor(210, 200, 185)
  doc.setLineWidth(0.35)
  y += 5
  doc.line(mg, y, W - mg, y)
  y += 7

  // Fields
  function row(label, value) {
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(130, 120, 110)
    doc.text(label, mg, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(35, 35, 35)
    doc.text(String(value ?? '—'), mg + 46, y)
    y += 6
  }

  row('Alert ID',      String(alert.id).toUpperCase())
  row('Timestamp',     fmtDate(alert.timestamp))
  row('Scenario',      scenario)
  row('Severity',      alert.severity.toUpperCase())
  row('Status',        alert.status.toUpperCase())
  row('Anomaly Score', alert.anomaly_score != null ? (alert.anomaly_score * 100).toFixed(2) + ' %' : '—')
  row('Assigned To',   alert.assigned_to_username || '(unassigned)')
  row('Filters',       'N/A — single episode export')

  y += 3
  doc.setDrawColor(210, 200, 185)
  doc.line(mg, y, W - mg, y)
  y += 8

  // Predicted failure
  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(35, 35, 35)
  doc.text('Predicted Failure', mg, y)
  y += 5
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  const pfLines = doc.splitTextToSize(alert.predicted_failure || '—', W - mg * 2)
  doc.text(pfLines, mg, y)
  y += pfLines.length * 5 + 7

  doc.setDrawColor(210, 200, 185)
  doc.line(mg, y, W - mg, y)
  y += 8

  // Recommended action
  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'bold')
  doc.text('Recommended Action', mg, y)
  y += 5
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  const raLines = doc.splitTextToSize(alert.recommended_action || '—', W - mg * 2)
  doc.text(raLines, mg, y)
  y += raLines.length * 5 + 4

  // ── Resolution Metrics ────────────────────────────────────────────
  y = maybeNewPage(doc, y, 30)
  doc.setDrawColor(210, 200, 185)
  doc.setLineWidth(0.35)
  doc.line(mg, y, W - mg, y)
  y += 8

  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(35, 35, 35)
  doc.text('Resolution Metrics', mg, y)
  y += 6

  const metrics = getResolutionMetrics(alert)
  ;[
    ['Time to Acknowledge', metrics.timeToAck],
    ['Time to Resolve',     metrics.timeToResolve],
    ['Total Duration',      metrics.totalDuration],
  ].forEach(([label, value]) => {
    y = maybeNewPage(doc, y)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(130, 120, 110)
    doc.text(label, mg, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(35, 35, 35)
    doc.text(String(value), mg + 46, y)
    y += 6
  })

  // ── Root Cause Analysis ───────────────────────────────────────────
  const rules = getDiagnosis(alert.predicted_failure)
  if (rules.length > 0) {
    y += 2
    y = maybeNewPage(doc, y, 28)
    doc.setDrawColor(210, 200, 185)
    doc.line(mg, y, W - mg, y)
    y += 8

    doc.setFontSize(9.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(35, 35, 35)
    doc.text('Root Cause Analysis', mg, y)
    y += 4

    doc.setFontSize(7.5)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(130, 120, 110)
    doc.text('Pattern-matched diagnosis based on fault signature', mg, y)
    y += 8

    rules.forEach(rule => {
      y = maybeNewPage(doc, y, 36)

      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(203, 91, 60)
      doc.text(rule.title, mg, y)
      y += 5

      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80, 72, 60)
      doc.setFontSize(8)
      const descLines = doc.splitTextToSize(rule.description, W - mg * 2)
      descLines.forEach(line => {
        y = maybeNewPage(doc, y)
        doc.text(line, mg, y)
        y += 4.5
      })
      y += 2

      doc.setFontSize(7.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(130, 120, 110)
      doc.text('Contributing Factors:', mg, y)
      y += 4.5

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(80, 72, 60)
      rule.factors.forEach(factor => {
        y = maybeNewPage(doc, y)
        doc.text('•  ' + factor, mg + 3, y)
        y += 4.5
      })
      y += 5
    })
  }

  // ── Footer (last page) ────────────────────────────────────────────
  const lastPage = doc.internal.getNumberOfPages()
  doc.setPage(lastPage)
  doc.setDrawColor(195, 188, 175)
  doc.line(mg, 284, W - mg, 284)
  doc.setFontSize(7)
  doc.setTextColor(140, 130, 115)
  doc.text('Auguard PdM System  ·  Confidential Maintenance Record', mg, 289)
  doc.text(`1 / ${lastPage}`, W - mg, 289, { align: 'right' })

  const safeName = (alert.predicted_failure || 'alert').replace(/[^a-z0-9]/gi, '_').slice(0, 30)
  doc.save(`auguard_episode_${safeName}.pdf`)
}

async function exportListPdf(displayed, fromDate, toDate, sevFilter, statusFilter, scenarioFilter, username) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const W = 297, H = 210, mg = 14
  const genAt = fmtDate(new Date().toISOString())
  const filterSummary = buildFilterSummary(fromDate, toDate, sevFilter, statusFilter, scenarioFilter)

  // Header bar
  doc.setFillColor(203, 91, 60)
  doc.rect(0, 0, W, 13, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('AUGUARD', mg, 8.5)
  doc.setFont('helvetica', 'normal')
  doc.text('Predictive Maintenance System — Alert History Report', mg + 21, 8.5)
  doc.text(`Generated: ${genAt}   ·   By: ${username || 'user'}`, W - mg, 8.5, { align: 'right' })

  let y = 21

  // Title + filter summary
  doc.setTextColor(35, 35, 35)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('Alert History Summary', mg, y)
  y += 6

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(130, 120, 110)
  doc.text(filterSummary + `   ·   Total: ${displayed.length} alert${displayed.length !== 1 ? 's' : ''}`, mg, y)
  y += 5

  doc.setDrawColor(210, 200, 185)
  doc.setLineWidth(0.3)
  doc.line(mg, y, W - mg, y)
  y += 5

  // Column definitions (landscape A4 = 297 mm wide)
  const cols = [
    { label: 'Timestamp',         x: mg,        w: 38 },
    { label: 'Scenario',          x: mg + 38,   w: 18 },
    { label: 'Predicted Failure', x: mg + 56,   w: 88 },
    { label: 'Severity',          x: mg + 144,  w: 24 },
    { label: 'Status',            x: mg + 168,  w: 30 },
    { label: 'Score',             x: mg + 198,  w: 20 },
    { label: 'Assigned To',       x: mg + 218,  w: 55 },
  ]

  // Table header row
  doc.setFillColor(238, 234, 226)
  doc.rect(mg - 2, y - 4, W - mg * 2 + 4, 8, 'F')
  doc.setFontSize(7)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(80, 72, 60)
  cols.forEach(c => doc.text(c.label, c.x, y))
  y += 6

  doc.setDrawColor(205, 198, 185)
  doc.line(mg, y, W - mg, y)
  y += 3

  // Data rows
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)

  displayed.forEach((alert, i) => {
    if (y > H - 18) {
      doc.addPage()
      y = 16
    }
    const sc = detectScenario(alert.predicted_failure)
    const pf = (alert.predicted_failure || '—').length > 72
      ? (alert.predicted_failure || '—').slice(0, 71) + '…'
      : (alert.predicted_failure || '—')

    if (i % 2 === 0) {
      doc.setFillColor(248, 245, 240)
      doc.rect(mg - 2, y - 3.5, W - mg * 2 + 4, 7, 'F')
    }

    doc.setTextColor(40, 40, 40)
    doc.text(fmtDate(alert.timestamp),                                 cols[0].x, y)
    doc.text(sc,                                                        cols[1].x, y)
    doc.text(pf,                                                        cols[2].x, y)
    doc.text(alert.severity,                                            cols[3].x, y)
    doc.text(alert.status,                                              cols[4].x, y)
    doc.text(alert.anomaly_score != null
      ? (alert.anomaly_score * 100).toFixed(0) + ' %' : '—',          cols[5].x, y)
    doc.text(alert.assigned_to_username || '—',                        cols[6].x, y)

    y += 7
  })

  // Footer
  doc.setDrawColor(195, 188, 175)
  doc.line(mg, H - 8, W - mg, H - 8)
  doc.setFontSize(6.5)
  doc.setTextColor(140, 130, 115)
  doc.text('Auguard PdM System  ·  Confidential Maintenance Record', mg, H - 4)

  doc.save(`auguard_history_${new Date().toISOString().split('T')[0]}.pdf`)
}

// ── Detail panel (inline accordion) ─────────────────────────────────

function DetailPanel({ alert, scenario, username, onClose }) {
  const rules   = getDiagnosis(alert.predicted_failure)
  const metrics = getResolutionMetrics(alert)

  return (
    <div style={{
      background: 'rgba(22,27,34,.75)',
      borderLeft: '3px solid rgba(203,91,60,.5)',
      padding: '22px 26px',
    }}>
      {/* ── Top row: existing columns ─────────────────────────────── */}
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* Left col: meta fields */}
        <div style={{ minWidth: 230, flex: '0 0 auto' }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#6f6a60', letterSpacing: '.06em', marginBottom: 12 }}>
            EPISODE DETAILS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {[
              ['Alert ID',      String(alert.id).slice(0, 8).toUpperCase() + '…'],
              ['Full UUID',     alert.id],
              ['Timestamp',     fmtDate(alert.timestamp)],
              ['Scenario',      scenario],
              ['Severity',      alert.severity],
              ['Status',        alert.status],
              ['Anomaly Score', alert.anomaly_score != null
                ? (alert.anomaly_score * 100).toFixed(2) + ' %' : '—'],
              ['Assigned To',   alert.assigned_to_username || '(unassigned)'],
              ['Created By',    alert.created_by],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{
                  fontSize: 11, color: '#6f6a60', fontWeight: 500,
                  minWidth: 108, flexShrink: 0, paddingTop: 1,
                }}>{label}</span>
                <span style={{
                  fontSize: 11, color: '#cabfa6', lineHeight: 1.4,
                  fontFamily: label === 'Full UUID' ? 'monospace' : 'inherit',
                  wordBreak: 'break-all',
                }}>{String(value)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right col: failure + action */}
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: '#6f6a60', letterSpacing: '.06em', marginBottom: 10 }}>
            PREDICTED FAILURE
          </div>
          <div style={{ fontSize: 13.5, color: '#DFD0B8', lineHeight: 1.65, marginBottom: 20 }}>
            {alert.predicted_failure}
          </div>

          <div style={{ fontSize: 10, fontWeight: 600, color: '#6f6a60', letterSpacing: '.06em', marginBottom: 8 }}>
            RECOMMENDED ACTION
          </div>
          <div style={{
            fontSize: 12.5, color: '#a59c8c', lineHeight: 1.65,
            background: 'rgba(57,62,70,.4)', borderRadius: 9, padding: '11px 15px',
            borderLeft: '3px solid #393E46',
          }}>
            {alert.recommended_action}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          <button
            onClick={e => {
              e.stopPropagation()
              exportEpisodePdf(alert, username)
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 15px', borderRadius: 9,
              border: '1px solid rgba(203,91,60,.45)',
              background: 'rgba(203,91,60,.12)',
              color: '#E0987F', fontWeight: 600, fontSize: 12.5,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <MS name="picture_as_pdf" size={15} color="#E0987F" />
            Export Episode PDF
          </button>
          <button
            onClick={e => { e.stopPropagation(); onClose() }}
            style={{
              padding: '8px 15px', borderRadius: 9,
              border: '1px solid #2f3742', background: 'transparent',
              color: '#6f6a60', fontWeight: 600, fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* ── Resolution Metrics ─────────────────────────────────────── */}
      <div style={{
        marginTop: 20, paddingTop: 16,
        borderTop: '1px solid rgba(57,62,70,.5)',
      }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#6f6a60', letterSpacing: '.06em', marginBottom: 10 }}>
          RESOLUTION METRICS
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px 32px' }}>
          {[
            ['Time to Acknowledge', metrics.timeToAck],
            ['Time to Resolve',     metrics.timeToResolve],
            ['Total Duration',      metrics.totalDuration],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 11, color: '#6f6a60', fontWeight: 500, minWidth: 148, flexShrink: 0 }}>
                {label}
              </span>
              <span style={{ fontSize: 11, color: '#cabfa6' }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Root Cause Analysis (only when rules match) ────────────── */}
      {rules.length > 0 && (
        <div style={{
          marginTop: 16, paddingTop: 16,
          borderTop: '1px solid rgba(57,62,70,.5)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#6f6a60', letterSpacing: '.06em' }}>
              ROOT CAUSE ANALYSIS
            </span>
            <span style={{ fontSize: 10, color: '#4a5260' }}>
              Pattern-matched diagnosis based on fault signature
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {rules.map((rule, i) => (
              <div key={i} style={{
                background: 'rgba(203,91,60,.07)',
                border: '1px solid rgba(203,91,60,.22)',
                borderLeft: '3px solid rgba(203,91,60,.45)',
                borderRadius: 9, padding: '13px 16px',
              }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#E0987F', marginBottom: 6 }}>
                  {rule.title}
                </div>
                <div style={{ fontSize: 12, color: '#a59c8c', lineHeight: 1.65, marginBottom: 9 }}>
                  {rule.description}
                </div>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#6f6a60', letterSpacing: '.04em', marginBottom: 6 }}>
                  CONTRIBUTING FACTORS
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {rule.factors.map((f, j) => (
                    <li key={j} style={{ fontSize: 11.5, color: '#948979', lineHeight: 1.6 }}>{f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────

export default function Reports() {
  const { username } = useAuth()
  const { isMobile } = useResponsive()

  const [alerts,      setAlerts]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)

  // Server-side filters
  const [fromDate,      setFromDate]      = useState('')
  const [toDate,        setToDate]        = useState('')
  const [statusFilter,  setStatusFilter]  = useState('all')
  const [sevFilter,     setSevFilter]     = useState('all')

  // Client-side scenario filter (F3/F4 detected from predicted_failure text)
  const [scenarioFilter, setScenarioFilter] = useState('all')

  // Table UI
  const [expandedId, setExpandedId] = useState(null)
  const [sortField,  setSortField]  = useState('timestamp')
  const [sortDir,    setSortDir]    = useState('desc')

  // Notification badge (best-effort, non-blocking)
  useEffect(() => {
    getNotifications()
      .then(ns => setUnreadCount(ns.filter(n => !n.is_read).length))
      .catch(() => {})
  }, [])

  const fetchAlerts = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = {}
      if (fromDate) {
        params.from_date = new Date(fromDate).toISOString()
      }
      if (toDate) {
        const d = new Date(toDate)
        d.setHours(23, 59, 59, 999)
        params.to_date = d.toISOString()
      }
      if (statusFilter !== 'all') params.status   = statusFilter
      if (sevFilter    !== 'all') params.severity = sevFilter
      const data = await getReportsAlerts(params)
      setAlerts(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate, statusFilter, sevFilter])

  useEffect(() => { fetchAlerts() }, [fetchAlerts])

  // Apply client-side scenario filter then sort
  const displayed = useMemo(() => {
    let rows = alerts
    if (scenarioFilter !== 'all') {
      rows = rows.filter(a => detectScenario(a.predicted_failure) === scenarioFilter)
    }
    return sortRows(rows, sortField, sortDir)
  }, [alerts, scenarioFilter, sortField, sortDir])

  // Stats from displayed rows
  const stats = useMemo(() => ({
    total:    displayed.length,
    critical: displayed.filter(a => a.severity === 'critical').length,
    resolved: displayed.filter(a => a.status === 'resolved').length,
    f3:       displayed.filter(a => detectScenario(a.predicted_failure) === 'F3').length,
    f4:       displayed.filter(a => detectScenario(a.predicted_failure) === 'F4').length,
  }), [displayed])

  function toggleSort(field) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  function clearFilters() {
    setFromDate(''); setToDate('')
    setStatusFilter('all'); setSevFilter('all'); setScenarioFilter('all')
  }

  const hasFilters = fromDate || toDate || statusFilter !== 'all' || sevFilter !== 'all' || scenarioFilter !== 'all'

  // ── Render ──────────────────────────────────────────────────────────

  function SortIcon({ field }) {
    if (sortField !== field) return <MS name="unfold_more" size={12} color="#4a5260" s={{ marginLeft: 3 }} />
    return <MS name={sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'} size={12} color="#DFD0B8" style={{ marginLeft: 3 }} />
  }

  function ColHead({ field, label, w }) {
    const active = sortField === field
    return (
      <th
        onClick={() => toggleSort(field)}
        style={{
          padding: '11px 12px', fontSize: 10.5, fontWeight: 600,
          color: active ? '#DFD0B8' : '#6f6a60',
          letterSpacing: '.05em', textAlign: 'left',
          cursor: 'pointer', userSelect: 'none',
          width: w, whiteSpace: 'nowrap',
          background: 'transparent',
        }}
      >
        {label}
        {active
          ? <MS name={sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'} size={12} color="#DFD0B8" style={{ marginLeft: 3 }} />
          : <MS name="unfold_more" size={12} color="#4a5260" style={{ marginLeft: 3 }} />
        }
      </th>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#1B2027' }}>
      <Topbar unreadCount={unreadCount} />

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: isMobile ? '16px 12px' : '28px 24px' }}>

        {/* ── Page header ── */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          marginBottom: 22, gap: 12, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#DFD0B8', letterSpacing: '-.01em', lineHeight: 1.2 }}>
              Alert History
            </div>
            <div style={{ fontSize: 13, color: '#6f6a60', marginTop: 4 }}>
              Browsable record of all past anomaly episodes &mdash; read-only
            </div>
          </div>
          <button
            onClick={() => exportListPdf(displayed, fromDate, toDate, sevFilter, statusFilter, scenarioFilter, username)}
            disabled={displayed.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 17px', borderRadius: 10,
              border: '1px solid rgba(203,91,60,.45)',
              background: 'rgba(203,91,60,.12)',
              color: displayed.length === 0 ? '#7c756a' : '#E0987F',
              fontWeight: 600, fontSize: 13,
              cursor: displayed.length === 0 ? 'not-allowed' : 'pointer',
              opacity: displayed.length === 0 ? 0.55 : 1,
              flexShrink: 0,
            }}
          >
            <MS name="download" size={16} color={displayed.length === 0 ? '#7c756a' : '#E0987F'} />
            Export List PDF
          </button>
        </div>

        {/* ── Filter bar ── */}
        <div style={{
          background: '#222831', border: '1px solid #333b45', borderRadius: 14,
          padding: '14px 18px', marginBottom: 18,
          display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end',
        }}>
          {/* Date range */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#6f6a60', letterSpacing: '.06em' }}>FROM</span>
              <input
                type="date"
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
                style={{
                  padding: '7px 10px', borderRadius: 8, border: '1px solid #333b45',
                  background: '#1B2027', color: '#DFD0B8', fontSize: 12.5,
                  colorScheme: 'dark', outline: 'none',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: '#6f6a60', letterSpacing: '.06em' }}>TO</span>
              <input
                type="date"
                value={toDate}
                onChange={e => setToDate(e.target.value)}
                style={{
                  padding: '7px 10px', borderRadius: 8, border: '1px solid #333b45',
                  background: '#1B2027', color: '#DFD0B8', fontSize: 12.5,
                  colorScheme: 'dark', outline: 'none',
                }}
              />
            </div>
          </div>

          <div style={{ width: 1, height: 34, background: '#2f3742', alignSelf: 'flex-end', marginBottom: 2 }} />

          {/* Severity */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#6f6a60', letterSpacing: '.06em' }}>SEVERITY</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {['all','critical','high','medium','low'].map(s => (
                <FilterBtn key={s}
                  label={s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  active={sevFilter === s}
                  onClick={() => setSevFilter(s)}
                />
              ))}
            </div>
          </div>

          <div style={{ width: 1, height: 34, background: '#2f3742', alignSelf: 'flex-end', marginBottom: 2 }} />

          {/* Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#6f6a60', letterSpacing: '.06em' }}>STATUS</span>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {['all','new','acknowledged','resolved'].map(s => (
                <FilterBtn key={s}
                  label={s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  active={statusFilter === s}
                  onClick={() => setStatusFilter(s)}
                />
              ))}
            </div>
          </div>

          <div style={{ width: 1, height: 34, background: '#2f3742', alignSelf: 'flex-end', marginBottom: 2 }} />

          {/* Scenario — client-side */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: '#6f6a60', letterSpacing: '.06em' }}>SCENARIO</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {['all','F3','F4','Unknown'].map(s => (
                <FilterBtn key={s}
                  label={s === 'all' ? 'All' : s}
                  active={scenarioFilter === s}
                  onClick={() => setScenarioFilter(s)}
                />
              ))}
            </div>
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              style={{
                padding: '7px 13px', borderRadius: 8, border: '1px solid #2f3742',
                background: 'transparent', color: '#948979',
                fontWeight: 600, fontSize: 12, cursor: 'pointer',
                alignSelf: 'flex-end',
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* ── Stats row ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(5,1fr)',
          gap: 10, marginBottom: 18,
        }}>
          {[
            { label: 'Total Episodes', value: stats.total,    color: '#DFD0B8', icon: 'history' },
            { label: 'Critical',       value: stats.critical, color: '#E0987F', icon: 'warning' },
            { label: 'Resolved',       value: stats.resolved, color: '#C6D196', icon: 'check_circle' },
            { label: 'F3 — Known',     value: stats.f3,       color: '#E4C281', icon: 'pattern' },
            { label: 'F4 — Novel',     value: stats.f4,       color: '#E0987F', icon: 'new_releases' },
          ].map(({ label, value, color, icon }) => (
            <div key={label} style={{
              background: '#222831', border: '1px solid #333b45',
              borderRadius: 12, padding: '14px 16px',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10.5, fontWeight: 500, color: '#6f6a60', letterSpacing: '.04em' }}>{label}</span>
                <MS name={icon} size={15} color="#4a5260" />
              </div>
              <span style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
            </div>
          ))}
        </div>

        {/* ── Table / states ── */}
        {loading ? (
          <div style={{
            textAlign: 'center', padding: 64, color: '#6f6a60', fontSize: 14,
            background: '#222831', border: '1px solid #333b45', borderRadius: 14,
          }}>
            Loading history…
          </div>
        ) : error ? (
          <div style={{
            background: 'rgba(203,91,60,.1)', border: '1px solid rgba(203,91,60,.35)',
            borderRadius: 12, padding: '16px 20px', color: '#E0987F', fontSize: 13,
          }}>
            Failed to load history: {error}
          </div>
        ) : displayed.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 64, color: '#6f6a60', fontSize: 14,
            background: '#222831', border: '1px solid #333b45', borderRadius: 14,
          }}>
            No episodes match the current filters.
          </div>
        ) : (
          <div style={{ background: '#222831', border: '1px solid #333b45', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #2a3140' }}>
                    <ColHead field="timestamp"     label="TIMESTAMP"        w={168} />
                    <th style={{ padding: '11px 12px', fontSize: 10.5, fontWeight: 600, color: '#6f6a60', letterSpacing: '.05em', textAlign: 'left', width: 66, whiteSpace: 'nowrap' }}>
                      SCENARIO
                    </th>
                    <ColHead field="predicted_failure" label="PREDICTED FAILURE" w={220} />
                    <ColHead field="severity"      label="SEVERITY"         w={96} />
                    <ColHead field="status"        label="STATUS"           w={116} />
                    <ColHead field="anomaly_score" label="SCORE"            w={76} />
                    <th style={{ padding: '11px 12px', fontSize: 10.5, fontWeight: 600, color: '#6f6a60', letterSpacing: '.05em', textAlign: 'left' }}>
                      ASSIGNED TO
                    </th>
                    <th style={{ width: 36 }} />
                  </tr>
                </thead>
                <tbody>
                  {displayed.map(alert => {
                    const scenario   = detectScenario(alert.predicted_failure)
                    const isExpanded = expandedId === alert.id
                    return (
                      <React.Fragment key={alert.id}>
                        <tr
                          onClick={() => setExpandedId(isExpanded ? null : alert.id)}
                          style={{
                            borderBottom: isExpanded ? 'none' : '1px solid #252d38',
                            cursor: 'pointer',
                            background: isExpanded ? 'rgba(57,62,70,.3)' : 'transparent',
                            transition: 'background .12s',
                          }}
                          onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'rgba(57,62,70,.18)' }}
                          onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent' }}
                        >
                          <td style={{ padding: '13px 12px', fontSize: 12, color: '#a59c8c', whiteSpace: 'nowrap' }}>
                            {fmtDate(alert.timestamp)}
                          </td>
                          <td style={{ padding: '13px 12px' }}>
                            <Chip label={scenario} style={scenarioStyle(scenario)} />
                          </td>
                          <td style={{ padding: '13px 12px', maxWidth: 220 }}>
                            <div style={{
                              fontSize: 12.5, color: '#DFD0B8',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                              {alert.predicted_failure}
                            </div>
                          </td>
                          <td style={{ padding: '13px 12px' }}>
                            <Chip label={alert.severity} style={severityStyle(alert.severity)} />
                          </td>
                          <td style={{ padding: '13px 12px' }}>
                            <Chip label={alert.status} style={statusStyle(alert.status)} />
                          </td>
                          <td style={{ padding: '13px 12px', fontSize: 12.5, fontWeight: 600, color: scoreColor(alert.anomaly_score), whiteSpace: 'nowrap' }}>
                            {alert.anomaly_score != null ? (alert.anomaly_score * 100).toFixed(1) + ' %' : '—'}
                          </td>
                          <td style={{ padding: '13px 12px', fontSize: 12, color: '#7c756a' }}>
                            {alert.assigned_to_username
                              ? alert.assigned_to_username
                              : <span style={{ color: '#3d4654', fontSize: 11 }}>unassigned</span>
                            }
                          </td>
                          <td style={{ padding: '13px 8px', textAlign: 'center' }}>
                            <MS name={isExpanded ? 'expand_less' : 'expand_more'} size={18} color="#4a5260" />
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={8} style={{ padding: 0, borderBottom: '1px solid #252d38' }}>
                              <DetailPanel
                                alert={alert}
                                scenario={scenario}
                                username={username}
                                onClose={() => setExpandedId(null)}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Table footer */}
            <div style={{
              padding: '11px 18px', borderTop: '1px solid #252d38',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 11.5, color: '#6f6a60' }}>
                {displayed.length} episode{displayed.length !== 1 ? 's' : ''}
                {alerts.length !== displayed.length
                  ? ` shown (${alerts.length - displayed.length} hidden by scenario filter)`
                  : ''}
              </span>
              <span style={{ fontSize: 11, color: '#4a5260' }}>
                Click a row to expand · sorted by {sortField} {sortDir}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
