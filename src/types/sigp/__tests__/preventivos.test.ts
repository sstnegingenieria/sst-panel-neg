import { describe, it, expect } from 'vitest'
import {
  MATRIZ_PREVENTIVOS, TRANSPORTE_PREVENTIVO, zonaDeDepartamento, esSanAndres,
  precioPreventivo, DEPARTAMENTOS_PREVENTIVO,
} from '../preventivos'

describe('matriz de preventivos IHS', () => {
  it('tiene los 9 renglones del contrato (3 zonas × {GF pesado, GF liviano, RT pesado})', () => {
    expect(MATRIZ_PREVENTIVOS).toHaveLength(9)
    for (const z of ['Z1', 'Z2', 'Z3'] as const) {
      const deZona = MATRIZ_PREVENTIVOS.filter(r => r.zona === z)
      expect(deZona).toHaveLength(3)
      expect(deZona.some(r => r.tipo === 'rooftop' && r.intensidad === 'liviano')).toBe(false)
    }
  })

  it('mapea departamentos a zonas (tildes y mayúsculas indiferentes)', () => {
    expect(zonaDeDepartamento('Bogotá')).toBe('Z1')
    expect(zonaDeDepartamento('bogota')).toBe('Z1')
    expect(zonaDeDepartamento('BOYACÁ')).toBe('Z1')
    expect(zonaDeDepartamento('Atlántico')).toBe('Z2')
    expect(zonaDeDepartamento('San Andrés')).toBe('Z2')
    expect(zonaDeDepartamento('Antioquia')).toBe('Z3')
    expect(zonaDeDepartamento('Valle del Cauca')).toBe('Z3')
    expect(zonaDeDepartamento('Amazonas')).toBeNull()   // fuera del contrato
  })

  it('todos los departamentos del selector tienen zona', () => {
    for (const d of DEPARTAMENTOS_PREVENTIVO) expect(zonaDeDepartamento(d)).not.toBeNull()
  })

  it('detecta San Andrés (SAI) sin importar tildes', () => {
    expect(esSanAndres('San Andrés')).toBe(true)
    expect(esSanAndres('san andres')).toBe(true)
    expect(esSanAndres('Sucre')).toBe(false)
  })
})

describe('precioPreventivo', () => {
  const base = { es_jungle: false, es_sai: false }

  it('caso normal: valor de matriz sin transporte', () => {
    expect(precioPreventivo({ zona: 'Z1', tipo: 'greenfield', intensidad: 'pesado', ...base }))
      .toEqual({ base: 1_246_466, transporte: 0, total: 1_246_466 })
    expect(precioPreventivo({ zona: 'Z2', tipo: 'rooftop', intensidad: 'pesado', ...base }))
      .toEqual({ base: 1_152_193, transporte: 0, total: 1_152_193 })
  })

  it('jungle: valor jungle + transporte', () => {
    expect(precioPreventivo({ zona: 'Z3', tipo: 'greenfield', intensidad: 'pesado', es_jungle: true, es_sai: false }))
      .toEqual({ base: 1_776_685, transporte: TRANSPORTE_PREVENTIVO, total: 2_856_685 })
    expect(precioPreventivo({ zona: 'Z1', tipo: 'rooftop', intensidad: 'pesado', es_jungle: true, es_sai: false }))
      .toEqual({ base: 1_426_613, transporte: TRANSPORTE_PREVENTIVO, total: 2_506_613 })
  })

  it('San Andrés (SAI): valor normal + transporte aunque NO sea jungle', () => {
    expect(precioPreventivo({ zona: 'Z2', tipo: 'greenfield', intensidad: 'liviano', es_jungle: false, es_sai: true }))
      .toEqual({ base: 1_051_763, transporte: TRANSPORTE_PREVENTIVO, total: 2_131_763 })
  })

  it('jungle en San Andrés: el transporte se cobra UNA sola vez', () => {
    expect(precioPreventivo({ zona: 'Z2', tipo: 'greenfield', intensidad: 'pesado', es_jungle: true, es_sai: true }))
      .toEqual({ base: 1_600_336, transporte: TRANSPORTE_PREVENTIVO, total: 2_680_336 })
  })

  it('rooftop liviano no existe → null (no disponible)', () => {
    for (const zona of ['Z1', 'Z2', 'Z3'] as const)
      expect(precioPreventivo({ zona, tipo: 'rooftop', intensidad: 'liviano', ...base })).toBeNull()
  })
})
