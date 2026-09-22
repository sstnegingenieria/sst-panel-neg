import { useCallback } from 'react'
import { where } from 'firebase/firestore'
import { useFirestore } from './useFirestore'
import { SEED_INDICADORES, type Indicador, type IndicadorMedicion } from '../types/indicador'

export function useIndicadores() {
  const { add, update, getAllOrdered, getAll } = useFirestore()

  const cargarCatalogo = useCallback(async () => {
    const docs = await getAllOrdered('indicadores_sst', 'orden', 'asc')
    return docs as Indicador[]
  }, [getAllOrdered])

  /** Todas las mediciones de todos los indicadores (F1: pocos periodos, se agrupa client-side). */
  const cargarTodasMediciones = useCallback(async () => {
    const docs = await getAll('indicador_mediciones')
    return docs as IndicadorMedicion[]
  }, [getAll])

  const cargarMedicionesDe = useCallback(async (indicadorId: string) => {
    const docs = await getAll('indicador_mediciones', where('indicador_id', '==', indicadorId))
    return (docs as IndicadorMedicion[]).sort((a, b) => a.periodo.localeCompare(b.periodo))
  }, [getAll])

  const guardarMedicion = useCallback(async (
    indicadorId: string,
    periodo: string,
    datos: { numerador: number; denominador: number; meta: number; interpretacion: string },
    registradoPor: string,
    medicionExistenteId?: string,
  ) => {
    if (medicionExistenteId) {
      await update('indicador_mediciones', medicionExistenteId, { ...datos, registrado_por: registradoPor })
    } else {
      await add('indicador_mediciones', {
        indicador_id: indicadorId,
        periodo,
        ...datos,
        registrado_por: registradoPor,
      })
    }
  }, [add, update])

  /** Idempotente: solo agrega los códigos del catálogo semilla que todavía no existen. */
  const sembrarCatalogoSiFalta = useCallback(async () => {
    const existentes = await getAllOrdered('indicadores_sst', 'orden', 'asc') as Indicador[]
    const codigosExistentes = new Set(existentes.map(i => i.codigo))
    const faltantes = SEED_INDICADORES.filter(s => !codigosExistentes.has(s.codigo))
    for (const indicador of faltantes) {
      await add('indicadores_sst', indicador)
    }
    return faltantes.length
  }, [add, getAllOrdered])

  return { cargarCatalogo, cargarTodasMediciones, cargarMedicionesDe, guardarMedicion, sembrarCatalogoSiFalta }
}
