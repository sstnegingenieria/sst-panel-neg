// PR B nómina — resolución del emparejamiento + PARIDAD del normalizador.
// Se importa el archivo REAL de functions (patrón claims.test.ts): las
// funciones bajo prueba son puras; las deps de firebase van mockeadas.
import { describe, it, expect, vi } from 'vitest'
import { normalizarCedula as normalizarTs } from '../../../utils/contratistasNomina'

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentCreated: (_opts: unknown, handler: unknown) => handler,
  onDocumentWritten: (_opts: unknown, handler: unknown) => handler,
}))
vi.mock('firebase-functions/v2', () => ({
  logger: { info: () => undefined, warn: () => undefined },
}))
vi.mock('firebase-admin', () => ({ default: {}, firestore: () => ({}) }))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cf = require('../../../../functions/nomina.js') as {
  normalizarCedula: (v: string | null | undefined) => string | null
  resolverEmparejamiento: (
    ced: string | null, declarado: string,
    nominas: { id: string; nombre: string; cedulas: Set<string> }[],
  ) => { estado: string; contratista?: { id: string; nombre: string } }
}
const { normalizarCedula, resolverEmparejamiento } = cf

describe('paridad del normalizador JS ↔ TS (mismo contrato en CF y panel)', () => {
  const casos = ['52.123.456', ' 1 020 345 678 ', '79-456-123', 'AB123456', 'PPT-1234567',
    '12345', '123456', '123456789012', '1234567890123', '', null, undefined] as const
  it.each(casos.map(c => [c] as const))('normaliza igual: %s', (c) => {
    expect(normalizarCedula(c as string)).toBe(normalizarTs(c as string))
  })
})

const nominas = () => [
  { id: 'ctr-a', nombre: 'ALFA', cedulas: new Set(['111111']) },
  { id: 'ctr-b', nombre: 'BETA', cedulas: new Set(['222222', '333333']) },
  { id: 'ctr-c', nombre: 'GAMA', cedulas: new Set(['333333']) },
]

describe('resolverEmparejamiento — la nómina gana, el conflicto lo decide un humano', () => {
  it('en exactamente UNA nómina → verificado con ese contratista (aunque declaró otro)', () => {
    expect(resolverEmparejamiento('111111', 'ctr-b', nominas()))
      .toEqual({ estado: 'verificado_nomina', contratista: { id: 'ctr-a', nombre: 'ALFA' } })
  })

  it('en ninguna → declarado_sin_verificar (JAMÁS bloquea)', () => {
    expect(resolverEmparejamiento('999999', 'ctr-a', nominas()))
      .toEqual({ estado: 'declarado_sin_verificar' })
  })

  it('en VARIAS y una es la declarada → esa gana', () => {
    expect(resolverEmparejamiento('333333', 'ctr-c', nominas()))
      .toEqual({ estado: 'verificado_nomina', contratista: { id: 'ctr-c', nombre: 'GAMA' } })
  })

  it('en VARIAS y ninguna es la declarada → conflicto_nomina (la CF no elige a ciegas)', () => {
    expect(resolverEmparejamiento('333333', 'ctr-a', nominas()))
      .toEqual({ estado: 'conflicto_nomina' })
  })

  it('cédula no normalizable (extranjero / sin cédula) → sin verificar', () => {
    expect(resolverEmparejamiento(null, 'ctr-a', nominas()))
      .toEqual({ estado: 'declarado_sin_verificar' })
  })
})
