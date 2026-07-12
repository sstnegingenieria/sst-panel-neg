import { describe, it, expect } from 'vitest'
import { etiquetaVersion, fmtNum, fmtMoney } from '../formato'
import { patchInstancia } from '../../../types/sigp/cotizacion'
import type { ItemCotizacion } from '../../../types/sigp/cotizacion'

describe('etiquetaVersion (F1.5 punto 3 — solo presentación)', () => {
  it('v1 (primera emisión) es invisible; v2+ visible', () => {
    expect(etiquetaVersion(1)).toBe('')
    expect(etiquetaVersion(0)).toBe('')
    expect(etiquetaVersion(2)).toBe('v2')
    expect(etiquetaVersion(3)).toBe('v3')
    expect(etiquetaVersion(12)).toBe('v12')
  })
})

describe('fmtNum / fmtMoney (F1.5 punto 4 — es-CO, máx. 2 decimales)', () => {
  it('recorta a 2 decimales con coma decimal', () => {
    expect(fmtNum(20.2345)).toBe('20,23')
    expect(fmtNum(0.0909)).toBe('0,09')
    expect(fmtNum(16_031.954)).toBe('16.031,95')
  })
  it('enteros sin decimales, miles con punto', () => {
    expect(fmtNum(45_000)).toBe('45.000')
    expect(fmtNum(6)).toBe('6')
    expect(fmtNum(1_074_241)).toBe('1.074.241')
  })
  it('maxDec configurable y valores no finitos → 0', () => {
    expect(fmtNum(20.2345, 1)).toBe('20,2')
    expect(fmtNum(NaN)).toBe('0')
  })
  it('fmtMoney', () => {
    expect(fmtMoney(16_031.954)).toBe('$ 16.031,95')
    expect(fmtMoney(45_000)).toBe('$ 45.000')
    expect(fmtMoney(0)).toBe('$ 0')
  })
})

describe('precisión interna intacta (punto 4 — el formato es solo de render)', () => {
  it('un valor editable con más de 2 decimales NO se trunca en el estado', () => {
    const it_: ItemCotizacion = {
      origen: 'manual', codigo: '', descripcion: 'x', unidad: 'und',
      valor_unitario: 16_031.954, cantidad: 20.2345, valor_total: 0,
    }
    // editar OTRO campo no pisa la precisión de los existentes
    const r = patchInstancia(it_, { descripcion: 'y' })
    expect(r.valor_unitario).toBe(16_031.954)
    expect(r.cantidad).toBe(20.2345)
    // el display se recorta, el dato no
    expect(fmtMoney(r.valor_unitario)).toBe('$ 16.031,95')
    expect(r.valor_unitario).not.toBe(16_031.95)
  })
})
