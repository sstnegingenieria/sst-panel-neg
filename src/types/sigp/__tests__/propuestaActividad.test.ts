// F1.2 — Propuesta económica de actividades: motor puro. Mismo PEA por
// negociación (patrón LPU vigente/histórica), fotografía derivada de las
// actividades, plan de re-emisión con invariantes del swap, y la evidencia
// congelada de la aprobación (§6d).
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  idPropuesta, propuestaVigenteDe, seriesDe, puedeProponerse,
  construirFotoPropuesta, planReemision, IVA_PCT_DEFAULT,
} from '../propuestaActividad'
import type { PropuestaActividad } from '../propuestaActividad'
import { patchAprobar, patchVincularPropuesta, patchDesvincularPropuesta, construirLinea } from '../actividad'
import type { Actividad } from '../actividad'
import type { Cliente } from '../cliente'

const ts = () => Timestamp.fromDate(new Date('2026-08-18T10:00:00'))

const LPU_OK = { id: 'lpu1', cliente_id: 'cliA', contrato: 'Obra Civil — 4600023645', naturaleza: 'opex' as const, estado: 'vigente' as const }
const ITEM = { id: 'i1', codigo: '2.0.10', descripcion: 'Resane de muro', unidad: 'm2', valor_unitario: 35000 }

const act = (id: string, extra: Partial<Actividad> = {}): Actividad => ({
  id, cliente_id: 'cliA', sede_nombre: 'Triara', zona: 'Búnker XI',
  contrato: 'Obra Civil — 4600023645', naturaleza: 'opex',
  descripcion: `Actividad ${id}`, estado: 'registrada', historial: [],
  creada_por: 'u1', fecha_creacion: ts(),
  lineas: [construirLinea(LPU_OK, ITEM, 2, 'medida', { cliente_id: 'cliA', contrato: 'Obra Civil — 4600023645', naturaleza: 'opex' })!],
  total: 70000,
  ...extra,
})

const CLIENTE = {
  id: 'cliA',
  condiciones_comerciales: { esquema_impuestos: 'iva_pleno' as const },
} as Pick<Cliente, 'id' | 'condiciones_comerciales'> as Cliente

const prop = (version: number, estado: 'vigente' | 'historica', extra: Partial<PropuestaActividad> = {}): PropuestaActividad => ({
  id: idPropuesta('PEA-2026-005', version),
  consecutivo: 'PEA-2026-005', version, estado,
  cliente_id: 'cliA', cliente_nombre: 'CLARO', actividad_ids: ['a1', 'a2'],
  asunto: 'Mantenimiento Triara', esquema: 'iva_pleno', iva_pct: 19,
  items: [], grupos: [], totales: { costos_directos: 0, base_iva: 0, iva: 0, total: 0 },
  condiciones: { forma_pago: '', validez_dias: 30, tiempo_ejecucion: '', garantia: '', moneda: 'COP' },
  fecha_emision: ts(), firmante: { nombre: 'G' }, emitida_por: 'u1',
  pdf_hash: 'h', pdf_url: 'u', fecha_creacion: ts(),
  ...extra,
})

describe('identidad de la serie — slug determinístico y vigente canónica', () => {
  it('idPropuesta: mismo PEA, versión en el sufijo (reintentos no duplican)', () => {
    expect(idPropuesta('PEA-2026-005', 1)).toBe('pea-2026-005_v1')
    expect(idPropuesta('PEA-2026-005', 2)).toBe('pea-2026-005_v2')
  })
  it('propuestaVigenteDe: la vigente de la serie, jamás una histórica', () => {
    const todas = [prop(1, 'historica'), prop(2, 'vigente')]
    expect(propuestaVigenteDe(todas, 'PEA-2026-005')!.version).toBe(2)
    expect(propuestaVigenteDe([prop(1, 'historica')], 'PEA-2026-005')).toBeNull()
    expect(propuestaVigenteDe(todas, 'PEA-2026-099')).toBeNull()
  })
  it('seriesDe agrupa por consecutivo con versiones descendentes', () => {
    const s = seriesDe([prop(1, 'historica'), prop(2, 'vigente')])
    expect(s).toHaveLength(1)
    expect(s[0].versiones.map(v => v.version)).toEqual([2, 1])
  })
})

describe('puedeProponerse — el builder impide, no advierte', () => {
  it('valorizada, sin anular y sin serie ajena → sí', () => {
    expect(puedeProponerse(act('a1'))).toBe(true)
  })
  it('sin valorizar o anulada → no', () => {
    expect(puedeProponerse(act('a1', { lineas: [], total: 0 }))).toBe(false)
    expect(puedeProponerse(act('a1', { anulacion: { fecha: ts(), por: 'u', motivo: 'x' } }))).toBe(false)
  })
  it('cubierta por OTRA serie → no; por la MISMA serie (re-emisión) → sí', () => {
    const cubierta = act('a1', { propuesta_consecutivo: 'PEA-2026-001' })
    expect(puedeProponerse(cubierta)).toBe(false)
    expect(puedeProponerse(cubierta, 'PEA-2026-001')).toBe(true)
    expect(puedeProponerse(cubierta, 'PEA-2026-002')).toBe(false)
  })
})

