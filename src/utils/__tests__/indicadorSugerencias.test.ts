import { describe, it, expect } from 'vitest'
import {
  esPatronConocido, PATRONES_CONOCIDOS, resolverDenominador, SUGERENCIA_DENOMINADOR,
} from '../indicadorSugerencias'
import { SEED_PATRONES } from '../../types/indicador'
import { derivarNumDen } from '../indicadoresRegistros'

describe('resolverDenominador', () => {
  it('sin medición guardada, la sugerencia pre-llena el campo', () => {
    expect(resolverDenominador(undefined, 12)).toEqual({ inicial: '12', ofrecer: null })
  })

  it('sin medición y sin sugerencia (rol sin acceso al maestro / error) → campo manual vacío', () => {
    expect(resolverDenominador(undefined, null)).toEqual({ inicial: '', ofrecer: null })
  })

  it('con medición guardada se RESPETA lo guardado y se ofrece el valor del maestro si difiere', () => {
    expect(resolverDenominador(10, 12)).toEqual({ inicial: '10', ofrecer: 12 })
  })

  it('con medición guardada igual al maestro no se ofrece nada', () => {
    expect(resolverDenominador(12, 12)).toEqual({ inicial: '12', ofrecer: null })
  })

  it('con medición guardada y sin sugerencia se conserva lo guardado', () => {
    expect(resolverDenominador(9, null)).toEqual({ inicial: '9', ofrecer: null })
  })

  it('un 0 guardado es un valor guardado (no se confunde con "sin dato")', () => {
    expect(resolverDenominador(0, 5)).toEqual({ inicial: '0', ofrecer: 5 })
  })

  it('una sugerencia no finita o negativa se ignora', () => {
    expect(resolverDenominador(undefined, Number.NaN)).toEqual({ inicial: '', ofrecer: null })
    expect(resolverDenominador(undefined, -1)).toEqual({ inicial: '', ofrecer: null })
  })
})

describe('patrones', () => {
  it("'ratio' ya no es un patrón: un doc viejo cae al formulario manual", () => {
    expect(esPatronConocido('ratio')).toBe(false)
    expect(esPatronConocido(undefined)).toBe(false)
    expect(esPatronConocido('')).toBe(false)
    for (const p of PATRONES_CONOCIDOS) expect(esPatronConocido(p)).toBe(true)
  })

  it('SST-IND-06 ya no se siembra con patrón (el botón no lo puede restaurar)', () => {
    expect(SEED_PATRONES.find(s => s.codigo === 'SST-IND-06')).toBeUndefined()
  })

  it('un doc de SST-IND-06 que aún diga patron:ratio no deriva nada de bitácora', () => {
    const viejo = { patron: 'ratio', config: { total_trabajadores: 10 } } as unknown as Parameters<typeof derivarNumDen>[0]
    expect(derivarNumDen(viejo, [])).toBeNull()
  })
})

describe('sugerencia por código', () => {
  it('SST-IND-06 sugiere desde los empleados activos y ningún otro indicador lo hace', () => {
    expect(SUGERENCIA_DENOMINADOR).toEqual({ 'SST-IND-06': 'empleados_activos' })
  })
})
