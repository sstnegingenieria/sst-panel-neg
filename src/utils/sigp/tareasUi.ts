/**
 * Módulo Tareas — helpers puros de UI (orden de trabajo).
 *
 * Separado de `utils/sigp/tareas.ts` (SB1, fuera de alcance) porque ese
 * archivo es el motor de acceso a datos; esto es presentación pura,
 * compartida entre la página `/tareas`, el pop-up `RecordatorioTareas` y el
 * badge del Sidebar — para no duplicar el criterio de orden en cada sitio.
 */
import { esTareaTerminal } from '../../types/sigp/tarea'
import type { TareaConId, PrioridadTarea } from '../../types/sigp/tarea'

const PESO_PRIORIDAD: Record<PrioridadTarea, number> = { alta: 0, media: 1, baja: 2 }

/** Orden de trabajo: prioridad alta→baja, luego fecha_límite asc (sin fecha límite al final). */
export function compararTareas(a: TareaConId, b: TareaConId): number {
  const pa = PESO_PRIORIDAD[a.prioridad] ?? 1
  const pb = PESO_PRIORIDAD[b.prioridad] ?? 1
  if (pa !== pb) return pa - pb
  const fa = a.fecha_limite?.toMillis?.() ?? Infinity
  const fb = b.fecha_limite?.toMillis?.() ?? Infinity
  return fa - fb
}

/** Tareas NO terminales, en orden de trabajo. */
export function tareasActivasOrdenadas(tareas: TareaConId[]): TareaConId[] {
  return tareas.filter(t => !esTareaTerminal(t.estado)).sort(compararTareas)
}
