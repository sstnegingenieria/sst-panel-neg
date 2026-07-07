/**
 * Roles del sistema.
 *
 * Los tres primeros son heredados del panel SST original.
 * Los nueve siguientes son introducidos por el SIGP.
 *
 * La migración de usuarios de rol SST a rol SIGP se ejecuta en la
 * Iteración 0.5 de F0 (solo los 5 usuarios de panel: 3 admin + 2 sst).
 */

// Roles heredados del panel SST
export type RolSST = 'tecnico' | 'sst' | 'admin'

// Roles nuevos del SIGP
export type RolSIGP =
  | 'gerencia_general'
  | 'gerencia_administrativa'
  | 'operacion_comercial'
  | 'director_proyectos'
  | 'auxiliar_proyectos'
  | 'residente_sst'
  | 'gestion_integral'
  | 'contratista'
  | 'cliente_final'

// Cualquier rol válido del sistema (union de ambos)
export type Rol = RolSST | RolSIGP

// Helper: roles con acceso al panel web (excluye tecnico y contratista,
// que solo usan la app móvil)
export const ROLES_PANEL_WEB: Rol[] = [
  'sst', 'admin',
  'gerencia_general', 'gerencia_administrativa', 'operacion_comercial',
  'director_proyectos', 'auxiliar_proyectos', 'residente_sst', 'gestion_integral',
  'cliente_final',
]

/**
 * Roles con acceso al panel SST (fuente única).
 * - sst, admin: heredados del panel SST original.
 * - gerencia_general: dirección con visión total.
 * - gestion_integral: revisión de formatos SST desde el módulo SGI.
 * - residente_sst: rol funcional de campo (equivalente al sst original).
 */
export const ROLES_CON_ACCESO_SST: Rol[] = [
  'sst',
  'admin',
  'gerencia_general',
  'gestion_integral',
  'residente_sst',
]

/** Determina si un rol tiene acceso al panel SST. */
export function accesoSST(rol: Rol): boolean {
  return ROLES_CON_ACCESO_SST.includes(rol)
}

/**
 * Roles con acceso al panel SIGP (fuente única).
 * - admin: acceso total.
 * - gerencia_general: dirección con visión total.
 * - gerencia_administrativa: preliquidaciones, pagos, facturación.
 * - operacion_comercial: solicitudes, cotizaciones, licitaciones.
 * - director_proyectos: gestión de proyectos y ejecución.
 * - auxiliar_proyectos: apoyo operativo a proyectos (creación de obras, seguimiento).
 * - gestion_integral: habilitación de contratistas, NC, auditorías.
 *
 * NO tienen acceso SIGP: tecnico, sst, residente_sst, contratista, cliente_final.
 */
export const ROLES_CON_ACCESO_SIGP: Rol[] = [
  'admin',
  'gerencia_general',
  'gerencia_administrativa',
  'operacion_comercial',
  'director_proyectos',
  'auxiliar_proyectos',
  'gestion_integral',
]

/** Determina si un rol tiene acceso al panel SIGP. */
export function accesoSIGP(rol: Rol): boolean {
  return ROLES_CON_ACCESO_SIGP.includes(rol)
}
