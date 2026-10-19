// Tareas de AC/AP (Fase 2) — la forma acordada con el módulo AC/AP.
import { describe, it, expect } from 'vitest'
import type { Timestamp } from 'firebase/firestore'
import {
  construirTareaAcap, motivoInvalidoTareaAcap, esFaseTarea, FASES_TAREA, FASE_TAREA_LABEL,
  balonConsistente, patchIniciarTarea, patchCerrarTarea,
  type DatosTareaAcap, type Tarea,
} from '../tarea'

const ts = (ms: number) => ({ toMillis: () => ms, seconds: ms / 1000 } as unknown as Timestamp)
const AHORA = ts(1_000_000)
const FECHA = ts(2_000_000)
const CREADOR = { uid: 'uid-ingrid', nombre: 'Ingrid' }
const ACTOR = { uid: 'uid-paula', nombre: 'Paula' }

const datos = (extra?: Partial<DatosTareaAcap>): DatosTareaAcap => ({
  titulo: '  Capacitar al equipo en el procedimiento  ',
  responsable: { uid: 'uid-paula', nombre: 'Paula' },
  fechaLimite: FECHA,
  acapId: 'acap-doc-1',
  consecutivo: 'AC-2026-001',
  fase: 'H',
  ...extra,
})

describe('construirTareaAcap', () => {
  it('produce exactamente la forma de la spec: titulo, responsable, fecha_limite, contexto ac_ap y fase', () => {
    const t = construirTareaAcap(datos(), CREADOR, AHORA)!
    expect(t.titulo).toBe('Capacitar al equipo en el procedimiento')
    expect(t.asignada_a).toBe('uid-paula')
    expect(t.asignada_a_nombre).toBe('Paula')
    expect(t.fecha_limite).toBe(FECHA)
    expect(t.contexto).toEqual({ tipo: 'ac_ap', id: 'acap-doc-1', label: 'AC-2026-001' })
    expect(t.fase).toBe('H')
  })

  it('nace como lo exige la regla de create: pendiente, activa, creada_por == creador, asignada por el creador', () => {
    const t = construirTareaAcap(datos(), CREADOR, AHORA)!
    expect(t.estado).toBe('pendiente')
    expect(t.activa).toBe(true)
    expect(t.creada_por).toBe('uid-ingrid')
    expect(t.asignada_por).toBe('uid-ingrid')
    expect(t.asignada_por_nombre).toBe('Ingrid')
    expect(t.fecha_creacion).toBe(AHORA)
    expect(balonConsistente(t.estado, t.balon_en)).toBe(true)
  })

  it('el historial arranca con una entrada que nombra la acción de mejora y la fase', () => {
    const t = construirTareaAcap(datos({ fase: 'V' }), CREADOR, AHORA)!
    expect(t.historial).toHaveLength(1)
    expect(t.historial[0]).toMatchObject({ por: 'uid-ingrid', de: 'pendiente', a: 'pendiente' })
    expect(t.historial[0].nota).toContain('AC-2026-001')
    expect(t.historial[0].nota).toContain('Verificar')
  })

  it('prioridad por defecto media; la descripción solo viaja si trae texto', () => {
    expect(construirTareaAcap(datos(), CREADOR, AHORA)!.prioridad).toBe('media')
    expect(construirTareaAcap(datos({ prioridad: 'alta' }), CREADOR, AHORA)!.prioridad).toBe('alta')
    expect(construirTareaAcap(datos({ descripcion: '   ' }), CREADOR, AHORA)).not.toHaveProperty('descripcion')
    expect(construirTareaAcap(datos({ descripcion: ' detalle ' }), CREADOR, AHORA)!.descripcion).toBe('detalle')
  })

  it('las cuatro fases PHVA son válidas y cualquier otra no', () => {
    expect([...FASES_TAREA]).toEqual(['P', 'H', 'V', 'A'])
    for (const f of FASES_TAREA) {
      expect(esFaseTarea(f)).toBe(true)
      expect(construirTareaAcap(datos({ fase: f }), CREADOR, AHORA)?.fase).toBe(f)
      expect(FASE_TAREA_LABEL[f]).toBeTruthy()
    }
    expect(esFaseTarea('X')).toBe(false)
    expect(esFaseTarea(undefined)).toBe(false)
    expect(construirTareaAcap(datos({ fase: 'X' as never }), CREADOR, AHORA)).toBeNull()
  })

  it('fecha_limite es OBLIGATORIA (decisión 19-oct): sin ella, no hay tarea', () => {
    expect(construirTareaAcap(datos({ fechaLimite: undefined as never }), CREADOR, AHORA)).toBeNull()
    expect(motivoInvalidoTareaAcap(datos({ fechaLimite: undefined as never }), CREADOR)).toMatch(/fecha/i)
  })

  it.each([
    ['título vacío', { titulo: '   ' }],
    ['sin responsable', { responsable: { uid: '', nombre: '' } }],
    ['sin id de la acción', { acapId: ' ' }],
    ['sin consecutivo (acción aún no emitida)', { consecutivo: '' }],
  ] as [string, Partial<DatosTareaAcap>][])('rechaza: %s', (_n, extra) => {
    expect(construirTareaAcap(datos(extra), CREADOR, AHORA)).toBeNull()
    expect(motivoInvalidoTareaAcap(datos(extra), CREADOR)).toBeTruthy()
  })

  it('sin creador no hay tarea', () => {
    expect(construirTareaAcap(datos(), { uid: '', nombre: '' }, AHORA)).toBeNull()
  })

  it('con datos válidos no hay motivo de invalidez', () => {
    expect(motivoInvalidoTareaAcap(datos(), CREADOR)).toBeNull()
  })

  it('la tarea creada se puede operar con los builders existentes (iniciar → cerrar)', () => {
    const t = construirTareaAcap(datos(), CREADOR, AHORA)!
    const ini = patchIniciarTarea(t, ACTOR, AHORA)
    expect(ini?.estado).toBe('en_curso')
    const cierre = patchCerrarTarea({ ...t, ...ini! } as Tarea, ACTOR, AHORA, 'Capacitación realizada')
    expect(cierre?.estado).toBe('hecha')
    expect(cierre?.activa).toBe(false)
  })
})
