import { useState, useEffect, useCallback } from 'react'
import { doc, getDoc, getDocs, collection, query, where, orderBy } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { toast } from '../../components/shared/Toast'
import type { LPU, ItemLPU } from '../../types/sigp/lpu'
import type { Cliente } from '../../types/sigp/cliente'

export interface DetalleLpu {
  lpu: LPU | null
  items: ItemLPU[]
  cliente: Cliente | null
  /** Versión que esta LPU reemplazó (via lpu.reemplaza_a). */
  predecesora: LPU | null
  /** Versión que reemplazó a esta LPU (la que tiene reemplaza_a === lpuId). */
  sucesora: LPU | null
  /** Todas las versiones del mismo cliente (para la cadena de versiones). */
  versiones: LPU[]
  loading: boolean
  noEncontrada: boolean
}

const inicial: Omit<DetalleLpu, 'loading' | 'noEncontrada'> = {
  lpu: null, items: [], cliente: null, predecesora: null, sucesora: null, versiones: [],
}

/**
 * Carga el detalle de una LPU: metadata, ítems (subcolección ordenada por `orden`),
 * cliente, y la cadena de versiones (predecesora/sucesora vía `reemplaza_a`).
 */
export function useLpuDetalle(lpuId: string | undefined) {
  const [datos, setDatos] = useState(inicial)
  const [loading, setLoading] = useState(true)
  const [noEncontrada, setNoEncontrada] = useState(false)

  const reload = useCallback(async () => {
    if (!lpuId) return
    setLoading(true)
    setNoEncontrada(false)
    try {
      const lpuSnap = await getDoc(doc(db, 'lpus', lpuId))
      if (!lpuSnap.exists()) {
        setDatos(inicial)
        setNoEncontrada(true)
        return
      }
      const lpu = { id: lpuSnap.id, ...lpuSnap.data() } as LPU

      const [itemsSnap, clienteSnap, versionesSnap] = await Promise.all([
        getDocs(query(collection(db, 'lpus', lpuId, 'items'), orderBy('orden'))),
        getDoc(doc(db, 'clientes', lpu.cliente_id)),
        getDocs(query(collection(db, 'lpus'), where('cliente_id', '==', lpu.cliente_id))),
      ])

      const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as ItemLPU)
      const cliente = clienteSnap.exists() ? ({ id: clienteSnap.id, ...clienteSnap.data() } as Cliente) : null
      const versiones = versionesSnap.docs
        .map(d => ({ id: d.id, ...d.data() }) as LPU)
        .sort((a, b) => b.version - a.version)

      setDatos({
        lpu,
        items,
        cliente,
        predecesora: versiones.find(v => v.id === lpu.reemplaza_a) ?? null,
        sucesora: versiones.find(v => v.reemplaza_a === lpuId) ?? null,
        versiones,
      })
    } catch {
      toast('Error al cargar el detalle de la LPU', 'error')
      setDatos(inicial)
    } finally {
      setLoading(false)
    }
  }, [lpuId])

  useEffect(() => { reload() }, [reload])

  return { ...datos, loading, noEncontrada, reload }
}
