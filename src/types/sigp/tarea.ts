/**
 * Módulo Tareas (14-ago-2026) — tareas con asignación y "balón en cancha".
 *
 * Decisiones de diseño (SB1 aprobado por Giovanny):
 *  - Alcance: todos los roles del panel (`ROLES_PANEL_WEB`); asignar A OTROS
 *    solo las gerencias + admin; auto-tarea y pasar/recibir balón: cualquiera.
 *  - `hecha` y `anulada` son TERMINALES sin reapertura — una corrección es
 *    una tarea nueva (con `contexto` apuntando a lo que haga falta).
 *  - Reasignar RESETEA a `pendiente` y limpia el balón (el nuevo responsable
 *    arranca limpio, con traza en historial).
 *  - El asignador NO cierra tareas ajenas: solo el asignado pone `hecha`.
 *  - INVARIANTE DEL BALÓN: `estado === 'en_espera'` ⟺ `balon_en` con uid.
 *
 * Los helpers de patch son PUROS (patrón pipeline.ts): validan la transición
 * y devuelven el objeto a persistir, o `null` si el movimiento no es legal —
 * la UI no improvisa writes.
 */
import { Timestamp } from 'firebase/firestore'

// ── Estados y catálogo ───────────────────────────────────────────────────────

export const ESTADOS_TAREA = [
  'pendiente', 'en_curso', 'en_espera', 'hecha', 'anulada',
] as const
export type EstadoTarea = typeof ESTADOS_TAREA[number]

export const PRIORIDADES_TAREA = ['baja', 'media', 'alta'] as const
export type PrioridadTarea = typeof PRIORIDADES_TAREA[number]

export const ESTADO_TAREA_LABEL: Record<EstadoTarea, string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  en_espera: 'En espera · balón pasado',
  hecha: 'Hecha',
  anulada: 'Anulada',
}

export const ESTADO_TAREA_COLOR: Record<EstadoTarea, string> = {
  pendiente: 'bg-gray-100 text-gray-600',
  en_curso: 'bg-amber-100 text-amber-800',
  en_espera: 'bg-orange-100 text-orange-800',
  hecha: 'bg-emerald-100 text-emerald-800',
  anulada: 'bg-gray-200 text-gray-500',
}

export const PRIORIDAD_TAREA_LABEL: Record<PrioridadTarea, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta',
}

export const PRIORIDAD_TAREA_COLOR: Record<PrioridadTarea, string> = {
  baja: 'bg-gray-100 text-gray-600',
  media: 'bg-amber-100 text-amber-800',
  alta: 'bg-red-100 text-red-700',
}

/** Fase PHVA (ciclo Planear · Hacer · Verificar · Actuar) de la actividad de
 *  una acción de mejora (AC/AP, cláusula 10.2). Solo la llevan las tareas
 *  creadas desde ese módulo; en el resto de tareas queda ausente. */
export const FASES_TAREA = ['P', 'H', 'V', 'A'] as const
export type FaseTarea = typeof FASES_TAREA[number]

export const FASE_TAREA_LABEL: Record<FaseTarea, string> = {
  P: 'Planear', H: 'Hacer', V: 'Verificar', A: 'Actuar',
}

// Sin azules (marca). Cada fase con su identidad; el chip siempre lleva letra
// + nombre, así que el color no es el único portador del significado.
export const FASE_TAREA_COLOR: Record<FaseTarea, string> = {
  P: 'bg-violet-100 text-violet-800',
  H: 'bg-teal-100 text-teal-800',
  V: 'bg-fuchsia-100 text-fuchsia-800',
  A: 'bg-stone-200 text-stone-700',
}

export const esFaseTarea = (v: unknown): v is FaseTarea =>
  typeof v === 'string' && (FASES_TAREA as readonly string[]).includes(v)

// ── Sub-tipos ────────────────────────────────────────────────────────────────

