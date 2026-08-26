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

// Aprobar/rechazar formularios. Incluye gestion_integral y residente_sst
// (escritura respaldada por puedeRevisarFormularios() en las reglas Firestore,
// separado de puedeAdministrarSST() para no otorgar gestión de users).
export const ROLES_APROBAR_REGISTROS: Rol[] = ['admin', 'sst', 'gestion_integral', 'residente_sst']

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
// ── §16 (ii, 07-ago): la frontera de comercial es la COTIZACIÓN — proyectos
// es dominio de ejecución. Gestión de proyectos espeja puedeCrearProyectos()
// de firestore.rules (4 roles, SIN operacion_comercial). El nacimiento del
// proyecto es server-side (CF crearProyectoAlAprobar).
export const ROLES_GESTIONA_PROYECTOS: Rol[] = [
  'admin', 'gerencia_general', 'director_proyectos', 'auxiliar_proyectos',
]
export const puedeGestionarProyectosUI = (rol: string | undefined) => en(rol, ROLES_GESTIONA_PROYECTOS)

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

// Aprobación de preliquidación (23-jul-2026, respaldo controlado): la titular
// es gerencia_administrativa; gerencia_general, gestion_integral y admin son
// APROBADORES DE RESPALDO — su aprobación exige `salvedad` (por qué no la
// hizo la gerente administrativa). Los roles de PROYECTOS jamás aprueban
// (proyectos define; que apruebe la misma área rompe la segregación).
export const ROLES_APRUEBA_PRELIQUIDACION: Rol[] = [
  'gerencia_administrativa', 'gerencia_general', 'gestion_integral', 'admin',
]
export const puedeAprobarPreliquidacionUI = (rol: string | undefined) => en(rol, ROLES_APRUEBA_PRELIQUIDACION)
/** ¿La aprobación de este rol es de RESPALDO? (exige salvedad obligatoria). */
export const aprobacionRequiereSalvedad = (rol: string | undefined) =>
  puedeAprobarPreliquidacionUI(rol) && rol !== 'gerencia_administrativa'
// Visibilidad del módulo Proyectos (§16 ii): espeja puedeVerProyectos() de
// firestore.rules — los 6 roles de ejecución/dirección, SIN operacion_comercial
// (su frontera es la cotización; el chip PRY de la cotización queda informativo
// no-navegable). Gatea ruta, sidebar y la carga de `proyectos` del Panel.
export const ROLES_VE_PROYECTOS: Rol[] = [
  'admin', 'gerencia_general', 'gerencia_administrativa',
  'director_proyectos', 'auxiliar_proyectos', 'gestion_integral',
]
export const veProyectosUI = (rol: string | undefined) => en(rol, ROLES_VE_PROYECTOS)

// ── Módulo Compras (C1) — proveedores ──
// Registrar/editar proveedores y su información bancaria: gerencia_administrativa
// OPERA (Marcela); admin respalda (infraestructura). Alineado con
// gestionaCompras() de firestore.rules.
export const ROLES_GESTIONA_COMPRAS: Rol[] = ['gerencia_administrativa', 'admin']
export const puedeGestionarComprasUI = (rol: string | undefined) => en(rol, ROLES_GESTIONA_COMPRAS)

// ── Módulo Compras (C2) — órdenes de compra ──
// Alineado con puedeCrearOC()/apruebaOC()/puedeVerOC() de firestore.rules:
// crea el operativo de proyectos (mínimo privilegio, sin comercial ni sst);
// aprueba GP/GG/admin (aprobador ≠ creador, o salvedad); ve además
// gerencia_administrativa y gestion_integral (lectura, sin escritura).
export const ROLES_CREA_OC: Rol[] = [
  'auxiliar_proyectos', 'director_proyectos', 'gerencia_general', 'admin',
]
export const puedeCrearOcUI = (rol: string | undefined) => en(rol, ROLES_CREA_OC)
export const ROLES_APRUEBA_OC: Rol[] = ['director_proyectos', 'gerencia_general', 'admin']
export const apruebaOcUI = (rol: string | undefined) => en(rol, ROLES_APRUEBA_OC)
export const ROLES_VEN_OC: Rol[] = [
  'auxiliar_proyectos', 'director_proyectos', 'gerencia_general',
  'gerencia_administrativa', 'gestion_integral', 'admin',
]
export const veOcUI = (rol: string | undefined) => en(rol, ROLES_VEN_OC)

