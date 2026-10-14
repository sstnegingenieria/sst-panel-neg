// Exportación a Excel de la lista de avales "en físico" — la lista que pide el
// auditor. Patrón de Reportes (SheetJS: json_to_sheet + writeFile). La
// construcción de las filas es pura y vive en `types/sigp/avalFisico.ts`
// (`filasAvalesFisicos`), testeada sin SheetJS.
import * as XLSX from 'xlsx'
import { COLUMNAS_AVALES_FISICOS } from '../../types/sigp/avalFisico'
import type { filasAvalesFisicos } from '../../types/sigp/avalFisico'

type Filas = ReturnType<typeof filasAvalesFisicos>

/** Anchos de columna (caracteres), en el orden de COLUMNAS_AVALES_FISICOS. */
const ANCHOS = [14, 24, 26, 26, 14, 26, 36, 30, 50]

/** Arma el libro (sin escribir a disco) — separado para poder testearlo. */
export function libroAvalesFisicos(filas: Filas): XLSX.WorkBook {
  const ws = XLSX.utils.json_to_sheet(filas, { header: [...COLUMNAS_AVALES_FISICOS] })
  ws['!cols'] = ANCHOS.map(wch => ({ wch }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Avales en físico')
  return wb
}

export function exportarAvalesFisicos(filas: Filas, nombre = 'avales-sst-en-fisico'): void {
  XLSX.writeFile(libroAvalesFisicos(filas), `${nombre}.xlsx`)
}
