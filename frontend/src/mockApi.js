// Demo-mode mock implementations — used when VITE_DEMO_MODE=true
// All mutations update in-memory state so the UI stays interactive within a session.

const ADMIN_ID = 'uid-0000-0000-0000-000000000001'
const TECH_ID  = 'uid-0000-0000-0000-000000000002'
const OP_ID    = 'uid-0000-0000-0000-000000000003'

const DEMO_ACCOUNTS = {
  admin:      { password: 'admin123', role: 'admin',      id: ADMIN_ID, email: 'admin@metro.pt' },
  technician: { password: 'tech123',  role: 'technician', id: TECH_ID,  email: 'tech@metro.pt'  },
  operator:   { password: 'op123',    role: 'operator',   id: OP_ID,    email: 'operator@metro.pt' },
}

export const MOCK_USERS = Object.entries(DEMO_ACCOUNTS).map(([username, a]) => ({
  id: a.id, username, email: a.email, role: a.role, created_at: '2026-01-15T08:00:00',
}))

let ALERTS = [
  {
    id: 'al-0001', severity: 'critical', status: 'new',
    predicted_failure: 'Novel Pressure Fault — TP2, H1 (F4)',
    recommended_action: 'Inspect pneumatic circuit for air leaks in the TP2 section. Verify H1 sensor calibration and check valve integrity before next service cycle.',
    anomaly_score: 0.94,
    timestamp: new Date(Date.now() - 3 * 3600e3).toISOString(),
    assigned_to: null, created_by: ADMIN_ID,
  },
  {
    id: 'al-0002', severity: 'high', status: 'acknowledged',
    predicted_failure: 'Motor Current Anomaly — DV Electric Motor',
    recommended_action: 'Check motor windings and current draw. Verify electrical connections and motor brush wear.',
    anomaly_score: 0.76,
    timestamp: new Date(Date.now() - 18 * 3600e3).toISOString(),
    assigned_to: TECH_ID, created_by: ADMIN_ID,
  },
  {
    id: 'al-0003', severity: 'medium', status: 'resolved',
    predicted_failure: 'Oil Temperature Drift — TP3 Sensor',
    recommended_action: 'Monitor oil temperature over 48 h. Replace oil if temperature exceeds nominal during next cycle.',
    anomaly_score: 0.58,
    timestamp: new Date(Date.now() - 48 * 3600e3).toISOString(),
    assigned_to: TECH_ID, created_by: ADMIN_ID,
  },
  {
    id: 'al-0004', severity: 'low', status: 'resolved',
    predicted_failure: 'Pressure Sensor Drift — H1',
    recommended_action: 'Recalibrate H1 pressure sensor. Schedule full sensor-array calibration at next maintenance window.',
    anomaly_score: 0.52,
    timestamp: new Date(Date.now() - 72 * 3600e3).toISOString(),
    assigned_to: OP_ID, created_by: ADMIN_ID,
  },
]

let NOTIFICATIONS = [
  {
    id: 'no-0001', subject: 'CRITICAL: Novel Pressure Fault — TP2, H1 (F4)',
    body: 'A critical severity alert has been raised on APU Unit 3. Immediate inspection of the pneumatic circuit is required.',
    type: 'alert', recipient_type: 'all', recipient_id: null, target_role: null,
    is_read: false, timestamp: new Date(Date.now() - 3 * 3600e3).toISOString(),
    created_by: ADMIN_ID, alert_id: 'al-0001',
  },
  {
    id: 'no-0002', subject: 'Alert assigned: Motor Current Anomaly',
    body: 'You have been assigned a high-severity alert. Action required: check motor windings and current draw on APU Unit 1.',
    type: 'alert', recipient_type: 'user', recipient_id: TECH_ID, target_role: null,
    is_read: true, timestamp: new Date(Date.now() - 18 * 3600e3).toISOString(),
    created_by: ADMIN_ID, alert_id: 'al-0002',
  },
  {
    id: 'no-0003', subject: 'Scheduled maintenance window — June 20',
    body: 'The Auguard monitoring system will undergo scheduled maintenance on June 20 from 02:00–04:00 UTC. Brief interruptions may occur.',
    type: 'system', recipient_type: 'all', recipient_id: null, target_role: null,
    is_read: false, timestamp: new Date(Date.now() - 24 * 3600e3).toISOString(),
    created_by: ADMIN_ID, alert_id: null,
  },
  {
    id: 'no-0004', subject: 'Welcome to Auguard PdM',
    body: 'Your account is active. You can now monitor APU fleet health in real time, view alerts assigned to you, and update alert statuses.',
    type: 'broadcast', recipient_type: 'all', recipient_id: null, target_role: null,
    is_read: true, timestamp: new Date(Date.now() - 96 * 3600e3).toISOString(),
    created_by: ADMIN_ID, alert_id: null,
  },
]

