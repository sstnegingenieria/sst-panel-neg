// src/utils/sigp/propuestaActividad.ts
//
// Orquestación de EMISIÓN de la propuesta económica (F1.2): fotografía →
// PDF con el generador de cotización (CERO cambios al generador — recibe el
// objeto plano DatosPdfCotizacion) → SHA-256 → Storage → writeBatch ATÓMICO
// (doc de la versión + swap vigente/histórica + punteros de actividades).
// El consecutivo PEA lo genera el COMPONENTE vía useConsecutivo('PEA') SOLO
// en la v1 (re-emitir no llama la CF — mismo PEA por negociación).
//
// El PDF se sube ANTES del batch: si el batch falla queda un archivo huérfano
// en una ruta determinística que el reintento SOBREESCRIBE (docId estable) —
// jamás un doc emitido sin PDF.
import {
  Timestamp, arrayUnion, collection, doc, getDocs, query, where, writeBatch,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '../../firebase/config'
import { cargarAssetsPdf, generarPdfCotizacion, sha256Hex } from './cotizacionPdf'
import type { DatosPdfCotizacion } from './cotizacionPdf'
import {
  construirFotoPropuesta, idPropuesta, VALIDEZ_DIAS_DEFAULT,
} from '../../types/sigp/propuestaActividad'
import type { PropuestaActividad } from '../../types/sigp/propuestaActividad'
import { patchVincularPropuesta, patchDesvincularPropuesta } from '../../types/sigp/actividad'
import type { Actividad } from '../../types/sigp/actividad'
import type { Cliente } from '../../types/sigp/cliente'
import type { CondicionesCotizacion } from '../../types/sigp/cotizacion'

export interface EmisionPropuestaInput {
  /** v1: recién quemado por la CF · re-emisión: el consecutivo de la serie. */
  consecutivo: string
  /** La VIGENTE actual de la serie (solo re-emisión) — se historiza en el batch. */
  reemplazaA?: PropuestaActividad
  cliente: Cliente
  /** El conjunto de ESTA versión (puede diferir del de la anterior). */
  actividades: Actividad[]
  asunto: string
  condiciones: CondicionesCotizacion
  observaciones?: string
  firmante: { nombre: string; correo?: string; celular?: string }
  uid: string
}

export async function emitirVersionPropuesta(input: EmisionPropuestaInput): Promise<PropuestaActividad> {
  const { consecutivo, reemplazaA, cliente, actividades, uid } = input
  const version = (reemplazaA?.version ?? 0) + 1
  if (reemplazaA && reemplazaA.estado !== 'vigente') {
    throw new Error('Solo se re-emite desde la versión vigente')
  }

  const foto = construirFotoPropuesta(actividades, cliente, reemplazaA?.consecutivo)
  if (!foto) throw new Error('El conjunto no es proponible (sin valorizar, anulada o de otro cliente)')

  const docId = idPropuesta(consecutivo, version)

  // Solicitante único entre las actividades → CONTACTO del PDF; varios → sin fila.
  const solicitantes = [...new Set(actividades.map(a => a.solicitante).filter(Boolean))] as string[]

  const datos: DatosPdfCotizacion = {
    consecutivo,
    versionNum: version,
    asunto: input.asunto,
    clienteNombre: cliente.nombre,
    ...(cliente.nit ? { clienteNit: cliente.nit } : {}),
    ...(solicitantes.length === 1 ? { contacto: solicitantes[0] } : {}),
    fechaEmision: new Date(),
    validezDias: input.condiciones.validez_dias || VALIDEZ_DIAS_DEFAULT,
    esquema: foto.esquema,
    ...(foto.aiu ? { aiu: foto.aiu } : {}),
    ivaPct: foto.iva_pct,
    items: foto.items,
    totales: foto.totales,
    modo: 'actividad',
    actividades: foto.grupos,
    condiciones: input.condiciones,
    ...(input.observaciones?.trim() ? { observaciones: input.observaciones.trim() } : {}),
    firmante: input.firmante,
  }

  const assets = await cargarAssetsPdf()
  const bytes = await generarPdfCotizacion(datos, assets)
  const hash = await sha256Hex(bytes)

  // Ruta con el CLIENTE en el path — la regla de Storage autoriza por claim
  // (esInterno() || esResidenteDeStorage(clienteId), §5b).
  const rutaPdf = `propuestas_actividad/${cliente.id}/${docId}/documento.pdf`
  const refPdf = ref(storage, rutaPdf)
  await uploadBytes(refPdf, new Blob([bytes as BlobPart], { type: 'application/pdf' }), { contentType: 'application/pdf' })
  const pdfUrl = await getDownloadURL(refPdf)

  const ahora = Timestamp.now()
  const propuesta: PropuestaActividad = {
    id: docId,
    consecutivo,
    version,
    estado: 'vigente',
    ...(reemplazaA ? { reemplaza_a: reemplazaA.id } : {}),
    cliente_id: cliente.id,
    cliente_nombre: cliente.nombre,
    actividad_ids: foto.actividad_ids,
    asunto: input.asunto,
    esquema: foto.esquema,
    ...(foto.aiu ? { aiu: foto.aiu } : {}),
    iva_pct: foto.iva_pct,
    items: foto.items,
    grupos: foto.grupos,
    totales: foto.totales,
    condiciones: input.condiciones,
    ...(input.observaciones?.trim() ? { observaciones: input.observaciones.trim() } : {}),
    fecha_emision: ahora,
    firmante: input.firmante,
    emitida_por: uid,
    pdf_hash: hash,
    pdf_url: pdfUrl,
    fecha_creacion: ahora,
  }

  // ── writeBatch ATÓMICO: versión nueva + swap + punteros (todo o nada) ──
  const batch = writeBatch(db)
  const { id: _id, ...datosDoc } = propuesta
  batch.set(doc(db, 'propuestas_actividad', docId), datosDoc)

  if (reemplazaA) {
    batch.update(doc(db, 'propuestas_actividad', reemplazaA.id), {
      estado: 'historica', fecha_actualizacion: ahora,
    })
  }

  for (const a of actividades) {
    const patch = patchVincularPropuesta(a, docId, consecutivo)
    if (!patch) continue // anulada no llega aquí (la foto lo impide); defensa
    batch.update(doc(db, 'actividades', a.id), {
      ...patch, fecha_actualizacion: ahora,
      historial: arrayUnion({ fecha: ahora, por: uid, accion: `propuesta ${consecutivo} v${version} emitida` }),
    })
  }

  if (reemplazaA) {
    const nuevas = new Set(foto.actividad_ids)
    for (const idSaliente of reemplazaA.actividad_ids.filter(x => !nuevas.has(x))) {
      const patch = patchDesvincularPropuesta({ propuesta_id: reemplazaA.id, propuesta_consecutivo: reemplazaA.consecutivo })
      if (!patch) continue
      batch.update(doc(db, 'actividades', idSaliente), {
        ...patch, fecha_actualizacion: ahora,
        historial: arrayUnion({ fecha: ahora, por: uid, accion: `salió de la propuesta ${consecutivo} (v${version})` }),
      })
    }
  }

  await batch.commit()
  return propuesta
}

/** Propuestas del cliente (todas las versiones; agrupar con seriesDe()). */
export async function cargarPropuestasDe(clienteId: string): Promise<PropuestaActividad[]> {
  const snap = await getDocs(query(collection(db, 'propuestas_actividad'), where('cliente_id', '==', clienteId)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as PropuestaActividad)
}
