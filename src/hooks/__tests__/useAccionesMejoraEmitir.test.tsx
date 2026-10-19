// useAccionesMejora.emitir — el consecutivo se pide a la CF UNA vez y se PRESERVA si el write
// falla (cero huecos en la serie); un número preservado de otro año se descarta; una acción
// incompleta no toca la CF. Firebase y la CF mockeados.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const updateDoc = vi.fn()
const obtener = vi.fn()

vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(), collection: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(), orderBy: vi.fn(), query: vi.fn(),
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
  updateDoc: (...a: unknown[]) => updateDoc(...a),
  Timestamp: {
    now: () => ({ toDate: () => new Date(2026, 9, 19, 10, 0, 0) }),
    fromDate: (d: Date) => ({ toDate: () => d }),
  },
}))
vi.mock('../../firebase/config', () => ({ db: {} }))
vi.mock('../sigp/useConsecutivo', () => ({ useConsecutivo: () => ({ obtener }) }))

import { useAccionesMejora } from '../useAccionesMejora'
import type { AccionMejoraConId } from '../../types/sigp/accionMejora'

const CINCO = { porque_1: 'a', porque_2: 'b', porque_3: 'c', porque_4: 'd', porque_5: 'e' }
const accion = (extra: Partial<AccionMejoraConId> = {}): AccionMejoraConId => ({
  id: 'acc1',
  tipo: 'correctiva',
  fecha_tratamiento: {} as never,
  descripcion_nc: 'Algo falló',
  fuente: 'auditoria',
  estado: 'borrador',
  consecutivo: null,
  causa_raiz: CINCO,
  creado_por: 'u1',
  fecha_creacion: {} as never,
  historial: [],
  ...extra,
} as AccionMejoraConId)
const ACTOR = { uid: 'u1', nombre: 'Ingrid' }

beforeEach(() => { updateDoc.mockReset(); obtener.mockReset() })

describe('useAccionesMejora.emitir', () => {
  it('pide el consecutivo con el prefijo del tipo y lo escribe junto al estado en UN update', async () => {
    obtener.mockResolvedValue('AC-2026-004')
    updateDoc.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAccionesMejora())
    const r = await result.current.emitir(accion(), ACTOR)
    expect(r).toEqual({ ok: true, consecutivo: 'AC-2026-004' })
    expect(obtener).toHaveBeenCalledWith('AC')
    expect(updateDoc).toHaveBeenCalledTimes(1)
    const [ref, patch] = updateDoc.mock.calls[0]
    expect(ref).toEqual({ path: 'acciones_mejora/acc1' })
    expect(patch).toMatchObject({ estado: 'abierta', consecutivo: 'AC-2026-004' })
  })

  it('el prefijo sigue al tipo: preventiva→AP, mejora→MEJ', async () => {
    updateDoc.mockResolvedValue(undefined)
    obtener.mockResolvedValueOnce('AP-2026-001').mockResolvedValueOnce('MEJ-2026-001')
    const { result } = renderHook(() => useAccionesMejora())
    await result.current.emitir(accion({ id: 'p', tipo: 'preventiva' }), ACTOR)
    await result.current.emitir(accion({ id: 'm', tipo: 'mejora' }), ACTOR)
    expect(obtener.mock.calls).toEqual([['AP'], ['MEJ']])
  })

  it('si el write falla LANZA y el reintento REUTILIZA el número (no consume otro)', async () => {
    obtener.mockResolvedValue('AC-2026-005')
    updateDoc.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useAccionesMejora())
    await expect(result.current.emitir(accion(), ACTOR)).rejects.toThrow('red')
    const r = await result.current.emitir(accion(), ACTOR)
    expect(r).toEqual({ ok: true, consecutivo: 'AC-2026-005' })
    expect(obtener).toHaveBeenCalledTimes(1)
    expect(updateDoc).toHaveBeenCalledTimes(2)
    expect(updateDoc.mock.calls[1][1]).toMatchObject({ consecutivo: 'AC-2026-005' })
  })

  it('un número preservado de OTRO año se descarta y se pide uno nuevo', async () => {
    obtener.mockResolvedValueOnce('AC-2025-009').mockResolvedValueOnce('AC-2026-001')
    updateDoc.mockResolvedValue(undefined)
    const { result } = renderHook(() => useAccionesMejora())
    // El 1.º número llega con año anterior al reloj mockeado (2026): patchEmitir lo rechaza
    // (devuelve ok:false sin escribir) y NO queda atascado para los reintentos.
    const r1 = await result.current.emitir(accion(), ACTOR)
    expect(r1.ok).toBe(false)
    const r2 = await result.current.emitir(accion(), ACTOR)
    expect(r2).toEqual({ ok: true, consecutivo: 'AC-2026-001' })
    expect(obtener).toHaveBeenCalledTimes(2)
  })

  it('una acción incompleta devuelve los faltantes y NO llama a la CF ni escribe', async () => {
    const { result } = renderHook(() => useAccionesMejora())
    const r = await result.current.emitir(accion({ causa_raiz: { ...CINCO, porque_3: '' } }), ACTOR)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.faltantes.join(' ')).toContain('¿Por qué? 3')
    expect(obtener).not.toHaveBeenCalled()
    expect(updateDoc).not.toHaveBeenCalled()
  })

  it('una acción que no es borrador no se emite', async () => {
    const { result } = renderHook(() => useAccionesMejora())
    const r = await result.current.emitir(accion({ estado: 'abierta', consecutivo: 'AC-2026-001' }), ACTOR)
    expect(r.ok).toBe(false)
    expect(obtener).not.toHaveBeenCalled()
  })
})