// Build a fake-but-decodable JWT (signature is ignored client-side)
function makeJWT(username, role) {
  const b64 = s => btoa(unescape(encodeURIComponent(s))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const header  = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64(JSON.stringify({ sub: username, role, exp: 9999999999 }))
  return `${header}.${payload}.demo`
}

const wait = (ms = 200) => new Promise(r => setTimeout(r, ms))
function fail(msg) { throw new Error(msg) }

function currentUser() {
  return {
    username: localStorage.getItem('auguard_username') || '',
    role:     localStorage.getItem('auguard_role')     || '',
  }
}

// ── Auth ─────────────────────────────────────────────────────────────

export async function mockLogin(username, password) {
  await wait()
  const acc = DEMO_ACCOUNTS[username]
  if (!acc || acc.password !== password) fail('Invalid username or password.')
  return { access_token: makeJWT(username, acc.role) }
}

export async function mockRegister(username, _email, _password, _role) {
  await wait()
  if (DEMO_ACCOUNTS[username]) fail('Username already exists.')
  return { id: 'uid-new', username, email: _email, role: _role || 'operator', created_at: new Date().toISOString() }
}

export async function mockGetUsers() {
  await wait()
  return [...MOCK_USERS]
}

// ── Alerts ───────────────────────────────────────────────────────────

export async function mockGetAlerts() {
  await wait()
  const { role, username } = currentUser()
  if (role === 'admin') return [...ALERTS]
  const user = MOCK_USERS.find(u => u.username === username)
  if (!user) return []
  return ALERTS.filter(a => a.assigned_to === user.id)
}

export async function mockCreateAlert(body) {
  await wait()
  const alert = {
    id: 'al-' + Date.now(),
    severity: body.severity || 'medium',
    status: 'new',
    predicted_failure: body.predicted_failure,
    recommended_action: body.recommended_action,
    anomaly_score: body.anomaly_score ?? null,
    timestamp: new Date().toISOString(),
    assigned_to: body.assigned_to || null,
    created_by: ADMIN_ID,
  }
  ALERTS = [alert, ...ALERTS]
  return { ...alert }
}

export async function mockUpdateAlertStatus(id, status) {
  await wait()
  const a = ALERTS.find(x => x.id === id)
  if (!a) fail('Alert not found.')
  a.status = status
  return { ...a }
}

export async function mockEscalateAlert(id) {
  await wait()
  const a = ALERTS.find(x => x.id === id)
  if (!a) fail('Alert not found.')
  if (a.severity === 'critical') fail('Alert is already critical.')
  a.severity = 'critical'
  return { ...a }
}

export async function mockAssignAlert(id, assignedTo) {
  await wait()
  const a = ALERTS.find(x => x.id === id)
  if (!a) fail('Alert not found.')
  a.assigned_to = assignedTo
  return { ...a }
}

// ── Notifications ────────────────────────────────────────────────────

export async function mockGetNotifications() {
  await wait()
  const { role, username } = currentUser()
  const user = MOCK_USERS.find(u => u.username === username)
  return NOTIFICATIONS.filter(n => {
    if (n.recipient_type === 'all') return true
    if (n.recipient_type === 'group' && n.target_role === role) return true
    if (n.recipient_type === 'user' && user && n.recipient_id === user.id) return true
    return false
  })
}

export async function mockMarkNotifRead(id) {
  await wait()
  const n = NOTIFICATIONS.find(x => x.id === id)
  if (n) n.is_read = true
  return n ? { ...n } : {}
}

export async function mockSendNotification(body) {
  await wait()
  const n = {
    id: 'no-' + Date.now(),
    subject: body.subject,
    body: body.body,
    type: body.type || 'system',
    recipient_type: body.recipient_type || 'all',
    recipient_id: body.recipient_id || null,
    target_role: body.target_role || null,
    is_read: false,
    timestamp: new Date().toISOString(),
    created_by: ADMIN_ID,
    alert_id: null,
  }
  NOTIFICATIONS = [n, ...NOTIFICATIONS]
  return { ...n }
}

// ── Dashboard ────────────────────────────────────────────────────────

export async function mockGetDashboard() {
  await wait(80)
  return { status: 'ok', model_version: '2.1.0', dataset: 'MetroPT-3' }
}
