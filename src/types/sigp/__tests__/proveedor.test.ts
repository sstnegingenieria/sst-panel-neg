// Módulo Compras (C1) — Proveedores, sub-bloque 2 (registro).
// Contrato: `normalizarIdentificacion` es pura (sin acentos/puntuación,
// mayúsculas); `validarProveedorNuevo` exige identificación, razón social,
// banco, tipo de cuenta, número de cuenta, RUT y certificación bancaria —
// el nombre de contacto NO es obligatorio (se puede registrar sin él).
import { describe, it, expect } from 'vitest'
import { normalizarIdentificacion, validarProveedorNuevo } from '../proveedor'
import type { DatosProveedorNuevo } from '../proveedor'

describe('normalizarIdentificacion', () => {
  it('quita puntos, guiones y espacios', () => {
    expect(normalizarIdentificacion('900.555.111-2')).toBe('9005551112')
    expect(normalizarIdentificacion('900 555 111 2')).toBe('9005551112')
  })

  it('pasa a mayúsculas', () => {
    expect(normalizarIdentificacion('ce-12345')).toBe('CE12345')
  })

  it('deja los caracteres alfanuméricos intactos', () => {
    expect(normalizarIdentificacion('ABC123')).toBe('ABC123')
  })

  it('solo símbolos/espacios devuelve cadena vacía', () => {
    expect(normalizarIdentificacion('...--- ')).toBe('')
    expect(normalizarIdentificacion('')).toBe('')
  })
})

describe('validarProveedorNuevo', () => {
  const completo: DatosProveedorNuevo = {
    identificacion: '900.555.111-2',
    razon_social: 'Proveedor de Prueba S.A.S.',
    contactoNombre: 'Juan Pérez',
    banco: 'Bancolombia',
    tipoCuenta: 'ahorros',
    numeroCuenta: '1234567890',
    rutFile: true,
    certFile: true,
  }

  it('formulario completo → sin errores', () => {
    expect(validarProveedorNuevo(completo)).toEqual({})
  })

  it('el nombre de contacto NO es obligatorio', () => {
    expect(validarProveedorNuevo({ ...completo, contactoNombre: '' })).toEqual({})
  })

  it('sin identificación (o solo símbolos) → error en identificacion', () => {
    expect(validarProveedorNuevo({ ...completo, identificacion: '' }).identificacion).toBeTruthy()
    expect(validarProveedorNuevo({ ...completo, identificacion: '...' }).identificacion).toBeTruthy()
  })

  it('sin razón social → error en razon_social', () => {
    expect(validarProveedorNuevo({ ...completo, razon_social: '  ' }).razon_social).toBeTruthy()
  })

  it('sin banco → error en banco', () => {
    expect(validarProveedorNuevo({ ...completo, banco: '' }).banco).toBeTruthy()
  })

  it('sin tipo de cuenta → error en tipoCuenta', () => {
    expect(validarProveedorNuevo({ ...completo, tipoCuenta: '' }).tipoCuenta).toBeTruthy()
  })

  it('sin número de cuenta → error en numeroCuenta', () => {
    expect(validarProveedorNuevo({ ...completo, numeroCuenta: '' }).numeroCuenta).toBeTruthy()
  })

  it('sin RUT → error en rutFile', () => {
    expect(validarProveedorNuevo({ ...completo, rutFile: false }).rutFile).toBeTruthy()
  })

  it('sin certificación bancaria → error en certFile', () => {
    expect(validarProveedorNuevo({ ...completo, certFile: false }).certFile).toBeTruthy()
  })

  it('matriz de faltantes: cada campo obligatorio ausente produce SOLO su propio error', () => {
    const casos: [keyof DatosProveedorNuevo, DatosProveedorNuevo[keyof DatosProveedorNuevo]][] = [
      ['identificacion', ''],
      ['razon_social', ''],
      ['banco', ''],
      ['tipoCuenta', ''],
      ['numeroCuenta', ''],
      ['rutFile', false],
      ['certFile', false],
    ]
    for (const [campo, valor] of casos) {
      const errores = validarProveedorNuevo({ ...completo, [campo]: valor })
      expect(Object.keys(errores), campo).toEqual([campo])
    }
  })
})
