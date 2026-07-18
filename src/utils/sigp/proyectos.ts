// Nacimiento del Proyecto desde una cotización aprobada (SIGP F2.1.a).
//
// IDEMPOTENTE por construcción: el id del doc en `proyectos` ES el id de la
// cotización → exactamente 1 proyecto por cotización (re-aprobación, doble
// clic o reintento nunca duplican). Si el doc ya existe, solo se asegura el
// enlace inverso en la cotización (auto-reparación de fallos parciales).
//
// El consecutivo PRY es server-side (Cloud Function). El caller puede cachear
// el número ante fallos (patrón SOL/VIS/COT: preservar y reintentar sin quemar
// otro) pasando un `obtenerConsecutivo` que memorice.

import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { construirSnapshotProyecto } from '../../types/sigp/proyecto'
import type { Proyecto } from '../../types/sigp/proyecto'
import type { Cotizacion, VersionCotizacion } from '../../types/sigp/cotizacion'

export interface ResultadoCrearProyecto {
  id: string
  consecutivo: string
  /** false si el proyecto ya existía (idempotencia) */
  creado: boolean
}

export async function crearProyectoDesdeCotizacion(opts: {
  cotizacion: Cotizacion
  uid: string
  /** Debe devolver el PRY-YYYY-NNN (idealmente memorizando ante reintentos). */
  obtenerConsecutivo: () => Promise<string>
}): Promise<ResultadoCrearProyecto> {
  const { cotizacion, uid, obtenerConsecutivo } = opts

  const refProyecto = doc(db, 'proyectos', cotizacion.id)
  const existente = await getDoc(refProyecto)
  if (existente.exists()) {
    const consecutivo = (existente.data() as Proyecto).consecutivo
    // Auto-reparación: si un fallo parcial dejó la cotización sin enlace, se repone.
    if (cotizacion.proyecto_id !== refProyecto.id) {
      await updateDoc(doc(db, 'cotizaciones', cotizacion.id), {
        proyecto_id: refProyecto.id, proyecto_consecutivo: consecutivo,
      })
    }
    return { id: refProyecto.id, consecutivo, creado: false }
  }

  // Snapshot fiel de la VERSIÓN APROBADA (copia, no referencia).
  const vSnap = await getDoc(doc(db, 'cotizaciones', cotizacion.id, 'versiones', String(cotizacion.version_activa)))
  if (!vSnap.exists()) throw new Error(`Versión aprobada ${cotizacion.version_activa} no encontrada`)
  const version = vSnap.data() as VersionCotizacion

  let clienteNombre: string | undefined
  let clienteNit: string | undefined
  if (cotizacion.cliente_id) {
    const c = await getDoc(doc(db, 'clientes', cotizacion.cliente_id))
    if (c.exists()) {
      clienteNombre = c.data().nombre as string
      clienteNit = (c.data().nit as string) || undefined
    }
  }

  const consecutivo = await obtenerConsecutivo()
  const ahora = Timestamp.now()
  const etiqueta = cotizacion.version_activa >= 2 ? ` v${cotizacion.version_activa}` : ''

  const proyecto: Omit<Proyecto, 'id'> = {
    consecutivo,
    origen: 'cotizacion',
    cotizacion_id: cotizacion.id,
    cotizacion_consecutivo: cotizacion.consecutivo,
    cotizacion_version: cotizacion.version_activa,
    ...(cotizacion.cliente_id ? { cliente_id: cotizacion.cliente_id } : {}),
    ...(cotizacion.prospecto_nombre ? { prospecto_nombre: cotizacion.prospecto_nombre } : {}),
    snapshot: construirSnapshotProyecto(cotizacion, version, clienteNombre, clienteNit),
    estado: 'creado',
    historial: [{
      a: 'creado', por: uid, fecha: ahora,
      motivo: `Proyecto creado al aprobar ${cotizacion.consecutivo}${etiqueta}`,
    }],
    creado_por: uid,
    fecha_creacion: ahora,
  }

  await setDoc(refProyecto, proyecto)
  await updateDoc(doc(db, 'cotizaciones', cotizacion.id), {
    proyecto_id: refProyecto.id, proyecto_consecutivo: consecutivo,
  })
  return { id: refProyecto.id, consecutivo, creado: true }
}
