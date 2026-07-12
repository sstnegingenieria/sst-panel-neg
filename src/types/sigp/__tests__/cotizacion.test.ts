import { describe, it, expect } from 'vitest'
import {
  calcularTotales, valorTotalItem, TRANSICIONES, puedeNuevaVersion,
  precioDesdeCosto, margenDesdePrecio, costoDirectoAPU, asignarCodigosINP, colorSeguimiento,
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

describe('precioDesdeCosto', () => {
  it('factor 0,9 del Excel = margen 10: costo 90.000 → precio 100.000', () => {
    expect(precioDesdeCosto(90_000, 10)).toBeCloseTo(100_000)
  })
  it('margen 0 → precio = costo', () => {
    expect(precioDesdeCosto(45_000, 0)).toBe(45_000)
  })
  it('rechaza margen fuera de [0, 100) y costo negativo', () => {
    expect(precioDesdeCosto(1000, 100)).toBeNull()   // división por cero
    expect(precioDesdeCosto(1000, 120)).toBeNull()   // precio negativo
    expect(precioDesdeCosto(1000, -5)).toBeNull()
    expect(precioDesdeCosto(-1, 10)).toBeNull()
    expect(precioDesdeCosto(NaN, 10)).toBeNull()
  })
})

describe('margenDesdePrecio', () => {
  it('inversa de precioDesdeCosto', () => {
    expect(margenDesdePrecio(90_000, 100_000)).toBeCloseTo(10)
  })
  it('negativo cuando se vende a pérdida (la UI alerta)', () => {
    expect(margenDesdePrecio(120_000, 100_000)).toBeCloseTo(-20)
  })
  it('null con precio <= 0', () => {
    expect(margenDesdePrecio(1000, 0)).toBeNull()
    expect(margenDesdePrecio(1000, -5)).toBeNull()
  })
})

describe('costoDirectoAPU', () => {
  const insumo = (subtotal: number) => ({ descripcion: 'x', unidad: 'und', rendimiento: 0.0909, costo_unitario: 1, subtotal })

  it('suma los subtotales de las 5 secciones canónicas (con secciones vacías)', () => {
    expect(costoDirectoAPU({
      mano_obra: [insumo(1000)],
      materiales: [insumo(1500.5), insumo(200)],
      equipo: [insumo(300)],
      transporte: [],
      herramienta_menor: [insumo(50)],
    })).toBeCloseTo(3050.5)
  })

  it('subtotal por rendimiento: rendimiento × costo_unitario con decimales finos', () => {
    // 0.0909 jornal × $ 185.000 = $ 16.816,5 (precisión completa, sin redondear)
    expect(0.0909 * 185_000).toBeCloseTo(16_816.5)
    expect(costoDirectoAPU({
      mano_obra: [{ descripcion: 'Cuadrilla', unidad: 'jornal', rendimiento: 0.0909, costo_unitario: 185_000, subtotal: 0.0909 * 185_000 }],
      materiales: [], equipo: [], transporte: [], herramienta_menor: [],
    })).toBeCloseTo(16_816.5)
  })
})

describe('asignarCodigosINP', () => {
  const it_ = (origen: ItemCotizacion['origen'], codigo: string): ItemCotizacion => ({
    origen, codigo, descripcion: 'x', unidad: 'und', valor_unitario: 0, cantidad: 1, valor_total: 0,
  })

  it('numera manual/apu sin código o INP-* en orden; respeta LPU, CAT y códigos tecleados', () => {
    const res = asignarCodigosINP([
      it_('lpu', 'RED-001'),        // LPU: intacto
      it_('manual', ''),            // → INP-001
      it_('apu', 'INP-007'),        // renumera → INP-002
      it_('manual', 'CAT-0004'),    // incorporado al catálogo: intacto
      it_('manual', 'MI-COD'),      // tecleado por el usuario: intacto
      it_('apu', ''),               // → INP-003
    ])
    expect(res.map(r => r.codigo)).toEqual(['RED-001', 'INP-001', 'INP-002', 'CAT-0004', 'MI-COD', 'INP-003'])
  })

  it('no muta el array original', () => {
    const orig = [it_('manual', '')]
    asignarCodigosINP(orig)
    expect(orig[0].codigo).toBe('')
  })
})

describe('colorSeguimiento', () => {
  it('escala verde <7 · ámbar 7–14 · naranja 15–29 · rojo >=30', () => {
    expect(colorSeguimiento(0)).toContain('emerald')
    expect(colorSeguimiento(6)).toContain('emerald')
    expect(colorSeguimiento(7)).toContain('amber')
    expect(colorSeguimiento(14)).toContain('amber')
    expect(colorSeguimiento(15)).toContain('orange')
    expect(colorSeguimiento(29)).toContain('orange')
    expect(colorSeguimiento(30)).toContain('red')
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
