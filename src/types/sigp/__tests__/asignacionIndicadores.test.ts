// P2-2 · SB2 — implausibilidad + exclusión por cobertura + costos v2 con
// lectura dual (resumen ↔ legacy).
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  margenImplicitoDe, requiereRevisionCobertura, UMBRAL_MARGEN_IMPLICITO_REVISAR_PCT,
  resumenAsignacionesDe,
} from '../asignacion'
import type { AsignacionContratista } from '../asignacion'
import { costoEjecutadoDe, costoPresupuestadoProyectoDe } from '../proyecto'
import type { AlcanceGrupo, Proyecto, ResumenAsignaciones } from '../proyecto'
import {
  excluidoPorCobertura, contextoCoberturaPanel, utilidadRealDe, ventaBaseDe, indMargenReal,
} from '../../../utils/sigp/indicadores'

const ts = Timestamp.fromDate(new Date('2026-09-03T12:00:00Z'))

// El alcance REAL de Megacenter (v4, con la Fibra — el estado actual de prod):
const ALCANCE_44: AlcanceGrupo[] = [
  { grupo: 'Protección', items: 2, subtotal: 1_965_120 },
  { grupo: 'Apertura', items: 3, subtotal: 13_132_251 },
  { grupo: 'Reparación', items: 4, subtotal: 30_330_605 },
  { grupo: 'Ensayos', items: 2, subtotal: 6_463_735 },
  { grupo: 'Fibra', items: 2, subtotal: 36_904_228 },
]

const asig = (over: Partial<AsignacionContratista> = {}): AsignacionContratista => ({
  id: 'a1', contratista_id: 'c', contratista_nombre: 'HECTOR',
  habilitacion_snapshot: { estado: 'activo', fuente: 'x', fecha_consulta: ts },
  atomos: ALCANCE_44.map(g => g.grupo), modalidad: 'todo_costo',
  estado: 'anticipo_girado', compras_reembolsos: [], asignado_por: 'u', fecha: ts,
  historial: [], fecha_creacion: ts, legacy: true, ...over,
})

describe('margen implícito — la señal que aflora Megacenter sin que nadie se acuerde', () => {
  it('Megacenter real: CD $88.795.939 atribuido vs contratista $5.200.000 → 94,1%', () => {
    const a = asig({ preliquidacion: { valor_alcance: 105_622_769, valor_contratista: 5_200_000, anticipo_pct: 60, definida_por: 'g', fecha_definicion: ts } })
    expect(margenImplicitoDe(a, ALCANCE_44)!).toBeCloseTo(94.14, 1)
    expect(requiereRevisionCobertura(a, ALCANCE_44)).toBe(true)
  })
  it('el CD se recalcula del alcance VIVO, jamás del valor_alcance legacy (que trae la venta vieja)', () => {
    const a = asig({ atomos: ['Ensayos'], preliquidacion: { valor_alcance: 105_622_769, valor_contratista: 4_000_000, anticipo_pct: 50, definida_por: 'g', fecha_definicion: ts } })
    // CD de Ensayos = 6.463.735 → margen (6.463.735−4.000.000)/6.463.735 = 38,1% — plausible
    expect(margenImplicitoDe(a, ALCANCE_44)!).toBeCloseTo(38.1, 1)
    expect(requiereRevisionCobertura(a, ALCANCE_44)).toBe(false)
  })
  it('solo_mano_obra suma los materiales NEG al costo (un margen alto ahí sería falso)', () => {
    const sin = asig({ atomos: ['Fibra'], modalidad: 'solo_mano_obra', valor_materiales: 25_000_000, preliquidacion: { valor_alcance: 1, valor_contratista: 5_000_000, anticipo_pct: 50, definida_por: 'g', fecha_definicion: ts } })
    // (36.904.228 − 30.000.000)/36.904.228 = 18,7% — NO revisar
    expect(margenImplicitoDe(sin, ALCANCE_44)!).toBeCloseTo(18.7, 1)
    expect(requiereRevisionCobertura(sin, ALCANCE_44)).toBe(false)
  })
  it('sin preliquidación / sin CD / cancelada → fuera de la señal', () => {
    expect(margenImplicitoDe(asig(), ALCANCE_44)).toBeNull()
    expect(margenImplicitoDe(asig({ atomos: ['No existe'], preliquidacion: { valor_alcance: 1, valor_contratista: 1, anticipo_pct: 50, definida_por: 'g', fecha_definicion: ts } }), ALCANCE_44)).toBeNull()
    const cancelada = asig({ estado: 'cancelada', preliquidacion: { valor_alcance: 1, valor_contratista: 1, anticipo_pct: 50, definida_por: 'g', fecha_definicion: ts } })
    expect(requiereRevisionCobertura(cancelada, ALCANCE_44)).toBe(false)
  })
  it('el umbral es constante NOMBRADA calibrada con el dato (corte 70,1→63,9 en prod)', () => {
    expect(UMBRAL_MARGEN_IMPLICITO_REVISAR_PCT).toBe(70)
  })
})

