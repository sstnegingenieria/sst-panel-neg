// Helpers puros del PDF del cronograma (08-nov, C3). Oráculo: el calendario
// real del caso SENA desplazado (19/10/2026 + 30): domingos en 7/14/21/28,
// festivos en 15 (2-nov) y 29 (16-nov).
import { describe, it, expect } from 'vitest'
import { diasRender, segmentosLaborables, bloquesDias, rangoFase } from '../cronogramaPdf'
import type { FaseCronograma } from '../../../types/sigp/cronograma'

const DIAS = diasRender('2026-10-19', 30)

describe('diasRender — el eje del calendario', () => {
  it('tipos y rotulado del caso SENA', () => {
    expect(DIAS).toHaveLength(30)
    expect(DIAS[0]).toMatchObject({ dia: 1, iso: '2026-10-19', tipo: 'habil', numero: 19, letra: 'L' })
    expect(DIAS[6].tipo).toBe('domingo')     // 25-oct
    expect(DIAS[5].tipo).toBe('sabado')      // 24-oct
    expect(DIAS[14]).toMatchObject({ tipo: 'festivo', iso: '2026-11-02' })
    expect(DIAS[28]).toMatchObject({ tipo: 'festivo', iso: '2026-11-16' })
  })
})

describe('segmentosLaborables — la barra se parte en los no laborables', () => {
  it('cruza el domingo en dos tramos (el conector punteado va en el render)', () => {
    expect(segmentosLaborables(5, 9, DIAS)).toEqual([[5, 6], [8, 9]])
  })
  it('domingo + festivo seguidos (14 y 15) dejan un solo tramo posterior', () => {
    expect(segmentosLaborables(14, 16, DIAS)).toEqual([[16, 16]])
  })
  it('barra enteramente no laborable → sin tramos (solo conector)', () => {
    expect(segmentosLaborables(7, 7, DIAS)).toEqual([])
  })
  it('el sábado NO parte la barra (media jornada se trabaja)', () => {
    expect(segmentosLaborables(5, 6, DIAS)).toEqual([[5, 6]])
  })
  it('se recorta a los días del eje', () => {
    expect(segmentosLaborables(29, 40, DIAS)).toEqual([[30, 30]])
  })
})

describe('bloquesDias — paginación horizontal por semanas completas', () => {
  it('el caso del modelo cabe en un solo bloque', () => {
    expect(bloquesDias(30, 71)).toEqual([{ desde: 1, hasta: 30 }])
  })
  it('un plazo de 90 va en bloques de semanas completas', () => {
    expect(bloquesDias(90, 71)).toEqual([
      { desde: 1, hasta: 70 },   // 10 semanas completas (⌊71/7⌋ = 10)
      { desde: 71, hasta: 90 },
    ])
  })
  it('nunca por debajo de una semana por bloque', () => {
    expect(bloquesDias(20, 3).every(b => b.hasta - b.desde + 1 <= 7)).toBe(true)
  })
})

describe('rangoFase — la barra resumen cubre barras e hitos', () => {
  const fase: FaseCronograma = {
    id: 'f1', nombre: 'PRELIMINARES', filas: [
      { id: 'h1', tipo: 'hito', nombre: 'Firma', dia: 1 },
      { id: 'a1', tipo: 'actividad', descripcion: 'Plan', dia_inicio: 2, dia_fin: 4 },
      { id: 'a2', tipo: 'actividad', descripcion: 'Movilización', dia_inicio: 3, dia_fin: 6 },
    ],
  }
  it('min/max sobre todas las filas', () => {
    expect(rangoFase(fase)).toEqual({ d1: 1, d2: 6 })
  })
  it('fase vacía → null', () => {
    expect(rangoFase({ id: 'f2', nombre: 'X', filas: [] })).toBeNull()
  })
})
