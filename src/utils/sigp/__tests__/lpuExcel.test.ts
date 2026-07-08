import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { leerLibro, pareceListaDePrecios, type HojaCruda } from '../lpuExcel'

/** Construye un File .xlsx en memoria a partir de hojas {nombre: filas[][]}. */
function fileDesde(hojas: Record<string, unknown[][]>): File {
  const wb = XLSX.utils.book_new()
  for (const [nombre, filas] of Object.entries(hojas)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), nombre)
  }
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new File([buf], 'lpu.xlsx')
}

function hoja(nombre: string, filas: HojaCruda['filas']): HojaCruda {
  const numColumnas = filas.reduce((m, f) => Math.max(m, f.length), 0)
  return { nombre, filas, numColumnas }
}

describe('leerLibro', () => {
  it('lee cada hoja como matriz de filas conservando números nativos', async () => {
    const file = fileDesde({
      Precios: [
        ['Código', 'Descripción', 'Unidad', 'Valor'],
        ['A-1', 'Cable calibre 12', 'm', 3500],
        ['A-2', 'Breaker 20A', 'und', 18900],
      ],
    })
    const libro = await leerLibro(file)
    expect(libro).toHaveLength(1)
    expect(libro[0].nombre).toBe('Precios')
    expect(libro[0].filas[0]).toEqual(['Código', 'Descripción', 'Unidad', 'Valor'])
    // El valor debe seguir siendo número, no texto.
    expect(libro[0].filas[1][3]).toBe(3500)
    expect(typeof libro[0].filas[2][3]).toBe('number')
  })

  it('preserva múltiples hojas', async () => {
    const libro = await leerLibro(fileDesde({ Uno: [['x']], Dos: [['y']] }))
    expect(libro.map(h => h.nombre)).toEqual(['Uno', 'Dos'])
  })
})

describe('pareceListaDePrecios', () => {
  it('marca una hoja con una columna de precios positivos', () => {
    const h = hoja('LPU', [
      ['Código', 'Descripción', 'Valor'],
      ['A-1', 'Item 1', 1000],
      ['A-2', 'Item 2', 2000],
      ['A-3', 'Item 3', 3000],
    ])
    expect(pareceListaDePrecios(h)).toBe(true)
  })

  it('descarta hojas auxiliares por nombre aunque tengan números', () => {
    const h = hoja('Portada', [
      ['Total', 100], ['Sub', 200], ['Otro', 300], ['Mas', 400],
    ])
    expect(pareceListaDePrecios(h)).toBe(false)
  })

  it('descarta hojas sin columna numérica clara', () => {
    const h = hoja('Notas', [
      ['Observación'],
      ['Texto libre uno'],
      ['Texto libre dos'],
      ['Texto libre tres'],
    ])
    expect(pareceListaDePrecios(h)).toBe(false)
  })

  it('no marca hojas demasiado cortas', () => {
    expect(pareceListaDePrecios(hoja('LPU', [['Valor'], [1000]]))).toBe(false)
  })
})
