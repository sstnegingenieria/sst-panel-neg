/**
 * Capa de permisos de UI del panel, derivada de la matriz de acceso por rol
 * validada con Giovanny (sub-bloque 0.6.a-ter). Es la fuente única de verdad
 * para mostrar/ocultar secciones (sidebar/rutas) y botones de acción.
 *
 * - `veX(rol)`   → la página/sección es visible para ese rol.
 * - `puedeX(rol)` → se muestran los botones de acción correspondientes.
 *
 * Los helpers aceptan `string | undefined` (el `user?.rol` crudo) para no
 * requerir casts en los call sites. Esto es SOLO UX: las reglas de Firestore
 * son el backstop real de seguridad.
 *
 * Roles fuera de la matriz de 6 columnas (confirmado con Giovanny; hoy sin
 * usuarios asignados):
 *  - director_proyectos → espeja a `auxiliar_proyectos` (rol de proyectos).
 *  - residente_sst, gestion_integral → como `sst` en las vistas SST.
 *
 * `admin` y `sst` quedan exactamente igual que antes de F0.
 */
import type { Rol } from './roles'

function en(rol: string | undefined, roles: readonly Rol[]): boolean {
  return rol != null && (roles as readonly string[]).includes(rol)
}

// ────────────────────────────────────────────────────────────────────────────
// VISIBILIDAD de páginas / secciones (sidebar + rutas)
// ────────────────────────────────────────────────────────────────────────────

export const ROLES_VE_DASHBOARD_SST: Rol[] = [
  'admin', 'sst', 'gerencia_general', 'residente_sst', 'gestion_integral',
]
export const ROLES_VE_REGISTROS: Rol[] = [
  'admin', 'sst', 'gerencia_general', 'residente_sst', 'gestion_integral',
]
export const ROLES_VE_REPORTES: Rol[] = [
  'admin', 'sst', 'gerencia_general', 'residente_sst', 'gestion_integral',
]
export const ROLES_VE_TECNICOS: Rol[] = [
  'admin', 'sst', 'gerencia_general',
  'auxiliar_proyectos', 'director_proyectos',
  'residente_sst', 'gestion_integral',
]
// Hotfix A (23-jul-2026): Obras es una vista SST/administrativa — los roles
// de PROYECTOS (auxiliar/director/operacion_comercial) trabajan en Proyectos
// y ya no la ven. `gerencia_general` queda DENTRO en lectura (alta dirección,
// supervisión — decisión de Giovanny). La creación manual quedó restringida
// a admin (escotilla) y respaldada por la regla de `obras` (create solo
// admin, o gestor con origen:'sigp' — la obra-espejo del flujo).
export const ROLES_VE_OBRAS: Rol[] = [
  'admin', 'sst', 'residente_sst', 'gestion_integral', 'gerencia_administrativa',
  'gerencia_general',
]
export const ROLES_VE_CONTRATISTAS: Rol[] = [
  'admin', 'gerencia_general',
  'auxiliar_proyectos', 'director_proyectos', 'operacion_comercial',
  'gerencia_administrativa',
]

export const veDashboardSST = (rol: string | undefined) => en(rol, ROLES_VE_DASHBOARD_SST)
export const veRegistros = (rol: string | undefined) => en(rol, ROLES_VE_REGISTROS)
export const veReportes = (rol: string | undefined) => en(rol, ROLES_VE_REPORTES)
export const veTecnicos = (rol: string | undefined) => en(rol, ROLES_VE_TECNICOS)
export const veObras = (rol: string | undefined) => en(rol, ROLES_VE_OBRAS)
export const veContratistas = (rol: string | undefined) => en(rol, ROLES_VE_CONTRATISTAS)

// ────────────────────────────────────────────────────────────────────────────
// ACCIONES (mostrar/ocultar botones)
// ────────────────────────────────────────────────────────────────────────────

// Aprobar/rechazar formularios. Incluye gestion_integral (ya tiene escritura
// vía puedeAdministrarSST en las reglas Firestore).
export const ROLES_APROBAR_REGISTROS: Rol[] = ['admin', 'sst', 'gestion_integral']

// Crear/editar/eliminar obras. Alineado con `puedeGestionarProyectos()` de
// firestore.rules (mismos 5 roles).
export const ROLES_GESTIONA_OBRAS: Rol[] = [
  'admin', 'gerencia_general', 'operacion_comercial',
  'auxiliar_proyectos', 'director_proyectos',
]

// Crear/editar/eliminar contratistas: solo admin (UI más estricta que las
// reglas a propósito — defensa en profundidad).
export const ROLES_GESTIONA_CONTRATISTAS: Rol[] = ['admin']

// Habilitar/deshabilitar contratistas: admin + gerencia_administrativa.
export const ROLES_HABILITA_CONTRATISTAS: Rol[] = ['admin', 'gerencia_administrativa']

// Crear/editar/desactivar clientes (dominio comercial, F1). Alineado con
// `puedeGestionarProyectos()` de firestore.rules — los mismos roles que
// escribirán en `clientes`/`lpus` (ver 1.1.e). La visibilidad de la página
// se controla aparte con accesoSIGP().
export const ROLES_GESTIONA_CLIENTES: Rol[] = [
  'admin', 'gerencia_general', 'operacion_comercial',
  'auxiliar_proyectos', 'director_proyectos',
]

