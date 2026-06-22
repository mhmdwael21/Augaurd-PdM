import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Fleet from './pages/Fleet'
import AssetDetail from './pages/AssetDetail'
import Hardware from './pages/Hardware'
import Alerts from './pages/Alerts'
import WorkOrders from './pages/WorkOrders'
import Maintenance from './pages/Maintenance'
import Notifications from './pages/Notifications'
import Reports from './pages/Reports'
import Users from './pages/Users'
import Profile from './pages/Profile'

function RequireAuth({ children }) {
  const { token } = useAuth()
  const location = useLocation()
  if (!token) return <Navigate to="/auth" state={{ from: location }} replace />
  return children
}

function RequireAdmin({ children }) {
  const { token, role } = useAuth()
  const location = useLocation()
  if (!token) return <Navigate to="/auth" state={{ from: location }} replace />
  if (role !== 'admin') return <Navigate to="/dashboard" replace />
  return children
}

// Work orders are maintenance-staff territory — operators (read-only monitors)
// have no access to the page; they're redirected to the dashboard.
function RequireStaff({ children }) {
  const { token, role } = useAuth()
  const location = useLocation()
  if (!token) return <Navigate to="/auth" state={{ from: location }} replace />
  if (role === 'operator') return <Navigate to="/dashboard" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/fleet" element={<RequireAuth><Fleet /></RequireAuth>} />
      <Route path="/fleet/:assetId" element={<RequireAuth><AssetDetail /></RequireAuth>} />
      <Route path="/hardware" element={<RequireAuth><Hardware /></RequireAuth>} />
      <Route path="/alerts" element={<RequireAuth><Alerts /></RequireAuth>} />
      <Route path="/work-orders" element={<RequireStaff><WorkOrders /></RequireStaff>} />
      <Route path="/maintenance" element={<RequireAuth><Maintenance /></RequireAuth>} />
      <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
      <Route path="/reports" element={<RequireAuth><Reports /></RequireAuth>} />
      <Route path="/users" element={<RequireAdmin><Users /></RequireAdmin>} />
      <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
