import { describe, it, expect } from 'vitest'
import type { Timestamp } from 'firebase/firestore'
import {
  esTareaVencida, diasDeVencida, agruparPorFase, rutaContexto,
} from '../tareasUi'
import type { TareaConId, EstadoTarea, FaseTarea } from '../../../types/sigp/tarea'

// Timestamp mínimo: toDate + toMillis (lo que tareasUi lee).
const ts = (d: Date) => ({ toDate: () => d, toMillis: () => d.getTime() } as unknown as Timestamp)
const AHORA = new Date(2026, 9, 19, 15, 30)              // 19-oct-2026 15:30 local
const dia = (offset: number, h = 12) => new Date(2026, 9, 19 + offset, h)

const tarea = (extra: Partial<TareaConId> & { estado?: EstadoTarea } = {}): TareaConId => ({
  id: 't1', titulo: 'Actividad', asignada_a: 'u', asignada_a_nombre: 'U',
  asignada_por: 'g', asignada_por_nombre: 'G', creada_por: 'g',
  estado: 'pendiente', activa: true, prioridad: 'media',
  fecha_creacion: ts(dia(-30)), historial: [],
  ...extra,
} as TareaConId)

describe('esTareaVencida — el DÍA de la fecha límite ya pasó', () => {
  it('vence hoy → todavía NO está vencida (hasta mañana)', () => {
    expect(esTareaVencida({ estado: 'pendiente', fecha_limite: ts(dia(0, 9)) }, AHORA)).toBe(false)
    expect(esTareaVencida({ estado: 'pendiente', fecha_limite: ts(dia(0, 23)) }, AHORA)).toBe(false)
  })
  it('venció ayer → vencida, sin importar la hora', () => {
    expect(esTareaVencida({ estado: 'pendiente', fecha_limite: ts(dia(-1, 23)) }, AHORA)).toBe(true)
    expect(esTareaVencida({ estado: 'en_curso', fecha_limite: ts(dia(-1, 1)) }, AHORA)).toBe(true)
  })
  it('futura → no', () => {
    expect(esTareaVencida({ estado: 'pendiente', fecha_limite: ts(dia(3)) }, AHORA)).toBe(false)
  })
  it('EN ESPERA (balón pasado) también vence — el plazo no se pausa (decisión 19-oct)', () => {
    expect(esTareaVencida({ estado: 'en_espera', fecha_limite: ts(dia(-5)) }, AHORA)).toBe(true)
  })
  it('las terminales (hecha/anulada) nunca están vencidas', () => {
    expect(esTareaVencida({ estado: 'hecha', fecha_limite: ts(dia(-30)) }, AHORA)).toBe(false)
    expect(esTareaVencida({ estado: 'anulada', fecha_limite: ts(dia(-30)) }, AHORA)).toBe(false)
  })
  it('sin fecha límite o con fecha ilegible → no vencida', () => {
    expect(esTareaVencida({ estado: 'pendiente' }, AHORA)).toBe(false)
    expect(esTareaVencida({ estado: 'pendiente', fecha_limite: ts(new Date('x')) }, AHORA)).toBe(false)
    expect(esTareaVencida({ estado: 'pendiente', fecha_limite: 'no-es-timestamp' }, AHORA)).toBe(false)
  })
  it('cruce de medianoche: a las 00:05 del día siguiente la del día anterior ya está vencida', () => {
    const limite = ts(new Date(2026, 9, 19, 12))
    expect(esTareaVencida({ estado: 'pendiente', fecha_limite: limite }, new Date(2026, 9, 19, 23, 59))).toBe(false)
    expect(esTareaVencida({ estado: 'pendiente', fecha_limite: limite }, new Date(2026, 9, 20, 0, 5))).toBe(true)
  })
})

