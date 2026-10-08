// 08-oct — facturas: anular y reemplazar, nunca editar.
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  patchAnularFactura, facturasPreviasDelSitio, numeroFacturaEnOtroProyecto,
  diasEnPorFacturar, UMBRAL_POR_FACTURAR_DIAS,
} from '../proyecto'
import type { FacturacionProyecto, Proyecto } from '../proyecto'

const ahora = Timestamp.fromMillis(1_760_000_000_000)
const factura: FacturacionProyecto = {
  numero: 'FV 1807', fecha: ahora, valor: 326826,
  cufe: '26e3efdfdb632e8ae8aaaa', registrado_por: 'uid-m', fecha_registro: ahora,
}
const base = {
  estado: 'facturado' as const, facturacion: factura,
  facturas_anuladas: undefined, pago_cliente: undefined,
  historial: [{ de: 'enviado_a_facturacion' as const, a: 'facturado' as const, por: 'uid-m', fecha: ahora }],
}

describe('patchAnularFactura — la anulada queda congelada, el CUFE intacto', () => {
  it('feliz: congela número+CUFE, exige nota crédito, revierte a Por facturar', () => {
    const p = patchAnularFactura(base, 'facturado dos veces: el sitio se facturó en junio', 'NC-204', 'uid-m', ahora)!
    expect(p.estado).toBe('enviado_a_facturacion')
    expect(p.facturacion).toBeNull()
    expect(p.facturas_anuladas).toHaveLength(1)
    const a = p.facturas_anuladas[0]
    expect(a.numero).toBe('FV 1807')                       // intacto
    expect(a.cufe).toBe('26e3efdfdb632e8ae8aaaa')          // INTACTO — huella DIAN
    expect(a.nota_credito).toBe('NC-204')
    expect(p.historial.slice(-1)[0].motivo).toContain('ANULADA (nota crédito NC-204)')
  })
  it('sin motivo o sin nota crédito → null (la referencia fiscal es obligatoria)', () => {
    expect(patchAnularFactura(base, '  ', 'NC-1', 'u', ahora)).toBeNull()
    expect(patchAnularFactura(base, 'motivo', '  ', 'u', ahora)).toBeNull()
  })
  it('con PAGO registrado encima → null (borde declarado: otro acto)', () => {
    expect(patchAnularFactura({ ...base, pago_cliente: { fecha: ahora } as never }, 'm', 'NC-1', 'u', ahora)).toBeNull()
  })
  it('sin factura vigente o fuera de facturado → null', () => {
    expect(patchAnularFactura({ ...base, facturacion: undefined }, 'm', 'NC-1', 'u', ahora)).toBeNull()
    expect(patchAnularFactura({ ...base, estado: 'pagado_cliente' as never }, 'm', 'NC-1', 'u', ahora)).toBeNull()
  })
  it('append-only: una segunda anulación conserva la primera', () => {
    const primera = patchAnularFactura(base, 'm1', 'NC-1', 'u', ahora)!
    const p2 = patchAnularFactura(
      { ...base, facturas_anuladas: primera.facturas_anuladas, facturacion: { ...factura, numero: 'FV 1900' } },
      'm2', 'NC-2', 'u', ahora)!
    expect(p2.facturas_anuladas.map(f => f.numero)).toEqual(['FV 1807', 'FV 1900'])
  })
})

const pry = (id: string, consecutivo: string, sitio: string, cliente: string,
  fact?: FacturacionProyecto, anuladas?: never[]) => ({
  id, consecutivo,
  snapshot: { nombre_sitio: sitio, cliente } as Proyecto['snapshot'],
  facturacion: fact, facturas_anuladas: anuladas,
})

describe('la GUARDA — ver antes de facturar (no bloquea: agrupadas legítimas)', () => {
  const todos = [
    pry('a', 'PRY-1', 'LA PEÑA', 'IHS TOWERS', factura),
    pry('b', 'PRY-2', 'La Peña ', 'ihs towers', undefined),   // mismo sitio, sin factura
    pry('c', 'PRY-3', 'LA PEÑA', 'OTRO CLIENTE', factura),    // mismo sitio, OTRO cliente
    pry('d', 'PRY-4', 'PAYA', 'IHS TOWERS', factura),
  ]
  it('encuentra las previas del MISMO sitio+cliente (insensible a mayúsculas/espacios), nunca el propio', () => {
    const r = facturasPreviasDelSitio(todos, 'b', 'la peña', 'IHS TOWERS')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ consecutivo: 'PRY-1', numero: 'FV 1807', vigente: true })
  })
  it('incluye las ANULADAS (también cuentan la historia)', () => {
    const anulada = { ...factura, numero: 'FV-VIEJA', motivo_anulacion: 'x', nota_credito: 'NC', anulada_por: 'u', fecha_anulacion: ahora }
    const r = facturasPreviasDelSitio(
      [...todos, { ...pry('e', 'PRY-5', 'LA PEÑA', 'IHS TOWERS'), facturas_anuladas: [anulada] }],
      'b', 'LA PEÑA', 'IHS TOWERS')
    expect(r.map(f => [f.numero, f.vigente])).toEqual([['FV 1807', true], ['FV-VIEJA', false]])
  })
  it('mismo NÚMERO en otro proyecto → aviso de agrupada (normalizado, sin bloquear)', () => {
    expect(numeroFacturaEnOtroProyecto(todos, 'b', 'fv1807')).toEqual(['PRY-1', 'PRY-3', 'PRY-4'])
    expect(numeroFacturaEnOtroProyecto(todos, 'a', 'FV 1807')).toEqual(['PRY-3', 'PRY-4'])
    expect(numeroFacturaEnOtroProyecto(todos, 'b', '')).toEqual([])
  })
})

describe('antigüedad en Por facturar — la capa 1 del caso', () => {
  it('cuenta desde el handoff del historial; fuera del estado → null', () => {
    const hace80 = Timestamp.fromMillis(Date.now() - 80 * 86_400_000)
    const p = { estado: 'enviado_a_facturacion' as const, fecha_actualizacion: ahora,
      historial: [{ de: 'soporte_recibido' as const, a: 'enviado_a_facturacion' as const, por: 'u', fecha: hace80 }] }
    expect(diasEnPorFacturar(p)).toBe(80)
    expect(diasEnPorFacturar({ ...p, estado: 'facturado' as never })).toBeNull()
    expect(80).toBeGreaterThan(UMBRAL_POR_FACTURAR_DIAS)   // el caso real habría gritado
  })
})
