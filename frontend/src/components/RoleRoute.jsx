import { Navigate, Outlet } from 'react-router-dom'

function RoleRoute({ requiredRole }) {
  const role = sessionStorage.getItem('role') ||
    (requiredRole === 'user' ? localStorage.getItem('campusnav-user-session') : null)

  if (role !== requiredRole) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export default RoleRoute
