import { describe, expect, it } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { agruparPorMes, derivarNumDen } from '../indicadoresRegistros'
import type { IndicadorRegistro } from '../../types/indicador'

function registro(patron: IndicadorRegistro['patron'], data: Record<string, unknown>): IndicadorRegistro {
  return {
    id: Math.random().toString(36),
    indicador_id: 'ind1',
    periodo: '2026',
    patron,
    data,
    registrado_por: 'uid1',
    fecha_registro: Timestamp.now(),
  }
}

describe('derivarNumDen', () => {
  it('devuelve null si el indicador no tiene patron/config (F1 sin pilotar)', () => {
    expect(derivarNumDen({}, [])).toBeNull()
    expect(derivarNumDen({ patron: 'checklist' }, [])).toBeNull()
  })

  it('checklist: numerador = criterios marcados cumple, denominador = total de criterios', () => {
    const config = { criterios: [{ id: '1', texto: 'a' }, { id: '2', texto: 'b' }, { id: '3', texto: 'c' }] }
    const registros = [
      registro('checklist', { criterio_id: '1', cumple: true }),
      registro('checklist', { criterio_id: '2', cumple: false }),
    ]
    expect(derivarNumDen({ patron: 'checklist', config }, registros)).toEqual({ numerador: 1, denominador: 3 })
  })

  it('checklist: marcar el mismo criterio dos veces no lo cuenta doble', () => {
    const config = { criterios: [{ id: '1', texto: 'a' }] }
    const registros = [
      registro('checklist', { criterio_id: '1', cumple: true }),
      registro('checklist', { criterio_id: '1', cumple: true }),
    ]
    expect(derivarNumDen({ patron: 'checklist', config }, registros)).toEqual({ numerador: 1, denominador: 1 })
  })

  it('plan: numerador = ejecutadas, denominador = total de actividades', () => {
    const registros = [
      registro('plan', { nombre: 'A', ejecutada: true }),
      registro('plan', { nombre: 'B', ejecutada: false }),
      registro('plan', { nombre: 'C', ejecutada: true }),
    ]
    expect(derivarNumDen({ patron: 'plan', config: {} }, registros)).toEqual({ numerador: 2, denominador: 3 })
  })

  it('plan: sin actividades da denominador 0 (sin dato)', () => {
    expect(derivarNumDen({ patron: 'plan', config: {} }, [])).toEqual({ numerador: 0, denominador: 0 })
  })

  it('registro (Ausentismo): numerador = suma de días, denominador = días programados configurados', () => {
    const config = { dias_programados: 261 }
    const registros = [
      registro('registro', { fecha: '2026-01-10', nombre: 'Juan', tipo: 'laboral', dias: 2 }),
      registro('registro', { fecha: '2026-02-05', nombre: 'Ana', tipo: 'comun', dias: 3 }),
    ]
    expect(derivarNumDen({ patron: 'registro', config }, registros)).toEqual({ numerador: 5, denominador: 261 })
  })

  it('ratio: numerador = # de registros, denominador = total de trabajadores configurado', () => {
    const config = { total_trabajadores: 10 }
    const registros = [
      registro('ratio', { nombre: 'Juan', fecha: '2026-01-10' }),
      registro('ratio', { nombre: 'Ana', fecha: '2026-01-11' }),
    ]
    expect(derivarNumDen({ patron: 'ratio', config }, registros)).toEqual({ numerador: 2, denominador: 10 })
  })
})

describe('agruparPorMes', () => {
  it('suma los días por mes y ordena cronológicamente', () => {
    const registros = [
      registro('registro', { fecha: '2026-03-01', dias: 1 }),
      registro('registro', { fecha: '2026-01-15', dias: 2 }),
      registro('registro', { fecha: '2026-01-20', dias: 3 }),
    ]
    expect(agruparPorMes(registros)).toEqual([
      { mes: '2026-01', dias: 5 },
      { mes: '2026-03', dias: 1 },
    ])
  })

  it('ignora registros sin fecha', () => {
    const registros = [registro('registro', { dias: 2 })]
    expect(agruparPorMes(registros)).toEqual([])
  })
})