/** Enlace OPCIONAL a la entidad de la que nace la tarea. Solo referencia
 *  visual/navegable — la tarea no depende de que la entidad exista.
 *
 *  CONVENCIÓN (SB2.2): `id` es SIEMPRE el documento ORIGEN real (evidencia
 *  referencial, no textual — Trinorma: la cadena acción → documento origen
 *  se sigue por id). `ruta_id` es el override de NAVEGACIÓN para entidades
 *  sin ficha propia: una OC se navega por la ficha de su proyecto, así que
 *  `id` = doc id de la OC y `ruta_id` = proyecto_id.
 *
 *  `ac_ap` (AC/AP Fase 2): `id` = id de la acción de mejora, `label` = su
 *  consecutivo (AC/AP/MEJ-AAAA-NNN). Se navega a /acciones-mejora/:id, que
 *  solo abren GI y admin (rutaContexto aplica ese gate). */
export interface ContextoTarea {
  tipo: 'solicitud' | 'cotizacion' | 'proyecto' | 'cliente' | 'obra' | 'orden_compra' | 'ac_ap' | 'otro'
  id: string
  ruta_id?: string
  label: string            // p. ej. "COT-2026-021 · Plaza San Nicolás"
}

/** El balón: la tarea espera a un tercero. Presente ⟺ estado 'en_espera'. */
export interface BalonTarea {
  uid: string
  nombre: string           // denormalizado (render sin N+1)
  motivo: string           // qué se espera de esa persona
  fecha: Timestamp
}

/** Entrada del historial de movimientos (append-only, patrón OC). */
export interface EventoTarea {
  fecha: Timestamp
  por: string
  por_nombre?: string
  de?: EstadoTarea
  a?: EstadoTarea
  nota?: string            // motivo de anulación / del balón / reasignación…
}

export interface Tarea {
  titulo: string
  descripcion?: string
  asignada_a: string
  asignada_a_nombre: string
  asignada_por: string
  asignada_por_nombre: string
  /** uid REAL de quien creó el doc — la regla lo exige == auth.uid al crear
   *  y lo vuelve inmutable en updates (no suplantable, patrón OC). */
  creada_por: string
  estado: EstadoTarea      // nace SIEMPRE 'pendiente' (regla)
  /** Acota las consultas (igualdad simple — sin índice compuesto, SB2.2):
   *  `true` salvo en los terminales `hecha`/`anulada`. La MANTIENEN los
   *  patch builders (derivada del estado resultante, auto-sanadora), no la
   *  UI; la regla de create exige nacer con `true`. */
  activa: boolean
  prioridad: PrioridadTarea
  fecha_limite?: Timestamp
  requiere_evidencia?: boolean
  contexto?: ContextoTarea
  /** Fase PHVA — solo tareas de AC/AP (contexto.tipo === 'ac_ap'). */
  fase?: FaseTarea
  balon_en?: BalonTarea | null
  comentario_cierre?: string
  evidencia_url?: string
  fecha_creacion: Timestamp
  fecha_actualizacion?: Timestamp
  historial: EventoTarea[]
}

export type TareaConId = Tarea & { id: string }

// ── Máquina de estados ───────────────────────────────────────────────────────

/** Transiciones legales SIN distinguir actor (quién puede cada una lo dicen
 *  las reglas y los patch builders). `hecha`/`anulada` terminales duros. */
export const TRANSICIONES_TAREA: Record<EstadoTarea, EstadoTarea[]> = {
  pendiente: ['en_curso', 'en_espera', 'hecha', 'anulada'],
  en_curso:  ['en_espera', 'hecha', 'anulada'],
  en_espera: ['en_curso', 'anulada'],   // devolver/retirar el balón · anular
  hecha:     [],                        // terminal — corrección = tarea nueva
  anulada:   [],                        // terminal
}

export function puedeTransicionarTarea(de: EstadoTarea, a: EstadoTarea): boolean {
  return (TRANSICIONES_TAREA[de] ?? []).includes(a)
}

export const esTareaTerminal = (estado: EstadoTarea): boolean =>
  TRANSICIONES_TAREA[estado]?.length === 0

