// C2.1 paso 5 (H-001 parcial) — resolución tolerante de la cédula durante la
// transición del despliegue en 3 pasos (sub-doc primero, respaldo al padre).
import { describe, it, expect } from 'vitest'
import { resolverCedula } from '../contratistasPrivado'

describe('resolverCedula — sub-doc privado manda, respaldo al padre', () => {
  it('con privado poblado gana el privado aunque el padre traiga otra', () => {
    expect(resolverCedula({ cedula: '111' }, { cedula: '91535923' })).toBe('91535923')
  })

  it('sin sub-doc (null) cae al campo legado del padre — la ventana pre-migración', () => {
    expect(resolverCedula({ cedula: '1022962180' }, null)).toBe('1022962180')
  })

  it('privado existente pero con cedula vacía cae al padre (merge parcial)', () => {
    expect(resolverCedula({ cedula: '91535923' }, {})).toBe('91535923')
    expect(resolverCedula({ cedula: '91535923' }, { cedula: '' })).toBe('91535923')
  })

  it('sin dato en ningún lado → cadena vacía (jurídicas, padre ya migrado)', () => {
    expect(resolverCedula({}, null)).toBe('')
    expect(resolverCedula({ cedula: '' }, { cedula: '' })).toBe('')
  })
})
