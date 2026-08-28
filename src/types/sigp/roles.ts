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

// F1 (renombrado R2, antes residente_cliente): EMPLEADO NEG con acceso
// RESTRINGIDO al cliente asignado — residente de obra en sede del cliente.
// NO es un acceso del cliente (el espacio cliente_* queda libre para un
// eventual acceso real de Claro, que sería otra cosa). Nace pudiendo NADA:
// nace pudiendo NADA (cero colecciones, cero archivos, cero menús) y cada
// permiso que reciba será una concesión explícita en sus propios matches
// de reglas (esResidenteDe) y sus propias vistas (bloque F1 aparte).
// JAMÁS se agrega a un helper/array existente — regresión permanente en
// __tests__/rolResidente.test.ts.
export type RolResidente = 'residente_obra'

// Cualquier rol válido del sistema (union de los tres orígenes)
export type Rol = RolSST | RolSIGP | RolResidente

/** Etiqueta legible de cada rol (UI del panel de Usuarios y badges). */
export const ROL_LABEL: Record<Rol, string> = {
  tecnico: 'Técnico',
  sst: 'SST',
  admin: 'Admin',
  gerencia_general: 'Gerencia General',
  gerencia_administrativa: 'Gerencia Administrativa',
  operacion_comercial: 'Operación Comercial',
  director_proyectos: 'Director de Proyectos',
  auxiliar_proyectos: 'Auxiliar de Proyectos',
  residente_sst: 'Residente SST',
  gestion_integral: 'Gestión Integral',
  contratista: 'Contratista',
  cliente_final: 'Cliente',
  residente_obra: 'Residente de Obra',
}

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

/**
 * TERCERA área del gatekeeper: residentes de obra (empleados NEG con
 * alcance restringido por cliente — NO un portal de cara al cliente).
 * Solo `residente_obra`. Entra al panel y ve ÚNICAMENTE el módulo de
 * Actividades de su cliente; el resto del SIGP/SST/Tareas y toda otra
 * colección/ruta le quedan negados (evidencia: batería del paso 6 de
 * C2.1). Su alcance viaja en el custom claim
 * {perfil: 'residente_obra', cliente_id} que deriva la CF
 * sincronizarClaims del doc de users (fuente auditable).
 */
export const ROLES_RESIDENTES: Rol[] = ['residente_obra']

/** Determina si un rol es residente de obra (acceso restringido por cliente). */
export function accesoResidente(rol: Rol): boolean {
  return ROLES_RESIDENTES.includes(rol)
}