/** `activa` derivada del estado — fuente única para los patch builders. */
export const esTareaActiva = (estado: EstadoTarea): boolean => !esTareaTerminal(estado)

/** INVARIANTE del balón: 'en_espera' ⟺ balon_en con uid no vacío. */
export function balonConsistente(estado: EstadoTarea, balon: BalonTarea | null | undefined): boolean {
  const tiene = !!balon && (balon.uid ?? '') !== ''
  return estado === 'en_espera' ? tiene : !tiene
}

// ── Patch builders puros (la UI persiste EXACTAMENTE esto) ──────────────────
// Devuelven `null` si el movimiento no es legal desde el estado actual.
// El timestamp lo pone el caller (Timestamp.now()) para mantenerlos puros.

interface ActorTarea { uid: string; nombre?: string }

const evento = (
  ahora: Timestamp, actor: ActorTarea, de: EstadoTarea, a: EstadoTarea, nota?: string,
): EventoTarea => ({
  fecha: ahora, por: actor.uid,
  ...(actor.nombre ? { por_nombre: actor.nombre } : {}),
  de, a, ...(nota ? { nota } : {}),
})

/** Tarea de SEÑAL DE ALCANCE en proyecto FACTURADO (cola de señales, 29-sep
 *  — agregado 1 de Giovanny: un aviso que Marcela no puede resolver se
 *  vuelve papel tapiz; el hallazgo necesita RESPONSABLE Y FECHA, patrón de
 *  acción correctiva del SGI). Idempotencia POR ID: el doc se crea con id
 *  determinístico `senal_{proyectoId}_{asignacionId}` y el caller verifica
 *  existencia antes — reabrir la bandeja jamás duplica. El CIERRE lo hace su
 *  responsable con comentario al VERIFICAR la resolución (si quien resuelve
 *  la señal ES el responsable, se cierra en el mismo acto). */
export const ID_TAREA_SENAL = (proyectoId: string, asignacionId: string) =>
  `senal_${proyectoId}_${asignacionId}`

export function construirTareaSenal(
  datos: {
    proyectoId: string; proyectoConsecutivo: string; asignacionId: string
    contratista: string; senalVersion: number; senalFecha: Timestamp
    responsable: { uid: string; nombre: string }
  },
  creador: { uid: string; nombre: string },
  ahora: Timestamp,
  diasLimite: number,
): Tarea {
  return {
    titulo: `Señal de alcance sin resolver — ${datos.proyectoConsecutivo} (facturado)`,
    descripcion: `La asignación de ${datos.contratista} tiene una señal de alcance viva ` +
      `(v${datos.senalVersion}, del ${datos.senalFecha.toDate().toLocaleDateString('es-CO')}) en un proyecto YA FACTURADO: ` +
      'no hay ajuste hacia adelante — es un número histórico que corregir, y eso requiere decisión con OK y acto propio con traza ' +
      '(o confirmarse "revisado, sin cambio" con el desfase congelado). Cierra esta tarea cuando VERIFIQUES la resolución en la ficha.',
    asignada_a: datos.responsable.uid,
    asignada_a_nombre: datos.responsable.nombre,
    asignada_por: creador.uid,
    asignada_por_nombre: creador.nombre,
    creada_por: creador.uid,
    estado: 'pendiente',
    activa: true,
    prioridad: 'alta',
    fecha_limite: Timestamp.fromMillis(ahora.toMillis() + diasLimite * 86_400_000),
    contexto: {
      tipo: 'proyecto', id: datos.proyectoId,
      label: `${datos.proyectoConsecutivo} · señal de alcance (${datos.contratista})`,
    },
    fecha_creacion: ahora,
    historial: [evento(ahora, creador, 'pendiente', 'pendiente',
      'Creada automáticamente por la cola de señales de alcance (proyecto facturado)')],
  }
}

