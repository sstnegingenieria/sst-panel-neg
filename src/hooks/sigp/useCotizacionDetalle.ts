import { useState, useEffect, useCallback } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { toast } from '../../components/shared/Toast'
import type { Cotizacion, VersionCotizacion } from '../../types/sigp/cotizacion'
import type { Cliente } from '../../types/sigp/cliente'

/**
 * Carga una cotización (padre) + su versión ACTIVA (subcolección) + el cliente.
 */
export function useCotizacionDetalle(id: string | undefined) {
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null)
  const [version, setVersion] = useState<VersionCotizacion | null>(null)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [loading, setLoading] = useState(true)
  const [noEncontrada, setNoEncontrada] = useState(false)

  const reload = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setNoEncontrada(false)
    try {
      const snap = await getDoc(doc(db, 'cotizaciones', id))
      if (!snap.exists()) { setCotizacion(null); setNoEncontrada(true); return }
      const c = { id: snap.id, ...snap.data() } as Cotizacion
      setCotizacion(c)
      const [vSnap, cliSnap] = await Promise.all([
        getDoc(doc(db, 'cotizaciones', id, 'versiones', String(c.version_activa))),
        c.cliente_id ? getDoc(doc(db, 'clientes', c.cliente_id)) : Promise.resolve(null),
      ])
      setVersion(vSnap.exists() ? ({ id: vSnap.id, ...vSnap.data() } as VersionCotizacion) : null)
      setCliente(cliSnap && cliSnap.exists() ? ({ id: cliSnap.id, ...cliSnap.data() } as Cliente) : null)
    } catch {
      toast('Error al cargar la cotización', 'error')
      setCotizacion(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { reload() }, [reload])

  return { cotizacion, version, cliente, loading, noEncontrada, reload }
}
