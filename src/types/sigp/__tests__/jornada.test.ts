// Jornada por PRESENCIA (rebuild oct-2026) — motor puro + día Bogotá de la CF.
import { describe, it, expect, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  debeLatir, cierreEfectivo, presenteAhora, normalizarJornada,
  ROLES_OPERAN_EN_APP, operaEnApp, parseMarcaLocal, debeForzarLogin,
  debeCerrarAlVencer,
  LATIDO_MIN_DEFAULT, GRACIA_CIERRE_MIN_DEFAULT, VENTANA_PRESENTE_MIN_DEFAULT,
} from '../jornada'
import { horaFinDe, tieneRespaldo } from '../horario'

// La CF (solo su helper puro diaBogota) — deps de firebase mockeadas,
// patrón horario.test.ts.
vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_opts: unknown, handler: unknown) => handler,
  HttpsError: class HttpsError extends Error {},
}))
vi.mock('firebase-admin', () => ({ default: {}, firestore: () => ({}) }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 0, increment: () => 0, delete: () => 0 } }))
import { createRequire } from 'node:module'
const require2 = createRequire(import.meta.url)
const { diaBogota, horaBogota, horaFinDeJs, esSalidaAnticipada } = require2('../../../../functions/jornadas.js')

const MIN = 60_000
const ts = (ms: number) => Timestamp.fromMillis(ms)
const base = 1_760_000_000_000

describe('debeLatir — primera interacción inmediata, luego ventana', () => {
  it('sin latido previo del día → late DE INMEDIATO (la hora de inicio no espera el tick)', () => {
    expect(debeLatir(null, base, LATIDO_MIN_DEFAULT)).toBe(true)
  })
  it('dentro de la ventana → no late; vencida → late', () => {
    expect(debeLatir(base, base + 9 * MIN, 10)).toBe(false)
    expect(debeLatir(base, base + 10 * MIN, 10)).toBe(true)
    expect(debeLatir(base, base + 47 * MIN, 10)).toBe(true)
  })
})

describe('cierreEfectivo — derivado en lectura, manual gana', () => {
  const j = (ultimoMs: number, cierre?: { fecha: Timestamp; tipo: 'manual' }) =>
    ({ ultimo_latido: ts(ultimoMs), ...(cierre ? { cierre } : {}) })

  it('cierre manual persiste y gana aunque el latido sea fresco', () => {
    const r = cierreEfectivo(j(base, { fecha: ts(base), tipo: 'manual' }), base + MIN, GRACIA_CIERRE_MIN_DEFAULT)
    expect(r.estado).toBe('manual')
  })
  it('latido dentro de la gracia → presente (nada que cerrar)', () => {
    expect(cierreEfectivo(j(base), base + 29 * MIN, 30).estado).toBe('presente')
  })
  it('latido más viejo que la gracia → cierre AUTOMÁTICO en el último latido', () => {
    const r = cierreEfectivo(j(base), base + 31 * MIN, 30)
    expect(r.estado).toBe('automatico')
    expect(r.estado === 'automatico' && r.fecha.toMillis()).toBe(base)
  })
  it('el almuerzo largo se resuelve solo: un latido nuevo corre el cierre derivado', () => {
    // a las 2h el derivado diría "automático"; la persona vuelve y late →
    // el MISMO doc con ultimo_latido nuevo vuelve a "presente" sin revertir nada
    expect(cierreEfectivo(j(base + 120 * MIN), base + 125 * MIN, 30).estado).toBe('presente')
  })
})

describe('presenteAhora — ventana de 15 min, salida manual apaga', () => {
  it('latido fresco sin cierre → presente; con cierre manual → no', () => {
    expect(presenteAhora({ ultimo_latido: ts(base) }, base + 14 * MIN, VENTANA_PRESENTE_MIN_DEFAULT)).toBe(true)
    expect(presenteAhora({ ultimo_latido: ts(base) }, base + 16 * MIN, 15)).toBe(false)
    expect(presenteAhora({ ultimo_latido: ts(base), cierre: { fecha: ts(base), tipo: 'manual' } }, base, 15)).toBe(false)
  })
})

describe('salida AUTOMÁTICA persistida (marcación 13-oct) — distinguible', () => {
  it("cierre tipo 'automatica' escrito → cierreEfectivo lo reporta como automatico con SU fecha", () => {
    const r = cierreEfectivo({ ultimo_latido: ts(base), cierre: { fecha: ts(base + 5 * MIN), tipo: 'automatica' } }, base + 60 * MIN, 30)
    expect(r.estado).toBe('automatico')
    expect(r.estado === 'automatico' && r.fecha.toMillis()).toBe(base + 5 * MIN)
  })
  it('normalizarJornada acepta entrada y cierre automatica; rechaza tipos desconocidos', () => {
    const j = normalizarJornada('x', {
      uid: 'u', dia: '2026-10-13', inicio: ts(base), ultimo_latido: ts(base),
      entrada: { fecha: ts(base) }, cierre: { fecha: ts(base), tipo: 'automatica' },
    })!
    expect(j.entrada?.fecha.toMillis()).toBe(base)
    expect(j.cierre?.tipo).toBe('automatica')
    const malo = normalizarJornada('x', {
      uid: 'u', dia: '2026-10-13', inicio: ts(base), ultimo_latido: ts(base),
      cierre: { fecha: ts(base), tipo: 'inventado' },
    })!
    expect(malo.cierre).toBeUndefined()
  })
})

