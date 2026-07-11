import { describe, it, expect } from 'vitest'
import {
  calcularTotales, valorTotalItem, TRANSICIONES, puedeNuevaVersion,
} from '../cotizacion'
import type { ItemCotizacion } from '../cotizacion'

const item = (valor_total: number): ItemCotizacion => ({
  origen: 'manual', codigo: '', descripcion: 'x', unidad: 'und',
  valor_unitario: 0, cantidad: 0, valor_total,
})

describe('valorTotalItem', () => {
  it('redondea valor_unitario * cantidad a peso', () => {
    expect(valorTotalItem(1333, 3)).toBe(3999)
    expect(valorTotalItem(1333.33, 3)).toBe(4000)   // 3999.99 → 4000
    expect(valorTotalItem(100.4, 1)).toBe(100)      // 100.4 → 100
  })
})

describe('calcularTotales — iva_pleno', () => {
  it('IVA sobre el subtotal, redondeado', () => {
    const t = calcularTotales([item(3999)], 'iva_pleno', undefined, 19)
    expect(t.costos_directos).toBe(3999)
    expect(t.base_iva).toBe(3999)
    expect(t.iva).toBe(760)          // round(3999 * 0.19 = 759.81)
    expect(t.total).toBe(4759)
  })
})

describe('calcularTotales — aiu', () => {
  it('A/I/U sobre CD e IVA SOLO sobre la Utilidad, cada componente redondeado', () => {
    const t = calcularTotales([item(1_000_000)], 'aiu', { admin: 10, imprevistos: 6, utilidad: 8 }, 19)
    expect(t.costos_directos).toBe(1_000_000)
    expect(t.admin).toBe(100_000)
    expect(t.imprevistos).toBe(60_000)
    expect(t.utilidad).toBe(80_000)
    expect(t.base_iva).toBe(80_000)  // IVA solo sobre U
    expect(t.iva).toBe(15_200)       // round(80000 * 0.19)
    expect(t.total).toBe(1_255_200)
  })

  it('redondea cada componente al final (CD con decimales)', () => {
    const t = calcularTotales([item(1_234_567)], 'aiu', { admin: 10, imprevistos: 6, utilidad: 8 }, 19)
    expect(t.costos_directos).toBe(1_234_567)
    expect(t.admin).toBe(123_457)        // round(123456.7)
    expect(t.imprevistos).toBe(74_074)   // round(74074.02)
    expect(t.utilidad).toBe(98_765)      // round(98765.36)
    expect(t.iva).toBe(18_765)           // round(98765 * 0.19 = 18765.35)
    expect(t.total).toBe(1_234_567 + 123_457 + 74_074 + 98_765 + 18_765)
  })

  it('suma los valor_total de varios ítems como CD', () => {
    const t = calcularTotales([item(1000), item(2500), item(500)], 'iva_pleno', undefined, 19)
    expect(t.costos_directos).toBe(4000)
  })
})

describe('reglas de estado', () => {
  it('TRANSICIONES: borrador→enviada, enviada→aprobada|rechazada, terminales', () => {
    expect(TRANSICIONES.borrador).toEqual(['enviada'])
    expect(TRANSICIONES.enviada).toEqual(['aprobada', 'rechazada'])
    expect(TRANSICIONES.aprobada).toEqual([])
    expect(TRANSICIONES.rechazada).toEqual([])
  })

  it('puedeNuevaVersion: enviada/rechazada/vencida sí; borrador/aprobada no', () => {
    expect(puedeNuevaVersion('enviada')).toBe(true)
    expect(puedeNuevaVersion('rechazada')).toBe(true)
    expect(puedeNuevaVersion('vencida')).toBe(true)
    expect(puedeNuevaVersion('borrador')).toBe(false)
    expect(puedeNuevaVersion('aprobada')).toBe(false)
  })
})
