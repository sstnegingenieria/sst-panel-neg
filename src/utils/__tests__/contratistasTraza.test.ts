import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { entradaCambioEstado, ultimoCambioEstado } from '../contratistasTraza'

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
