import { describe, it, expect } from 'vitest'
import type { HojaCruda, CeldaCruda } from '../lpuExcel'
import type { MapeoHoja } from '../../../types/sigp/importacion'
import {
  parseNumero,
  letraColumna,
  detectarFilaEncabezado,
  esEncabezadoUnidad,
  sugerirMapeoColumnas,
  sugerirOrigenCapitulo,
  procesarHoja,
  consolidar,
  type ItemParseado,
  type ResultadoHoja,
} from '../lpuMapeo'

function hoja(nombre: string, filas: CeldaCruda[][]): HojaCruda {
  const numColumnas = filas.reduce((m, f) => Math.max(m, f.length), 0)
  return { nombre, filas, numColumnas }
}

describe('parseNumero', () => {
  it('acepta números nativos', () => {
    expect(parseNumero(3500)).toBe(3500)
    expect(parseNumero(0)).toBe(0)
  })
  it('interpreta formato colombiano (punto miles, coma decimal)', () => {
    expect(parseNumero('1.234.567,89')).toBeCloseTo(1234567.89)
    expect(parseNumero('$ 18.900')).toBe(18900)
    expect(parseNumero('3.500')).toBe(3500)
    expect(parseNumero('12,5')).toBeCloseTo(12.5)
  })
  it('devuelve null para texto no numérico', () => {
    expect(parseNumero('N/A')).toBeNull()
    expect(parseNumero('')).toBeNull()
    expect(parseNumero(null)).toBeNull()
  })
})

describe('letraColumna', () => {
  it('mapea índices a letras estilo Excel', () => {
    expect(letraColumna(0)).toBe('A')
    expect(letraColumna(3)).toBe('D')
    expect(letraColumna(26)).toBe('AA')
  })
})

describe('detectarFilaEncabezado', () => {
  it('encuentra la fila con palabras clave de encabezado', () => {
    const h = hoja('LPU', [
      ['Lista de precios', null, null],
      ['Cliente XYZ', null, null],
      ['Código', 'Descripción', 'Valor'],
      ['A-1', 'Item', 1000],
    ])
    expect(detectarFilaEncabezado(h)).toBe(2)
  })
})

describe('esEncabezadoUnidad', () => {
  it('acepta las formas cortas por match exacto anclado (normalizando caso, puntos y espacios)', () => {
    expect(esEncabezadoUnidad('UN')).toBe(true)     // el caso real de la hoja "4. OBRAS CIVILES"
    expect(esEncabezadoUnidad('UND')).toBe(true)
    expect(esEncabezadoUnidad('UM')).toBe(true)
    expect(esEncabezadoUnidad('U.M.')).toBe(true)
    expect(esEncabezadoUnidad('un')).toBe(true)
    expect(esEncabezadoUnidad(' UN ')).toBe(true)
    expect(esEncabezadoUnidad('U M')).toBe(true)
  })

  it('acepta las formas largas por regex (incluye plantillas en inglés — H-009)', () => {
    expect(esEncabezadoUnidad('UNIDAD')).toBe(true)
    expect(esEncabezadoUnidad('Unidad de medida')).toBe(true)
    expect(esEncabezadoUnidad('UNIT OF MEASUREMENT')).toBe(true)
  })

  it('rechaza los falsos positivos clásicos', () => {
    expect(esEncabezadoUnidad('VALOR UNITARIO')).toBe(false) // el crítico
    expect(esEncabezadoUnidad('UNITARIO')).toBe(false)
    expect(esEncabezadoUnidad('UNIT PRICE')).toBe(false)
    expect(esEncabezadoUnidad('CANT')).toBe(false)
    expect(esEncabezadoUnidad('CANTIDAD')).toBe(false)
    expect(esEncabezadoUnidad('COMUN')).toBe(false)
    expect(esEncabezadoUnidad('')).toBe(false)
  })
})

