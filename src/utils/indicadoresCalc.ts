/**
 * Cálculo puro del módulo Indicadores SG-SST. `valor` y `cumple` nunca se
 * persisten (ver types/indicador.ts) — se derivan siempre de aquí.
 */
export function calcularValor(numerador: number, denominador: number, factor: number): number | null {
  if (!denominador) return null
  return (numerador / denominador) * factor
}

export type ColorSemaforo = 'verde' | 'ambar' | 'rojo'

/** meta viene como fracción 0–1; se escala al factor del indicador. */
export function cumpleMeta(valor: number, meta: number, factor: number): boolean {
  return valor >= meta * factor
}

export function colorSemaforo(valor: number, meta: number, factor: number): ColorSemaforo {
  const metaEscalada = meta * factor
  if (valor >= metaEscalada) return 'verde'
  if (valor >= metaEscalada * 0.9) return 'ambar'
  return 'rojo'
}

/**
 * Semáforo del indicador, o null si no aplica: sin valor (sin denominador
 * válido) o `pendiente_validacion` (los 6 estándares mínimos — no se pinta
 * un semáforo con una fórmula que Gestión Integral todavía no ratifica).
 */
export function semaforoIndicador(
  pendienteValidacion: boolean,
  valor: number | null,
  meta: number,
  factor: number,
): ColorSemaforo | null {
  if (valor == null || pendienteValidacion) return null
  return colorSemaforo(valor, meta, factor)
}

export const SEMAFORO_LABEL: Record<ColorSemaforo, string> = {
  verde: 'Cumple',
  ambar: 'Cerca de la meta',
  rojo: 'Bajo meta',
}

export const SEMAFORO_CLASSES: Record<ColorSemaforo, string> = {
  verde: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
  ambar: 'bg-amber-100 text-amber-800 border border-amber-300',
  rojo: 'bg-red-100 text-red-800 border border-red-300',
}

export function formatoValor(valor: number | null, factor: number): string {
  if (valor == null) return '—'
  // Factor 100 → valores tipo porcentaje; factores grandes (1000/240000) →
  // tasas, se muestran con hasta 2 decimales sin símbolo de %.
  const decimales = factor === 100 ? 1 : 2
  const texto = valor.toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: decimales })
  return factor === 100 ? `${texto}%` : texto
}
