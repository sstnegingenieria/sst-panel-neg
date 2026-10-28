/**
 * Proyección `verificaciones_sst/{proyectoId}` — Gate SST (Bloque 3a).
 *
 * SST NO tiene acceso a `proyectos` (valor de venta, márgenes y
 * preliquidación son confidenciales). Esta proyección delgada contiene SOLO
 * identidad + estado del proyecto y es lo ÚNICO que el área SST lee para su
 * cola de verificación. La mantiene al día la Cloud Function
 * `sincronizarVerificacionSst` (functions/verificacionesSst.js) para los
 * proyectos en el tramo administrativo (facturado en adelante); el campo
 * `sst_gate` lo posee SST (fuente de verdad del gate — la regla del 3b lo
 * lee de AQUÍ vía get()).
 *
 * PROHIBIDO agregar campos económicos a esta interfaz.
 */
import type { Timestamp } from 'firebase/firestore'
import type { AvalFisicoSst, EstadoProyecto, SstGateProyecto } from './proyecto'

/** Traza del gate en la proyección: de/a son estados del GATE. */
export interface EntradaHistorialGate {
  de: string
  a: string
  por: string                  // uid de quien marcó
  fecha: Timestamp
  motivo: string
  /** Copia de la evidencia cuando el aval fue FÍSICO — la traza no depende
   *  de que `sst_gate` siga siendo el mismo después. */
  fisico?: AvalFisicoSst
}

export interface VerificacionSst {
  /** Doc id: desde el 28-oct (Parte A del bloque proyección/saldo) es
   *  `{proyectoId}__{contratistaId}` — UN doc por (proyecto, contratista):
   *  SST avala al CONTRATISTA en el proyecto (cubre sus N asignaciones).
   *  Los docs legacy `{proyectoId}` quedaron CONGELADOS por la migración
   *  (marcador `migrada_a`); la CF no los escribe más y la regla no los lee. */
  proyecto_id: string
  consecutivo: string          // PRY-YYYY-NNN
  nombre_sitio: string
  codigo_sitio_cliente: string
  cliente_nombre: string
  contratista_id: string
  contratista_nombre: string
  estado: EstadoProyecto       // sincronizado por la Cloud Function
  obra_id: string              // pry_{proyectoId} — enlace a la obra-espejo
  /** El gate — escrito SOLO por sst/residente_sst. Ausente = pendiente. */
  sst_gate?: SstGateProyecto
  historial?: EntradaHistorialGate[]
  /** [R6] Mantenida por la CF: true mientras el contratista tenga ≥1
   *  asignación VIVA (ni cancelada ni liquidada) en el proyecto. La huérfana
   *  NO se borra (su historial es evidencia de avales dados): sale de la
   *  cola por este flag — patrón `activa` de Tareas. Ausente (legacy) = true. */
  activa?: boolean
  /** Procedencia de la migración 28-oct: el doc legacy `{proyectoId}` del
   *  que se copiaron `sst_gate` + `historial` ÍNTEGROS. Lo escribe SOLO la
   *  migración; la CF jamás lo toca. */
  migrada_desde?: string
  /** SOLO en docs legacy `{proyectoId}` congelados: los ids por-contratista
   *  que los reemplazan. Con este campo presente, el doc no acepta más
   *  escrituras de gate (bloque de reglas del frente SGI/SST — A4). */
  migrada_a?: string[]
  fecha_sincronizacion?: Timestamp
  fecha_actualizacion?: Timestamp
}

/** Estado AGREGADO del gate de un proyecto sobre sus proyecciones
 *  por-contratista VIVAS — para el chip de la bandeja administrativa:
 *  el PEOR estado gana (con_novedad > pendiente/sin revisar > al_dia).
 *  Sin proyecciones vivas → 'pendiente' (la ausencia jamás se lee como
 *  aval — criterio del PR #193). */
export function gateAgregadoDe(
  docs: Pick<VerificacionSst, 'sst_gate' | 'activa' | 'contratista_nombre'>[],
): { estado: 'al_dia' | 'con_novedad' | 'pendiente'; detalle: string[] } {
  const vivas = docs.filter(d => d.activa !== false)
  const estadoDe = (d: (typeof docs)[number]) => d.sst_gate?.estado ?? 'pendiente'
  const detalle = vivas.map(d => `${d.contratista_nombre || '—'}: ${estadoDe(d)}`)
  if (vivas.length === 0) return { estado: 'pendiente', detalle: [] }
  if (vivas.some(d => estadoDe(d) === 'con_novedad')) return { estado: 'con_novedad', detalle }
  if (vivas.some(d => estadoDe(d) !== 'al_dia')) return { estado: 'pendiente', detalle }
  return { estado: 'al_dia', detalle }
}

/** Id determinístico de la proyección por contratista [R1]. */
export const idVerificacion = (proyectoId: string, contratistaId: string): string =>
  `${proyectoId}__${contratistaId}`
