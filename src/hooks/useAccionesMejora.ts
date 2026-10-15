import { useCallback } from 'react'
import { addDoc, collection, doc, getDoc, getDocs, orderBy, query, Timestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import {
  construirAlta, patchAnular, patchEditar,
  type AccionFormData, type AccionMejora, type AccionMejoraConId, type Actor,
} from '../types/sigp/accionMejora'

const COL = 'acciones_mejora'

/**
 * CRUD de acciones de mejora (F1). `addDoc`/`updateDoc` directos (no
 * useFirestore): el alta ya trae su `fecha_creacion` y cada patch su
 * `fecha_actualizacion` — un hecho, un lugar. No hay `remove`: la baja es
 * SOLO por anulación (evidencia de auditoría; la regla también deniega delete).
 * Todo write sale de los builders puros de types/sigp/accionMejora.ts.
 */
export function useAccionesMejora() {
  const cargar = useCallback(async (): Promise<AccionMejoraConId[]> => {
    const snap = await getDocs(query(collection(db, COL), orderBy('fecha_creacion', 'desc')))
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as AccionMejora) }))
  }, [])

  const cargarUna = useCallback(async (id: string): Promise<AccionMejoraConId | null> => {
    const snap = await getDoc(doc(db, COL, id))
    return snap.exists() ? { id: snap.id, ...(snap.data() as AccionMejora) } : null
  }, [])

  /** Devuelve el id nuevo, o null si el formulario no valida (sin escribir). */
  const crear = useCallback(async (form: AccionFormData, actor: Actor): Promise<string | null> => {
    const alta = construirAlta(form, actor, Timestamp.now())
    if (!alta) return null
    const ref = await addDoc(collection(db, COL), alta)
    return ref.id
  }, [])

  /** false si no es legal (no es borrador / no valida): no escribe. */
  const editar = useCallback(async (
    accion: AccionMejoraConId, form: AccionFormData, actor: Actor,
  ): Promise<boolean> => {
    const patch = patchEditar(accion, form, actor, Timestamp.now())
    if (!patch) return false
    await updateDoc(doc(db, COL, accion.id), patch as Record<string, unknown>)
    return true
  }, [])

  /** false si no es legal (ya anulada / sin motivo): no escribe. */
  const anular = useCallback(async (
    accion: AccionMejoraConId, motivo: string, actor: Actor,
  ): Promise<boolean> => {
    const patch = patchAnular(accion, motivo, actor, Timestamp.now())
    if (!patch) return false
    await updateDoc(doc(db, COL, accion.id), patch as Record<string, unknown>)
    return true
  }, [])

  return { cargar, cargarUna, crear, editar, anular }
}
