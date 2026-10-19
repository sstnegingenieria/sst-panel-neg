/**
 * Módulo Tareas — helpers puros de UI (orden de trabajo).
 *
 * Separado de `utils/sigp/tareas.ts` (SB1, fuera de alcance) porque ese
 * archivo es el motor de acceso a datos; esto es presentación pura,
 * compartida entre la página `/tareas`, el pop-up `RecordatorioTareas` y el
 * badge del Sidebar — para no duplicar el criterio de orden en cada sitio.
 */
import { esTareaTerminal, FASES_TAREA } from '../../types/sigp/tarea'
import type { TareaConId, PrioridadTarea, FaseTarea, ContextoTarea, EstadoTarea } from '../../types/sigp/tarea'
import { puedeGestionarAcapUI } from '../../types/sigp/permisos'

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

// ── Vencidas ─────────────────────────────────────────────────────────────────
// Una tarea está VENCIDA cuando NO es terminal y el DÍA de su fecha límite ya
// pasó (una tarea que vence hoy no se marca hasta mañana). Cuenta también en
// `en_espera`: pasar el balón no pausa el plazo (decisión 19-oct). Fuente
// única: la página /tareas, el badge del Sidebar y el pop-up usan ESTA función.

const inicioDelDia = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

function fechaLimiteDe(t: { fecha_limite?: unknown }): Date | null {
  const ts = t.fecha_limite as { toDate?: () => Date } | undefined
  const d = ts?.toDate?.()
  return d && !Number.isNaN(d.getTime()) ? d : null
}

export function esTareaVencida(
  t: { estado: EstadoTarea; fecha_limite?: unknown },
  ahora: Date = new Date(),
): boolean {
  if (esTareaTerminal(t.estado)) return false
  const limite = fechaLimiteDe(t)
  if (!limite) return false
  return inicioDelDia(limite).getTime() < inicioDelDia(ahora).getTime()
}

/** Días completos de atraso (≥ 1 si está vencida, 0 si no). */
export function diasDeVencida(
  t: { estado: EstadoTarea; fecha_limite?: unknown },
  ahora: Date = new Date(),
): number {
  if (!esTareaVencida(t, ahora)) return 0
  const limite = fechaLimiteDe(t)!
  return Math.round((inicioDelDia(ahora).getTime() - inicioDelDia(limite).getTime()) / 86_400_000)
}

// ── Agrupación por fase PHVA (AC/AP) ─────────────────────────────────────────

export type TareasPorFase = Record<FaseTarea, TareaConId[]> & { sinFase: TareaConId[] }

const porFechaLimite = (a: TareaConId, b: TareaConId) =>
  (a.fecha_limite?.toMillis?.() ?? Infinity) - (b.fecha_limite?.toMillis?.() ?? Infinity)
  || (a.titulo ?? '').localeCompare(b.titulo ?? '', 'es')

/** P · H · V · A (y las que no traen fase válida en `sinFase`), cada grupo por
 *  fecha límite ascendente. Incluye terminales: AC/AP quiere ver el histórico. */
export function agruparPorFase(tareas: TareaConId[]): TareasPorFase {
  const out = { P: [], H: [], V: [], A: [], sinFase: [] } as TareasPorFase
  for (const t of tareas) {
    const f = t.fase as FaseTarea | undefined
    if (f && (FASES_TAREA as readonly string[]).includes(f)) out[f].push(t)
    else out.sinFase.push(t)
  }
  for (const k of [...FASES_TAREA, 'sinFase'] as const) out[k].sort(porFechaLimite)
  return out
}

// ── Navegación al contexto ───────────────────────────────────────────────────

/** Ruta del documento de contexto de una tarea, o null si no hay a dónde ir.
 *  `ruta_id` es el override de navegación (una OC se navega por su proyecto).
 *  `ac_ap` solo se enlaza a quien puede abrir AC/AP (GI y admin): al resto se
 *  le muestra el rótulo sin enlace, no un enlace que lo rebota. */
export function rutaContexto(c: ContextoTarea, rol?: string): string | null {
  const destino = c.ruta_id ?? c.id
  switch (c.tipo) {
    case 'solicitud': return `/sigp/solicitudes/${destino}`
    case 'cotizacion': return `/sigp/cotizaciones/${destino}`
    case 'proyecto': return `/sigp/proyectos/${destino}`
    case 'cliente': return `/sigp/clientes/${destino}`
    case 'orden_compra': return `/sigp/proyectos/${destino}`
    case 'ac_ap': return puedeGestionarAcapUI(rol) ? `/acciones-mejora/${destino}` : null
    default: return null
  }
}
