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
import PanelSigp from './pages/sigp/PanelSigp'
import ClientesSigp from './pages/sigp/ClientesSigp'
import ClienteDetalleSigp from './pages/sigp/ClienteDetalleSigp'
import LpuDetalleSigp from './pages/sigp/LpuDetalleSigp'
import SolicitudesSigp from './pages/sigp/SolicitudesSigp'
import SolicitudDetalleSigp from './pages/sigp/SolicitudDetalleSigp'
import VisitasSigp from './pages/sigp/VisitasSigp'
import VisitaDetalleSigp from './pages/sigp/VisitaDetalleSigp'
import CotizacionesSigp from './pages/sigp/CotizacionesSigp'
import CotizacionDetalleSigp from './pages/sigp/CotizacionDetalleSigp'
import ProyectosSigp from './pages/sigp/ProyectosSigp'
import ProyectoDetalleSigp from './pages/sigp/ProyectoDetalleSigp'
import { ROLES_CON_ACCESO_SIGP, accesoSST, accesoSIGP, type Rol } from './types/sigp/roles'
import {
  ROLES_VE_DASHBOARD_SST,
  ROLES_VE_TECNICOS,
  ROLES_VE_REGISTROS,
  ROLES_VE_REPORTES,
  ROLES_VE_OBRAS,
  ROLES_VE_CONTRATISTAS,
  ROLES_VE_FACTURACION,
} from './types/sigp/permisos'
import FacturacionPagos from './pages/administrativa/FacturacionPagos'

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

  if (!accesoSST(user.rol as Rol) && !accesoSIGP(user.rol as Rol)) {
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
        <Route path="/" element={<ProtectedRoute rolesPermitidos={ROLES_VE_DASHBOARD_SST} redirectTo="/obras"><Dashboard /></ProtectedRoute>} />
        <Route path="/obras" element={<ProtectedRoute rolesPermitidos={ROLES_VE_OBRAS}><Obras /></ProtectedRoute>} />
        <Route path="/contratistas" element={<ProtectedRoute rolesPermitidos={ROLES_VE_CONTRATISTAS}><Contratistas /></ProtectedRoute>} />
        <Route path="/usuarios" element={<ProtectedRoute rolesPermitidos={ROLES_VE_TECNICOS} redirectTo="/obras"><Usuarios /></ProtectedRoute>} />
        <Route path="/registros" element={<ProtectedRoute rolesPermitidos={ROLES_VE_REGISTROS} redirectTo="/obras"><ObrasHub /></ProtectedRoute>} />
        <Route path="/registros/:obraId" element={<ProtectedRoute rolesPermitidos={ROLES_VE_REGISTROS} redirectTo="/obras"><ObraRegistros /></ProtectedRoute>} />
        <Route path="/reportes" element={<ProtectedRoute rolesPermitidos={ROLES_VE_REPORTES} redirectTo="/obras"><Reportes /></ProtectedRoute>} />

        {/* Rutas SIGP (placeholders F0). Protegidas por rol con ProtectedRoute
            ('admin' siempre incluido como fallback). La sección del Sidebar se
            oculta con el flag sigp_f1_enabled (Remote Config); responden por URL directa si el
            rol del usuario lo permite. */}
        <Route path="/sigp/panel" element={<ProtectedRoute rolesPermitidos={ROLES_CON_ACCESO_SIGP}><PanelSigp /></ProtectedRoute>} />
        <Route path="/sigp/obras" element={<ProtectedRoute rolesPermitidos={ROLES_CON_ACCESO_SIGP}><Obras /></ProtectedRoute>} />
        <Route path="/sigp/clientes" element={<ProtectedRoute rolesPermitidos={ROLES_CON_ACCESO_SIGP}><ClientesSigp /></ProtectedRoute>} />
        {/* UX jul-2026: la gestión de LPU vive en el detalle del cliente; la
            bandeja vieja redirige con gracia (enlaces guardados). El detalle
            de una LPU específica sigue en su ruta. */}
        <Route path="/sigp/clientes/:clienteId" element={<ProtectedRoute rolesPermitidos={ROLES_CON_ACCESO_SIGP}><ClienteDetalleSigp /></ProtectedRoute>} />
        <Route path="/sigp/lpus" element={<Navigate to="/sigp/clientes" replace />} />
        <Route path="/sigp/lpus/:lpuId" element={<ProtectedRoute rolesPermitidos={ROLES_CON_ACCESO_SIGP}><LpuDetalleSigp /></ProtectedRoute>} />
        <Route path="/sigp/solicitudes" element={<ProtectedRoute rolesPermitidos={ROLES_CON_ACCESO_SIGP}><SolicitudesSigp /></ProtectedRoute>} />
        <Route path="/sigp/solicitudes/:solicitudId" element={<ProtectedRoute rolesPermitidos={ROLES_CON_ACCESO_SIGP}><SolicitudDetalleSigp /></ProtectedRoute>} />
        <Route path="/sigp/visitas" element={<ProtectedRoute rolesPermitidos={ROLES_CON_ACCESO_SIGP}><VisitasSigp /></ProtectedRoute>} />
        <Route path="/sigp/visitas/:visitaId" element={<ProtectedRoute rolesPermitidos={ROLES_CON_ACCESO_SIGP}><VisitaDetalleSigp /></ProtectedRoute>} />
        <Route path="/sigp/cotizaciones" element={<ProtectedRoute rolesPermitidos={ROLES_CON_ACCESO_SIGP}><CotizacionesSigp /></ProtectedRoute>} />
        <Route path="/sigp/cotizaciones/:cotizacionId" element={<ProtectedRoute rolesPermitidos={ROLES_CON_ACCESO_SIGP}><CotizacionDetalleSigp /></ProtectedRoute>} />
        {/* F2.1.a — las páginas además se auto-gatean con sigp_f2_enabled */}
        <Route path="/sigp/proyectos" element={<ProtectedRoute rolesPermitidos={ROLES_CON_ACCESO_SIGP}><ProyectosSigp /></ProtectedRoute>} />
        <Route path="/sigp/proyectos/:proyectoId" element={<ProtectedRoute rolesPermitidos={ROLES_CON_ACCESO_SIGP}><ProyectoDetalleSigp /></ProtectedRoute>} />
        {/* Módulo Gerencia Administrativa (Bloque 1) — fuera del grupo SIGP */}
        <Route path="/administrativa/facturacion" element={<ProtectedRoute rolesPermitidos={ROLES_VE_FACTURACION}><FacturacionPagos /></ProtectedRoute>} />

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
