import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import RoleRoute from './components/RoleRoute.jsx'
import AdminPage from './pages/AdminPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import UserPage from './pages/UserPage.jsx'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route element={<RoleRoute requiredRole="admin" />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>
        <Route element={<RoleRoute requiredRole="user" />}>
          <Route path="/user" element={<UserPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
