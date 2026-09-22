import { Timestamp } from 'firebase/firestore'

/**
 * Módulo Indicadores SG-SST (F1 — captura manual + tablero).
 * Digitaliza el "PLAN DE EVALUACIÓN POR INDICADORES DEL SG-SST" (SST-PLA-EI-24).
 *
 * `valor` y `cumple` NUNCA se persisten — se calculan en el front a partir de
 * numerador/denominador/factor/meta (ver utils/indicadoresCalc.ts). Así una
 * corrección de meta o de fórmula no exige reescribir mediciones históricas.
 */
export type TipoIndicador = 'estructura' | 'proceso' | 'resultado' | 'estandar_minimo'

export const TIPO_INDICADOR_LABELS: Record<TipoIndicador, string> = {
  estructura: 'Estructura',
  proceso: 'Proceso',
  resultado: 'Resultado',
  estandar_minimo: 'Estándar mínimo',
}

export const TIPO_INDICADOR_COLOR: Record<TipoIndicador, string> = {
  estructura: 'bg-brand-100 text-brand-800',
  proceso: 'bg-sky-100 text-sky-800',
  resultado: 'bg-purple-100 text-purple-800',
  estandar_minimo: 'bg-amber-100 text-amber-800',
}

export interface Indicador {
  id: string
  codigo: string
  nombre: string
  tipo: TipoIndicador
  label_numerador: string
  label_denominador: string
  /** Multiplicador de la fórmula (100 | 1000 | 240000, según el indicador). */
  factor: number
  frecuencia: 'anual'
  /** F1 = siempre 'manual'. F2 agregará 'auto' leyendo `fuente_auto`. */
  origen_dato: 'manual'
  /** Hint de dónde saldría el dato en F2 (auto-alimentación). No usado en F1. */
  fuente_auto: string
  /**
   * true en los 6 "estándar mínimo" (Severidad, Frecuencia, Mortalidad,
   * Prevalencia EL, Incidencia EL, Ausentismo): usan doble fórmula histórica
   * (Res. 1111/2017) / vigente (Res. 0312/2019) y Gestión Integral confirmará
   * cuál digitalizar. Mientras esté en true, el tablero NO pinta semáforo
   * (solo el valor crudo) — evita mostrar en verde una tasa de accidentalidad
   * que en realidad va mal, con una fórmula todavía no ratificada.
   */
  pendiente_validacion: boolean
  activo: boolean
  orden: number
}

export interface IndicadorMedicion {
  id: string
  indicador_id: string
  /** Ej. "2026". F1 arranca en 2026, sin migrar histórico. */
  periodo: string
  numerador: number
  denominador: number
  /** Fracción 0–1 (ej. 0.9 = 90%). */
  meta: number
  interpretacion: string
  registrado_por: string
  fecha: Timestamp
}

/**
 * Catálogo semilla — 26 indicadores, textos literales tomados de
 * "PLAN DE EVALUACIÓN POR INDICADORES DEL SG-SST - ACTUALIZADO 2026.xlsx"
 * (SST-PLA-EI-24, hojas 3 a 29). Para los 6 de tipo `estandar_minimo` se usa
 * la fórmula HISTÓRICA (Res. 1111/2017) — factor y textos de esa columna —
 * porque es la que trae los factores 240.000/1.000 del plan; Gestión
 * Integral confirmará si se mantiene o se pasa a la vigente (Res. 0312/2019).
 */
