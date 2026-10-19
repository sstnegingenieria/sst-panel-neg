import { useCallback, useRef } from 'react'
import { addDoc, collection, doc, getDoc, getDocs, orderBy, query, Timestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useConsecutivo } from './sigp/useConsecutivo'
import {
  PREFIJO_POR_TIPO, anioUtcDe, consecutivoAcApValido, construirAlta, faltantesParaEmitir,
  patchAnular, patchEditar, patchEmitir,
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
  const { obtener } = useConsecutivo()
  // Patrón SOL/VIS/COT/OC: el consecutivo, una vez consumido en la CF, se guarda
  // por acción; si el write posterior falla, el reintento lo REUTILIZA en vez de
  // quemar otro número (cero huecos accidentales en la serie).
  const pendientesRef = useRef<Record<string, string>>({})

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

  /**
   * EMITIR (borrador → abierta): pide el consecutivo a la CF (prefijo según el
   * tipo) y lo escribe junto con el estado en UN solo update. Si el write falla
   * LANZA, y el número queda preservado para el reintento. Un número preservado
   * de otro año (la regla exige el año en curso) se descarta y se pide uno nuevo.
   * Devuelve `{ ok: false, faltantes }` — sin tocar la CF — si no está completa.
   */
  const emitir = useCallback(async (
    accion: AccionMejoraConId, actor: Actor,
  ): Promise<{ ok: true; consecutivo: string } | { ok: false; faltantes: string[] }> => {
    const faltantes = faltantesParaEmitir(accion)
    if (faltantes.length > 0) return { ok: false, faltantes }
    const ahora = Timestamp.now()
    let consecutivo = pendientesRef.current[accion.id]
    if (consecutivo && !consecutivoAcApValido(consecutivo, accion.tipo, anioUtcDe(ahora))) {
      delete pendientesRef.current[accion.id]
      consecutivo = ''
    }
    if (!consecutivo) {
      consecutivo = await obtener(PREFIJO_POR_TIPO[accion.tipo])
      pendientesRef.current[accion.id] = consecutivo
    }
    const patch = patchEmitir(accion, consecutivo, actor, ahora)
    if (!patch) return { ok: false, faltantes: ['La acción no se puede emitir'] }
    await updateDoc(doc(db, COL, accion.id), patch as Record<string, unknown>)
    delete pendientesRef.current[accion.id]
    return { ok: true, consecutivo }
  }, [obtener])

  return { cargar, cargarUna, crear, editar, anular, emitir }
}
