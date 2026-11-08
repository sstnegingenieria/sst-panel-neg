// Facturación PARCIAL (07-nov) — caso PRY-2026-058/SENA ($72.944.351): el
// cliente autoriza facturar por avance y el objeto único no admitía varios
// hechos. FACTURADO ahora significa facturación COMPLETA.
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  facturasDe, facturasVivasDe, totalFacturadoDe, facturacionCompletaDe,
  estadoHandoffConFacturas, patchRegistrarFacturaParcial, patchAnularFacturaDeLista,
  puedeCerrarseProyecto, completitudCierre, ESTADOS_REGISTRO_FACTURA,
  type FacturaProyecto, type FacturacionProyecto, type Proyecto,
} from '../proyecto'

const ts = Timestamp.fromDate(new Date('2026-11-07T12:00:00Z'))
const VENTA = 72_944_351
const f = (numero: string, valor: number, extra: Partial<FacturaProyecto> = {}): FacturaProyecto =>
  ({ numero, fecha: ts, valor, registrado_por: 'ga', fecha_registro: ts, ...extra })
const base = (over: Partial<Proyecto> = {}) => ({
  estado: 'en_ejecucion' as const,
  snapshot: { valor_venta: VENTA } as Proyecto['snapshot'],
  historial: [] as Proyecto['historial'],
  ...over,
})

describe('lectura DUAL — el singular legacy es facturas[0], sin reinterpretar', () => {
  it('legacy singular → lista virtual de 1; lista canónica gana si existe', () => {
    const legacy: FacturacionProyecto = f('FV-1813', 1_000_000)
    expect(facturasDe({ facturacion: legacy })).toHaveLength(1)
    expect(facturasDe({ facturacion: legacy })[0].numero).toBe('FV-1813')
    expect(facturasDe({ facturacion: legacy, facturas: [f('FE-1', 5)] })[0].numero).toBe('FE-1')
    expect(facturasDe({})).toEqual([])
  })
  it('Σ solo suma VIVAS; completa exige Σ ≥ valor y > 0', () => {
    const p = { facturas: [f('FE-1', 30_000_000), f('FE-2', 10_000_000, { anulada: { fecha: ts, por: 'x', motivo: 'm', nota_credito: 'NC-1' } })], snapshot: { valor_venta: VENTA } as Proyecto['snapshot'] }
    expect(totalFacturadoDe(p)).toBe(30_000_000)
    expect(facturasVivasDe(p)).toHaveLength(1)
    expect(facturacionCompletaDe(p)).toBe(false)
    expect(facturacionCompletaDe({ facturas: [f('FE-1', VENTA)], snapshot: { valor_venta: VENTA } as Proyecto['snapshot'] })).toBe(true)
    expect(facturacionCompletaDe({ facturas: [], snapshot: { valor_venta: 0 } as Proyecto['snapshot'] })).toBe(false)
  })
})

describe('patchRegistrarFacturaParcial — el caso de Marcela', () => {
  it('parcial desde EN_EJECUCION (el desbloqueo del 058): registra SIN mover el estado', () => {
    const r = patchRegistrarFacturaParcial(base(), f('FE-100', 20_000_000), 'ga', ts, 'Marcela')!
    expect(r).not.toBeNull()
    expect(r.padre.estado).toBeUndefined()
    expect(r.total).toBe(20_000_000)
    expect(r.completa).toBe(false)
    expect(r.padre.total_facturado).toBe(20_000_000)
    expect(r.padre.historial[r.padre.historial.length - 1].motivo).toContain('facturación PARCIAL')
  })
  it('la que COMPLETA la suma en enviado_a_facturacion → transiciona a facturado', () => {
    const p = base({ estado: 'enviado_a_facturacion', facturas: [f('FE-100', 20_000_000)] })
    const r = patchRegistrarFacturaParcial(p as never, f('FE-101', VENTA - 20_000_000), 'ga', ts)!
    expect(r.completa).toBe(true)
    expect(r.padre.estado).toBe('facturado')
    expect(r.padre.facturas).toHaveLength(2)
  })
  it('completa ANTES del handoff: no salta el riel; el handoff aterriza facturado', () => {
    const p = base({ facturas: [f('FE-100', VENTA)] })
    const r = patchRegistrarFacturaParcial(p as never, f('FE-999', 1), 'ga', ts)!
    expect(r.padre.estado).toBeUndefined()           // en_ejecucion no salta
    expect(estadoHandoffConFacturas(p as never)).toBe('facturado')
    expect(estadoHandoffConFacturas(base() as never)).toBe('enviado_a_facturacion')
  })
  it('sobrepasa el valor → ADVIERTE con constancia, no bloquea (patrón sobre-giro)', () => {
    const p = base({ facturas: [f('FE-100', 70_000_000)] })
    const r = patchRegistrarFacturaParcial(p as never, f('FE-101', 10_000_000), 'ga', ts)!
    expect(r.sobrepasa).toBe(true)
    expect(r.padre.historial[r.padre.historial.length - 1].motivo).toContain('SUPERA EL VALOR')
  })
  it('legacy singular se MATERIALIZA como facturas[0] en el primer write', () => {
    const p = base({ estado: 'enviado_a_facturacion', facturacion: f('FV-1813', 50_000_000) })
    const r = patchRegistrarFacturaParcial(p as never, f('FE-200', VENTA - 50_000_000), 'ga', ts)!
    expect(r.padre.facturas[0].numero).toBe('FV-1813')
    expect(r.padre.facturacion).toBeNull()
    expect(r.completa).toBe(true)
  })
  it('estados no facturables y valores inválidos → null', () => {
    expect(patchRegistrarFacturaParcial(base({ estado: 'anticipo_girado' }) as never, f('X', 1), 'g', ts)).toBeNull()
    expect(patchRegistrarFacturaParcial(base() as never, f('X', 0), 'g', ts)).toBeNull()
    expect(patchRegistrarFacturaParcial(base() as never, f('  ', 5), 'g', ts)).toBeNull()
    expect(ESTADOS_REGISTRO_FACTURA).toContain('en_ejecucion')
  })
})

