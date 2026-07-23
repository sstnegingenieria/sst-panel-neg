// src/types/sigp/visita.ts
//
// Tipos del dominio Visita Técnica (Fase 1 — Comercial, etapa de levantamiento).
// Captura mobile-first desde el sitio. Convención: campos Firestore en
// snake_case español.

import type { Timestamp } from 'firebase/firestore'

// ── Enums de dominio ──────────────────────────────────────────────────────────

export type TipoVisita =
  | 'estacion_base' | 'datacenter' | 'centro_comercial' | 'remodelacion' | 'otra'

/** Subtipo solo aplica a estacion_base (define si va el ítem de impermeabilización). */
export type SubtipoEstacion = 'greenfield' | 'rooftop'

export type EstadoVisita = 'pendiente_agendar' | 'programada' | 'realizada' | 'cancelada'

/** Estado de cada ítem del checklist. */
export type EstadoItem = 'bueno' | 'regular' | 'malo' | 'no_aplica'

/** Categoría del adjunto (el plano a mano alzada es su propia categoría). */
export type CategoriaAdjunto = 'plano' | 'foto' | 'documento'

// ── Sub-tipos embebidos ───────────────────────────────────────────────────────

/** Quién ejecutó la visita: personal NEG (uid) o un contratista (referencia). */
export interface Ejecutor {
  tipo: 'neg' | 'contratista'
  uid?: string             // si tipo === 'neg'
  contratista_id?: string  // si tipo === 'contratista' (ref. a colección contratistas)
  nombre?: string          // denormalizado para mostrar
}

/** Ítem del checklist (estado + observación). La lista viene de una plantilla por tipo. */
export interface ChecklistItem {
  clave: string            // id estable, ej. 'torre_puesta_tierra'
  etiqueta: string         // texto mostrado
  estado: EstadoItem
  observacion?: string
}

/** Hallazgo estructurado (también cubre "anomalía reportada + posible solución"). */
export interface Hallazgo {
  descripcion: string
  posible_solucion?: string
  fotos: string[]          // download URLs de Storage
}

/** Cantidad preliminar (alimentará la cotización en F1.4). */
export interface CantidadPreliminar {
  descripcion: string
  unidad: string
  cantidad: number
}

export interface Adjunto {
  nombre: string
  url: string
  categoria: CategoriaAdjunto   // 'plano' = foto del sketch en papel
  content_type?: string
  tamano?: number
  subido_en?: Timestamp
}

/** Entrada del historial de cambios de estado (evidencia ISO). */
export interface CambioEstadoVisita {
  de: EstadoVisita | null
  a: EstadoVisita
  por: string              // uid
  fecha: Timestamp
  motivo?: string          // obligatorio al cancelar
}

// ── Documento principal (colección `visitas`) ─────────────────────────────────

export interface Visita {
  id: string
  consecutivo: string      // VIS-YYYY-NNN

  tipo: TipoVisita
  subtipo?: SubtipoEstacion // solo estacion_base

  // Origen. Regla del form: solicitud_id O (cliente_id | prospecto_nombre).
  // Si hay solicitud_id, al crear la visita se COPIAN cliente_id/prospecto_nombre
  // de la solicitud al doc (denormalización para lista/filtros).
  cliente_id?: string
  prospecto_nombre?: string
  solicitud_id?: string    // opcional; si se realiza y la solicitud está en
                           // requiere_visita → pasa a lista_para_cotizar

  sitio?: string
  /** Ausente mientras es borrador `pendiente_agendar` (se fija al agendar). */
  fecha_programada?: Timestamp
  fecha_ejecucion?: Timestamp   // se setea al marcar realizada

  ejecutor: Ejecutor
  registrada_por: string   // uid de quien la crea/gestiona en el panel

  estado: EstadoVisita

  // Datos de la ejecución (se llenan en 1.3.d)
  checklist: ChecklistItem[]
  hallazgos: Hallazgo[]
  cantidades: CantidadPreliminar[]
  adjuntos: Adjunto[]           // incluye el plano (categoria 'plano')
  observaciones_generales?: string

  historial: CambioEstadoVisita[]
  motivo_cancelacion?: string   // denormalizado (= historial)

  fecha_creacion: Timestamp
  fecha_actualizacion?: Timestamp
}

// ── Plantillas de checklist por tipo ──────────────────────────────────────────

