import { useState, useEffect, useCallback } from 'react'
import { useFirestore } from '../useFirestore'
import { toast } from '../../components/shared/Toast'
import type { Visita } from '../../types/sigp/visita'

/**
 * Carga la bandeja de `visitas`, ordenada por fecha de creación descendente.
 * Lectura puntual (getDocs), como el resto del panel.
 */
export function useVisitas() {
  const { getAllOrdered } = useFirestore()
  const [visitas, setVisitas] = useState<Visita[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAllOrdered('visitas', 'fecha_creacion', 'desc')
      setVisitas(data as Visita[])
    } catch {
      toast('Error al cargar las visitas', 'error')
      setVisitas([])
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload() }, [reload])

  return { visitas, loading, reload }
}
