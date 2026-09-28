// utils/sigp/asignaciones.ts
//
// P2-2 · SB3 — orquestación Firestore de las asignaciones múltiples: lectura
// de la subcolección, MIGRACIÓN LAZY (mismo builder que la masiva — una sola
// implementación) y escrituras en writeBatch (sub-doc + resumen del padre,
// atómico). La UI no improvisa writes: todo pasa por los builders puros de
// types/sigp/asignacion.ts.
import {
  collection, doc, getDocs, writeBatch, deleteField, arrayUnion, Timestamp,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import {
  sintetizarAsignacionLegacy, resumenAsignacionesDe, patchCancelarProyecto,
} from '../../types/sigp/asignacion'
import type { AsignacionContratista, DatosCierreAnticipado } from '../../types/sigp/asignacion'
import type { Proyecto, CierreAnticipado } from '../../types/sigp/proyecto'

export async function cargarAsignaciones(proyectoId: string): Promise<AsignacionContratista[]> {
  const snap = await getDocs(collection(db, 'proyectos', proyectoId, 'asignaciones'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as AsignacionContratista)
}

/**
 * MIGRACIÓN LAZY (decisión 2 aprobada): al primer write económico sobre un
 * proyecto NO migrado, se migra ese proyecto primero — Marcela nunca espera
 * la masiva. Sintetiza el sub-doc legacy (MISMO builder que el script), retira
 * la ECONOMÍA del padre (preliquidacion/compras_reembolsos — `asignacion` se
 * CONSERVA como espejo de identidad del principal: obraEspejo, la proyección
 * SST y la evaluación lo leen hasta P2-3) y siembra el resumen. Idempotente:
 * con sub-docs existentes no hace nada.
 * Devuelve las asignaciones vigentes tras migrar (o las existentes).
 */
export function planMigracionLegacy(p: Proyecto): {
  subdoc: Omit<AsignacionContratista, 'id'>
  patchPadre: Record<string, unknown>
} | null {
  const legacy = sintetizarAsignacionLegacy(p)
  if (!legacy) return null
  const resumen = resumenAsignacionesDe([{ ...legacy, id: 'legacy' }], p.snapshot.alcance ?? [])
  return {
    subdoc: legacy,
    patchPadre: {
      resumen_asignaciones: resumen,
      preliquidacion: deleteField(),
      compras_reembolsos: deleteField(),
      fecha_actualizacion: Timestamp.now(),
      // `asignacion` NO se toca (espejo de identidad — P2-3 lo resuelve).
    },
  }
}

/** Migra si hace falta y devuelve las asignaciones vigentes. */
export async function asegurarMigrado(
  p: Proyecto, subdocs: AsignacionContratista[],
): Promise<AsignacionContratista[]> {
  if (subdocs.length > 0 || !p.asignacion) return subdocs
  const plan = planMigracionLegacy(p)
  if (!plan) return subdocs
  const batch = writeBatch(db)
  const ref = doc(db, 'proyectos', p.id, 'asignaciones', 'legacy')
  batch.set(ref, plan.subdoc)
  batch.update(doc(db, 'proyectos', p.id), plan.patchPadre)
  await batch.commit()
  return [{ ...plan.subdoc, id: 'legacy' } as AsignacionContratista]
}

/** Escritura atómica estándar: patch del sub-doc (el caller ya le puso el
 *  arrayUnion del historial) + resumen recalculado en el padre.
 *  `todasTrasPatch` = el arreglo YA con el cambio aplicado — de ahí sale el
 *  resumen (fuente única, jamás aritmética incremental). */
export async function escribirAsignacion(
  proyectoId: string,
  alcance: Proyecto['snapshot']['alcance'],
  asignacionId: string,
  patchSub: Record<string, unknown>,
  todasTrasPatch: AsignacionContratista[],
  // 07-sep — puente materializado: campos EXTRA del padre en el MISMO batch
  // (p. ej. estado → liquidado_contratista + historial cuando la última
  // asignación viva queda liquidada). Atómico: sub + resumen + padre.
  patchPadreExtra?: Record<string, unknown>,
): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(db, 'proyectos', proyectoId, 'asignaciones', asignacionId), patchSub)
  batch.update(doc(db, 'proyectos', proyectoId), {
    resumen_asignaciones: resumenAsignacionesDe(todasTrasPatch, alcance ?? []),
    fecha_actualizacion: Timestamp.now(),
    ...(patchPadreExtra ?? {}),
  })
  await batch.commit()
}

/** Cierre anticipado (28-sep): ejecuta el patch del builder en UN writeBatch —
 *  padre (estado `cancelado` + cierre_anticipado + resumen + historial) +
 *  cascada de cancelaciones por asignación + la ANOTACIÓN denormalizada en la
 *  cotización (estado de la cotización INTACTO — se anota, no se reescribe).
 *  El caller pasa asignaciones YA migradas (asegurarMigrado). Devuelve el
 *  incurrido para el toast, o null si el builder rehusó. */
export async function ejecutarCierreAnticipado(
  p: Proyecto,
  asigs: AsignacionContratista[],
  comprasCf: number,
  datos: DatosCierreAnticipado,
  uid: string,
): Promise<CierreAnticipado['incurrido'] | null> {
  const r = patchCancelarProyecto(p, asigs, comprasCf, datos, uid, Timestamp.now())
  if (!r) return null
  const batch = writeBatch(db)
  for (const c of r.cancelaciones) {
    batch.update(doc(db, 'proyectos', p.id, 'asignaciones', c.id), {
      ...c.sub, historial: arrayUnion(c.entradaHistorial),
    })
  }
  batch.update(doc(db, 'proyectos', p.id), {
    ...r.padre,
    resumen_asignaciones: r.resumen,
    historial: arrayUnion(r.entradaHistorial),
  })
  if (p.origen !== 'preventivo' && p.cotizacion_id) {
    batch.update(doc(db, 'cotizaciones', p.cotizacion_id), {
      proyecto_cancelado: { fecha: Timestamp.now(), proyecto_consecutivo: p.consecutivo },
    })
  }
  await batch.commit()
  return r.incurrido
}

/** Alta de una asignación nueva (sub-doc + resumen). */
export async function crearAsignacion(
  proyectoId: string,
  alcance: Proyecto['snapshot']['alcance'],
  subdoc: Omit<AsignacionContratista, 'id'>,
  existentes: AsignacionContratista[],
): Promise<string> {
  const batch = writeBatch(db)
  const ref = doc(collection(db, 'proyectos', proyectoId, 'asignaciones'))
  batch.set(ref, subdoc)
  const todas = [...existentes, { ...subdoc, id: ref.id } as AsignacionContratista]
  batch.update(doc(db, 'proyectos', proyectoId), {
    resumen_asignaciones: resumenAsignacionesDe(todas, alcance ?? []),
    fecha_actualizacion: Timestamp.now(),
  })
  await batch.commit()
  return ref.id
}
