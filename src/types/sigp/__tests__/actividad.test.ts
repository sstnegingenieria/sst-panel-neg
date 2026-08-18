// Módulo de Actividades (F1) — motor puro: estados derivados de los dos
// hitos independientes, congelamiento al aprobar, alcance impedido por el
// sistema, línea negociada con despeje de cantidad, y la lista de oro.
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  estadoDe, pendienteParaActa, estaValorizada, totalLineas, lineasCongeladas,
  pendienteDesde, diasPendiente, UMBRAL_PENDIENTE_ACTA_DIAS,
  lpuValidaParaActividad, construirLinea, construirLineaNegociada,
  patchAprobar, patchEjecutar, patchLineas, patchAnular, patchCabecera,
  type Actividad, type LineaActividad,
} from '../actividad'

const ts = () => Timestamp.fromDate(new Date('2026-08-17T10:00:00'))

const LPU_OK = { id: 'lpu1', cliente_id: 'cli1', contrato: 'Obra Civil — 4600023645', naturaleza: 'opex' as const, estado: 'vigente' as const }
const ITEM = { id: 'i1', codigo: '2.0.10', descripcion: 'Resane de muro', unidad: 'm2', valor_unitario: 35000 }

const base = (extra: Partial<Actividad> = {}): Actividad => ({
  id: 'a1', cliente_id: 'cli1', sede_nombre: 'Sede Norte',
  contrato: 'Obra Civil — 4600023645', naturaleza: 'opex',
  descripcion: 'Resane tras filtración', lineas: [], total: 0,
  estado: 'registrada', historial: [], creada_por: 'u1', fecha_creacion: ts(),
  ...extra,
})

const linea = (): LineaActividad =>
  construirLinea(LPU_OK, ITEM, 2, 'medida', base())!

describe('estadoDe — tabla de los dos hitos, sin ramificar', () => {
  const apr = { fecha: ts(), por: 'u1' }
  const eje = { fecha: ts(), por: 'u1' }
  it.each([
    [undefined, undefined, 'registrada'],
    [apr, undefined, 'aprobada'],
    [undefined, eje, 'ejecutada'],
    [apr, eje, 'completa'],
  ] as const)('aprobacion=%j ejecucion=%j → %s', (aprobacion, ejecucion, esperado) => {
    expect(estadoDe({ aprobacion, ejecucion })).toBe(esperado)
  })

  it('anulada gana siempre (terminal)', () => {
    expect(estadoDe({ aprobacion: apr, ejecucion: eje, anulacion: { fecha: ts(), por: 'u1', motivo: 'x' } })).toBe('anulada')
  })
})

describe('pendienteParaActa — la lista de oro ensanchada', () => {
  const eje = { fecha: ts(), por: 'u1' }
  const apr = { fecha: ts(), por: 'u1' }
  const conLineas = { lineas: [linea()], total: 70000 }
  const sinLineas = { lineas: [], total: 0 }

  it('ejecutada SIN aprobar (valorizada) → pendiente para el acta', () => {
    expect(pendienteParaActa({ ejecucion: eje, ...conLineas })).toBe(true)
  })
  it('COMPLETA pero sin valorizar → también pendiente (el agujero de la corrección 4)', () => {
    expect(pendienteParaActa({ aprobacion: apr, ejecucion: eje, ...sinLineas })).toBe(true)
  })
  it('completa y valorizada → lista para el acta (fuera de la lista)', () => {
    expect(pendienteParaActa({ aprobacion: apr, ejecucion: eje, ...conLineas })).toBe(false)
  })
  it('sin ejecutar jamás está en la lista (aprobada o registrada)', () => {
    expect(pendienteParaActa({ aprobacion: apr, ...sinLineas })).toBe(false)
    expect(pendienteParaActa({ ...sinLineas })).toBe(false)
  })
  it('anulada jamás está en la lista', () => {
    expect(pendienteParaActa({ ejecucion: eje, anulacion: { fecha: ts(), por: 'u', motivo: 'x' }, ...conLineas })).toBe(false)
  })
  it('total 0 con líneas cuenta como sin valorizar', () => {
    expect(estaValorizada({ lineas: [linea()], total: 0 })).toBe(false)
  })
})

