/**
 * Módulo Acciones de Mejora / No Conformidades (AC/AP) — FASE 1.
 *
 * Digitaliza la MATRIZ DE ACCIONES CORRECTIVAS Y PREVENTIVAS (SGI-MT-ACP-26,
 * cláusula 10.2 de las normas ISO). F1 cubre SOLO la captura de la no
 * conformidad + la causa raíz (5 por qués). Lo que NO está acá, a propósito:
 *  - F2: el plan de acción PHVA (vía Tareas), el CONSECUTIVO (AC/AP/MEJ,
 *    server-side, al EMITIR — nunca al abrir un borrador) y el paso a 'abierta'.
 *  - F3: verificación de eficacia y cierre.
 *
 * Decisiones (Giovanny, 14-oct):
 *  - `estado`: 'borrador' | 'abierta' | 'anulada'. En F1 solo se llega a
 *    'borrador' (y a 'anulada'): 'abierta' = emitir = asignar consecutivo (F2);
 *    la regla de Firestore impide 'abierta' sin consecutivo.
 *  - Baja SOLO por anulación (`anulacion` + entrada de historial). Sin delete:
 *    es evidencia de auditoría.
 *  - La tarea PHVA (F2) llevará solo la actividad + el enlace a la acción — el
 *    detalle sensible de la NC vive acá, gateado por rol (gestion_integral/admin).
 *
 * Los helpers de escritura son PUROS (patrón tarea.ts / empleadosDirectos.ts):
 * validan y devuelven el objeto a persistir, o `null`/errores si no es legal.
 */
import { Timestamp } from 'firebase/firestore'

// ── Catálogos ────────────────────────────────────────────────────────────────

export const TIPOS_ACCION = ['correctiva', 'preventiva', 'mejora'] as const
export type TipoAccion = typeof TIPOS_ACCION[number]

export const TIPO_ACCION_LABEL: Record<TipoAccion, string> = {
  correctiva: 'Correctiva',
  preventiva: 'Preventiva',
  mejora: 'Mejora',
}

export const TIPO_ACCION_COLOR: Record<TipoAccion, string> = {
  correctiva: 'bg-red-100 text-red-700',
  preventiva: 'bg-amber-100 text-amber-800',
  mejora: 'bg-emerald-100 text-emerald-800',
}

export const FUENTES_ACCION = [
  'operaciones', 'registro_sgi', 'reporte_servicios', 'quejas_reclamos',
  'auditoria', 'satisfaccion_cliente', 'objetivos_sgi', 'mediciones',
  'evaluacion_proveedores', 'analisis_datos', 'inspecciones', 'rechazo_sst',
] as const
export type FuenteAccion = typeof FUENTES_ACCION[number]

export const FUENTE_ACCION_LABEL: Record<FuenteAccion, string> = {
  operaciones: 'Operaciones',
  registro_sgi: 'Registro SGI',
  reporte_servicios: 'Reporte de servicios',
  quejas_reclamos: 'Quejas y reclamos',
  auditoria: 'Auditoría',
  satisfaccion_cliente: 'Satisfacción del cliente',
  objetivos_sgi: 'Objetivos del SGI',
  mediciones: 'Mediciones',
  evaluacion_proveedores: 'Evaluación de proveedores',
  analisis_datos: 'Análisis de datos',
  inspecciones: 'Inspecciones',
  rechazo_sst: 'Rechazo SST',
}

export const ESTADOS_ACCION = ['borrador', 'abierta', 'anulada'] as const
export type EstadoAccion = typeof ESTADOS_ACCION[number]

export const ESTADO_ACCION_LABEL: Record<EstadoAccion, string> = {
  borrador: 'Borrador',
  abierta: 'Abierta',
  anulada: 'Anulada',
}

export const ESTADO_ACCION_COLOR: Record<EstadoAccion, string> = {
  borrador: 'bg-gray-100 text-gray-600',
  abierta: 'bg-emerald-100 text-emerald-800',
  anulada: 'bg-gray-200 text-gray-500',
}

// ── Modelo ───────────────────────────────────────────────────────────────────

/** Técnica única de causa raíz: los 5 por qués. Pueden quedar vacíos en
 *  borrador (captura progresiva); la completitud se exige al emitir (F2). */
export interface CausaRaiz {
  porque_1: string
  porque_2: string
  porque_3: string
  porque_4: string
  porque_5: string
}

export const CLAVES_PORQUE = ['porque_1', 'porque_2', 'porque_3', 'porque_4', 'porque_5'] as const

export interface AnulacionAccion {
  fecha: Timestamp
  por: string
  por_nombre?: string
  motivo: string
}

/** Entrada del historial (append-only, patrón tarea/OC). */
export interface EventoAccion {
  fecha: Timestamp
  por: string
  por_nombre?: string
  de?: EstadoAccion
  a?: EstadoAccion
  nota?: string
}

