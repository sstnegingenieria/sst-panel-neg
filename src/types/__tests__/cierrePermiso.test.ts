import { describe, it, expect } from 'vitest'
import { cierrePermisoDe, TIPOS_PERMISO_CON_CIERRE } from '../formulario'

const f = (tipo: string, campos: Record<string, unknown> = {}) => ({ tipo, campos_dinamicos: campos })

describe('cierrePermisoDe', () => {
  it('los 4 permisos tienen cierre', () => {
    expect([...TIPOS_PERMISO_CON_CIERRE].sort()).toEqual([
      'permiso_alturas', 'permiso_caliente', 'permiso_electrico', 'permiso_espacios_confinados',
    ])
  })

  it('cerrado: el caso real de prod (fase completado + hora + supervisor + Favorable)', () => {
    const c = cierrePermisoDe(f('permiso_caliente', {
      fase_permiso: 'completado', hora_cierre: '5:00 pm',
      supervisor_cierre_nombre: 'Juan Carlos Quesada Aldana ', condicion_final: 'Favorable',
    }))
    expect(c).toMatchObject({
      estado: 'cerrado', hora: '5:00 pm', supervisor: 'Juan Carlos Quesada Aldana',
      condicionFinal: 'Favorable', noFavorable: false,
    })
    expect(c?.observaciones).toBeUndefined()
  })

  it('"No favorable" se marca para resaltar (sin importar mayúsculas)', () => {
    expect(cierrePermisoDe(f('permiso_alturas', { fase_permiso: 'completado', condicion_final: 'No favorable' }))?.noFavorable).toBe(true)
    expect(cierrePermisoDe(f('permiso_alturas', { fase_permiso: 'completado', condicion_final: 'FAVORABLE' }))?.noFavorable).toBe(false)
  })

  it('abierto: fase apertura y sin datos de cierre', () => {
    expect(cierrePermisoDe(f('permiso_alturas', { fase_permiso: 'apertura' })))
      .toEqual({ estado: 'abierto', noFavorable: false })
  })

  it('datos de cierre con valor cuentan como cierre aunque la fase no diga completado', () => {
    expect(cierrePermisoDe(f('permiso_electrico', { fase_permiso: 'apertura', hora_cierre: '6:30 pm' }))?.estado).toBe('cerrado')
    expect(cierrePermisoDe(f('permiso_espacios_confinados', { observaciones_cierre: 'Sin novedad' }))?.estado).toBe('cerrado')
  })

  it('completado sin ningún detalle sigue siendo cerrado (sin inventar datos)', () => {
    expect(cierrePermisoDe(f('permiso_caliente', { fase_permiso: 'completado' })))
      .toEqual({ estado: 'cerrado', noFavorable: false })
  })

  it('datos de cierre vacíos o solo espacios NO cuentan', () => {
    expect(cierrePermisoDe(f('permiso_alturas', { fase_permiso: 'apertura', hora_cierre: '  ', condicion_final: '' }))?.estado).toBe('abierto')
  })

  it('permiso sin fase ni datos (anterior al flujo de fases) → null, no se afirma "abierto"', () => {
    expect(cierrePermisoDe(f('permiso_alturas', {}))).toBeNull()
  })

  it('tipos que no son permiso → null aunque traigan campos de cierre', () => {
    expect(cierrePermisoDe(f('ats', { fase_permiso: 'apertura' }))).toBeNull()
    expect(cierrePermisoDe(f('preoperacional', { hora_cierre: '5 pm' }))).toBeNull()
  })

  it('tolera tipos inesperados en los campos', () => {
    expect(cierrePermisoDe(f('permiso_alturas', { fase_permiso: 'apertura', hora_cierre: 5, condicion_final: null }))?.estado).toBe('abierto')
  })
})