/** Ítems base de estación (greenfield). En rooftop se agrega impermeabilización. */
export const CHECKLIST_ESTACION_BASE: { clave: string; etiqueta: string }[] = [
  { clave: 'estado_general',          etiqueta: 'Estado general de la estación' },
  { clave: 'torre_luces_obstruccion', etiqueta: 'Torre · luces de obstrucción' },
  { clave: 'torre_puesta_tierra',     etiqueta: 'Torre · puesta a tierra' },
  { clave: 'torre_sistema_electrico', etiqueta: 'Torre · sistema eléctrico' },
  { clave: 'torre_pararrayos',        etiqueta: 'Torre · pararrayos' },
  { clave: 'torre_tornilleria',       etiqueta: 'Torre · tornillería' },
  { clave: 'torre_pintura',           etiqueta: 'Torre · pintura' },
  { clave: 'deshierbe_podas',         etiqueta: 'Deshierbe / podas' },
]

export const CHECKLIST_IMPERMEABILIZACION = {
  clave: 'impermeabilizacion', etiqueta: 'Impermeabilización (rooftop)',
}

/**
 * Plantilla de checklist para un tipo/subtipo. Solo estacion_base tiene checklist
 * de torre; los demás tipos usan recorrido/hallazgos/cantidades (checklist vacío).
 */
export function plantillaChecklist(
  tipo: TipoVisita,
  subtipo?: SubtipoEstacion,
): { clave: string; etiqueta: string }[] {
  if (tipo !== 'estacion_base') return []
  return subtipo === 'rooftop'
    ? [...CHECKLIST_ESTACION_BASE, CHECKLIST_IMPERMEABILIZACION]
    : CHECKLIST_ESTACION_BASE
}

// ── Constantes de UI ──────────────────────────────────────────────────────────

export const TIPOS_VISITA = ['estacion_base', 'datacenter', 'centro_comercial', 'remodelacion', 'otra'] as const
export const ESTADOS_VISITA = ['pendiente_agendar', 'programada', 'realizada', 'cancelada'] as const
export const SUBTIPOS_ESTACION = ['greenfield', 'rooftop'] as const

export const TIPO_VISITA_LABEL: Record<TipoVisita, string> = {
  estacion_base: 'Estación base',
  datacenter: 'Data center',
  centro_comercial: 'Centro comercial',
  remodelacion: 'Remodelación',
  otra: 'Otra',
}

export const SUBTIPO_LABEL: Record<SubtipoEstacion, string> = {
  greenfield: 'Greenfield', rooftop: 'Rooftop',
}

export const ESTADO_VISITA_LABEL: Record<EstadoVisita, string> = {
  pendiente_agendar: 'Pendiente de agendar',
  programada: 'Programada', realizada: 'Realizada', cancelada: 'Cancelada',
}

export const ESTADO_VISITA_COLOR: Record<EstadoVisita, string> = {
  pendiente_agendar: 'bg-orange-100 text-orange-800',
  programada: 'bg-amber-100 text-amber-800',
  realizada:  'bg-emerald-100 text-emerald-800',
  cancelada:  'bg-gray-100 text-gray-500',
}

export const ESTADO_ITEM_LABEL: Record<EstadoItem, string> = {
  bueno: 'Bueno', regular: 'Regular', malo: 'Malo', no_aplica: 'N/A',
}

export const ESTADO_ITEM_COLOR: Record<EstadoItem, string> = {
  bueno:     'bg-emerald-100 text-emerald-800',
  regular:   'bg-amber-100 text-amber-800',
  malo:      'bg-rose-100 text-rose-800',
  no_aplica: 'bg-gray-100 text-gray-500',
}

/**
 * Máquina de estados de la visita. Al marcar `realizada`, si la visita tiene
 * `solicitud_id` y esa solicitud está en `requiere_visita`, pasa a
 * `lista_para_cotizar` (con entrada en su historial). Cancelar exige motivo.
 * Ambos estados finales son TERMINALES: reagendar = programar una visita nueva
 * con nuevo consecutivo VIS-.
 */
export const TRANSICIONES: Record<EstadoVisita, EstadoVisita[]> = {
  // Pipeline (23-jul): el BORRADOR nace de la solicitud SIN código; el
  // consecutivo VIS se asigna al AGENDAR (contigüidad ISO — los pendientes
  // cancelados no queman número).
  pendiente_agendar: ['programada', 'cancelada'],
  programada: ['realizada', 'cancelada'],
  realizada:  [],   // terminal
  cancelada:  [],   // terminal (reagendar = nueva visita)
}