export interface AccionMejora {
  tipo: TipoAccion
  fecha_tratamiento: Timestamp
  cliente_proceso: string
  lider_proceso: string
  /** Cláusulas de la norma (texto libre): "9001:2015 10.2", "45001 10.2"… */
  numeral_norma: string[]
  descripcion_nc: string
  observaciones: string
  fuente: FuenteAccion
  /** Solo deja el campo: el enganche real con el origen (p. ej. rechazo SST) es F2. */
  origen_ref: string | null
  causa_raiz: CausaRaiz
  estado: EstadoAccion
  /** null en F1: se asigna al EMITIR en F2 (AC/AP/MEJ-AAAA-NNN, server-side). */
  consecutivo: string | null
  anulacion?: AnulacionAccion
  creado_por: string
  creado_por_nombre?: string
  fecha_creacion: Timestamp
  fecha_actualizacion?: Timestamp
  historial: EventoAccion[]
}

export type AccionMejoraConId = AccionMejora & { id: string }

// ── Formulario ───────────────────────────────────────────────────────────────

/** Estado del formulario (todo texto; los números de cláusula van en una sola
 *  caja separada por comas o saltos de línea). */
export interface AccionFormData {
  tipo: TipoAccion | ''
  fecha: string                // YYYY-MM-DD
  cliente_proceso: string
  lider_proceso: string
  numeral_texto: string
  descripcion_nc: string
  observaciones: string
  fuente: FuenteAccion | ''
  porques: [string, string, string, string, string]
}

export const FORM_ACCION_VACIO: AccionFormData = {
  tipo: '',
  fecha: '',
  cliente_proceso: '',
  lider_proceso: '',
  numeral_texto: '',
  descripcion_nc: '',
  observaciones: '',
  fuente: '',
  porques: ['', '', '', '', ''],
}

export const MAX_DESCRIPCION = 4000
export const MAX_PORQUE = 2000
export const MAX_NUMERALES = 20

/** "9001 10.2, 14001 10.2\n45001 10.2" → ['9001 10.2','14001 10.2','45001 10.2'] (sin vacíos ni repetidos). */
export function parsearNumerales(texto: string): string[] {
  const vistos = new Set<string>()
  const out: string[] = []
  for (const parte of texto.split(/[,;\n]+/)) {
    // La regla de Firestore rechaza el '|' dentro de un numeral (lo usa para validar la lista): se normaliza a '/'.
    const t = parte.replace(/\|/g, '/').trim()
    if (t && !vistos.has(t.toLowerCase())) { vistos.add(t.toLowerCase()); out.push(t.slice(0, 100)) }
  }
  return out.slice(0, MAX_NUMERALES)
}

/** Fecha de un <input type="date"> → Timestamp a mediodía local (evita que el huso corra el día). */
export function timestampDeFechaInput(fecha: string): Timestamp | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0)
  return Number.isNaN(d.getTime()) ? null : Timestamp.fromDate(d)
}

