import type { PatronIndicador } from '../types/indicador'

/**
 * Sugerencias de captura para indicadores de medición MANUAL (sin patrón).
 *
 * SST-IND-06 (Evaluación de las condiciones de salud) mide trabajadores con
 * examen médico vigente / total de trabajadores. El denominador se SUGIERE
 * desde el conteo de `empleados_directos` con activo==true; el numerador es un
 * conteo manual.
 *
 * PRIVACIDAD (línea dura): el indicador maneja SOLO conteos agregados. Nunca
 * se lee ni se guarda el examen, su resultado ni un diagnóstico; el maestro se
 * consulta únicamente para CONTAR activos (agregación del servidor — no se
 * descargan los documentos).
 *
 * GANCHO (no implementado): cuando existan los exámenes digitalizados, el
 * numerador se auto-alimentará desde una CF como la de SST-IND-26 — ese día
 * `fuente_auto` del catálogo pasa de 'manual' a 'auto:examenes' y el modal
 * deberá BLOQUEAR el campo (la CF escribe `registrado_por: 'cf:…'`).
 */
export type FuenteSugerencia = 'empleados_activos'

/** Por código (no por id de doc): mismo criterio que SEED_PATRONES. */
export const SUGERENCIA_DENOMINADOR: Record<string, FuenteSugerencia> = {
  'SST-IND-06': 'empleados_activos',
}

/**
 * Patrones con formulario propio. Un `patron` desconocido (p. ej. un doc viejo
 * que aún diga 'ratio', ya retirado) NO es un patrón: el indicador se mide con
 * el formulario manual en vez de quedar con un panel vacío.
 */
export const PATRONES_CONOCIDOS: readonly PatronIndicador[] = ['checklist', 'plan', 'registro']

export function esPatronConocido(patron: string | undefined): patron is PatronIndicador {
  return !!patron && (PATRONES_CONOCIDOS as readonly string[]).includes(patron)
}

export interface DenominadorInicial {
  /** Texto con el que arranca el campo. */
  inicial: string
  /** Valor del maestro a ofrecer con "Usar" (solo si difiere de lo guardado). */
  ofrecer: number | null
}

/**
 * Con medición guardada se RESPETA lo guardado (no se pisa un número a mano en
 * silencio) y, si el maestro hoy dice otra cosa, se ofrece. Sin medición, la
 * sugerencia pre-llena el campo (sigue siendo editable). Sin sugerencia
 * (lector sin acceso al maestro o error) el campo queda manual.
 */
export function resolverDenominador(
  guardado: number | undefined,
  sugerido: number | null,
): DenominadorInicial {
  const haySugerencia = sugerido != null && Number.isFinite(sugerido) && sugerido >= 0
  if (guardado !== undefined && Number.isFinite(guardado)) {
    return {
      inicial: String(guardado),
      ofrecer: haySugerencia && sugerido !== guardado ? sugerido : null,
    }
  }
  return { inicial: haySugerencia ? String(sugerido) : '', ofrecer: null }
}
