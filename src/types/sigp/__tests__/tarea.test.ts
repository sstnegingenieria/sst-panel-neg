import { describe, it, expect } from 'vitest'
import type { Timestamp } from 'firebase/firestore'
import {
  TRANSICIONES_TAREA, puedeTransicionarTarea, esTareaTerminal, balonConsistente,
  patchIniciarTarea, patchPasarBalon, patchDevolverBalon,
  patchCerrarTarea, patchAnularTarea, patchReasignarTarea,
  type Tarea, type EstadoTarea, type BalonTarea, ESTADOS_TAREA,
} from '../tarea'
import { ROLES_VE_TAREAS, ROLES_ASIGNA_TAREAS, veTareasUI, puedeAsignarTareasUI } from '../permisos'

const ts = (ms: number) => ({ toMillis: () => ms, seconds: ms / 1000 } as unknown as Timestamp)
const AHORA = ts(1_000_000)

const base = (extra?: Partial<Tarea>): Tarea => ({
  titulo: 'Enviar informe a Vertis',
  asignada_a: 'uid-paula', asignada_a_nombre: 'Paula',
  asignada_por: 'uid-giovanny', asignada_por_nombre: 'Giovanny',
  creada_por: 'uid-giovanny',
  estado: 'pendiente',
  prioridad: 'media',
  fecha_creacion: AHORA,
  historial: [],
  ...extra,
})

const ACTOR = { uid: 'uid-paula', nombre: 'Paula' }
const BALON: BalonTarea = { uid: 'uid-marcela', nombre: 'Marcela', motivo: 'Confirmar giro', fecha: AHORA }

describe('máquina de estados de tareas', () => {
  it('cubre los 5 estados', () => {
    expect(Object.keys(TRANSICIONES_TAREA).sort()).toEqual([...ESTADOS_TAREA].sort())
  })

  it('hecha y anulada son terminales duros (sin reapertura — decisión SB1)', () => {
    expect(esTareaTerminal('hecha')).toBe(true)
    expect(esTareaTerminal('anulada')).toBe(true)
    for (const a of ESTADOS_TAREA) {
      expect(puedeTransicionarTarea('hecha', a)).toBe(false)
      expect(puedeTransicionarTarea('anulada', a)).toBe(false)
    }
  })

  it('el balón se pasa desde pendiente o en_curso, y desde en_espera solo se vuelve o anula', () => {
    expect(puedeTransicionarTarea('pendiente', 'en_espera')).toBe(true)
    expect(puedeTransicionarTarea('en_curso', 'en_espera')).toBe(true)
    expect(TRANSICIONES_TAREA.en_espera.sort()).toEqual(['anulada', 'en_curso'])
  })
})

describe('invariante del balón: en_espera ⟺ balon_en con uid', () => {
  it('en_espera exige balón con uid', () => {
    expect(balonConsistente('en_espera', BALON)).toBe(true)
    expect(balonConsistente('en_espera', null)).toBe(false)
    expect(balonConsistente('en_espera', { ...BALON, uid: '' })).toBe(false)
  })
  it('fuera de en_espera el balón debe estar limpio', () => {
    for (const e of ['pendiente', 'en_curso', 'hecha', 'anulada'] as EstadoTarea[]) {
      expect(balonConsistente(e, null)).toBe(true)
      expect(balonConsistente(e, undefined)).toBe(true)
      expect(balonConsistente(e, BALON)).toBe(false)
    }
  })
})

