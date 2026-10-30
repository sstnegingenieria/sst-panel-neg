// Parte E (30-oct) — el margen EN VIVO donde se decide. La palanca del
// F2.1.c (PR #21) no sobrevivió a la reconstrucción de asignaciones (PR #104);
// vuelve exacta al peso (venta = átomos de ESA asignación, #127) con aviso de
// margen negativo (patrón sobre-giro: advertir, no bloquear, constancia) y la
// señal de implausibilidad ≥70% en el momento del tecleo.
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  margenEnVivoDe, constanciaMargen, UMBRAL_MARGEN_IMPLICITO_REVISAR_PCT,
  patchDefinirPreliquidacion, patchCorregirPreliquidacion, patchEstimarDirecta,
} from '../asignacion'
import type { AsignacionContratista } from '../asignacion'

const ts = Timestamp.fromDate(new Date('2026-10-30T10:00:00'))

// Alcance con universo por grupo: un grupo G1 con CD 1.000.000
const ALCANCE = { alcance: [{ grupo: 'G1', items: 1, subtotal: 1_000_000 }] }

const asig = (over: Partial<AsignacionContratista> = {}): AsignacionContratista => ({
  id: 'a1', estado: 'asignada', contratista_id: 'c1', contratista_nombre: 'Héctor',
  atomos: ['G1'], fecha: ts, fecha_creacion: ts, asignado_por: 'u1',
  modalidad: 'todo_costo', compras_reembolsos: [], historial: [],
  habilitacion_snapshot: { estado: 'activo', fecha_consulta: ts, fuente: 'test' },
  ...over,
} as AsignacionContratista)

describe('margenEnVivoDe — puro, recalculable a cada tecla', () => {
  it('caso normal: utilidad y % exactos, sin avisos', () => {
    const m = margenEnVivoDe(1_000_000, 700_000)
    expect(m.utilidad).toBe(300_000)
    expect(m.margen_pct).toBe(30)
    expect(m.negativo).toBe(false)
    expect(m.implausible).toBe(false)
  })
  it('NEGATIVO: costo > venta de esos mismos ítems — se advierte, no se bloquea', () => {
    const m = margenEnVivoDe(1_000_000, 1_200_000)
    expect(m.utilidad).toBe(-200_000)
    expect(m.margen_pct).toBeCloseTo(-20, 10)
    expect(m.negativo).toBe(true)
    expect(m.implausible).toBe(false)
  })
  it('IMPLAUSIBLE: margen ≥ umbral (misma señal del tablero), en el acto', () => {
    const m = margenEnVivoDe(1_000_000, 250_000)
    expect(m.margen_pct).toBe(75)
    expect(m.implausible).toBe(true)
    expect(m.negativo).toBe(false)
    // exactamente en el umbral también avisa
    expect(margenEnVivoDe(1_000_000, 1_000_000 * (1 - UMBRAL_MARGEN_IMPLICITO_REVISAR_PCT / 100)).implausible).toBe(true)
  })
  it('sin base (venta 0): % null; con costo > 0 sigue siendo negativo', () => {
    const m = margenEnVivoDe(0, 100_000)
    expect(m.margen_pct).toBeNull()
    expect(m.negativo).toBe(true)
  })
})

describe('constanciaMargen — solo cuando hubo aviso (sin ruido)', () => {
  it('caso normal → cadena VACÍA', () => {
    expect(constanciaMargen(margenEnVivoDe(1_000_000, 700_000))).toBe('')
  })
  it('negativo → constancia con las DOS cifras ("se registró sabiéndolo")', () => {
    const c = constanciaMargen(margenEnVivoDe(1_000_000, 1_200_000))
    expect(c).toContain('MARGEN NEGATIVO')
    expect(c).toContain('1200000')
    expect(c).toContain('1000000')
    expect(c).toContain('se registró sabiéndolo')
  })
  it('implausible → constancia con el % y el umbral', () => {
    const c = constanciaMargen(margenEnVivoDe(1_000_000, 200_000))
    expect(c).toContain('80%')
    expect(c).toContain(String(UMBRAL_MARGEN_IMPLICITO_REVISAR_PCT))
  })
  it('negativo GANA sobre implausible (no pueden coexistir, defensivo)', () => {
    const c = constanciaMargen({ venta: 0, costo: 5, utilidad: -5, margen_pct: null, negativo: true, implausible: false })
    expect(c).toContain('MARGEN NEGATIVO')
    expect(c).toContain('sin base')
  })
})

