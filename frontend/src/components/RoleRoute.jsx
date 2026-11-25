import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { apiFetch, API_URL } from '../utils/api.js'

function RoleRoute() {
  const [authenticated, setAuthenticated] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    apiFetch(`${API_URL}/auth/admin/session`, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) {
          setAuthenticated(response.ok)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setAuthenticated(false)
        }
      })
    return () => controller.abort()
  }, [])

  if (authenticated === null) {
    return <main className="admin-session-check" aria-busy="true">Checking Admin session…</main>
  }
  if (!authenticated) {
    return <Navigate to="/admin-login" replace />
  }
  return <Outlet />
}

export default RoleRoute
