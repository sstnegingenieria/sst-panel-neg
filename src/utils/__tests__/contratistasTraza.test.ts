import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { entradaCambioEstado, entradaCorreccionIdentidad, ultimoCambioEstado } from '../contratistasTraza'
import { ROLES_EDITA_CONTRATISTAS, puedeEditarContratistasUI, puedeGestionarContratistasUI } from '../../types/sigp/permisos'

const ts = Timestamp.fromMillis(1758480000000)

describe('entradaCambioEstado — rastro de autoría de la habilitación', () => {
  it('construye la entrada completa (quién, cuándo, de → a)', () => {
    const e = entradaCambioEstado('activo', 'inactivo',
      { uid: 'uid-ingrid', nombre: 'Ingrid', rol: 'gestion_integral' }, ts)
    expect(e).toEqual({
      campo: 'estado', de: 'activo', a: 'inactivo',
      por: 'uid-ingrid', por_nombre: 'Ingrid', por_rol: 'gestion_integral',
      fecha: ts,
    })
  })

  it('usuario sin nombre/rol → strings vacíos, jamás undefined (arrayUnion los rechaza)', () => {
    const e = entradaCambioEstado('inactivo', 'activo', { uid: 'u1' }, ts)
    expect(e.por_nombre).toBe('')
    expect(e.por_rol).toBe('')
    expect(Object.values(e).every(v => v !== undefined)).toBe(true)
  })

  it('aval de RESPALDO: la salvedad viaja recortada en la misma entrada', () => {
    const e = entradaCambioEstado('inactivo', 'activo',
      { uid: 'u-gg', nombre: 'GG', rol: 'gerencia_general' }, ts, '  Ingrid de vacaciones  ')
    expect(e.salvedad).toBe('Ingrid de vacaciones')
  })

  it('titular / salvedad vacía o en blanco → la CLAVE no existe (arrayUnion rechaza undefined; vacía no es salvedad)', () => {
    expect('salvedad' in entradaCambioEstado('activo', 'inactivo', { uid: 'u' }, ts)).toBe(false)
    expect('salvedad' in entradaCambioEstado('activo', 'inactivo', { uid: 'u' }, ts, '   ')).toBe(false)
  })
})

describe('entradaCorreccionIdentidad — quien inscribe corrige, con traza (14-oct)', () => {
  const ingrid = { uid: 'uid-ingrid', nombre: 'Ingrid', rol: 'gestion_integral' }
  it('traza los campos PÚBLICOS con valores viejo → nuevo', () => {
    const e = entradaCorreccionIdentidad(
      { nombre: 'ACME SAS', tipo: 'juridica', nit: '900111222' },
      { nombre: 'ACME S.A.S.', tipo: 'juridica', nit: '900111223' },
      ingrid, ts,
    )!
    expect(e.campo).toBe('identidad')
    expect(e.cambios).toEqual(['nombre: ACME SAS → ACME S.A.S.', 'nit: 900111222 → 900111223'])
    expect(e.por_rol).toBe('gestion_integral')
  })
  it('la CÉDULA se traza SIN valores — el historial vive en el doc público (Ley 1581)', () => {
    const e = entradaCorreccionIdentidad(
      { nombre: 'Juan', cedula: '123456789' },
      { nombre: 'Juan', cedula: '123456780' },
      ingrid, ts,
    )!
    expect(e.cambios).toEqual(['cédula actualizada'])
    expect(JSON.stringify(e)).not.toContain('123456789')
    expect(JSON.stringify(e)).not.toContain('123456780')
  })
  it('sin cambios → null (una edición sin cambios no fabrica traza-ruido)', () => {
    expect(entradaCorreccionIdentidad(
      { nombre: 'X', tipo: 'natural', nit: '', cedula: '1', usuario_tecnico_id: 'u' },
      { nombre: 'X', tipo: 'natural', nit: '', cedula: '1', usuario_tecnico_id: 'u' },
      ingrid, ts,
    )).toBeNull()
  })
  it('ultimoCambioEstado la IGNORA — el chip del aval no se confunde con una corrección', () => {
    const estado = entradaCambioEstado('inactivo', 'activo', { uid: 'u1' }, ts)
    const correccion = entradaCorreccionIdentidad({ nombre: 'A' }, { nombre: 'B' }, ingrid, ts)!
    expect(ultimoCambioEstado([estado, correccion])?.por).toBe('u1')
  })
})

describe('permisos de edición de contratistas — espejo de la vía nueva (14-oct)', () => {
  it('editan la identidad EXACTAMENTE admin + gestion_integral', () => {
    expect([...ROLES_EDITA_CONTRATISTAS].sort()).toEqual(['admin', 'gestion_integral'])
    expect(puedeEditarContratistasUI('gestion_integral')).toBe(true)
    expect(puedeEditarContratistasUI('gerencia_general')).toBe(false)
    expect(puedeEditarContratistasUI('sst')).toBe(false)
  })
  it('ELIMINAR sigue admin-only (no se amplió)', () => {
    expect(puedeGestionarContratistasUI('gestion_integral')).toBe(false)
    expect(puedeGestionarContratistasUI('admin')).toBe(true)
  })
})

describe('ultimoCambioEstado — lectura tolerante del historial', () => {
  it('sin historial o vacío → null (docs legado)', () => {
    expect(ultimoCambioEstado(undefined)).toBeNull()
    expect(ultimoCambioEstado([])).toBeNull()
  })

  it('devuelve la ÚLTIMA entrada de estado', () => {
    const a = entradaCambioEstado('activo', 'inactivo', { uid: 'u1', nombre: 'A' }, ts)
    const b = entradaCambioEstado('inactivo', 'activo', { uid: 'u2', nombre: 'B' }, ts)
    expect(ultimoCambioEstado([a, b])?.por).toBe('u2')
  })

  it('ignora entradas de otros campos o malformadas', () => {
    const a = entradaCambioEstado('activo', 'inactivo', { uid: 'u1' }, ts)
    const otras = [a, { campo: 'nombre', por: 'u9' }, null, 'basura', { campo: 'estado' }]
    expect(ultimoCambioEstado(otras)?.por).toBe('u1')
  })
})
