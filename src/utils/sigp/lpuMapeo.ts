// src/utils/sigp/lpuMapeo.ts
//
// Lógica pura del mapeo y consolidación de una importación de LPU (pasos 3–4 del
// wizard). Sin React/Firestore → testeable con Vitest.

import type { HojaCruda, CeldaCruda } from './lpuExcel'
import type { MapeoColumnas, MapeoHoja } from '../../types/sigp/importacion'

// ── Tipos de resultado ────────────────────────────────────────────────────────

/** Ítem parseado desde el Excel (aún sin id de Firestore). */
export interface ItemParseado {
  codigo: string
  capitulo?: string
  descripcion: string
  unidad: string
  valor_unitario: number
  categoria: string
  orden: number
}

export type MotivoDescarte = 'sin_descripcion' | 'precio_invalido'

export interface FilaDescartada {
  hoja: string
  fila: number // índice 0-based de la fila cruda
  motivo: MotivoDescarte
  contenido: string
}

export interface ResultadoHoja {
  items: ItemParseado[]
  descartadas: FilaDescartada[]
  capitulos: string[]
}

// ── Helpers de celda ──────────────────────────────────────────────────────────

function textoDe(v: CeldaCruda | undefined): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function celdaVacia(v: CeldaCruda | undefined): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}

function resumenFila(fila: CeldaCruda[]): string {
  return fila
    .filter(c => !celdaVacia(c))
    .map(c => String(c).trim())
    .join(' | ')
    .slice(0, 120)
}

