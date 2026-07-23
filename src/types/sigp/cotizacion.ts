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
 *  su propio agrupador. Default: 'capitulos'.
 *  @deprecated F1.5.2 — reetiquetado superficial de F1.4-B. La fuente nueva es
 *  `modo_agrupacion` + `actividades` (entidad propia). Se conserva para leer
 *  versiones existentes; la UI/PDF lo reconcilian en F1.5.2b/c. */
export type AgrupadorItems = 'capitulos' | 'actividades'

/** Modo de agrupación de una VERSIÓN (F1.5.2): por `capitulo` del ítem
 *  (comportamiento histórico) o por ACTIVIDADES como entidad propia. */
export type ModoAgrupacion = 'capitulo' | 'actividad'

/** Actividad de una versión (F1.5.2 — entidad propia, no reetiquetado):
 *  nombre libre editable; un ítem puede repetirse en varias actividades
 *  (varias INSTANCIAS en items[] con igual `codigo` y distinta `cantidad` /
 *  `actividad_id`); una actividad puede contener ítems de capítulos distintos. */
export interface Actividad {
  id: string                   // id local de la versión (no doc Firestore)
  nombre: string
  orden: number
}

/** Subtotal de un grupo (capítulo o actividad), ANTES de impuestos. */
export interface SubtotalGrupo {
  grupo_id: string             // capitulo (texto) | actividad.id | '__otros__'
  grupo_nombre: string
  orden: number
  subtotal: number             // Σ valor_total de sus ítems (redondeado a peso)
}

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
  capitulo?: string            // capítulo de origen (agrupa en modo 'capitulo')

  // ── Instancia (F1.5.2): cada línea de items[] es una INSTANCIA. El mismo
  //    ítem repetido = varias entradas con igual `codigo` y distinta
  //    `cantidad`/`actividad_id` — ningún código debe asumir `codigo` único. ──
  /** Id estable de la INSTANCIA (uuid local de la versión): key de React, DnD
   *  y asignación a actividad. Ausente en líneas guardadas antes de F1.5.2 →
   *  default lazy con `conInstanciaIds()`. No participa en la matemática. */
  instancia_id?: string
  /** Actividad a la que pertenece ESTA instancia (solo en modo 'actividad');
   *  referencia a `Actividad.id` de la versión. */
  actividad_id?: string
  /** Orden estable de la instancia dentro de su grupo (lo asigna la UI);
   *  ausente → orden de aparición en items[]. */
  orden?: number

  /** Línea de TRANSPORTE por zona (correctivos IHS, Bloque C): su cantidad se
   *  CALCULA sola = Σ(valor_total de las demás líneas) / 100 y no se teclea.
   *  Se marca al insertarla desde el selector/buscador; para líneas guardadas
   *  antes del flag, `esItemTransporte()` la deriva (unidad % + "Zona N…"). */
  es_transporte?: boolean

  // ── Análisis económico (INTERNO — jamás se pinta en el PDF) ────────────────
  costo_directo?: number       // costo interno UNITARIO (del APU o manual)
  /** % de utilidad sobre el PRECIO: precio = costo / (1 - margen/100).
   *  El "factor 0,9" del Excel DC-FT-CT-24 equivale a margen = 10.
   *  Rango válido: [0, 100). */
  margen?: number

  apu?: APU                    // solo origen 'apu' (embebido, snapshot)

  // ── Esquema Matriz → NEG (23-jul, caso INGEMEC) ────────────────────────────
  /** Precio FULL de la Matriz del LPU (ATC→INGEMEC). SOLO LECTURA — fidelidad
   *  de snapshot, intocable (patchInstancia lo defiende). Presente ⇒ el ítem
   *  usa el esquema de factor y `valor_unitario` = valor NEG DERIVADO. */
  valor_matriz?: number
  /** Factor Matriz→NEG elegible POR ÍTEM (0.72 default · 0.15 material del
   *  cliente). Es lo ÚNICO editable del precio en estos ítems. */
  factor?: number
  factor_etiqueta?: string

  // Referencias de origen — SOLO trazabilidad, NUNCA lectura viva (es snapshot):
  lpu_id?: string
  lpu_item_id?: string
  catalogo_id?: string         // si vino del catálogo NEG o se incorporó a él
}

/** Valor NEG derivado: Matriz × factor, redondeado a peso. */
export const valorNegDe = (valorMatriz: number, factor: number): number =>
  Math.round(valorMatriz * factor)

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