export const puedeAprobarRegistros = (rol: string | undefined) => en(rol, ROLES_APROBAR_REGISTROS)
export const puedeGestionarObrasUI = (rol: string | undefined) => en(rol, ROLES_GESTIONA_OBRAS)
export const puedeGestionarContratistasUI = (rol: string | undefined) => en(rol, ROLES_GESTIONA_CONTRATISTAS)
export const puedeHabilitarContratistas = (rol: string | undefined) => en(rol, ROLES_HABILITA_CONTRATISTAS)
export const puedeGestionarClientesUI = (rol: string | undefined) => en(rol, ROLES_GESTIONA_CLIENTES)
// La gestión de LPU (importar, versionar) usa los mismos roles que la de
// clientes (comercial/proyectos), alineado con puedeGestionarProyectos().
export const puedeGestionarLpusUI = (rol: string | undefined) => en(rol, ROLES_GESTIONA_CLIENTES)
// Registrar/gestionar solicitudes: mismos roles (comercial/proyectos),
// alineado con puedeGestionarProyectos() de firestore.rules.
export const puedeGestionarSolicitudesUI = (rol: string | undefined) => en(rol, ROLES_GESTIONA_CLIENTES)
// Programar/ejecutar visitas técnicas: mismos roles (comercial/proyectos).
export const puedeGestionarVisitasUI = (rol: string | undefined) => en(rol, ROLES_GESTIONA_CLIENTES)
// Crear/gestionar cotizaciones: mismos roles (comercial/proyectos).
export const puedeGestionarCotizacionesUI = (rol: string | undefined) => en(rol, ROLES_GESTIONA_CLIENTES)
// Ver/gestionar Proyectos (F2.1.a): alineado con puedeGestionarProyectos() de
// firestore.rules (mismos 5 roles). El sidebar además exige sigp_f2_enabled.
export const puedeGestionarProyectosUI = (rol: string | undefined) => en(rol, ROLES_GESTIONA_CLIENTES)

// SEGREGACIÓN DE FUNCIONES (F2.1.c): aprobar la preliquidación y registrar el
// anticipo girado es de gerencia_administrativa (quien define ≠ quien
// desembolsa). `admin` se incluye como rol de infraestructura, igual que en
// ROLES_HABILITA_CONTRATISTAS. Respaldado por la regla hasOnly de `proyectos`.
// ── Módulo Gerencia Administrativa · Bloque 1 (facturación) ──
// La vista "Facturación y Pagos" la VEN gerencia_administrativa (opera),
// admin y gerencia_general (lectura). REGISTRAR factura: SOLO
// gerencia_administrativa (segregación: ni proyectos ni admin ejecutan la
// acción desde la UI; la regla Firestore la respalda por hasOnly).
export const ROLES_VE_FACTURACION: Rol[] = ['admin', 'gerencia_general', 'gerencia_administrativa']
export const veFacturacionUI = (rol: string | undefined) => en(rol, ROLES_VE_FACTURACION)
export const puedeRegistrarFacturaUI = (rol: string | undefined) => rol === 'gerencia_administrativa'
// ── Bloque 3b — liquidación del contratista ──
// LIQUIDAR: solo gerencia_administrativa (misma segregación que factura/pago).
// Las compras/reembolsos las CAPTURAN los gestores durante el proyecto
// (usa puedeGestionarProyectosUI en el call site).
export const puedeLiquidarUI = (rol: string | undefined) => rol === 'gerencia_administrativa'
// ── Bloque final — cierre del proyecto ──
// CERRAR: gerencia_administrativa (formaliza el ciclo) + admin (infra).
export const puedeCerrarProyectoUI = (rol: string | undefined) =>
  rol === 'gerencia_administrativa' || rol === 'admin'

// ── Gate SST (Administrativa · Bloque 3a) ──
// La cola "Verificación de contratistas" la VEN sst/residente_sst (opera) y
// admin (lectura de infraestructura). MARCAR el gate: SOLO sst/residente_sst
// (respaldado por reglas: su único campo de escritura en proyectos).
export const ROLES_VE_VERIFICACION_SST: Rol[] = ['admin', 'sst', 'residente_sst']
export const veVerificacionSstUI = (rol: string | undefined) => en(rol, ROLES_VE_VERIFICACION_SST)
export const puedeMarcarSstGateUI = (rol: string | undefined) => rol === 'sst' || rol === 'residente_sst'

export const ROLES_APRUEBA_PRELIQUIDACION: Rol[] = ['admin', 'gerencia_administrativa']
export const puedeAprobarPreliquidacionUI = (rol: string | undefined) => en(rol, ROLES_APRUEBA_PRELIQUIDACION)
// Visibilidad del módulo Proyectos: gestión O aprobación (gerencia_administrativa
// necesita entrar a la ficha para aprobar/girar).
export const veProyectosUI = (rol: string | undefined) =>
  puedeGestionarProyectosUI(rol) || puedeAprobarPreliquidacionUI(rol)