/** Etiqueta de columna estilo Excel (0 → A, 26 → AA). */
export function letraColumna(idx: number): string {
  let s = ''
  let n = idx
  do {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return s
}

// ── Parseo numérico (números nativos + fallback texto colombiano) ─────────────

/**
 * Convierte una celda a número. Los precios reales vienen como número nativo;
 * el fallback maneja texto en formato colombiano (`1.234.567,89` = punto miles,
 * coma decimal). Devuelve null si no es un número interpretable.
 */
export function parseNumero(v: CeldaCruda | undefined): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null

  let t = s.replace(/[^0-9.,-]/g, '') // quita $, espacios, etc.
  if (!t || t === '-') return null

  const tienePunto = t.includes('.')
  const tieneComa = t.includes(',')

  if (tienePunto && tieneComa) {
    // Colombiano: punto miles, coma decimal.
    t = t.replace(/\./g, '').replace(',', '.')
  } else if (tieneComa) {
    // Solo coma → decimal.
    t = t.replace(',', '.')
  } else if (tienePunto) {
    // Solo puntos: si es patrón de miles (1.234.567) se eliminan; si no, es decimal.
    if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  }

  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

// ── Heurísticas de sugerencia ─────────────────────────────────────────────────

const KEYWORDS_HEADER = /c[oó]digo|c[oó]d\b|descrip|concepto|actividad|unidad|und\b|valor|precio|vr\.?|item|cantidad|medida/i

/** Sugiere el índice (0-based) de la fila de encabezado escaneando las primeras filas. */
export function detectarFilaEncabezado(hoja: HojaCruda): number {
  const limite = Math.min(hoja.filas.length, 15)
  let mejor = -1
  let mejorScore = 0
  for (let i = 0; i < limite; i++) {
    const fila = hoja.filas[i]
    const textos = fila.filter(c => typeof c === 'string' && c.trim())
    if (textos.length < 2) continue
    let score = textos.filter(c => KEYWORDS_HEADER.test(String(c))).length
    if (score === 0 && textos.length >= 3) score = 0.1
    if (score > mejorScore) { mejorScore = score; mejor = i }
  }
  return mejor >= 0 ? mejor : 0
}

/** Columna con más números positivos (candidata a precio). */
export function columnaConMasPrecios(hoja: HojaCruda, desde: number): number | null {
  let mejor: number | null = null
  let mejorCount = 0
  for (let c = 0; c < hoja.numColumnas; c++) {
    let count = 0
    for (let i = desde; i < hoja.filas.length; i++) {
      const n = parseNumero(hoja.filas[i][c])
      if (n !== null && n > 0) count++
    }
    if (count > mejorCount) { mejorCount = count; mejor = c }
  }
  return mejor
}

/** Columna de texto más poblada, excluyendo columnas ya asignadas. */
function columnaTextoMasPoblada(hoja: HojaCruda, desde: number, excluir: (number | null)[]): number | null {
  let mejor: number | null = null
  let mejorCount = 0
  for (let c = 0; c < hoja.numColumnas; c++) {
    if (excluir.includes(c)) continue
    let count = 0
    for (let i = desde; i < hoja.filas.length; i++) {
      const v = hoja.filas[i][c]
      if (typeof v === 'string' && v.trim()) count++
    }
    if (count > mejorCount) { mejorCount = count; mejor = c }
  }
  return mejor
}

/** Sugiere el mapeo de columnas a partir de los encabezados y el contenido. */
export function sugerirMapeoColumnas(hoja: HojaCruda, filaEncabezado: number): MapeoColumnas {
  const header = hoja.filas[filaEncabezado] ?? []
  const buscar = (re: RegExp): number | null => {
    for (let c = 0; c < header.length; c++) {
      const v = header[c]
      if (typeof v === 'string' && re.test(v)) return c
    }
    return null
  }

  const codigo = buscar(/c[oó]digo|c[oó]d\b|item|referencia|ref\b/i)
  const capitulo = buscar(/cap[ií]tulo|grupo|secci[oó]n/i)
  const unidad = buscar(/unidad|und\b|u\.?m|medida/i)
  let valor = buscar(/valor|precio|vr\.?|v\/u|unitario/i)
  let descripcion = buscar(/descrip|concepto|actividad|detalle/i)

  const desde = filaEncabezado + 1
  if (valor === null) valor = columnaConMasPrecios(hoja, desde)
  if (descripcion === null) {
    descripcion = columnaTextoMasPoblada(hoja, desde, [codigo, unidad, valor, capitulo])
  }

  return {
    codigo,
    descripcion: descripcion ?? 0,
    unidad,
    valor_unitario: valor ?? 0,
    capitulo,
  }
}

/** Sugiere cómo se obtiene el capítulo de la hoja. */
export function sugerirOrigenCapitulo(
  hoja: HojaCruda,
  columnas: MapeoColumnas,
  filaEncabezado: number,
): MapeoHoja['origen_capitulo'] {
  if (columnas.capitulo != null) return 'columna'
  // ¿Hay filas con descripción pero sin celda de precio? → títulos de capítulo.
  for (let i = filaEncabezado + 1; i < hoja.filas.length; i++) {
    const fila = hoja.filas[i]
    const desc = textoDe(fila[columnas.descripcion])
    const precioVacio = celdaVacia(fila[columnas.valor_unitario])
    if (desc && precioVacio) return 'filas_sin_precio'
  }
  return 'ninguno'
}

// ── Procesamiento de una hoja ─────────────────────────────────────────────────

/**
 * Recorre las filas de datos de una hoja según su mapeo y produce ítems válidos,
 * filas descartadas (con motivo) y capítulos detectados.
 *
 * Reglas:
 *  - Fila sin descripción y sin precio → se ignora.
 *  - Modo `filas_sin_precio`: fila con descripción y sin celda de precio → capítulo.
 *  - Fila con precio pero sin descripción → descarte `sin_descripcion`.
 *  - Fila con descripción y precio ≤ 0 o no numérico → descarte `precio_invalido`.
 *  - Resto → ítem válido (código opcional). El capítulo se arrastra.
 */
export function procesarHoja(hoja: HojaCruda, mapeo: MapeoHoja): ResultadoHoja {
  const items: ItemParseado[] = []
  const descartadas: FilaDescartada[] = []
  const capitulos: string[] = []
  const col = mapeo.columnas
  let capActual: string | undefined

  for (let i = mapeo.fila_encabezado + 1; i < hoja.filas.length; i++) {
    const fila = hoja.filas[i]
    const descripcion = textoDe(fila[col.descripcion])
    const valorCelda = fila[col.valor_unitario]
    const precioVacio = celdaVacia(valorCelda)
    const valor = parseNumero(valorCelda)

    // Capítulo por columna: arrastra el último valor no vacío.
    if (mapeo.origen_capitulo === 'columna' && col.capitulo != null) {
      const cc = textoDe(fila[col.capitulo])
      if (cc) capActual = cc
    }

    // Fila totalmente vacía → ignorar.
    if (!descripcion && precioVacio) continue

    // Título de capítulo (modo filas_sin_precio).
    if (mapeo.origen_capitulo === 'filas_sin_precio' && descripcion && precioVacio) {
      capActual = descripcion
      capitulos.push(descripcion)
      continue
    }

    if (!descripcion) {
      descartadas.push({ hoja: hoja.nombre, fila: i, motivo: 'sin_descripcion', contenido: resumenFila(fila) })
      continue
    }
    if (valor === null || valor <= 0) {
      descartadas.push({ hoja: hoja.nombre, fila: i, motivo: 'precio_invalido', contenido: resumenFila(fila) })
      continue
    }

    items.push({
      codigo: col.codigo != null ? textoDe(fila[col.codigo]) : '',
      descripcion,
      unidad: col.unidad != null ? textoDe(fila[col.unidad]) : '',
      valor_unitario: valor,
      categoria: mapeo.categoria,
      capitulo: capActual || undefined,
      orden: items.length,
    })
  }

  return { items, descartadas, capitulos }
}

// ── Consolidación de todas las hojas ──────────────────────────────────────────

export interface Consolidado {
  items: ItemParseado[]
  descartadas: FilaDescartada[]
  totalItems: number
  totalDescartadas: number
  descartadasPorMotivo: Record<MotivoDescarte, number>
  totalCapitulos: number
  categorias: string[]
  codigosDuplicados: string[]
}

export function consolidar(resultados: ResultadoHoja[]): Consolidado {
  const items: ItemParseado[] = []
  const descartadas: FilaDescartada[] = []
  let totalCapitulos = 0

  for (const r of resultados) {
    items.push(...r.items)
    descartadas.push(...r.descartadas)
    totalCapitulos += r.capitulos.length
  }
  // Orden global secuencial dentro de la LPU.
  items.forEach((it, i) => { it.orden = i })

  const descartadasPorMotivo: Record<MotivoDescarte, number> = { sin_descripcion: 0, precio_invalido: 0 }
  for (const d of descartadas) descartadasPorMotivo[d.motivo]++

  const conteoCodigo: Record<string, number> = {}
  for (const it of items) if (it.codigo) conteoCodigo[it.codigo] = (conteoCodigo[it.codigo] ?? 0) + 1

  return {
    items,
    descartadas,
    totalItems: items.length,
    totalDescartadas: descartadas.length,
    descartadasPorMotivo,
    totalCapitulos,
    categorias: [...new Set(items.map(i => i.categoria))],
    codigosDuplicados: Object.keys(conteoCodigo).filter(k => conteoCodigo[k] > 1),
  }
}
