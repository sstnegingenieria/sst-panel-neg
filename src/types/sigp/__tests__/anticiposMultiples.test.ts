// Anticipos múltiples (28-oct — Parte C del bloque proyección/saldo).
//
// El caso real que lo motiva: un contratista pidió un SEGUNDO anticipo y el
// modelo de campo único no tenía dónde ponerle fecha y comprobante propios —
// "corregir al alza" los perdía y el camino del reembolso producía DOBLE PAGO.
// Fija: la lista canónica giros[], la SUMA como valor efectivo en los cuatro
// consumidores, el hito del PRIMER giro, el aviso sobre-acordado (C.4, contra
// el valor acordado TOTAL — no existe % pactado, C1a descartado), el motivo y
// soporte de la insuficiencia en el adicional (C1b) y la traza solo-crecer de
// correcciones (C3).
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  girosDe, girosVivosDe, anticipoTotalDe, hayAnticipoGirado, giroSobreAcordado,
  patchGirarAnticipo, patchGirarAnticipoAdicional, patchCorregirAnticipo,
  patchLiquidarAsignacion, patchCancelarAsignacion, patchAjustarAtomos,
  resumenAsignacionesDe,
} from '../asignacion'
import type { AsignacionContratista } from '../asignacion'
import type { AnticipoGirado } from '../proyecto'

const ts = Timestamp.fromMillis(1_790_000_000_000)
const giro = (valor: number, extra: Partial<AnticipoGirado> = {}): AnticipoGirado =>
  ({ fecha: ts, valor, registrado_por: 'marcela', ...extra })

const base = (over: Partial<AsignacionContratista>): AsignacionContratista => ({
  id: 'a1', estado: 'anticipo_girado', contratista_id: 'c1', contratista_nombre: 'Lozano',
  atomos: ['G1'], fecha: ts, fecha_creacion: ts, asignado_por: 'u1',
  modalidad: 'todo_costo', compras_reembolsos: [], historial: [],
  habilitacion_snapshot: { estado: 'activo', fecha_consulta: ts, fuente: 'test' },
  preliquidacion: {
    valor_alcance: 10_000_000, valor_contratista: 4_000_000, anticipo_pct: 50,
    definida_por: 'u1', fecha_definicion: ts, aprobada_por: 'marcela', fecha_aprobacion: ts,
    giros: [giro(2_000_000)],
  },
  ...over,
} as AsignacionContratista)

const alcance = { alcance: [{ grupo: 'G1', items: 1, subtotal: 10_000_000 }] } as never

describe('helpers — girosDe / anticipoTotalDe toleran ambas formas', () => {
  it('canónica: lee giros[] y suma solo los vivos', () => {
    const pre = { giros: [giro(100), giro(50, { anulado: { fecha: ts, por: 'm', motivo: 'x' } }), giro(30)] }
    expect(girosDe(pre)).toHaveLength(3)
    expect(girosVivosDe(pre)).toHaveLength(2)
    expect(anticipoTotalDe(pre)).toBe(130)
    expect(hayAnticipoGirado(pre)).toBe(true)
  })
  it('legacy: el objeto único cuenta como lista de uno (pre-migración)', () => {
    const pre = { anticipo: giro(125_000) }
    expect(girosDe(pre)).toHaveLength(1)
    expect(anticipoTotalDe(pre)).toBe(125_000)
  })
  it('sin nada / null → vacío, suma 0, sin anticipo girado', () => {
    expect(girosDe(undefined)).toEqual([])
    expect(anticipoTotalDe(null)).toBe(0)
    expect(hayAnticipoGirado({ giros: [giro(9, { anulado: { fecha: ts, por: 'm', motivo: 'x' } })] })).toBe(false)
  })
  it('giroSobreAcordado: estrictamente mayor que el acordado total', () => {
    expect(giroSobreAcordado(100, 100)).toBe(false)
    expect(giroSobreAcordado(100, 101)).toBe(true)
  })
})

