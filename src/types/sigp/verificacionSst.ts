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
import type { EstadoProyecto, SstGateProyecto } from './proyecto'

/** Traza del gate en la proyección: de/a son estados del GATE. */
export interface EntradaHistorialGate {
  de: string
  a: string
  por: string                  // uid de quien marcó
  fecha: Timestamp
  motivo: string
}

export interface VerificacionSst {
  /** = id del proyecto (doc id) — 1:1 por construcción. */
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
  fecha_sincronizacion?: Timestamp
  fecha_actualizacion?: Timestamp
}
