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

// C2.1 paso 6 — rol EXTERNO del portal de clientes. NO es personal interno:
// nace pudiendo NADA (cero colecciones, cero archivos, cero menús) y cada
// permiso que reciba será una concesión explícita en sus propios matches
// de reglas (esResidenteDe) y sus propias vistas (bloque F1 aparte).
// JAMÁS se agrega a un helper/array existente — regresión permanente en
// __tests__/rolResidente.test.ts.
export type RolClientes = 'residente_cliente'

// Cualquier rol válido del sistema (union de los tres orígenes)
export type Rol = RolSST | RolSIGP | RolClientes

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
 * C2.1 paso 6 — TERCERA área del gatekeeper: portal de clientes.
 * Solo `residente_cliente`. El acceso que otorga es ENTRAR al panel y
 * aterrizar en su portal vacío — nada más: ni SST, ni SIGP, ni Tareas,
 * ni ninguna colección/ruta de Storage (el rol nace en cero; evidencia
 * en la batería del paso 6). Su alcance por cliente viaja en el custom
 * claim {perfil: 'residente_cliente', cliente_id} que deriva la CF
 * sincronizarClaims del doc de users (fuente auditable).
 */
export const ROLES_CON_ACCESO_CLIENTES: Rol[] = ['residente_cliente']

/** Determina si un rol pertenece al portal de clientes. */
export function accesoClientes(rol: Rol): boolean {
  return ROLES_CON_ACCESO_CLIENTES.includes(rol)
}
