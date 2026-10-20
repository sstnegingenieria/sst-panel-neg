// Censo de consecutivos — doc `configuracion/censo_consecutivos`, escrito SOLO
// por la CF programada `censoConsecutivos` (Cloud Scheduler, lunes 07:00 Bogotá).
// El panel lo LEE y pinta el chip del Panel SIGP; jamás lo escribe ni lo computa.
//
// La condición de Giovanny (20-oct-2026): el chip tiene que decir CUÁNDO se
// verificó y alertar si el censo está VENCIDO, no solo si hay huecos — "la
// señal tiene que poder decir 'no sé', que es distinto de 'todo bien'". Por
// eso `estadoCensoConsecutivos` antepone sin_censo/vencido a ok/huecos.

import { Timestamp } from 'firebase/firestore'

export interface CensoSerie {
  ultimo: number
  usados: number
  /** Números faltantes 1..ultimo (incluye los documentados). */
  huecos: number[]
  /** Huecos NO cubiertos por la whitelist de HUECOS_DOCUMENTADOS de la CF. */
  sin_documentar: number[]
}

export interface CensoConsecutivos {
  fecha?: Timestamp
  series?: Record<string, CensoSerie>
  total_sin_documentar?: number
  ok?: boolean
}

/**
 * Umbral de vencimiento del censo: la CF corre semanal (lunes); 10 días =
 * un ciclo + margen de fin de semana/festivo. SUPUESTO NOMBRADO, no medido —
 * si el cron cambia de cadencia, este número cambia con él.
 */
export const UMBRAL_CENSO_VENCIDO_DIAS = 10

export type EstadoCenso = 'sin_censo' | 'vencido' | 'ok' | 'huecos'

/**
 * Estado del chip. El orden importa: un censo ausente o vencido es "no sé"
 * y GANA sobre ok/huecos — nunca se muestra un visto bueno viejo como vigente.
 */
export function estadoCensoConsecutivos(
  doc: CensoConsecutivos | null | undefined,
  ahoraMs: number,
): { estado: EstadoCenso; diasDesde: number | null } {
  const fechaMs = doc?.fecha?.toMillis?.() ?? null
  if (fechaMs == null) return { estado: 'sin_censo', diasDesde: null }
  const diasDesde = Math.floor((ahoraMs - fechaMs) / 86_400_000)
  if (diasDesde > UMBRAL_CENSO_VENCIDO_DIAS) return { estado: 'vencido', diasDesde }
  const sinDoc = doc?.total_sin_documentar ?? 0
  return { estado: sinDoc > 0 ? 'huecos' : 'ok', diasDesde }
}
