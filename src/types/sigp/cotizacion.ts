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

/** Cómo se titulan/semantizan los grupos de ítems de una VERSIÓN (mismo campo
 *  `capitulo` del ítem; solo cambia etiqueta). Vive en la versión — no en el
 *  padre — por integridad de snapshot: el PDF de cada versión enviada conserva
 *  su propio agrupador. Default: 'capitulos'. */
export type AgrupadorItems = 'capitulos' | 'actividades'

/** Clasificación de inversión para contratos tipo Claro (badge + filtro). */
export type TipoInversion = 'opex' | 'capex'

// ── Sub-tipos ─────────────────────────────────────────────────────────────────

export interface Adjunto {
  nombre: string
  url: string
  categoria: CategoriaAdjunto
  content_type?: string
  tamano?: number
  subido_en?: Timestamp
}

/** Insumo de una sección del APU (formato canónico APU_CLARO_113).
 *  `rendimiento` es el consumo por UNA unidad de la actividad — el corazón
 *  del análisis, no una cantidad de lote; acepta decimales finos (0.0909).
 *  El subtotal conserva precisión completa; el redondeo a peso ocurre en los
 *  totales de la cotización, no aquí. */
export interface InsumoAPU {
  descripcion: string
  unidad: string
  rendimiento: number          // consumo por unidad de la actividad
  costo_unitario: number
  subtotal: number             // rendimiento × costo_unitario (precisión completa)
}

/** Análisis de Precios Unitarios embebido en el ítem (origen 'apu').
 *  5 secciones fijas en orden canónico (APU_CLARO_113); cualquiera puede ir
 *  vacía. Es snapshot: editarlo después no toca versiones enviadas. */
export interface APU {
  mano_obra: InsumoAPU[]
  materiales: InsumoAPU[]
  equipo: InsumoAPU[]
  transporte: InsumoAPU[]
  herramienta_menor: InsumoAPU[]
  costo_directo: number        // suma de las 5 secciones (snapshot)
}

/** Orden canónico de las secciones del APU + etiquetas de UI/PDF interno. */
export const SECCIONES_APU = ['mano_obra', 'materiales', 'equipo', 'transporte', 'herramienta_menor'] as const
export type SeccionAPU = typeof SECCIONES_APU[number]

export const SECCION_APU_LABEL: Record<SeccionAPU, string> = {
  mano_obra: 'Mano de obra',
  materiales: 'Materiales',
  equipo: 'Equipo',
  transporte: 'Transporte',
  herramienta_menor: 'Herramienta menor',
}

export interface ItemCotizacion {
  origen: OrigenItem
  codigo: string               // código LPU · CAT-NNNN · INP-NNN temporal · ''
  descripcion: string
  unidad: string
  valor_unitario: number
  cantidad: number
  valor_total: number          // snapshot = valor_unitario * cantidad
  capitulo?: string            // agrupador (capítulo o actividad, según la versión)

  // ── Análisis económico (INTERNO — jamás se pinta en el PDF) ────────────────
  costo_directo?: number       // costo interno UNITARIO (del APU o manual)
  /** % de utilidad sobre el PRECIO: precio = costo / (1 - margen/100).
   *  El "factor 0,9" del Excel DC-FT-CT-24 equivale a margen = 10.
   *  Rango válido: [0, 100). */
  margen?: number

  apu?: APU                    // solo origen 'apu' (embebido, snapshot)

