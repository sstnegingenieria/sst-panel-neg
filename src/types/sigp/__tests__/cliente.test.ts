// Ruta B (IHS→Vertis) — resolución del cliente de preventivos por FLAG de
// dato (`usa_preventivos`), reemplazo del hardcode por nombre "ihs".
import { describe, it, expect } from 'vitest'
import { clientePreventivosDe } from '../cliente'
import type { Cliente } from '../cliente'

const cliente = (over: Partial<Cliente>): Cliente => ({
  id: 'x', nombre: 'X', nit: '1', contactos: [], estado: 'activo',
  condiciones_comerciales: { esquema_impuestos: 'iva_pleno' },
  mapeos_lpu_guardados: [],
  ...over,
} as Cliente)

describe('clientePreventivosDe — flag de dato, no nombre', () => {
  it('resuelve el cliente flaggeado ACTIVO (sin importar el nombre)', () => {
    const clientes = [
      cliente({ id: 'ihs', nombre: 'IHS TOWERS' }),                       // sin flag: el nombre ya no manda
      cliente({ id: 'vertis', nombre: 'VERTIS TORRES', usa_preventivos: true }),
    ]
    expect(clientePreventivosDe(clientes)?.id).toBe('vertis')
  })
  it('flaggeado INACTIVO no cuenta', () => {
    const clientes = [cliente({ id: 'v', usa_preventivos: true, estado: 'inactivo' })]
    expect(clientePreventivosDe(clientes)).toBeNull()
  })
  it('ninguno flaggeado → null (el form bloquea)', () => {
    expect(clientePreventivosDe([cliente({ id: 'a' }), cliente({ id: 'b' })])).toBeNull()
    expect(clientePreventivosDe([])).toBeNull()
  })
  it('dos flaggeados activos → el primero del listado (semántica singular documentada)', () => {
    const clientes = [
      cliente({ id: 'a', nombre: 'A', usa_preventivos: true }),
      cliente({ id: 'b', nombre: 'B', usa_preventivos: true }),
    ]
    expect(clientePreventivosDe(clientes)?.id).toBe('a')
  })
  it("el nombre con 'ihs' SIN flag ya no resuelve (regresión del hardcode)", () => {
    expect(clientePreventivosDe([cliente({ id: 'ihs', nombre: 'IHS TOWERS' })])).toBeNull()
  })
})

// 04-nov — NIT único al guardar (caso Edificio Universal duplicado: Giovanny
// y Paula crearon el mismo cliente por separado, mismo NIT, ambos activos).
import { clientePorNit, nitSoloDigitos } from '../cliente'

describe('clientePorNit — el NIT identifica, el nombre no bloquea', () => {
  const base = [
    cliente({ id: 'eu1', nombre: 'EDIFICIO UNIVERSAL', nit: '860.078.368-0', estado: 'activo' }),
    cliente({ id: 'ihs', nombre: 'IHS TOWERS', nit: '900.616.308-2', estado: 'inactivo' }),
    cliente({ id: 'ver', nombre: 'VERTIS TORRES', nit: '900.616.308-2', estado: 'activo' }),
  ]
  it('NIT ya registrado → devuelve al existente (con puntuación distinta también)', () => {
    expect(clientePorNit('860.078.368-0', base)?.id).toBe('eu1')
    expect(clientePorNit('8600783680', base)?.id).toBe('eu1')
    expect(clientePorNit('860078368-0', base)?.id).toBe('eu1')
  })
  it('con duplicados históricos prefiere el ACTIVO (caso IHS/Vertis)', () => {
    expect(clientePorNit('900.616.308-2', base)?.id).toBe('ver')
  })
  it('excluir al que se edita: su propio NIT no es duplicado', () => {
    expect(clientePorNit('860.078.368-0', base, 'eu1')).toBeNull()
  })
  it('match inactivo se reporta (para ofrecer reactivar, no duplicar)', () => {
    const soloIhs = base.filter(c => c.id !== 'ver')
    const m = clientePorNit('900.616.308-2', soloIhs)
    expect(m?.id).toBe('ihs')
    expect(m?.estado).toBe('inactivo')
  })
  it('NIT incompleto (<10 dígitos) o sin coincidencia → null', () => {
    expect(clientePorNit('860.078', base)).toBeNull()
    expect(clientePorNit('900.975.870-1', base)).toBeNull()
    expect(clientePorNit('', base)).toBeNull()
  })
  it('nitSoloDigitos normaliza puntos, espacios y guion', () => {
    expect(nitSoloDigitos(' 860.078.368-0 ')).toBe('8600783680')
    expect(nitSoloDigitos('abc')).toBe('')
  })
})
