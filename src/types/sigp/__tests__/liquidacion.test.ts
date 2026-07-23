// Liquidación del contratista (Administrativa · Bloque 3b) — helpers puros.
// Contrato: mano de obra (preliquidación) + compras/reembolsos en línea
// propia = total final; saldo = total − anticipo GIRADO real − retenciones;
// solo se liquida en pagado_cliente (el gate SST se exige en reglas).
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  totalComprasReembolsos, totalRetenciones, totalContratistaFinal,
  saldoFinalLiquidacion, puedeLiquidarseEn, esAjusteEnEjecucion,
  origenDiferenciaLiquidacion,
  ESTADOS_PROYECTO,
} from '../proyecto'
import type { CompraReembolso, EstadoProyecto } from '../proyecto'

const compra = (concepto: string, valor: number): CompraReembolso => ({
  concepto, valor, registrado_por: 'uid_gestor', fecha: Timestamp.fromMillis(1753200000000),
})

describe('totalComprasReembolsos / totalContratistaFinal', () => {
  it('sin compras: total final = mano de obra (caso "igual a la preliquidación")', () => {
    expect(totalComprasReembolsos(undefined)).toBe(0)
    expect(totalComprasReembolsos([])).toBe(0)
    expect(totalContratistaFinal(2_000_000, [])).toBe(2_000_000)
  })

  it('las compras van en línea propia y SUMAN al total (no tocan la mano de obra)', () => {
    const compras = [compra('tornillería', 150_000), compra('pintura epóxica', 80_000)]
    expect(totalComprasReembolsos(compras)).toBe(230_000)
    expect(totalContratistaFinal(2_000_000, compras)).toBe(2_230_000)
  })
})

describe('saldoFinalLiquidacion — contra el giro REAL', () => {
  it('saldo = total final − anticipo girado − retenciones', () => {
    expect(saldoFinalLiquidacion(2_230_000, 1_000_000, [])).toBe(1_230_000)
    expect(saldoFinalLiquidacion(2_230_000, 1_000_000, [{ concepto: 'garantía', valor: 100_000 }]))
      .toBe(1_130_000)
  })

  it('retenciones: estructura moldeable, vacía por defecto', () => {
    expect(totalRetenciones(undefined)).toBe(0)
    expect(totalRetenciones([])).toBe(0)
    expect(totalRetenciones([{ concepto: 'a', valor: 10 }, { concepto: 'b', valor: 5 }])).toBe(15)
  })

  it('sobre-giro: el saldo negativo NUNCA se recorta en silencio', () => {
    expect(saldoFinalLiquidacion(900_000, 1_000_000, [])).toBe(-100_000)
  })
})

describe('puedeLiquidarseEn — solo tras el pago del cliente', () => {
  it('pagado_cliente es el único estado liquidable', () => {
    expect(puedeLiquidarseEn('pagado_cliente')).toBe(true)
    const otros = ESTADOS_PROYECTO.filter((e): e is EstadoProyecto => e !== 'pagado_cliente')
    for (const e of otros) expect(puedeLiquidarseEn(e), e).toBe(false)
  })
})

describe('origenDiferenciaLiquidacion — el sello atribuye bien el origen', () => {
  it('sin compras ni ajustes → igual', () => {
    expect(origenDiferenciaLiquidacion(0, 0)).toBe('igual')
  })
  it('solo compras → compras (el texto "por compras/reembolsos" es correcto)', () => {
    expect(origenDiferenciaLiquidacion(150_000, 0)).toBe('compras')
  })
  it('solo ajuste de mano de obra (diferencia 0) → ajustes — JAMÁS "por compras"', () => {
    expect(origenDiferenciaLiquidacion(0, 1)).toBe('ajustes')
  })
  it('mezcla compras + ajuste → compras_y_ajustes (atribución doble)', () => {
    expect(origenDiferenciaLiquidacion(150_000, 2)).toBe('compras_y_ajustes')
  })
})

describe('esAjusteEnEjecucion — reconoce la marca del Hotfix 23-jul', () => {
  it('detecta el motivo del ajuste y no otros', () => {
    expect(esAjusteEnEjecucion(
      'Corrección de preliquidación — Valor del contratista: $ 10 → $ 9 — Motivo: compra olvidada · AJUSTE en ejecución (el proyecto continúa en «Ejecutado») — pendiente de reconocer en la LIQUIDACIÓN por Gerencia Administrativa',
    )).toBe(true)
    expect(esAjusteEnEjecucion('Factura FE-1042 registrada')).toBe(false)
    expect(esAjusteEnEjecucion('')).toBe(false)
  })
})
