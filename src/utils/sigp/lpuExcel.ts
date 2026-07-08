// src/utils/sigp/lpuExcel.ts
//
// Lógica pura de lectura de un libro de Excel para el wizard de importación de
// LPU. Sin dependencias de React/Firestore → testeable con Vitest.

import * as XLSX from 'xlsx'

/** Celda cruda de una hoja: número nativo, texto, o null (celda vacía). */
export type CeldaCruda = string | number | boolean | null

/** Una hoja del libro leída como matriz de filas (array de arrays). */
export interface HojaCruda {
  nombre: string
  /** Filas como arrays alineados por columna (null en celdas vacías). */
  filas: CeldaCruda[][]
  /** Nº de columnas más ancho encontrado (para iterar por columna). */
  numColumnas: number
}

/**
 * Lee un archivo .xlsx/.xls y devuelve cada hoja como matriz de filas.
 * `raw: true` conserva los números nativos (los precios reales vienen así);
 * `defval: null` alinea las columnas rellenando huecos.
 */
export async function leerLibro(file: File): Promise<HojaCruda[]> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  return wb.SheetNames.map(nombre => hojaDesdeWorksheet(nombre, wb.Sheets[nombre]))
}

function hojaDesdeWorksheet(nombre: string, ws: XLSX.WorkSheet): HojaCruda {
  const filas = XLSX.utils.sheet_to_json<CeldaCruda[]>(ws, {
    header: 1,
    defval: null,
    blankrows: false,
    raw: true,
  })
  const numColumnas = filas.reduce((max, f) => Math.max(max, f.length), 0)
  return { nombre, filas, numColumnas }
}

// ── Heurística: ¿la hoja parece una lista de precios? ─────────────────────────

const NOMBRES_EXCLUIDOS = /portada|índice|indice|contenido|instruc|nota|resumen|car[aá]tula|glosario/i

/**
 * Pre-marca hojas que parecen listas de precios para el paso 2 del wizard.
 * No es determinante: el usuario confirma. Criterio:
 *  - el nombre no es de una hoja auxiliar (portada, índice, etc.), y
 *  - existe al menos una columna con varios números > 0 (indicio de precios).
 */
export function pareceListaDePrecios(hoja: HojaCruda): boolean {
  if (NOMBRES_EXCLUIDOS.test(hoja.nombre)) return false
  if (hoja.filas.length < 3) return false

  for (let c = 0; c < hoja.numColumnas; c++) {
    let numericosPositivos = 0
    for (const fila of hoja.filas) {
      const v = fila[c]
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
        numericosPositivos++
        if (numericosPositivos >= 3) return true
      }
    }
  }
  return false
}
