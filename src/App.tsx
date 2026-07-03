import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { NotificacionesProvider } from './contexts/NotificacionesContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Obras from './pages/Obras'
import Contratistas from './pages/Contratistas'
import Usuarios from './pages/Usuarios'
import ObrasHub from './pages/ObrasHub'
import ObraRegistros from './pages/ObraRegistros'
import Reportes from './pages/Reportes'
import Layout from './components/Layout'
import { ToastContainer } from './components/shared/Toast'
import { ProtectedRoute } from './components/ProtectedRoute'

const ALLOWED_ROLES = ['sst', 'admin']

function ProtectedRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!user) return <Login />

  if (!ALLOWED_ROLES.includes(user.rol)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-800">Acceso no autorizado</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Tu cuenta no tiene permiso para acceder a este panel.
          </p>
          <button
            onClick={() => { import('./firebase/config').then(({ auth }) => auth.signOut()) }}
            className="mt-6 text-sm text-brand-600 hover:underline"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/obras" element={<ProtectedRoute rolesPermitidos={['admin']}><Obras /></ProtectedRoute>} />
        <Route path="/contratistas" element={<ProtectedRoute rolesPermitidos={['admin']}><Contratistas /></ProtectedRoute>} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/registros" element={<ObrasHub />} />
        <Route path="/registros/:obraId" element={<ObraRegistros />} />
        <Route path="/reportes" element={<Reportes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}


export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificacionesProvider>
          <ProtectedRoutes />
          <ToastContainer />
        </NotificacionesProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