// ── Tareas de AC/AP (Fase 2) ─────────────────────────────────────────────────
// Las actividades del plan PHVA de una acción de mejora se crean como tareas.
// Este builder FIJA la forma (la acordada con el módulo AC/AP): el módulo no
// arma el documento a mano, así que no puede divergir. Quien lo llama es GI
// (puede asignar a otros — regla puedeAsignarTareas) y persiste el resultado
// con addDoc; la regla exige creada_por == auth.uid, que el builder cumple al
// tomarlo del creador.

export interface DatosTareaAcap {
  /** Descripción de la actividad → `titulo`. */
  titulo: string
  responsable: { uid: string; nombre: string }
  /** Fecha de ejecución → `fecha_limite`. OBLIGATORIA: una actividad PHVA sin
   *  fecha nunca podría vencer (decisión 19-oct). */
  fechaLimite: Timestamp
  /** id del documento de la AC/AP → `contexto.id`. */
  acapId: string
  /** Consecutivo (AC/AP/MEJ-AAAA-NNN) → `contexto.label`. Exigido: el label se
   *  denormaliza al crear y no se actualiza, así que no se crea una tarea de
   *  una acción aún sin consecutivo. */
  consecutivo: string
  fase: FaseTarea
  descripcion?: string
  prioridad?: PrioridadTarea
}

/** Motivo por el que unos datos NO sirven para crear la tarea, o null si sirven.
 *  Para mostrar el porqué en la UI; el builder usa el mismo criterio. */
export function motivoInvalidoTareaAcap(
  d: DatosTareaAcap, creador: { uid: string },
): string | null {
  if (!creador?.uid) return 'Falta el creador'
  if (!d.titulo?.trim()) return 'Falta la descripción de la actividad'
  if (!d.responsable?.uid) return 'Falta el responsable'
  if (!d.fechaLimite || typeof d.fechaLimite.toMillis !== 'function') return 'Falta la fecha de ejecución'
  if (!d.acapId?.trim()) return 'Falta el id de la acción de mejora'
  if (!d.consecutivo?.trim()) return 'La acción de mejora aún no tiene consecutivo'
  if (!esFaseTarea(d.fase)) return 'La fase debe ser P, H, V o A'
  return null
}

export function construirTareaAcap(
  datos: DatosTareaAcap,
  creador: { uid: string; nombre: string },
  ahora: Timestamp,
): Tarea | null {
  if (motivoInvalidoTareaAcap(datos, creador)) return null
  const consecutivo = datos.consecutivo.trim()
  return {
    titulo: datos.titulo.trim(),
    ...(datos.descripcion?.trim() ? { descripcion: datos.descripcion.trim() } : {}),
    asignada_a: datos.responsable.uid,
    asignada_a_nombre: datos.responsable.nombre,
    asignada_por: creador.uid,
    asignada_por_nombre: creador.nombre,
    creada_por: creador.uid,
    estado: 'pendiente',
    activa: true,
    prioridad: datos.prioridad ?? 'media',
    fecha_limite: datos.fechaLimite,
    contexto: { tipo: 'ac_ap', id: datos.acapId.trim(), label: consecutivo },
    fase: datos.fase,
    fecha_creacion: ahora,
    historial: [evento(ahora, creador, 'pendiente', 'pendiente',
      `Creada desde la acción de mejora ${consecutivo} (fase ${datos.fase} · ${FASE_TAREA_LABEL[datos.fase]})`)],
  }
}

/** El asignado arranca la tarea. */
export function patchIniciarTarea(t: Tarea, actor: ActorTarea, ahora: Timestamp) {
  if (!puedeTransicionarTarea(t.estado, 'en_curso') || t.estado === 'en_espera') return null
  return {
    estado: 'en_curso' as EstadoTarea,
    activa: esTareaActiva('en_curso'),
    fecha_actualizacion: ahora,
    historial: [...(t.historial ?? []), evento(ahora, actor, t.estado, 'en_curso')],
  }
}

