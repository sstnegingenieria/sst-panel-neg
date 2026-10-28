/**
 * Vigencia de los documentos de habilitación (sub-bloque A.1) — motor PURO,
 * sin Firestore, sin React.
 *
 * ⚠ IMPLEMENTACIÓN PROVISIONAL (23-oct-2026).
 *
 * El frente SIGP va a consolidar su `utils/vencimiento.ts` —el que alimenta
 * la salud documental de los técnicos en el panel SST— con este archivo, y
 * quedará UNO SOLO. Ese reemplazo es una DECISIÓN CONJUNTA con SIGP, no de
 * este módulo: no se consolida por iniciativa de licitaciones ni se da por
 * definitivo lo que hay acá.
 *
 * Por eso el checklist NO depende de este archivo: depende del contrato
 * `MotorVigencias` (`types/sigp/motorVigencias.ts`) y recibe el motor por
 * parámetro. Lo que esta implementación aporta mientras tanto es
 * `motorVigenciasProvisional` (al final del archivo) y la batería de
 * `vigencias.test.ts`, que es el pliego de condiciones que la implementación
 * consolidada tendrá que pasar: granularidad de día calendario local y fecha
 * ilegible que nunca se lee como vigente.
 *
 * El estado de vigencia NO se persiste: se deriva al mirar. Mismo criterio
 * que `estadoEfectivo`/`validez_dias` en `cotizacion.ts` y que `getDocEstado`
 * del panel SST — lo guardado es la fecha, el juicio se calcula. Un campo
 * `vencido` almacenado envejece solo y miente hasta que alguien corra un
 * cron.
 *
 * ── GRANULARIDAD DE DÍA, NO DE MILISEGUNDO ──────────────────────────────────
 *
 * Todo se compara por DÍA CALENDARIO LOCAL. Un documento con vigencia "hasta
 * el 15 de septiembre" es válido DURANTE todo el 15, así que NO vence antes
 * de un cierre del 15 a las 17:00 — comparar millis diría que sí (00:00 <
 * 17:00) y rechazaría un papel perfectamente válido el día que más importa.
 *
 * Local = Colombia (UTC−5), donde corre el panel. Es la misma razón por la
 * que `ventanaLicitacion.ts` trabaja con componentes de fecha y no con
 * `new Date(iso)`: un `Timestamp` interpretado en UTC puede correr el día.
 */
import type { Timestamp } from 'firebase/firestore'
import { DIAS_ALERTA_DEFAULT } from '../../types/sigp/documentoEmpresa'
import type { DocumentoEmpresa } from '../../types/sigp/documentoEmpresa'
import { ESTADOS_VIGENCIA } from '../../types/sigp/motorVigencias'
import type { EstadoVigencia, MotorVigencias } from '../../types/sigp/motorVigencias'

const MS_DIA = 86_400_000

// El vocabulario vive en el CONTRATO, no en esta implementación — es lo que
// SIGP y licitaciones tienen que compartir cuando se consolide. Se re-exporta
// para que ningún consumidor tenga que saber de dónde salió.
export { ESTADOS_VIGENCIA }
export type { EstadoVigencia }

export const ESTADO_VIGENCIA_LABEL: Record<EstadoVigencia, string> = {
  vigente: 'Vigente',
  por_vencer: 'Por vencer',
  vencido: 'Vencido',
  sin_vencimiento: 'No vence',
}

/**
 * Medianoche LOCAL del día de un Timestamp, como epoch UTC — una clave
 * comparable de "día calendario". `null` si el Timestamp no es usable.
 *
 * Se usa `Date.UTC` sobre los componentes LOCALES a propósito: no convierte
 * zona, solo fabrica un entero por día con el que restar da días exactos.
 */
