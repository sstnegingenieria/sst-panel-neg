import { useState, useEffect, useCallback } from 'react'
import { useFirestore } from '../useFirestore'
import { toast } from '../../components/shared/Toast'
import type { LPU } from '../../types/sigp/lpu'

/**
 * Carga las LPU de la colección `lpus`, ordenadas por fecha de importación
 * descendente (más recientes primero). Lectura puntual (getDocs) como el resto
 * del panel; el wizard de importación llama a `reload()` tras escribir.
 */
export function useLpus() {
  const { getAllOrdered } = useFirestore()
  const [lpus, setLpus] = useState<LPU[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAllOrdered('lpus', 'fecha_importacion', 'desc')
      setLpus(data as LPU[])
    } catch {
      toast('Error al cargar las LPU', 'error')
      setLpus([])
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload() }, [reload])

  return { lpus, loading, reload }
}