  // Referencias de origen — SOLO trazabilidad, NUNCA lectura viva (es snapshot):
  lpu_id?: string
  lpu_item_id?: string
  catalogo_id?: string         // si vino del catálogo NEG o se incorporó a él
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
  /** Cómo se agrupan/titulan los ítems de ESTA versión. Ausente en versiones
   *  anteriores a F1.4-B → leer como 'capitulos'. Editable solo en borrador;
   *  se copia al crear nueva versión. */
  agrupador?: AgrupadorItems
  fecha_envio?: Timestamp      // cuándo se envió ESTA versión
  pdf_url?: string             // PDF generado al enviar (cara al cliente)
  pdf_hash?: string            // SHA-256 de los bytes del PDF (evidencia de integridad)
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
  tipo_inversion?: TipoInversion   // OPEX/CAPEX (contratos tipo Claro) — opcional
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

export const AGRUPADORES = ['capitulos', 'actividades'] as const

/** Plural — títulos de sección/PDF. */
export const AGRUPADOR_LABEL: Record<AgrupadorItems, string> = {
  capitulos: 'Capítulos',
  actividades: 'Actividades',
}

/** Singular — encabezado de columna y campo del ítem. */
export const AGRUPADOR_SINGULAR: Record<AgrupadorItems, string> = {
  capitulos: 'Capítulo',
  actividades: 'Actividad',
}

export const TIPOS_INVERSION = ['opex', 'capex'] as const

export const TIPO_INVERSION_LABEL: Record<TipoInversion, string> = {
  opex: 'OPEX',
  capex: 'CAPEX',
}

/** Badge en neutros de marca (clasificación, no estado). */
export const TIPO_INVERSION_COLOR: Record<TipoInversion, string> = {
  opex: 'bg-gray-100 text-gray-700',
  capex: 'bg-brand-50 text-brand-700',
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

// ── Análisis económico (interno) ──────────────────────────────────────────────

/**
 * Precio de venta a partir del costo interno y el margen (% de utilidad sobre
 * el PRECIO): precio = costo / (1 - margen/100). El "factor 0,9" del Excel
 * DC-FT-CT-24 equivale a margen = 10.
 * Devuelve null si el margen está fuera de [0, 100) (división por cero o
 * precio negativo) o el costo es negativo.
 */
export function precioDesdeCosto(costo: number, margen: number): number | null {
  if (!Number.isFinite(costo) || !Number.isFinite(margen)) return null
  if (costo < 0 || margen < 0 || margen >= 100) return null
  return costo / (1 - margen / 100)
}

/**
 * Margen implícito (% de utilidad sobre el precio) dado costo y precio:
 * margen = (1 - costo/precio) × 100. Puede ser negativo (venta a pérdida) —
 * la UI lo muestra como alerta. Devuelve null si el precio es <= 0.
 */
export function margenDesdePrecio(costo: number, precio: number): number | null {
  if (!Number.isFinite(costo) || !Number.isFinite(precio) || precio <= 0 || costo < 0) return null
  return (1 - costo / precio) * 100
}

/** Costo directo de un APU = suma de subtotales de sus 5 secciones canónicas. */
export function costoDirectoAPU(apu: Omit<APU, 'costo_directo'>): number {
  const suma = (xs: InsumoAPU[]) => xs.reduce((s, i) => s + (i.subtotal || 0), 0)
  return SECCIONES_APU.reduce((t, sec) => t + suma(apu[sec] ?? []), 0)
}

// ── Códigos INP temporales ────────────────────────────────────────────────────

const RE_INP = /^INP-\d+$/

/**
 * Renumera los códigos temporales INP-NNN de una versión: los ítems manual/apu
 * con código vacío o INP-* reciben INP-001, INP-002… en orden de aparición.
 * Contador LOCAL de la versión (no consecutivo global). Los códigos LPU,
 * CAT-NNNN y los tecleados por el usuario no se tocan. Devuelve un array nuevo.
 */
export function asignarCodigosINP(items: ItemCotizacion[]): ItemCotizacion[] {
  let n = 0
  return items.map(it => {
    const esTemporal = it.origen !== 'lpu' && (!it.codigo.trim() || RE_INP.test(it.codigo.trim()))
    if (!esTemporal) return it
    n++
    return { ...it, codigo: `INP-${String(n).padStart(3, '0')}` }
  })
}

// ── Seguimiento de enviadas (derivado, nada se almacena) ──────────────────────

/** Días completos desde el envío, o null si no hay fecha. */
export function diasDesdeEnvio(fechaEnvio?: Timestamp): number | null {
  const d = fechaEnvio?.toDate?.()
  if (!d) return null
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000))
}

/** Escala del indicador "hace N días": verde <7 · ámbar 7–14 · naranja 15–29 · rojo ≥30. */
export function colorSeguimiento(dias: number): string {
  if (dias < 7) return 'bg-emerald-50 text-emerald-700'
  if (dias < 15) return 'bg-amber-50 text-amber-700'
  if (dias < 30) return 'bg-orange-50 text-orange-700'
  return 'bg-red-50 text-red-700'
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
