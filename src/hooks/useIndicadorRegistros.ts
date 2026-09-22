import { useCallback } from 'react'
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useFirestore } from './useFirestore'
import { derivarNumDen } from '../utils/indicadoresRegistros'
import { SEED_MEDICIONES_2025, SEED_PATRONES } from '../types/indicador'
import type { ConfigIndicador, Indicador, IndicadorMedicion, IndicadorRegistro } from '../types/indicador'

const COL = 'indicador_registros'

/**
 * CRUD de los datos fuente (F2) de los indicadores pilotados con `patron`.
 * `indicador_registros` se escribe directo (no vía useFirestore) porque su
 * campo de fecha se llama `fecha_registro`, no `fecha_creacion`. `indicador_mediciones`
 * e `indicadores_sst` siguen por useFirestore, como en F1.
 */
export function useIndicadorRegistros() {
  const { getAll, add, update } = useFirestore()

  const cargarRegistros = useCallback(async (indicadorId: string, periodo: string) => {
    const q = query(collection(db, COL), where('indicador_id', '==', indicadorId), where('periodo', '==', periodo))
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() })) as IndicadorRegistro[]
  }, [])

  const medicionDerivableDe = useCallback(async (indicadorId: string, periodo: string) => {
    const existentes = await getAll(
      'indicador_mediciones',
      where('indicador_id', '==', indicadorId),
      where('periodo', '==', periodo),
    ) as IndicadorMedicion[]
    // La fila de referencia (es_referencia:true, solo existe en periodo 2025) nunca es la
    // que un indicador pilotado deriva/edita en su periodo actual — pero por si acaso conviven,
    // se excluye explícitamente.
    return existentes.find(m => !m.es_referencia) ?? null
  }, [getAll])

  /**
   * Re-deriva numerador/denominador desde la bitácora y los re-escribe en
   * `indicador_mediciones`, preservando meta/interpretación existentes. Se
   * llama tras CADA alta/edición/borrado de un registro — no solo al
   * guardar a mano — para que el cache nunca quede desactualizado.
   */
  const sincronizarMedicionDerivada = useCallback(async (indicador: Indicador, periodo: string, uid: string) => {
    const registros = await cargarRegistros(indicador.id, periodo)
    const derivado = derivarNumDen(indicador, registros)
    if (!derivado) return
    const previa = await medicionDerivableDe(indicador.id, periodo)
    const payload = {
      indicador_id: indicador.id,
      periodo,
      numerador: derivado.numerador,
      denominador: derivado.denominador,
      meta: previa?.meta ?? 0,
      interpretacion: previa?.interpretacion ?? '',
      registrado_por: uid,
    }
    if (previa) await update('indicador_mediciones', previa.id, payload)
    else await add('indicador_mediciones', payload)
  }, [cargarRegistros, medicionDerivableDe, add, update])

  const agregarRegistro = useCallback(async (
    indicador: Indicador, periodo: string, data: Record<string, unknown>, uid: string,
  ) => {
    await addDoc(collection(db, COL), {
      indicador_id: indicador.id,
      periodo,
      patron: indicador.patron,
      data,
      registrado_por: uid,
      fecha_registro: Timestamp.now(),
    })
    await sincronizarMedicionDerivada(indicador, periodo, uid)
  }, [sincronizarMedicionDerivada])

  const actualizarRegistro = useCallback(async (
    indicador: Indicador, periodo: string, registroId: string, data: Record<string, unknown>, uid: string,
  ) => {
    await updateDoc(doc(db, COL, registroId), { data })
    await sincronizarMedicionDerivada(indicador, periodo, uid)
  }, [sincronizarMedicionDerivada])

  const eliminarRegistro = useCallback(async (
    indicador: Indicador, periodo: string, registroId: string, uid: string,
  ) => {
    await deleteDoc(doc(db, COL, registroId))
    await sincronizarMedicionDerivada(indicador, periodo, uid)
  }, [sincronizarMedicionDerivada])

  /**
   * Checklist: upsert determinístico por criterio — re-marcar no duplica el doc.
   * `registrado_por` SOLO se envía al crear: la regla lo deja inmutable en
   * update, así que re-marcar un criterio ya tocado por otra persona (caso
   * normal en un checklist compartido) no puede pisarle la autoría original
   * ni chocar contra la regla (que rechazaría un `registrado_por` distinto).
   */
  const marcarCriterioChecklist = useCallback(async (
    indicador: Indicador, periodo: string, criterioId: string, cumple: boolean, uid: string,
  ) => {
    const id = `${indicador.id}_${periodo}_${criterioId}`
    const ref = doc(db, COL, id)
    const existente = await getDoc(ref)
    if (existente.exists()) {
      await updateDoc(ref, { data: { criterio_id: criterioId, cumple }, fecha_registro: Timestamp.now() })
    } else {
      await setDoc(ref, {
        indicador_id: indicador.id,
        periodo,
        patron: 'checklist',
        data: { criterio_id: criterioId, cumple },
        registrado_por: uid,
        fecha_registro: Timestamp.now(),
      })
    }
    await sincronizarMedicionDerivada(indicador, periodo, uid)
  }, [sincronizarMedicionDerivada])

  /** Guarda solo meta/interpretación (numerador/denominador los mantiene la sincronización derivada). */
  const guardarMetaInterpretacion = useCallback(async (
    indicador: Indicador, periodo: string, datos: { meta: number; interpretacion: string }, uid: string,
  ) => {
    const previa = await medicionDerivableDe(indicador.id, periodo)
    if (previa) {
      await update('indicador_mediciones', previa.id, { ...datos, registrado_por: uid })
    } else {
      await add('indicador_mediciones', {
        indicador_id: indicador.id, periodo, numerador: 0, denominador: 0, ...datos, registrado_por: uid,
      })
    }
  }, [medicionDerivableDe, add, update])

  const actualizarConfigIndicador = useCallback(async (indicadorId: string, config: ConfigIndicador) => {
    await update('indicadores_sst', indicadorId, { config })
  }, [update])

  /** Idempotente: solo siembra la fila 2025 de un indicador si aún no existe (checkeado por `es_referencia`). */
  const sembrarReferencia2025SiFalta = useCallback(async (catalogo: Indicador[], uid: string) => {
    let escritos = 0
    for (const seed of SEED_MEDICIONES_2025) {
      const indicador = catalogo.find(i => i.codigo === seed.codigo)
      if (!indicador) continue
      const existentes = await getAll(
        'indicador_mediciones',
        where('indicador_id', '==', indicador.id),
        where('periodo', '==', '2025'),
      ) as IndicadorMedicion[]
      if (existentes.some(m => m.es_referencia)) continue
      await add('indicador_mediciones', {
        indicador_id: indicador.id,
        periodo: '2025',
        numerador: seed.numerador,
        denominador: seed.denominador,
        meta: 0,
        interpretacion: 'Referencia 2025 (cifras oficiales del Plan de Evaluación por Indicadores del SG-SST, SST-PLA-EI-24).',
        registrado_por: uid,
        es_referencia: true,
      })
      escritos++
    }
    return escritos
  }, [getAll, add])

  /** Idempotente: solo asigna patron/config a los 4 indicadores piloto que todavía no lo tengan. */
  const sembrarPatronesSiFalta = useCallback(async (catalogo: Indicador[]) => {
    let escritos = 0
    for (const seed of SEED_PATRONES) {
      const indicador = catalogo.find(i => i.codigo === seed.codigo)
      if (!indicador || indicador.patron) continue
      await update('indicadores_sst', indicador.id, { patron: seed.patron, config: seed.config })
      escritos++
    }
    return escritos
  }, [update])

  return {
    cargarRegistros,
    agregarRegistro,
    actualizarRegistro,
    eliminarRegistro,
    marcarCriterioChecklist,
    guardarMetaInterpretacion,
    actualizarConfigIndicador,
    sembrarReferencia2025SiFalta,
    sembrarPatronesSiFalta,
  }
}
