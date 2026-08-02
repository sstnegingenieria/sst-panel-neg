// Módulo Compras C2 — helpers puros y máquina de estados de la OC.
import { describe, it, expect } from 'vitest'
import {
  valorLineaDe, totalDe, validarOcParaEmitir, requiereSalvedadAprobacion,
  TRANSICIONES_OC, ESTADOS_OC,
} from '../ordenCompra'
import type { LineaOrdenCompra } from '../ordenCompra'

const linea = (parcial: Partial<LineaOrdenCompra> = {}): LineaOrdenCompra => ({
  descripcion: 'Cemento gris 50kg', cantidad: 10, valor_unitario: 32_000, valor: 320_000,
  ...parcial,
})

describe('valorLineaDe / totalDe', () => {
  it('valor = cantidad × unitario, redondeado a peso', () => {
    expect(valorLineaDe(10, 32_000)).toBe(320_000)
    expect(valorLineaDe(2.5, 1_333.33)).toBe(3333)   // 3333.325 → 3333
    expect(valorLineaDe(0, 5000)).toBe(0)
  })
  it('total = Σ líneas', () => {
    expect(totalDe([linea(), linea({ valor: 80_000 })])).toBe(400_000)
    expect(totalDe([])).toBe(0)
  })
})

describe('validarOcParaEmitir — validación dura del EMITIR', () => {
  const ocOk = { lineas: [linea()], valor_total: 320_000, cotizacion_proveedor_url: 'https://x/uuid.pdf' }

  it('OC completa → sin errores', () => {
    expect(validarOcParaEmitir(ocOk)).toEqual({})
  })
  it('sin líneas → error', () => {
    expect(validarOcParaEmitir({ ...ocOk, lineas: [], valor_total: 0 }).lineas).toBeTruthy()
  })
  it('línea sin descripción / cantidad 0 / unitario 0 → error por línea', () => {
    const e = validarOcParaEmitir({
      ...ocOk,
      lineas: [linea({ descripcion: '  ' }), linea({ cantidad: 0 }), linea({ valor_unitario: 0 })],
      valor_total: totalDe([linea(), linea(), linea()]),
    })
    expect(e.linea_0_descripcion).toBeTruthy()
    expect(e.linea_1_cantidad).toBeTruthy()
    expect(e.linea_2_valor).toBeTruthy()
  })
  it('total que no cuadra con las líneas → error (el Σ es la fuente de verdad)', () => {
    expect(validarOcParaEmitir({ ...ocOk, valor_total: 999 }).valor_total).toBeTruthy()
  })
  it('sin cotización del proveedor → error (requisito duro del emitir)', () => {
    expect(validarOcParaEmitir({ ...ocOk, cotizacion_proveedor_url: '' }).cotizacion).toBeTruthy()
  })
})

describe('requiereSalvedadAprobacion — escape aprobador == creador', () => {
  it('mismo uid → salvedad obligatoria; distinto → no', () => {
    expect(requiereSalvedadAprobacion('uidGG', 'uidGG')).toBe(true)
    expect(requiereSalvedadAprobacion('uidGP', 'uidAux')).toBe(false)
  })
})

describe('TRANSICIONES_OC — máquina de estados', () => {
  it('borrador → emitida|anulada; emitida → aprobada|anulada', () => {
    expect(TRANSICIONES_OC.borrador).toEqual(['emitida', 'anulada'])
    expect(TRANSICIONES_OC.emitida).toEqual(['aprobada', 'anulada'])
  })
  it('aprobada solo se anula (inmutable en lo demás); anulada es terminal', () => {
    expect(TRANSICIONES_OC.aprobada).toEqual(['anulada'])
    expect(TRANSICIONES_OC.anulada).toEqual([])
  })
  it('todo estado está en la máquina (exhaustividad)', () => {
    for (const e of ESTADOS_OC) expect(TRANSICIONES_OC[e]).toBeDefined()
  })
})