describe('patchGirarAnticipo — primer giro, forma canónica', () => {
  const aprobada = base({ estado: 'preliquidacion_aprobada', preliquidacion: {
    valor_alcance: 10_000_000, valor_contratista: 4_000_000, anticipo_pct: 50,
    definida_por: 'u1', fecha_definicion: ts, aprobada_por: 'marcela', fecha_aprobacion: ts,
  } as never })
  it('escribe giros[] y transiciona (el estado es el hito del PRIMER giro)', () => {
    const r = patchGirarAnticipo(aprobada, giro(2_000_000), 'marcela', ts)!
    expect(r.sub.estado).toBe('anticipo_girado')
    expect(r.sub.preliquidacion!.giros).toHaveLength(1)
    expect('anticipo' in r.sub.preliquidacion!).toBe(false)
    expect(r.sobreAcordado).toBe(false)
  })
  it('AVISO C.4 también en el PRIMER giro — hoy no existía ni ese: dos cifras en el historial, jamás bloqueo', () => {
    const r = patchGirarAnticipo(aprobada, giro(4_500_000), 'marcela', ts)!
    expect(r.sobreAcordado).toBe(true)
    expect(r.entradaHistorial.motivo).toContain('GIRO SOBRE EL VALOR ACORDADO')
    expect(r.entradaHistorial.motivo).toContain('4500000')
    expect(r.entradaHistorial.motivo).toContain('4000000')
  })
  it('re-girar tras anulación total APPENDEA (el anulado queda — cero borrado físico)', () => {
    const anuladoTodo = base({ estado: 'preliquidacion_aprobada', preliquidacion: {
      ...aprobada.preliquidacion!, giros: [giro(1_000, { anulado: { fecha: ts, por: 'm', motivo: 'no salió' } })],
    } as never })
    const r = patchGirarAnticipo(anuladoTodo, giro(500_000), 'marcela', ts)!
    expect(r.sub.preliquidacion!.giros).toHaveLength(2)
    expect(r.sub.preliquidacion!.giros![0].anulado).toBeTruthy()
    expect(anticipoTotalDe(r.sub.preliquidacion)).toBe(500_000)
  })
  it('convierte la forma legacy si viniera (anticipo → giros[0] + nuevo)', () => {
    // No ocurre por la máquina de hoy (aprobada ⇒ sin giro vivo), pero el
    // builder no depende de eso: jamás pisa un giro existente.
    const legacy = base({ estado: 'preliquidacion_aprobada', preliquidacion: {
      ...aprobada.preliquidacion!, anticipo: giro(100) } as never })
    const r = patchGirarAnticipo(legacy, giro(200), 'marcela', ts)!
    expect(r.sub.preliquidacion!.giros!.map(g => g.valor)).toEqual([100, 200])
    expect('anticipo' in r.sub.preliquidacion!).toBe(false)
  })
})

