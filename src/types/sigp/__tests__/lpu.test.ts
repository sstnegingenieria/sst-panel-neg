import { describe, it, expect } from 'vitest'
import { lpuVigente, type LPU } from '../lpu'

// Fábrica mínima — solo los campos que la resolución usa.
const lpu = (p: Partial<LPU> & { id: string }): LPU => ({
  cliente_id: 'cli-1', nombre: p.id, moneda: 'COP', estado: 'vigente',
  version: 1, fecha_importacion: null as never, total_items: 0, categorias: [],
  ...p,
} as LPU)

describe('lpuVigente — resolución consolidada por alcance (C1.1)', () => {
  it('sin alcance y UNA vigente → esa (compat total con el comportamiento histórico)', () => {
    const lista = [lpu({ id: 'a' }), lpu({ id: 'b', estado: 'historica' })]
    expect(lpuVigente(lista, 'cli-1')?.id).toBe('a')
  })

  it('filtra por cliente y por estado', () => {
    const lista = [lpu({ id: 'otra', cliente_id: 'cli-2' }), lpu({ id: 'hist', estado: 'historica' })]
    expect(lpuVigente(lista, 'cli-1')).toBeNull()
  })

  it('con alcance → match EXACTO de contrato + naturaleza', () => {
    const lista = [
      lpu({ id: 'opex', contrato: 'Marco 2026', naturaleza: 'opex' }),
      lpu({ id: 'capex', contrato: 'Marco 2026', naturaleza: 'capex' }),
    ]
    expect(lpuVigente(lista, 'cli-1', { contrato: 'Marco 2026', naturaleza: 'opex' })?.id).toBe('opex')
    expect(lpuVigente(lista, 'cli-1', { contrato: 'Marco 2026', naturaleza: 'capex' })?.id).toBe('capex')
    expect(lpuVigente(lista, 'cli-1', { contrato: 'Otro', naturaleza: 'opex' })).toBeNull()
  })

  it('el alcance parcial exige coincidencia exacta (una lista solo-naturaleza no matchea contrato+naturaleza)', () => {
    const lista = [lpu({ id: 'solo-nat', naturaleza: 'opex' })]
    expect(lpuVigente(lista, 'cli-1', { naturaleza: 'opex' })?.id).toBe('solo-nat')
    expect(lpuVigente(lista, 'cli-1', { contrato: 'Marco', naturaleza: 'opex' })).toBeNull()
  })

  it('varias vigentes CON alcance y pedido SIN alcance → null salvo que haya una única sin alcance', () => {
    const conAlcance = [
      lpu({ id: 'opex', naturaleza: 'opex' }),
      lpu({ id: 'capex', naturaleza: 'capex' }),
    ]
    expect(lpuVigente(conAlcance, 'cli-1')).toBeNull()          // ambigua → el caller pide alcance
    const mixta = [...conAlcance, lpu({ id: 'legacy' })]
    expect(lpuVigente(mixta, 'cli-1')?.id).toBe('legacy')       // la única sin alcance resuelve
  })

  it('una LPU sin alcance NO matchea un alcance pedido (no hay comodines)', () => {
    const lista = [lpu({ id: 'legacy' })]
    expect(lpuVigente(lista, 'cli-1', { naturaleza: 'opex' })).toBeNull()
  })
})
