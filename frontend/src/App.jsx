import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Alerts from './pages/Alerts'
import Notifications from './pages/Notifications'
import Users from './pages/Users'

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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
      <Route path="/alerts" element={<RequireAuth><Alerts /></RequireAuth>} />
      <Route path="/notifications" element={<RequireAuth><Notifications /></RequireAuth>} />
      <Route path="/users" element={<RequireAdmin><Users /></RequireAdmin>} />
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
