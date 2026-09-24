import type {
  ConfigChecklist,
  ConfigRatioAnual,
  ConfigRegistroAnual,
  Indicador,
  IndicadorRegistro,
} from '../types/indicador'

export interface NumDen {
  numerador: number
  denominador: number
}

function derivarChecklist(config: ConfigChecklist, registros: IndicadorRegistro[]): NumDen {
  const cumplidos = new Set(
    registros.filter(r => r.data.cumple === true).map(r => String(r.data.criterio_id)),
  )
  return { numerador: cumplidos.size, denominador: config.criterios.length }
}

function derivarPlan(registros: IndicadorRegistro[]): NumDen {
  const ejecutadas = registros.filter(r => r.data.ejecutada === true).length
  return { numerador: ejecutadas, denominador: registros.length }
}

function derivarRegistroAnual(config: ConfigRegistroAnual, registros: IndicadorRegistro[]): NumDen {
  const dias = registros.reduce((acc, r) => acc + (Number(r.data.dias) || 0), 0)
  return { numerador: dias, denominador: config.dias_programados }
}

function derivarRatio(config: ConfigRatioAnual, registros: IndicadorRegistro[]): NumDen {
  return { numerador: registros.length, denominador: config.total_trabajadores }
}

/**
 * Deriva numerador/denominador desde la bitácora — nunca se teclean para un
 * indicador con `patron`. null si el indicador no está pilotado (F1) o le
 * falta `config`.
 */
export function derivarNumDen(
  indicador: Pick<Indicador, 'patron' | 'config'>,
  registros: IndicadorRegistro[],
): NumDen | null {
  if (!indicador.patron || !indicador.config) return null
  switch (indicador.patron) {
    case 'checklist':
      return derivarChecklist(indicador.config as ConfigChecklist, registros)
    case 'plan':
      return derivarPlan(registros)
    case 'registro':
      return derivarRegistroAnual(indicador.config as ConfigRegistroAnual, registros)
    case 'ratio':
      return derivarRatio(indicador.config as ConfigRatioAnual, registros)
    default:
      return null
  }
}

export interface GrupoMensual {
  mes: string
  dias: number
}

/** Desglose mensual de un patrón 'registro' con campo `fecha` (YYYY-MM-DD) y `dias` — ej. Ausentismo. */
export function agruparPorMes(registros: IndicadorRegistro[]): GrupoMensual[] {
  const porMes = new Map<string, number>()
  for (const r of registros) {
    const fecha = String(r.data.fecha ?? '')
    const mes = fecha.slice(0, 7)
    if (!mes) continue
    const dias = Number(r.data.dias) || 0
    porMes.set(mes, (porMes.get(mes) ?? 0) + dias)
  }
  return Array.from(porMes.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, dias]) => ({ mes, dias }))
}
