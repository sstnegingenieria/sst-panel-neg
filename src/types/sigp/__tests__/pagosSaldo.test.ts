// Parte B del bloque proyección/saldo (28-oct) — el PAGO del saldo: lista
// append-only [B1] con comprobante obligatorio [B2], registro_posterior
// DERIVADO [B3/R8], corrección/anulación con traza [B4] y el gate del CIERRE
// (saldos_pendientes en el resumen).
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  pagosSaldoDe, pagosSaldoVivosDe, totalPagadoSaldoDe, saldoPagadoDe, saldoRestanteDe,
  esRegistroPosterior, patchRegistrarPagoSaldo, patchCorregirPagoSaldo,
  resumenAsignacionesDe,
} from '../asignacion'
import type { AsignacionContratista, PagoSaldo } from '../asignacion'
import { puedeCerrarseProyecto } from '../proyecto'

const ts = (iso: string) => Timestamp.fromDate(new Date(iso))
const HOY = ts('2026-10-28T15:00:00')

const pago = (valor: number, extra: Partial<PagoSaldo> = {}): PagoSaldo => ({
  fecha: ts('2026-10-28T12:00:00'), valor, medio: 'transferencia',
  comprobante_url: 'https://x/comprobante.pdf', registrado_por: 'marcela',
  fecha_registro: HOY, ...extra,
})

const liquidada = (over: Partial<AsignacionContratista> = {}): AsignacionContratista => ({
  id: 'a1', estado: 'liquidada', contratista_id: 'c1', contratista_nombre: 'Héctor',
  atomos: ['G1'], fecha: HOY, fecha_creacion: HOY, asignado_por: 'u1',
  modalidad: 'todo_costo', compras_reembolsos: [], historial: [],
  habilitacion_snapshot: { estado: 'activo', fecha_consulta: HOY, fuente: 'test' },
  liquidacion: {
    mano_obra: 700_000, compras_reembolsos: [], ajustes_reconocidos: [], retenciones: [],
    total_final: 700_000, diferencia: 0, es_igual: true,
    anticipo_girado: 350_000, saldo_final: 350_000, liquidada_por: 'marcela', fecha: HOY,
  },
  ...over,
} as AsignacionContratista)

describe('helpers — suma de pagos vivos y "saldo pagado"', () => {
  it('Σ excluye anulados; saldoPagado = Σ ≥ saldo_final', () => {
    const a = liquidada({ pagos_saldo: [pago(200_000), pago(100_000, { anulado: { fecha: HOY, por: 'm', motivo: 'x' } }), pago(150_000)] })
    expect(pagosSaldoDe(a)).toHaveLength(3)
    expect(pagosSaldoVivosDe(a)).toHaveLength(2)
    expect(totalPagadoSaldoDe(a)).toBe(350_000)
    expect(saldoPagadoDe(a)).toBe(true)
    expect(saldoRestanteDe(a)).toBe(0)
  })
  it('parcial → pendiente con restante visible; sin pagos → restante = saldo', () => {
    const a = liquidada({ pagos_saldo: [pago(100_000)] })
    expect(saldoPagadoDe(a)).toBe(false)
    expect(saldoRestanteDe(a)).toBe(250_000)
    expect(saldoRestanteDe(liquidada())).toBe(350_000)
  })
  it('saldo ≤ 0 (sobre-giro a favor de NEG) cuenta PAGADO — nada que pagar', () => {
    const a = liquidada({ liquidacion: { ...liquidada().liquidacion!, saldo_final: -50_000 } })
    expect(saldoPagadoDe(a)).toBe(true)
  })
})

describe('esRegistroPosterior [B3/R8] — por día calendario, no por hora', () => {
  it('fecha de ayer → posterior; esta mañana → NO (la hora no lo convierte)', () => {
    expect(esRegistroPosterior(ts('2026-10-27T18:00:00'), HOY)).toBe(true)
    expect(esRegistroPosterior(ts('2026-10-28T08:00:00'), HOY)).toBe(false)
  })
})

