// src/types/sigp/propuestaActividad.ts
//
// PROPUESTA ECONÓMICA de actividades (F1.2) — modelo y motor puro.
//
// N actividades → 1 propuesta (decisión de Giovanny, 18-ago-2026): el gestor
// del cliente recibe UN documento con UN consecutivo PEA-YYYY-NNN por
// negociación, con las VERSIONES que haga falta (los formatos del SGI se
// versionan bajo código fijo; quemar un consecutivo por ronda sobre-reportaría
// la serie). Mecanismo: patrón LPU — cada versión es SU PROPIO doc plano e
// inmutable con estado vigente/historica + reemplaza_a; la re-emisión es un
// writeBatch atómico (swap C1.1, sin subcolección: el batch es completo o no
// es). El documento es una FOTOGRAFÍA derivada de las actividades — los ítems
// viven en las actividades, no aquí.
//
// La APROBACIÓN sigue siendo POR ACTIVIDAD (jamás un estado del documento):
// el gestor puede aprobar dos de tres, cada una con su fecha y su referencia.
// La evidencia de "qué documento aprobó el gestor" se congela en el HITO
// (HitoAprobacion.propuesta_ref — §6d), no depende del puntero vivo.
//
// EJES INDEPENDIENTES (§6b): la propuesta agrupa por lo que el gestor pidió
// en un momento; el acta (F2) agrupa por mes en que la actividad queda
// COMPLETA. No se encadenan: el acta jamás se arma "desde propuestas".
import { Timestamp } from 'firebase/firestore'
import {
  calcularTotales,
} from './cotizacion'
import type {
  ItemCotizacion, TotalesCotizacion, CondicionesCotizacion, ConfigAIU,
  EsquemaTributario, Actividad as GrupoPropuesta,
} from './cotizacion'
import { estaValorizada } from './actividad'
import type { Actividad } from './actividad'
import type { Cliente } from './cliente'

export type EstadoPropuesta = 'vigente' | 'historica'

/** Un doc POR VERSIÓN en `propuestas_actividad`. Inmutable una vez emitido
 *  (salvo el swap vigente→historica). El PDF sale con el código ISO del
 *  formato de cotización (CM-FT-CT-19) numerado PEA- (ver isoControl.ts:
 *  ratificación de la dueña de proceso PENDIENTE — frente Trinorma). */
export interface PropuestaActividad {
  id: string                    // determinístico: pea-2026-005_v2 (idPropuesta)
  consecutivo: string           // PEA-YYYY-NNN — el MISMO en toda la serie
  version: number               // 1, 2, 3…
  estado: EstadoPropuesta
  reemplaza_a?: string          // id de la versión anterior (v≥2)
  cliente_id: string            // eje de esResidenteDe
  cliente_nombre: string        // denormalizado (pintar sin lecturas extra)
  actividad_ids: string[]       // el conjunto DE ESTA versión (cambia entre rondas)
  asunto: string
  esquema: EsquemaTributario
  aiu?: ConfigAIU
  iva_pct: number
  items: ItemCotizacion[]       // fotografía de las líneas de las actividades
  grupos: GrupoPropuesta[]      // agrupación por actividad (modo 'actividad' del PDF)
  totales: TotalesCotizacion
  condiciones: CondicionesCotizacion
  observaciones?: string
  fecha_emision: Timestamp
  firmante: { nombre: string; correo?: string; celular?: string }
  emitida_por: string           // uid
  pdf_hash: string              // SHA-256 del PDF emitido (regla 8)
  pdf_url: string
  fecha_creacion: Timestamp
}

export const IVA_PCT_DEFAULT = 19
export const VALIDEZ_DIAS_DEFAULT = 30

/** Slug determinístico del doc de una versión: reintentar una emisión no
 *  duplica (patrón doc-id de obra-espejo/proyectos). */
export function idPropuesta(consecutivo: string, version: number): string {
  return `${consecutivo.toLowerCase()}_v${version}`
}

/** Resolución CANÓNICA de la vigente de una serie — calco de lpuVigente():
 *  nada de .find() sueltos por la UI. */
export function propuestaVigenteDe(propuestas: PropuestaActividad[], consecutivo: string): PropuestaActividad | null {
  return propuestas.find(p => p.consecutivo === consecutivo && p.estado === 'vigente') ?? null
}

/** Series del cliente para la bandeja: agrupadas por consecutivo, la vigente
 *  primero y las históricas por versión descendente. */
