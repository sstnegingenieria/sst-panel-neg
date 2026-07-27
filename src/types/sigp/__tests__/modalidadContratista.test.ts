// Modalidad de contratación (24-jul) — helpers puros + GUARDAS de los dos
// riesgos acordados con Giovanny en el diseño del bloque:
//   Riesgo A: la palanca margen↔valor (utilidadDe/margenPctDe, convención
//     APU) NO cambia de semántica — la utilidad real es utilidadEsperadaDe.
//   Riesgo B: anticipo y saldo del contratista siguen sobre valor_contratista
//     PURO — los materiales los compra NEG y jamás pasan por el contratista.
import { describe, it, expect } from 'vitest'
import {
  modalidadDe, costoPresupuestadoDe, utilidadEsperadaDe, margenEsperadoPctDe,
  utilidadDe, margenPctDe, anticipoValorDe, saldoValorDe,
} from '../proyecto'

// El caso real del E2E: venta 3.000.000, mano de obra 2.250.000, materiales 800.000
const soloMO = {
  valor_venta: 3_000_000, valor_contratista: 2_250_000, anticipo_pct: 50,
  modalidad_contratista: 'solo_mano_obra' as const, valor_materiales: 800_000,
}
const todoCosto = { valor_venta: 3_000_000, valor_contratista: 2_100_000, anticipo_pct: 50 }

describe('modalidadDe — retrocompat', () => {
  it('ausente (históricos) = todo_costo — cero cambio de comportamiento', () => {
    expect(modalidadDe({})).toBe('todo_costo')
    expect(modalidadDe({ modalidad_contratista: 'solo_mano_obra' })).toBe('solo_mano_obra')
  })
})

describe('costoPresupuestadoDe — la línea base por modalidad', () => {
  it('todo_costo: el contratista ES el costo completo', () => {
    expect(costoPresupuestadoDe(todoCosto)).toBe(2_100_000)
  })

  it('todo_costo IGNORA valor_materiales aunque exista (defensa)', () => {
    expect(costoPresupuestadoDe({ ...todoCosto, modalidad_contratista: 'todo_costo', valor_materiales: 999_999 }))
      .toBe(2_100_000)
  })

  it('solo_mano_obra suma los materiales de NEG', () => {
    expect(costoPresupuestadoDe(soloMO)).toBe(3_050_000)
  })

  it('solo_mano_obra sin materiales capturados: contratista solo (?? 0)', () => {
    expect(costoPresupuestadoDe({ ...soloMO, valor_materiales: undefined })).toBe(2_250_000)
  })
})

describe('utilidadEsperadaDe / margenEsperadoPctDe — la fuente de verdad nueva', () => {
  it('todo_costo: 3.000.000 − 2.100.000 = 900.000 (30 %)', () => {
    expect(utilidadEsperadaDe(todoCosto)).toBe(900_000)
    expect(margenEsperadoPctDe(todoCosto)).toBe(30)
  })

  it('solo_mano_obra (caso real del E2E): 3.000.000 − 3.050.000 = −50.000 (negativa honesta)', () => {
    expect(utilidadEsperadaDe(soloMO)).toBe(-50_000)
    expect(margenEsperadoPctDe(soloMO)).toBeCloseTo(-1.6667, 3)
  })
})

describe('Riesgo A — la palanca NO cambia de semántica', () => {
  it('utilidadDe/margenPctDe siguen siendo venta − contratista, SIN restar materiales', () => {
    // Aunque la preliquidación traiga materiales, la palanca (convención APU)
    // opera sobre el contratista: 3.000.000 − 2.250.000 = 750.000 (25 %).
    expect(utilidadDe(soloMO)).toBe(750_000)
    expect(margenPctDe(soloMO)).toBe(25)
  })
})

describe('Riesgo B — anticipo y saldo sobre el contratista PURO', () => {
  it('los materiales jamás entran al anticipo ni al saldo', () => {
    expect(anticipoValorDe(soloMO)).toBe(1_125_000)   // 50 % de 2.250.000
    expect(saldoValorDe(soloMO)).toBe(1_125_000)
  })
})
