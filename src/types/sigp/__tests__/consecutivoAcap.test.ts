// Consecutivos AC / AP / MEJ (acciones de mejora / NC, cláusula 10.2) — whitelist y
// padding de la CF `generarConsecutivo`, importada con sus deps de firebase
// mockeadas (mismo patrón que consecutivoLic.test.ts).
//
// Formato acordado: PREFIJO-AAAA-NNN, serie ANUAL, padding 3, asignado al EMITIR.
// El formato funcional contra la CF viva se verifica en useConsecutivo.test.ts.
import { describe, it, expect, vi } from 'vitest'

vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_opts: unknown, handler: unknown) => handler,
  HttpsError: class HttpsError extends Error {},
}))
vi.mock('firebase-admin', () => ({ default: {}, firestore: () => ({}) }))
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => null } }))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cf = require('../../../../functions/consecutivos.js') as {
  PREFIJOS_VALIDOS: string[]
  PADDING_MINIMO_ANUAL: Record<string, number>
}

const NUEVOS = ['AC', 'AP', 'MEJ']
const ANTERIORES = [
  'SOL', 'VIS', 'COT', 'OFR', 'PRY', 'ACT', 'LIQ', 'FAC', 'NC', 'CAT', 'OC', 'PEA', 'LIC',
]

describe('PREFIJOS_VALIDOS — AC / AP / MEJ', () => {
  it('los tres están en la lista blanca', () => {
    for (const p of NUEVOS) expect(cf.PREFIJOS_VALIDOS).toContain(p)
  })

  it('los 13 anteriores siguen ahí, en el mismo orden, y los nuevos van al final', () => {
    expect(cf.PREFIJOS_VALIDOS).toEqual([...ANTERIORES, ...NUEVOS])
  })

  it('no hay duplicados', () => {
    expect(new Set(cf.PREFIJOS_VALIDOS).size).toBe(cf.PREFIJOS_VALIDOS.length)
  })

  it('AC no colisiona con ACT: son prefijos (y contadores consecutivos/{prefijo}_{año}) distintos', () => {
    expect(cf.PREFIJOS_VALIDOS).toContain('ACT')
    expect(`AC_2026`).not.toBe(`ACT_2026`)
  })
})

describe('padding — AC / AP / MEJ usan el default anual de 3', () => {
  const padding = (prefijo: string, siguiente: number) =>
    Math.max(cf.PADDING_MINIMO_ANUAL[prefijo] || 3, String(siguiente).length)
  const numero = (prefijo: string, siguiente: number) =>
    String(siguiente).padStart(padding(prefijo, siguiente), '0')

  it('no están en la tabla de padding (no se la tocó)', () => {
    expect(Object.keys(cf.PADDING_MINIMO_ANUAL)).toEqual(['LIC'])
    for (const p of NUEVOS) expect(cf.PADDING_MINIMO_ANUAL[p]).toBeUndefined()
  })

  it('arrancan en 001 y se extienden a 4 dígitos después de 999', () => {
    for (const p of NUEVOS) {
      expect(numero(p, 1)).toBe('001')
      expect(numero(p, 42)).toBe('042')
      expect(numero(p, 999)).toBe('999')
      expect(numero(p, 1000)).toBe('1000')
    }
  })
})