describe('sugerirMapeoColumnas', () => {
  it('mapea por nombre de encabezado', () => {
    const h = hoja('LPU', [
      ['Código', 'Descripción', 'Unidad', 'Valor unitario'],
      ['A-1', 'Cable', 'm', 3500],
    ])
    const m = sugerirMapeoColumnas(h, 0)
    expect(m).toMatchObject({ codigo: 0, descripcion: 1, unidad: 2, valor_unitario: 3 })
  })

  it('reconoce encabezados en inglés (plantilla real IHS) sin confundir unidad con precio', () => {
    // Fila de encabezados real de LPU_NEG_IHS_2026.xlsx (hojas OBRA CIVIL/ELECTRICA/ESTRUCTURAS).
    const h = hoja('OBRA CIVIL', [
      ['', 'ITEM', 'DESCRIPTION OF THE WORK, GOOD OR SERVICE', 'QUANTITY', 'UNIT OF MEASUREMENT', 'PRECIOS FIJOS 2026'],
      ['', '52', 'Acometida 3 x 2 + 1 x 4', 1, 'ml', 125000],
    ])
    const m = sugerirMapeoColumnas(h, 0)
    expect(m.codigo).toBe(1)          // ITEM
    expect(m.descripcion).toBe(2)     // DESCRIPTION…
    expect(m.unidad).toBe(4)          // UNIT OF MEASUREMENT (bug real: antes quedaba null)
    expect(m.valor_unitario).toBe(5)  // PRECIOS FIJOS 2026
  })

  it('mapea el encabezado real de la hoja "4. OBRAS CIVILES" de la Matriz ATC (bug de los 153 ítems sin unidad)', () => {
    // Fila 14 real: la unidad se titula "UN" a secas — el regex viejo no la veía
    // y 153 ítems entraron a producción con unidad vacía.
    const h = hoja('4. OBRAS CIVILES', [
      ['', 'ITEM', 'ACTIVIDAD', 'UN', 'VALOR UNITARIO'],
      ['', '4.1.1', 'Limpieza de terreno - Poda - Descapote', 'm2', 4587],
    ])
    const m = sugerirMapeoColumnas(h, 0)
    expect(m.codigo).toBe(1)          // ITEM
    expect(m.descripcion).toBe(2)     // ACTIVIDAD
    expect(m.unidad).toBe(3)          // UN (antes: null)
    expect(m.valor_unitario).toBe(4)  // VALOR UNITARIO (no confundido con unidad)
  })

  it('no captura "UNIT PRICE" como unidad', () => {
    const h = hoja('LPU', [
      ['ITEM', 'DESCRIPTION', 'UNIT PRICE'],
      ['A-1', 'Cable', 3500],
    ])
    const m = sugerirMapeoColumnas(h, 0)
    expect(m.unidad).toBeNull()
    expect(m.valor_unitario).toBe(2)  // cae por contenido a la columna de precios
  })

  it('cae al contenido cuando no hay encabezados reconocibles', () => {
    const h = hoja('LPU', [
      ['x', 'y', 'z'],
      ['A-1', 'Cable calibre 12', 3500],
      ['A-2', 'Breaker', 18900],
    ])
    const m = sugerirMapeoColumnas(h, 0)
    // La columna con más números positivos es la 2 (precios).
    expect(m.valor_unitario).toBe(2)
    // La descripción cae a una columna de texto poblada distinta del precio.
    expect(m.descripcion).not.toBe(2)
  })
})

const mapeoBase = (parcial: Partial<MapeoHoja>): MapeoHoja => ({
  nombre_hoja: 'Precios',
  es_lpu: true,
  fila_encabezado: 0,
  categoria: 'Precios',
  columnas: { codigo: 0, descripcion: 1, unidad: 2, valor_unitario: 3, capitulo: null },
  origen_capitulo: 'ninguno',
  ...parcial,
})

describe('procesarHoja', () => {
  it('extrae ítems válidos y arrastra capítulos (filas_sin_precio)', () => {
    const h = hoja('Precios', [
      ['Código', 'Descripción', 'Unidad', 'Valor'],
      [null, 'CAPÍTULO 1 - REDES', null, null], // título de capítulo
      ['A-1', 'Cable 12', 'm', 3500],
      ['A-2', 'Breaker 20A', 'und', 18900],
      [null, 'CAPÍTULO 2 - OBRA', null, null],
      ['B-1', 'Excavación', 'm3', 42000],
    ])
    const r = procesarHoja(h, mapeoBase({ origen_capitulo: 'filas_sin_precio' }))
    expect(r.items).toHaveLength(3)
    expect(r.capitulos).toEqual(['CAPÍTULO 1 - REDES', 'CAPÍTULO 2 - OBRA'])
    expect(r.items[0]).toMatchObject({ codigo: 'A-1', capitulo: 'CAPÍTULO 1 - REDES', valor_unitario: 3500 })
    expect(r.items[2]).toMatchObject({ codigo: 'B-1', capitulo: 'CAPÍTULO 2 - OBRA' })
  })

  it('descarta precio ≤ 0 con motivo precio_invalido y visible', () => {
    const h = hoja('Precios', [
      ['Código', 'Descripción', 'Unidad', 'Valor'],
      ['A-1', 'Item válido', 'm', 3500],
      ['A-2', 'Item sin precio', 'm', 0],
      ['A-3', 'Item negativo', 'm', -100],
    ])
    const r = procesarHoja(h, mapeoBase({}))
    expect(r.items).toHaveLength(1)
    expect(r.descartadas).toHaveLength(2)
    expect(r.descartadas.every(d => d.motivo === 'precio_invalido')).toBe(true)
    expect(r.descartadas[0].contenido).toContain('Item sin precio')
  })

  it('descarta filas con precio pero sin descripción', () => {
    const h = hoja('Precios', [
      ['Código', 'Descripción', 'Unidad', 'Valor'],
      ['A-1', '', 'm', 3500],
    ])
    const r = procesarHoja(h, mapeoBase({}))
    expect(r.items).toHaveLength(0)
    expect(r.descartadas[0].motivo).toBe('sin_descripcion')
  })

  it('código es opcional', () => {
    const h = hoja('Precios', [
      ['Descripción', 'Valor'],
      ['Servicio sin código', 5000],
    ])
    const r = procesarHoja(h, mapeoBase({
      columnas: { codigo: null, descripcion: 0, unidad: null, valor_unitario: 1, capitulo: null },
    }))
    expect(r.items).toHaveLength(1)
    expect(r.items[0]).toMatchObject({ codigo: '', descripcion: 'Servicio sin código', valor_unitario: 5000 })
  })
})

