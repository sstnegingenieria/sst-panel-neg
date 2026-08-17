// Custom claims C2.1 paso 1 — derivación y detección de reducción de acceso.
// Se importa el archivo REAL de functions (patrón horario.test.ts): las
// funciones bajo prueba son puras; las deps de firebase van mockeadas.
import { describe, it, expect, vi } from 'vitest'

vi.mock('firebase-functions/v2/firestore', () => ({
  onDocumentWritten: (_opts: unknown, handler: unknown) => handler,
}))
vi.mock('firebase-functions/v2/https', () => ({
  onCall: (_opts: unknown, handler: unknown) => handler,
  HttpsError: class HttpsError extends Error {},
}))
vi.mock('firebase-admin', () => ({ default: {}, auth: () => ({}), firestore: () => ({}) }))
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cf = require('../../../../functions/claims.js') as {
  derivarClaims: (doc: Record<string, unknown> | null) => Record<string, unknown>
  esReduccion: (prev: Record<string, unknown> | null, next: Record<string, unknown> | null) => boolean
  ROLES_INTERNOS: string[]
}
const { derivarClaims, esReduccion, ROLES_INTERNOS } = cf

describe('derivarClaims — proyección del doc de users al token', () => {
  it('rol interno activo → {perfil: interno, rol}', () => {
    expect(derivarClaims({ rol: 'director_proyectos', estado: 'activo' }))
      .toEqual({ perfil: 'interno', rol: 'director_proyectos' })
  })

  it('cada uno de los 9 roles internos deriva perfil interno', () => {
    for (const rol of ROLES_INTERNOS) {
      expect(derivarClaims({ rol, estado: 'activo' }))
        .toEqual({ perfil: 'interno', rol })
    }
    expect(ROLES_INTERNOS).toHaveLength(9)
    expect(ROLES_INTERNOS).not.toContain('tecnico')
  })

  it('residente_obra activo con cliente_id → claims con cliente_id', () => {
    expect(derivarClaims({ rol: 'residente_obra', estado: 'activo', cliente_id: 'cli1' }))
      .toEqual({ perfil: 'residente_obra', rol: 'residente_obra', cliente_id: 'cli1' })
  })

  it('residente_obra sin cliente_id → claims SIN la clave (no cliente_id vacío)', () => {
    const claims = derivarClaims({ rol: 'residente_obra', estado: 'activo' })
    expect(claims).toEqual({ perfil: 'residente_obra', rol: 'residente_obra' })
    expect('cliente_id' in claims).toBe(false)
  })

  it('estado ≠ activo → {} aunque el rol sea interno (pendiente, inactivo, ausente)', () => {
    expect(derivarClaims({ rol: 'admin', estado: 'inactivo' })).toEqual({})
    expect(derivarClaims({ rol: 'admin', estado: 'pendiente' })).toEqual({})
    expect(derivarClaims({ rol: 'admin' })).toEqual({})
  })

  it('tecnico activo → {} (la app móvil no gana claims de panel)', () => {
    expect(derivarClaims({ rol: 'tecnico', estado: 'activo' })).toEqual({})
  })

  it('rol desconocido o doc null → {} (deny-by-default)', () => {
    expect(derivarClaims({ rol: 'cualquier_cosa', estado: 'activo' })).toEqual({})
    expect(derivarClaims(null)).toEqual({})
  })

  it('fallback legacy: campo `role` en vez de `rol` (H-002)', () => {
    expect(derivarClaims({ role: 'sst', estado: 'activo' }))
      .toEqual({ perfil: 'interno', rol: 'sst' })
  })
})

describe('esReduccion — cuándo revocar refresh tokens', () => {
  it('concesión pura (de {} a claims) NO es reducción', () => {
    expect(esReduccion({}, { perfil: 'interno', rol: 'sst' })).toBe(false)
    expect(esReduccion(null, { perfil: 'interno', rol: 'sst' })).toBe(false)
  })

  it('sin cambio → no reduce', () => {
    const c = { perfil: 'interno', rol: 'admin' }
    expect(esReduccion(c, { ...c })).toBe(false)
  })

  it('baja de todo (claims → {}) reduce: estado inactivo o doc borrado', () => {
    expect(esReduccion({ perfil: 'interno', rol: 'sst' }, {})).toBe(true)
  })

  it('cambio de rol reduce (el rol previo deja de estar en el token)', () => {
    expect(esReduccion(
      { perfil: 'interno', rol: 'gerencia_general' },
      { perfil: 'interno', rol: 'auxiliar_proyectos' },
    )).toBe(true)
  })

  it('quita de cliente_id reduce; agregarlo no', () => {
    const conCliente = { perfil: 'residente_obra', rol: 'residente_obra', cliente_id: 'cli1' }
    const sinCliente = { perfil: 'residente_obra', rol: 'residente_obra' }
    expect(esReduccion(conCliente, sinCliente)).toBe(true)
    expect(esReduccion(sinCliente, conCliente)).toBe(false)
  })

  it('cambio de cliente_id reduce (pierde el acceso al cliente previo)', () => {
    expect(esReduccion(
      { perfil: 'residente_obra', rol: 'residente_obra', cliente_id: 'cli1' },
      { perfil: 'residente_obra', rol: 'residente_obra', cliente_id: 'cli2' },
    )).toBe(true)
  })
})
