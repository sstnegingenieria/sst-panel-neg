import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useNotificaciones } from '../contexts/NotificacionesContext'
import { useFeatureFlag } from '../hooks/useFeatureFlag'
import { accesoSIGP, type Rol } from '../types/sigp/roles'
import {
  veDashboardSST,
  veObras,
  veContratistas,
  veTecnicos,
  veRegistros,
  veReportes,
} from '../types/sigp/permisos'

interface SidebarProps {
  collapsed: boolean
  /** Cajón abierto (solo aplica en móvil, < lg). */
  mobileOpen?: boolean
  /** Se llama al hacer clic en un ítem (cierra el cajón en móvil). */
  onNavigate?: () => void
}

const navItems = [
  {
    to: '/',
    label: 'Dashboard',
    ve: veDashboardSST,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    to: '/obras',
    label: 'Obras',
    ve: veObras,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    to: '/contratistas',
    label: 'Contratistas',
    ve: veContratistas,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    to: '/usuarios',
    label: 'Técnicos',
    ve: veTecnicos,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    to: '/registros',
    label: 'Registros',
    ve: veRegistros,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    to: '/reportes',
    label: 'Reportes',
    ve: veReportes,
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
]

// Ítems de navegación del SIGP. Se muestran TODOS si el flag sigp_f1_enabled
// (Remote Config) está activo y el usuario tiene acceso SIGP (ver accesoSIGP).
// La granularidad fina por vista se maneja dentro de cada página, no en el sidebar.
const sigpNavItems: {
  to: string
  label: string
  icon: JSX.Element
}[] = [
  {
    to: '/sigp/panel',
    label: 'Panel',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
  {
    to: '/sigp/obras',
    label: 'Obras',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    to: '/sigp/clientes',
    label: 'Clientes',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    to: '/sigp/lpus',
    label: 'LPU',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    to: '/sigp/solicitudes',
    label: 'Solicitudes',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
    ),
  },
  {
    to: '/sigp/visitas',
    label: 'Visitas',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    to: '/sigp/cotizaciones',
    label: 'Cotizaciones',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
]

export default function Sidebar({ collapsed, mobileOpen = false, onNavigate }: SidebarProps) {
  const { user } = useAuth()
  const { pendientesRegistros, pendientesTecnicos } = useNotificaciones()
  const sigpEnabled = useFeatureFlag('sigp_f1_enabled', false)
  // El bloque SIGP se muestra si el flag está activo y el rol tiene acceso SIGP.
  const mostrarSigp = sigpEnabled && !!user?.rol && accesoSIGP(user.rol as Rol)
  // "Obras" es canónicamente del flujo SIGP (F0.5.b): cuando el bloque SIGP está
  // visible, se oculta del bloque SST para no duplicar la entrada. Con el flag
  // apagado (producción hoy) sigue apareciendo una sola vez en el bloque SST.
  const visibleItems = navItems.filter(item => {
    if (item.to === '/obras' && mostrarSigp) return false
    return item.ve(user?.rol)
  })

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 lg:static lg:z-auto h-screen bg-white border-r border-gray-200 text-gray-700 flex flex-col transition-all duration-300 w-60 ${
        collapsed ? 'lg:w-16' : 'lg:w-60'
      } ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-100">
        <img
          src="/logo-neg.png"
          alt="NEG Ingeniería"
          className="flex-shrink-0 w-9 h-9 object-contain"
        />
        {!collapsed && (
          <span className="font-display font-bold text-[15px] leading-tight tracking-tight text-gray-900">
            NEG Ingeniería
            <br />
            <span className="text-gray-400 font-sans font-medium text-[11px] uppercase tracking-wider">
              Panel del Sistema de Gestión Integral
            </span>
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {visibleItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-brand-50 text-brand-700 font-semibold'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <span className="flex-shrink-0 relative">
              {item.icon}
              {/* Badge compacto cuando el sidebar está colapsado */}
              {collapsed && item.to === '/registros' && pendientesRegistros > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center">
                  {pendientesRegistros > 9 ? '9+' : pendientesRegistros}
                </span>
              )}
              {collapsed && item.to === '/usuarios' && pendientesTecnicos > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center">
                  {pendientesTecnicos > 9 ? '9+' : pendientesTecnicos}
                </span>
              )}
            </span>
            {!collapsed && (
              <span className="flex items-center justify-between flex-1">
                <span>{item.label}</span>
                {item.to === '/registros' && pendientesRegistros > 0 && (
                  <span className="ml-auto bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {pendientesRegistros > 99 ? '99+' : pendientesRegistros}
                  </span>
                )}
                {item.to === '/usuarios' && pendientesTecnicos > 0 && (
                  <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                    {pendientesTecnicos > 99 ? '99+' : pendientesTecnicos}
                  </span>
                )}
              </span>
            )}
          </NavLink>
        ))}

        {/* Sección SIGP — solo si el feature flag de Remote Config está encendido
            (sigp_f1_enabled) y el usuario tiene acceso SIGP (accesoSIGP). Si lo
            tiene, ve TODOS los ítems SIGP; la granularidad fina por vista se
            maneja dentro de cada página, no aquí. */}
        {mostrarSigp && (() => {
          return (
            <div className="mt-4 pt-4 border-t border-gray-100">
              {!collapsed && (
                <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  SIGP
                </p>
              )}
              {sigpNavItems.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                      isActive
                        ? 'bg-brand-50 text-brand-700 font-semibold'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`
                  }
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              ))}
            </div>
          )
        })()}
      </nav>

      {/* Footer */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-gray-100">
          <p className="font-slogan italic text-[11px] text-brand-700 leading-tight">
            Ingeniería que cambia el mundo
          </p>
          <p className="text-[10px] text-gray-400 mt-1">NEG Ingeniería · v2</p>
        </div>
      )}
    </aside>
  )
}