describe('antigüedad — pendienteDesde / diasPendiente (lo que se vigila es el tiempo, no la pertenencia)', () => {
  const tsDe = (iso: string) => Timestamp.fromDate(new Date(iso))
  const conLineas = { lineas: [linea()], total: 70000 }
  const sinLineas = { lineas: [], total: 0 }
  const creada = tsDe('2026-08-01T08:00:00')

  it('pendiente desde la EJECUCIÓN — el hecho que la mete a la lista', () => {
    const eje = { fecha: tsDe('2026-08-10T09:00:00'), por: 'u1' }
    expect(pendienteDesde({ ejecucion: eje, fecha_creacion: creada, ...conLineas })!.toMillis())
      .toBe(eje.fecha.toMillis())
  })
  it('la aprobación posterior NO mueve el reloj (completa sin valorizar sigue contando desde la ejecución)', () => {
    const eje = { fecha: tsDe('2026-08-10T09:00:00'), por: 'u1' }
    const apr = { fecha: tsDe('2026-08-15T09:00:00'), por: 'u1' }
    expect(pendienteDesde({ aprobacion: apr, ejecucion: eje, fecha_creacion: creada, ...sinLineas })!.toMillis())
      .toBe(eje.fecha.toMillis())
  })
  it('no pendiente → null (completa valorizada, registrada, anulada)', () => {
    const eje = { fecha: tsDe('2026-08-10T09:00:00'), por: 'u1' }
    const apr = { fecha: tsDe('2026-08-11T09:00:00'), por: 'u1' }
    expect(pendienteDesde({ aprobacion: apr, ejecucion: eje, fecha_creacion: creada, ...conLineas })).toBeNull()
    expect(pendienteDesde({ fecha_creacion: creada, ...sinLineas })).toBeNull()
    expect(pendienteDesde({ ejecucion: eje, anulacion: { fecha: ts(), por: 'u', motivo: 'x' }, fecha_creacion: creada, ...conLineas })).toBeNull()
  })
  it('hito sin fecha → cae defensivo a fecha_creacion', () => {
    const eje = { fecha: undefined as unknown as Timestamp, por: 'u1' }
    expect(pendienteDesde({ ejecucion: eje, fecha_creacion: creada, ...conLineas })!.toMillis())
      .toBe(creada.toMillis())
  })
  it('diasPendiente: días completos, 0 el mismo día, null si no aplica', () => {
    const eje = { fecha: tsDe('2026-08-10T09:00:00'), por: 'u1' }
    const a = { ejecucion: eje, fecha_creacion: creada, ...conLineas }
    expect(diasPendiente(a, new Date('2026-08-10T18:00:00'))).toBe(0)
    expect(diasPendiente(a, new Date('2026-08-14T09:00:00'))).toBe(4)
    expect(diasPendiente(a, new Date('2026-11-10T09:00:00'))).toBeGreaterThan(UMBRAL_PENDIENTE_ACTA_DIAS)
    expect(diasPendiente({ fecha_creacion: creada, ...sinLineas }, new Date())).toBeNull()
  })
  it('el umbral es una constante nombrada dentro del ciclo mensual del acta', () => {
    expect(UMBRAL_PENDIENTE_ACTA_DIAS).toBe(30)
  })
})

describe('alcance — el sistema lo impide, no lo advierte', () => {
  it('LPU del alcance exacto → válida', () => {
    expect(lpuValidaParaActividad(LPU_OK, base())).toBe(true)
  })
  it.each([
    ['otro cliente', { ...LPU_OK, cliente_id: 'cli2' }],
    ['otro contrato', { ...LPU_OK, contrato: 'Impermeabilización — 4600023644' }],
    ['otra naturaleza', { ...LPU_OK, naturaleza: 'capex' as const }],
    ['histórica', { ...LPU_OK, estado: 'historica' as never }],
  ])('%s → construirLinea devuelve null', (_n, lpu) => {
    expect(construirLinea(lpu, ITEM, 1, 'medida', base())).toBeNull()
  })
})

describe('línea negociada — despeje de cantidad', () => {
  it('valor acordado / valor unitario = cantidad con precisión completa; total = valor acordado', () => {
    const l = construirLineaNegociada(LPU_OK, ITEM, 500000, base())!
    expect(l.cantidad).toBeCloseTo(500000 / 35000, 10)   // 14.285714…
    expect(l.total).toBe(500000)
    expect(l.origen_cantidad).toBe('negociada')
  })
  it('valor 0 o ítem sin precio → null', () => {
    expect(construirLineaNegociada(LPU_OK, ITEM, 0, base())).toBeNull()
    expect(construirLineaNegociada(LPU_OK, { ...ITEM, valor_unitario: 0 }, 100, base())).toBeNull()
  })
})

