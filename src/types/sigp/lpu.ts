// src/types/sigp/lpu.ts
//
// Tipos del dominio LPU (Lista de Precios Unitarios) — Fase 1 — Comercial.
// Los ítems viven en la subcolección `lpus/{lpuId}/items` por volumen.

import type { Timestamp } from 'firebase/firestore'

/**
 * Ítem de una lista de precios unitarios. Vive en la SUBCOLECCIÓN
 * `lpus/{lpuId}/items` — no como array en el doc de la LPU (volumen ~900 ítems
 * en Ingemec excede el riesgo de 1MB por documento).
 */
export interface ItemLPU {
  id: string                 // id del doc Firestore
  codigo: string
  /** Capítulo jerárquico de origen (ej: capítulos OPEX/CAPEX de Claro). Opcional. */
  capitulo?: string
  descripcion: string
  unidad: string
  valor_unitario: number
  /** Hoja/categoría de origen en el Excel; agrupador principal del ítem. */
  categoria: string
  /** Orden original de aparición en el Excel (para preservar secuencia). */
  orden: number
}

/**
 * Esquema Matriz → NEG (23-jul-2026, caso INGEMEC): el LPU trae los precios
 * de la MATRIZ del cliente final (ATC → INGEMEC), NO los de NEG. INGEMEC
 * paga a NEG un FACTOR de la Matriz: 72 % normal, 15 % cuando INGEMEC
 * suministra el material. Con este esquema presente, el cotizador congela
 * `valor_matriz` (solo lectura), el factor es elegible POR ÍTEM y el valor
 * OPERATIVO del ítem es `valor_matriz × factor` — así todo aguas abajo
 * (totales, snapshot del proyecto, preliquidación, liquidación) hereda el
 * valor NEG correcto sin tocarse. LPUs sin el campo: nada cambia.
 */
export interface EsquemaFactorLpu {
  factor_default: number       // 0.72
  factor_alt: number           // 0.15
  etiqueta_default: string     // "72% · NEG suministra material"
  etiqueta_alt: string         // "15% · INGEMEC suministra material"
}

/**
 * Documento de la colección `lpus`. Los ítems NO van aquí (subcolección).
 * `total_items` y `categorias` se denormalizan para poder listar/mostrar
 * sin leer la subcolección.
 */
export interface LPU {
  id: string
  cliente_id: string
  nombre: string
  /** Vigencia declarada de la lista. `hasta: null` = sin fecha de fin. */
  vigencia?: {
    desde: Timestamp | null
    hasta: Timestamp | null
  }
  moneda: string             // default 'COP'
  estado: 'vigente' | 'historica'
  /** Versionado: LPU nueva = doc nuevo; la anterior pasa a 'historica'. */
  version: number
  reemplaza_a?: string       // id de la LPU anterior en la cadena de versiones

  // Evidencia ISO de origen de precios (subproducto de operar)
  archivo_original_url?: string     // URL en Storage del Excel original
  archivo_original_nombre?: string  // nombre de archivo para la descarga
  importada_por?: string            // uid de quien importó

  fecha_importacion: Timestamp      // único sello de creación de la LPU
  total_items: number
  categorias: string[]       // categorías/hojas presentes en esta LPU

  /** Esquema Matriz → NEG (solo INGEMEC hoy; ausente = LPU normal). */
  esquema_factor?: EsquemaFactorLpu

  // ── Alcance (C1.1, 14-ago-2026) — AMBOS opcionales: ausentes = la lista
  //    "global del cliente" de siempre (INGEMEC/IHS/Vertis no se migran).
  //    Un cliente con varios contratos (caso real: Claro OPEX/CAPEX) importa
  //    una lista POR alcance y el versionado historiza dentro del alcance. ──
  /** Contrato al que pertenece la lista — vocabulario de `Cliente.contratos`. */
  contrato?: string
  /** Naturaleza de la inversión del contrato. */
  naturaleza?: NaturalezaLpu

  /** C1.1: si la importación disparó el guard de calidad y el usuario FORZÓ,
   *  la decisión queda auditable en el propio doc (quién, cuándo, señales). */
  forzado_importacion?: {
    por: string
    fecha: Timestamp
    senales: string[]
  }
}

export const NATURALEZAS_LPU = ['opex', 'capex'] as const
export type NaturalezaLpu = typeof NATURALEZAS_LPU[number]
export const NATURALEZA_LPU_LABEL: Record<NaturalezaLpu, string> = {
  opex: 'OPEX', capex: 'CAPEX',
}

export const LPU_ESTADOS = ['vigente', 'historica'] as const
export const MONEDA_DEFAULT = 'COP'

// ── Resolución consolidada de "la vigente" (C1.1) ────────────────────────────

/** Alcance pedido al resolver una lista. Vacío = comportamiento clásico. */
export interface AlcanceLpu {
  contrato?: string
  naturaleza?: NaturalezaLpu
}

const tieneAlcance = (a?: AlcanceLpu): boolean => !!(a && (a.contrato || a.naturaleza))

/** ¿La LPU coincide EXACTAMENTE con el alcance pedido? (campos presentes). */
function coincideAlcance(l: LPU, a: AlcanceLpu): boolean {
  return (l.contrato ?? undefined) === (a.contrato || undefined)
    && (l.naturaleza ?? undefined) === (a.naturaleza || undefined)
}

/**
 * ÚNICA resolución de "la LPU vigente" del panel (reemplaza los `.find()`
 * sueltos — wizard, historización y buscador del cotizador).
 *
 *  - Con alcance: la vigente del cliente que coincida exactamente.
 *  - Sin alcance: si el cliente tiene UNA sola vigente → esa (compat total
 *    con el comportamiento histórico); si tiene varias (cliente con
 *    contratos) → null y el caller debe pedir el alcance.
 */
export function lpuVigente(lpus: LPU[], clienteId: string, alcance?: AlcanceLpu): LPU | null {
  const vigentes = lpus.filter(l => l.cliente_id === clienteId && l.estado === 'vigente')
  if (tieneAlcance(alcance)) return vigentes.find(l => coincideAlcance(l, alcance!)) ?? null
  if (vigentes.length === 1) return vigentes[0]
  // varias vigentes sin alcance pedido: preferir la ÚNICA sin alcance si existe
  const sinAlcance = vigentes.filter(l => !l.contrato && !l.naturaleza)
  return sinAlcance.length === 1 ? sinAlcance[0] : null
}
