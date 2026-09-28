// Integración Ausentismo → SST-IND-26 (CF `indicadorAusentismo.js`). Se
// importa el archivo REAL de functions (patrón claims.test.ts/horario.test.ts):
// las funciones bajo prueba son puras; las deps de firebase van mockeadas.
import { describe, it, expect, vi } from 'vitest'

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_opts: unknown, handler: unknown) => handler,
}))
vi.mock('firebase-admin', () => ({ default: {}, firestore: () => ({}) }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'SERVER_TS' } }))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cf = require('../../../../functions/indicadorAusentismo.js') as {
  festivosColombia: (anio: number) => Set<string>
  diasHabilesEnRango: (inicio: Date, fin: Date, anio: number, festivos: Set<string>) => number
  domingoPascua: (anio: number) => Date
}
const { festivosColombia, diasHabilesEnRango, domingoPascua } = cf

describe('domingoPascua', () => {
  it('2026 → 5 de abril (verificado contra fuentes externas)', () => {
    const p = domingoPascua(2026)
    expect(p.getFullYear()).toBe(2026)
    expect(p.getMonth()).toBe(3) // abril (0-indexado)
    expect(p.getDate()).toBe(5)
  })
})

describe('festivosColombia — algoritmo puro, sin tabla fija', () => {
  it('2026: exactamente 18 fechas, las oficiales (07-13 NO es festivo — descartado en verificación previa)', () => {
    const f = festivosColombia(2026)
    const esperadas = [
      '2026-01-01', '2026-01-12', '2026-03-23', '2026-04-02', '2026-04-03',
      '2026-05-01', '2026-05-18', '2026-06-08', '2026-06-15', '2026-06-29',
      '2026-07-20', '2026-08-07', '2026-08-17', '2026-10-12', '2026-11-02',
      '2026-11-16', '2026-12-08', '2026-12-25',
    ]
    expect(f.size).toBe(18)
    for (const fecha of esperadas) expect(f.has(fecha)).toBe(true)
    expect(f.has('2026-07-13')).toBe(false)
  })

  it('los fijos (independencia, boyacá, inmaculada) NUNCA se trasladan aunque caigan entre semana', () => {
    const f = festivosColombia(2026)
    expect(f.has('2026-07-20')).toBe(true) // lunes ese año, no prueba nada por sí solo
    expect(f.has('2026-08-07')).toBe(true) // viernes 2026 — se queda en viernes
  })

  it('un año sin colisión también da 18 (2027)', () => {
    expect(festivosColombia(2027).size).toBe(18)
  })

  it('2025: Sagrado Corazón y San Pedro/San Pablo COLISIONAN en el mismo lunes (30-jun) — 17 fechas, no 18', () => {
    // Comportamiento real del calendario colombiano (no un bug): Pascua 2025
    // cae temprano, Sagrado Corazón (Pascua+68) y el traslado Emiliani de
    // San Pedro y San Pablo (29-jun, domingo ese año) aterrizan el mismo día.
    // Un Set de fechas los cuenta como UN solo día no laborable — correcto.
    const f = festivosColombia(2025)
    expect(f.size).toBe(17)
    expect(f.has('2025-06-30')).toBe(true)
  })
})

describe('diasHabilesEnRango', () => {
  const festivos2026 = festivosColombia(2026)

  it('un solo día laboral cuenta 1 (inclusive)', () => {
    // martes 2026-09-01
    const d = new Date(2026, 8, 1)
    expect(diasHabilesEnRango(d, d, 2026, festivos2026)).toBe(1)
  })

  it('excluye sábados y domingos', () => {
    // lunes 2026-09-07 a domingo 2026-09-13 → 5 hábiles (lun-vie), sáb+dom fuera
    const inicio = new Date(2026, 8, 7)
    const fin = new Date(2026, 8, 13)
    expect(diasHabilesEnRango(inicio, fin, 2026, festivos2026)).toBe(5)
  })

  it('excluye festivos dentro del rango', () => {
    // lunes 2026-06-08 (Corpus Christi) a viernes 2026-06-12: 5 días calendario
    // hábiles, menos el festivo del lunes → 4
    const inicio = new Date(2026, 5, 8)
    const fin = new Date(2026, 5, 12)
    expect(diasHabilesEnRango(inicio, fin, 2026, festivos2026)).toBe(4)
  })

  it('clamp a la frontera dic/ene: solo cuenta los días dentro del año del periodo', () => {
    // 2026-12-28 (lunes) a 2027-01-04 (lunes) — acotado a 2026 → 28,29,30,31 dic = 4 hábiles
    const inicio = new Date(2026, 11, 28)
    const fin = new Date(2027, 0, 4)
    expect(diasHabilesEnRango(inicio, fin, 2026, festivos2026)).toBe(4)
    // el mismo rango acotado a 2027 → 1 ene (festivo, viernes), 2-3 ene
    // (sáb/dom) fuera, solo el lunes 4 es hábil → 1
    const festivos2027 = festivosColombia(2027)
    expect(diasHabilesEnRango(inicio, fin, 2027, festivos2027)).toBe(1)
  })

  it('rango totalmente fuera del año → 0', () => {
    const inicio = new Date(2025, 0, 1)
    const fin = new Date(2025, 11, 31)
    expect(diasHabilesEnRango(inicio, fin, 2026, festivos2026)).toBe(0)
  })

  it('año completo lunes-viernes sin festivos = 243 días hábiles (261 − 18)', () => {
    const inicio = new Date(2026, 0, 1)
    const fin = new Date(2026, 11, 31)
    expect(diasHabilesEnRango(inicio, fin, 2026, festivos2026)).toBe(243)
  })
})
