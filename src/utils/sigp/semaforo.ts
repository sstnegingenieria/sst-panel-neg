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
export const SEMAFORO_VERSION = 'v1.1'

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
  // Las modalidades donde NEG no tiene historia siguen cortando. La MENOR
  // CUANTÍA salió de acá en la v1.1 — ver el bloque de abajo.
  if (input.modalidad !== 'minima_cuantia' && input.modalidad !== 'menor_cuantia') {
    return {
      semaforo: 'rojo',
      motivos: ['MODALIDAD_SIN_HISTORIAL'],
      version: SEMAFORO_VERSION,
    }
  }

  // ── AMARILLO: banderas acumulables ──
  const motivos: MotivoSemaforo[] = []

  // ── v1.1: LA MENOR CUANTÍA DEJA DE CORTAR ───────────────────────────
  //
  // Tres razones medidas, ninguna de ellas la competencia:
  //
  //  1. EL CUPO YA PROTEGE. Medido sobre los 396 documentos reales: con la
  //     regla vieja entran 5 al cupo de la semana; con esta, también 5. Lo que
  //     cambia es cuántas COMPITEN (de 9 a 36), no cuántas entran.
  //
  //  2. LA REGLA HACÍA DOS VECES EL MISMO TRABAJO. Frenaba 30 de las 39 de la
  //     bandeja cuando el cupo ya limita lo que se puede trabajar — y la
  //     segunda vez a ciegas, porque una frenada ni siquiera se ordena por
  //     fecha de cierre.
  //
  //  3. LOS TRES CONTRATOS MÁS GRANDES de la historia de NEG fueron menores
  //     cuantías: DESAJ ($315M), CNSC ($67M) e INM ($102M), los tres de 2023.
  //
  // LO QUE NO SOSTIENE EL CAMBIO, y conviene que quede escrito porque la
  // premisa ya viajó a una decisión: la idea de que la menor cuantía tiene
  // MENOS competencia. Medido sobre SECOP, procesos adjudicados desde 2025 en
  // Bogotá y Cundinamarca: 5,04 competidores en mínima contra 5,68 en menor.
  // Prácticamente igual, y en el orden contrario al que se suponía.
  //
  // El amarillo no es duda: es una lista corta de verificación. Dos ítems, no
  // tres — «cuántos manifestaron interés» se midió y NO EXISTE antes de
  // decidir (0 de 349 en el registro, y `proveedores_que_manifestaron` está en
  // cero en las 29.354 filas del filtro). Una lista con un ítem que nunca se
  // puede llenar enseña a ignorar la lista entera.
  if (input.modalidad === 'menor_cuantia') motivos.push('MENOR_CUANTIA')

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
