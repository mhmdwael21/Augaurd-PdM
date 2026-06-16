import { createContext, useContext, useState, useCallback } from 'react'

const AuthContext = createContext(null)

function decodeJwt(token) {
  try {
    const payload = token.split('.')[1]
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return decoded
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('auguard_token'))
  const [role, setRole] = useState(() => localStorage.getItem('auguard_role'))
  const [username, setUsername] = useState(() => localStorage.getItem('auguard_username'))

  const login = useCallback((newToken, overrideRole, overrideUsername) => {
    localStorage.setItem('auguard_token', newToken)
    setToken(newToken)

    const decoded = decodeJwt(newToken)
    const r = overrideRole || decoded?.role || 'operator'
    const u = overrideUsername || decoded?.sub || decoded?.username || ''

    localStorage.setItem('auguard_role', r)
    localStorage.setItem('auguard_username', u)
    setRole(r)
    setUsername(u)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('auguard_token')
    localStorage.removeItem('auguard_role')
    localStorage.removeItem('auguard_username')
    setToken(null)
    setRole(null)
    setUsername(null)
  }, [])

  return (
    <AuthContext.Provider value={{ token, role, username, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