describe('los builders dejan la constancia en el historial', () => {
  it('definir con margen sano → historial SIN constancia; devuelve el margen', () => {
    const r = patchDefinirPreliquidacion(asig(), { valor_contratista: 700_000, anticipo_pct: 50 }, ALCANCE, 'diego', ts)!
    expect(r.margen.margen_pct).toBe(30)
    expect(r.entradaHistorial.motivo).not.toContain('⚠')
  })
  it('definir con costo > venta → constancia de margen NEGATIVO', () => {
    const r = patchDefinirPreliquidacion(asig(), { valor_contratista: 1_200_000, anticipo_pct: 50 }, ALCANCE, 'diego', ts)!
    expect(r.margen.negativo).toBe(true)
    expect(r.entradaHistorial.motivo).toContain('MARGEN NEGATIVO')
  })
  it('definir solo_mano_obra: los materiales NEG entran a la canasta del margen', () => {
    const a = asig({ modalidad: 'solo_mano_obra', valor_materiales: 400_000 })
    const r = patchDefinirPreliquidacion(a, { valor_contratista: 700_000, anticipo_pct: 50 }, ALCANCE, 'diego', ts)!
    expect(r.margen.costo).toBe(1_100_000)
    expect(r.margen.negativo).toBe(true)
  })
  it('definir con margen implausible (≥70%) → la señal del tablero, en el acto', () => {
    const r = patchDefinirPreliquidacion(asig(), { valor_contratista: 200_000, anticipo_pct: 50 }, ALCANCE, 'diego', ts)!
    expect(r.margen.implausible).toBe(true)
    expect(r.entradaHistorial.motivo).toContain(String(UMBRAL_MARGEN_IMPLICITO_REVISAR_PCT))
  })
  it('corregir con contexto → margen sobre el CD VIVO + constancia si aplica', () => {
    const a = asig({
      estado: 'preliquidacion_definida',
      preliquidacion: { valor_alcance: 1_000_000, valor_contratista: 700_000, anticipo_pct: 50, definida_por: 'diego', fecha_definicion: ts },
    })
    const r = patchCorregirPreliquidacion(a, false, { valor_contratista: 1_500_000, anticipo_pct: 50 }, 'typo', 'diego', ts, ALCANCE)!
    expect(r.margen.venta).toBe(1_000_000)
    expect(r.margen.negativo).toBe(true)
    expect(r.entradaHistorial.motivo).toContain('MARGEN NEGATIVO')
  })
  it('corregir SIN contexto (retrocompat) → cae al valor_alcance congelado', () => {
    const a = asig({
      estado: 'preliquidacion_definida',
      preliquidacion: { valor_alcance: 800_000, valor_contratista: 700_000, anticipo_pct: 50, definida_por: 'diego', fecha_definicion: ts },
    })
    const r = patchCorregirPreliquidacion(a, false, { valor_contratista: 600_000, anticipo_pct: 50 }, 'ajuste', 'diego', ts)!
    expect(r.margen.venta).toBe(800_000)
    expect(r.margen.negativo).toBe(false)
  })
  it('estimar directa con costo > CD → la misma constancia (sin contratista también es plata)', () => {
    const a = asig({ tipo: 'administracion_directa' })
    const r = patchEstimarDirecta(a, 1_300_000, undefined, ALCANCE, 'diego', ts)!
    expect(r.margen.negativo).toBe(true)
    expect(r.entradaHistorial.motivo).toContain('MARGEN NEGATIVO')
  })
})
