// Metas ISO configurables (21-sep): las fija el SGI en
// configuracion/indicadores.metas_iso; el ancho del tramo ámbar es FIJO
// por indicador (20/15/10/10 puntos bajo la meta — la geometría de la
// alerta no se configura). Sin config → defaults de la Caracterización,
// que los tests históricos de indicadores.test.ts fijan sin parámetro.
import { describe, it, expect } from 'vitest'
import {
  METAS_ISO_DEFAULT, metasIsoDe,
  semaforoPlan, semaforoCalidad, semaforoPresupuesto, semaforoSst,
  indSst,
} from '../indicadores'

describe('metasIsoDe — metas efectivas con saneo', () => {
  it('sin config → defaults de la Caracterización', () => {
    expect(metasIsoDe(null)).toEqual(METAS_ISO_DEFAULT)
    expect(metasIsoDe({})).toEqual(METAS_ISO_DEFAULT)
  })

  it('merge parcial: solo lo configurado cambia', () => {
    const m = metasIsoDe({ metas_iso: { sst_min: 90 } })
    expect(m.sst_min).toBe(90)
    expect(m.calidad_min).toBe(METAS_ISO_DEFAULT.calidad_min)
  })

  it('valor inválido (0, negativo, NaN, >200, no numérico) cae al default de SU campo', () => {
    const m = metasIsoDe({ metas_iso: {
      plan_min: 0, calidad_min: -5, sst_min: Number.NaN,
      satisfaccion_min: 300, presupuesto_min: '95' as unknown as number,
    } })
    expect(m).toEqual(METAS_ISO_DEFAULT)
  })

  it('banda del presupuesto invertida (min ≥ max) → la banda COMPLETA vuelve al default', () => {
    const m = metasIsoDe({ metas_iso: { presupuesto_min: 120, presupuesto_max: 100 } })
    expect(m.presupuesto_min).toBe(90)
    expect(m.presupuesto_max).toBe(110)
  })
})

describe('semáforos con meta configurada — el ámbar conserva su ancho', () => {
  it('plan: meta 70 → verde ≥70, ámbar [50,70), rojo <50', () => {
    expect(semaforoPlan(70, 70)).toBe('verde')
    expect(semaforoPlan(69.9, 70)).toBe('ambar')
    expect(semaforoPlan(50, 70)).toBe('ambar')
    expect(semaforoPlan(49.9, 70)).toBe('rojo')
  })

  it('calidad: meta 95 → verde ≥95, ámbar [80,95)', () => {
    expect(semaforoCalidad(95, 95)).toBe('verde')
    expect(semaforoCalidad(94, 95)).toBe('ambar')
    expect(semaforoCalidad(79.9, 95)).toBe('rojo')
  })

  it('presupuesto: banda 85–115 → verde dentro, ámbar 10 puntos por fuera', () => {
    expect(semaforoPresupuesto(85, 85, 115)).toBe('verde')
    expect(semaforoPresupuesto(115, 85, 115)).toBe('verde')
    expect(semaforoPresupuesto(80, 85, 115)).toBe('ambar')
    expect(semaforoPresupuesto(120, 85, 115)).toBe('ambar')
    expect(semaforoPresupuesto(74.9, 85, 115)).toBe('rojo')
    expect(semaforoPresupuesto(125.1, 85, 115)).toBe('rojo')
  })

  it('sst: meta 90 → verde ≥90, ámbar [80,90)', () => {
    expect(semaforoSst(90, 90)).toBe('verde')
    expect(semaforoSst(89, 90)).toBe('ambar')
    expect(semaforoSst(79.9, 90)).toBe('rojo')
  })

  it('sin parámetro → EXACTAMENTE el comportamiento histórico (regresión)', () => {
    expect(semaforoPlan(80)).toBe('verde')
    expect(semaforoCalidad(89.9)).toBe('ambar')
    expect(semaforoPresupuesto(110.1)).toBe('ambar')
    expect(semaforoSst(94.9)).toBe('ambar')
  })
})

describe('ind* con metas — el valor no cambia, el semáforo sí', () => {
  it('indSst 92%: rojo con la meta default (95), verde con meta 90', () => {
    const conDefault = indSst(92)
    const conMeta = indSst(92, { ...METAS_ISO_DEFAULT, sst_min: 90 })
    expect(conDefault.valor).toBe(92)
    expect(conMeta.valor).toBe(92)
    expect(conDefault.semaforo).toBe('ambar')
    expect(conMeta.semaforo).toBe('verde')
  })
})
