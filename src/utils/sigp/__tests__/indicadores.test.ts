import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  semaforoPlan, semaforoCalidad, semaforoPresupuesto, semaforoSst,
  indPlanTrabajo, indCalidad, indPresupuesto, indSatisfaccion, indSst,
  proyectosPorEstado, preventivosDelMes, ultimosPeriodos, enPeriodo,
} from '../indicadores'
import type { Proyecto } from '../../../types/sigp/proyecto'
import type { Solicitud } from '../../../types/sigp/solicitud'

const P: { anio: number; mes: number } = { anio: 2026, mes: 7 }
const tsJul = Timestamp.fromDate(new Date('2026-07-15T12:00:00'))
const tsJun = Timestamp.fromDate(new Date('2026-06-15T12:00:00'))

const proyecto = (over: Partial<Proyecto>): Proyecto => ({
  id: 'x', consecutivo: 'PRY-2026-001', origen: 'cotizacion',
  snapshot: { cliente: 'C', asunto: 'A', valor_venta: 100, esquema_tributario: 'iva_pleno', alcance: [], total_items: 0 },
  estado: 'en_ejecucion', historial: [], creado_por: 'u', fecha_creacion: tsJul,
  ...over,
} as Proyecto)

describe('semáforos (metas de la caracterización)', () => {
  it('plan 80–100 verde; presupuesto 90–110 verde con ámbar simétrico; SST ≥95', () => {
    expect(semaforoPlan(85)).toBe('verde')
    expect(semaforoPlan(70)).toBe('ambar')
    expect(semaforoPlan(50)).toBe('rojo')
    expect(semaforoCalidad(92)).toBe('verde')
    expect(semaforoCalidad(80)).toBe('ambar')
    expect(semaforoCalidad(60)).toBe('rojo')
    expect(semaforoPresupuesto(100)).toBe('verde')
    expect(semaforoPresupuesto(85)).toBe('ambar')
    expect(semaforoPresupuesto(115)).toBe('ambar')
    expect(semaforoPresupuesto(130)).toBe('rojo')
    expect(semaforoPresupuesto(60)).toBe('rojo')
    expect(semaforoSst(96)).toBe('verde')
    expect(semaforoSst(90)).toBe('ambar')
    expect(semaforoSst(80)).toBe('rojo')
  })
})

describe('indicadores oficiales', () => {
  it('ind1 — actividades ejecutadas/programadas sobre proyectos en gestión', () => {
    const ps = [
      proyecto({ actividades_plan: [{ nombre: 'a', ejecutada: true }, { nombre: 'b', ejecutada: false }] }),
      proyecto({ id: 'y', actividades_plan: [{ nombre: 'c', ejecutada: true }] }),
      // cerrado: NO cuenta
      proyecto({ id: 'z', estado: 'cerrado', actividades_plan: [{ nombre: 'd', ejecutada: false }] }),
    ]
    const r = indPlanTrabajo(ps)
    expect(r.numerador).toBe(2)
    expect(r.denominador).toBe(3)
    expect(r.valor).toBeCloseTo(66.67, 1)
    expect(r.semaforo).toBe('ambar')
  })

  it('ind1 — sin planes → sin datos', () => {
    expect(indPlanTrabajo([proyecto({})]).valor).toBeNull()
  })

  it('ind2 — entregas del periodo con calificación ≥4', () => {
    const ps = [
      proyecto({ entrega: { fecha: tsJul, registrada_por: 'u', calificacion_calidad: 5 } }),
      proyecto({ id: 'y', entrega: { fecha: tsJul, registrada_por: 'u', calificacion_calidad: 3 } }),
      // de otro mes: NO cuenta en julio
      proyecto({ id: 'z', entrega: { fecha: tsJun, registrada_por: 'u', calificacion_calidad: 5 } }),
    ]
    const r = indCalidad(ps, P)
    expect(r.numerador).toBe(1)
    expect(r.denominador).toBe(2)
    expect(r.valor).toBe(50)
    expect(r.semaforo).toBe('rojo')
    // junio solo tiene la de 5/5 → 100 %
    expect(indCalidad(ps, { anio: 2026, mes: 6 }).valor).toBe(100)
  })

  it('ind3 — Σ ejecutado / Σ proyectado', () => {
    const ps = [
      proyecto({
        snapshot: { cliente: 'C', asunto: 'A', valor_venta: 1000, esquema_tributario: 'iva_pleno', alcance: [], total_items: 0 },
        preliquidacion: { valor_venta: 1000, valor_contratista: 700, anticipo_pct: 50, definida_por: 'u', fecha_definicion: tsJul, costo_ejecutado: 950 },
      }),
    ]
    const r = indPresupuesto(ps)
    expect(r.valor).toBe(95)
    expect(r.semaforo).toBe('verde')
    // sin costo ejecutado → sin datos
    expect(indPresupuesto([proyecto({})]).valor).toBeNull()
  })

  it('ind4 — encuestas del periodo ≥4', () => {
    const ps = [
      proyecto({ evaluacion_cliente: { satisfaccion: 5, fecha: tsJul, por: 'u' } }),
      proyecto({ id: 'y', evaluacion_cliente: { satisfaccion: 4, fecha: tsJul, por: 'u' } }),
    ]
    const r = indSatisfaccion(ps, P)
    expect(r.valor).toBe(100)
    expect(r.semaforo).toBe('verde')
  })

  it('ind5 — manual: null → sin datos; valor → semáforo SST', () => {
    expect(indSst(null).valor).toBeNull()
    expect(indSst(96).semaforo).toBe('verde')
    expect(indSst(80).semaforo).toBe('rojo')
  })
})

describe('capa operativa', () => {
  it('agrupa proyectos por estado y cuenta preventivos del mes', () => {
    const ps = [
      proyecto({}), proyecto({ id: 'y' }),
      proyecto({ id: 'p1', origen: 'preventivo', estado: 'en_ejecucion' }),
      proyecto({
        id: 'p2', origen: 'preventivo', estado: 'ejecutado',
        entregables_ihs: {
          inventario_antenas: { estado: 'diligenciado' },
          linea_vida: { estado: 'diligenciado' },
          torque: { estado: 'diligenciado' },
        },
      }),
    ]
    expect(proyectosPorEstado(ps)['en_ejecucion']).toBe(3)
    const sols = [
      { tipo: 'preventivo', estado: 'aceptada', fecha_creacion: tsJul },
      { tipo: 'preventivo', estado: 'recibida', fecha_creacion: tsJul },
      { tipo: 'preventivo', estado: 'aceptada', fecha_creacion: tsJun },  // otro mes
    ] as unknown as Solicitud[]
    const r = preventivosDelMes(sols, ps, P)
    expect(r.programados).toBe(2)
    expect(r.ejecutados).toBe(1)
    expect(r.aceptados).toBe(1)
    expect(r.pendientes).toBe(1)
    expect(r.enEjecucion).toBe(1)
    expect(r.entregablesOk).toBe(1)
  })

  it('ultimosPeriodos cruza el cambio de año y enPeriodo filtra por mes', () => {
    const per = ultimosPeriodos({ anio: 2026, mes: 2 }, 4)
    expect(per).toEqual([
      { anio: 2025, mes: 11 }, { anio: 2025, mes: 12 }, { anio: 2026, mes: 1 }, { anio: 2026, mes: 2 },
    ])
    expect(enPeriodo(tsJul, P)).toBe(true)
    expect(enPeriodo(tsJun, P)).toBe(false)
    expect(enPeriodo(undefined, P)).toBe(false)
  })
})
