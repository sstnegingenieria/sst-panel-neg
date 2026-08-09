import { describe, it, expect } from 'vitest'
import {
  MATRIZ_PREVENTIVOS, TRANSPORTE_PREVENTIVO, zonaDeDepartamento, esSanAndres,
  precioPreventivo, DEPARTAMENTOS_PREVENTIVO, construirSnapshotPreventivo,
} from '../preventivos'
import type { DatosPreventivo } from '../solicitud'

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

// ── §16 (ii) — snapshot para el STAGING del nacimiento server-side ──────────
// Réplica EXACTA del shape que construía crearProyectoDesdePreventivo
// (retirado): la CF copia este objeto tal cual al proyecto.
describe('construirSnapshotPreventivo — staging §16 (ii)', () => {
  const p: DatosPreventivo = {
    sitio_id: 'IHS-777', sitio_nombre: 'VILLA MONACO', tipo_sitio: 'greenfield',
    intensidad: 'pesado', es_jungle: true, es_sai: false,
    departamento: 'Antioquia', zona: 'Z3',
  }
  const precio = precioPreventivo({ zona: 'Z3', tipo: 'greenfield', intensidad: 'pesado', es_jungle: true, es_sai: false })!

  it('shape completo con cliente registrado (nombre + NIT)', () => {
    const s = construirSnapshotPreventivo(
      { nombre_sitio: 'VILLA MONACO', codigo_sitio_cliente: 'COBAR0060' }, p, precio,
      'IHS COLOMBIA', '901.000.111-2',
    )
    expect(s).toEqual({
      cliente: 'IHS COLOMBIA',
      cliente_nit: '901.000.111-2',
      asunto: 'Mantenimiento preventivo pesado — VILLA MONACO (Greenfield · jungle · Z3)',
      nombre_sitio: 'VILLA MONACO',
      codigo_sitio_cliente: 'COBAR0060',
      valor_venta: precio.total,
      esquema_tributario: 'iva_pleno',
      alcance: [{ grupo: 'Mantenimiento preventivo pesado — VILLA MONACO', items: 1, subtotal: precio.total }],
      total_items: 1,
    })
    expect(precio.total).toBe(2_856_685)  // jungle Z3 GF pesado + transporte
  })

  it('fallbacks: sin cliente → prospecto → "IHS"; sin NIT → sin campo', () => {
    const conProspecto = construirSnapshotPreventivo({ prospecto_nombre: 'TORRES SAS' }, p, precio)
    expect(conProspecto.cliente).toBe('TORRES SAS')
    const sinNada = construirSnapshotPreventivo({}, p, precio)
    expect(sinNada.cliente).toBe('IHS')
    expect('cliente_nit' in sinNada).toBe(false)
  })

  it('sitio: solicitud vacía → cae al sitio del preventivo; código → sitio_id → N/A', () => {
    const s = construirSnapshotPreventivo({ nombre_sitio: '  ', codigo_sitio_cliente: '' }, p, precio)
    expect(s.nombre_sitio).toBe('VILLA MONACO')
    expect(s.codigo_sitio_cliente).toBe('IHS-777')
    const sinId = construirSnapshotPreventivo({}, { ...p, sitio_id: undefined }, precio)
    expect(sinId.codigo_sitio_cliente).toBe('N/A')
  })

  it('coordenadas de la solicitud viajan al snapshot; inválidas/ausentes se omiten', () => {
    const conCoords = construirSnapshotPreventivo(
      { coordenadas_sitio: { latitud: 6.24, longitud: -75.58 } }, p, precio)
    expect(conCoords.coordenadas_sitio).toEqual({ latitud: 6.24, longitud: -75.58 })
    const malformada = construirSnapshotPreventivo(
      { coordenadas_sitio: { lat: 6.24, lng: -75.58 } as never }, p, precio)
    expect('coordenadas_sitio' in malformada).toBe(false)
    expect('coordenadas_sitio' in construirSnapshotPreventivo({}, p, precio)).toBe(false)
  })

  it('asunto refleja SAI y omite jungle cuando no aplica', () => {
    const sai = construirSnapshotPreventivo({}, { ...p, es_jungle: false, es_sai: true, zona: 'Z2' },
      precioPreventivo({ zona: 'Z2', tipo: 'greenfield', intensidad: 'pesado', es_jungle: false, es_sai: true })!)
    expect(sai.asunto).toBe('Mantenimiento preventivo pesado — VILLA MONACO (Greenfield · SAI · Z2)')
  })
})
