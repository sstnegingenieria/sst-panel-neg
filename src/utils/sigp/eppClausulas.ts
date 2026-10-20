// Texto fijo del acta de entrega de EPP (SST-FT-AEP-18): introducción y las 3
// cláusulas legales. Es TEXTO LEGAL del formato oficial, transcrito TEXTUALMENTE tal
// como lo entregó Gestión Integral (19-oct-2026): NO se redacta ni se parafrasea desde
// el código. Cada acta guarda `clausulas_version`: si el texto cambia después de haber
// firmado actas, SUBIR `CLAUSULAS_EPP_VERSION` (las ya firmadas conservan la versión que
// vio el colaborador, y su hash la incluye).
//
// `CLAUSULAS_PENDIENTES` es el guard de seguridad: en true, la pantalla avisa y el botón
// "Firmar y guardar" queda BLOQUEADO — nadie firma un acta con texto provisional. Hoy el
// texto está completo y el guard está en false.

export const CLAUSULAS_EPP_VERSION = 'v1'

export const CLAUSULAS_PENDIENTES = false

/** Introducción del acta (antes de la tabla de EPP). */
export const INTRO_EPP = 'Con la presente acta se hace entrega de los siguientes elementos de protección personal:'

/** Frase que antecede a las cláusulas. */
export const ENCABEZADO_CLAUSULAS_EPP = 'El colaborador manifiesta que:'

/** Las 3 cláusulas legales fijas, en el orden del formato. */
export const CLAUSULAS_EPP: readonly string[] = [
  'La dotación que aquí se entrega es y será de la empresa en todo momento, en caso de terminación de contrato de trabajo o entrega de una nueva dotación me comprometo hacer la devolución inmediata.',
  'En caso de daño de la dotación o parte de ella, el trabajador debe devolver a la empresa.',
  'Autorizo expresamente a la empresa mediante este documento a descontar de salarios y liquidación de prestaciones los valores de la dotación, cuando en cualquiera de los casos anteriores no la devuelva al empleador la dotación completa.',
]

/** ¿Se puede firmar? Solo con el texto legal real cargado. */
export const clausulasListas = (): boolean =>
  !CLAUSULAS_PENDIENTES && CLAUSULAS_EPP.length === 3 && CLAUSULAS_EPP.every(c => c.trim().length > 0)
