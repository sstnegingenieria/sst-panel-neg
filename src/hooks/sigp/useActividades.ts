// src/hooks/sigp/useActividades.ts
//
// Módulo de Actividades — hook de carga. La fuente depende del rol:
//  - residente_obra: SOLO las actividades de su cliente (leído de
//    users/{uid}.cliente_id — si falta, error "sin cliente asignado").
//  - personal interno: las actividades "vivas" (sin anuladas); las anuladas
//    se piden aparte, bajo demanda (cargarAnuladas), para no descargarlas
//    siempre.
// Todo ordenamiento/filtrado adicional queda para el caller — client-side,
// deliberadamente SIN índices compuestos (igualdad simple en ambas ramas).
import { useState, useEffect, useCallback, useRef } from 'react'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '../../firebase/config'
import { useAuth } from '../../contexts/AuthContext'
import { accesoResidente, type Rol } from '../../types/sigp/roles'
import type { Actividad } from '../../types/sigp/actividad'

const ESTADOS_VIVOS = ['registrada', 'aprobada', 'ejecutada', 'completa'] as const

export function useActividades() {
  const { user } = useAuth()
  const [actividades, setActividades] = useState<Actividad[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [clienteIdResidente, setClienteIdResidente] = useState<string | null>(null)
  const anuladasCargadas = useRef(false)

  const reload = useCallback(async () => {
    if (!user) { setActividades([]); setLoading(false); return }
    setLoading(true)
    setError(null)
    anuladasCargadas.current = false
    try {
      if (accesoResidente((user.rol ?? '') as Rol)) {
        const usnap = await getDoc(doc(db, 'users', user.uid))
        const clienteId = (usnap.exists() ? (usnap.data().cliente_id as string | undefined) : undefined) ?? null
        setClienteIdResidente(clienteId)
        if (!clienteId) {
          setError('Tu usuario no tiene un cliente asignado — contacta a administración.')
          setActividades([])
          return
        }
        const snap = await getDocs(query(collection(db, 'actividades'), where('cliente_id', '==', clienteId)))
        setActividades(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Actividad))
      } else {
        setClienteIdResidente(null)
        const snap = await getDocs(query(collection(db, 'actividades'), where('estado', 'in', [...ESTADOS_VIVOS])))
        setActividades(snap.docs.map(d => ({ id: d.id, ...d.data() }) as Actividad))
      }
    } catch (e) {
      console.error('useActividades.reload', e)
      setError('No se pudieron cargar las actividades.')
      setActividades([])
    } finally {
      setLoading(false)
    }
  }, [user?.uid, user?.rol]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { reload() }, [reload])

  /** Personal interno: trae las anuladas aparte (solo la vista "Anuladas" las
   *  necesita). Para residentes es un no-op — su query por cliente_id ya las
   *  incluye. Idempotente: una sola carga por reload(). */
  const cargarAnuladas = useCallback(async () => {
    if (!user || accesoResidente((user.rol ?? '') as Rol) || anuladasCargadas.current) return
    try {
      const snap = await getDocs(query(collection(db, 'actividades'), where('estado', '==', 'anulada')))
      const nuevas = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Actividad)
      anuladasCargadas.current = true
      setActividades(prev => {
        const ids = new Set(prev.map(a => a.id))
        return [...prev, ...nuevas.filter(a => !ids.has(a.id))]
      })
    } catch (e) {
      console.error('useActividades.cargarAnuladas', e)
    }
  }, [user?.uid, user?.rol]) // eslint-disable-line react-hooks/exhaustive-deps

  return { actividades, loading, error, reload, clienteIdResidente, cargarAnuladas }
}
