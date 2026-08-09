// Mantenimiento de precios del catálogo (#2b, SB3) — lógica pura del ajuste
// + matriz de permisos del módulo.
import { describe, it, expect } from 'vitest'
import {
  RANGO_PCT, UMBRAL_CONFIRMACION_PCT,
  validarPorcentaje, aplicarPorcentaje, previsualizarAjuste, trocear,
} from '../catalogoAjuste'
import { ROLES_MANTIENE_CATALOGO, puedeMantenerCatalogoUI } from '../../../types/sigp/permisos'

describe('validarPorcentaje — rango, cero y umbral de confirmación', () => {
  it('porcentajes normales válidos, sin confirmación extra hasta ±50', () => {
    expect(validarPorcentaje(10)).toMatchObject({ valido: true, requiereConfirmacionExtra: false })
    expect(validarPorcentaje(-10)).toMatchObject({ valido: true, requiereConfirmacionExtra: false })
    expect(validarPorcentaje(50)).toMatchObject({ valido: true, requiereConfirmacionExtra: false })
    expect(validarPorcentaje(-50)).toMatchObject({ valido: true, requiereConfirmacionExtra: false })
  })
  it(`|%| > ${UMBRAL_CONFIRMACION_PCT} exige confirmación extra (sigue siendo válido)`, () => {
    expect(validarPorcentaje(51)).toMatchObject({ valido: true, requiereConfirmacionExtra: true })
    expect(validarPorcentaje(-80)).toMatchObject({ valido: true, requiereConfirmacionExtra: true })
    expect(validarPorcentaje(500)).toMatchObject({ valido: true, requiereConfirmacionExtra: true })
  })
  it('0% no genera cambios → inválido', () => {
    expect(validarPorcentaje(0).valido).toBe(false)
  })
  it(`fuera de [${RANGO_PCT.min}, ${RANGO_PCT.max}] o no-finito → inválido`, () => {
    expect(validarPorcentaje(-96).valido).toBe(false)
    expect(validarPorcentaje(501).valido).toBe(false)
    expect(validarPorcentaje(Number.NaN).valido).toBe(false)
    expect(validarPorcentaje(Number.POSITIVE_INFINITY).valido).toBe(false)
  })
})

describe('aplicarPorcentaje — COP a peso (Math.round)', () => {
  it('sube con redondeo a peso (caso .x)', () => {
    expect(aplicarPorcentaje(133_333, 10)).toBe(146_666)   // 146.666,3 → 146.666
    expect(aplicarPorcentaje(133_335, 10)).toBe(146_669)   // 146.668,5 → 146.669 (round half-up)
  })
  it('baja con % negativo', () => {
    expect(aplicarPorcentaje(100_000, -15)).toBe(85_000)
  })
  it('el precio original no se muta y valores extremos siguen enteros', () => {
    expect(Number.isInteger(aplicarPorcentaje(999_999, 33.33))).toBe(true)
  })
})

describe('previsualizarAjuste + trocear', () => {
  const items = Array.from({ length: 923 }, (_, i) => ({
    id: `it${i}`, codigo: `CAT-${String(i + 1).padStart(4, '0')}`,
    descripcion: `Ítem ${i}`, valor_unitario: 100_000 + i,
  }))

  it('la preview trae actual → nuevo por ítem, sin mutar la entrada', () => {
    const prev = previsualizarAjuste(items.slice(0, 3), 10)
    expect(prev).toHaveLength(3)
    expect(prev[0]).toMatchObject({ valor_actual: 100_000, valor_nuevo: 110_000 })
    expect(items[0].valor_unitario).toBe(100_000)
  })

  it('trocear parte 923 ítems en lotes ≤450 (3 lotes: 450+450+23)', () => {
    const lotes = trocear(items, 450)
    expect(lotes.map(l => l.length)).toEqual([450, 450, 23])
    expect(lotes.flat()).toHaveLength(923)
  })
})

describe('permisos del catálogo — espejo de puedeMantenerCatalogo()', () => {
  it('mantienen EXACTAMENTE GG + director_proyectos + admin', () => {
    expect([...ROLES_MANTIENE_CATALOGO].sort()).toEqual(['admin', 'director_proyectos', 'gerencia_general'])
  })
  it('cotizadores y demás roles NO mantienen (el alta del cotizador es create, no update)', () => {
    for (const rol of ['operacion_comercial', 'auxiliar_proyectos', 'gerencia_administrativa', 'gestion_integral', 'sst', undefined]) {
      expect(puedeMantenerCatalogoUI(rol)).toBe(false)
    }
  })
})
