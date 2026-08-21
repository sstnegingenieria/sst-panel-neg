/**
 * Datos del módulo Licitaciones (1.4).
 *
 * Lectura PUNTUAL con `getDocs` (patrón `useFirestore` de la casa), no
 * onSnapshot: la bandeja no necesita tiempo real y una licitación la mueve
 * una sola persona.
 *
 * Consulta SIN índice compuesto: se trae la colección y se reparte
 * client-side con los helpers puros de `utils/sigp/bandejaLicitaciones.ts`.
 * El volumen lo permite (≈370 históricos + lo que entre por año) y evita
 * pedirle a alguien que cree índices para una bandeja.
 */
import { useCallback, useEffect, useState } from 'react'
import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { db } from '../../firebase/config'
import type { LicitacionConId } from '../../utils/sigp/bandejaLicitaciones'
import { CAPACIDAD_SEMANAL_DEFAULT } from '../../utils/sigp/bandejaLicitaciones'
import { HORAS_UTILES_DIA_DEFAULT, horasUtilesValidas } from '../../utils/sigp/ventanaLicitacion'
import type { RegistroSemaforoVersiones } from '../../types/sigp/semaforoVersiones'

export function useLicitaciones(habilitado: boolean) {
  const [licitaciones, setLicitaciones] = useState<LicitacionConId[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    if (!habilitado) return
    setCargando(true)
    setError(null)
    try {
      const snap = await getDocs(collection(db, 'licitaciones'))
      setLicitaciones(snap.docs.map(d => ({ id: d.id, ...d.data() }) as LicitacionConId))
    } catch {
      setError('No se pudieron cargar las licitaciones')
      setLicitaciones([])
    } finally {
      setCargando(false)
    }
  }, [habilitado])

  useEffect(() => { void recargar() }, [recargar])

  return { licitaciones, cargando, error, recargar }
}

/**
 * Los dos parámetros que el área ajusta SIN desplegar, en
 * `configuracion/licitaciones`:
 *
 *  · `capacidad_semanal` — cuántas licitaciones caben en una semana.
 *  · `horas_utiles_dia`  — horas que se dedican a UNA licitación en un día
 *    hábil; alimenta el reloj de ventana. Ver el comentario de
 *    `HORAS_UTILES_DIA_DEFAULT`: es un supuesto no medido y tampoco conoce
 *    los festivos colombianos (sesgo permisivo declarado).
 *
 * Si el documento no existe todavía, los defaults valen — el módulo funciona
 * antes de que nadie configure nada. Un valor basura (texto, cero, negativo)
 * también cae al default: la configuración puede estar mal escrita y el
 * módulo no puede quedarse sin reloj por eso.
 */
export function useConfigLicitaciones(habilitado: boolean) {
  const [capacidad, setCapacidad] = useState(CAPACIDAD_SEMANAL_DEFAULT)
  const [horasUtilesDia, setHorasUtilesDia] = useState(HORAS_UTILES_DIA_DEFAULT)
  const [cargada, setCargada] = useState(false)

  const recargar = useCallback(async () => {
    if (!habilitado) return
    try {
      const s = await getDoc(doc(db, 'configuracion', 'licitaciones'))
      const d = s.exists()
        ? (s.data() as { capacidad_semanal?: unknown; horas_utiles_dia?: unknown })
        : {}
      const cap = d.capacidad_semanal
      setCapacidad(typeof cap === 'number' && cap > 0 ? Math.floor(cap) : CAPACIDAD_SEMANAL_DEFAULT)
      setHorasUtilesDia(horasUtilesValidas(d.horas_utiles_dia))
    } catch {
      setCapacidad(CAPACIDAD_SEMANAL_DEFAULT)
      setHorasUtilesDia(HORAS_UTILES_DIA_DEFAULT)
    } finally {
      setCargada(true)
    }
  }, [habilitado])

  useEffect(() => { void recargar() }, [recargar])

  return { capacidad, horasUtilesDia, cargada, recargar }
}

/**
 * Registro del criterio (`configuracion/semaforo_versiones`), para poder
 * mostrar el texto de `limitaciones` EN VIVO.
 *
 * ⚠ Se lee de Firestore a propósito, no de la constante TS: cuando la
 * dirección corrija el texto —o adopte una v1.1— el usuario tiene que ver lo
 * que dice el registro HOY, no lo que decía el bundle del último deploy. La
 * constante existe para la semilla y los tests; la UI lee el dato.
 */
export function useCriterioSemaforo(habilitado: boolean, version: string | null) {
  const [limitaciones, setLimitaciones] = useState<string | null>(null)
  const [definicion, setDefinicion] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!habilitado || !version) return
    let vivo = true
    setCargando(true)
    getDoc(doc(db, 'configuracion', 'semaforo_versiones'))
      .then(s => {
        if (!vivo) return
        const reg = s.exists() ? (s.data() as RegistroSemaforoVersiones) : null
        // ⚠ La clave lleva punto ('v1.0'): se accede por índice del objeto,
        // JAMÁS por ruta de campo de Firestore (ver el gotcha documentado en
        // types/sigp/semaforoVersiones.ts).
        const v = reg?.versiones?.[version] ?? null
        setLimitaciones(v?.limitaciones ?? null)
        setDefinicion(v?.definicion ?? null)
      })
      .catch(() => { if (vivo) { setLimitaciones(null); setDefinicion(null) } })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [habilitado, version])

  return { limitaciones, definicion, cargando }
}
