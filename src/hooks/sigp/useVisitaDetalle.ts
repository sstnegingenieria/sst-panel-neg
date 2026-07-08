import { useState, useEffect, useCallback } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { toast } from '../../components/shared/Toast'
import type { Visita } from '../../types/sigp/visita'
import type { Cliente } from '../../types/sigp/cliente'
import type { Solicitud } from '../../types/sigp/solicitud'

/** Carga el detalle de una visita + cliente + solicitud vinculada (si aplica). */
export function useVisitaDetalle(id: string | undefined) {
  const [visita, setVisita] = useState<Visita | null>(null)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null)
  const [loading, setLoading] = useState(true)
  const [noEncontrada, setNoEncontrada] = useState(false)

  const reload = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setNoEncontrada(false)
    try {
      const snap = await getDoc(doc(db, 'visitas', id))
      if (!snap.exists()) { setVisita(null); setNoEncontrada(true); return }
      const v = { id: snap.id, ...snap.data() } as Visita
      setVisita(v)
      const [cSnap, sSnap] = await Promise.all([
        v.cliente_id ? getDoc(doc(db, 'clientes', v.cliente_id)) : Promise.resolve(null),
        v.solicitud_id ? getDoc(doc(db, 'solicitudes', v.solicitud_id)) : Promise.resolve(null),
      ])
      setCliente(cSnap && cSnap.exists() ? ({ id: cSnap.id, ...cSnap.data() } as Cliente) : null)
      setSolicitud(sSnap && sSnap.exists() ? ({ id: sSnap.id, ...sSnap.data() } as Solicitud) : null)
    } catch {
      toast('Error al cargar la visita', 'error')
      setVisita(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { reload() }, [reload])

  return { visita, cliente, solicitud, loading, noEncontrada, reload }
}
