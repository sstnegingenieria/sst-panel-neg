// Modalidad de contratación (24-jul) — helpers puros + GUARDAS de los dos
// riesgos acordados con Giovanny en el diseño del bloque:
//   Riesgo A: la palanca margen↔valor (utilidadDe/margenPctDe, convención
//     APU) NO cambia de semántica — la utilidad real es utilidadEsperadaDe.
//   Riesgo B: anticipo y saldo del contratista siguen sobre valor_contratista
//     PURO — los materiales los compra NEG y jamás pasan por el contratista.
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  modalidadDe, costoPresupuestadoDe, utilidadEsperadaDe, margenEsperadoPctDe,
  utilidadDe, margenPctDe, anticipoValorDe, saldoValorDe,
} from '../proyecto'
import type { CompraReembolso } from '../proyecto'

const compra = (concepto: string, valor: number): CompraReembolso => ({
  concepto, valor, registrado_por: 'uid_gestor', fecha: Timestamp.fromMillis(1753200000000),
})

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

// ── C3 (02-ago): costo ejecutado DERIVADO con gate por estado ────────────────
// El indicador #3 evalúa cumplimiento presupuestal desde 'ejecutado' (decisión
// ISO de Giovanny — pendiente reflejo en Caracterización v02 con aval de GI).
import { costoEjecutadoDe, alcanzoEjecutado, ESTADOS_PROYECTO } from '../proyecto'

describe('alcanzoEjecutado — gate exhaustivo sobre la máquina', () => {
  it('false antes de ejecutado; true desde ejecutado hasta cerrado', () => {
    const corte = ESTADOS_PROYECTO.indexOf('ejecutado')
    for (const e of ESTADOS_PROYECTO) {
      expect(alcanzoEjecutado(e)).toBe(ESTADOS_PROYECTO.indexOf(e) >= corte)
    }
  })
})

describe('costoEjecutadoDe — derivado C3 con retrocompat', () => {
  const preTC = { valor_venta: 3_000_000, valor_contratista: 2_100_000, anticipo_pct: 50 }

  it('antes de ejecutado → null (no entra al indicador), aun con compras', () => {
    expect(costoEjecutadoDe({ estado: 'en_ejecucion', preliquidacion: preTC } as never, 500_000)).toBeNull()
    expect(costoEjecutadoDe({ estado: 'creado', preliquidacion: preTC } as never, 0)).toBeNull()
  })

  it('sin preliquidación → null aunque esté ejecutado', () => {
    expect(costoEjecutadoDe({ estado: 'ejecutado', preliquidacion: undefined } as never, 100)).toBeNull()
  })

  it('todo_costo ejecutado sin compras → valor_contratista (cubre el hueco de cobertura)', () => {
    expect(costoEjecutadoDe({ estado: 'ejecutado', preliquidacion: preTC } as never, 0)).toBe(2_100_000)
  })

  it('solo_mano_obra ejecutado con compras → contratista + compras reales', () => {
    const pre = { ...preTC, valor_contratista: 2_250_000, modalidad_contratista: 'solo_mano_obra', valor_materiales: 800_000 }
    expect(costoEjecutadoDe({ estado: 'pagado_cliente', preliquidacion: pre } as never, 760_000)).toBe(3_010_000)
  })

  it('manual histórico GANA siempre — con y sin compras (evita doble conteo)', () => {
    const pre = { ...preTC, costo_ejecutado: 2_400_576 }
    expect(costoEjecutadoDe({ estado: 'ejecutado', preliquidacion: pre } as never, 0)).toBe(2_400_576)
    expect(costoEjecutadoDe({ estado: 'cerrado', preliquidacion: pre } as never, 999_999)).toBe(2_400_576)
  })
})

// ── C4 (03-ago): tercer componente del derivado — reembolsos al contratista ──
describe('costoEjecutadoDe — C4 reembolsos al contratista (línea disjunta de OCs/menores)', () => {
  const preTC = { valor_venta: 3_000_000, valor_contratista: 2_100_000, anticipo_pct: 50 }

  it('reembolsos sumando: mano de obra + compras + Σ reembolsos', () => {
    const pre = { ...preTC, valor_contratista: 2_000_000 }
    const reembolsos = [compra('x', 150_000), compra('y', 50_000)]
    expect(costoEjecutadoDe(
      { estado: 'ejecutado', preliquidacion: pre, compras_reembolsos: reembolsos } as never, 300_000,
    )).toBe(2_500_000) // 2.000.000 (contratista) + 300.000 (compras) + 200.000 (reembolsos)
  })

  it('manual gana aun con reembolsos — sin doble conteo', () => {
    const pre = { ...preTC, costo_ejecutado: 2_400_576 }
    const reembolsos = [compra('x', 150_000), compra('y', 50_000)]
    expect(costoEjecutadoDe(
      { estado: 'ejecutado', preliquidacion: pre, compras_reembolsos: reembolsos } as never, 760_000,
    )).toBe(2_400_576)
  })

  it('retrocompat: sin campo compras_reembolsos → se comporta como antes (contratista + compras + 0)', () => {
    expect(costoEjecutadoDe({ estado: 'ejecutado', preliquidacion: preTC } as never, 500_000)).toBe(2_600_000)
  })

  it('pre-ejecutado con reembolsos → null (gate intacto)', () => {
    const reembolsos = [compra('x', 150_000), compra('y', 50_000)]
    expect(costoEjecutadoDe(
      { estado: 'en_ejecucion', preliquidacion: preTC, compras_reembolsos: reembolsos } as never, 500_000,
    )).toBeNull()
  })
})