export function diaLocal(ts: Timestamp | null | undefined): number | null {
  const d = ts?.toDate?.()
  if (!d || Number.isNaN(d.getTime())) return null
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Días calendario de `desde` a `hasta`. Negativo si `hasta` ya pasó. */
export function diasEntre(
  desde: Timestamp | null | undefined,
  hasta: Timestamp | null | undefined,
): number | null {
  const a = diaLocal(desde)
  const b = diaLocal(hasta)
  if (a === null || b === null) return null
  return Math.round((b - a) / MS_DIA)
}

/** Lo que el documento declara como umbral de alerta, saneado. */
function diasAlertaDe(d: Pick<DocumentoEmpresa, 'dias_alerta'>): number {
  const n = d.dias_alerta
  return Number.isInteger(n) && n >= 0 ? n : DIAS_ALERTA_DEFAULT
}

/**
 * Días que le quedan de vigencia. `null` si no vence o no hay con qué
 * calcular. Negativo si ya venció.
 */
export function diasRestantes(
  d: Pick<DocumentoEmpresa, 'fecha_vigencia_hasta'>,
  ahora: Timestamp,
): number | null {
  if (d.fecha_vigencia_hasta === null) return null
  return diasEntre(ahora, d.fecha_vigencia_hasta)
}

/**
 * Estado de vigencia DERIVADO.
 *
 *   sin_vencimiento   `fecha_vigencia_hasta === null` — NO es un hueco: es
 *                     un documento que no caduca (un RUT).
 *   vencido           el día de vigencia ya pasó.
 *   por_vencer        quedan `dias_alerta` días o menos (el borde EXACTO
 *                     cuenta como por_vencer, igual que `<= 30` en
 *                     `getDocEstado`). Vence HOY ⇒ 0 días ⇒ por_vencer:
 *                     todavía sirve.
 *   vigente           el resto.
 *
 * Una fecha ilegible cae a `sin_vencimiento` — jamás a `vigente`: nunca se
 * afirma que un papel sirve por no haber podido leer su fecha.
 */
export function estadoVigencia(
  d: Pick<DocumentoEmpresa, 'fecha_vigencia_hasta' | 'dias_alerta'>,
  ahora: Timestamp,
): EstadoVigencia {
  if (d.fecha_vigencia_hasta === null) return 'sin_vencimiento'
  const dias = diasEntre(ahora, d.fecha_vigencia_hasta)
  if (dias === null) return 'sin_vencimiento'
  if (dias < 0) return 'vencido'
  if (dias <= diasAlertaDe(d)) return 'por_vencer'
  return 'vigente'
}

/**
 * ¿El documento vence ANTES de esa fecha? La pregunta que el checklist le
 * hace contra la fecha de CIERRE del proceso.
 *
 * `false` cuando no vence (no hay nada que caduque) y cuando no hay con qué
 * juzgar — pero ese `false` significa "esta comprobación no objeta", no
 * "todo bien": el veredicto lo arma `evaluarVigencia` en `cumplimiento.ts`,
 * que distingue los casos.
 *
 * MISMO DÍA ⇒ `false`. Un documento vigente "hasta el 15" alcanza para un
 * cierre el 15.
 */
export function venceAntesDe(
  d: Pick<DocumentoEmpresa, 'fecha_vigencia_hasta'>,
  fecha: Timestamp | null | undefined,
): boolean {
  if (d.fecha_vigencia_hasta === null) return false
  const vence = diaLocal(d.fecha_vigencia_hasta)
  const corte = diaLocal(fecha)
  if (vence === null || corte === null) return false
  return vence < corte
}

/** ¿Está utilizable hoy? (vigente o por vencer, nunca vencido). */
export function estaVigente(
  d: Pick<DocumentoEmpresa, 'fecha_vigencia_hasta' | 'dias_alerta'>,
  ahora: Timestamp,
): boolean {
  return estadoVigencia(d, ahora) !== 'vencido'
}

/**
 * Etiqueta corta para el chip. Dice los días cuando los hay — un "Por
 * vencer" sin número obliga a abrir el documento para saber si es mañana o
 * en tres semanas.
 */
export function etiquetaVigencia(
  d: Pick<DocumentoEmpresa, 'fecha_vigencia_hasta' | 'dias_alerta'>,
  ahora: Timestamp,
): string {
  const estado = estadoVigencia(d, ahora)
  if (estado === 'sin_vencimiento') return 'No vence'
  const dias = diasEntre(ahora, d.fecha_vigencia_hasta) ?? 0
  if (estado === 'vencido') {
    const n = Math.abs(dias)
    return `Vencido hace ${n} día${n === 1 ? '' : 's'}`
  }
  if (estado === 'por_vencer') {
    if (dias === 0) return 'Vence hoy'
    return `Vence en ${dias} día${dias === 1 ? '' : 's'}`
  }
  return `Vigente · ${dias} días`
}

/**
 * El peor estado de un conjunto — para el semáforo de una carpeta completa.
 * Orden de gravedad: vencido > por_vencer > vigente > sin_vencimiento.
 * Patrón `getSaludDocumental` del panel SST (peor gana).
 */
export function peorVigencia(
  docs: readonly Pick<DocumentoEmpresa, 'fecha_vigencia_hasta' | 'dias_alerta'>[],
  ahora: Timestamp,
): EstadoVigencia {
  const estados = docs.map(d => estadoVigencia(d, ahora))
  if (estados.includes('vencido')) return 'vencido'
  if (estados.includes('por_vencer')) return 'por_vencer'
  if (estados.includes('vigente')) return 'vigente'
  return 'sin_vencimiento'
}

/**
 * El motor PROVISIONAL, tipado contra el contrato.
 *
 * Es lo ÚNICO de este archivo que el checklist consume, y lo consume
 * INYECTADO. El `: MotorVigencias` no es decoración: si una firma de acá se
 * separa del contrato, esta línea NO COMPILA — la frontera se rompe en el
 * build, no en producción.
 *
 * Cuando SIGP y licitaciones consoliden el motor, lo que se inyecta pasa a
 * ser el consolidado y este objeto se va con el archivo.
 */
export const motorVigenciasProvisional: MotorVigencias = {
  estadoVigencia,
  venceAntesDe,
}
