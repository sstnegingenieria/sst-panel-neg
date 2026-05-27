// src/hooks/useObrasConRegistros.ts
import { useState, useEffect, useCallback, useMemo } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase/config'
import { normalizarDoc, type Formulario } from '../types/formulario'
import type { Obra } from '../components/ObrasTable'

export interface ObraConStats extends Obra {
  totalRegistros: number
  pendientes: number
  ultimoTimestamp: string
  ultimoResponsable: string
}

interface State {
  obras: Obra[]
  formularios: Formulario[]
  loading: boolean
  error: string | null
}

export function useObrasConRegistros() {
  const [state, setState] = useState<State>({
    obras: [],
    formularios: [],
    loading: true,
    error: null,
  })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }))
    try {
      const [obrasSnap, formsSnap] = await Promise.all([
        getDocs(collection(db, 'obras')),
        getDocs(query(collection(db, 'formularios'), orderBy('fecha_creacion', 'desc'))),
      ])
      const obras = obrasSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Obra[]
      const formularios = formsSnap.docs.map(d =>
        normalizarDoc(d.id, d.data() as Record<string, unknown>)
      )
      setState({ obras, formularios, loading: false, error: null })
    } catch (e) {
      console.error('useObrasConRegistros load error:', e)
      setState(s => ({ ...s, loading: false, error: 'No se pudieron cargar los datos.' }))
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Agrupa formularios por obra y calcula stats
  const obrasConStats = useMemo<ObraConStats[]>(() => {
    return state.obras.map(obra => {
      const formsDeObra = state.formularios.filter(
        f => f.obraId === obra.id || f.proyecto === obra.nombre_sitio
      )
      const pendientes = formsDeObra.filter(
        f => !f.revision_sst || f.revision_sst.estado === 'pendiente'
      ).length
      const ultimo = formsDeObra[0] // ya viene ordenado desc
      return {
        ...obra,
        totalRegistros: formsDeObra.length,
        pendientes,
        ultimoTimestamp: ultimo?.timestamp_creacion ?? '',
        ultimoResponsable: ultimo?.responsable ?? '',
      }
    })
  }, [state.obras, state.formularios])

  const formulariosByObra = useCallback(
    (obraId: string): Formulario[] => {
      const obra = state.obras.find(o => o.id === obraId)
      return state.formularios.filter(
        f => f.obraId === obraId || (obra ? f.proyecto === obra.nombre_sitio : false)
      )
    },
    [state.obras, state.formularios]
  )

  return {
    obras: state.obras,
    formularios: state.formularios,
    obrasConStats,
    formulariosByObra,
    loading: state.loading,
    error: state.error,
    reload: load,
  }
}