describe('construirFotoPropuesta — fotografía derivada de las actividades', () => {
  it('mapea líneas → ítems con trazabilidad y agrupa por actividad', () => {
    const foto = construirFotoPropuesta([act('a1'), act('a2')], CLIENTE)!
    expect(foto.items).toHaveLength(2)
    expect(foto.items[0]).toMatchObject({
      origen: 'lpu', codigo: '2.0.10', unidad: 'm2', valor_unitario: 35000,
      cantidad: 2, valor_total: 70000, actividad_id: 'a1', lpu_id: 'lpu1',
    })
    expect(foto.grupos.map(g => g.id)).toEqual(['a1', 'a2'])
    expect(foto.grupos[0].nombre).toContain('Triara')
    expect(foto.actividad_ids).toEqual(['a1', 'a2'])
  })
  it('totales con el esquema del cliente (iva_pleno 19%: 140.000 + 26.600)', () => {
    const foto = construirFotoPropuesta([act('a1'), act('a2')], CLIENTE)!
    expect(foto.esquema).toBe('iva_pleno')
    expect(foto.iva_pct).toBe(IVA_PCT_DEFAULT)
    expect(foto.totales.costos_directos).toBe(140000)
    expect(foto.totales.total).toBe(166600)
    expect(foto.totales.subtotales_por_grupo?.map(g => g.subtotal)).toEqual([70000, 70000])
  })
  it('rechaza: conjunto vacío, cliente cruzado, sin valorizar', () => {
    expect(construirFotoPropuesta([], CLIENTE)).toBeNull()
    expect(construirFotoPropuesta([act('a1', { cliente_id: 'otro' })], CLIENTE)).toBeNull()
    expect(construirFotoPropuesta([act('a1'), act('a2', { lineas: [], total: 0 })], CLIENTE)).toBeNull()
  })
  it('esquema aiu del cliente usa sus defaults', () => {
    const cli = { id: 'cliA', condiciones_comerciales: { esquema_impuestos: 'aiu', aiu_defaults: { admin: 10, imprevistos: 6, utilidad: 8 } } } as Cliente
    const foto = construirFotoPropuesta([act('a1')], cli)!
    expect(foto.aiu).toEqual({ admin: 10, imprevistos: 6, utilidad: 8 })
    expect(foto.totales.admin).toBe(7000)
  })
})

describe('planReemision — invariantes del swap (jamás dos vigentes ni cero)', () => {
  it('nueva vigente v+1, historiza la actual, punteros de entran/salen', () => {
    const plan = planReemision(prop(1, 'vigente', { actividad_ids: ['a1', 'a2', 'a3'] }), ['a2', 'a4'])!
    expect(plan.idNueva).toBe('pea-2026-005_v2')
    expect(plan.versionNueva).toBe(2)
    expect(plan.historizar).toBe('pea-2026-005_v1')
    expect(plan.vincular).toEqual(['a2', 'a4'])
    expect(plan.desvincular.sort()).toEqual(['a1', 'a3'])
  })
  it('solo desde la VIGENTE y jamás con conjunto vacío', () => {
    expect(planReemision(prop(1, 'historica'), ['a1'])).toBeNull()
    expect(planReemision(prop(1, 'vigente'), [])).toBeNull()
  })
})

describe('§6d — evidencia congelada + punteros por builder', () => {
  it('patchAprobar congela {consecutivo, version} de la vigente del momento', () => {
    const patch = patchAprobar(act('a1'), 'u1', ts(), 'correo 18-ago', { consecutivo: 'PEA-2026-005', version: 2 })!
    const apr = (patch as { aprobacion: { propuesta_ref?: unknown; referencia?: string } }).aprobacion
    expect(apr.propuesta_ref).toEqual({ consecutivo: 'PEA-2026-005', version: 2 })
    expect(apr.referencia).toBe('correo 18-ago')
  })
  it('sin propuesta → el hito NO inventa la ref (ausencia honesta)', () => {
    const patch = patchAprobar(act('a1'), 'u1', ts())!
    expect((patch as { aprobacion: Record<string, unknown> }).aprobacion).not.toHaveProperty('propuesta_ref')
  })
  it('patchVincularPropuesta fija ambos punteros; anulada o datos vacíos → null', () => {
    expect(patchVincularPropuesta(act('a1'), 'pea-2026-005_v1', 'PEA-2026-005'))
      .toEqual({ propuesta_id: 'pea-2026-005_v1', propuesta_consecutivo: 'PEA-2026-005' })
    expect(patchVincularPropuesta(act('a1', { anulacion: { fecha: ts(), por: 'u', motivo: 'x' } }), 'x', 'y')).toBeNull()
    expect(patchVincularPropuesta(act('a1'), '', 'PEA-2026-005')).toBeNull()
  })
  it('patchDesvincularPropuesta limpia los punteros (deleteField); sin punteros → null', () => {
    const patch = patchDesvincularPropuesta({ propuesta_id: 'pea-2026-005_v1', propuesta_consecutivo: 'PEA-2026-005' })!
    expect(Object.keys(patch).sort()).toEqual(['propuesta_consecutivo', 'propuesta_id'])
    expect(patchDesvincularPropuesta({})).toBeNull()
  })
})
