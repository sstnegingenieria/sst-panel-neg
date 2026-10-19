// useTareasDeContexto — la consulta de vuelta del módulo AC/AP (con firebase mockeado).
// Fija: dos igualdades (contexto.tipo + contexto.id, sin índice compuesto), NO se filtra
// por `activa` (AC/AP quiere el histórico), agrupación por fase y limpieza al desmontar.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const wheres: unknown[][] = []
let onNext: ((snap: { docs: { id: string; data: () => unknown }[] }) => void) | null = null
let onErr: (() => void) | null = null
const unsub = vi.fn()

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, name: string) => ({ __col: name }),
  where: (...args: unknown[]) => { wheres.push(args); return { __where: args } },
  query: (...parts: unknown[]) => ({ __query: parts }),
  onSnapshot: (_q: unknown, next: typeof onNext, err: typeof onErr) => { onNext = next; onErr = err; return unsub },
}))
vi.mock('../../firebase/config', () => ({ db: {} }))

import { useTareasDeContexto } from '../sigp/useTareasDeContexto'

const ts = (ms: number) => ({ toMillis: () => ms, toDate: () => new Date(ms) })
const snap = (docs: Record<string, unknown>[]) => ({
  docs: docs.map((d, i) => ({ id: `t${i}`, data: () => d })),
})

beforeEach(() => { wheres.length = 0; onNext = null; onErr = null; unsub.mockClear() })

describe('useTareasDeContexto', () => {
  it('consulta por contexto.tipo y contexto.id (dos igualdades) y NO filtra por activa', () => {
    renderHook(() => useTareasDeContexto('ac_ap', 'acap-9'))
    expect(wheres).toEqual([
      ['contexto.tipo', '==', 'ac_ap'],
      ['contexto.id', '==', 'acap-9'],
    ])
    expect(wheres.some(w => w[0] === 'activa')).toBe(false)
  })

  it('entrega las tareas agrupadas por fase (incluye terminales y sin fase)', () => {
    const { result } = renderHook(() => useTareasDeContexto('ac_ap', 'acap-9'))
    expect(result.current.loading).toBe(true)
    act(() => onNext!(snap([
      { titulo: 'h', fase: 'H', estado: 'pendiente', fecha_limite: ts(30) },
      { titulo: 'p2', fase: 'P', estado: 'hecha', activa: false, fecha_limite: ts(20) },
      { titulo: 'p1', fase: 'P', estado: 'pendiente', fecha_limite: ts(10) },
      { titulo: 'sf', estado: 'pendiente' },
    ])))
    expect(result.current.loading).toBe(false)
    expect(result.current.tareas).toHaveLength(4)
    expect(result.current.porFase.P.map(t => t.titulo)).toEqual(['p1', 'p2'])
    expect(result.current.porFase.H.map(t => t.titulo)).toEqual(['h'])
    expect(result.current.porFase.V).toEqual([])
    expect(result.current.porFase.sinFase.map(t => t.titulo)).toEqual(['sf'])
  })

  it('sin id de contexto no se suscribe ni queda cargando', () => {
    const { result } = renderHook(() => useTareasDeContexto('ac_ap', undefined))
    expect(onNext).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.tareas).toEqual([])
  })

  it('un error de la consulta degrada a lista vacía con error=true', () => {
    const { result } = renderHook(() => useTareasDeContexto('ac_ap', 'acap-9'))
    act(() => onErr!())
    expect(result.current.error).toBe(true)
    expect(result.current.loading).toBe(false)
    expect(result.current.tareas).toEqual([])
  })

  it('al desmontar se cancela la suscripción', () => {
    const { unmount } = renderHook(() => useTareasDeContexto('ac_ap', 'acap-9'))
    unmount()
    expect(unsub).toHaveBeenCalledTimes(1)
  })
})
