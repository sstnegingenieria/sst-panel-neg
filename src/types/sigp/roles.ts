/**
 * Roles del sistema.
 *
 * Los tres primeros son heredados del panel SST original.
 * Los ocho siguientes son introducidos por el SIGP.
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
  | 'gerencia_comercial'
  | 'director_proyectos'
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
  'gerencia_general', 'gerencia_administrativa', 'gerencia_comercial',
  'director_proyectos', 'residente_sst', 'gestion_integral',
  'cliente_final',
]
