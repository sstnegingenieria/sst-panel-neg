// Radio (en metros) dentro del cual un formulario se considera diligenciado en el sitio de la obra
export const RADIO_SITIO_METROS = 200

// Distancia en metros entre dos coordenadas GPS usando la fórmula del haversine
export function calcularDistanciaHaversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // radio de la Tierra en metros
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return 2 * R * Math.asin(Math.sqrt(a))
}

export type EstadoGeo = 'en_sitio' | 'fuera_de_sitio' | 'sin_ubicacion' | 'sin_referencia'

// Estado geográfico de un formulario respecto a las coordenadas de referencia de su obra.
// `sin_referencia` NO es un estado de alerta: la obra simplemente no tiene coordenadas configuradas.
export function getEstadoGeo(
  ubicacionFormulario: { latitud: number; longitud: number } | undefined | null,
  coordenadasObra: { latitud: number; longitud: number } | undefined | null,
): { estado: EstadoGeo; distanciaMetros?: number } {
  if (!ubicacionFormulario || !Number.isFinite(ubicacionFormulario.latitud) || !Number.isFinite(ubicacionFormulario.longitud))
    return { estado: 'sin_ubicacion' }
  if (!coordenadasObra || !Number.isFinite(coordenadasObra.latitud) || !Number.isFinite(coordenadasObra.longitud))
    return { estado: 'sin_referencia' }
  const distancia = calcularDistanciaHaversine(
    ubicacionFormulario.latitud, ubicacionFormulario.longitud,
    coordenadasObra.latitud, coordenadasObra.longitud,
  )
  if (distancia > RADIO_SITIO_METROS) return { estado: 'fuera_de_sitio', distanciaMetros: distancia }
  return { estado: 'en_sitio', distanciaMetros: distancia }
}