describe('patchGirarAnticipoAdicional — C1(b): motivo y soporte de la insuficiencia', () => {
  const girada = base({})
  const adicional = giro(1_500_000, { motivo: 'materiales subieron, el primer giro no cubre el arranque', evidencia_url: 'https://x/soporte.pdf' })

  it('appendea sin mover el estado; numero y suma correctos', () => {
    const r = patchGirarAnticipoAdicional(girada, adicional, 'marcela', ts)!
    expect(r.sub.estado).toBeUndefined()
    expect(r.numero).toBe(2)
    expect(r.suma).toBe(3_500_000)
    expect(r.sobreAcordado).toBe(false)
    expect(r.entradaHistorial.motivo).toContain('ADICIONAL')
    expect(r.entradaHistorial.motivo).toContain('giro 2')
    expect(r.entradaHistorial.motivo).toContain('Motivo de la insuficiencia')
  })
  it('rehúsa sin motivo o sin comprobante — es cuando MÁS se necesita el soporte', () => {
    expect(patchGirarAnticipoAdicional(girada, giro(100, { evidencia_url: 'https://x' }), 'm', ts)).toBeNull()
    expect(patchGirarAnticipoAdicional(girada, giro(100, { motivo: 'falta' }), 'm', ts)).toBeNull()
    expect(patchGirarAnticipoAdicional(girada, { ...adicional, valor: 0 }, 'm', ts)).toBeNull()
  })
  it('rehúsa fuera de anticipo_girado o sin giro vivo previo (el primero va por patchGirarAnticipo)', () => {
    expect(patchGirarAnticipoAdicional(base({ estado: 'preliquidacion_aprobada' }), adicional, 'm', ts)).toBeNull()
    const sinVivos = base({ preliquidacion: { ...girada.preliquidacion!, giros: [giro(1, { anulado: { fecha: ts, por: 'm', motivo: 'x' } })] } as never })
    expect(patchGirarAnticipoAdicional(sinVivos, adicional, 'm', ts)).toBeNull()
  })
  it('la SUMA cruza el acordado → aviso con las dos cifras, jamás bloqueo', () => {
    const r = patchGirarAnticipoAdicional(girada, { ...adicional, valor: 2_500_000 }, 'marcela', ts)!
    expect(r.suma).toBe(4_500_000)
    expect(r.sobreAcordado).toBe(true)
    expect(r.entradaHistorial.motivo).toContain('GIRO SOBRE EL VALOR ACORDADO')
    expect(r.entradaHistorial.motivo).toContain('registrado con las dos cifras a la vista')
  })
  it('convierte la forma legacy al appendear (pre-migración)', () => {
    const legacy = base({ preliquidacion: { ...girada.preliquidacion!, giros: undefined, anticipo: giro(2_000_000) } as never })
    const r = patchGirarAnticipoAdicional(legacy, adicional, 'marcela', ts)!
    expect(r.sub.preliquidacion!.giros!.map(g => g.valor)).toEqual([2_000_000, 1_500_000])
    expect('anticipo' in r.sub.preliquidacion!).toBe(false)
  })
})

describe('patchCorregirAnticipo — por GIRO, con traza solo-crecer (C3)', () => {
  const dosGiros = base({ preliquidacion: {
    ...base({}).preliquidacion!, giros: [giro(2_000_000), giro(1_500_000, { motivo: 'insuficiencia', evidencia_url: 'https://x' })],
  } as never })

  it('con DOS vivos el índice es obligatorio — corregir "el anticipo" a secas ya no existe', () => {
    expect(patchCorregirAnticipo(dosGiros, { valor: 999 }, 'motivo', 'g', ts)).toBeNull()
  })
  it('corrige el giro elegido APPENDEANDO la corrección; la suma se recalcula', () => {
    const r = patchCorregirAnticipo(dosGiros, { indice: 1, valor: 1_200_000 }, 'typo', 'g', ts, 'Giovanny')!
    const g1 = r.sub.preliquidacion!.giros![1]
    expect(g1.valor).toBe(1_200_000)
    expect(g1.correcciones).toHaveLength(1)
    expect(g1.correcciones![0]).toMatchObject({ valor_anterior: 1_500_000, valor_nuevo: 1_200_000, por: 'g', por_nombre: 'Giovanny' })
    expect(r.sub.preliquidacion!.giros![0].correcciones).toBeUndefined()
    expect(r.entradaHistorial.motivo).toContain('giro 2')
    expect(r.entradaHistorial.motivo).toContain('Σ girado 3200000')
  })
  it('segunda corrección del mismo giro: la traza CRECE, jamás se reescribe', () => {
    const una = patchCorregirAnticipo(dosGiros, { indice: 0, valor: 1_800_000 }, 'ajuste', 'g', ts)!
    const tras = { ...dosGiros, preliquidacion: una.sub.preliquidacion } as AsignacionContratista
    const dos = patchCorregirAnticipo(tras, { indice: 0, valor: 1_900_000 }, 're-ajuste', 'g', ts)!
    expect(dos.sub.preliquidacion!.giros![0].correcciones!.map(c => c.valor_nuevo)).toEqual([1_800_000, 1_900_000])
  })
  it('ANULA uno de dos → marcador soft, estado intacto, Σ vigente en el historial', () => {
    const r = patchCorregirAnticipo(dosGiros, { indice: 1, anular: true }, 'no salió', 'g', ts)!
    expect(r.anula).toBe(true)
    expect(r.sub.estado).toBeUndefined()
    expect(r.sub.preliquidacion!.giros).toHaveLength(2)
    expect(r.sub.preliquidacion!.giros![1].anulado).toMatchObject({ por: 'g', motivo: 'no salió' })
    expect(r.entradaHistorial.motivo).toContain('Σ girado vigente 2000000')
  })
  it('ANULA el ÚNICO vivo → revierte a preliquidacion_aprobada (comportamiento de siempre), sin borrar nada', () => {
    const r = patchCorregirAnticipo(base({}), { anular: true }, 'el giro nunca salió', 'g', ts)!
    expect(r.sub.estado).toBe('preliquidacion_aprobada')
    expect(r.sub.preliquidacion!.giros).toHaveLength(1)
    expect(r.sub.preliquidacion!.giros![0].anulado).toBeTruthy()
    expect(r.entradaHistorial.motivo).toContain('sin giros vivos')
  })
  it('corrección al ALZA que cruza el acordado → aviso (el camino que antes absorbía un segundo giro)', () => {
    const r = patchCorregirAnticipo(base({}), { valor: 4_200_000 }, 'segunda transferencia NO: es corrección real', 'g', ts)!
    expect(r.sobreAcordado).toBe(true)
    expect(r.entradaHistorial.motivo).toContain('GIRO SOBRE EL VALOR ACORDADO')
  })
})

