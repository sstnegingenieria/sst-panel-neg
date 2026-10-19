// Módulo Tareas (14-ago-2026) — contadores VIVOS de "mis tareas" y "balón en
// mi cancha". Patrón EXACTO de usePendientesSigp: dos onSnapshot, filtro de
// estado CLIENT-SIDE (equality + in requeriría índice compuesto — convención
// del proyecto). Alimenta el badge clickeable del Sidebar y se REUSA tal
// cual en la página /tareas y en el pop-up RecordatorioTareas (misma
// suscripción, sin consultas nuevas).
import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import type { TareaConId } from '../../types/sigp/tarea'
import { esTareaVencida } from '../../utils/sigp/tareasUi'

export function useTareasPendientes(activo: boolean, uid: string | undefined) {
  const [tareasAsignadas, setTareasAsignadas] = useState<TareaConId[]>([])
  const [balonesTareas, setBalonesTareas] = useState<TareaConId[]>([])
  // Reloj grueso (10 min): las vencidas dependen del DÍA, y un panel abierto
  // cruzando la medianoche no recibe snapshot nuevo que las recalcule.
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 10 * 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!activo || !uid) {
      setTareasAsignadas([])
      setBalonesTareas([])
      return
    }
    // SB2.2: acotadas a activas — igualdad+igualdad se sirve fusionando
    // índices de campo único (sin índice compuesto, convención del proyecto).
    const unsubAsignadas = onSnapshot(
      query(collection(db, 'tareas'), where('asignada_a', '==', uid), where('activa', '==', true)),
      snap => setTareasAsignadas(snap.docs.map(d => ({ id: d.id, ...d.data() }) as TareaConId)),
      () => setTareasAsignadas([]),
    )
    const unsubBalon = onSnapshot(
      query(collection(db, 'tareas'), where('balon_en.uid', '==', uid), where('activa', '==', true)),
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
  // Vencidas: TODAS las activas asignadas (incluye en_espera — el plazo no se
  // pausa por esperar a un tercero), no solo las que cuenta `misTareas`.
  const vencidas = useMemo(
    () => tareasAsignadas.filter(t => esTareaVencida(t, ahora)).length,
    [tareasAsignadas, ahora],
  )

  return { misTareas, tareasAsignadas, balones, balonesTareas, vencidas }
}
