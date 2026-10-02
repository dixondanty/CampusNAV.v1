import { Navigate, Outlet } from 'react-router-dom'

function RoleRoute({ requiredRole }) {
  const role = sessionStorage.getItem('role')

  if (role !== requiredRole) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export default RoleRoute