describe('los cuatro consumidores leen la SUMA', () => {
  const dosGiros = base({ preliquidacion: {
    ...base({}).preliquidacion!, giros: [giro(2_000_000), giro(1_000_000, { motivo: 'x', evidencia_url: 'https://x' })],
  } as never })

  it('liquidación: descuenta Σ giros vivos (saldo = total − Σ − retenciones)', () => {
    const r = patchLiquidarAsignacion(dosGiros, 'pagado_cliente', { retenciones: [] }, true, 'marcela', ts)!
    expect(r.liquidacion.anticipo_girado).toBe(3_000_000)
    expect(r.liquidacion.saldo_final).toBe(4_000_000 - 3_000_000)
  })
  it('liquidación: un giro anulado NO descuenta', () => {
    const conAnulado = base({ preliquidacion: { ...dosGiros.preliquidacion!, giros: [
      giro(2_000_000), giro(1_000_000, { anulado: { fecha: ts, por: 'm', motivo: 'x' } }),
    ] } as never })
    const r = patchLiquidarAsignacion(conAnulado, 'pagado_cliente', { retenciones: [] }, true, 'marcela', ts)!
    expect(r.liquidacion.anticipo_girado).toBe(2_000_000)
  })
  it('guarda de sobre-giro (#130): el valor confirmado se compara contra la SUMA', () => {
    const alcance2 = { alcance: [
      { grupo: 'G1', items: 1, subtotal: 6_000_000 }, { grupo: 'G2', items: 1, subtotal: 4_000_000 },
    ] } as never
    const conDos = { ...dosGiros, atomos: ['G1', 'G2'] } as AsignacionContratista
    const r = patchAjustarAtomos(conDos, ['G1'], alcance2, [], 'recorte', 'u', ts, 2_500_000, false)!
    // 2.500.000 < Σ girado 3.000.000 → sobre-giro; contra un solo giro (2M) no habría avisado
    expect(r.sobreGiro).toBe(true)
    expect(r.entradaHistorial.motivo).toContain('SOBRE-GIRO')
    expect(r.entradaHistorial.motivo).toContain('3000000')
  })
  it('incurrido de cancelación: Σ giros vivos', () => {
    const r = patchCancelarAsignacion(dosGiros, 'se cae el proyecto', 'u', ts)!
    expect(r.incurrido.anticipo).toBe(3_000_000)
  })
  it('resumen/gate de ejecución: cuenta por PRESENCIA de giros vivos (≥1), legacy incluida', () => {
    const legacy = base({ id: 'a2', preliquidacion: { ...base({}).preliquidacion!, giros: undefined, anticipo: giro(100) } as never })
    const sinGiro = base({ id: 'a3', estado: 'preliquidacion_aprobada', preliquidacion: { ...base({}).preliquidacion!, giros: [] } as never })
    const r = resumenAsignacionesDe([dosGiros, legacy, sinGiro], alcance)
    expect(r.anticipos_girados).toBe(2)
  })
})
