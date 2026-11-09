/**
 * Datos del CHECKLIST DE REQUISITOS de una licitación (A.2b).
 *
 * Lectura PUNTUAL con `getDocs` (patrón `useFirestore` de la casa): el
 * checklist de un pliego lo trabaja una persona de punta a punta, no necesita
 * tiempo real.
 *
 * ── TODA ESCRITURA PASA POR UN PATCH BUILDER PURO ───────────────────────────
 *
 * Este hook NO construye documentos ni decide estados. Llama a los builders de
 * `types/sigp/requisito.ts` y persiste EXACTAMENTE lo que devuelven; si un
 * builder devuelve `null`, no se escribe nada. Es el patrón de la casa desde
 * `tarea.ts`, y acá importa especialmente porque las cuatro invariantes del
 * requisito y las cuatro guardas del `create` de las reglas viven en esos
 * builders: una escritura "a mano" desde la UI sería un quinto camino sin
 * dueño.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  Timestamp, collection, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore'
import { db } from '../../firebase/config'
import {
  nuevoRequisito, requisitosDesdePlantilla, patchMarcarRequisito, patchActivoRequisito,
} from '../../types/sigp/requisito'
import type {
  Requisito, EstadoRequisito, DatosNuevoRequisito, DatosVeredicto,
} from '../../types/sigp/requisito'
import {
  construirSemillaPlantillaRequisitos, itemsPlantillaVigente,
} from '../../types/sigp/plantillaRequisitos'
import type { RegistroPlantillaRequisitos } from '../../types/sigp/plantillaRequisitos'

export type RequisitoConId = Requisito & { id: string }

const REF_PLANTILLA = ['configuracion', 'plantilla_requisitos'] as const

export function useRequisitos(licitacionId: string | undefined, actorUid: string) {
  const [requisitos, setRequisitos] = useState<RequisitoConId[]>([])
  const [plantilla, setPlantilla] = useState<RegistroPlantillaRequisitos | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    if (!licitacionId) return
    setCargando(true)
    setError(null)
    try {
      const snap = await getDocs(collection(db, 'licitaciones', licitacionId, 'requisitos'))
      setRequisitos(snap.docs.map(d => ({ id: d.id, ...d.data() }) as RequisitoConId))
    } catch {
      setError('No se pudieron cargar los requisitos')
      setRequisitos([])
    } finally {
      setCargando(false)
    }
  }, [licitacionId])

  // La plantilla se lee aparte: que no exista NO es un error — es el estado
  // "sin plantilla cargada", que la UI muestra bifurcado por rol.
  const recargarPlantilla = useCallback(async () => {
    try {
      const d = await getDoc(doc(db, ...REF_PLANTILLA))
      setPlantilla(d.exists() ? (d.data() as RegistroPlantillaRequisitos) : null)
    } catch {
      setPlantilla(null)
    }
  }, [])

  useEffect(() => { void recargar() }, [recargar])
  useEffect(() => { void recargarPlantilla() }, [recargarPlantilla])

  const actor = { uid: actorUid }

  /** Captura a mano. Devuelve false si el builder rechazó los datos. */
  const crear = useCallback(async (d: DatosNuevoRequisito) => {
    if (!licitacionId) return false
    const nuevo = nuevoRequisito(d, actor, Timestamp.now())
    if (!nuevo) return false
    const ref = doc(collection(db, 'licitaciones', licitacionId, 'requisitos'))
    await setDoc(ref, nuevo)
    await recargar()
    return true
  }, [licitacionId, actorUid, recargar])

  /**
   * Carga el checklist desde la plantilla vigente. Un solo `writeBatch`: o
   * entran los 22 renglones o no entra ninguno — un checklist a medias se
   * parece demasiado a uno completo.
   */
  const cargarDesdePlantilla = useCallback(async () => {
    if (!licitacionId || !plantilla) return 0
    const items = itemsPlantillaVigente(plantilla)
    const nuevos = requisitosDesdePlantilla(items, actor, Timestamp.now())
    if (nuevos.length === 0) return 0
    const batch = writeBatch(db)
    for (const r of nuevos) {
      batch.set(doc(collection(db, 'licitaciones', licitacionId, 'requisitos')), r)
    }
    await batch.commit()
    await recargar()
    return nuevos.length
  }, [licitacionId, plantilla, actorUid, recargar])

  /**
   * Siembra `configuracion/plantilla_requisitos` con la sesión del usuario.
   *
   * Las reglas autorizan este write a gerencia_general, director_proyectos y
   * admin (`editaPlantillaRequisitos()`), así que no hace falta llave de
   * escritura ni script: quien tiene el rol lo hace desde la pantalla y queda
   * registrado como `autor_uid`. El script de siembra sigue existiendo como
   * respaldo.
   */
  const sembrarPlantilla = useCallback(async () => {
    const semilla = construirSemillaPlantillaRequisitos(actorUid, Timestamp.now())
    await setDoc(doc(db, ...REF_PLANTILLA), semilla)
    await recargarPlantilla()
  }, [actorUid, recargarPlantilla])

  const marcar = useCallback(async (
    r: RequisitoConId, destino: EstadoRequisito, datos?: DatosVeredicto,
  ) => {
    if (!licitacionId) return false
    const patch = patchMarcarRequisito(r, destino, actor, Timestamp.now(), datos)
    if (!patch) return false
    await updateDoc(doc(db, 'licitaciones', licitacionId, 'requisitos', r.id), patch)
    await recargar()
    return true
  }, [licitacionId, actorUid, recargar])

  const setActivo = useCallback(async (r: RequisitoConId, activo: boolean) => {
    if (!licitacionId) return false
    const patch = patchActivoRequisito(r, activo, actor, Timestamp.now())
    if (!patch) return false
    await updateDoc(doc(db, 'licitaciones', licitacionId, 'requisitos', r.id), patch)
    await recargar()
    return true
  }, [licitacionId, actorUid, recargar])

  return {
    requisitos,
    plantilla,
    cargando,
    error,
    recargar,
    crear,
    cargarDesdePlantilla,
    sembrarPlantilla,
    marcar,
    setActivo,
  }
}
