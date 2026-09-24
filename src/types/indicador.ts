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

/**
 * Módulo Indicadores SG-SST (F2 — datos alimentadores).
 * Ingrid (Gestión Integral) revisó F1 y pidió: nada de numerador/denominador
 * crudo — cada indicador se alimenta con DATOS FUENTE y el panel calcula el
 * % solo. Para no construir 26 formularios distintos, se agrupan en 4
 * patrones de captura reutilizables. Solo 4 indicadores piloto (F2.1) los
 * usan; los otros 22 quedan con la entrada simple de F1 hasta F2.2.
 */
export type PatronIndicador = 'checklist' | 'plan' | 'registro' | 'ratio'

/** Patrón A — checklist de criterios (SST-IND-01: los 11 del Decreto 1072). */
export interface ConfigChecklist {
  criterios: { id: string; texto: string }[]
}

/** Patrón B — programado vs. ejecutado. Sin config propia (las actividades viven en indicador_registros). */
export type ConfigPlan = Record<string, never>

/** Patrón C — bitácora acumulable con una base anual editable (ej. días programados de Ausentismo). */
export interface ConfigRegistroAnual {
  dias_programados: number
}

/** Patrón D — ratio con base externa editable (ej. total de trabajadores). */
export interface ConfigRatioAnual {
  total_trabajadores: number
}

export type ConfigIndicador = ConfigChecklist | ConfigPlan | ConfigRegistroAnual | ConfigRatioAnual

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
  /**
   * F2 piloto (22-sep): si está presente, la ficha reemplaza los campos
   * numerador/denominador por la captura del patrón — esos dos valores se
   * DERIVAN de `indicador_registros` y se re-escriben solos en
   * `indicador_mediciones` cada vez que la bitácora cambia (ver
   * utils/indicadoresRegistros.ts). Ausente en los 22 indicadores no
   * pilotados — siguen con la entrada simple de F1.
   */
  patron?: PatronIndicador
  config?: ConfigIndicador
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
  /**
   * F2 (22-sep): true SOLO en la fila sembrada de referencia 2025 (cifras
   * oficiales del Excel, no capturadas por un usuario). El tablero la usa
   * para no editarla y para no pintarle semáforo (no hay meta real de 2025
   * — mostrar un "cumple" inventado sería engañoso).
   */
  es_referencia?: boolean
}

/**
 * Los datos fuente de un indicador con `patron` — una bitácora o checklist
 * por indicador×periodo. numerador/denominador de `indicador_mediciones` se
 * derivan SIEMPRE de estos registros (ver utils/indicadoresRegistros.ts);
 * nunca se teclean directamente para un indicador pilotado.
 */
export interface IndicadorRegistro {
  id: string
  indicador_id: string
  periodo: string
  patron: PatronIndicador
  /** Forma según el patrón — ver utils/indicadoresRegistros.ts para el contrato exacto de cada uno. */
  data: Record<string, unknown>
  registrado_por: string
  fecha_registro: Timestamp
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

/**
 * Referencia 2025 — cifras oficiales del Excel SST-PLA-EI-24, una por
 * indicador (por `codigo`), sembradas como solo-lectura (`es_referencia:
 * true`). Fuente: ref_2025.json del diseño F2, verificado 1:1 contra el
 * catálogo (mismo orden/nombres que SEED_INDICADORES). `meta:0` a propósito
 * — es referencia comparativa, no se le juzga contra una meta.
 */
export const SEED_MEDICIONES_2025: { codigo: string; numerador: number; denominador: number }[] = [
  { codigo: 'SST-IND-01', numerador: 11, denominador: 11 },
  { codigo: 'SST-IND-02', numerador: 58, denominador: 60 },
  { codigo: 'SST-IND-03', numerador: 60, denominador: 95 },
  { codigo: 'SST-IND-04', numerador: 40, denominador: 46 },
  { codigo: 'SST-IND-05', numerador: 22, denominador: 22 },
  { codigo: 'SST-IND-06', numerador: 9, denominador: 9 },
  { codigo: 'SST-IND-07', numerador: 9, denominador: 9 },
  { codigo: 'SST-IND-08', numerador: 4, denominador: 4 },
  { codigo: 'SST-IND-09', numerador: 1, denominador: 1 },
  { codigo: 'SST-IND-10', numerador: 3, denominador: 3 },
  { codigo: 'SST-IND-11', numerador: 165, denominador: 165 },
  { codigo: 'SST-IND-12', numerador: 575, denominador: 574 },
  { codigo: 'SST-IND-13', numerador: 12, denominador: 8 },
  { codigo: 'SST-IND-14', numerador: 95, denominador: 120 },
  { codigo: 'SST-IND-15', numerador: 15, denominador: 9 },
  { codigo: 'SST-IND-16', numerador: 14, denominador: 14 },
  { codigo: 'SST-IND-17', numerador: 9, denominador: 8 },
  { codigo: 'SST-IND-18', numerador: 1, denominador: 1 },
  { codigo: 'SST-IND-19', numerador: 4, denominador: 4 },
  { codigo: 'SST-IND-20', numerador: 0, denominador: 0 },
  { codigo: 'SST-IND-21', numerador: 2, denominador: 2342 },
  { codigo: 'SST-IND-22', numerador: 0, denominador: 9 },
  { codigo: 'SST-IND-23', numerador: 0, denominador: 1 },
  { codigo: 'SST-IND-24', numerador: 0, denominador: 9 },
  { codigo: 'SST-IND-25', numerador: 0, denominador: 9 },
  { codigo: 'SST-IND-26', numerador: 0, denominador: 26 },
]

/**
 * Patrones piloto (F2.1) — 4 de 26, uno por cada patrón de captura. Los 11
 * criterios del checklist son los textos literales del Decreto 1072 (mismo
 * orden del diseño). Los valores anuales de config (`dias_programados`,
 * `total_trabajadores`) nacen con un default editable — SST/GI los ajustan
 * al valor real desde la ficha.
 */
export const SEED_PATRONES: { codigo: string; patron: PatronIndicador; config: ConfigIndicador }[] = [
  {
    codigo: 'SST-IND-01',
    patron: 'checklist',
    config: {
      criterios: [
        { id: '1', texto: 'Política de SST comunicada' },
        { id: '2', texto: 'Objetivos y metas de SST' },
        { id: '3', texto: 'Plan de trabajo anual y cronograma' },
        { id: '4', texto: 'Asignación de responsabilidades de SST' },
        { id: '5', texto: 'Asignación de recursos (humanos, físicos, financieros)' },
        { id: '6', texto: 'Definición de metodología en la identificación de peligros' },
        { id: '7', texto: 'Conformación y funcionamiento del COPASST' },
        { id: '8', texto: 'Documentos que soportan el SG-SST' },
        { id: '9', texto: 'Procedimiento para efectuar el diagnóstico de condiciones de salud' },
        { id: '10', texto: 'Existencia de un plan para prevención y atención de emergencias' },
        { id: '11', texto: 'Plan de capacitación en SST' },
      ],
    } satisfies ConfigChecklist,
  },
  {
    codigo: 'SST-IND-04',
    patron: 'plan',
    config: {} satisfies ConfigPlan,
  },
  {
    codigo: 'SST-IND-06',
    patron: 'ratio',
    config: { total_trabajadores: 10 } satisfies ConfigRatioAnual,
  },
  {
    codigo: 'SST-IND-26',
    patron: 'registro',
    config: { dias_programados: 261 } satisfies ConfigRegistroAnual,
  },
]
