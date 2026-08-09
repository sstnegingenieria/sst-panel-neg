// Validador de horario (#3, SB4) — apareo de jornadas, validaciones y
// heurísticas de la CF (importada con sus deps de firebase mockeadas: los
// helpers bajo prueba son puros).
import { describe, it, expect, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  aparearJornadas, claveDia, fmtDuracion, esHoraValida,
  type RegistroHorario,
} from '../horario'
import {
  ROLES_VE_HORARIO, veHorarioUI, puedeGestionarHorarioUI,
} from '../permisos'

vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_opts: unknown, handler: unknown) => handler,
  HttpsError: class HttpsError extends Error {},
}))
vi.mock('firebase-admin', () => ({ default: {}, firestore: () => ({}) }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => null } }))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cf = require('../../../../functions/horario.js') as {
  ipEnLista: (ip: string, lista: string[]) => boolean
  ipv4AEntero: (ip: string) => number | null
  dispositivoDe: (ua: string | undefined) => string
}

const ev = (
  uid: string, tipo: 'ingreso' | 'salida', iso: string, nombre = 'Test',
): RegistroHorario => ({
  id: `${uid}-${iso}`, uid, nombre, rol: 'admin', tipo,
  fecha: Timestamp.fromDate(new Date(iso)),
  ip: '1.2.3.4', en_oficina: null, dispositivo: 'escritorio',
})

describe('aparearJornadas — interpretación de eventos planos', () => {
  it('par normal: ingreso + salida del mismo día → jornada cerrada con duración', () => {
    const j = aparearJornadas([
      ev('u1', 'ingreso', '2026-08-08T08:00:00'),
      ev('u1', 'salida', '2026-08-08T17:30:00'),
    ])
    expect(j).toHaveLength(1)
    expect(j[0].abierta).toBe(false)
    expect(j[0].duracionMs).toBe(9.5 * 3_600_000)
    expect(fmtDuracion(j[0].duracionMs!)).toBe('9 h 30 min')
  })

  it('doble ingreso sin salida intermedia → dos jornadas (la primera queda abierta)', () => {
    const j = aparearJornadas([
      ev('u1', 'ingreso', '2026-08-08T08:00:00'),
      ev('u1', 'ingreso', '2026-08-08T14:00:00'),
      ev('u1', 'salida', '2026-08-08T18:00:00'),
    ])
    expect(j).toHaveLength(2)
    const abiertas = j.filter(x => x.abierta)
    expect(abiertas).toHaveLength(1)
    expect(abiertas[0].ingreso!.fecha.toDate().getHours()).toBe(8)
    const cerrada = j.find(x => !x.abierta)!
    expect(cerrada.duracionMs).toBe(4 * 3_600_000)
  })

  it('ingreso sin salida → jornada abierta (la UI decide "sin salida" vs "en jornada")', () => {
    const j = aparearJornadas([ev('u1', 'ingreso', '2026-08-07T08:00:00')])
    expect(j).toHaveLength(1)
    expect(j[0].abierta).toBe(true)
    expect(j[0].salida).toBeUndefined()
  })

  it('salida huérfana (sin ingreso ese día) → jornada solo-salida, no abierta', () => {
    const j = aparearJornadas([ev('u1', 'salida', '2026-08-08T17:00:00')])
    expect(j).toHaveLength(1)
    expect(j[0].ingreso).toBeUndefined()
    expect(j[0].abierta).toBe(false)
  })

  it('multi-día: la salida de otro día NO cierra el ingreso del día anterior', () => {
    const j = aparearJornadas([
      ev('u1', 'ingreso', '2026-08-07T08:00:00'),
      ev('u1', 'salida', '2026-08-08T09:00:00'),   // día siguiente → huérfana
    ])
    expect(j).toHaveLength(2)
    expect(j.find(x => x.dia === '2026-08-07')!.abierta).toBe(true)
    expect(j.find(x => x.dia === '2026-08-08')!.ingreso).toBeUndefined()
  })

  it('multi-persona el mismo día: cada uid aparea por separado, orden DESC', () => {
    const j = aparearJornadas([
      ev('u1', 'ingreso', '2026-08-08T08:00:00', 'Ana'),
      ev('u2', 'ingreso', '2026-08-08T09:00:00', 'Beto'),
      ev('u1', 'salida', '2026-08-08T17:00:00', 'Ana'),
    ])
    expect(j).toHaveLength(2)
    expect(j[0].nombre).toBe('Ana')       // ancla más reciente (17:00) primero
    expect(j[1].nombre).toBe('Beto')
    expect(j[1].abierta).toBe(true)
  })
})

