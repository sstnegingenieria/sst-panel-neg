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
