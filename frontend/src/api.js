import * as mock from './mockApi.js'

const DEMO = import.meta.env.VITE_DEMO_MODE === 'true'
const API  = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function api(path, options = {}) {
  const token = localStorage.getItem('auguard_token')
  const isForm = options.body instanceof FormData  // let the browser set multipart boundary
  const res = await fetch(API + path, {
    ...options,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  if (res.status === 401) {
    localStorage.removeItem('auguard_token')
    localStorage.removeItem('auguard_role')
    localStorage.removeItem('auguard_username')
    window.location.href = '/auth'
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  return res.json()
}

// Auth
export const login = (username, password) =>
  DEMO ? mock.mockLogin(username, password)
       : api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })

export const register = (username, email, password, role) =>
  DEMO ? mock.mockRegister(username, email, password, role)
       : api('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password, role }) })

export const getUsers = () =>
  DEMO ? mock.mockGetUsers()
       : api('/auth/users')

// Dashboard
export const getDashboard = () =>
  DEMO ? mock.mockGetDashboard()
       : api('/dashboard')

// Replay controls (auth required). body: { playing?, speed?, scenario?, reset? }
export const controlReplay = (body) =>
  DEMO ? Promise.resolve({ ...body })
       : api('/dashboard/replay', { method: 'POST', body: JSON.stringify(body) })

// CSV upload (auth required). Multipart — api() detects FormData and skips JSON header.
export const uploadCsv = (file) => {
  const fd = new FormData()
  fd.append('file', file)
  return api('/dashboard/upload', { method: 'POST', body: fd })
}

// Equipment / Fleet (trailing slash avoids a 307 redirect that drops the auth header)
export const getEquipment     = ()   => api('/equipment/')
export const getEquipmentItem = (id) => api('/equipment/' + id)

// Sensors (registry)
export const getSensors = (equipmentId) =>
  api('/sensors/' + (equipmentId ? '?equipment_id=' + equipmentId : ''))

// Failure modes (FMEA catalog)
export const getFailureModes = () => api('/failure-modes/')

// Work orders
export const getWorkOrders = (params = {}) => {
  const qs = new URLSearchParams()
  if (params.status)       qs.set('status', params.status)
  if (params.equipment_id) qs.set('equipment_id', params.equipment_id)
  const q = qs.toString()
  return api('/work-orders/' + (q ? '?' + q : ''))
}
export const getWorkOrder          = (id)              => api('/work-orders/' + id)
export const createWorkOrder       = (body)            => api('/work-orders/', { method: 'POST', body: JSON.stringify(body) })
export const updateWorkOrderStatus = (id, status)      => api(`/work-orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) })
export const assignWorkOrder       = (id, assigned_to) => api(`/work-orders/${id}/assign`, { method: 'PUT', body: JSON.stringify({ assigned_to }) })

// Alerts
export const getAlerts = (params = {}) => {
  if (DEMO) return mock.mockGetAlerts()
  const qs = new URLSearchParams()
  if (params.status)   qs.set('status',   params.status)
  if (params.severity) qs.set('severity', params.severity)
  const q = qs.toString()
  return api('/alerts' + (q ? '?' + q : ''))
}
export const getAlert         = (id)            => api(`/alerts/${id}`)
export const createAlert      = (body)          =>
  DEMO ? mock.mockCreateAlert(body)
       : api('/alerts', { method: 'POST', body: JSON.stringify(body) })
export const assignAlert      = (id, assigned_to) =>
  DEMO ? mock.mockAssignAlert(id, assigned_to)
       : api(`/alerts/${id}/assign`, { method: 'PUT', body: JSON.stringify({ assigned_to }) })
export const updateAlertStatus = (id, status)  =>
  DEMO ? mock.mockUpdateAlertStatus(id, status)
       : api(`/alerts/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) })
export const escalateAlert    = (id)            =>
  DEMO ? mock.mockEscalateAlert(id)
       : api(`/alerts/${id}/escalate`, { method: 'PUT' })

// Reports / History (read-only)
export const getReportsAlerts = (params = {}) => {
  const qs = new URLSearchParams()
  if (params.from_date) qs.set('from_date', params.from_date)
  if (params.to_date)   qs.set('to_date',   params.to_date)
  if (params.status)    qs.set('status',     params.status)
  if (params.severity)  qs.set('severity',   params.severity)
  const q = qs.toString()
  return api('/reports/alerts' + (q ? '?' + q : ''))
}
export const getReportAlert = (id) => api(`/reports/alerts/${id}`)

// Hardware (ESP32 prototype). GET reads are open; mutations need auth.
export const getHardware       = ()      => api('/hardware')
export const getHardwarePipeline = ()    => api('/hardware/pipeline')   // Track A — pipeline check, NOT a detection
export const injectComponent   = (component, state) =>
  api('/hardware/inject', { method: 'POST', body: JSON.stringify({ component, state }) })
export const setTriggerConfig  = (body)  =>
  api('/hardware/trigger/config', { method: 'POST', body: JSON.stringify(body) })
export const clearHardwareBanner = ()    =>
  api('/hardware/trigger/banner/clear', { method: 'POST' })

// Inference log
export const getInferenceHistory = (params = {}) => {
  const qs = new URLSearchParams()
  if (params.from_date) qs.set('from_date', params.from_date)
  if (params.to_date)   qs.set('to_date',   params.to_date)
  if (params.status)    qs.set('status',     params.status)
  if (params.scenario)  qs.set('scenario',   params.scenario)
  if (params.limit)     qs.set('limit',      params.limit)
  const q = qs.toString()
  return api('/inference/history' + (q ? '?' + q : ''))
}
export const getInferenceStats = (params = {}) => {
  const qs = new URLSearchParams()
  if (params.scenario) qs.set('scenario', params.scenario)
  const q = qs.toString()
  return api('/inference/stats' + (q ? '?' + q : ''))
}
export const getInferenceEpisode = (alertId) => api('/inference/episode/' + alertId)

// Notifications
export const getNotifications = () =>
  DEMO ? mock.mockGetNotifications()
       : api('/notifications')
export const markNotifRead    = (id)   =>
  DEMO ? mock.mockMarkNotifRead(id)
       : api(`/notifications/${id}/read`, { method: 'PUT' })
export const sendNotification = (body) =>
  DEMO ? mock.mockSendNotification(body)
       : api('/notifications', { method: 'POST', body: JSON.stringify(body) })
