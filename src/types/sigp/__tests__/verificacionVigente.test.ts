// Helpers del fix del 08-nov: filaVerificacion (docId blindado), esVerificacionVigente
// y el badge `pendientesVerificacionDe` sin doble conteo.
import { describe, it, expect } from 'vitest'
import { filaVerificacion, esVerificacionVigente } from '../verificacionSst'
import { pendientesVerificacionDe } from '../proyecto'

describe('filaVerificacion — el docId no lo puede pisar la data', () => {
  it('un campo proyecto_id (o docId) dentro de la data NO cambia el docId', () => {
    const f = filaVerificacion('p1__c1', { proyecto_id: 'p1', docId: 'otro', contratista_id: 'c1' })
    expect(f.docId).toBe('p1__c1')
    expect(f.proyecto_id).toBe('p1')           // el campo de la data se conserva, pero NO es la clave
  })
})

describe('esVerificacionVigente', () => {
  it('doc nuevo vivo → vigente', () => {
    expect(esVerificacionVigente({ activa: true })).toBe(true)
    expect(esVerificacionVigente({})).toBe(true)                  // legacy sin migrar / sin flag
  })
  it('doc con migrada_a → NO vigente (congelado)', () => {
    expect(esVerificacionVigente({ migrada_a: ['p1__c1'] })).toBe(false)
    expect(esVerificacionVigente({ migrada_a: [] })).toBe(false)   // el marcador existe aunque esté vacío
  })
  it('contratista sin asignación viva (activa === false) → NO vigente', () => {
    expect(esVerificacionVigente({ activa: false })).toBe(false)
  })
})

describe('pendientesVerificacionDe — el badge no cuenta migrados ni inactivos', () => {
  const v = (extra: Record<string, unknown>) => ({ estado: 'facturado' as const, ...extra })
  it('el doc viejo (migrada_a) y el nuevo del mismo proyecto cuentan UNA vez', () => {
    expect(pendientesVerificacionDe([
      v({ migrada_a: ['p1__c1'] }),   // viejo
      v({ activa: true }),            // nuevo
    ])).toBe(1)
  })
  it('un contratista inactivo no cuenta', () => {
    expect(pendientesVerificacionDe([v({ activa: false }), v({ activa: true })])).toBe(1)
  })
  it('al día no cuenta; con novedad y pendiente sí', () => {
    expect(pendientesVerificacionDe([
      v({ sst_gate: { estado: 'al_dia' } }),
      v({ sst_gate: { estado: 'con_novedad' } }),
      v({}),
    ] as never)).toBe(2)
  })
  it('fuera del tramo (en_ejecucion) no cuenta', () => {
    expect(pendientesVerificacionDe([{ estado: 'en_ejecucion' } as never])).toBe(0)
  })
})
