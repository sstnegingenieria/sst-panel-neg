// Liquidación anticipada (23-jul) — máquina de estados explícita.
// Contrato: normal desde pagado_cliente; ANTICIPADA solo desde facturado
// (salta exactamente UN estado); ningún otro origen. El cierre exige el
// cobro registrado (no cerrar con cuenta por cobrar abierta).
import { describe, it, expect } from 'vitest'
import {
  puedeLiquidarseEn, puedeLiquidarseAnticipadoEn, pagoClientePendiente,
  puedeCerrarseProyecto, ESTADOS_PROYECTO,
} from '../proyecto'
import type { EstadoProyecto, PagoClienteProyecto } from '../proyecto'

const pago = {} as PagoClienteProyecto

describe('máquina de estados hacia liquidado_contratista', () => {
  it('normal: solo pagado_cliente · anticipada: solo facturado', () => {
    for (const e of ESTADOS_PROYECTO) {
      expect(puedeLiquidarseEn(e), `normal desde ${e}`).toBe(e === 'pagado_cliente')
      expect(puedeLiquidarseAnticipadoEn(e), `anticipada desde ${e}`).toBe(e === 'facturado')
    }
  })

  it('la anticipada salta exactamente UN estado (pagado_cliente)', () => {
    const iFact = ESTADOS_PROYECTO.indexOf('facturado')
    const iLiq = ESTADOS_PROYECTO.indexOf('liquidado_contratista')
    expect(iLiq - iFact).toBe(2)  // facturado → [pagado_cliente] → liquidado
    // nunca antes de facturado: enviado_a_facturacion no liquida por ninguna vía
    expect(puedeLiquidarseEn('enviado_a_facturacion')).toBe(false)
    expect(puedeLiquidarseAnticipadoEn('enviado_a_facturacion')).toBe(false)
  })
})

describe('pagoClientePendiente — la sección "Por cobrar"', () => {
  it('facturado siempre está por cobrar', () => {
    expect(pagoClientePendiente({ estado: 'facturado' })).toBe(true)
    expect(pagoClientePendiente({ estado: 'facturado', pago_cliente: pago })).toBe(true)
  })

  it('liquidado ANTICIPADO sin pago sigue por cobrar; con pago sale', () => {
    expect(pagoClientePendiente({ estado: 'liquidado_contratista' })).toBe(true)
    expect(pagoClientePendiente({ estado: 'liquidado_contratista', pago_cliente: pago })).toBe(false)
  })

  it('los demás estados no están por cobrar', () => {
    for (const e of ESTADOS_PROYECTO.filter((x): x is EstadoProyecto =>
      x !== 'facturado' && x !== 'liquidado_contratista')) {
      expect(pagoClientePendiente({ estado: e }), e).toBe(false)
    }
  })
})

describe('puedeCerrarseProyecto — no cerrar con cuenta por cobrar abierta', () => {
  it('liquidado + pago registrado → cerrable; sin pago → bloqueado', () => {
    expect(puedeCerrarseProyecto({ estado: 'liquidado_contratista', pago_cliente: pago })).toBe(true)
    expect(puedeCerrarseProyecto({ estado: 'liquidado_contratista' })).toBe(false)
  })

  it('ningún otro estado es cerrable, ni con pago', () => {
    for (const e of ESTADOS_PROYECTO.filter((x): x is EstadoProyecto => x !== 'liquidado_contratista')) {
      expect(puedeCerrarseProyecto({ estado: e, pago_cliente: pago }), e).toBe(false)
    }
  })
})