describe('sugerirOrigenCapitulo', () => {
  it('detecta filas_sin_precio', () => {
    const h = hoja('Precios', [
      ['Código', 'Descripción', 'Valor'],
      [null, 'CAPÍTULO', null],
      ['A-1', 'Item', 100],
    ])
    expect(sugerirOrigenCapitulo(h, { codigo: 0, descripcion: 1, unidad: null, valor_unitario: 2, capitulo: null }, 0))
      .toBe('filas_sin_precio')
  })
})

describe('consolidar', () => {
  it('suma totales, reasigna orden global y detecta códigos duplicados', () => {
    const h1 = hoja('H1', [
      ['Código', 'Descripción', 'Unidad', 'Valor'],
      ['A-1', 'Item 1', 'm', 100],
      ['A-2', 'Item 2', 'm', 200],
    ])
    const h2 = hoja('H2', [
      ['Código', 'Descripción', 'Unidad', 'Valor'],
      ['A-1', 'Duplicado', 'm', 300], // código repetido
      ['B-1', 'Item 3', 'm', 0],      // descartado
    ])
    const r1 = procesarHoja(h1, mapeoBase({ nombre_hoja: 'H1', categoria: 'H1' }))
    const r2 = procesarHoja(h2, mapeoBase({ nombre_hoja: 'H2', categoria: 'H2' }))
    const c = consolidar([r1, r2])

    expect(c.totalItems).toBe(3)
    expect(c.totalDescartadas).toBe(1)
    expect(c.descartadasPorMotivo.precio_invalido).toBe(1)
    expect(c.categorias).toEqual(['H1', 'H2'])
    expect(c.codigosDuplicados).toEqual(['A-1'])
    expect(c.items.map(i => i.orden)).toEqual([0, 1, 2])
  })
})

// ── Guardia post-import (27-jul): unidades vacías y duplicados exigen "forzar" ──

const item = (parcial: Partial<ItemParseado>): ItemParseado => ({
  codigo: 'X-1', descripcion: 'Ítem', unidad: 'm', valor_unitario: 100,
  categoria: 'HOJA', orden: 0, ...parcial,
})
const resultado = (items: ItemParseado[]): ResultadoHoja =>
  ({ items, descartadas: [], capitulos: [] })

describe('consolidar — guardia de unidades vacías', () => {
  it('cuenta las unidades vacías, arma ejemplos y exige confirmación', () => {
    const c = consolidar([resultado([
      item({ codigo: '4.1.1', descripcion: 'Limpieza de terreno', unidad: '', categoria: '4. OBRAS CIVILES' }),
      item({ codigo: '', descripcion: 'Descripción larguísima que definitivamente supera los cincuenta caracteres del truncado', unidad: '  ', categoria: '9. AIU' }),
      item({ codigo: 'OK-1', unidad: 'm2' }),
    ])])
    expect(c.itemsSinUnidad).toBe(2) // la unidad "  " (solo espacios) también cuenta
    expect(c.ejemplosSinUnidad).toEqual([
      '4.1.1 — Limpieza de terreno [4. OBRAS CIVILES]',
      '(sin código) — Descripción larguísima que definitivamente supera [9. AIU]',
    ])
    expect(c.requiereConfirmacion).toBe(true)
  })

  it('capa los ejemplos a 6 aunque haya más sin unidad', () => {
    const muchos = Array.from({ length: 10 }, (_, i) =>
      item({ codigo: `S-${i}`, unidad: '' }))
    const c = consolidar([resultado(muchos)])
    expect(c.itemsSinUnidad).toBe(10)
    expect(c.ejemplosSinUnidad).toHaveLength(6)
  })

  it('solo duplicados (unidades OK) también exige confirmación', () => {
    const c = consolidar([resultado([
      item({ codigo: 'A-1' }),
      item({ codigo: 'A-1', descripcion: 'Repetido' }),
    ])])
    expect(c.itemsSinUnidad).toBe(0)
    expect(c.codigosDuplicados).toEqual(['A-1'])
    expect(c.requiereConfirmacion).toBe(true)
  })

  it('caso limpio: sin unidades vacías ni duplicados → no exige confirmación', () => {
    const c = consolidar([resultado([
      item({ codigo: 'A-1' }),
      item({ codigo: 'A-2', unidad: 'und' }),
    ])])
    expect(c.itemsSinUnidad).toBe(0)
    expect(c.ejemplosSinUnidad).toEqual([])
    expect(c.requiereConfirmacion).toBe(false)
  })
})
