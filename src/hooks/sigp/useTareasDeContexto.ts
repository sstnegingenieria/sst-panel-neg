// Tareas de un documento de contexto (AC/AP Fase 2: las actividades del plan
// PHVA de una acción de mejora, leídas de vuelta y agrupadas por fase).
//
// Consulta: DOS igualdades (contexto.tipo + contexto.id) → se sirve con los
// índices de campo único, sin índice compuesto (convención del proyecto). NO
// filtra por `activa`: AC/AP necesita ver también las hechas/anuladas. La
// regla de lectura es esPersonalPanel() — cualquier rol del panel puede
// listar, así que la query es legal sin acotar por asignado.
import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import type { ContextoTarea, TareaConId } from '../../types/sigp/tarea'
import { agruparPorFase } from '../../utils/sigp/tareasUi'

export function useTareasDeContexto(
  tipo: ContextoTarea['tipo'],
  contextoId: string | undefined,
) {
  const [tareas, setTareas] = useState<TareaConId[]>([])
  const [loading, setLoading] = useState(!!contextoId)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!contextoId) { setTareas([]); setLoading(false); setError(false); return }
    setLoading(true); setError(false)
    return onSnapshot(
      query(collection(db, 'tareas'),
        where('contexto.tipo', '==', tipo), where('contexto.id', '==', contextoId)),
      snap => {
        setTareas(snap.docs.map(d => ({ id: d.id, ...d.data() }) as TareaConId))
        setLoading(false)
      },
      () => { setTareas([]); setError(true); setLoading(false) },
    )
  }, [tipo, contextoId])

  const porFase = useMemo(() => agruparPorFase(tareas), [tareas])
  return { tareas, porFase, loading, error }
}
