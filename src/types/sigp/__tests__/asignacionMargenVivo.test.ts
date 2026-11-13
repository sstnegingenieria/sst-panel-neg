// Caso PRY-2026-058 (13-nov-2026): la palanca de margen derivó $0 porque los
// modales alimentaban la venta con el array de grupos en vez del snapshot con
// `items_alcance`, y corregir aceptó el 0 que definir rechaza. Estos tests
// fijan los tres arreglos de modelo: la fuente del contexto, el cero
// bloqueado en el builder, y la constancia con cifras del checkbox consciente.
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import { valorAlcanceDe, patchCorregirPreliquidacion, margenEnVivoDe } from '../asignacion'
import type { AsignacionContratista } from '../asignacion'

const ts = Timestamp.fromDate(new Date('2026-11-13T20:00:00Z'))

// La forma EXACTA del 058: átomos uuid de nivel ítem; el snapshot trae los
// grupos (sin ítems) Y el universo items_alcance aparte.
const ATOMOS = ['u-1', 'u-2']
const SNAPSHOT = {
  alcance: [{ grupo: 'G1', subtotal: 10_000_000, items: 2 }, { grupo: 'G2', subtotal: 977_438, items: 1 }],
  items_alcance: [
    { clave: 'u-1', codigo: '01.01.01', descripcion: 'Malla', grupo: 'G1', valor_total: 6_000_000 },
    { clave: 'u-2', codigo: '01.01.02', descripcion: 'Pintura', grupo: 'G1', valor_total: 4_000_000 },
    { clave: 'u-3', codigo: '02.03.01', descripcion: 'Ventanería', grupo: 'G2', valor_total: 977_438 },
  ],
}

describe('valorAlcanceDe — la fuente del contexto es el SNAPSHOT completo (caso 058)', () => {
  it('átomos de nivel ítem contra SOLO el array de grupos → 0 (el defecto)', () => {
    expect(valorAlcanceDe(ATOMOS, SNAPSHOT.alcance, 'item')).toBe(0)
  })
  it('los mismos átomos contra el snapshot con items_alcance → la venta real', () => {
    expect(valorAlcanceDe(ATOMOS, SNAPSHOT, 'item')).toBe(10_000_000)
  })
})

const base = (sobre?: Partial<AsignacionContratista>): AsignacionContratista => ({
  id: 'a1', contratista_id: 'c1', contratista_nombre: 'Jersson', fecha: ts, fecha_creacion: ts,
  fecha_actualizacion: ts, asignado_por: 'u', estado: 'anticipo_girado', modalidad: 'todo_costo',
  atomos: ATOMOS, atomos_nivel: 'item', historial: [],
  preliquidacion: {
    valor_alcance: 10_000_000, valor_contratista: 6_000_000, anticipo_pct: 65,
    definida_por: 'u', fecha_definicion: ts, aprobada_por: 'g', fecha_aprobacion: ts,
    giros: [{ valor: 3_900_000, fecha: ts, registrado_por: 'g' }],
  },
  ...sobre,
} as AsignacionContratista)

describe('patchCorregirPreliquidacion — el cero bloqueado y las cifras en la constancia', () => {
  it('rechaza valor 0 (misma exigencia que definir — el caso sin razón posible)', () => {
    expect(patchCorregirPreliquidacion(base(), true, { valor_contratista: 0, anticipo_pct: 65 }, 'motivo', 'u', ts, SNAPSHOT)).toBeNull()
    expect(patchCorregirPreliquidacion(base(), true, { valor_contratista: -5, anticipo_pct: 65 }, 'motivo', 'u', ts, SNAPSHOT)).toBeNull()
  })
  it('por debajo de lo girado: la constancia lleva LOS DOS números', () => {
    const r = patchCorregirPreliquidacion(base(), true, { valor_contratista: 2_000_000, anticipo_pct: 65 }, 'ajuste real', 'u', ts, SNAPSHOT)
    expect(r).not.toBeNull()
    expect(r!.entradaHistorial.motivo).toContain('POR DEBAJO de lo girado')
    expect(r!.entradaHistorial.motivo).toContain('3900000')
    expect(r!.entradaHistorial.motivo).toContain('2000000')
  })
  it('confirmadoConCifras: la constancia guarda valor, Σ girado y margen — no solo que se marcó', () => {
    const r = patchCorregirPreliquidacion(base(), true, { valor_contratista: 2_000_000, anticipo_pct: 65 }, 'ajuste real', 'u', ts, SNAPSHOT, true)
    expect(r!.entradaHistorial.motivo).toContain('CONFIRMADO con las cifras a la vista')
    expect(r!.entradaHistorial.motivo).toContain('valor 2000000')
    expect(r!.entradaHistorial.motivo).toContain('Σ girado 3900000')
    expect(r!.entradaHistorial.motivo).toMatch(/margen 80 %/)
  })
  it('sin confirmación no agrega la leyenda (el flag es del que marcó, no del builder)', () => {
    const r = patchCorregirPreliquidacion(base(), true, { valor_contratista: 7_000_000, anticipo_pct: 65 }, 'sube', 'u', ts, SNAPSHOT)
    expect(r!.entradaHistorial.motivo).not.toContain('CONFIRMADO')
    expect(r!.entradaHistorial.motivo).not.toContain('POR DEBAJO')
  })
  it('el margen de la corrección se calcula sobre la venta REAL de los átomos (snapshot completo)', () => {
    const r = patchCorregirPreliquidacion(base(), true, { valor_contratista: 2_000_000, anticipo_pct: 65 }, 'x', 'u', ts, SNAPSHOT)
    // venta 10M · costo 2M → margen 80% (implausible ≥70) — con el contexto
    // roto (solo grupos) habría salido venta 0 y margen nulo
    expect(r!.margen.venta).toBe(10_000_000)
    expect(r!.margen.implausible).toBe(true)
  })
})

describe('margenEnVivoDe — sin costo no hay respuesta falsa', () => {
  it('costo 0 contra venta real: 100% implausible (por eso la UI lo trata como «aún sin costo»)', () => {
    const m = margenEnVivoDe(10_000_000, 0)
    expect(m.margen_pct).toBe(100)
    expect(m.implausible).toBe(true)
  })
})
