// src/utils/semanaMes.ts
// Filtro de registros por semana del mes (auditorías por semana).
// Semanas por BLOQUES fijos según el día del mes de la fecha de creación:
//   1 = días 1–7 · 2 = 8–14 · 3 = 15–21 · 4 = 22 al fin de mes.
// Se calcula con la fecha LOCAL del navegador (no UTC): un formato creado a
// las 8 pm del día 7 en Colombia es ISO del día 8 en UTC y no debe saltar de
// semana por eso.

export type SemanaMes = 1 | 2 | 3 | 4

export const SEMANAS: { valor: SemanaMes; label: string }[] = [
  { valor: 1, label: 'Semana 1 (1–7)' },
  { valor: 2, label: 'Semana 2 (8–14)' },
  { valor: 3, label: 'Semana 3 (15–21)' },
  { valor: 4, label: 'Semana 4 (22–fin)' },
]

function fechaLocal(iso: string | undefined | null): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Semana del mes (1–4) de un ISO, o null si la fecha falta o es inválida. */
export function semanaDelMes(iso: string | undefined | null): SemanaMes | null {
  const d = fechaLocal(iso)
  if (!d) return null
  const dia = d.getDate()
  return dia <= 7 ? 1 : dia <= 14 ? 2 : dia <= 21 ? 3 : 4
}

/** Mes local como 'YYYY-MM', o null si la fecha falta o es inválida. */
export function mesDe(iso: string | undefined | null): string | null {
  const d = fechaLocal(iso)
  if (!d) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Etiqueta legible de un 'YYYY-MM' (ej. "oct 2026"). */
export function etiquetaMes(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  const nombre = new Date(y, m - 1, 1).toLocaleDateString('es-CO', { month: 'short' }).replace('.', '')
  return `${nombre} ${y}`
}

/** Meses ('YYYY-MM') presentes en una lista de ISO, del más reciente al más antiguo. */
export function mesesPresentes(isos: (string | undefined | null)[]): string[] {
  const set = new Set<string>()
  for (const iso of isos) {
    const m = mesDe(iso)
    if (m) set.add(m)
  }
  return [...set].sort().reverse()
}

/**
 * ¿La fecha cae en el periodo elegido? 'todos'/'todas' no filtran (ni siquiera
 * excluyen fechas vacías); con cualquier filtro activo, una fecha ausente o
 * inválida queda fuera.
 */
export function enPeriodo(
  iso: string | undefined | null,
  mes: string | 'todos',
  semana: SemanaMes | 'todas',
): boolean {
  if (mes === 'todos' && semana === 'todas') return true
  if (mes !== 'todos' && mesDe(iso) !== mes) return false
  if (semana !== 'todas' && semanaDelMes(iso) !== semana) return false
  return true
}
