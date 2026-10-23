/**
 * CONTRATO del motor de vigencias — interfaz estrecha, sin implementación.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ─────────────────────────────────────────────
 *
 * `utils/sigp/vigencias.ts` (A.1) es PROVISIONAL. El frente SIGP tiene su
 * propio `utils/vencimiento.ts` —el que alimenta la salud documental de los
 * técnicos en el panel SST— y los dos van a consolidarse en UNO. Esa
 * consolidación es una decisión CONJUNTA con SIGP, no nuestra.
 *
 * Para que ese cambio cueste un archivo y no treinta, el checklist consume
 * vigencias por esta interfaz y NUNCA por la implementación: `cumplimiento.ts`
 * importa de acá SOLO TIPOS y recibe el motor por parámetro. El día que gane
 * la implementación consolidada, lo que cambia es quién se inyecta — ni una
 * línea del motor de cumplimiento.
 *
 * Es el mismo patrón de frontera que la regla 7.2 del SIGP ("consulta, no
 * gestión"): el módulo consume un estado que otro produce y no se apropia de
 * su cálculo.
 *
 * ── LA INTERFAZ ES ESTRECHA A PROPÓSITO ─────────────────────────────────────
 *
 * Solo las DOS preguntas que el checklist hace de verdad. `vigencias.ts`
 * exporta más cosas (etiquetas, `peorVigencia`, `diasRestantes`) y son útiles
 * para una UI de carpeta documental, pero NO entran al contrato: cada función
 * que entre acá es una función que la implementación consolidada tendrá que
 * reproducir con la misma semántica. Una interfaz ancha no es una frontera,
 * es un calco.
 *
 * La forma del documento también es ESTRUCTURAL (`DocVigencia`, no
 * `DocumentoEmpresa`): si el motor consolidado trabaja sobre los documentos
 * de los técnicos del panel SST, igual encaja, porque lo único que el
 * contrato pide son los dos campos con los que se juzga una vigencia.
 */
import type { Timestamp } from 'firebase/firestore'

export const ESTADOS_VIGENCIA = [
  'vigente', 'por_vencer', 'vencido', 'sin_vencimiento',
] as const
export type EstadoVigencia = typeof ESTADOS_VIGENCIA[number]

/**
 * Lo mínimo que hay que saber de un documento para juzgar su vigencia.
 *
 * `fecha_vigencia_hasta: null` = no vence (antecedentes, un RUT). No es
 * "no se sabe": es una afirmación.
 */
export interface DocVigencia {
  fecha_vigencia_hasta: Timestamp | null
  /** Umbral de "por vencer" POR documento. Ausente ⇒ el default del motor. */
  dias_alerta?: number | null
}

/**
 * Las dos preguntas del checklist.
 *
 * Cualquier implementación que entre acá DEBE conservar:
 *   · granularidad de DÍA calendario local (un documento vigente "hasta el
 *     15" alcanza para un cierre el 15 a las 17:00);
 *   · fecha ilegible ⇒ `sin_vencimiento` / `venceAntesDe === false`, JAMÁS
 *     `vigente` ni una objeción inventada: no se afirma nada por no haber
 *     podido leer una fecha.
 * Las dos reglas están fijadas por los tests de `vigencias.test.ts`, que son
 * el pliego de condiciones que la implementación consolidada tiene que pasar.
 */
export interface MotorVigencias {
  estadoVigencia(d: DocVigencia, ahora: Timestamp): EstadoVigencia
  venceAntesDe(
    d: Pick<DocVigencia, 'fecha_vigencia_hasta'>,
    fecha: Timestamp | null | undefined,
  ): boolean
}
