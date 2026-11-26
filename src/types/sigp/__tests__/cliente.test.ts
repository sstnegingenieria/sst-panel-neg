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

// ── 26-nov-2026: tipo de identificación (clientes persona natural) ──────────
import {
  tipoIdentificacionDe, validarIdentificacionCliente, clientePorIdentificacion,
} from '../cliente'

describe('tipoIdentificacionDe — migración perezosa', () => {
  it('ausente = nit (los clientes previos son personas jurídicas; prod no se toca)', () => {
    expect(tipoIdentificacionDe(cliente({}))).toBe('nit')
    expect(tipoIdentificacionDe(cliente({ tipo_identificacion: 'cc' }))).toBe('cc')
    expect(tipoIdentificacionDe(cliente({ tipo_identificacion: 'nit' }))).toBe('nit')
  })
})

describe('validarIdentificacionCliente — el DV solo aplica cuando el tipo es NIT', () => {
  it('nit: formato + DV DIAN (el DV de 900.975.870 es 1 — NIT real de NEG)', () => {
    expect(validarIdentificacionCliente('nit', '900.975.870-1').ok).toBe(true)
    const malDv = validarIdentificacionCliente('nit', '900.975.870-7')
    expect(malDv.ok).toBe(false)
    if (!malDv.ok) expect(malDv.error).toContain('el DV es 1')
    expect(validarIdentificacionCliente('nit', '123456789').ok).toBe(false)   // sin formato
    expect(validarIdentificacionCliente('nit', '').ok).toBe(false)
  })
  it('cc: reglas del normalizador de nómina — 6 a 12 dígitos, sin letras, separadores tolerados', () => {
    expect(validarIdentificacionCliente('cc', '1234567890').ok).toBe(true)
    expect(validarIdentificacionCliente('cc', '1.234.567.890').ok).toBe(true)  // puntos tolerados
    expect(validarIdentificacionCliente('cc', '52 123 456').ok).toBe(true)     // espacios tolerados
    expect(validarIdentificacionCliente('cc', '12345').ok).toBe(false)         // < 6 dígitos
    expect(validarIdentificacionCliente('cc', '1234567890123').ok).toBe(false) // > 12 dígitos
    expect(validarIdentificacionCliente('cc', 'AB123456').ok).toBe(false)      // letras (pasaporte/PPT)
    expect(validarIdentificacionCliente('cc', '').ok).toBe(false)
  })
  it('cc NO pasa por el DV: una cédula que como NIT tendría DV errado es válida', () => {
    // '900.975.870-7' como NIT falla el DV; los mismos dígitos como cédula
    // (9009758707, 10 dígitos) son una cédula plausible.
    expect(validarIdentificacionCliente('cc', '9009758707').ok).toBe(true)
  })
})

describe('clientePorIdentificacion — duplicados por dígitos SIN importar el tipo', () => {
  const existentes = [
    cliente({ id: 'j', nombre: 'JURÍDICA SAS', nit: '900.975.870-1' }),          // nit implícito
    cliente({ id: 'n', nombre: 'PERSONA NATURAL', nit: '52.123.456', tipo_identificacion: 'cc' }),
    cliente({ id: 'inactivo', nombre: 'VIEJA', nit: '52.999.888', tipo_identificacion: 'cc', estado: 'inactivo' }),
  ]
  it('cédula repetida = duplicado (mismos dígitos, puntuación distinta)', () => {
    expect(clientePorIdentificacion('52123456', 'cc', existentes)?.id).toBe('n')
  })
  it('cruza tipos: teclear como CÉDULA los dígitos de un NIT guardado también avisa', () => {
    expect(clientePorIdentificacion('9009758701', 'cc', existentes)?.id).toBe('j')
  })
  it('umbral por tipo: no avisa mientras se teclea (cc < 6 dígitos, nit < 10)', () => {
    expect(clientePorIdentificacion('52123', 'cc', existentes)).toBeNull()
    expect(clientePorIdentificacion('900.975.87', 'nit', existentes)).toBeNull()
  })
  it('excluye al que se edita y encuentra inactivos', () => {
    expect(clientePorIdentificacion('52123456', 'cc', existentes, 'n')).toBeNull()
    expect(clientePorIdentificacion('52999888', 'cc', existentes)?.id).toBe('inactivo')
  })
})
