import { useState, useEffect, useCallback } from 'react'
import { useFirestore } from '../useFirestore'
import { toast } from '../../components/shared/Toast'
import type { Solicitud } from '../../types/sigp/solicitud'

/**
 * Carga la bandeja de `solicitudes`, ordenada por fecha de creación descendente
 * (las más recientes primero). Lectura puntual (getDocs), como el resto del panel.
 */
export function useSolicitudes() {
  const { getAllOrdered } = useFirestore()
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAllOrdered('solicitudes', 'fecha_creacion', 'desc')
      setSolicitudes(data as Solicitud[])
    } catch {
      toast('Error al cargar las solicitudes', 'error')
      setSolicitudes([])
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload() }, [reload])

  return { solicitudes, loading, reload }
}
