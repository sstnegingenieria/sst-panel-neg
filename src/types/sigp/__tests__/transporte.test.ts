// Bloque C — transporte automático por zona (correctivos IHS).
// Los factores viven en el LPU (unidad %, valor unitario = factor); la única
// lógica nueva es: cantidad de la línea de transporte = Σ(demás)/100.
import { describe, it, expect } from 'vitest'
import {
  esTransporteZona, esItemTransporte, aplicarTransporte,
  sugerirTransporteZona, patchInstancia,
} from '../cotizacion'
import type { ItemCotizacion } from '../cotizacion'

const item = (over: Partial<ItemCotizacion>): ItemCotizacion => ({
  origen: 'lpu', codigo: 'X', descripcion: 'Ítem', unidad: 'un',
  valor_unitario: 0, cantidad: 1, valor_total: 0, ...over,
})

// Filas REALES del LPU vigente de IHS (verificadas en producción, 22-jul-2026)
const Z1 = { unidad: '%', descripcion: 'Zona 1: Bogota, Casanare, Cundinamarca, Meta, Santander' }
const Z2 = { unidad: '%', descripcion: 'Zona 2: Atlántico, Bolívar, Cesar,  Córdoba, Guajira, Magdalena, Sucre' }
const Z2SAI = { unidad: '%', descripcion: 'Zona 2: San Andres, Choco (verificar para algunos rurales que sea necesario)' }
const Z3 = { unidad: '%', descripcion: 'Zona 3: Antioquia, Huila, Cauca, Nariño, Quindío, Risaralda, Valle del Cauca' }
const ZONAS = [Z1, Z2, Z2SAI, Z3]

describe('esTransporteZona / esItemTransporte', () => {
  it('reconoce las filas reales del LPU IHS (unidad % + "Zona N…")', () => {
    for (const z of ZONAS) expect(esTransporteZona(z)).toBe(true)
  })
  it('NO confunde otros ítems (unidad normal, o % sin "Zona")', () => {
    expect(esTransporteZona({ unidad: 'un', descripcion: 'Zona 2: lo que sea' })).toBe(false)
    expect(esTransporteZona({ unidad: '%', descripcion: 'Reajuste porcentual' })).toBe(false)
  })
  it('el flag es_transporte manda aunque el patrón no aplique', () => {
    expect(esItemTransporte(item({ es_transporte: true, unidad: 'un', descripcion: 'x' }))).toBe(true)
  })
})

describe('aplicarTransporte — reproduce la COT-2026-013 real', () => {
  // Ítems reales: 170 ($126.120) + 140 ($259.633) + 27 ($236.304) + 28 ($2.183.058)
  // Σ demás = $2.805.115 → cantidad = 28.051,15 → total = 28.051,15 × 15,78 = $442.647
  const demas = [
    item({ codigo: '170', valor_total: 126_120 }),
    item({ codigo: '140', valor_total: 259_633 }),
    item({ codigo: '27', valor_total: 236_304 }),
    item({ codigo: '28', valor_total: 2_183_058 }),
  ]
  const transporte = item({
    codigo: '52', unidad: '%', descripcion: Z2.descripcion,
    valor_unitario: 15.78, cantidad: 0, valor_total: 0, es_transporte: true,
  })

  it('cantidad = Σ demás / 100 (2 decimales) y total = cantidad × factor', () => {
    const out = aplicarTransporte([...demas, transporte])
    const t = out[4]
    expect(t.cantidad).toBe(28_051.15)
    expect(t.valor_total).toBe(442_647)   // redondeo a peso, igual que el resto
  })

  it('exclusión circular: el transporte con valores viejos NO se suma a sí mismo', () => {
    const viejo = { ...transporte, cantidad: 999_999, valor_total: 999_999_999 }
    const out = aplicarTransporte([...demas, viejo])
    expect(out[4].cantidad).toBe(28_051.15)
    expect(out[4].valor_total).toBe(442_647)
  })

  it('recalcula al quitar una actividad', () => {
    const out = aplicarTransporte([demas[0], demas[1], transporte])
    expect(out[2].cantidad).toBe((126_120 + 259_633) / 100)   // 3.857,53
  })

  it('idempotente y estable: sin cambios devuelve el MISMO array (apto para useEffect)', () => {
    const una = aplicarTransporte([...demas, transporte])
    expect(aplicarTransporte(una)).toBe(una)
  })

  it('sin línea de transporte es la identidad (no aplica fuera de correctivos IHS)', () => {
    expect(aplicarTransporte(demas)).toBe(demas)
  })

  it('redondeo de la cantidad a 2 decimales', () => {
    const out = aplicarTransporte([item({ valor_total: 1_000.555 }), { ...transporte }])
    expect(out[1].cantidad).toBe(10.01)
  })
})

describe('patchInstancia — la cantidad del transporte no se edita a mano', () => {
  it('ignora patches de cantidad sobre la línea de transporte', () => {
    const t = item({ es_transporte: true, unidad: '%', descripcion: Z2.descripcion, cantidad: 28_051.15 })
    expect(patchInstancia(t, { cantidad: 5 }).cantidad).toBe(28_051.15)
  })
  it('los demás ítems siguen editando cantidad normalmente', () => {
    expect(patchInstancia(item({}), { cantidad: 5 }).cantidad).toBe(5)
  })
})

describe('sugerirTransporteZona — departamentos leídos del propio LPU', () => {
  it('sugiere por departamento del sitio (con tildes y mayúsculas)', () => {
    expect(sugerirTransporteZona('Estación La Ceja, Antioquia', ZONAS)).toBe(3)
    expect(sugerirTransporteZona('bogotá d.c.', ZONAS)).toBe(0)
    expect(sugerirTransporteZona('Sitio rural en San Andrés', ZONAS)).toBe(2)
  })
  it('palabra completa: "estructura metálica" NO dispara "Meta"', () => {
    expect(sugerirTransporteZona('estructura metálica en sitio', ZONAS)).toBe(-1)
  })
  it('sin sitio o sin coincidencia → -1', () => {
    expect(sugerirTransporteZona('', ZONAS)).toBe(-1)
    expect(sugerirTransporteZona('Amazonas', ZONAS)).toBe(-1)
  })
})