describe('patchRegistrarPagoSaldo [B1][B2]', () => {
  const datos = { fecha: ts('2026-10-28T12:00:00'), valor: 350_000, medio: 'transferencia' as const, comprobante_url: 'https://x/c.pdf' }

  it('registra sobre liquidada: append, totales, SALDO PAGADO en el historial', () => {
    const r = patchRegistrarPagoSaldo(liquidada(), datos, 'marcela', HOY, 'Marcela')!
    expect(r.sub.pagos_saldo).toHaveLength(1)
    expect(r.sub.pagos_saldo![0]).toMatchObject({ valor: 350_000, registrado_por: 'marcela', por_nombre: 'Marcela' })
    expect(r.completo).toBe(true)
    expect(r.posterior).toBe(false)
    expect(r.entradaHistorial.motivo).toContain('SALDO PAGADO')
    expect(r.sub.pagos_saldo![0].registro_posterior).toBeUndefined()
  })
  it('pago PARCIAL appendea sin cerrar; el segundo completa', () => {
    const r1 = patchRegistrarPagoSaldo(liquidada(), { ...datos, valor: 200_000 }, 'marcela', HOY)!
    expect(r1.completo).toBe(false)
    expect(r1.entradaHistorial.motivo).toContain('restante 150000')
    const tras = { ...liquidada(), ...r1.sub } as AsignacionContratista
    const r2 = patchRegistrarPagoSaldo(tras, { ...datos, valor: 150_000 }, 'marcela', HOY)!
    expect(r2.sub.pagos_saldo).toHaveLength(2)
    expect(r2.completo).toBe(true)
  })
  it('[R8] fecha real anterior → registro_posterior DERIVADO (no lo decide el caller)', () => {
    const r = patchRegistrarPagoSaldo(liquidada(), { ...datos, fecha: ts('2026-09-30T12:00:00') }, 'marcela', HOY)!
    expect(r.posterior).toBe(true)
    expect(r.sub.pagos_saldo![0].registro_posterior).toBe(true)
    expect(r.entradaHistorial.motivo).toContain('registro POSTERIOR')
  })
  it('[B3] fecha de HOY anclada a mediodía con registro en la MAÑANA → NO es futura (caso 8 AM del E2E)', () => {
    const r = patchRegistrarPagoSaldo(liquidada(), { ...datos, fecha: ts('2026-10-28T12:00:00') }, 'marcela', ts('2026-10-28T08:00:00'))
    expect(r).not.toBeNull()
    expect(r!.posterior).toBe(false)
  })
  it('rehúsa: sin comprobante [B2], valor ≤ 0, fecha FUTURA [B3], no-liquidada, directa, saldo ≤ 0', () => {
    expect(patchRegistrarPagoSaldo(liquidada(), { ...datos, comprobante_url: '' }, 'm', HOY)).toBeNull()
    expect(patchRegistrarPagoSaldo(liquidada(), { ...datos, valor: 0 }, 'm', HOY)).toBeNull()
    expect(patchRegistrarPagoSaldo(liquidada(), { ...datos, fecha: ts('2026-11-01T12:00:00') }, 'm', HOY)).toBeNull()
    expect(patchRegistrarPagoSaldo(liquidada({ estado: 'anticipo_girado' }), datos, 'm', HOY)).toBeNull()
    expect(patchRegistrarPagoSaldo(liquidada({ tipo: 'administracion_directa' }), datos, 'm', HOY)).toBeNull()
    const sinSaldo = liquidada({ liquidacion: { ...liquidada().liquidacion!, saldo_final: 0 } })
    expect(patchRegistrarPagoSaldo(sinSaldo, datos, 'm', HOY)).toBeNull()
  })
  it('pagar POR ENCIMA del saldo no se bloquea — queda dicho', () => {
    const r = patchRegistrarPagoSaldo(liquidada(), { ...datos, valor: 400_000 }, 'marcela', HOY)!
    expect(r.entradaHistorial.motivo).toContain('POR ENCIMA del saldo')
  })
})

describe('patchCorregirPagoSaldo [B4] — un pago no se sobrescribe', () => {
  const conPagos = liquidada({ pagos_saldo: [pago(200_000), pago(150_000)] })

  it('con DOS vivos el índice es obligatorio; corrige con traza solo-crecer', () => {
    expect(patchCorregirPagoSaldo(conPagos, { valor: 99 }, 'motivo', 'm', HOY)).toBeNull()
    const r = patchCorregirPagoSaldo(conPagos, { indice: 1, valor: 100_000 }, 'typo', 'm', HOY, 'Marcela')!
    expect(r.sub.pagos_saldo![1].valor).toBe(100_000)
    expect(r.sub.pagos_saldo![1].correcciones).toHaveLength(1)
    expect(r.sub.pagos_saldo![1].correcciones![0]).toMatchObject({ valor_anterior: 150_000, valor_nuevo: 100_000 })
    expect(r.entradaHistorial.motivo).toContain('pago 2')
  })
  it('anula con marcador — el pago queda en la lista, fuera de la suma', () => {
    const r = patchCorregirPagoSaldo(conPagos, { indice: 0, anular: true }, 'no salió', 'm', HOY)!
    expect(r.anula).toBe(true)
    expect(r.sub.pagos_saldo).toHaveLength(2)
    expect(r.sub.pagos_saldo![0].anulado).toBeTruthy()
    expect(r.entradaHistorial.motivo).toContain('pagado vigente 150000')
  })
})

describe('resumen + cierre — saldos_pendientes alimenta la cola y el gate', () => {
  const alcance = { alcance: [{ grupo: 'G1', items: 1, subtotal: 1_000_000 }] } as never
  it('liquidada con saldo sin pagar cuenta; pagada no; directa y saldo 0 tampoco', () => {
    const pendiente = liquidada()
    const pagada = liquidada({ id: 'a2', pagos_saldo: [pago(350_000)] })
    const directa = liquidada({ id: 'a3', tipo: 'administracion_directa' })
    const r = resumenAsignacionesDe([pendiente, pagada, directa], alcance)
    expect(r.saldos_pendientes).toBe(1)
  })
  it('puedeCerrarseProyecto exige saldos_pendientes == 0 (ausente = 0 — censo: cero liquidadas históricas)', () => {
    const base = { estado: 'liquidado_contratista' as const, pago_cliente: { fecha: HOY } as never }
    expect(puedeCerrarseProyecto({ ...base, resumen_asignaciones: { saldos_pendientes: 1 } })).toBe(false)
    expect(puedeCerrarseProyecto({ ...base, resumen_asignaciones: { saldos_pendientes: 0 } })).toBe(true)
    expect(puedeCerrarseProyecto(base)).toBe(true)
  })
})
