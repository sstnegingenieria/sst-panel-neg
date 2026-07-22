// Asunto enlazado solicitud ↔ cotización (Bloque B, 22-jul-2026).
//
// El asunto es UN solo dato canónico que vive en la solicitud. Las
// cotizaciones enlazadas (solicitud_id) llevan un espejo en el padre
// (`cotizaciones/{id}.asunto`) que SOLO se escribe vía `propagarAsunto`:
// editar el asunto en la solicitud o en cualquier cotización enlazada pasa
// por aquí y actualiza todo en UN batch atómico → nunca divergen.
//
// Reglas de snapshot que este helper RESPETA (no toca):
//  - El proyecto congela el asunto en `snapshot.asunto` al nacer (F2.1.a).
//  - El PDF de una versión enviada es evidencia inmutable: si el asunto vivo
//    cambia después de generarlo, NO se reescribe el PDF — se marca
//    `pdf_desactualizado` en el padre para que el usuario reenvíe con una
//    nueva versión si lo necesita. El flag se limpia al generar el
//    siguiente PDF (envío) o al crear una nueva versión.

import {
  collection, doc, getDocs, query, where, writeBatch, Timestamp,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import type { EstadoCotizacion } from '../../types/sigp/cotizacion'

// ── Planificador PURO (unit-testeable, sin Firestore) ─────────────────────────

export interface CotizacionEnlazada {
  id: string
  estado: EstadoCotizacion
  asunto?: string
}

export interface PasoPropagacion {
  cotizacion_id: string
  /** false cuando el asunto ya es idéntico (no se escribe nada). */
  actualizar: boolean
  /** true solo para cotizaciones ENVIADAS cuyo asunto realmente cambió:
   *  su PDF quedó generado con el asunto anterior. */
  marcar_pdf_desactualizado: boolean
}

export function planPropagacionAsunto(
  nuevoAsunto: string,
  cotizaciones: CotizacionEnlazada[],
): PasoPropagacion[] {
  const asunto = nuevoAsunto.trim()
  return cotizaciones.map(c => {
    const cambia = (c.asunto ?? '').trim() !== asunto
    return {
      cotizacion_id: c.id,
      actualizar: cambia,
      // 'enviada' es el único estado con un PDF vigente frente al cliente
      // (aprobada/rechazada son cierre: su PDF es evidencia histórica y el
      // reenvío pasa por nueva versión, que regenera el PDF con el asunto vivo).
      marcar_pdf_desactualizado: cambia && c.estado === 'enviada',
    }
  })
}

// ── Escritura atómica ─────────────────────────────────────────────────────────

/**
 * Escribe el asunto canónico en la solicitud y lo propaga a TODAS las
 * cotizaciones enlazadas en un solo batch. Devuelve cuántas cotizaciones
 * se sincronizaron. Los permisos no cambian: solicitudes y cotizaciones
 * comparten la misma regla de escritura (puedeGestionarProyectos).
 */
export async function propagarAsunto(opts: {
  solicitudId: string
  asunto: string
}): Promise<number> {
  const asunto = opts.asunto.trim()
  const ahora = Timestamp.now()

  const enlazadas = await getDocs(
    query(collection(db, 'cotizaciones'), where('solicitud_id', '==', opts.solicitudId)),
  )
  const pasos = planPropagacionAsunto(
    asunto,
    enlazadas.docs.map(d => ({
      id: d.id,
      estado: d.data().estado as EstadoCotizacion,
      asunto: d.data().asunto as string | undefined,
    })),
  )

  const batch = writeBatch(db)
  batch.update(doc(db, 'solicitudes', opts.solicitudId), { asunto, fecha_actualizacion: ahora })
  let sincronizadas = 0
  for (const p of pasos) {
    if (!p.actualizar) continue
    batch.update(doc(db, 'cotizaciones', p.cotizacion_id), {
      asunto,
      fecha_actualizacion: ahora,
      ...(p.marcar_pdf_desactualizado ? { pdf_desactualizado: true } : {}),
    })
    sincronizadas++
  }
  await batch.commit()
  return sincronizadas
}
