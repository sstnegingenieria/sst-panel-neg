/**
 * Motor del SEMÁFORO de licitaciones — función pura, sin Firestore ni React.
 *
 * Clasifica un proceso en verde / amarillo / rojo según el historial real de
 * NEG. No decide por Karen: decide en qué orden mirar.
 *
 *   ROJO      modalidad != minima_cuantia  ->  MODALIDAD_SIN_HISTORIAL
 *             (corta seco: no se acumulan motivos amarillos encima)
 *
 *   AMARILLO  hay sorteo de consolidación  ->  SORTEO
 *             limitación MiPyme fuera del territorio de NEG
 *                                          ->  LIMITACION_MIPYME
 *             el pliego pide lectura       ->  REQUIERE_LECTURA
 *
 *   VERDE     mínima cuantía sin ninguna bandera amarilla
 *
 * NO HAY FILTRO POR BANDA DE PRESUPUESTO, y no debe agregarse. Se midió
 * contra los 32 procesos presentados en 2025 y EMPEORA el resultado: elimina
 * una de las tres adjudicaciones (la de $6.011.508). Hay un test de
 * regresión que lo fija — si alguien reintroduce la banda, ese test cae.
 *
 * `SEMAFORO_VERSION` viaja con cada cálculo y se persiste en el documento.
 * Cambiarla es cambiar de criterio: la invariante 5 de `licitacion.ts` obliga
 * a que ese cambio sea un acto explícito, nunca un efecto colateral.
 */
import type { ModalidadLicitacion, MotivoSemaforo, Semaforo } from '../../types/sigp/licitacion'

/** Versión del CRITERIO. Subir al cambiar reglas, no al refactorizar. */
export const SEMAFORO_VERSION = 'v1.0'

/**
 * Departamentos donde NEG sí compite bajo limitación MiPyme territorial.
 * Nombres tal como los escribe SECOP II.
 */
export const DEPARTAMENTOS_NEG = [
  'Distrito Capital de Bogotá',
  'Cundinamarca',
] as const

/**
 * Entrada del motor. Deliberadamente NO es una `Licitacion`: dos de sus
 * campos (`limitacion_mipyme`, `requiere_lectura`) no viven en el documento
 * — salen del pliego o de la lectura humana. Y el sorteo entra como
 * PRESENCIA (`tiene_sorteo`), no como fecha, para no arrastrar `Timestamp`
 * hasta aquí y poder testear el motor sin Firestore.
 */
export interface EntradaSemaforo {
  modalidad: ModalidadLicitacion
  /** `cronograma.sorteo !== null` en el documento. */
  tiene_sorteo: boolean
  /** El proceso está limitado a MiPyme de un territorio. */
  limitacion_mipyme: boolean
  /** `entidad.departamento` tal como viene de SECOP. */
  departamento: string
  /** El pliego exige lectura antes de decidir. */
  requiere_lectura: boolean
}

export interface ResultadoSemaforo {
  semaforo: Semaforo
  motivos: MotivoSemaforo[]
  version: string
}

/**
 * Normaliza un nombre de departamento para comparar: sin tildes, sin
 * mayúsculas, sin espacios de sobra. SECOP no es consistente con las tildes
 * y un acento perdido no puede costar una bandera amarilla falsa.
 */
function normalizarDepartamento(d: string): string {
  return d
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
}

const DEPARTAMENTOS_NEG_NORM = DEPARTAMENTOS_NEG.map(normalizarDepartamento)

/** ¿El departamento es territorio de NEG? (Bogotá o Cundinamarca). */
export function esTerritorioNeg(departamento: string): boolean {
  return DEPARTAMENTOS_NEG_NORM.includes(normalizarDepartamento(departamento))
}

/**
 * Calcula el semáforo. Puro: mismas entradas, mismo resultado, sin efectos.
 * Los motivos salen en orden fijo (SORTEO, LIMITACION_MIPYME,
 * REQUIERE_LECTURA) para que dos cálculos iguales den arrays iguales.
 */
export function calcularSemaforo(input: EntradaSemaforo): ResultadoSemaforo {
  // ── ROJO: corta seco ──
  if (input.modalidad !== 'minima_cuantia') {
    return {
      semaforo: 'rojo',
      motivos: ['MODALIDAD_SIN_HISTORIAL'],
      version: SEMAFORO_VERSION,
    }
  }

  // ── AMARILLO: banderas acumulables sobre una mínima cuantía ──
  const motivos: MotivoSemaforo[] = []

  if (input.tiene_sorteo) motivos.push('SORTEO')

  // La limitación MiPyme solo pesa FUERA del territorio de NEG: en Bogotá y
  // Cundinamarca NEG es la MiPyme local, así que la limitación juega a favor.
  if (input.limitacion_mipyme && !esTerritorioNeg(input.departamento)) {
    motivos.push('LIMITACION_MIPYME')
  }

  if (input.requiere_lectura) motivos.push('REQUIERE_LECTURA')

  return {
    semaforo: motivos.length > 0 ? 'amarillo' : 'verde',
    motivos,
    version: SEMAFORO_VERSION,
  }
}

/**
 * Probabilidad aproximada de quedar en el sorteo de consolidación: NEG entra
 * si cae entre los 10 seleccionados de `manifestaciones` manifestantes.
 *
 * `null` cuando no hay dato (`null`) o el dato no tiene sentido (`<= 0`) —
 * jamás un 0 o un Infinity disfrazados de probabilidad.
 * Techo en 1: con 10 manifestantes o menos, entran todos.
 */
export function probabilidadSorteo(manifestaciones: number | null): number | null {
  if (manifestaciones === null) return null
  if (manifestaciones <= 0) return null
  return Math.min(1, 10 / manifestaciones)
}