describe('patchAnularFacturaDeLista — por factura, con nota crédito', () => {
  const dos = () => base({ estado: 'facturado', facturas: [f('FE-1', 50_000_000), f('FE-2', VENTA - 50_000_000)] })
  it('anular una deja de estar completa → revierte a Por facturar; la factura queda FUERA de la suma, no borrada', () => {
    const r = patchAnularFacturaDeLista(dos() as never, 1, 'valor errado', 'NC-204', 'ga', ts)!
    expect(r.padre.estado).toBe('enviado_a_facturacion')
    expect(r.padre.facturas).toHaveLength(2)
    expect(r.padre.facturas[1].anulada?.nota_credito).toBe('NC-204')
    expect(r.total).toBe(50_000_000)
    expect(r.padre.total_facturado).toBe(50_000_000)
  })
  it('anular una PARCIAL en ejecución: sin transición (no había estado que revertir)', () => {
    const p = base({ facturas: [f('FE-1', 10_000_000)] })
    const r = patchAnularFacturaDeLista(p as never, 0, 'duplicada', 'NC-1', 'ga', ts)!
    expect(r.padre.estado).toBeUndefined()
    expect(r.total).toBe(0)
  })
  it('con pago del cliente encima, sin nota crédito, o índice anulado → null', () => {
    expect(patchAnularFacturaDeLista({ ...dos(), pago_cliente: { valor: 1 } } as never, 0, 'm', 'NC', 'g', ts)).toBeNull()
    expect(patchAnularFacturaDeLista(dos() as never, 0, 'm', '  ', 'g', ts)).toBeNull()
    const ya = base({ facturas: [f('FE-1', 5, { anulada: { fecha: ts, por: 'x', motivo: 'm', nota_credito: 'NC' } })] })
    expect(patchAnularFacturaDeLista(ya as never, 0, 'm', 'NC-2', 'g', ts)).toBeNull()
  })
})

describe('el cierre exige facturación COMPLETA (solo era de la lista)', () => {
  const cerrable = { estado: 'liquidado_contratista' as const, pago_cliente: { valor: 1 } as never, snapshot: { valor_venta: VENTA } as Proyecto['snapshot'] }
  it('lista parcial → NO cierra; lista completa → cierra; legacy sin lista → como siempre', () => {
    expect(puedeCerrarseProyecto({ ...cerrable, facturas: [f('FE-1', 10)] })).toBe(false)
    expect(puedeCerrarseProyecto({ ...cerrable, facturas: [f('FE-1', VENTA)] })).toBe(true)
    expect(puedeCerrarseProyecto(cerrable)).toBe(true)   // regresión era-singular
  })
  it('completitudCierre dice "Facturación completa" con la cuenta hecha', () => {
    const linea = completitudCierre({ ...cerrable, facturas: [f('FE-1', 10)], liquidacion: undefined, evaluacion_contratista: undefined, evaluacion_cliente: undefined, facturacion: undefined } as never)[0]
    expect(linea.etiqueta).toBe('Facturación completa')
    expect(linea.ok).toBe(false)
  })
})
