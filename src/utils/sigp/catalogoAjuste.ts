// src/utils/sigp/catalogoAjuste.ts
//
// Mantenimiento de precios del catálogo NEG (#2b) — lógica PURA del ajuste
// masivo por porcentaje. Sin Firebase a propósito: se testea aparte y la
// consumen CatalogoSigp.tsx / AjusteMasivoModal.tsx.

/** Rango permitido para el % de ajuste masivo. */
export const RANGO_PCT = { min: -95, max: 500 }

/** Por encima de este |%| el ajuste exige una confirmación extra (banner + checkbox). */
export const UMBRAL_CONFIRMACION_PCT = 50

export interface ResultadoAjuste {
  id: string
  codigo: string
  descripcion: string
  valor_actual: number
  valor_nuevo: number
}

export interface ValidacionPorcentaje {
  valido: boolean
  requiereConfirmacionExtra: boolean
  error?: string
}

/** Valida el % de ajuste masivo: finito, distinto de 0 y dentro de [min, max]. */
export function validarPorcentaje(pct: number): ValidacionPorcentaje {
  if (!Number.isFinite(pct)) {
    return { valido: false, requiereConfirmacionExtra: false, error: 'Ingresa un porcentaje válido' }
  }
  if (pct === 0) {
    return { valido: false, requiereConfirmacionExtra: false, error: '0% no genera cambios' }
  }
  if (pct < RANGO_PCT.min || pct > RANGO_PCT.max) {
    return {
      valido: false,
      requiereConfirmacionExtra: false,
      error: `El porcentaje debe estar entre ${RANGO_PCT.min}% y ${RANGO_PCT.max}%`,
    }
  }
  return { valido: true, requiereConfirmacionExtra: Math.abs(pct) > UMBRAL_CONFIRMACION_PCT }
}

/** Aplica un % a un valor y redondea a peso (COP no maneja centavos operativos). */
export function aplicarPorcentaje(valor: number, pct: number): number {
  return Math.round(valor * (1 + pct / 100))
}

/** Previsualización del ajuste masivo: valor actual → valor nuevo, por ítem. */
export function previsualizarAjuste(
  items: { id: string; codigo: string; descripcion: string; valor_unitario: number }[],
  pct: number,
): ResultadoAjuste[] {
  return items.map(it => ({
    id: it.id,
    codigo: it.codigo,
    descripcion: it.descripcion,
    valor_actual: it.valor_unitario,
    valor_nuevo: aplicarPorcentaje(it.valor_unitario, pct),
  }))
}

// Espejo de `trocear` en `hooks/sigp/useImportarLpu.ts` (no está exportado
// allá — se replica aquí en vez de tocar ese archivo). Límite de 500
// operaciones por batch de Firestore; se deja margen con 450 por defecto.
export function trocear<T>(arr: T[], tam = 450): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += tam) out.push(arr.slice(i, i + tam))
  return out
}
