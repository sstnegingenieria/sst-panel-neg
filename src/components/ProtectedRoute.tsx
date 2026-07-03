import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface ProtectedRouteProps {
  children: React.ReactNode
  rolesPermitidos: string[]
  redirectTo?: string
}

/**
 * Protege una ruta por rol.
 *
 * Reemplaza la función inline `AdminRoute` que vivía en `App.tsx`: en lugar de
 * exigir siempre el rol `admin`, acepta cualquier combinación de roles vía
 * `rolesPermitidos`. Esto lo hace reutilizable para los nuevos roles del SIGP
 * (p. ej. `gerencia_comercial`, `director_proyectos`, `residente_sst`) cuando
 * se agreguen las rutas `/sigp/*`.
 *
 * Se usa DENTRO del gatekeeper global `ProtectedRoutes` de `App.tsx`, que ya
 * garantiza sesión válida y rol permitido en el panel; aquí solo se decide el
 * acceso por rol a una ruta concreta. Si no hay usuario o su rol no está en
 * `rolesPermitidos`, redirige a `redirectTo` (por defecto `/registros`).
 */
export function ProtectedRoute({
  children,
  rolesPermitidos,
  redirectTo = '/registros',
}: ProtectedRouteProps) {
  const { user } = useAuth()

  if (!user || !rolesPermitidos.includes(user.rol)) {
    return <Navigate to={redirectTo} replace />
  }

  return <>{children}</>
}