describe('debeForzarLogin — día nuevo exige login, sin expulsar al nocturno', () => {
  const hoy = '2026-10-13'
  it('sin marca local (navegador nuevo/LS limpio) → forzar login', () => {
    expect(debeForzarLogin(null, hoy, base, GRACIA_CIERRE_MIN_DEFAULT)).toBe(true)
  })
  it('marca de HOY → jamás fuerza (recarga intradía de alguien activo)', () => {
    expect(debeForzarLogin({ dia: hoy, ts: base - 300 * MIN }, hoy, base, 30)).toBe(false)
  })
  it('CRUCE DE MEDIANOCHE (precisión 1): marca de AYER pero FRESCA → continuación, no fuerza', () => {
    expect(debeForzarLogin({ dia: '2026-10-12', ts: base - 5 * MIN }, hoy, base, 30)).toBe(false)
  })
  it('marca de ayer y VIEJA (llegó a la mañana siguiente) → forzar login', () => {
    expect(debeForzarLogin({ dia: '2026-10-12', ts: base - 6 * 60 * MIN }, hoy, base, 30)).toBe(true)
  })
  it('parseMarcaLocal tolera basura', () => {
    expect(parseMarcaLocal(null)).toBeNull()
    expect(parseMarcaLocal('no-json')).toBeNull()
    expect(parseMarcaLocal('{"dia":1}')).toBeNull()
    expect(parseMarcaLocal(JSON.stringify({ dia: hoy, ts: base }))).toEqual({ dia: hoy, ts: base })
  })
})

describe('debeCerrarAlVencer — el cierre automático es para quien ya no está (ajuste SGI/SST)', () => {
  const inicioAviso = base
  it('interacción DESPUÉS de aparecer el aviso → NO cerrar (se pospone solo)', () => {
    expect(debeCerrarAlVencer(inicioAviso + 3 * MIN, inicioAviso)).toBe(false)
  })
  it('sin interacción durante todo el aviso → cerrar (salida automática)', () => {
    expect(debeCerrarAlVencer(inicioAviso - 20 * MIN, inicioAviso)).toBe(true)
    expect(debeCerrarAlVencer(0, inicioAviso)).toBe(true)
  })
})

describe('horaFinDe — hora de cierre por persona con fallback a la general', () => {
  it('la personal válida gana; sin personal → general; sin nada → null', () => {
    expect(horaFinDe('u1', { u1: '15:00' }, '17:00')).toBe('15:00')
    expect(horaFinDe('u2', { u1: '15:00' }, '17:00')).toBe('17:00')
    expect(horaFinDe('u2', undefined, '17:00')).toBe('17:00')
    expect(horaFinDe('u2', undefined, undefined)).toBeNull()
  })
  it('personal INVÁLIDA cae a la general — nadie queda sin hora de cierre por un typo', () => {
    expect(horaFinDe('u1', { u1: '25:99' }, '17:00')).toBe('17:00')
    expect(horaFinDe('u1', { u1: '' }, '17:00')).toBe('17:00')
  })
  it('general inválida tampoco se usa', () => {
    expect(horaFinDe('u1', {}, 'basura')).toBeNull()
  })
})

describe('ROLES_OPERAN_EN_APP — el hueco de Juan Carlos, declarado', () => {
  it('sst y residente_sst operan en la app: un cero NO es ausencia', () => {
    expect(operaEnApp('sst')).toBe(true)
    expect(operaEnApp('residente_sst')).toBe(true)
    expect(operaEnApp('gerencia_administrativa')).toBe(false)
    expect(operaEnApp('auxiliar_proyectos')).toBe(false)
    expect(ROLES_OPERAN_EN_APP.length).toBeGreaterThan(0)
  })
})

describe('🔒 privacidad por construcción — el tipo es CERRADO', () => {
  it('normalizarJornada no deja pasar campos extra (páginas/clics no existen en el modelo)', () => {
    const j = normalizarJornada('u_2026-10-09', {
      uid: 'u', dia: '2026-10-09', inicio: ts(base), ultimo_latido: ts(base),
      latidos: 3, paginas_visitadas: ['x'], clics: 99,   // ← intento de contrabando
    })!
    expect(j).not.toHaveProperty('paginas_visitadas')
    expect(j).not.toHaveProperty('clics')
    expect(Object.keys(j).sort()).toEqual([
      'dia', 'dispositivo', 'en_oficina_inicio', 'en_oficina_ultimo',
      'id', 'inicio', 'latidos', 'nombre', 'rol', 'uid', 'ultimo_latido',
    ])
  })
  it('doc malformado → null (no tumba la bandeja)', () => {
    expect(normalizarJornada('x', { uid: 'u' })).toBeNull()
  })
})

