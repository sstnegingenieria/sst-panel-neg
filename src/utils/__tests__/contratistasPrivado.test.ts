// C2.1 paso 5 fase 3 (H-001 parcial) — la cédula se lee SOLO del sub-doc
// privado: el respaldo al campo legado del padre se retiró tras verificar la
// migración, y la regla restrictiva impide que el campo vuelva al padre.
import { describe, it, expect } from 'vitest'
import { resolverCedula } from '../contratistasPrivado'

describe('resolverCedula — solo el sub-doc privado (fase 3)', () => {
  it('lee la cédula del privado', () => {
    expect(resolverCedula({}, { cedula: '91535923' })).toBe('91535923')
  })

  it('IGNORA el campo legado del padre aunque exista (el respaldo se retiró)', () => {
    expect(resolverCedula({ cedula: '111' }, { cedula: '91535923' })).toBe('91535923')
    expect(resolverCedula({ cedula: '111' }, null)).toBe('')
  })

  it('sin sub-doc o sin cédula → cadena vacía (jurídicas y naturales sin dato)', () => {
    expect(resolverCedula({}, null)).toBe('')
    expect(resolverCedula({}, {})).toBe('')
    expect(resolverCedula({}, { cedula: '' })).toBe('')
  })
})