/** El asignado pasa el balón: la tarea queda EN ESPERA de `destino`. */
export function patchPasarBalon(
  t: Tarea, actor: ActorTarea, ahora: Timestamp,
  destino: { uid: string; nombre: string }, motivo: string,
) {
  if (!puedeTransicionarTarea(t.estado, 'en_espera')) return null
  if (!destino.uid || !motivo.trim()) return null
  const balon: BalonTarea = { uid: destino.uid, nombre: destino.nombre, motivo: motivo.trim(), fecha: ahora }
  return {
    estado: 'en_espera' as EstadoTarea,
    activa: esTareaActiva('en_espera'),
    balon_en: balon,
    fecha_actualizacion: ahora,
    historial: [...(t.historial ?? []), evento(ahora, actor, t.estado, 'en_espera',
      `Balón pasado a ${destino.nombre}: ${motivo.trim()}`)],
  }
}

/** El receptor devuelve el balón (o el asignado lo retira): vuelve EN CURSO. */
export function patchDevolverBalon(t: Tarea, actor: ActorTarea, ahora: Timestamp, nota?: string) {
  if (t.estado !== 'en_espera') return null
  return {
    estado: 'en_curso' as EstadoTarea,
    activa: esTareaActiva('en_curso'),
    balon_en: null,
    fecha_actualizacion: ahora,
    historial: [...(t.historial ?? []), evento(ahora, actor, 'en_espera', 'en_curso',
      nota?.trim() ? `Balón devuelto: ${nota.trim()}` : 'Balón devuelto')],
  }
}

/** El asignado cierra: comentario obligatorio; evidencia si la tarea la exige. */
export function patchCerrarTarea(
  t: Tarea, actor: ActorTarea, ahora: Timestamp,
  comentario: string, evidenciaUrl?: string,
) {
  if (!puedeTransicionarTarea(t.estado, 'hecha')) return null
  if (!comentario.trim()) return null
  if (t.requiere_evidencia && !evidenciaUrl) return null
  return {
    estado: 'hecha' as EstadoTarea,
    activa: esTareaActiva('hecha'),
    comentario_cierre: comentario.trim(),
    ...(evidenciaUrl ? { evidencia_url: evidenciaUrl } : {}),
    fecha_actualizacion: ahora,
    historial: [...(t.historial ?? []), evento(ahora, actor, t.estado, 'hecha', comentario.trim())],
  }
}

/** El asignador anula (motivo obligatorio). Limpia el balón si lo había. */
export function patchAnularTarea(t: Tarea, actor: ActorTarea, ahora: Timestamp, motivo: string) {
  if (!puedeTransicionarTarea(t.estado, 'anulada')) return null
  if (!motivo.trim()) return null
  return {
    estado: 'anulada' as EstadoTarea,
    activa: esTareaActiva('anulada'),
    ...(t.balon_en ? { balon_en: null } : {}),
    fecha_actualizacion: ahora,
    historial: [...(t.historial ?? []), evento(ahora, actor, t.estado, 'anulada', motivo.trim())],
  }
}

/** El asignador reasigna: RESETEA a 'pendiente' y LIMPIA el balón (decisión
 *  SB1 — el nuevo responsable arranca limpio, con traza). */
export function patchReasignarTarea(
  t: Tarea, actor: ActorTarea, ahora: Timestamp,
  nuevo: { uid: string; nombre: string }, nota?: string,
) {
  if (esTareaTerminal(t.estado)) return null
  if (!nuevo.uid) return null
  return {
    asignada_a: nuevo.uid,
    asignada_a_nombre: nuevo.nombre,
    asignada_por: actor.uid,
    asignada_por_nombre: actor.nombre ?? '',
    estado: 'pendiente' as EstadoTarea,
    activa: esTareaActiva('pendiente'),
    ...(t.balon_en ? { balon_en: null } : {}),
    fecha_actualizacion: ahora,
    historial: [...(t.historial ?? []), evento(ahora, actor, t.estado, 'pendiente',
      `Reasignada a ${nuevo.nombre}${nota?.trim() ? `: ${nota.trim()}` : ''}`)],
  }
}