describe('builders — ambos órdenes de hitos y derivados', () => {
  it('camino normal: aprobar → ejecutar', () => {
    const a = base()
    const p1 = patchAprobar(a, 'u1', ts(), 'correo del 15-ago')!
    expect(p1.estado).toBe('aprobada')
    const a2 = { ...a, ...p1 } as Actividad
    const p2 = patchEjecutar(a2, 'u2', ts())!
    expect(p2.estado).toBe('completa')
  })

  it('emergencia: ejecutar → aprobar después', () => {
    const a = base()
    const p1 = patchEjecutar(a, 'u1', ts(), 'urgencia nocturna')!
    expect(p1.estado).toBe('ejecutada')
    const a2 = { ...a, ...p1 } as Actividad
    const p2 = patchAprobar(a2, 'u1', ts(), 'FAD-123')!
    expect(p2.estado).toBe('completa')
  })

  it('doble hito o anulada → null (idempotencia dura)', () => {
    const a = base({ aprobacion: { fecha: ts(), por: 'u1' }, estado: 'aprobada' })
    expect(patchAprobar(a, 'u1', ts())).toBeNull()
    const an = base({ anulacion: { fecha: ts(), por: 'u1', motivo: 'x' }, estado: 'anulada' })
    expect(patchEjecutar(an, 'u1', ts())).toBeNull()
    expect(patchAprobar(an, 'u1', ts())).toBeNull()
  })

  it('patchLineas recalcula total y estado (agregar líneas a una ejecutada la puede sacar de sin-valorizar)', () => {
    const a = base({ ejecucion: { fecha: ts(), por: 'u1' }, estado: 'ejecutada' })
    const p = patchLineas(a, [linea()])!
    expect(p.total).toBe(70000)
    expect(p.estado).toBe('ejecutada')
  })

  it('anular exige motivo y es terminal', () => {
    expect(patchAnular(base(), 'u1', ts(), '  ')).toBeNull()
    const p = patchAnular(base(), 'u1', ts(), 'duplicada')!
    expect(p.estado).toBe('anulada')
  })
})

describe('congelamiento al aprobar — cantidad sigue editable', () => {
  const aAprobada = (): Actividad => {
    const l = linea()
    return base({ aprobacion: { fecha: ts(), por: 'u1' }, estado: 'aprobada', lineas: [l], total: l.total })
  }

  it('sin aprobación las líneas se editan/reemplazan libremente', () => {
    const a = base({ lineas: [linea()], total: 70000 })
    expect(lineasCongeladas(a)).toBe(false)
    const otra = construirLinea(LPU_OK, { ...ITEM, id: 'i2', codigo: '2.0.11' }, 1, 'medida', a)!
    expect(patchLineas(a, [otra])).not.toBeNull()
  })

  it('con aprobación: cambiar CANTIDAD (y origen) pasa; el total se re-deriva', () => {
    const a = aAprobada()
    const editada = { ...a.lineas[0], cantidad: 3.5, origen_cantidad: 'medida' as const, total: Math.round(3.5 * 35000) }
    const p = patchLineas(a, [editada])!
    expect(p.total).toBe(122500)
  })

  it('con aprobación: tocar precio/código/descripcion/unidad o agregar/quitar líneas → null', () => {
    const a = aAprobada()
    expect(patchLineas(a, [{ ...a.lineas[0], valor_unitario: 99999, total: Math.round(2 * 99999) }])).toBeNull()
    expect(patchLineas(a, [{ ...a.lineas[0], codigo: 'X' }])).toBeNull()
    expect(patchLineas(a, [])).toBeNull()
    expect(patchLineas(a, [...a.lineas, linea()])).toBeNull()
    // total inconsistente con cantidad × precio también se rechaza
    expect(patchLineas(a, [{ ...a.lineas[0], cantidad: 3, total: 1 }])).toBeNull()
  })
})

describe('cabecera — el alcance no se mueve con líneas cargadas', () => {
  it('editar descripción/sede siempre pasa', () => {
    expect(patchCabecera(base({ lineas: [linea()] }), { descripcion: 'otra' })).not.toBeNull()
  })
  it('cambiar contrato o naturaleza con líneas → null (pertenecen a la LPU del alcance)', () => {
    const a = base({ lineas: [linea()], total: 70000 })
    expect(patchCabecera(a, { naturaleza: 'capex' })).toBeNull()
    expect(patchCabecera(a, { contrato: 'Impermeabilización — 4600023644' })).toBeNull()
    // sin líneas sí se puede
    expect(patchCabecera(base(), { naturaleza: 'capex' })).not.toBeNull()
  })
})

describe('totalLineas', () => {
  it('suma redondeada por línea', () => {
    const l1 = construirLinea(LPU_OK, ITEM, 2, 'medida', base())!
    const l2 = construirLineaNegociada(LPU_OK, { ...ITEM, id: 'i2' }, 123456.7, base())!
    expect(totalLineas([l1, l2])).toBe(70000 + 123457)
  })
})
