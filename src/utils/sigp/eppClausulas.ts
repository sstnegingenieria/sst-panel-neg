// Texto fijo del acta de entrega de EPP (SST-FT-AEP-18): introducción y las 3
// cláusulas legales. Es TEXTO LEGAL del formato oficial — se transcribe tal cual lo
// entregue Gestión Integral; NO se redacta ni se parafrasea desde el código.
//
// ⚠ PENDIENTE: el texto textual de la introducción y de las 3 cláusulas NO está en
// el repositorio ni llegó con la tarea. Mientras `CLAUSULAS_PENDIENTES` sea true, la
// pantalla avisa y el botón "Firmar y guardar" queda BLOQUEADO — nadie firma un acta
// con texto provisional. Para cerrarlo: pegar el texto en INTRO_EPP / CLAUSULAS_EPP,
// pasar CLAUSULAS_PENDIENTES a false y SUBIR `CLAUSULAS_EPP_VERSION` si el texto cambia
// después de haber firmado actas (cada acta guarda la versión que vio el colaborador).

export const CLAUSULAS_EPP_VERSION = 'v1'

export const CLAUSULAS_PENDIENTES = true

/** Introducción del acta (antes de la tabla de EPP). */
export const INTRO_EPP = '[Pendiente: texto de la introducción del formato SST-FT-AEP-18]'

/** Las 3 cláusulas legales fijas, en el orden del formato. */
export const CLAUSULAS_EPP: readonly string[] = [
  '[Pendiente: cláusula 1 del formato SST-FT-AEP-18]',
  '[Pendiente: cláusula 2 del formato SST-FT-AEP-18]',
  '[Pendiente: cláusula 3 del formato SST-FT-AEP-18]',
]

/** ¿Se puede firmar? Solo con el texto legal real cargado. */
export const clausulasListas = (): boolean =>
  !CLAUSULAS_PENDIENTES && CLAUSULAS_EPP.length === 3 && CLAUSULAS_EPP.every(c => c.trim().length > 0)