// ── Panel SIGP — indicador operativo "Margen real" (07-ago) ──
// Editar la meta (`configuracion/indicadores.meta_margen_pct`): SOLO
// gerencia_general/admin — espeja la regla Firestore del mismo doc.
export const ROLES_EDITA_META_INDICADORES: Rol[] = ['gerencia_general', 'admin']
export const editaMetaIndicadoresUI = (rol: string | undefined) => en(rol, ROLES_EDITA_META_INDICADORES)

// ── OC1 — datos de empresa (`configuracion/empresa`, bloque RADICACIÓN del
// PDF de orden de compra). Espeja la regla del match genérico
// configuracion/{docId}: write gerencia_general + admin. Lectura = accesoSIGP
// (la tarjeta se muestra en Gestión Administrativa; Marcela ve, no edita).
export const ROLES_EDITA_CONFIG_EMPRESA: Rol[] = ['gerencia_general', 'admin']
export const editaConfigEmpresaUI = (rol: string | undefined) => en(rol, ROLES_EDITA_CONFIG_EMPRESA)

// ── Validador de horario / asistencia (#3, 07-ago) ──
// Espejo EXACTO de veHorario()/gestionaHorario() de firestore.rules:
// los reportes los ven TODAS las gerencias + admin (decisión Giovanny);
// operan (ausentismos, detalle médico, anulaciones) solo
// gerencia_administrativa + admin. La config (IPs + hora fin) la editan
// GG+admin (regla genérica de `configuracion`, como la meta de margen).
export const ROLES_VE_HORARIO: Rol[] = [
  'gerencia_administrativa', 'gerencia_general', 'gestion_integral',
  'director_proyectos', 'admin',
]
export const veHorarioUI = (rol: string | undefined) => en(rol, ROLES_VE_HORARIO)
export const ROLES_GESTIONA_HORARIO: Rol[] = ['gerencia_administrativa', 'admin']
export const puedeGestionarHorarioUI = (rol: string | undefined) => en(rol, ROLES_GESTIONA_HORARIO)

// ── Mantenimiento de precios del catálogo NEG (#2b, 09-ago) ──
// Espejo EXACTO de puedeMantenerCatalogo() de firestore.rules: corrigen y
// ajustan precios SOLO GG + director de proyectos + admin. El ALTA desde el
// cotizador (incorporación CAT-NNNN) sigue con puedeGestionarProyectos().
// La página /sigp/catalogo la VEN todos los roles SIGP (lectura).
export const ROLES_MANTIENE_CATALOGO: Rol[] = ['gerencia_general', 'director_proyectos', 'admin']
export const puedeMantenerCatalogoUI = (rol: string | undefined) => en(rol, ROLES_MANTIENE_CATALOGO)

// ── Módulo Tareas (14-ago) ──
// Espejo EXACTO de las reglas: read de `tareas` = esPersonalPanel() (los 9
// roles del panel; `cliente_final` es futuro y queda fuera hasta revisitar);
// asignar A OTROS = puedeAsignarTareas() (las gerencias + admin, misma
// lectura de "gerencias" que el horario). Auto-tarea y balón: cualquiera.
export const ROLES_VE_TAREAS: Rol[] = [
  'sst', 'admin', 'gerencia_general', 'gerencia_administrativa',
  'operacion_comercial', 'director_proyectos', 'auxiliar_proyectos',
  'residente_sst', 'gestion_integral',
]
export const veTareasUI = (rol: string | undefined) => en(rol, ROLES_VE_TAREAS)
export const ROLES_ASIGNA_TAREAS: Rol[] = [
  'gerencia_general', 'gerencia_administrativa',
  'director_proyectos', 'gestion_integral', 'admin',
]
export const puedeAsignarTareasUI = (rol: string | undefined) => en(rol, ROLES_ASIGNA_TAREAS)