describe('costoEjecutadoDe v2 — resumen ↔ legacy sin divergencia', () => {
  const pre = { valor_venta: 1_000_000, valor_contratista: 700_000, anticipo_pct: 50, definida_por: 'u', fecha_definicion: ts }
  const conAsigs = [
    asig({ preliquidacion: { valor_alcance: 1, valor_contratista: 700_000, anticipo_pct: 50, definida_por: 'u', fecha_definicion: ts }, compras_reembolsos: [{ concepto: 'x', valor: 50_000, registrado_por: 'u', fecha: ts }] }),
  ]
  const resumen = resumenAsignacionesDe(conAsigs, ALCANCE_44)

  it('migrado: contratistas del resumen + compras; manual del resumen GANA íntegro', () => {
    const p = { estado: 'ejecutado', resumen_asignaciones: resumen } as Proyecto
    expect(costoEjecutadoDe(p, 100_000)).toBe(750_000 + 100_000)
    const manual = { ...resumen, costo_ejecutado_manual: 999_999 }
    expect(costoEjecutadoDe({ estado: 'ejecutado', resumen_asignaciones: manual } as Proyecto, 100_000)).toBe(999_999)
  })
  it('legacy: la fórmula vieja intacta (regresión C3/C4)', () => {
    const p = { estado: 'ejecutado', preliquidacion: pre, compras_reembolsos: [{ concepto: 'x', valor: 200_000, registrado_por: 'u', fecha: ts }] } as Proyecto
    expect(costoEjecutadoDe(p, 705_000)).toBe(700_000 + 705_000 + 200_000)
  })
  it('gate por estado intacto en ambas vías; resumen sin asignaciones → null', () => {
    expect(costoEjecutadoDe({ estado: 'en_ejecucion', resumen_asignaciones: resumen } as Proyecto, 0)).toBeNull()
    expect(costoEjecutadoDe({ estado: 'ejecutado', resumen_asignaciones: { ...resumen, total: 0 } } as Proyecto, 0)).toBeNull()
  })
  it('costoPresupuestadoProyectoDe: resumen ↔ legacy', () => {
    expect(costoPresupuestadoProyectoDe({ resumen_asignaciones: resumen } as Proyecto)).toBe(700_000)
    expect(costoPresupuestadoProyectoDe({ preliquidacion: { ...pre, modalidad_contratista: 'solo_mano_obra', valor_materiales: 300_000 } } as unknown as Proyecto)).toBe(1_000_000)
  })
})

describe('exclusión por cobertura + contexto del Panel (decide un humano, el sistema señala)', () => {
  const completa = { cobertura_completa: true, valor_sin_costear: 0, revisar_cobertura: 1 } as ResumenAsignaciones
  const incompleta = { cobertura_completa: false, valor_sin_costear: 45_427_976, revisar_cobertura: 0 } as ResumenAsignaciones

  it('solo excluye migrados con cobertura incompleta — legacy entra como siempre', () => {
    expect(excluidoPorCobertura({ resumen_asignaciones: incompleta })).toBe(true)
    expect(excluidoPorCobertura({ resumen_asignaciones: completa })).toBe(false)
    expect(excluidoPorCobertura({})).toBe(false)
  })
  it('la lista de revisar NO excluye del indicador (condición explícita)', () => {
    const p = { estado: 'ejecutado', snapshot: { valor_venta: 1_000_000 }, resumen_asignaciones: { ...completa, costo_contratistas: 700_000, costo_ejecutado_manual: 0, total: 1 } } as unknown as Proyecto
    expect(utilidadRealDe(p, 0)).toBe(300_000)   // revisar_cobertura=1 y AUN ASÍ mide
  })
  it('contextoCoberturaPanel agrega excluidos, $ sin costear y revisar', () => {
    const ps = [
      { resumen_asignaciones: incompleta }, { resumen_asignaciones: completa }, {},
    ] as Proyecto[]
    expect(contextoCoberturaPanel(ps)).toEqual({ excluidos_cobertura: 1, valor_sin_costear: 45_427_976, revisar_cobertura: 1 })
  })
  it('utilidadRealDe: señal por-asignación o cobertura incompleta → sin número; ventaBaseDe dual', () => {
    const conSenal = { estado: 'ejecutado', snapshot: { valor_venta: 1 }, resumen_asignaciones: { ...completa, alcance_desactualizado: 1 } } as unknown as Proyecto
    expect(utilidadRealDe(conSenal, 0)).toBeNull()
    expect(utilidadRealDe({ estado: 'ejecutado', snapshot: { valor_venta: 1 }, resumen_asignaciones: incompleta } as unknown as Proyecto, 0)).toBeNull()
    expect(ventaBaseDe({ resumen_asignaciones: completa, snapshot: { valor_venta: 5 } } as unknown as Proyecto)).toBe(5)
    expect(ventaBaseDe({ preliquidacion: { valor_venta: 7 } } as unknown as Proyecto)).toBe(7)
    expect(ventaBaseDe({} as Proyecto)).toBeNull()
  })
  it('indMargenReal mezcla migrados y legacy sin doble conteo', () => {
    const migrado = { id: 'm', estado: 'ejecutado', snapshot: { valor_venta: 1_000_000 }, resumen_asignaciones: { ...completa, costo_contratistas: 700_000, costo_ejecutado_manual: 0, total: 1, alcance_desactualizado: 0 } } as unknown as Proyecto
    const legacy = { id: 'l', estado: 'ejecutado', snapshot: { valor_venta: 0 }, preliquidacion: { valor_venta: 500_000, valor_contratista: 400_000, anticipo_pct: 50, definida_por: 'u', fecha_definicion: ts } } as unknown as Proyecto
    const r = indMargenReal([migrado, legacy], {}, null)
    expect(r.proyectos).toBe(2)
    expect(r.utilidad).toBe(300_000 + 100_000)
    expect(r.venta).toBe(1_500_000)
  })
})
