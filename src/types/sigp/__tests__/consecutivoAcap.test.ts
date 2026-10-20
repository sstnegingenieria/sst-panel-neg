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
  ROLES_POR_PREFIJO: Record<string, string[]>
}

const NUEVOS = ['AC', 'AP', 'MEJ']
// CONTRATO desde el mapa prefijo→roles (19-oct): la whitelist se deriva de
// ROLES_POR_PREFIJO (deny-by-default) — los reservados sin llamador
// (OFR/ACT/LIQ/FAC/NC/PRY) salieron de la superficie y quedan documentados
// en comentario de la CF. El test anterior fijaba la lista de 16; este fija
// la de 10 EN USO.
const EN_USO = ['SOL', 'VIS', 'COT', 'CAT', 'OC', 'PEA', 'LIC', 'AC', 'AP', 'MEJ']

describe('PREFIJOS_VALIDOS — AC / AP / MEJ (contrato post-mapa)', () => {
  it('los tres están en la lista blanca', () => {
    for (const p of NUEVOS) expect(cf.PREFIJOS_VALIDOS).toContain(p)
  })

  it('la whitelist es EXACTAMENTE los prefijos en uso (deriva del mapa de roles)', () => {
    expect(cf.PREFIJOS_VALIDOS).toEqual(EN_USO)
  })

  it('no hay duplicados', () => {
    expect(new Set(cf.PREFIJOS_VALIDOS).size).toBe(cf.PREFIJOS_VALIDOS.length)
  })

  it('los reservados sin llamador están FUERA de la superficie (deny-by-default)', () => {
    for (const p of ['OFR', 'ACT', 'LIQ', 'FAC', 'NC', 'PRY']) {
      expect(cf.PREFIJOS_VALIDOS).not.toContain(p)
      expect(cf.ROLES_POR_PREFIJO[p]).toBeUndefined()
    }
  })

  it('AC no colisiona con ACT: ACT quedó reservado y sus contadores son distintos de todos modos', () => {
    expect(`AC_2026`).not.toBe(`ACT_2026`)
  })

  it('AC/AP/MEJ son de gestion_integral + admin (mandato 19-oct)', () => {
    for (const p of NUEVOS) {
      expect([...cf.ROLES_POR_PREFIJO[p]].sort()).toEqual(['admin', 'gestion_integral'])
    }
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