describe('patch builders puros', () => {
  it('iniciar: pendiente → en_curso con historial; ilegal desde en_espera/terminales', () => {
    const p = patchIniciarTarea(base(), ACTOR, AHORA)!
    expect(p.estado).toBe('en_curso')
    expect(p.historial).toHaveLength(1)
    expect(p.historial[0]).toMatchObject({ por: 'uid-paula', de: 'pendiente', a: 'en_curso' })
    expect(patchIniciarTarea(base({ estado: 'en_espera', balon_en: BALON }), ACTOR, AHORA)).toBeNull()
    expect(patchIniciarTarea(base({ estado: 'hecha' }), ACTOR, AHORA)).toBeNull()
  })

  it('pasar balón: setea en_espera + balon_en; motivo y destino obligatorios', () => {
    const p = patchPasarBalon(base({ estado: 'en_curso' }), ACTOR, AHORA,
      { uid: 'uid-marcela', nombre: 'Marcela' }, 'Confirmar giro')!
    expect(p.estado).toBe('en_espera')
    expect(p.balon_en).toMatchObject({ uid: 'uid-marcela', motivo: 'Confirmar giro' })
    expect(balonConsistente(p.estado, p.balon_en)).toBe(true)
    expect(p.historial[0].nota).toContain('Marcela')
    expect(patchPasarBalon(base(), ACTOR, AHORA, { uid: 'uid-x', nombre: 'X' }, '   ')).toBeNull()
    expect(patchPasarBalon(base(), ACTOR, AHORA, { uid: '', nombre: '' }, 'motivo')).toBeNull()
    expect(patchPasarBalon(base({ estado: 'hecha' }), ACTOR, AHORA, { uid: 'uid-x', nombre: 'X' }, 'm')).toBeNull()
  })

  it('devolver balón: en_espera → en_curso con balon_en null; ilegal fuera de en_espera', () => {
    const p = patchDevolverBalon(base({ estado: 'en_espera', balon_en: BALON }),
      { uid: 'uid-marcela', nombre: 'Marcela' }, AHORA, 'listo el giro')!
    expect(p.estado).toBe('en_curso')
    expect(p.balon_en).toBeNull()
    expect(balonConsistente(p.estado, p.balon_en)).toBe(true)
    expect(patchDevolverBalon(base({ estado: 'en_curso' }), ACTOR, AHORA)).toBeNull()
  })

  it('cerrar: comentario obligatorio y evidencia si la tarea la exige', () => {
    expect(patchCerrarTarea(base({ estado: 'en_curso' }), ACTOR, AHORA, '  ')).toBeNull()
    expect(patchCerrarTarea(base({ estado: 'en_curso', requiere_evidencia: true }),
      ACTOR, AHORA, 'listo')).toBeNull()
    const conEvid = patchCerrarTarea(base({ estado: 'en_curso', requiere_evidencia: true }),
      ACTOR, AHORA, 'listo', 'https://storage/evid.pdf')!
    expect(conEvid.estado).toBe('hecha')
    expect(conEvid.evidencia_url).toBe('https://storage/evid.pdf')
    const sinEvid = patchCerrarTarea(base({ estado: 'en_curso' }), ACTOR, AHORA, 'listo')!
    expect(sinEvid.comentario_cierre).toBe('listo')
    expect(patchCerrarTarea(base({ estado: 'en_espera', balon_en: BALON }), ACTOR, AHORA, 'x')).toBeNull()
  })

  it('anular: motivo obligatorio, limpia balón, ilegal sobre terminales', () => {
    expect(patchAnularTarea(base(), ACTOR, AHORA, '')).toBeNull()
    const p = patchAnularTarea(base({ estado: 'en_espera', balon_en: BALON }),
      { uid: 'uid-giovanny' }, AHORA, 'ya no aplica')!
    expect(p.estado).toBe('anulada')
    expect((p as { balon_en?: BalonTarea | null }).balon_en).toBeNull()
    expect(patchAnularTarea(base({ estado: 'hecha' }), ACTOR, AHORA, 'x')).toBeNull()
  })

  it('reasignar: resetea a pendiente, limpia balón y traza (decisión SB1); ilegal sobre terminales', () => {
    const p = patchReasignarTarea(base({ estado: 'en_espera', balon_en: BALON }),
      { uid: 'uid-giovanny', nombre: 'Giovanny' }, AHORA,
      { uid: 'uid-david', nombre: 'David' }, 'cambio de frente')!
    expect(p).toMatchObject({ asignada_a: 'uid-david', estado: 'pendiente' })
    expect((p as { balon_en?: BalonTarea | null }).balon_en).toBeNull()
    expect(p.historial[0].nota).toContain('David')
    expect(patchReasignarTarea(base({ estado: 'anulada' }), ACTOR, AHORA,
      { uid: 'uid-x', nombre: 'X' })).toBeNull()
  })
})

describe('espejo de permisos (paridad con las reglas)', () => {
  it('ven tareas los 9 roles del panel; tecnico/cliente_final/anónimo no', () => {
    expect(ROLES_VE_TAREAS).toHaveLength(9)
    expect(veTareasUI('sst')).toBe(true)
    expect(veTareasUI('operacion_comercial')).toBe(true)
    expect(veTareasUI('tecnico')).toBe(false)
    expect(veTareasUI('cliente_final')).toBe(false)
    expect(veTareasUI(undefined)).toBe(false)
  })
  it('asignan a otros SOLO las gerencias + admin (decisión SB1)', () => {
    expect([...ROLES_ASIGNA_TAREAS].sort()).toEqual([
      'admin', 'director_proyectos', 'gerencia_administrativa',
      'gerencia_general', 'gestion_integral',
    ])
    expect(puedeAsignarTareasUI('operacion_comercial')).toBe(false)
    expect(puedeAsignarTareasUI('auxiliar_proyectos')).toBe(false)
    expect(puedeAsignarTareasUI('director_proyectos')).toBe(true)
  })
})
