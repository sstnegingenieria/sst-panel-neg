import { describe, it, expect } from 'vitest'
import { semanaDelMes, mesDe, mesesPresentes, enPeriodo, etiquetaMes } from '../semanaMes'

// Fechas LOCALES (new Date(y, m, d, h)) → toISOString: el helper debe leerlas
// como el mismo día local sin importar la zona del runner.
const iso = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).toISOString()

describe('semanaDelMes — bloques fijos 1–7 / 8–14 / 15–21 / 22–fin', () => {
  it.each([
    [1, 1], [7, 1], [8, 2], [14, 2], [15, 3], [21, 3], [22, 4], [28, 4], [29, 4], [30, 4], [31, 4],
  ])('día %i → semana %i', (dia, semana) => {
    expect(semanaDelMes(iso(2026, 1, dia))).toBe(semana)   // enero tiene 31
  })

  it('febrero: el 28 (y el 29 bisiesto) caen en la semana 4', () => {
    expect(semanaDelMes(iso(2026, 2, 28))).toBe(4)
    expect(semanaDelMes(iso(2028, 2, 29))).toBe(4)
  })

  it('usa la fecha LOCAL: 11 pm del día 7 sigue siendo semana 1 aunque en UTC ya sea el 8', () => {
    expect(semanaDelMes(iso(2026, 10, 7, 23))).toBe(1)
    expect(semanaDelMes(iso(2026, 10, 8, 0))).toBe(2)
  })

  it('fecha vacía o inválida → null', () => {
    expect(semanaDelMes('')).toBeNull()
    expect(semanaDelMes(undefined)).toBeNull()
    expect(semanaDelMes('no-es-fecha')).toBeNull()
  })
})

describe('mesDe / mesesPresentes / etiquetaMes', () => {
  it('mesDe devuelve YYYY-MM local', () => {
    expect(mesDe(iso(2026, 10, 31, 23))).toBe('2026-10')
    expect(mesDe(iso(2026, 11, 1, 0))).toBe('2026-11')
    expect(mesDe('')).toBeNull()
  })

  it('mesesPresentes: únicos, del más reciente al más antiguo, ignora fechas inválidas', () => {
    expect(mesesPresentes([iso(2026, 8, 3), iso(2026, 10, 9), iso(2026, 8, 20), '', 'x', iso(2025, 12, 31)]))
      .toEqual(['2026-10', '2026-08', '2025-12'])
  })

  it('etiquetaMes es legible', () => {
    expect(etiquetaMes('2026-10')).toMatch(/oct.* 2026/i)
  })
})

describe('enPeriodo', () => {
  const f = iso(2026, 10, 9)   // octubre, semana 2
  it('sin filtros incluye todo, incluso fecha vacía', () => {
    expect(enPeriodo(f, 'todos', 'todas')).toBe(true)
    expect(enPeriodo('', 'todos', 'todas')).toBe(true)
  })
  it('solo semana', () => {
    expect(enPeriodo(f, 'todos', 2)).toBe(true)
    expect(enPeriodo(f, 'todos', 3)).toBe(false)
  })
  it('solo mes', () => {
    expect(enPeriodo(f, '2026-10', 'todas')).toBe(true)
    expect(enPeriodo(f, '2026-09', 'todas')).toBe(false)
  })
  it('mes + semana: "Semana 2" no mezcla meses distintos', () => {
    const sept = iso(2026, 9, 10)  // semana 2 de septiembre
    expect(enPeriodo(f, '2026-10', 2)).toBe(true)
    expect(enPeriodo(sept, '2026-10', 2)).toBe(false)
    expect(enPeriodo(sept, 'todos', 2)).toBe(true)
  })
  it('con filtro activo, fecha vacía o inválida queda fuera', () => {
    expect(enPeriodo('', '2026-10', 'todas')).toBe(false)
    expect(enPeriodo('x', 'todos', 1)).toBe(false)
  })
})
