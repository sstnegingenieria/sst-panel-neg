// Preventivos IHS (SIGP F2.2) — matriz de precios pactada y cálculo puro.
//
// La matriz vive como DATO VERSIONADO EN CÓDIGO (cambia por PR, auditable);
// no requiere colección ni regla Firestore. Cuando el contrato se renegocie,
// se actualiza este archivo.
//
// Reglas de cálculo (contrato IHS):
//   precio_base = es_jungle ? valor_jungle : valor_normal
//   + TRANSPORTE (1.080.000) si es_jungle O el sitio es San Andrés (SAI)
//   esquema tributario = IVA pleno (el IVA se aplica aguas abajo, en la
//   facturación del módulo futuro de Administrativa)
//   rooftop solo existe en intensidad 'pesado' → otra combinación = no disponible

export type ZonaPreventivo = 'Z1' | 'Z2' | 'Z3'
export type TipoSitio = 'greenfield' | 'rooftop'
export type IntensidadPreventivo = 'liviano' | 'pesado'

export const TIPO_SITIO_LABEL: Record<TipoSitio, string> = {
  greenfield: 'Greenfield',
  rooftop: 'Rooftop',
}

export const INTENSIDAD_LABEL: Record<IntensidadPreventivo, string> = {
  liviano: 'Liviano',
  pesado: 'Pesado',
}

export const TRANSPORTE_PREVENTIVO = 1_080_000

export interface RenglonMatriz {
  zona: ZonaPreventivo
  tipo: TipoSitio
  intensidad: IntensidadPreventivo
  valor_normal: number
  valor_jungle: number
}

export const MATRIZ_PREVENTIVOS: RenglonMatriz[] = [
  { zona: 'Z1', tipo: 'greenfield', intensidad: 'pesado', valor_normal: 1_246_466, valor_jungle: 1_558_083 },
  { zona: 'Z1', tipo: 'greenfield', intensidad: 'liviano', valor_normal: 1_051_763, valor_jungle: 1_314_704 },
  { zona: 'Z1', tipo: 'rooftop', intensidad: 'pesado', valor_normal: 1_141_290, valor_jungle: 1_426_613 },
  { zona: 'Z2', tipo: 'greenfield', intensidad: 'pesado', valor_normal: 1_280_269, valor_jungle: 1_600_336 },
  { zona: 'Z2', tipo: 'greenfield', intensidad: 'liviano', valor_normal: 1_051_763, valor_jungle: 1_314_704 },
  { zona: 'Z2', tipo: 'rooftop', intensidad: 'pesado', valor_normal: 1_152_193, valor_jungle: 1_440_242 },
  { zona: 'Z3', tipo: 'greenfield', intensidad: 'pesado', valor_normal: 1_421_348, valor_jungle: 1_776_685 },
  { zona: 'Z3', tipo: 'greenfield', intensidad: 'liviano', valor_normal: 1_279_620, valor_jungle: 1_599_525 },
  { zona: 'Z3', tipo: 'rooftop', intensidad: 'pesado', valor_normal: 1_379_941, valor_jungle: 1_724_927 },
]

// Zona por departamento (contrato IHS). Claves normalizadas sin tildes/case.
const ZONA_POR_DEPARTAMENTO: Record<string, ZonaPreventivo> = {
  'bogota': 'Z1', 'casanare': 'Z1', 'cundinamarca': 'Z1', 'meta': 'Z1',
  'santander': 'Z1', 'boyaca': 'Z1', 'tolima': 'Z1',
  'atlantico': 'Z2', 'bolivar': 'Z2', 'cesar': 'Z2', 'cordoba': 'Z2',
  'guajira': 'Z2', 'la guajira': 'Z2', 'magdalena': 'Z2', 'san andres': 'Z2', 'sucre': 'Z2',
  'antioquia': 'Z3', 'cauca': 'Z3', 'narino': 'Z3', 'quindio': 'Z3',
  'risaralda': 'Z3', 'valle del cauca': 'Z3', 'putumayo': 'Z3',
}

/** Departamentos cubiertos, para el selector de la UI (orden alfabético). */
export const DEPARTAMENTOS_PREVENTIVO = [
  'Antioquia', 'Atlántico', 'Bogotá', 'Bolívar', 'Boyacá', 'Casanare', 'Cauca',
  'Cesar', 'Córdoba', 'Cundinamarca', 'Guajira', 'Magdalena', 'Meta', 'Nariño',
  'Putumayo', 'Quindío', 'Risaralda', 'San Andrés', 'Santander', 'Sucre',
  'Tolima', 'Valle del Cauca',
]

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

export function zonaDeDepartamento(departamento: string): ZonaPreventivo | null {
  return ZONA_POR_DEPARTAMENTO[normalizar(departamento)] ?? null
}

/** San Andrés lleva transporte SIEMPRE (isla), además del caso jungle. */
export const esSanAndres = (departamento: string) => normalizar(departamento) === 'san andres'

export interface ParametrosPrecio {
  zona: ZonaPreventivo
  tipo: TipoSitio
  intensidad: IntensidadPreventivo
  es_jungle: boolean
  es_sai: boolean
}

export interface PrecioPreventivo {
  base: number         // valor de matriz (normal o jungle)
  transporte: number   // 0 o TRANSPORTE_PREVENTIVO
  total: number        // base + transporte — el valor_venta del proyecto
}

/** Precio del preventivo según la matriz; null = combinación no disponible
 *  (p. ej. rooftop liviano). */
export function precioPreventivo(p: ParametrosPrecio): PrecioPreventivo | null {
  const renglon = MATRIZ_PREVENTIVOS.find(r =>
    r.zona === p.zona && r.tipo === p.tipo && r.intensidad === p.intensidad)
  if (!renglon) return null
  const base = p.es_jungle ? renglon.valor_jungle : renglon.valor_normal
  const transporte = p.es_jungle || p.es_sai ? TRANSPORTE_PREVENTIVO : 0
  return { base, transporte, total: base + transporte }
}
