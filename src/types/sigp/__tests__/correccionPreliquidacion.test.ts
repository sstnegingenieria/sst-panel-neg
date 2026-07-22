// Bloque 4 — corrección de preliquidación con trazabilidad (ISO 7.5).
import { describe, it, expect } from 'vitest'
import {
  cambiosPreliquidacion, correccionRevierteAprobacion, saldoRealDe,
  anticipoValorDe, enBandejaFacturacion,
} from '../proyecto'
import type { Timestamp } from 'firebase/firestore'

const pre = { valor_contratista: 20_000_000, anticipo_pct: 50 }

describe('cambiosPreliquidacion — qué cambió (campo, antes → después)', () => {
  it('detecta cambios de valor y de % de anticipo', () => {
    const c = cambiosPreliquidacion(pre, { valor_contratista: 18_000_000, anticipo_pct: 40 })
    expect(c).toEqual([
      { campo: 'valor_contratista', antes: 20_000_000, despues: 18_000_000 },
      { campo: 'anticipo_pct', antes: 50, despues: 40 },
    ])
  })
  it('sin cambios → vacío (no se persiste nada)', () => {
    expect(cambiosPreliquidacion(pre, { valor_contratista: 20_000_000, anticipo_pct: 50 })).toEqual([])
  })
})

describe('correccionRevierteAprobacion — nunca un cambio silencioso tras aprobar', () => {
  it('definida → NO revierte (edición directa con traza)', () => {
    expect(correccionRevierteAprobacion('preliquidacion_definida')).toBe(false)
  })
  it('aprobada y anticipo girado → SÍ revierte (exige re-aprobación)', () => {
    expect(correccionRevierteAprobacion('preliquidacion_aprobada')).toBe(true)
    expect(correccionRevierteAprobacion('anticipo_girado')).toBe(true)
  })
})

describe('saldoRealDe — el anticipo girado es un hecho consumado', () => {
  it('sin giro: saldo por el % teórico', () => {
    expect(saldoRealDe(pre)).toBe(20_000_000 - anticipoValorDe(pre))   // 10M
  })
  it('con giro: saldo contra el valor GIRADO (no descuadra el anticipo)', () => {
    const conGiro = {
      ...pre,
      valor_contratista: 18_000_000,   // corregido a la baja tras el giro
      anticipo: { fecha: null as unknown as Timestamp, valor: 10_000_000, registrado_por: 'x' },
    }
    expect(saldoRealDe(conGiro)).toBe(8_000_000)   // 18M − 10M girados
  })
  it('SOBRE-GIRO: valor por debajo del anticipo girado → saldo NEGATIVO (sin recortar a cero)', () => {
    const sobreGiro = {
      ...pre,
      valor_contratista: 8_000_000,    // corregido por debajo del giro
      anticipo: { fecha: null as unknown as Timestamp, valor: 10_000_000, registrado_por: 'x' },
    }
    expect(saldoRealDe(sobreGiro)).toBe(-2_000_000)   // pagado de más — la UI lo alerta
  })
})

describe('enBandejaFacturacion — territorio del módulo administrativo (B1)', () => {
  it('desde el handoff en adelante', () => {
    for (const e of ['enviado_a_facturacion', 'facturado', 'pagado_cliente', 'liquidado_contratista', 'cerrado'] as const)
      expect(enBandejaFacturacion(e)).toBe(true)
  })
  it('el ciclo de Proyectos queda fuera', () => {
    for (const e of ['creado', 'preliquidacion_definida', 'anticipo_girado', 'en_ejecucion', 'soporte_recibido'] as const)
      expect(enBandejaFacturacion(e)).toBe(false)
  })
})