// ── F1.5.5 — Presets de condiciones comerciales ──
// Sugerencias elegibles (datalist): el usuario puede escoger una o escribir
// texto libre. Ajustar estas listas con el área comercial cuando use el formato.
export const PRESETS_FORMA_PAGO = [
  '50% anticipo, 50% contra entrega a satisfacción',
  '30% anticipo, 70% contra entrega a satisfacción',
  '100% contra entrega a satisfacción',
  'Crédito a 30 días tras radicación de la factura',
  'Crédito a 45 días tras radicación de la factura',
  'Según actas de avance mensuales',
]
export const PRESETS_TIEMPO_EJECUCION = [
  '15 días calendario',
  '30 días calendario',
  '45 días calendario',
  '60 días calendario',
  '90 días calendario',
  'Según cronograma acordado con el cliente',
]
export const PRESETS_GARANTIA = [
  '6 meses sobre mano de obra',
  '12 meses sobre mano de obra',
  '12 meses sobre materiales y mano de obra',
  'La otorgada por el fabricante sobre equipos y materiales',
]

/** Texto base de "Notas importantes" del PDF — se siembra al crear la
 *  cotización y el usuario lo ajusta según la necesidad (una nota por línea). */
export const OBSERVACIONES_BASE =
  'Los precios no incluyen actividades ni suministros no descritos en el alcance de esta propuesta.\n' +
  'Cualquier trabajo adicional será objeto de cotización por separado.\n' +
  'Vencida la validez indicada, los valores de esta propuesta podrán ser ajustados.'

/** Bloque de totales calculado (snapshot). */
export interface TotalesCotizacion {
  costos_directos: number      // suma de valor_total de ítems
  admin?: number               // solo AIU
  imprevistos?: number         // solo AIU
  utilidad?: number            // solo AIU
  base_iva: number             // iva_pleno: costos_directos | aiu: utilidad
  iva: number                  // base_iva * iva_pct / 100
  total: number
  /** Desglose por grupo ANTES de impuestos (F1.5.2). Presente solo cuando
   *  calcularTotales recibe la agrupación; ausente en snapshots anteriores. */
  subtotales_por_grupo?: SubtotalGrupo[]
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
   *  se copia al crear nueva versión.
   *  @deprecated F1.5.2 — ver `modo_agrupacion`. */
  agrupador?: AgrupadorItems

  /** Modo de agrupación (F1.5.2). Ausente en versiones existentes → leer como
   *  'capitulo' (usar `modoAgrupacionDe()`; default lazy, sin migración). */
  modo_agrupacion?: ModoAgrupacion
  /** Actividades de la versión (solo modo 'actividad'; vacío en modo capítulo).
   *  Ausente en versiones existentes → leer como []. */
  actividades?: Actividad[]
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
   *  Ráquira"). Obligatorio al crear; editable mientras esté en borrador.
   *  Si la cotización está ENLAZADA a una solicitud (solicitud_id), este campo
   *  es un ESPEJO del asunto canónico de la solicitud: solo se escribe vía
   *  `utils/sigp/asunto.ts` (batch atómico solicitud + cotizaciones). */
  asunto: string

  /** El asunto vivo cambió DESPUÉS de generar el PDF de la versión enviada
   *  (Bloque B): el PDF quedó con el asunto anterior. Se limpia al generar
   *  el siguiente PDF (envío) o al crear una nueva versión. */
  pdf_desactualizado?: boolean

  /** Nombre del contacto del cliente para ESTA cotización (dato de
   *  presentación, PDF/meta): prellenado desde el contacto principal del
   *  cliente vinculado; editable en borrador; manual para prospectos. */
  contacto?: string

  // Origen: cliente/prospecto y/o solicitud (hereda cliente/prospecto).
  cliente_id?: string
  prospecto_nombre?: string
  solicitud_id?: string

  /** Bloque 1 — identificación del sitio (heredada de la solicitud, editable
   *  en borrador). Alimenta el snapshot del proyecto y la obra-espejo SST. */
  nombre_sitio?: string
  codigo_sitio_cliente?: string

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