describe('diasDeVencida', () => {
  it('cuenta días completos de atraso; 0 si no está vencida', () => {
    expect(diasDeVencida({ estado: 'pendiente', fecha_limite: ts(dia(-1)) }, AHORA)).toBe(1)
    expect(diasDeVencida({ estado: 'pendiente', fecha_limite: ts(dia(-10, 8)) }, AHORA)).toBe(10)
    expect(diasDeVencida({ estado: 'pendiente', fecha_limite: ts(dia(0)) }, AHORA)).toBe(0)
    expect(diasDeVencida({ estado: 'hecha', fecha_limite: ts(dia(-10)) }, AHORA)).toBe(0)
  })
})

describe('agruparPorFase — P · H · V · A (+ sin fase)', () => {
  it('agrupa por fase, cada grupo por fecha límite ascendente', () => {
    const g = agruparPorFase([
      tarea({ id: 'h2', fase: 'H', fecha_limite: ts(dia(9)) }),
      tarea({ id: 'p1', fase: 'P', fecha_limite: ts(dia(2)) }),
      tarea({ id: 'h1', fase: 'H', fecha_limite: ts(dia(4)) }),
      tarea({ id: 'a1', fase: 'A', fecha_limite: ts(dia(30)) }),
      tarea({ id: 'v1', fase: 'V', fecha_limite: ts(dia(20)) }),
    ])
    expect(g.P.map(t => t.id)).toEqual(['p1'])
    expect(g.H.map(t => t.id)).toEqual(['h1', 'h2'])
    expect(g.V.map(t => t.id)).toEqual(['v1'])
    expect(g.A.map(t => t.id)).toEqual(['a1'])
    expect(g.sinFase).toEqual([])
  })
  it('sin fecha límite va al final de su grupo', () => {
    const g = agruparPorFase([
      tarea({ id: 'sin', fase: 'P' }),
      tarea({ id: 'con', fase: 'P', fecha_limite: ts(dia(1)) }),
    ])
    expect(g.P.map(t => t.id)).toEqual(['con', 'sin'])
  })
  it('fase ausente o inválida → sinFase (no se pierde ninguna)', () => {
    const g = agruparPorFase([
      tarea({ id: 'x1' }),
      tarea({ id: 'x2', fase: 'Z' as unknown as FaseTarea }),
    ])
    expect(g.sinFase.map(t => t.id).sort()).toEqual(['x1', 'x2'])
    expect(g.P.length + g.H.length + g.V.length + g.A.length).toBe(0)
  })
  it('incluye las terminales (AC/AP quiere el histórico)', () => {
    const g = agruparPorFase([
      tarea({ id: 'hecha', fase: 'P', estado: 'hecha', activa: false }),
      tarea({ id: 'viva', fase: 'P' }),
    ])
    expect(g.P).toHaveLength(2)
  })
  it('lista vacía → todos los grupos vacíos', () => {
    expect(agruparPorFase([])).toEqual({ P: [], H: [], V: [], A: [], sinFase: [] })
  })
})

describe('rutaContexto', () => {
  it('ac_ap se enlaza SOLO para GI y admin (quien puede abrir AC/AP)', () => {
    const c = { tipo: 'ac_ap' as const, id: 'acap-1', label: 'AC-2026-001' }
    expect(rutaContexto(c, 'gestion_integral')).toBe('/acciones-mejora/acap-1')
    expect(rutaContexto(c, 'admin')).toBe('/acciones-mejora/acap-1')
    for (const rol of ['sst', 'gerencia_general', 'gerencia_administrativa', 'director_proyectos',
      'auxiliar_proyectos', 'operacion_comercial', 'residente_sst', undefined]) {
      expect(rutaContexto(c, rol)).toBeNull()
    }
  })
  it('los demás tipos conservan su ruta (ruta_id manda sobre id)', () => {
    expect(rutaContexto({ tipo: 'proyecto', id: 'p1', label: 'x' })).toBe('/sigp/proyectos/p1')
    expect(rutaContexto({ tipo: 'orden_compra', id: 'oc1', ruta_id: 'p9', label: 'x' })).toBe('/sigp/proyectos/p9')
    expect(rutaContexto({ tipo: 'cotizacion', id: 'c1', label: 'x' })).toBe('/sigp/cotizaciones/c1')
    expect(rutaContexto({ tipo: 'otro', id: 'o', label: 'x' })).toBeNull()
  })
})
