import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import RoleRoute from './components/RoleRoute.jsx'
import UserPage from './pages/UserPage.jsx'
import isPwaDisplayMode from './utils/pwaMode.js'
import './App.css'

const AdminPage = lazy(() => import('./pages/AdminPage.jsx'))
const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage.jsx'))

function App() {
  const isPwa = isPwaDisplayMode()

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/user" replace />} />
        <Route path="/user" element={<UserPage />} />
        {!isPwa && (
          <>
            <Route
              path="/admin-login"
              element={<Suspense fallback={null}><AdminLoginPage /></Suspense>}
            />
            <Route element={<RoleRoute />}>
              <Route
                path="/admin"
                element={<Suspense fallback={null}><AdminPage /></Suspense>}
              />
            </Route>
          </>
        )}
        <Route path="*" element={<Navigate to="/user" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
