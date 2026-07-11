// src/types/sigp/cotizacion.ts
//
// Tipos del dominio Cotización (Fase 1 — Comercial). Una cotización es UN doc
// (un COT-) con VERSIONES en subcolección (cada versión = snapshot completo con
// ítems inline). El padre denormaliza el resumen de la versión activa para la
// bandeja. Convención: campos Firestore en snake_case español.

import type { Timestamp } from 'firebase/firestore'

// ── Enums ─────────────────────────────────────────────────────────────────────

export type EsquemaTributario = 'iva_pleno' | 'aiu'

/** Origen del ítem. `apu` queda tipado; su constructor llega en F1.4-B. */
export type OrigenItem = 'lpu' | 'manual' | 'apu'

/** `vencida` es DERIVADA en UI (enviada + hoy > fecha_envio + validez); NO se guarda. */
export type EstadoCotizacion = 'borrador' | 'enviada' | 'aprobada' | 'rechazada' | 'vencida'

export type CategoriaAdjunto = 'licitacion' | 'evidencia' | 'otro'

// ── Sub-tipos ─────────────────────────────────────────────────────────────────

export interface Adjunto {
  nombre: string
  url: string
  categoria: CategoriaAdjunto
  content_type?: string
  tamano?: number
  subido_en?: Timestamp
}

export interface ItemCotizacion {
  origen: OrigenItem
  codigo: string
  descripcion: string
  unidad: string
  valor_unitario: number
  cantidad: number
  valor_total: number          // snapshot = valor_unitario * cantidad
  capitulo?: string            // agrupador
  // Referencias de origen — SOLO trazabilidad, NUNCA lectura viva (es snapshot):
  lpu_id?: string
  lpu_item_id?: string
  apu_id?: string              // F1.4-B
}

/** Porcentajes AIU (enteros). */
export interface ConfigAIU {
  admin: number
  imprevistos: number
  utilidad: number
}

export interface CondicionesCotizacion {
  forma_pago: string
  validez_dias: number
  tiempo_ejecucion: string
  garantia: string
  moneda: string               // COP
  observaciones?: string       // exclusiones / notas
}

/** Bloque de totales calculado (snapshot). */
export interface TotalesCotizacion {
  costos_directos: number      // suma de valor_total de ítems
  admin?: number               // solo AIU
  imprevistos?: number         // solo AIU
  utilidad?: number            // solo AIU
  base_iva: number             // iva_pleno: costos_directos | aiu: utilidad
  iva: number                  // base_iva * iva_pct / 100
  total: number
}

// ── Versión (subcolección cotizaciones/{id}/versiones/{versionId}) ────────────

export interface VersionCotizacion {
  id: string
  version: number              // 1, 2, 3…
  esquema: EsquemaTributario
  aiu?: ConfigAIU              // si esquema === 'aiu'
  iva_pct: number              // default 19 (editable)
  items: ItemCotizacion[]      // inline
  condiciones: CondicionesCotizacion
  totales: TotalesCotizacion   // snapshot calculado
  fecha_envio?: Timestamp      // cuándo se envió ESTA versión
  pdf_url?: string             // futuro
  creada_por: string
  fecha_creacion: Timestamp
}

// ── Historial ─────────────────────────────────────────────────────────────────

export interface CambioEstadoCotizacion {
  de: EstadoCotizacion | null
  a: EstadoCotizacion
  version?: number             // versión afectada (ej. "v2 enviada")
  por: string
  fecha: Timestamp
  motivo?: string
}

// ── Documento padre (colección cotizaciones) ──────────────────────────────────

export interface Cotizacion {
  id: string
  consecutivo: string          // COT-YYYY-NNN

  /** Campo "Asunto" de la plantilla real CM-FT-CT-19 (ej: "Adecuaciones estación
   *  Ráquira"). Obligatorio al crear; editable mientras esté en borrador. */
  asunto: string

  // Origen: cliente/prospecto y/o solicitud (hereda cliente/prospecto).
  cliente_id?: string
  prospecto_nombre?: string
  solicitud_id?: string

  es_licitacion: boolean
  estado: EstadoCotizacion     // borrador|enviada|aprobada|rechazada (vencida = derivada)
  version_activa: number       // nº de la versión activa (la última)

  // Denormalizado de la versión activa (bandeja sin leer subcolección):
  total: number
  fecha_envio?: Timestamp
  validez_dias?: number

  // Aprobación / rechazo (nivel cotización):
  evidencia_aprobacion?: Adjunto   // correo/OC/contrato — obligatorio para aprobar
  aprobada_por?: string
  fecha_aprobacion?: Timestamp
  motivo_rechazo?: string

  adjuntos: Adjunto[]          // documento de licitación externo / otros
  historial: CambioEstadoCotizacion[]
  registrada_por: string
  fecha_creacion: Timestamp
  fecha_actualizacion?: Timestamp
}

