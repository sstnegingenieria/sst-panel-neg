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
import { precioPreventivo, INTENSIDAD_LABEL, TIPO_SITIO_LABEL } from '../../types/sigp/preventivos'
import type { Proyecto } from '../../types/sigp/proyecto'
import type { Cotizacion, VersionCotizacion } from '../../types/sigp/cotizacion'
import type { Solicitud } from '../../types/sigp/solicitud'

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

/**
 * Nacimiento del proyecto desde una SOLICITUD PREVENTIVO aceptada (F2.2).
 * Mismo contrato de idempotencia que el origen cotización: el id del doc en
 * `proyectos` ES el id de la solicitud → 1 proyecto por preventivo aceptado.
 * El valor de venta sale de la MATRIZ IHS (precioPreventivo); esquema IVA
 * pleno (el IVA se aplica aguas abajo, en la facturación de Administrativa).
 */
export async function crearProyectoDesdePreventivo(opts: {
  solicitud: Solicitud
  uid: string
  obtenerConsecutivo: () => Promise<string>
}): Promise<ResultadoCrearProyecto> {
  const { solicitud, uid, obtenerConsecutivo } = opts
  const p = solicitud.preventivo
  if (solicitud.tipo !== 'preventivo' || !p) throw new Error('La solicitud no es un preventivo')

  const refProyecto = doc(db, 'proyectos', solicitud.id)
  const existente = await getDoc(refProyecto)
  if (existente.exists()) {
    const consecutivo = (existente.data() as Proyecto).consecutivo
    if (solicitud.proyecto_id !== refProyecto.id) {
      await updateDoc(doc(db, 'solicitudes', solicitud.id), {
        proyecto_id: refProyecto.id, proyecto_consecutivo: consecutivo,
      })
    }
    return { id: refProyecto.id, consecutivo, creado: false }
  }

  const precio = precioPreventivo({
    zona: p.zona, tipo: p.tipo_sitio, intensidad: p.intensidad,
    es_jungle: p.es_jungle, es_sai: p.es_sai,
  })
  if (!precio) throw new Error('Combinación no disponible en la matriz de precios')

  let clienteNombre: string | undefined
  let clienteNit: string | undefined
  if (solicitud.cliente_id) {
    const c = await getDoc(doc(db, 'clientes', solicitud.cliente_id))
    if (c.exists()) {
      clienteNombre = c.data().nombre as string
      clienteNit = (c.data().nit as string) || undefined
    }
  }

  const renglon = `Mantenimiento preventivo ${INTENSIDAD_LABEL[p.intensidad].toLowerCase()} — ${p.sitio_nombre}`
  const consecutivo = await obtenerConsecutivo()
  const ahora = Timestamp.now()

  const proyecto: Omit<Proyecto, 'id'> = {
    consecutivo,
    origen: 'preventivo',
    solicitud_id: solicitud.id,
    solicitud_consecutivo: solicitud.consecutivo,
    ...(solicitud.cliente_id ? { cliente_id: solicitud.cliente_id } : {}),
    snapshot: {
      cliente: clienteNombre ?? solicitud.prospecto_nombre ?? 'IHS',
      ...(clienteNit ? { cliente_nit: clienteNit } : {}),
      asunto: `${renglon} (${TIPO_SITIO_LABEL[p.tipo_sitio]}${p.es_jungle ? ' · jungle' : ''}${p.es_sai ? ' · SAI' : ''} · ${p.zona})`,
      // Bloque 1 — identificación del sitio: capturada en la solicitud (con
      // autocompletado desde el sitio IHS) o derivada de él como fallback
      nombre_sitio: solicitud.nombre_sitio?.trim() || p.sitio_nombre,
      codigo_sitio_cliente: solicitud.codigo_sitio_cliente?.trim() || p.sitio_id || 'N/A',
      valor_venta: precio.total,
      esquema_tributario: 'iva_pleno',
      alcance: [{ grupo: renglon, items: 1, subtotal: precio.total }],
      total_items: 1,
    },
    estado: 'creado',
    historial: [{
      a: 'creado', por: uid, fecha: ahora,
      motivo: `Proyecto creado al aceptar el preventivo ${solicitud.consecutivo} — precio de matriz ${p.zona}/${p.tipo_sitio}/${p.intensidad}${p.es_jungle ? ' jungle' : ''}${precio.transporte ? ' + transporte' : ''}`,
    }],
    creado_por: uid,
    fecha_creacion: ahora,
  }

  await setDoc(refProyecto, proyecto)
  await updateDoc(doc(db, 'solicitudes', solicitud.id), {
    proyecto_id: refProyecto.id, proyecto_consecutivo: consecutivo,
  })
  return { id: refProyecto.id, consecutivo, creado: true }
}
