import { useState, useEffect, useCallback } from 'react'
import { useFirestore } from '../useFirestore'
import { toast } from '../../components/shared/Toast'
import type { Cotizacion } from '../../types/sigp/cotizacion'

/**
 * Carga la bandeja de `cotizaciones`, ordenada por fecha de creación descendente.
 * Lectura puntual (getDocs). El padre denormaliza el resumen de la versión activa,
 * así que la lista no necesita leer la subcolección `versiones`.
 */
export function useCotizaciones() {
  const { getAllOrdered } = useFirestore()
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAllOrdered('cotizaciones', 'fecha_creacion', 'desc')
      setCotizaciones(data as Cotizacion[])
    } catch {
      toast('Error al cargar las cotizaciones', 'error')
      setCotizaciones([])
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload() }, [reload])

  return { cotizaciones, loading, reload }
}
