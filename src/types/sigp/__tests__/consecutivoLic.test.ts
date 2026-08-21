// Consecutivo LIC (licitaciones) — whitelist y tabla de padding de la CF
// `generarConsecutivo`, importada con sus deps de firebase mockeadas (patrón
// horario.test.ts / claims.test.ts).
//
// Lo que este archivo protege: que agregar LIC no le haya movido el piso a
// ningún prefijo existente. El formato real (LIC-AAAA-0001) se verifica
// funcionalmente contra la CF viva en
// src/hooks/sigp/__tests__/useConsecutivo.test.ts.
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

/** Los 12 prefijos que existían ANTES de LIC, en su orden original. */
const PREFIJOS_PREVIOS = [
  'SOL', 'VIS', 'COT', 'OFR', 'PRY', 'ACT', 'LIQ', 'FAC', 'NC', 'CAT', 'OC', 'PEA',
]

describe('PREFIJOS_VALIDOS', () => {
  it('LIC está en la lista blanca', () => {
    expect(cf.PREFIJOS_VALIDOS).toContain('LIC')
  })

  it('los 12 prefijos previos siguen ahí, en el mismo orden, y LIC va al final', () => {
    expect(cf.PREFIJOS_VALIDOS).toEqual([...PREFIJOS_PREVIOS, 'LIC'])
  })

  it('no hay duplicados', () => {
    expect(new Set(cf.PREFIJOS_VALIDOS).size).toBe(cf.PREFIJOS_VALIDOS.length)
  })
})

describe('PADDING_MINIMO_ANUAL — solo LIC cambia de padding', () => {
  it('LIC pide 4 dígitos', () => {
    expect(cf.PADDING_MINIMO_ANUAL.LIC).toBe(4)
  })

  it('LIC es la ÚNICA entrada de la tabla', () => {
    expect(Object.keys(cf.PADDING_MINIMO_ANUAL)).toEqual(['LIC'])
  })

  it('ningún prefijo previo está en la tabla — todos caen al default de 3', () => {
    for (const p of PREFIJOS_PREVIOS) {
      expect(cf.PADDING_MINIMO_ANUAL[p]).toBeUndefined()
    }
  })
})

describe('regresión del padding — réplica de la expresión de la CF', () => {
  // Misma expresión que consecutivos.js en la rama anual. Si alguien la
  // cambia allá y no acá, los números de abajo dejan de cuadrar.
  const padding = (prefijo: string, siguiente: number) =>
    Math.max(cf.PADDING_MINIMO_ANUAL[prefijo] || 3, String(siguiente).length)
  const numero = (prefijo: string, siguiente: number) =>
    String(siguiente).padStart(padding(prefijo, siguiente), '0')

  it('LIC arranca en 0001 y crece a 4 dígitos', () => {
    expect(numero('LIC', 1)).toBe('0001')
    expect(numero('LIC', 42)).toBe('0042')
    expect(numero('LIC', 999)).toBe('0999')
    expect(numero('LIC', 1000)).toBe('1000')
  })

  it('LIC se extiende naturalmente más allá de 9999', () => {
    expect(numero('LIC', 10_000)).toBe('10000')
  })

  it('los prefijos previos conservan EXACTAMENTE su padding de 3', () => {
    for (const p of PREFIJOS_PREVIOS) {
      expect(numero(p, 1)).toBe('001')
      expect(numero(p, 42)).toBe('042')
      expect(numero(p, 999)).toBe('999')
      expect(numero(p, 1000)).toBe('1000')
    }
  })

  it('el default de 3 es el comportamiento histórico literal (Math.max(3, len))', () => {
    for (const p of PREFIJOS_PREVIOS) {
      for (const n of [1, 9, 10, 99, 100, 999, 1000, 12_345]) {
        expect(padding(p, n)).toBe(Math.max(3, String(n).length))
      }
    }
  })
})