// ── Módulo de Actividades (F1 operación in-house, 17-ago) ──
// Espejo EXACTO de las reglas de `actividades` y `propuestas_actividad`:
// el helper PROPIO del módulo gestionaActividades() en firestore.rules +
// gerencia administrativa (solo lectura, vía gestionaCompras) + el rol
// residente_obra, cuya SEGUNDA concesión explícita es esta (la whitelist
// de rolResidente.test.ts la registra). El residente opera la MISMA
// página con su cliente fijo; las reglas acotan el alcance.
// ⛔ operacion_comercial FUERA (decisión de Giovanny, 18-ago-2026): Karen
// está a cargo únicamente de licitaciones — la operación in-house de
// Claro no es su frente. Antes heredaba puedeGestionarProyectos(); el
// helper propio del módulo cerró esa vía en ambas colecciones.
export const ROLES_VE_ACTIVIDADES: Rol[] = [
  'admin', 'gerencia_general',
  'auxiliar_proyectos', 'director_proyectos', 'gerencia_administrativa',
  'residente_obra',
]
export const veActividadesUI = (rol: string | undefined) => en(rol, ROLES_VE_ACTIVIDADES)
// Gestión (crear/editar/hitos/emisión de propuestas): espejo de las vías
// de write de la regla — gestionaActividades() + el residente (acotado).
export const ROLES_GESTIONA_ACTIVIDADES: Rol[] = [
  'admin', 'gerencia_general',
  'auxiliar_proyectos', 'director_proyectos',
  'residente_obra',
]
export const puedeGestionarActividadesUI = (rol: string | undefined) => en(rol, ROLES_GESTIONA_ACTIVIDADES)

// ── Módulo LICITACIONES (1.4, 21-ago-2026) ──
// Espejo EXACTO de los helpers de firestore.rules del sub-bloque 1.2:
//
//   ROLES_VE_LICITACIONES        ⟷ gestionaLicitaciones()
//   ROLES_VE_ECONOMIA_LICITACION ⟷ veEconomiaLicitacion()
//
// `operacion_comercial` ESTÁ en el módulo (las licitaciones son su frente,
// decisión del PR #97) y NO está en la economía: quien arma la propuesta no
// ve el techo económico con el que se la evalúa.
export const ROLES_VE_LICITACIONES: Rol[] = [
  'operacion_comercial', 'gerencia_general', 'gerencia_administrativa',
  'director_proyectos', 'admin',
]
export const veLicitacionesUI = (rol: string | undefined) => en(rol, ROLES_VE_LICITACIONES)

// Mismos roles: quien ve el módulo lo opera. La granularidad fina (quién
// aprueba qué) no aplica todavía — el ciclo de una licitación lo lleva una
// sola persona de punta a punta.
export const gestionaLicitacionesUI = (rol: string | undefined) => en(rol, ROLES_VE_LICITACIONES)

// ⛔ CONFIDENCIALIDAD: sin `operacion_comercial`. La pestaña de economía no se
// renderiza NI COMO PLACEHOLDER para quien no la puede ver — un "no tienes
// acceso a Economía" ya revela que el análisis existe y que alguien lo mira,
// que es justamente lo que la segregación quiere evitar. Para Karen la
// pestaña sencillamente no está.
//
// `oferta_neg` NO entra en esta restricción: vive en el documento padre y ella
// la necesita para subir la oferta a SECOP.
export const ROLES_VE_ECONOMIA_LICITACION: Rol[] = [
  'gerencia_general', 'gerencia_administrativa', 'director_proyectos', 'admin',
]
export const veEconomiaLicitacionUI = (rol: string | undefined) =>
  en(rol, ROLES_VE_ECONOMIA_LICITACION)
