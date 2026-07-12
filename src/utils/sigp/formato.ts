// src/utils/sigp/formato.ts
//
// F1.5 puntos 3 y 4 — SOLO presentación. Fuente única de formato numérico
// (es-CO, máx. 2 decimales) y de la etiqueta de versión de cara al cliente.
// La precisión interna y la matemática NO cambian: esto se aplica únicamente
// al renderizar (display / solo lectura / PDF), nunca al estado ni al snapshot.

/**
 * Etiqueta de versión de cara al cliente (punto 3): la primera emisión sale
 * SIN versión visible; desde la primera modificación se muestra v2, v3…
 * El `version` interno (1, 2, 3…) no cambia — es solo presentación.
 */
export function etiquetaVersion(version: number): string {
  return version <= 1 ? '' : `v${version}`
}

/**
 * Número en formato colombiano (miles '.', decimales ','), máximo `maxDec`
 * decimales (default 2). Enteros salen sin decimales: 20,2345 → "20,23";
 * 45000 → "45.000".
 */
export function fmtNum(v: number, maxDec = 2): string {
  return (Number.isFinite(v) ? v : 0).toLocaleString('es-CO', { maximumFractionDigits: maxDec })
}

/** Moneda COP para display: "$ 16.031,95" · "$ 45.000". Máx. 2 decimales. */
export function fmtMoney(v: number): string {
  return '$ ' + fmtNum(v ?? 0, 2)
}
