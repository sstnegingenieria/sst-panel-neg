// Geo-control SST (PR #75) + captura de coordenadas del sitio (SIGP).
// Cubre el getEstadoGeo REAL de SST (distancias Haversine verificables) y los
// helpers de captura que alimentan obras.coordenadas_sitio desde el pipeline.
import { describe, it, expect } from 'vitest'
import {
  calcularDistanciaHaversine, getEstadoGeo, RADIO_SITIO_METROS,
  esCoordenadaValida, parseCoordenadasPegadas, urlVerificarEnMaps,
} from '../geo'

// Punto de referencia: Bogotá centro. 0.001° de latitud ≈ 111.2 m.
const OBRA = { latitud: 4.60971, longitud: -74.08175 }

describe('calcularDistanciaHaversine', () => {
  it('mismo punto → 0 m', () => {
    expect(calcularDistanciaHaversine(OBRA.latitud, OBRA.longitud, OBRA.latitud, OBRA.longitud)).toBe(0)
  })
  it('0.001° de latitud ≈ 111 m (dentro del radio de sitio)', () => {
    const d = calcularDistanciaHaversine(OBRA.latitud, OBRA.longitud, OBRA.latitud + 0.001, OBRA.longitud)
    expect(d).toBeGreaterThan(105)
    expect(d).toBeLessThan(118)
  })
  it('0.01° de latitud ≈ 1.112 m (fuera del radio)', () => {
    const d = calcularDistanciaHaversine(OBRA.latitud, OBRA.longitud, OBRA.latitud + 0.01, OBRA.longitud)
    expect(d).toBeGreaterThan(RADIO_SITIO_METROS)
  })
})

describe('getEstadoGeo — semántica del control de sitio', () => {
  it('GPS a menos de 200 m → en_sitio con distancia', () => {
    const r = getEstadoGeo({ latitud: OBRA.latitud + 0.001, longitud: OBRA.longitud }, OBRA)
    expect(r.estado).toBe('en_sitio')
    expect(r.distanciaMetros).toBeLessThan(RADIO_SITIO_METROS)
  })
  it('GPS a más de 200 m → fuera_de_sitio con distancia', () => {
    const r = getEstadoGeo({ latitud: OBRA.latitud + 0.01, longitud: OBRA.longitud }, OBRA)
    expect(r.estado).toBe('fuera_de_sitio')
    expect(r.distanciaMetros).toBeGreaterThan(RADIO_SITIO_METROS)
  })
  it('formulario sin GPS → sin_ubicacion', () => {
    expect(getEstadoGeo(null, OBRA).estado).toBe('sin_ubicacion')
    expect(getEstadoGeo(undefined, OBRA).estado).toBe('sin_ubicacion')
  })
  it('RETROCOMPAT: obra sin coordenadas_sitio → sin_referencia (no es alerta)', () => {
    expect(getEstadoGeo({ latitud: 4.6, longitud: -74.08 }, null).estado).toBe('sin_referencia')
    expect(getEstadoGeo({ latitud: 4.6, longitud: -74.08 }, undefined).estado).toBe('sin_referencia')
  })
})

describe('esCoordenadaValida — guard del shape canónico {latitud, longitud}', () => {
  it('acepta el par válido y los bordes de rango', () => {
    expect(esCoordenadaValida(OBRA)).toBe(true)
    expect(esCoordenadaValida({ latitud: 90, longitud: 180 })).toBe(true)
    expect(esCoordenadaValida({ latitud: -90, longitud: -180 })).toBe(true)
  })
  it('rechaza fuera de rango, no-finitos y shapes ajenos', () => {
    expect(esCoordenadaValida({ latitud: 91, longitud: 0 })).toBe(false)
    expect(esCoordenadaValida({ latitud: 0, longitud: 181 })).toBe(false)
    expect(esCoordenadaValida({ latitud: NaN, longitud: 0 })).toBe(false)
    expect(esCoordenadaValida({ latitud: Infinity, longitud: 0 })).toBe(false)
    expect(esCoordenadaValida({ lat: 4.6, lng: -74 })).toBe(false)      // shape viejo {lat,lng} — NO canónico
    expect(esCoordenadaValida({ latitud: '4.6', longitud: '-74' })).toBe(false)
    expect(esCoordenadaValida(null)).toBe(false)
    expect(esCoordenadaValida(undefined)).toBe(false)
    expect(esCoordenadaValida('4.6,-74')).toBe(false)
  })
})

describe('parseCoordenadasPegadas — par pegado desde Google Maps', () => {
  it('formato Maps "lat, lng"', () => {
    expect(parseCoordenadasPegadas('4.60971, -74.08175')).toEqual({ latitud: 4.60971, longitud: -74.08175 })
  })
  it('coma sin espacio, punto y coma, y solo espacios', () => {
    expect(parseCoordenadasPegadas('4.60971,-74.08175')).toEqual({ latitud: 4.60971, longitud: -74.08175 })
    expect(parseCoordenadasPegadas('4.60971; -74.08175')).toEqual({ latitud: 4.60971, longitud: -74.08175 })
    expect(parseCoordenadasPegadas('4.60971 -74.08175')).toEqual({ latitud: 4.60971, longitud: -74.08175 })
  })
  it('coma decimal (es-CO) con separador de espacio', () => {
    expect(parseCoordenadasPegadas('4,60971 -74,08175')).toEqual({ latitud: 4.60971, longitud: -74.08175 })
  })
  it('rechaza texto no-par, un solo número y pares fuera de rango', () => {
    expect(parseCoordenadasPegadas('Bogotá')).toBeNull()
    expect(parseCoordenadasPegadas('4.60971')).toBeNull()
    expect(parseCoordenadasPegadas('4.6, -74.08, 99')).toBeNull()
    expect(parseCoordenadasPegadas('91, -74')).toBeNull()          // lat fuera de rango
    expect(parseCoordenadasPegadas('4.6, -181')).toBeNull()        // lng fuera de rango
    expect(parseCoordenadasPegadas('')).toBeNull()
  })
})

describe('urlVerificarEnMaps', () => {
  it('arma la URL de Google Maps con el par', () => {
    expect(urlVerificarEnMaps(OBRA)).toBe('https://www.google.com/maps?q=4.60971,-74.08175')
  })
})
