// Señal de huecos de consecutivos (20-oct-2026) — dos piezas, un contrato:
//
// 1) `calcularCensoSerie` del archivo REAL de functions (createRequire con
//    deps mockeadas, patrón consecutivosRoles.test.ts): huecos = 1..ultimo
//    no usados; sin_documentar = huecos fuera de la whitelist.
// 2) `estadoCensoConsecutivos` del panel: la condición de Giovanny — el chip
//    alerta si el censo está VENCIDO o AUSENTE, no solo si hay huecos ("la
//    señal tiene que poder decir 'no sé', que es distinto de 'todo bien'").
import { describe, it, expect, vi } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  estadoCensoConsecutivos,
  UMBRAL_CENSO_VENCIDO_DIAS,
} from '../censoConsecutivos'

vi.mock('firebase-functions/v2/scheduler', () => ({
  onSchedule: (_opts: unknown, handler: unknown) => handler,
}))
vi.mock('firebase-admin', () => ({ default: {}, firestore: () => ({}) }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => null } }))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cf = require('../../../../functions/censoConsecutivos.js') as {
  calcularCensoSerie: (ultimo: number, usados: number[], doc?: number[]) => { huecos: number[]; sin_documentar: number[] }
  numeroDeConsecutivo: (c: unknown) => number | null
  HUECOS_DOCUMENTADOS: Record<string, number[]>
  SERIES_ANUALES: Record<string, [string, string]>
}

const DIA = 86_400_000

describe('calcularCensoSerie (CF real)', () => {
  it('serie contigua → sin huecos', () => {
    expect(cf.calcularCensoSerie(4, [1, 2, 3, 4])).toEqual({ huecos: [], sin_documentar: [] })
  })

  it('hueco no documentado se reporta', () => {
    expect(cf.calcularCensoSerie(5, [1, 2, 4, 5])).toEqual({ huecos: [3], sin_documentar: [3] })
  })

  it('hueco documentado cuenta como hueco pero NO como sin_documentar', () => {
    const r = cf.calcularCensoSerie(5, [4, 5], [1, 2, 3])
    expect(r.huecos).toEqual([1, 2, 3])
    expect(r.sin_documentar).toEqual([])
  })

  it('el caso real de prod: COT con 1–9 documentados y 10..ultimo usados → limpio', () => {
    const usados = Array.from({ length: 65 }, (_, i) => i + 10) // 10..74
    const r = cf.calcularCensoSerie(74, usados, cf.HUECOS_DOCUMENTADOS.COT_2026)
    expect(r.huecos).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(r.sin_documentar).toEqual([])
  })

  it('usados repetidos (PEA re-emitida, mismo consecutivo) no fabrican huecos', () => {
    expect(cf.calcularCensoSerie(3, [1, 1, 2, 2, 3])).toEqual({ huecos: [], sin_documentar: [] })
  })

  it('contador adelantado sin doc alguno → todos los números son huecos', () => {
    expect(cf.calcularCensoSerie(3, []).sin_documentar).toEqual([1, 2, 3])
  })

  it('numeroDeConsecutivo extrae el número de PREFIJO-YYYY-NNN y CAT-NNNN', () => {
    expect(cf.numeroDeConsecutivo('COT-2026-074')).toBe(74)
    expect(cf.numeroDeConsecutivo('COT-2026-1024')).toBe(1024)
    expect(cf.numeroDeConsecutivo('CAT-0145')).toBe(145)
    expect(cf.numeroDeConsecutivo('sin-formato')).toBeNull()
    expect(cf.numeroDeConsecutivo(undefined)).toBeNull()
    expect(cf.numeroDeConsecutivo('')).toBeNull()
  })

  it('las series censadas son exactamente las del mapa de generarConsecutivo con colección propia', () => {
    // PRY se censa aunque el callable no lo sirva (lo quema crearProyectoAlAprobar);
    // CAT va aparte (acumulativo); AC/AP/MEJ entran cuando existan sus colecciones.
    expect(Object.keys(cf.SERIES_ANUALES).sort()).toEqual(['COT', 'LIC', 'OC', 'PEA', 'PRY', 'SOL', 'VIS'])
  })
})

describe('estadoCensoConsecutivos (el "no sé" del chip)', () => {
  const ahora = Date.now()
  const docDe = (diasAtras: number, sinDoc: number) => ({
    fecha: Timestamp.fromMillis(ahora - diasAtras * DIA),
    total_sin_documentar: sinDoc,
    ok: sinDoc === 0,
  })

  it('sin doc → sin_censo (no "todo bien")', () => {
    expect(estadoCensoConsecutivos(null, ahora).estado).toBe('sin_censo')
    expect(estadoCensoConsecutivos({}, ahora).estado).toBe('sin_censo')
  })

  it('censo fresco y limpio → ok, con los días visibles', () => {
    expect(estadoCensoConsecutivos(docDe(2, 0), ahora)).toEqual({ estado: 'ok', diasDesde: 2 })
  })

  it('censo fresco con huecos → huecos', () => {
    expect(estadoCensoConsecutivos(docDe(2, 3), ahora).estado).toBe('huecos')
  })

  it('censo VENCIDO gana aunque el último resultado fuera limpio — el scheduler caído se nota', () => {
    const r = estadoCensoConsecutivos(docDe(UMBRAL_CENSO_VENCIDO_DIAS + 1, 0), ahora)
    expect(r.estado).toBe('vencido')
    expect(r.diasDesde).toBe(UMBRAL_CENSO_VENCIDO_DIAS + 1)
  })

  it('censo vencido CON huecos también es vencido (primero "no sé", después el detalle)', () => {
    expect(estadoCensoConsecutivos(docDe(30, 5), ahora).estado).toBe('vencido')
  })

  it('en el umbral exacto todavía es vigente', () => {
    expect(estadoCensoConsecutivos(docDe(UMBRAL_CENSO_VENCIDO_DIAS, 0), ahora).estado).toBe('ok')
  })
})