describe('salida ANTICIPADA (13-oct) — congelada por la CF, normalizada cerrada', () => {
  it('normalizarJornada conserva anticipada SOLO en cierre manual con true literal', () => {
    const base_ = { uid: 'u', dia: '2026-10-13', inicio: ts(base), ultimo_latido: ts(base) }
    const manual = normalizarJornada('x', { ...base_, cierre: { fecha: ts(base), tipo: 'manual', anticipada: true } })!
    expect(manual.cierre?.anticipada).toBe(true)
    // en automática jamás (la CF no la escribe ahí; si apareciera, se descarta)
    const auto = normalizarJornada('x', { ...base_, cierre: { fecha: ts(base), tipo: 'automatica', anticipada: true } })!
    expect(auto.cierre?.anticipada).toBeUndefined()
    // valores no-true (contrabando) se descartan
    const truthy = normalizarJornada('x', { ...base_, cierre: { fecha: ts(base), tipo: 'manual', anticipada: 'si' } })!
    expect(truthy.cierre?.anticipada).toBeUndefined()
  })
  it('PARIDAD TS↔JS: horaFinDeJs de la CF replica horaFinDe (mismos casos)', () => {
    for (const [uid, personales, general] of [
      ['u1', { u1: '15:00' }, '17:00'],
      ['u2', { u1: '15:00' }, '17:00'],
      ['u2', undefined, '17:00'],
      ['u2', undefined, undefined],
      ['u1', { u1: '25:99' }, '17:00'],
      ['u1', { u1: '' }, '17:00'],
      ['u1', {}, 'basura'],
    ] as const) {
      expect(horaFinDeJs(uid, personales, general)).toBe(horaFinDe(uid, personales as Record<string, string> | undefined, general))
    }
  })
  it('esSalidaAnticipada compara la hora LOCAL de Bogotá contra la hora de cierre', () => {
    // 2026-10-13 21:00Z = 16:00 Bogotá
    const ms = Date.parse('2026-10-13T21:00:00Z')
    expect(horaBogota(ms)).toBe('16:00')
    expect(esSalidaAnticipada(ms, '17:00')).toBe(true)    // salió a las 16 con cierre 17
    expect(esSalidaAnticipada(ms, '16:00')).toBe(false)   // justo a la hora NO es anticipada
    expect(esSalidaAnticipada(ms, '15:00')).toBe(false)   // después de la hora
    expect(esSalidaAnticipada(ms, null)).toBe(false)      // sin hora resoluble → no se marca
    expect(esSalidaAnticipada(ms, 'basura')).toBe(false)
  })
})

describe('tieneRespaldo — el permiso de Ausentismos cubre el día (cruce en lectura)', () => {
  const aus = (uid: string | undefined, ini: string, fin: string, estado: 'activo' | 'anulado' = 'activo') => ({
    estado, empleado_uid: uid,
    fecha_inicio: Timestamp.fromDate(new Date(ini + 'T12:00:00')),
    fecha_fin: Timestamp.fromDate(new Date(fin + 'T12:00:00')),
  })
  it('activo que cubre el día → respalda; fuera de rango o anulado → no', () => {
    expect(tieneRespaldo('u1', '2026-10-13', [aus('u1', '2026-10-13', '2026-10-13')])).toBe(true)
    expect(tieneRespaldo('u1', '2026-10-13', [aus('u1', '2026-10-10', '2026-10-15')])).toBe(true)
    expect(tieneRespaldo('u1', '2026-10-13', [aus('u1', '2026-10-14', '2026-10-15')])).toBe(false)
    expect(tieneRespaldo('u1', '2026-10-13', [aus('u1', '2026-10-13', '2026-10-13', 'anulado')])).toBe(false)
  })
  it('el ausentismo de OTRA persona o sin empleado_uid no respalda a nadie (ausencia honesta)', () => {
    expect(tieneRespaldo('u1', '2026-10-13', [aus('u2', '2026-10-13', '2026-10-13')])).toBe(false)
    expect(tieneRespaldo('u1', '2026-10-13', [aus(undefined, '2026-10-13', '2026-10-13')])).toBe(false)
  })
})

describe('diaBogota (CF) — día local UTC-5, la medianoche parte jornadas', () => {
  it('23:59 y 00:01 de Bogotá caen en días distintos', () => {
    // 2026-10-09 23:59 Bogotá = 2026-10-10T04:59Z · 00:01 del 10 = 05:01Z
    expect(diaBogota(Date.parse('2026-10-10T04:59:00Z'))).toBe('2026-10-09')
    expect(diaBogota(Date.parse('2026-10-10T05:01:00Z'))).toBe('2026-10-10')
  })
  it('mediodía de Bogotá es el mismo día', () => {
    expect(diaBogota(Date.parse('2026-10-09T17:00:00Z'))).toBe('2026-10-09')
  })
})
