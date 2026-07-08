import { useState, useEffect, useCallback } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { toast } from '../../components/shared/Toast'
import type { Solicitud } from '../../types/sigp/solicitud'
import type { Cliente } from '../../types/sigp/cliente'

/**
 * Carga el detalle de una solicitud + el cliente asociado (si tiene cliente_id).
 */
export function useSolicitudDetalle(id: string | undefined) {
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [loading, setLoading] = useState(true)
  const [noEncontrada, setNoEncontrada] = useState(false)

  const reload = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setNoEncontrada(false)
    try {
      const snap = await getDoc(doc(db, 'solicitudes', id))
      if (!snap.exists()) {
        setSolicitud(null)
        setNoEncontrada(true)
        return
      }
      const s = { id: snap.id, ...snap.data() } as Solicitud
      setSolicitud(s)
      if (s.cliente_id) {
        const cSnap = await getDoc(doc(db, 'clientes', s.cliente_id))
        setCliente(cSnap.exists() ? ({ id: cSnap.id, ...cSnap.data() } as Cliente) : null)
      } else {
        setCliente(null)
      }
    } catch {
      toast('Error al cargar la solicitud', 'error')
      setSolicitud(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { reload() }, [reload])

  return { solicitud, cliente, loading, noEncontrada, reload }
}
