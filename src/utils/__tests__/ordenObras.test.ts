import { describe, it, expect } from 'vitest'
import { ordenarObras, DIRECCION_ORDEN, ObraOrdenable } from '../ordenObras'

type ObraDeTest = ObraOrdenable

function obra(overrides: Partial<ObraDeTest>): ObraDeTest {
  return {
    nombre_sitio: 'Obra',
    cliente: 'Cliente',
    pendientes: 0,
    ultimoTimestamp: '',
    ...overrides,
  }
}

describe('ordenarObras — recientes (desc, sin actividad al final)', () => {
  it('ordena por ultimoTimestamp descendente', () => {
    const a = obra({ nombre_sitio: 'A', ultimoTimestamp: '2026-07-01T00:00:00.000Z' })
    const b = obra({ nombre_sitio: 'B', ultimoTimestamp: '2026-07-15T00:00:00.000Z' })
    const c = obra({ nombre_sitio: 'C', ultimoTimestamp: '2026-06-01T00:00:00.000Z' })
    expect(ordenarObras([a, b, c], 'recientes').map(o => o.nombre_sitio)).toEqual(['B', 'A', 'C'])
  })

  it('obras sin actividad (ultimoTimestamp vacío) van al final', () => {
    const conActividad = obra({ nombre_sitio: 'Con actividad', ultimoTimestamp: '2026-07-01T00:00:00.000Z' })
    const sinActividad = obra({ nombre_sitio: 'Sin actividad', ultimoTimestamp: '' })
    const resultado = ordenarObras([sinActividad, conActividad], 'recientes')
    expect(resultado.map(o => o.nombre_sitio)).toEqual(['Con actividad', 'Sin actividad'])
  })

  it('dos obras sin actividad no rompen el orden ni lanzan error', () => {
    const x = obra({ nombre_sitio: 'X', ultimoTimestamp: '' })
    const y = obra({ nombre_sitio: 'Y', ultimoTimestamp: '' })
    expect(() => ordenarObras([x, y], 'recientes')).not.toThrow()
    expect(ordenarObras([x, y], 'recientes')).toHaveLength(2)
  })
})

describe('ordenarObras — pendientes (desc)', () => {
  it('ordena por pendientes descendente', () => {
    const pocas = obra({ nombre_sitio: 'Pocas', pendientes: 1 })
    const muchas = obra({ nombre_sitio: 'Muchas', pendientes: 5 })
    const ninguna = obra({ nombre_sitio: 'Ninguna', pendientes: 0 })
    expect(ordenarObras([pocas, muchas, ninguna], 'pendientes').map(o => o.nombre_sitio))
      .toEqual(['Muchas', 'Pocas', 'Ninguna'])
  })
})

describe('ordenarObras — alfabetico (asc, por nombre de obra)', () => {
  it('ordena por nombre_sitio ascendente', () => {
    const zeta = obra({ nombre_sitio: 'Zeta' })
    const alfa = obra({ nombre_sitio: 'Alfa' })
    expect(ordenarObras([zeta, alfa], 'alfabetico').map(o => o.nombre_sitio)).toEqual(['Alfa', 'Zeta'])
  })
})

describe('ordenarObras — cliente (asc, vacío al final)', () => {
  it('ordena por cliente ascendente', () => {
    const b = obra({ nombre_sitio: 'B', cliente: 'Beta SAS' })
    const a = obra({ nombre_sitio: 'A', cliente: 'Acme SAS' })
    expect(ordenarObras([b, a], 'cliente').map(o => o.nombre_sitio)).toEqual(['A', 'B'])
  })

  it('obras sin cliente van al final', () => {
    const conCliente = obra({ nombre_sitio: 'Con cliente', cliente: 'Acme SAS' })
    const sinCliente = obra({ nombre_sitio: 'Sin cliente', cliente: '' })
    const resultado = ordenarObras([sinCliente, conCliente], 'cliente')
    expect(resultado.map(o => o.nombre_sitio)).toEqual(['Con cliente', 'Sin cliente'])
  })
})

describe('ordenarObras — no muta el array original', () => {
  it('devuelve un array nuevo', () => {
    const original = [obra({ nombre_sitio: 'A' }), obra({ nombre_sitio: 'B' })]
    const copia = [...original]
    ordenarObras(original, 'alfabetico')
    expect(original).toEqual(copia)
  })
})

describe('DIRECCION_ORDEN — dirección fija por criterio', () => {
  it('coincide con el diseño: recientes/pendientes desc, alfabetico/cliente asc', () => {
    expect(DIRECCION_ORDEN.recientes).toBe('descending')
    expect(DIRECCION_ORDEN.pendientes).toBe('descending')
    expect(DIRECCION_ORDEN.alfabetico).toBe('ascending')
    expect(DIRECCION_ORDEN.cliente).toBe('ascending')
  })
})
