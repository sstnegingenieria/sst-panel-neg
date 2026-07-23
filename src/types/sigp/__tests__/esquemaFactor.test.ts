// Esquema Matriz → NEG (23-jul, caso INGEMEC) — el LPU trae los precios de
// la MATRIZ (ATC→INGEMEC); NEG cobra un factor (72% normal · 15% cuando el
// cliente suministra material). Contrato: valor_matriz CONGELADO, factor
// elegible por ítem, valor_unitario (operativo) SIEMPRE derivado — así
// totales, snapshot y liquidación heredan el valor NEG sin tocarse.
import { describe, it, expect } from 'vitest'
import { valorNegDe, patchInstancia, calcularTotales } from '../cotizacion'
import type { ItemCotizacion } from '../cotizacion'

const itemFactor = (matriz: number, factor: number): ItemCotizacion => ({
  origen: 'lpu', codigo: 'ING-001', descripcion: 'Mantenimiento correctivo', unidad: 'un',
  valor_matriz: matriz, factor,
  factor_etiqueta: factor === 0.72 ? '72% · NEG suministra material' : '15% · INGEMEC suministra material',
  valor_unitario: valorNegDe(matriz, factor), cantidad: 2,
  valor_total: valorNegDe(matriz, factor) * 2,
  lpu_id: 'lpu1', lpu_item_id: 'li1', instancia_id: 'a',
})

describe('valorNegDe — derivación Matriz × factor', () => {
  it('redondea a peso', () => {
    expect(valorNegDe(1_000_000, 0.72)).toBe(720_000)
    expect(valorNegDe(1_000_000, 0.15)).toBe(150_000)
    expect(valorNegDe(333_333, 0.72)).toBe(240_000)  // 239999.76 → redondeo
  })
})

describe('patchInstancia — el factor es lo ÚNICO editable del precio', () => {
  it('cambiar el factor re-deriva valor_unitario y valor_total', () => {
    const it72 = itemFactor(1_000_000, 0.72)
    const it15 = patchInstancia(it72, { factor: 0.15, factor_etiqueta: '15% · INGEMEC suministra material' })
    expect(it15.valor_unitario).toBe(150_000)
    expect(it15.valor_total).toBe(300_000)          // cantidad 2 intacta
    expect(it15.valor_matriz).toBe(1_000_000)       // Matriz congelada
    expect(it15.factor_etiqueta).toContain('15%')
  })

  it('valor_matriz es INTOCABLE — ni por patch directo', () => {
    const it = itemFactor(1_000_000, 0.72)
    const hackeado = patchInstancia(it, { valor_matriz: 1 } as Partial<ItemCotizacion>)
    expect(hackeado.valor_matriz).toBe(1_000_000)
    expect(hackeado.valor_unitario).toBe(720_000)
  })

  it('valor_unitario directo NO muta el precio (ítem LPU bloqueado): se re-deriva de la Matriz', () => {
    const it = itemFactor(1_000_000, 0.72)
    const intento = patchInstancia(it, { valor_unitario: 999 })
    expect(intento.valor_unitario).toBe(720_000)
  })

  it('la cantidad sigue editable y el total usa el valor NEG', () => {
    const it = patchInstancia(itemFactor(1_000_000, 0.72), { cantidad: 5 })
    expect(it.valor_total).toBe(3_600_000)
  })

  it('retrocompat: ítems sin valor_matriz no cambian en nada', () => {
    const manual: ItemCotizacion = {
      origen: 'manual', codigo: '', descripcion: 'x', unidad: 'un',
      valor_unitario: 100, cantidad: 1, valor_total: 100, instancia_id: 'b',
    }
    const r = patchInstancia(manual, { valor_unitario: 250 })
    expect(r.valor_unitario).toBe(250)
    expect(r.valor_matriz).toBeUndefined()
    expect(r.factor).toBeUndefined()
  })
})

describe('el valor OPERATIVO aguas abajo es el NEG', () => {
  it('calcularTotales suma con valor_neg, no con la Matriz', () => {
    const items = [itemFactor(1_000_000, 0.72), itemFactor(500_000, 0.15)]
    // 720.000×2 + 75.000×2 = 1.590.000 (la Matriz full sería 3.000.000)
    const t = calcularTotales(items, 'iva_pleno', undefined, 19)
    expect(t.costos_directos).toBe(1_590_000)
  })
})
