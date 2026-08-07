// §16 (ii) — hook del nacimiento server-side: escucha el doc disparador y
// expone el enlace inverso apenas la CF lo escribe, con timeout SUAVE.
// onSnapshot va mockeado (unitario puro); el flujo real contra la CF viva se
// valida en el E2E de oro del emulador (SB4).
// Vive como HERMANO del hook (no en __tests__/): esa carpeta está excluida
// del `npm test` por defecto — reservada a los tests que exigen emulador.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const listeners: Array<(snap: { data: () => Record<string, unknown> | undefined }) => void> = []
const unsubs: Array<ReturnType<typeof vi.fn>> = []

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, coleccion, id) => ({ path: `${coleccion}/${id}` })),
  onSnapshot: vi.fn((_ref, next: (snap: { data: () => Record<string, unknown> | undefined }) => void) => {
    listeners.push(next)
    const unsub = vi.fn()
    unsubs.push(unsub)
    return unsub
  }),
}))
vi.mock('../../firebase/config', () => ({ db: {} }))

import { onSnapshot } from 'firebase/firestore'
import { useNacimientoProyecto } from './useNacimientoProyecto'

const emitir = (data: Record<string, unknown> | undefined) =>
  act(() => { listeners[listeners.length - 1]({ data: () => data }) })

describe('useNacimientoProyecto — §16 (ii)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    listeners.length = 0
    unsubs.length = 0
    vi.mocked(onSnapshot).mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('esperando=false → ni listener ni timer', () => {
    const { result } = renderHook(() => useNacimientoProyecto('cotizaciones', 'c1', false))
    expect(onSnapshot).not.toHaveBeenCalled()
    expect(result.current).toEqual({ tardando: false })
  })

  it('el enlace aparece → lo expone y el timeout ya no dispara', () => {
    const { result } = renderHook(() => useNacimientoProyecto('cotizaciones', 'c1', true))
    expect(onSnapshot).toHaveBeenCalledTimes(1)
    emitir({ estado: 'aprobada' })                       // aún sin enlace
    expect(result.current.proyectoId).toBeUndefined()
    emitir({ proyecto_id: 'c1', proyecto_consecutivo: 'PRY-2026-009' })
    expect(result.current).toEqual({ proyectoId: 'c1', proyectoConsecutivo: 'PRY-2026-009', tardando: false })
    act(() => { vi.advanceTimersByTime(60_000) })
    expect(result.current.tardando).toBe(false)          // el timer se limpió
  })

  it('sin enlace tras 20 s → tardando=true (timeout SUAVE, listener sigue vivo)', () => {
    const { result } = renderHook(() => useNacimientoProyecto('solicitudes', 's1', true))
    act(() => { vi.advanceTimersByTime(20_000) })
    expect(result.current.tardando).toBe(true)
    // la CF llega tarde → el enlace aparece igual
    emitir({ proyecto_id: 's1', proyecto_consecutivo: 'PRY-2026-010' })
    expect(result.current.proyectoConsecutivo).toBe('PRY-2026-010')
    expect(result.current.tardando).toBe(false)
  })

  it('desmontar limpia el listener', () => {
    const { unmount } = renderHook(() => useNacimientoProyecto('cotizaciones', 'c2', true))
    unmount()
    expect(unsubs[0]).toHaveBeenCalledTimes(1)
  })
})