export function fechaInputDeTimestamp(ts: Timestamp | undefined | null): string {
  if (!ts || typeof ts.toDate !== 'function') return ''
  const d = ts.toDate()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Errores de validación del formulario (vacío = válido). Obligatorios en
 *  borrador: tipo, fecha, descripción de la NC y fuente — el resto es progresivo. */
export function validarAccion(f: AccionFormData): Record<string, string> {
  const e: Record<string, string> = {}
  if (!f.tipo || !(TIPOS_ACCION as readonly string[]).includes(f.tipo)) e.tipo = 'Selecciona el tipo de acción'
  if (!timestampDeFechaInput(f.fecha)) e.fecha = 'Indica la fecha de tratamiento'
  if (!f.descripcion_nc.trim()) e.descripcion_nc = 'Describe la no conformidad'
  else if (f.descripcion_nc.length > MAX_DESCRIPCION) e.descripcion_nc = `Máximo ${MAX_DESCRIPCION} caracteres`
  if (!f.fuente || !(FUENTES_ACCION as readonly string[]).includes(f.fuente)) e.fuente = 'Selecciona la fuente'
  if (f.porques.some(p => p.length > MAX_PORQUE)) e.porques = `Cada porqué admite máximo ${MAX_PORQUE} caracteres`
  return e
}

/** Cuántos de los 5 por qués están diligenciados (0–5). Informativo en F1; en
 *  F2 la completitud será requisito para emitir. */
export function porquesDiligenciados(c: Partial<CausaRaiz> | undefined | null): number {
  if (!c) return 0
  return CLAVES_PORQUE.filter(k => (c[k] ?? '').trim() !== '').length
}

export function causaRaizDeForm(f: AccionFormData): CausaRaiz {
  return {
    porque_1: f.porques[0].trim(), porque_2: f.porques[1].trim(), porque_3: f.porques[2].trim(),
    porque_4: f.porques[3].trim(), porque_5: f.porques[4].trim(),
  }
}

export function formDeAccion(a: AccionMejora): AccionFormData {
  return {
    tipo: a.tipo,
    fecha: fechaInputDeTimestamp(a.fecha_tratamiento),
    cliente_proceso: a.cliente_proceso ?? '',
    lider_proceso: a.lider_proceso ?? '',
    numeral_texto: (a.numeral_norma ?? []).join(', '),
    descripcion_nc: a.descripcion_nc ?? '',
    observaciones: a.observaciones ?? '',
    fuente: a.fuente,
    porques: [
      a.causa_raiz?.porque_1 ?? '', a.causa_raiz?.porque_2 ?? '', a.causa_raiz?.porque_3 ?? '',
      a.causa_raiz?.porque_4 ?? '', a.causa_raiz?.porque_5 ?? '',
    ],
  }
}

// ── Builders de escritura (puros) ────────────────────────────────────────────

export interface Actor { uid: string; nombre?: string }

const evento = (actor: Actor, ahora: Timestamp, e: Partial<EventoAccion>): EventoAccion => ({
  fecha: ahora,
  por: actor.uid,
  ...(actor.nombre ? { por_nombre: actor.nombre } : {}),
  ...e,
})

/** Documento nuevo. Nace SIEMPRE 'borrador', sin consecutivo. Devuelve null si el formulario no valida. */
export function construirAlta(f: AccionFormData, actor: Actor, ahora: Timestamp): AccionMejora | null {
  if (Object.keys(validarAccion(f)).length > 0) return null
  const fecha = timestampDeFechaInput(f.fecha)
  if (!fecha) return null
  return {
    tipo: f.tipo as TipoAccion,
    fecha_tratamiento: fecha,
    cliente_proceso: f.cliente_proceso.trim(),
    lider_proceso: f.lider_proceso.trim(),
    numeral_norma: parsearNumerales(f.numeral_texto),
    descripcion_nc: f.descripcion_nc.trim(),
    observaciones: f.observaciones.trim(),
    fuente: f.fuente as FuenteAccion,
    origen_ref: null,
    causa_raiz: causaRaizDeForm(f),
    estado: 'borrador',
    consecutivo: null,
    creado_por: actor.uid,
    ...(actor.nombre ? { creado_por_nombre: actor.nombre } : {}),
    fecha_creacion: ahora,
    historial: [evento(actor, ahora, { a: 'borrador', nota: 'Acción creada (borrador)' })],
  }
}

/** Edición: solo un BORRADOR es editable (abierta/anulada no — F2/F3 tendrán su vía). null si no es legal. */
export function patchEditar(
  accion: Pick<AccionMejora, 'estado' | 'historial'>,
  f: AccionFormData,
  actor: Actor,
  ahora: Timestamp,
): Partial<AccionMejora> | null {
  if (accion.estado !== 'borrador') return null
  if (Object.keys(validarAccion(f)).length > 0) return null
  const fecha = timestampDeFechaInput(f.fecha)
  if (!fecha) return null
  return {
    tipo: f.tipo as TipoAccion,
    fecha_tratamiento: fecha,
    cliente_proceso: f.cliente_proceso.trim(),
    lider_proceso: f.lider_proceso.trim(),
    numeral_norma: parsearNumerales(f.numeral_texto),
    descripcion_nc: f.descripcion_nc.trim(),
    observaciones: f.observaciones.trim(),
    fuente: f.fuente as FuenteAccion,
    causa_raiz: causaRaizDeForm(f),
    fecha_actualizacion: ahora,
    historial: [...(accion.historial ?? []), evento(actor, ahora, { de: 'borrador', a: 'borrador', nota: 'Acción editada' })],
  }
}

/** Anulación (baja soft). Motivo obligatorio; 'anulada' es terminal. null si no es legal. */
export function patchAnular(
  accion: Pick<AccionMejora, 'estado' | 'historial'>,
  motivo: string,
  actor: Actor,
  ahora: Timestamp,
): Partial<AccionMejora> | null {
  const m = motivo.trim()
  if (accion.estado === 'anulada' || !m || m.length > 2000) return null
  return {
    estado: 'anulada',
    anulacion: { fecha: ahora, por: actor.uid, ...(actor.nombre ? { por_nombre: actor.nombre } : {}), motivo: m },
    fecha_actualizacion: ahora,
    historial: [...(accion.historial ?? []), evento(actor, ahora, { de: accion.estado, a: 'anulada', nota: m })],
  }
}

export const puedeEditarAccion = (estado: EstadoAccion): boolean => estado === 'borrador'
export const puedeAnularAccion = (estado: EstadoAccion): boolean => estado !== 'anulada'