describe('esHoraValida / claveDia', () => {
  it('acepta HH:mm válidas y rechaza el resto', () => {
    for (const v of ['00:00', '08:30', '17:30', '23:59']) expect(esHoraValida(v)).toBe(true)
    for (const v of ['24:00', '8:30', '17:60', '17.30', '', 'mañana']) expect(esHoraValida(v)).toBe(false)
  })
  it('claveDia usa el día LOCAL con padding', () => {
    expect(claveDia(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })
})

describe('CF horario — heurísticas puras (ipEnLista / dispositivoDe)', () => {
  it('IP exacta y CIDR IPv4; malformadas ignoradas; fuera de rango false', () => {
    expect(cf.ipEnLista('190.85.10.20', ['190.85.10.20'])).toBe(true)
    expect(cf.ipEnLista('10.1.2.3', ['10.0.0.0/8'])).toBe(true)
    expect(cf.ipEnLista('192.168.1.77', ['192.168.1.0/24'])).toBe(true)
    expect(cf.ipEnLista('192.168.2.1', ['192.168.1.0/24'])).toBe(false)
    expect(cf.ipEnLista('181.55.30.7', ['10.0.0.0/8', 'basura', '999.1.1.1/24'])).toBe(false)
    expect(cf.ipEnLista('::1', ['::1'])).toBe(true)     // IPv6 solo match literal
  })
  it('ipv4AEntero rechaza octetos inválidos', () => {
    expect(cf.ipv4AEntero('256.1.1.1')).toBeNull()
    expect(cf.ipv4AEntero('10.0.0.1')).toBe(10 * 256 ** 3 + 1)
  })
  it('dispositivoDe: móvil por UA, escritorio por default, desconocido sin UA', () => {
    expect(cf.dispositivoDe('Mozilla/5.0 (Linux; Android 14) Mobile')).toBe('movil')
    expect(cf.dispositivoDe('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('movil')
    expect(cf.dispositivoDe('Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/126')).toBe('escritorio')
    expect(cf.dispositivoDe(undefined)).toBe('desconocido')
    expect(cf.dispositivoDe('')).toBe('desconocido')
  })
})

describe('permisos UI del módulo horario — espejo de reglas', () => {
  it('ven la bandeja EXACTAMENTE las 4 gerencias + admin', () => {
    expect([...ROLES_VE_HORARIO].sort()).toEqual([
      'admin', 'director_proyectos', 'gerencia_administrativa',
      'gerencia_general', 'gestion_integral',
    ])
    expect(veHorarioUI('operacion_comercial')).toBe(false)
    expect(veHorarioUI('sst')).toBe(false)
    expect(veHorarioUI('auxiliar_proyectos')).toBe(false)
    expect(veHorarioUI(undefined)).toBe(false)
  })
  it('operan SOLO gerencia_administrativa + admin (GG lee, no opera)', () => {
    expect(puedeGestionarHorarioUI('gerencia_administrativa')).toBe(true)
    expect(puedeGestionarHorarioUI('admin')).toBe(true)
    expect(puedeGestionarHorarioUI('gerencia_general')).toBe(false)
    expect(puedeGestionarHorarioUI('gestion_integral')).toBe(false)
    expect(puedeGestionarHorarioUI('director_proyectos')).toBe(false)
  })
})
