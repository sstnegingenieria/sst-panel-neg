import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  enmascararCedula, buscarDuplicadoPorCedula, buscarVinculoDuplicado, validarEmpleado,
  construirAlta, construirEdicion, patchBaja, patchReactivar,
  fechaInputATimestamp, timestampAFechaInput, EMPLEADO_FORM_VACIO,
  type EmpleadoFormData,
} from '../empleadosDirectos'

const AHORA = Timestamp.fromDate(new Date(2026, 8, 24, 10, 0, 0))

const form = (over: Partial<EmpleadoFormData> = {}): EmpleadoFormData => ({
  ...EMPLEADO_FORM_VACIO,
  nombre: 'Ana María Pérez',
  cedula: '1.020.345.678',
  cargo: 'Ingeniera SST',
  area: 'HSEQ',
  tipo_contrato: 'indefinido',
  fecha_ingreso: '2024-03-01',
  ...over,
})

const existentes = [
  { id: 'e1', nombre: 'Luis Gómez', cedula: '79123456', user_uid: 'uid-1' },
  { id: 'e2', nombre: 'Marta Ruiz', cedula: '52987654', user_uid: null },
]

describe('enmascararCedula', () => {
  it('deja visibles los 4 últimos dígitos', () => {
    expect(enmascararCedula('1020345678')).toBe('••••••5678')
  })
  it('cédulas cortas se enmascaran completas y vacío no rompe', () => {
    expect(enmascararCedula('1234')).toBe('••••')
    expect(enmascararCedula('')).toBe('')
  })
})

describe('fechas', () => {
  it('ida y vuelta yyyy-mm-dd sin corrimiento de día', () => {
    expect(timestampAFechaInput(fechaInputATimestamp('2024-03-01'))).toBe('2024-03-01')
    expect(timestampAFechaInput(fechaInputATimestamp('2026-12-31'))).toBe('2026-12-31')
  })
  it('timestamp nulo devuelve vacío', () => {
    expect(timestampAFechaInput(null)).toBe('')
  })
})

describe('duplicados', () => {
  it('detecta la misma cédula en otro empleado', () => {
    expect(buscarDuplicadoPorCedula(existentes, '79123456')?.id).toBe('e1')
  })
  it('excluye al propio empleado al editar', () => {
    expect(buscarDuplicadoPorCedula(existentes, '79123456', 'e1')).toBeNull()
  })
  it('detecta un usuario ya vinculado a otro empleado', () => {
    expect(buscarVinculoDuplicado(existentes, 'uid-1')?.id).toBe('e1')
    expect(buscarVinculoDuplicado(existentes, 'uid-1', 'e1')).toBeNull()
    expect(buscarVinculoDuplicado(existentes, '')).toBeNull()
  })
})

describe('validarEmpleado', () => {
  it('un formulario completo no tiene errores', () => {
    expect(validarEmpleado(form(), existentes)).toEqual({})
  })
  it('exige los campos obligatorios', () => {
    const e = validarEmpleado(EMPLEADO_FORM_VACIO, existentes)
    expect(Object.keys(e).sort()).toEqual(['area', 'cargo', 'cedula', 'fecha_ingreso', 'nombre', 'tipo_contrato'])
  })
  it('la cédula solo admite dígitos (con separadores tolerados)', () => {
    expect(validarEmpleado(form({ cedula: 'AB123456' }), existentes).cedula).toMatch(/dígitos/)
    expect(validarEmpleado(form({ cedula: '12345' }), existentes).cedula).toMatch(/inválida/)
    expect(validarEmpleado(form({ cedula: '1234567890123' }), existentes).cedula).toMatch(/inválida/)
  })
  it('rechaza cédula duplicada aunque venga con puntos', () => {
    expect(validarEmpleado(form({ cedula: '79.123.456' }), existentes).cedula).toMatch(/Luis Gómez/)
  })
  it('al editar, la propia cédula no cuenta como duplicado', () => {
    expect(validarEmpleado(form({ cedula: '79.123.456' }), existentes, 'e1').cedula).toBeUndefined()
  })
  it('valida correo y vínculo de usuario duplicado', () => {
    expect(validarEmpleado(form({ email: 'no-es-correo' }), existentes).email).toBeDefined()
    expect(validarEmpleado(form({ user_uid: 'uid-1' }), existentes).user_uid).toMatch(/Luis Gómez/)
  })
})

describe('builders de writes', () => {
  it('alta: cédula normalizada, activo, sin retiro y auditoría completa', () => {
    const d = construirAlta(form({ user_uid: 'uid-9', email: ' ana@neg.co ' }), 'uid-admin', AHORA)
    expect(d.cedula).toBe('1020345678')
    expect(d.activo).toBe(true)
    expect(d.fecha_retiro).toBeNull()
    expect(d.user_uid).toBe('uid-9')
    expect(d.email).toBe('ana@neg.co')
    expect(d.cargado_por).toBe('uid-admin')
    expect(d.actualizado_por).toBe('uid-admin')
    expect(d.fecha_carga).toBe(AHORA)
    expect(d.fecha_actualizacion).toBe(AHORA)
  })
  it('alta sin vínculo ni correo: user_uid null y sin campo email', () => {
    const d = construirAlta(form(), 'uid-admin', AHORA)
    expect(d.user_uid).toBeNull()
    expect('email' in d).toBe(false)
  })
  it('edición jamás toca cargado_por, fecha_carga ni el estado de baja', () => {
    const d = construirEdicion(form(), 'uid-otro', AHORA)
    expect('cargado_por' in d).toBe(false)
    expect('fecha_carga' in d).toBe(false)
    expect('activo' in d).toBe(false)
    expect('fecha_retiro' in d).toBe(false)
    expect(d.actualizado_por).toBe('uid-otro')
  })
  it('baja soft: fecha_retiro + activo=false, nunca borra', () => {
    const p = patchBaja('2026-09-30', fechaInputATimestamp('2024-03-01'), 'uid-admin', AHORA)
    expect(p?.activo).toBe(false)
    expect(timestampAFechaInput(p?.fecha_retiro)).toBe('2026-09-30')
    expect(p?.actualizado_por).toBe('uid-admin')
  })
  it('baja rechaza fecha vacía o anterior al ingreso', () => {
    const ingreso = fechaInputATimestamp('2024-03-01')
    expect(patchBaja('', ingreso, 'u', AHORA)).toBeNull()
    expect(patchBaja('2024-02-28', ingreso, 'u', AHORA)).toBeNull()
  })
  it('reactivar limpia la fecha de retiro', () => {
    const p = patchReactivar('uid-admin', AHORA)
    expect(p.activo).toBe(true)
    expect(p.fecha_retiro).toBeNull()
  })
})