export function seriesDe(propuestas: PropuestaActividad[]): { consecutivo: string; versiones: PropuestaActividad[] }[] {
  const por = new Map<string, PropuestaActividad[]>()
  for (const p of propuestas) {
    const arr = por.get(p.consecutivo) ?? []
    arr.push(p)
    por.set(p.consecutivo, arr)
  }
  return [...por.entries()]
    .map(([consecutivo, versiones]) => ({
      consecutivo,
      versiones: versiones.sort((a, b) => b.version - a.version),
    }))
    .sort((a, b) => b.consecutivo.localeCompare(a.consecutivo))
}

/** ¿La actividad puede entrar a una propuesta? Valorizada, no anulada y —para
 *  una emisión NUEVA— sin propuesta vigente que ya la cubra (para re-emitir
 *  la misma serie se pasa su consecutivo en `serieActual`). */
export function puedeProponerse(
  a: Pick<Actividad, 'anulacion' | 'lineas' | 'total' | 'propuesta_consecutivo'>,
  serieActual?: string,
): boolean {
  if (a.anulacion || !estaValorizada(a)) return false
  if (a.propuesta_consecutivo && a.propuesta_consecutivo !== serieActual) return false
  return true
}

/** Fotografía de la propuesta desde las actividades + el cliente. Devuelve
 *  null si el conjunto no es proponible (vacío, cliente cruzado, alguna sin
 *  valorizar o anulada) — el builder lo impide, no lo advierte. */
export function construirFotoPropuesta(
  actividades: Actividad[],
  cliente: Pick<Cliente, 'id' | 'condiciones_comerciales'>,
  serieActual?: string,
): {
  items: ItemCotizacion[]
  grupos: GrupoPropuesta[]
  totales: TotalesCotizacion
  esquema: EsquemaTributario
  aiu?: ConfigAIU
  iva_pct: number
  actividad_ids: string[]
} | null {
  if (actividades.length === 0) return null
  if (actividades.some(a => a.cliente_id !== cliente.id)) return null
  if (actividades.some(a => !puedeProponerse(a, serieActual))) return null

  const grupos: GrupoPropuesta[] = actividades.map((a, i) => ({
    id: a.id,
    nombre: [a.sede_nombre, a.zona, a.descripcion].filter(Boolean).join(' · '),
    orden: i,
  }))
  const items: ItemCotizacion[] = actividades.flatMap(a =>
    (a.lineas ?? []).map((l, j) => ({
      origen: 'lpu' as const,
      codigo: l.codigo,
      descripcion: l.descripcion,
      unidad: l.unidad,
      valor_unitario: l.valor_unitario,
      cantidad: l.cantidad,
      valor_total: l.total,
      actividad_id: a.id,
      instancia_id: `${a.id}_${j}`,
      lpu_id: l.lpu_id,
      lpu_item_id: l.lpu_item_id,
    })),
  )

  const esquema = cliente.condiciones_comerciales?.esquema_impuestos ?? 'iva_pleno'
  const aiu = esquema === 'aiu'
    ? (cliente.condiciones_comerciales?.aiu_defaults ?? { admin: 0, imprevistos: 0, utilidad: 0 })
    : undefined
  const totales = calcularTotales(items, esquema, aiu, IVA_PCT_DEFAULT, { modo: 'actividad', actividades: grupos })

  return {
    items, grupos, totales, esquema,
    ...(aiu ? { aiu } : {}),
    iva_pct: IVA_PCT_DEFAULT,
    actividad_ids: actividades.map(a => a.id),
  }
}

// ── Plan de re-emisión (puro — el writeBatch atómico lo ejecuta la orquestación) ──
export interface PlanReemision {
  idNueva: string               // doc nuevo, estado 'vigente'
  versionNueva: number
  historizar: string            // doc de la vigente actual → 'historica'
  /** Actividades que ENTRAN al conjunto (o siguen): puntero → doc nuevo. */
  vincular: string[]
  /** Actividades que SALEN del conjunto: puntero limpiado — su evidencia de
   *  aprobación (propuesta_ref del hito) NO se toca, es inmutable. */
  desvincular: string[]
}

/** Plan del swap: nueva vigente + historizar la actual + punteros. Solo se
 *  re-emite DESDE LA VIGENTE (una histórica no se corrige — la corrección
 *  nace de la última foto). Null si la base no es vigente o el set es vacío. */
export function planReemision(vigente: PropuestaActividad, actividadIdsNuevas: string[]): PlanReemision | null {
  if (vigente.estado !== 'vigente') return null
  if (actividadIdsNuevas.length === 0) return null
  const nuevas = new Set(actividadIdsNuevas)
  return {
    idNueva: idPropuesta(vigente.consecutivo, vigente.version + 1),
    versionNueva: vigente.version + 1,
    historizar: vigente.id,
    vincular: actividadIdsNuevas,
    desvincular: vigente.actividad_ids.filter(id => !nuevas.has(id)),
  }
}
