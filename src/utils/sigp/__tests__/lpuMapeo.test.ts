import { describe, it, expect } from 'vitest'
import type { HojaCruda, CeldaCruda } from '../lpuExcel'
import type { MapeoHoja } from '../../../types/sigp/importacion'
import {
  parseNumero,
  letraColumna,
  detectarFilaEncabezado,
  sugerirMapeoColumnas,
  sugerirOrigenCapitulo,
  procesarHoja,
  consolidar,
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

describe('sugerirMapeoColumnas', () => {
  it('mapea por nombre de encabezado', () => {
    const h = hoja('LPU', [
      ['Código', 'Descripción', 'Unidad', 'Valor unitario'],
      ['A-1', 'Cable', 'm', 3500],
    ])
    const m = sugerirMapeoColumnas(h, 0)
    expect(m).toMatchObject({ codigo: 0, descripcion: 1, unidad: 2, valor_unitario: 3 })
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
