// Módulo Tareas (14-ago-2026) — contadores VIVOS de "mis tareas" y "balón en
// mi cancha". Patrón EXACTO de usePendientesSigp: dos onSnapshot, filtro de
// estado CLIENT-SIDE (equality + in requeriría índice compuesto — convención
// del proyecto). Alimenta el badge clickeable del Sidebar y se REUSA tal
// cual en la página /tareas y en el pop-up RecordatorioTareas (misma
// suscripción, sin consultas nuevas).
import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import type { TareaConId } from '../../types/sigp/tarea'

export function useTareasPendientes(activo: boolean, uid: string | undefined) {
  const [tareasAsignadas, setTareasAsignadas] = useState<TareaConId[]>([])
  const [balonesTareas, setBalonesTareas] = useState<TareaConId[]>([])

  useEffect(() => {
    if (!activo || !uid) {
      setTareasAsignadas([])
      setBalonesTareas([])
      return
    }
    const unsubAsignadas = onSnapshot(
      query(collection(db, 'tareas'), where('asignada_a', '==', uid)),
      snap => setTareasAsignadas(snap.docs.map(d => ({ id: d.id, ...d.data() }) as TareaConId)),
      () => setTareasAsignadas([]),
    )
    const unsubBalon = onSnapshot(
      query(collection(db, 'tareas'), where('balon_en.uid', '==', uid)),
      snap => setBalonesTareas(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }) as TareaConId)
          .filter(t => t.estado === 'en_espera'),
      ),
      () => setBalonesTareas([]),
    )
    return () => { unsubAsignadas(); unsubBalon() }
  }, [activo, uid])

  const misTareas = tareasAsignadas.filter(t => t.estado === 'pendiente' || t.estado === 'en_curso').length
  const balones = balonesTareas.length

  return { misTareas, tareasAsignadas, balones, balonesTareas }
}