  // Enlace al proyecto nacido de esta cotización (F2.1.a; 1:1, id = id de la
  // cotización). Solo existe si se aprobó con sigp_f2_enabled activo.
  proyecto_id?: string
  proyecto_consecutivo?: string

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

// ── Transporte automático por zona (Bloque C — correctivos IHS) ──────────────
//
// En el LPU real de IHS las filas de transporte NO viven en un grupo
// "TRANSPORTE": están en ESTRUCTURAS (códigos 51-54) y OBRA CIVIL (163-166),
// una por zona, con unidad "%" y el FACTOR como valor unitario (Z1 10,52 ·
// Z2 15,78 · Z2 SAI/Chocó 21,04 · Z3 18,94). El reconocimiento robusto es
// unidad '%' + descripción "Zona N…" (verificado contra el LPU vigente).

/** ¿Es una fila de transporte por zona? (aplica a ítems del LPU y de la
 *  cotización por igual — el criterio es del DATO, no de dónde vive). */
export function esTransporteZona(x: { unidad?: string; descripcion?: string }): boolean {
  return (x.unidad ?? '').trim() === '%' && /^\s*zona\s*\d/i.test(x.descripcion ?? '')
}

/** ¿Esta línea de la cotización es LA línea de transporte? */
export function esItemTransporte(it: ItemCotizacion): boolean {
  return it.es_transporte === true || esTransporteZona(it)
}

const redondear2 = (n: number) => Math.round(n * 100) / 100

/**
 * Recalcula la línea de transporte: cantidad = Σ(valor_total de TODAS las
 * demás líneas) / 100 (redondeada a 2 decimales), de modo que
 * total = cantidad × factor = (Σ demás) × factor / 100.
 *
 * Sin cálculo circular: las líneas de transporte SE EXCLUYEN de la base.
 * Idempotente y estable: si nada cambia devuelve el MISMO array (permite
 * usarla en un efecto de React sin bucles). Sin línea de transporte, es
 * la identidad — no aplica a cotizaciones que no la tienen.
 */
export function aplicarTransporte(items: ItemCotizacion[]): ItemCotizacion[] {
  if (!items.some(esItemTransporte)) return items
  const base = items.reduce((s, it) => (esItemTransporte(it) ? s : s + (it.valor_total || 0)), 0)
  const cantidad = redondear2(base / 100)
  let cambio = false
  const out = items.map(it => {
    if (!esItemTransporte(it)) return it
    const valor_total = valorTotalItem(it.valor_unitario, cantidad)
    if (it.cantidad === cantidad && it.valor_total === valor_total) return it
    cambio = true
    return { ...it, cantidad, valor_total }
  })
  return cambio ? out : items
}

/** Quita tildes y baja a minúsculas (comparación de departamentos). */
const normalizarTexto = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Sugerencia de zona por el sitio: busca qué fila de transporte menciona en
 * su descripción algún departamento presente en el texto del sitio (los
 * departamentos VIVEN en las descripciones del LPU — no se cablea
 * zonificación). Devuelve el índice del candidato o -1.
 */
export function sugerirTransporteZona(
  sitioTexto: string,
  candidatos: { descripcion?: string }[],
): number {
  const sitio = normalizarTexto(sitioTexto || '')
  if (!sitio.trim()) return -1
  for (let i = 0; i < candidatos.length; i++) {
    const desc = normalizarTexto(candidatos[i].descripcion ?? '')
    // departamentos = lo que sigue a "Zona N:" separado por comas (sin paréntesis)
    const m = desc.match(/^\s*zona\s*\d[^:]*:\s*([^(]*)/)
    if (!m) continue
    const departamentos = m[1].split(',').map(d => d.trim()).filter(d => d.length >= 4)
    // Palabra completa (evita "metálica" ⊃ "meta")
    const esta = (d: string) =>
      new RegExp(`(^|[^a-zñ])${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-zñ])`).test(sitio)
    if (departamentos.some(esta)) return i
  }
  return -1
}

// ── Agrupación (F1.5.2) ───────────────────────────────────────────────────────

/** id reservado del grupo de ítems sin capítulo / sin actividad asignada. */
export const GRUPO_OTROS_ID = '__otros__'

/** Default lazy de retrocompatibilidad: versión sin `modo_agrupacion` (todas
 *  las anteriores a F1.5.2) se comporta como 'capitulo'. Sin migración. */
export function modoAgrupacionDe(v: Pick<VersionCotizacion, 'modo_agrupacion'>): ModoAgrupacion {
  return v.modo_agrupacion ?? 'capitulo'
}

/** Default lazy: versión sin `actividades` → []. */
export function actividadesDe(v: Pick<VersionCotizacion, 'actividades'>): Actividad[] {
  return v.actividades ?? []
}

/**
 * Subtotales por grupo, ANTES de impuestos (Σ valor_total de los ítems del grupo).
 * - modo 'capitulo': agrupa por `item.capitulo` en orden de primera aparición;
 *   ítems sin capítulo → grupo 'Otros'.
 * - modo 'actividad': agrupa por `item.actividad_id`; nombre y orden vienen de
 *   `actividades` (se respeta su `orden`, incluidas actividades declaradas sin
 *   ítems, con subtotal 0); instancias huérfanas (sin actividad o con id no
 *   declarado) → grupo 'Otros' al final.
 * Invariante: Σ subtotales === costos_directos (antes de impuestos).
 */
export function subtotalesPorGrupo(
  items: ItemCotizacion[],
  modo: ModoAgrupacion,
  actividades: Actividad[] = [],
): SubtotalGrupo[] {
  if (modo === 'actividad') {
    const ordenadas = [...actividades].sort((a, b) => a.orden - b.orden)
    const porId = new Map<string, SubtotalGrupo>(
      ordenadas.map(a => [a.id, { grupo_id: a.id, grupo_nombre: a.nombre, orden: a.orden, subtotal: 0 }]),
    )
    const maxOrden = ordenadas.reduce((m, a) => Math.max(m, a.orden), -1)
    const otros: SubtotalGrupo = { grupo_id: GRUPO_OTROS_ID, grupo_nombre: 'Otros', orden: maxOrden + 1, subtotal: 0 }
    let hayHuerfanos = false
    for (const it of items) {
      const g = it.actividad_id ? porId.get(it.actividad_id) : undefined
      if (g) g.subtotal += it.valor_total || 0
      else { otros.subtotal += it.valor_total || 0; hayHuerfanos = true }
    }
    const res = [...porId.values()]
    if (hayHuerfanos) res.push(otros)
    res.forEach(g => { g.subtotal = Math.round(g.subtotal) })
    return res
  }

  // modo 'capitulo': orden de primera aparición
  const m = new Map<string, SubtotalGrupo>()
  let n = 0
  for (const it of items) {
    const nombre = it.capitulo?.trim() || 'Otros'
    const id = it.capitulo?.trim() ? nombre : GRUPO_OTROS_ID
    if (!m.has(id)) m.set(id, { grupo_id: id, grupo_nombre: nombre, orden: n++, subtotal: 0 })
    m.get(id)!.subtotal += it.valor_total || 0
  }
  const res = [...m.values()]
  res.forEach(g => { g.subtotal = Math.round(g.subtotal) })
  return res
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
 *
 * F1.5.2 — `agrupacion` (opcional): si se pasa, el resultado incluye
 * `subtotales_por_grupo` (desglose ANTES de impuestos). Los impuestos se
 * calculan a nivel versión exactamente igual con o sin agrupación; las
 * llamadas existentes (sin 5º argumento) devuelven un resultado idéntico
 * al histórico.
 */
export function calcularTotales(
  items: ItemCotizacion[],
  esquema: EsquemaTributario,
  aiu: ConfigAIU | undefined,
  ivaPct: number,
  agrupacion?: { modo: ModoAgrupacion; actividades?: Actividad[] },
): TotalesCotizacion {
  // CD = suma de valor_total (ya redondeado por ítem); se redondea de nuevo por robustez.
  const costos_directos = Math.round(items.reduce((s, it) => s + (it.valor_total || 0), 0))

  const desglose = agrupacion
    ? { subtotales_por_grupo: subtotalesPorGrupo(items, agrupacion.modo, agrupacion.actividades) }
    : {}

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
      ...desglose,
    }
  }

  const iva = Math.round(costos_directos * ivaPct / 100)
  return { costos_directos, base_iva: costos_directos, iva, total: costos_directos + iva, ...desglose }
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

// ── Instancias (F1.5.2b) ──────────────────────────────────────────────────────

/** Id de instancia nuevo (uuid local de la versión). */
export function nuevaInstanciaId(): string {
  return crypto.randomUUID()
}

/** Default lazy: asigna `instancia_id` a las líneas guardadas antes de F1.5.2
 *  que no lo tienen. Las que ya lo tienen no cambian. Devuelve un array nuevo. */
export function conInstanciaIds(items: ItemCotizacion[]): ItemCotizacion[] {
  return items.map(it => (it.instancia_id ? it : { ...it, instancia_id: nuevaInstanciaId() }))
}

/**
 * Siembra del cambio capítulo → actividad (F1.5.2b): crea una actividad por
 * cada grupo de capítulo actual (en orden de primera aparición; sin capítulo →
 * 'Otros') y asigna cada instancia a la actividad de su capítulo.
 * Puro salvo por la generación de ids. Devuelve estructuras nuevas.
 */
export function sembrarActividadesDesdeCapitulos(
  items: ItemCotizacion[],
): { actividades: Actividad[]; items: ItemCotizacion[] } {
  const porCapitulo = new Map<string, Actividad>()
  for (const it of items) {
    const nombre = it.capitulo?.trim() || 'Otros'
    if (!porCapitulo.has(nombre)) {
      porCapitulo.set(nombre, { id: nuevaInstanciaId(), nombre, orden: porCapitulo.size })
    }
  }
  const actividades = [...porCapitulo.values()]
  const itemsAsignados = items.map(it => ({
    ...it,
    actividad_id: porCapitulo.get(it.capitulo?.trim() || 'Otros')!.id,
  }))
  return { actividades, items: itemsAsignados }
}

// ── Bloqueo de ítems de origen LPU/catálogo (F1.5.2 b-fix) ───────────────────

/**
 * Un ítem que viene del LPU del cliente o del catálogo NEG es un SNAPSHOT
 * comercial: código, descripción, unidad y valor unitario no se editan en la
 * cotización (fidelidad al precio pactado / al catálogo). Editables: cantidad
 * y actividad. Un APU manual construido para la cotización es editable; un
 * ítem traído del catálogo (catalogo_id) se bloquea.
 */
export function esItemBloqueado(it: Pick<ItemCotizacion, 'origen' | 'catalogo_id'>): boolean {
  return it.origen === 'lpu' || !!it.catalogo_id
}

/**
 * Aplica un patch a una instancia con las reglas del constructor (F1.5.2 b-fix):
 * - Ítems bloqueados (LPU/catálogo): se IGNORAN los cambios a codigo,
 *   descripcion, unidad y valor_unitario — el snapshot no puede mutarse ni por
 *   código. También se ignora `margen` directo (su goal-seek alteraría el
 *   precio protegido); el margen queda derivado del costo y el precio.
 * - Goal-seek del análisis económico (solo no bloqueados): margen válido →
 *   recalcula precio; precio/costo → re-deriva margen; costo limpiado → margen
 *   limpiado.
 * - valor_total SIEMPRE se recalcula (cantidad sigue siendo editable).
 */
export function patchInstancia(it: ItemCotizacion, patch: Partial<ItemCotizacion>): ItemCotizacion {
  const bloqueado = esItemBloqueado(it)
  const p: Partial<ItemCotizacion> = { ...patch }
  // Esquema Matriz→NEG (INGEMEC): el valor_matriz es snapshot INTOCABLE —
  // se fija al insertar del LPU y jamás se parcha.
  delete p.valor_matriz
  if (bloqueado) {
    delete p.codigo
    delete p.descripcion
    delete p.unidad
    delete p.valor_unitario
    delete p.margen
  }
  // Bloque C: la cantidad de la línea de transporte se CALCULA sola
  // (aplicarTransporte) — defensa en profundidad contra edición manual.
  if (esItemTransporte(it)) delete p.cantidad
  const m = { ...it, ...p }
  // Esquema Matriz→NEG: el FACTOR es lo único editable del precio — el valor
  // operativo (valor_unitario) SIEMPRE se re-deriva de la Matriz congelada.
  // Aplica aun en ítems bloqueados (el factor no muta el snapshot del LPU).
  if (m.valor_matriz !== undefined && m.factor !== undefined) {
    m.valor_unitario = valorNegDe(m.valor_matriz, m.factor)
    if (m.costo_directo !== undefined) {
      const mg = margenDesdePrecio(m.costo_directo, m.valor_unitario)
      if (mg !== null) m.margen = Math.round(mg * 10) / 10
    }
  }
  if (!bloqueado && 'margen' in p && m.margen !== undefined && m.costo_directo !== undefined) {
    const precio = precioDesdeCosto(m.costo_directo, m.margen)
    if (precio !== null) m.valor_unitario = Math.round(precio)
  } else if (('valor_unitario' in p || 'costo_directo' in p) && !('margen' in p)) {
    if (m.costo_directo === undefined) {
      delete m.margen
    } else {
      const mg = margenDesdePrecio(m.costo_directo, m.valor_unitario)
      if (mg !== null) m.margen = Math.round(mg * 10) / 10
    }
  }
  m.valor_total = valorTotalItem(m.valor_unitario, m.cantidad)
  return m
}

// ── Códigos INP temporales ────────────────────────────────────────────────────

const RE_INP = /^INP-\d+$/

/**
 * Renumera los códigos temporales INP-NNN de una versión: los ítems manual/apu
 * con código vacío o INP-* reciben INP-001, INP-002… en orden de aparición,
 * cada línea el suyo (comportamiento F1.4; la sincronización entre "instancias
 * hermanas" de F1.5.2b se retiró junto con la duplicación de instancias).
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