// ── Constantes ────────────────────────────────────────────────────────────────

export const ESTADOS_COTIZACION = ['borrador', 'enviada', 'aprobada', 'rechazada', 'vencida'] as const
export const ESQUEMAS = ['iva_pleno', 'aiu'] as const

export const ESTADO_COT_LABEL: Record<EstadoCotizacion, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  vencida: 'Vencida',
}

export const ESTADO_COT_COLOR: Record<EstadoCotizacion, string> = {
  borrador:  'bg-gray-100 text-gray-600',
  enviada:   'bg-amber-100 text-amber-800',
  aprobada:  'bg-emerald-100 text-emerald-800',
  rechazada: 'bg-rose-100 text-rose-800',
  vencida:   'bg-orange-100 text-orange-800',
}

export const ESQUEMA_LABEL: Record<EsquemaTributario, string> = {
  iva_pleno: 'IVA pleno',
  aiu: 'AIU',
}

/**
 * Transiciones de estado ALMACENADAS (`vencida` no es objetivo manual; se deriva).
 * Aparte de estas, la acción "Nueva versión" (ver `puedeNuevaVersion`) resetea la
 * cotización a `borrador` e incrementa `version_activa`, registrando en el historial
 * una entrada `<estado actual> → borrador` con motivo "Nueva versión vN".
 */
export const TRANSICIONES: Record<EstadoCotizacion, EstadoCotizacion[]> = {
  borrador:  ['enviada'],
  enviada:   ['aprobada', 'rechazada'],
  aprobada:  [],   // terminal (cambios post-aprobación = proyecto, F2)
  rechazada: [],   // terminal (reactivar = nueva versión)
  vencida:   [],   // derivada, no almacenada
}

/**
 * "Nueva versión" disponible desde enviada, rechazada y vencida (derivada).
 * NUNCA desde borrador (ya es editable) ni aprobada (post-aprobación es del
 * proyecto, F2). Se le pasa el estado EFECTIVO (usar `estadoEfectivo`).
 */
export function puedeNuevaVersion(estadoEfectivo: EstadoCotizacion): boolean {
  return estadoEfectivo === 'enviada' || estadoEfectivo === 'rechazada' || estadoEfectivo === 'vencida'
}

// ── Lógica pura (totales + vencida) ───────────────────────────────────────────

/** valor_total de un ítem, REDONDEADO a peso (el snapshot debe coincidir con el PDF). */
export function valorTotalItem(valorUnitario: number, cantidad: number): number {
  return Math.round((valorUnitario || 0) * (cantidad || 0))
}

/**
 * Calcula el bloque de totales según el esquema.
 * - iva_pleno: total = CD + IVA(CD)
 * - aiu:       total = CD + A + I + U + IVA(U)   (IVA SOLO sobre la Utilidad)
 *   con A/I/U = CD × porcentaje. (Verificado contra el modelo Excel real de NEG.)
 *
 * REDONDEO: cada componente (CD, A, I, U, IVA, Total) se redondea a peso con
 * Math.round al final; la operación intermedia usa precisión completa. Así el
 * snapshot guardado coincide con lo que mostrará el PDF.
 */
export function calcularTotales(
  items: ItemCotizacion[],
  esquema: EsquemaTributario,
  aiu: ConfigAIU | undefined,
  ivaPct: number,
): TotalesCotizacion {
  // CD = suma de valor_total (ya redondeado por ítem); se redondea de nuevo por robustez.
  const costos_directos = Math.round(items.reduce((s, it) => s + (it.valor_total || 0), 0))

  if (esquema === 'aiu') {
    const a = aiu ?? { admin: 0, imprevistos: 0, utilidad: 0 }
    const admin = Math.round(costos_directos * a.admin / 100)
    const imprevistos = Math.round(costos_directos * a.imprevistos / 100)
    const utilidad = Math.round(costos_directos * a.utilidad / 100)
    const iva = Math.round(utilidad * ivaPct / 100)
    return {
      costos_directos, admin, imprevistos, utilidad,
      base_iva: utilidad, iva,
      total: costos_directos + admin + imprevistos + utilidad + iva,
    }
  }

  const iva = Math.round(costos_directos * ivaPct / 100)
  return { costos_directos, base_iva: costos_directos, iva, total: costos_directos + iva }
}

/** Estado derivado: si enviada y venció la validez → 'vencida' (solo UI). */
export function estadoEfectivo(
  c: { estado: EstadoCotizacion; fecha_envio?: Timestamp; validez_dias?: number },
): EstadoCotizacion {
  if (c.estado === 'enviada' && c.fecha_envio && c.validez_dias) {
    const vence = c.fecha_envio.toDate().getTime() + c.validez_dias * 86_400_000
    if (Date.now() > vence) return 'vencida'
  }
  return c.estado
}