export const SEED_INDICADORES: Omit<Indicador, 'id'>[] = [
  {
    codigo: 'SST-IND-01',
    nombre: 'Cumplimiento de estructura del SG-SST',
    tipo: 'estructura',
    label_numerador: 'Criterios de estructura que cumple con lo exigido en el Decreto 1072 de 2015',
    label_denominador: 'Criterios de estructura exigidos en el Decreto 1072 de 2015',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'manual',
    pendiente_validacion: false,
    activo: true,
    orden: 1,
  },
  {
    codigo: 'SST-IND-02',
    nombre: 'Autoevaluación del SG-SST',
    tipo: 'proceso',
    label_numerador: 'Número de Ítems que cumplen en la evaluación inicial y/o autoevaluación realizada',
    label_denominador: 'Número de ítems de la evaluación inicial y/o autoevaluación',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'manual',
    pendiente_validacion: false,
    activo: true,
    orden: 2,
  },
  {
    codigo: 'SST-IND-03',
    nombre: 'Ejecución del plan de trabajo anual',
    tipo: 'proceso',
    label_numerador: 'Porcentaje de ejecución del plan de trabajo anual',
    label_denominador: 'Porcentaje de ejecución del plan de trabajo anual establecido',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'manual',
    pendiente_validacion: false,
    activo: true,
    orden: 3,
  },
  {
    codigo: 'SST-IND-04',
    nombre: 'Ejecución del plan de capacitación',
    tipo: 'proceso',
    label_numerador: 'Nº de actividades del plan de capacitación ejecutadas',
    label_denominador: 'Nº de actividades del plan de capacitación programadas',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'auto:capacitacion',
    pendiente_validacion: false,
    activo: true,
    orden: 4,
  },
  {
    codigo: 'SST-IND-05',
    nombre: 'Intervención de peligros y riesgos prioritarios',
    tipo: 'proceso',
    label_numerador: 'N° de peligros intervenidos',
    label_denominador: 'N° de peligros identificados',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'auto:iper',
    pendiente_validacion: false,
    activo: true,
    orden: 5,
  },
  {
    codigo: 'SST-IND-06',
    nombre: 'Evaluación de las condiciones de salud',
    tipo: 'proceso',
    label_numerador: 'Número de trabajadores con evaluación de condiciones de salud y de trabajo',
    label_denominador: 'Número total de trabajadores',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'manual',
    pendiente_validacion: false,
    activo: true,
    orden: 6,
  },
  {
    codigo: 'SST-IND-07',
    nombre: 'Ejecución de Acciones Preventivas AP, Acciones Correctivas AC, y de Mejora',
    tipo: 'proceso',
    label_numerador: 'Nº de AP, AC y de Mejora ejecutadas',
    label_denominador: 'N° total de AP, AC Y de Mejora establecidas',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'auto:acciones',
    pendiente_validacion: false,
    activo: true,
    orden: 7,
  },
  {
    codigo: 'SST-IND-08',
    nombre: 'PVE acorde a condiciones de salud',
    tipo: 'proceso',
    label_numerador: 'N° de PVE implementados acorde a las condiciones de salud y riesgos prioritarios',
    label_denominador: 'Nº de PVE establecidos según condiciones de salud y riesgos prioritarios',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'manual',
    pendiente_validacion: false,
    activo: true,
    orden: 8,
  },
  {
    codigo: 'SST-IND-09',
    nombre: 'Investigación de incidentes, accidentes de trabajo y enfermedades laborales',
    tipo: 'proceso',
    label_numerador: 'N° de incidentes, accidentes y enfermedades laborales investigados',
    label_denominador: 'Nº de incidentes, accidentes y enfermedades laborales ocurridos en el año',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'auto:reportes',
    pendiente_validacion: false,
    activo: true,
    orden: 9,
  },
  {
    codigo: 'SST-IND-10',
    nombre: 'Simulacros',
    tipo: 'proceso',
    label_numerador: 'N° de simulacros realizados',
    label_denominador: 'N° de simulacros programados',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'manual',
    pendiente_validacion: false,
    activo: true,
    orden: 10,
  },
  {
    codigo: 'SST-IND-11',
    nombre: 'Conservación de documentos',
    tipo: 'proceso',
    label_numerador: 'N° de documentos controlados del SG-SST',
    label_denominador: 'Nº total de documentos del SG-SST',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'auto:documentos',
    pendiente_validacion: false,
    activo: true,
    orden: 11,
  },
  {
    codigo: 'SST-IND-12',
    nombre: 'Cumplimiento legal',
    tipo: 'resultado',
    label_numerador: 'Requisitos legales aplicables en SST que se cumplen',
    label_denominador: 'Total de requisitos legales de SST aplicables',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'auto:legal',
    pendiente_validacion: false,
    activo: true,
    orden: 12,
  },
  {
    codigo: 'SST-IND-13',
    nombre: 'Cumplimiento de objetivos',
    tipo: 'resultado',
    label_numerador: 'Número de objetivos en SST que cumplen la meta',
    label_denominador: 'Número total de objetivos en SST establecidos',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'manual',
    pendiente_validacion: false,
    activo: true,
    orden: 13,
  },
  {
    codigo: 'SST-IND-14',
    nombre: 'Cumplimiento del plan de trabajo anual',
    tipo: 'resultado',
    label_numerador: 'Número de actividades ejecutadas del plan de trabajo',
    label_denominador: 'Nº total de actividades programadas del plan de trabajo',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'manual',
    pendiente_validacion: false,
    activo: true,
    orden: 14,
  },
  {
    codigo: 'SST-IND-15',
    nombre: 'Evaluación No conformidades plan de trabajo',
    tipo: 'resultado',
    label_numerador: 'Nº de No conformidades evaluadas',
    label_denominador: 'Nº de No conformidades encontradas del plan de trabajo',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'manual',
    pendiente_validacion: false,
    activo: true,
    orden: 15,
  },
  {
    codigo: 'SST-IND-16',
    nombre: 'Evaluación de Acciones Correctivas, Preventivas y de Mejora',
    tipo: 'resultado',
    label_numerador: 'Nº de Acciones Correctivas, Preventivas, y de Mejora evaluadas',
    label_denominador: 'Nº de Acciones Correctivas, Preventivas, y de Mejora totales',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'auto:acciones',
    pendiente_validacion: false,
    activo: true,
    orden: 16,
  },
  {
    codigo: 'SST-IND-17',
    nombre: 'Cumplimiento de los PVE, programa de Vigilancia Epidemiologica',
    tipo: 'resultado',
    label_numerador: 'Número de actividades ejecutadas del PVE',
    label_denominador: 'Nº total de actividades del PVE',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'manual',
    pendiente_validacion: false,
    activo: true,
    orden: 17,
  },
  {
    codigo: 'SST-IND-18',
    nombre: 'Análisis de estadísticas',
    tipo: 'resultado',
    label_numerador: 'Número de Accidentes, Incidentes, Enfermedades Laborales y Ausentismos con Análisis y Estadística',
    label_denominador: 'Número de Accidentes, Incidentes, Enfermedades Laborales y Ausentismo Ocurridos',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'auto:reportes',
    pendiente_validacion: false,
    activo: true,
    orden: 18,
  },
  {
    codigo: 'SST-IND-19',
    nombre: 'Análisis de resultados de controles a los peligros',
    tipo: 'resultado',
    label_numerador: 'Análisis realizados a los resultados de implementación en la intervención a los peligros',
    label_denominador: 'Nº de revisiones realizadas a los controles de peligros',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'auto:iper',
    pendiente_validacion: false,
    activo: true,
    orden: 19,
  },
  {
    codigo: 'SST-IND-20',
    nombre: 'Cumplimiento de mediciones ambientales ocupacionales',
    tipo: 'resultado',
    label_numerador: 'Nº de mediciones ambientales realizadas',
    label_denominador: 'Nº de mediciones ambientales programadas',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'manual',
    pendiente_validacion: false,
    activo: true,
    orden: 20,
  },
  {
    codigo: 'SST-IND-21',
    nombre: 'Severidad de los accidentes laborales',
    tipo: 'estandar_minimo',
    label_numerador: 'N° de días perdidos y cargados por AT al año',
    label_denominador: 'Nº horas hombre trabajadas en el año',
    factor: 240000,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'manual',
    pendiente_validacion: true,
    activo: true,
    orden: 21,
  },
  {
    codigo: 'SST-IND-22',
    nombre: 'Frecuencia de los accidentes laborales',
    tipo: 'estandar_minimo',
    label_numerador: 'N° de Accidentes de Trabajo AT que se presentaron en el año',
    label_denominador: 'Nº horas hombre trabajadas en el año',
    factor: 240000,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'manual',
    pendiente_validacion: true,
    activo: true,
    orden: 22,
  },
  {
    codigo: 'SST-IND-23',
    nombre: 'Mortalidad de los accidentes laborales',
    tipo: 'estandar_minimo',
    label_numerador: 'N° de Accidentes de Trabajo mortales que se presentaron en el año',
    label_denominador: 'Total de Accidentes de Trabajo que se presentaron en el año',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'manual',
    pendiente_validacion: true,
    activo: true,
    orden: 23,
  },
  {
    codigo: 'SST-IND-24',
    nombre: 'Prevalencia de la Enfermedad Laboral',
    tipo: 'estandar_minimo',
    label_numerador: 'N° de casos nuevos y antiguos de Enfermedad Laboral en el año',
    label_denominador: 'Promedio total de trabajadores en el año',
    factor: 1000,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'manual',
    pendiente_validacion: true,
    activo: true,
    orden: 24,
  },
  {
    codigo: 'SST-IND-25',
    nombre: 'Incidencia de la Enfermedad Laboral',
    tipo: 'estandar_minimo',
    label_numerador: 'N° de casos nuevos de Enfermedad Laboral en el año',
    label_denominador: 'Promedio total de trabajadores en el año',
    factor: 1000,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'manual',
    pendiente_validacion: true,
    activo: true,
    orden: 25,
  },
  {
    codigo: 'SST-IND-26',
    nombre: 'Ausentismo',
    tipo: 'estandar_minimo',
    label_numerador: 'N° de días de ausencia por incapacidad laboral y común en el año',
    label_denominador: 'N° de días de trabajo programado en el año',
    factor: 100,
    frecuencia: 'anual',
    origen_dato: 'manual',
    fuente_auto: 'manual',
    pendiente_validacion: true,
    activo: true,
    orden: 26,
  },
]
