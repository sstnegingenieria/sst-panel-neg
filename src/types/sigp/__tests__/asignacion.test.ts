// P2-2 · SB1 — motor de asignaciones múltiples.
//
// PESO ESPECIAL en liquidación (señalado por Giovanny): en 44 proyectos de
// prod hay CERO liquidaciones — el camino nunca corrió; estos tests + el E2E
// son la única validación que tendrá antes de mover dinero real.
import { describe, it, expect } from 'vitest'
import { Timestamp } from 'firebase/firestore'
import {
  construirAsignacionMulti, patchDefinirPreliquidacion, patchAprobarPreliquidacion,
  patchGirarAnticipo, patchCorregirPreliquidacion, patchLiquidarAsignacion,
  patchCancelarAsignacion, patchAjustarAtomos, patchResolverSenal,
  valorAlcanceDe, coberturaDe, baseMargenDe, ETIQUETA_BASE_MARGEN,
  sintetizarAsignacionLegacy, estadoAsignacionLegacyDe, asignacionesDe,
  resumenAsignacionesDe, detectarDesincronizacion, subEtapaDe, SUB_ETAPAS_PREPARACION,
  mapearEstadoV2, asignacionesLiquidadas, costoPresupuestadoAsignaciones, costoContratistasDe,
  atomosTomados, TRANSICIONES_ASIGNACION, ESTADOS_ASIGNACION,
} from '../asignacion'
import type { AsignacionContratista } from '../asignacion'
import type { AlcanceGrupo, Proyecto } from '../proyecto'

const ts = Timestamp.fromDate(new Date('2026-09-03T12:00:00Z'))

// El alcance VIGENTE de Megacenter tras el cambio de P2-1 (sin la Fibra):
const ALCANCE_MEGACENTER: AlcanceGrupo[] = [
  { grupo: 'Protección de equipos y limpieza', items: 2, subtotal: 1_965_120 },
  { grupo: 'Apertura de grietas o fisuras', items: 3, subtotal: 13_132_251 },
  { grupo: 'Reparación de grietas o fisuras', items: 4, subtotal: 30_330_605 },
  { grupo: 'Ensayos y diagnóstico estructural', items: 2, subtotal: 6_463_735 },
]
const CD_VIGENTE = 51_891_711

const hector = { id: 'c7DH', nombre: 'HECTOR YESID BUITRAGO', cedula: '10002721856', estado: 'activo' }

const base = (over: Partial<AsignacionContratista> = {}): AsignacionContratista => ({
  id: 'a1', contratista_id: 'c7DH', contratista_nombre: 'HECTOR',
  habilitacion_snapshot: { estado: 'activo', fuente: 'x', fecha_consulta: ts },
  atomos: ['Ensayos y diagnóstico estructural'], modalidad: 'todo_costo',
  estado: 'asignada', compras_reembolsos: [], asignado_por: 'u', fecha: ts,
  historial: [], fecha_creacion: ts, ...over,
})

describe('construirAsignacionMulti — invariante duro de átomos', () => {
  it('feliz: Héctor con SOLO Ensayos (átomo confirmado por Giovanny)', () => {
    const a = construirAsignacionMulti(hector, ['Ensayos y diagnóstico estructural'], 'todo_costo', undefined, ALCANCE_MEGACENTER, [], 'u', ts)
    expect(a.estado).toBe('asignada')
    expect(a.atomos).toEqual(['Ensayos y diagnóstico estructural'])
    expect(a.contratista_documento).toBe('10002721856')
  })
  it('átomo YA TOMADO por una asignación viva → LANZA, no advierte', () => {
    const existente = base({ atomos: ['Ensayos y diagnóstico estructural'] })
    expect(() => construirAsignacionMulti(hector, ['Ensayos y diagnóstico estructural'], 'todo_costo', undefined, ALCANCE_MEGACENTER, [existente], 'u', ts))
      .toThrow(/ya está asignada/)
  })
  it('átomo de una asignación CANCELADA queda libre (la cancelación libera)', () => {
    const cancelada = base({ estado: 'cancelada' })
    expect(() => construirAsignacionMulti(hector, ['Ensayos y diagnóstico estructural'], 'todo_costo', undefined, ALCANCE_MEGACENTER, [cancelada], 'u', ts))
      .not.toThrow()
  })
  it('contratista no habilitado / átomo inexistente / vacíos / solo_mano_obra sin materiales → lanzan', () => {
    expect(() => construirAsignacionMulti({ ...hector, estado: 'inactivo' }, ['Ensayos y diagnóstico estructural'], 'todo_costo', undefined, ALCANCE_MEGACENTER, [], 'u', ts)).toThrow(/habilitados/)
    expect(() => construirAsignacionMulti(hector, ['No existe'], 'todo_costo', undefined, ALCANCE_MEGACENTER, [], 'u', ts)).toThrow(/no existe en el alcance/)
    expect(() => construirAsignacionMulti(hector, [], 'todo_costo', undefined, ALCANCE_MEGACENTER, [], 'u', ts)).toThrow(/al menos una/)
    expect(() => construirAsignacionMulti(hector, ['Ensayos y diagnóstico estructural'], 'solo_mano_obra', undefined, ALCANCE_MEGACENTER, [], 'u', ts)).toThrow(/materiales/)
  })
})

describe('cobertura — los números exactos de Megacenter (la verdad del proyecto)', () => {
  it('Héctor solo con Ensayos → $45.427.976 sin costear (87,5% del CD)', () => {
    const asigs = [base()]
    const cob = coberturaDe(ALCANCE_MEGACENTER, asigs)
    expect(cob.completa).toBe(false)
    expect(cob.sin_asignar.length).toBe(3)
    expect(cob.valor_sin_costear).toBe(45_427_976)
    expect(valorAlcanceDe(['Ensayos y diagnóstico estructural'], ALCANCE_MEGACENTER)).toBe(6_463_735)
    expect(6_463_735 + 45_427_976).toBe(CD_VIGENTE)
  })
  it('cobertura completa cuando todos los átomos están en asignaciones vivas', () => {
    const a1 = base()
    const a2 = base({ id: 'a2', atomos: ['Protección de equipos y limpieza', 'Apertura de grietas o fisuras', 'Reparación de grietas o fisuras'] })
    expect(coberturaDe(ALCANCE_MEGACENTER, [a1, a2]).completa).toBe(true)
  })
})

describe('condición A — la base del margen se ROTULA y las legacy no se disfrazan', () => {
  it('nueva → cd_atomos · legacy → venta_total_legacy, con etiquetas distintas', () => {
    expect(baseMargenDe({ legacy: undefined })).toBe('cd_atomos')
    expect(baseMargenDe({ legacy: true })).toBe('venta_total_legacy')
    expect(ETIQUETA_BASE_MARGEN.cd_atomos).not.toBe(ETIQUETA_BASE_MARGEN.venta_total_legacy)
    expect(ETIQUETA_BASE_MARGEN.venta_total_legacy).toMatch(/anterior/)
  })
})

describe('ciclo económico: definir → aprobar → girar', () => {
  it('definir congela valor_alcance = CD de SUS átomos', () => {
    const r = patchDefinirPreliquidacion(base(), { valor_contratista: 4_000_000, anticipo_pct: 50 }, ALCANCE_MEGACENTER, 'u', ts)!
    expect(r.sub.estado).toBe('preliquidacion_definida')
    expect(r.sub.preliquidacion!.valor_alcance).toBe(6_463_735)
    expect(r.sub.preliquidacion!.valor_contratista).toBe(4_000_000)
  })
  it('aprobar con salvedad (respaldo) y sin ella (titular); girar exige aprobada', () => {
    const definida = base({ estado: 'preliquidacion_definida', preliquidacion: { valor_alcance: 6_463_735, valor_contratista: 4_000_000, anticipo_pct: 50, definida_por: 'u', fecha_definicion: ts } })
    const ap = patchAprobarPreliquidacion(definida, 'marcela', ts)!
    expect(ap.sub.estado).toBe('preliquidacion_aprobada')
    expect(ap.sub.preliquidacion!.salvedad).toBeUndefined()
    const resp = patchAprobarPreliquidacion(definida, 'gg', ts, 'titular de viaje')!
    expect(resp.sub.preliquidacion!.salvedad).toBe('titular de viaje')
    expect(patchGirarAnticipo(definida, { fecha: ts, valor: 1, registrado_por: 'm' }, 'm', ts)).toBeNull()
    const aprobada = { ...definida, estado: 'preliquidacion_aprobada' as const, preliquidacion: ap.sub.preliquidacion! }
    const giro = patchGirarAnticipo(aprobada, { fecha: ts, valor: 2_000_000, registrado_por: 'm' }, 'm', ts)!
    expect(giro.sub.estado).toBe('anticipo_girado')
    expect(giro.sub.preliquidacion!.anticipo!.valor).toBe(2_000_000)
  })
})

describe('corrección — revierte vs ajuste, y resuelve la señal', () => {
  const girada = base({
    estado: 'anticipo_girado',
    preliquidacion: { valor_alcance: 6_463_735, valor_contratista: 4_000_000, anticipo_pct: 50, definida_por: 'u', fecha_definicion: ts, aprobada_por: 'm', fecha_aprobacion: ts, anticipo: { fecha: ts, valor: 2_000_000, registrado_por: 'm' } },
    alcance_desactualizado: { version: 5, fecha: ts, atomos_afectados: ['X'] },
  })
  it('proyecto pre-ejecución → REVIERTE (retira aprobación) + resuelveSenal', () => {
    const r = patchCorregirPreliquidacion(girada, false, { valor_contratista: 3_500_000, anticipo_pct: 50 }, 'error de digitación', 'u', ts)!
    expect(r.revierte).toBe(true)
    expect(r.sub.estado).toBe('preliquidacion_definida')
    expect(r.sub.preliquidacion!.aprobada_por).toBeUndefined()
    expect(r.sub.preliquidacion!.anticipo!.valor).toBe(2_000_000)   // el giro es hecho consumado
    expect(r.resuelveSenal).toBe(true)
  })
  it('proyecto en ejecución → AJUSTE trazable sin re-aprobación', () => {
    const r = patchCorregirPreliquidacion(girada, true, { valor_contratista: 4_200_000, anticipo_pct: 50 }, 'compra olvidada', 'u', ts)!
    expect(r.ajuste).toBe(true)
    expect(r.sub.estado).toBe('anticipo_girado')
    expect(r.sub.preliquidacion!.aprobada_por).toBe('m')
    expect(r.sub.preliquidacion!.ajuste_pendiente_liquidacion).toBe(true)
  })
  it('sin cambio de valores / liquidada / sin motivo → null', () => {
    expect(patchCorregirPreliquidacion(girada, false, { valor_contratista: 4_000_000, anticipo_pct: 50 }, 'x', 'u', ts)).toBeNull()
    expect(patchCorregirPreliquidacion({ ...girada, estado: 'liquidada' }, false, { valor_contratista: 1, anticipo_pct: 50 }, 'x', 'u', ts)).toBeNull()
    expect(patchCorregirPreliquidacion(girada, false, { valor_contratista: 1, anticipo_pct: 50 }, '  ', 'u', ts)).toBeNull()
  })
})

describe('LIQUIDACIÓN — el camino que nunca corrió en prod (peso máximo)', () => {
  const girada = base({
    estado: 'anticipo_girado',
    preliquidacion: {
      valor_alcance: 6_463_735, valor_contratista: 4_000_000, anticipo_pct: 50,
      definida_por: 'u', fecha_definicion: ts, aprobada_por: 'm', fecha_aprobacion: ts,
      anticipo: { fecha: ts, valor: 2_000_000, registrado_por: 'm' },
    },
    compras_reembolsos: [
      { concepto: 'Epóxico', valor: 350_000, registrado_por: 'u', fecha: ts },
      { concepto: 'Transporte', valor: 150_000, registrado_por: 'u', fecha: ts },
    ],
  })

  it('CASO COMPLETO: anticipo + reembolsos + retenciones — cada peso en su lugar', () => {
    const r = patchLiquidarAsignacion(girada, 'pagado_cliente',
      { retenciones: [{ concepto: 'Garantía 5%', valor: 200_000 }, { concepto: 'ReteICA', valor: 50_000 }] },
      true, 'marcela', ts)!
    const l = r.liquidacion
    expect(l.mano_obra).toBe(4_000_000)
    expect(l.diferencia).toBe(500_000)                 // Σ reembolsos
    expect(l.total_final).toBe(4_500_000)              // mano de obra + reembolsos
    expect(l.anticipo_girado).toBe(2_000_000)          // el giro REAL
    expect(l.saldo_final).toBe(4_500_000 - 2_000_000 - 250_000)   // = 2.250.000
    expect(l.es_igual).toBe(false)
    expect(l.retenciones.length).toBe(2)
    expect(r.sub.estado).toBe('liquidada')
    expect(r.sub.preliquidacion!.ajuste_pendiente_liquidacion).toBeUndefined()
  })

  it('SOBRE-GIRO: el saldo negativo se muestra, jamás se recorta', () => {
    const sobre = { ...girada, preliquidacion: { ...girada.preliquidacion!, anticipo: { fecha: ts, valor: 5_000_000, registrado_por: 'm' } } }
    const r = patchLiquidarAsignacion(sobre, 'pagado_cliente', { retenciones: [] }, true, 'm', ts)!
    expect(r.liquidacion.saldo_final).toBe(4_500_000 - 5_000_000)   // −500.000 honesto
  })

  it('es_igual SOLO sin reembolsos y sin ajustes pendientes', () => {
    const limpia = { ...girada, compras_reembolsos: [] }
    expect(patchLiquidarAsignacion(limpia, 'pagado_cliente', { retenciones: [] }, true, 'm', ts)!.liquidacion.es_igual).toBe(true)
    const conAjuste = { ...limpia, preliquidacion: { ...limpia.preliquidacion!, ajuste_pendiente_liquidacion: true } }
    expect(patchLiquidarAsignacion(conAjuste, 'pagado_cliente', { retenciones: [] }, true, 'm', ts)!.liquidacion.es_igual).toBe(false)
  })

  it('GATE SST caído → null (innegociable, además de la regla)', () => {
    expect(patchLiquidarAsignacion(girada, 'pagado_cliente', { retenciones: [] }, false, 'm', ts)).toBeNull()
  })

  it('ORIGEN: pagado_cliente normal · facturado SOLO anticipada completa · otro → null', () => {
    expect(patchLiquidarAsignacion(girada, 'facturado', { retenciones: [] }, true, 'm', ts)).toBeNull()   // sin justificación
    const ant = patchLiquidarAsignacion(girada, 'facturado',
      { retenciones: [], justificacion_anticipada: 'acuerdo de gerencias', acuerdo_con: 'Giovanny', acuerdo_fecha: ts }, true, 'm', ts)!
    expect(ant.liquidacion.liquidacion_anticipada).toBe(true)
    expect(patchLiquidarAsignacion(girada, 'en_ejecucion', { retenciones: [] }, true, 'm', ts)).toBeNull()
  })

  it('estado inválido de la asignación → null (definida/aprobada no se liquidan)', () => {
    expect(patchLiquidarAsignacion({ ...girada, estado: 'preliquidacion_aprobada' }, 'pagado_cliente', { retenciones: [] }, true, 'm', ts)).toBeNull()
  })

  it('CANCELADA con incurrido: liquida LO INCURRIDO (cierre anticipado), no el pactado', () => {
    const cancelada = {
      ...girada, estado: 'cancelada' as const,
      cancelacion: { fecha: ts, por: 'u', motivo: 'obra suspendida', incurrido: { anticipo: 2_000_000, reembolsos: 500_000, total: 2_500_000 } },
    }
    const r = patchLiquidarAsignacion(cancelada, 'pagado_cliente', { retenciones: [] }, true, 'm', ts)!
    expect(r.liquidacion.es_cancelacion).toBe(true)
    expect(r.liquidacion.mano_obra).toBe(2_000_000)     // lo incurrido, no 4.000.000
    expect(r.liquidacion.total_final).toBe(2_500_000)
    expect(r.liquidacion.saldo_final).toBe(2_500_000 - 2_000_000)   // reembolsos por pagar
  })

  it('CANCELADA sin incurrido → null (terminal, no hay nada que liquidar)', () => {
    const limpia = base({ estado: 'cancelada', cancelacion: { fecha: ts, por: 'u', motivo: 'x', incurrido: { anticipo: 0, reembolsos: 0, total: 0 } } })
    expect(patchLiquidarAsignacion(limpia, 'pagado_cliente', { retenciones: [] }, true, 'm', ts)).toBeNull()
  })
})

describe('cancelación — el caso general con valores en cero', () => {
  it('sin plata afuera → incurrido 0 (terminal); con anticipo+reembolsos → registrado y pendiente', () => {
    const r0 = patchCancelarAsignacion(base(), 'ya no se necesita', 'u', ts)!
    expect(r0.incurrido).toEqual({ anticipo: 0, reembolsos: 0, total: 0 })
    const con = base({
      estado: 'anticipo_girado',
      preliquidacion: { valor_alcance: 1, valor_contratista: 4_000_000, anticipo_pct: 50, definida_por: 'u', fecha_definicion: ts, anticipo: { fecha: ts, valor: 2_000_000, registrado_por: 'm' } },
      compras_reembolsos: [{ concepto: 'x', valor: 300_000, registrado_por: 'u', fecha: ts }],
    })
    const r = patchCancelarAsignacion(con, 'cliente suspendió la obra', 'u', ts)!
    expect(r.incurrido).toEqual({ anticipo: 2_000_000, reembolsos: 300_000, total: 2_300_000 })
    expect(r.entradaHistorial.motivo).toMatch(/PENDIENTE DE LIQUIDAR/)
  })
  it('liquidada/cancelada no se cancelan; sin motivo → null', () => {
    expect(patchCancelarAsignacion(base({ estado: 'liquidada' }), 'x', 'u', ts)).toBeNull()
    expect(patchCancelarAsignacion(base(), '  ', 'u', ts)).toBeNull()
  })
})

describe('ajustar átomos — el caso Megacenter tras la migración', () => {
  const legacy = base({
    id: 'legacy', legacy: true,
    atomos: ALCANCE_MEGACENTER.map(g => g.grupo),   // la migración le da TODOS
    estado: 'anticipo_girado',
    preliquidacion: { valor_alcance: 105_622_769, valor_contratista: 5_200_000, anticipo_pct: 60, definida_por: 'g', fecha_definicion: ts, aprobada_por: 'm', fecha_aprobacion: ts, anticipo: { fecha: ts, valor: 3_120_000, registrado_por: 'm' } },
  })
  it('recortar a Ensayos: recalcula valor_alcance, pone la señal, libera 3 átomos', () => {
    const r = patchAjustarAtomos(legacy, ['Ensayos y diagnóstico estructural'], ALCANCE_MEGACENTER, [legacy], 'átomo confirmado por Giovanny', 'u', ts)!
    expect(r.sub.atomos).toEqual(['Ensayos y diagnóstico estructural'])
    expect(r.sub.preliquidacion!.valor_alcance).toBe(6_463_735)
    expect(r.sub.alcance_desactualizado!.version).toBe(0)          // ajuste manual
    expect(r.sub.alcance_desactualizado!.atomos_afectados.length).toBe(3)
    // y la cobertura del proyecto pasa a mostrar la verdad:
    const despues = { ...legacy, ...r.sub } as AsignacionContratista
    expect(coberturaDe(ALCANCE_MEGACENTER, [despues]).valor_sin_costear).toBe(45_427_976)
  })
  it('átomo tomado por otra viva → lanza; sin cambio → null', () => {
    const otra = base({ id: 'a2', atomos: ['Protección de equipos y limpieza'] })
    expect(() => patchAjustarAtomos(legacy, ['Protección de equipos y limpieza'], ALCANCE_MEGACENTER, [legacy, otra], 'x', 'u', ts)).toThrow(/ya está asignada/)
    expect(patchAjustarAtomos(legacy, legacy.atomos, ALCANCE_MEGACENTER, [legacy], 'x', 'u', ts)).toBeNull()
  })
})

describe('síntesis legacy — los perfiles REALES del censo (lectura dual = migración)', () => {
  const pryBase = {
    asignacion: {
      contratista_id: 'c1', contratista_nombre: 'JAIRO', contratista_documento: '79274892',
      habilitacion_snapshot: { estado: 'activo', fuente: 'f', fecha_consulta: ts },
      asignado_por: 'g', fecha: ts,
    },
    snapshot: { alcance: ALCANCE_MEGACENTER, valor_venta: 35_885_214 },
    fecha_creacion: ts,
  } as unknown as Proyecto

  it('perfil (a) — preliquidacion_definida sin anticipo (7 en prod)', () => {
    const p = { ...pryBase, preliquidacion: { valor_venta: 35_885_214, valor_contratista: 2_400_000, anticipo_pct: 50, definida_por: 'g', fecha_definicion: ts } } as Proyecto
    const a = sintetizarAsignacionLegacy(p)!
    expect(a.estado).toBe('preliquidacion_definida')
    expect(a.legacy).toBe(true)
    expect(a.preliquidacion!.valor_alcance).toBe(35_885_214)   // base ANTERIOR conservada
    expect(baseMargenDe(a)).toBe('venta_total_legacy')
    expect(a.atomos.length).toBe(4)                            // TODOS los grupos
  })
  it('perfil (b) — anticipo girado en estado AVANZADO (33 en prod: por PIEZAS, no por estado)', () => {
    const p = {
      ...pryBase,
      preliquidacion: { valor_venta: 35_885_214, valor_contratista: 2_400_000, anticipo_pct: 50, definida_por: 'g', fecha_definicion: ts, aprobada_por: 'm', fecha_aprobacion: ts, anticipo: { fecha: ts, valor: 1_200_000, registrado_por: 'm' }, salvedad: 'respaldo GG' },
      compras_reembolsos: [{ concepto: 'x', valor: 100_000, registrado_por: 'u', fecha: ts }],
      estado: 'ejecutado',   // el estado del proyecto NO decide — las piezas sí
    } as unknown as Proyecto
    const a = sintetizarAsignacionLegacy(p)!
    expect(a.estado).toBe('anticipo_girado')
    expect(a.preliquidacion!.anticipo!.valor).toBe(1_200_000)
    expect(a.preliquidacion!.salvedad).toBe('respaldo GG')
    expect(a.compras_reembolsos.length).toBe(1)                // reembolsos con dueño
  })
  it('perfil (c) — asignación sin preliquidación (creado/contratista_asignado/permisos)', () => {
    const a = sintetizarAsignacionLegacy(pryBase)!
    expect(a.estado).toBe('asignada')
    expect(a.preliquidacion).toBeUndefined()
  })
  it('sin asignación singular → null; estadoAsignacionLegacyDe por piezas', () => {
    expect(sintetizarAsignacionLegacy({ snapshot: { alcance: [] } } as unknown as Proyecto)).toBeNull()
    expect(estadoAsignacionLegacyDe({ liquidacion: {} } as Proyecto)).toBe('liquidada')
  })
  it('asignacionesDe (dual): subcolección gana; vacía → síntesis; sin nada → []', () => {
    const p = pryBase
    const sub = [base()]
    expect(asignacionesDe(p, sub)).toBe(sub)
    expect(asignacionesDe(p, [])[0].id).toBe('legacy')
    expect(asignacionesDe({ snapshot: { alcance: [] } } as unknown as Proyecto, [])).toEqual([])
  })
})

describe('resumen denormalizado + detector de desincronización (condición 1)', () => {
  const asigs = [
    base({ estado: 'anticipo_girado', preliquidacion: { valor_alcance: 1, valor_contratista: 4_000_000, anticipo_pct: 50, definida_por: 'u', fecha_definicion: ts, anticipo: { fecha: ts, valor: 2_000_000, registrado_por: 'm' } } }),
    base({ id: 'a2', atomos: ['Protección de equipos y limpieza'], estado: 'preliquidacion_definida', preliquidacion: { valor_alcance: 1, valor_contratista: 1_500_000, anticipo_pct: 50, definida_por: 'u', fecha_definicion: ts } }),
  ]
  it('resumen fiel: conteos, items, cobertura, anticipos', () => {
    const r = resumenAsignacionesDe(asigs, ALCANCE_MEGACENTER)
    expect(r.total).toBe(2)
    expect(r.por_estado.anticipo_girado).toBe(1)
    expect(r.items.map(i => i.valor_contratista)).toEqual([4_000_000, 1_500_000])
    expect(r.cobertura_completa).toBe(false)
    expect(r.valor_sin_costear).toBe(13_132_251 + 30_330_605)
    expect(r.anticipos_girados).toBe(1)
  })
  it('resumen que MIENTE → discrepancias visibles (jamás preferir una fuente en silencio)', () => {
    const fiel = resumenAsignacionesDe(asigs, ALCANCE_MEGACENTER)
    expect(detectarDesincronizacion(fiel, asigs, ALCANCE_MEGACENTER)).toEqual([])
    const mentiroso = { ...fiel, anticipos_girados: 0, total: 1 }
    const d = detectarDesincronizacion(mentiroso, asigs, ALCANCE_MEGACENTER)
    expect(d.length).toBeGreaterThanOrEqual(2)
    expect(detectarDesincronizacion(undefined, asigs, ALCANCE_MEGACENTER).length).toBe(1)
  })
})

describe('sub-etapas filtrables (condición 1) — cobertura total', () => {
  const conResumen = (pe: Record<string, number>, total: number, permisos?: string) => ({
    permisos: permisos ? { estado: permisos } : undefined,
    resumen_asignaciones: { ...resumenAsignacionesDe([], []), total, por_estado: pe },
  }) as Parameters<typeof subEtapaDe>[0]

  it('cada combinación cae en exactamente una sub-etapa', () => {
    expect(subEtapaDe(conResumen({}, 0))).toBe('sin_contratista')
    expect(subEtapaDe({ } as Parameters<typeof subEtapaDe>[0])).toBe('sin_contratista')
    expect(subEtapaDe(conResumen({ asignada: 1 }, 1, 'solicitado'))).toBe('permisos_en_tramite')
    expect(subEtapaDe(conResumen({ asignada: 1 }, 1))).toBe('preliquidacion_pendiente')
    expect(subEtapaDe(conResumen({ preliquidacion_definida: 1 }, 1))).toBe('por_aprobar')
    expect(subEtapaDe(conResumen({ preliquidacion_aprobada: 1 }, 1))).toBe('por_girar_anticipo')
    expect(subEtapaDe(conResumen({ anticipo_girado: 2 }, 2))).toBe('lista_para_ejecutar')
    // mixto: lo MÁS atrasado manda (una asignada pendiente pesa más que un giro hecho)
    expect(subEtapaDe(conResumen({ asignada: 1, anticipo_girado: 1 }, 2))).toBe('preliquidacion_pendiente')
    expect(SUB_ETAPAS_PREPARACION.length).toBe(6)
  })
})

describe('máquina v2 y derivados', () => {
  it('mapearEstadoV2: económicos → en_preparacion; liquidado → puente por pago', () => {
    for (const e of ['contratista_asignado', 'permisos_en_tramite', 'preliquidacion_definida', 'preliquidacion_aprobada', 'anticipo_girado'])
      expect(mapearEstadoV2(e)).toBe('en_preparacion')
    expect(mapearEstadoV2('ejecutado')).toBe('ejecutado')
    expect(mapearEstadoV2('liquidado_contratista', { pago_cliente: {} } as Proyecto)).toBe('pagado_cliente')
    expect(mapearEstadoV2('liquidado_contratista', {} as Proyecto)).toBe('facturado')
  })
  it('asignacionesLiquidadas: todas liquidadas o canceladas-sin-saldo; vacío → false', () => {
    expect(asignacionesLiquidadas([])).toBe(false)
    expect(asignacionesLiquidadas([base({ estado: 'liquidada' })])).toBe(true)
    expect(asignacionesLiquidadas([base({ estado: 'liquidada' }), base({ id: 'a2', estado: 'cancelada', cancelacion: { fecha: ts, por: 'u', motivo: 'x', incurrido: { anticipo: 0, reembolsos: 0, total: 0 } } })])).toBe(true)
    expect(asignacionesLiquidadas([base({ estado: 'cancelada', cancelacion: { fecha: ts, por: 'u', motivo: 'x', incurrido: { anticipo: 1, reembolsos: 0, total: 1 } } })])).toBe(false)
    expect(asignacionesLiquidadas([base({ estado: 'anticipo_girado' })])).toBe(false)
  })
  it('costo presupuestado por modalidad; costo de contratistas con reembolsos; canceladas fuera', () => {
    const a1 = base({ estado: 'anticipo_girado', modalidad: 'solo_mano_obra', valor_materiales: 800_000, preliquidacion: { valor_alcance: 1, valor_contratista: 4_000_000, anticipo_pct: 50, definida_por: 'u', fecha_definicion: ts }, compras_reembolsos: [{ concepto: 'x', valor: 100_000, registrado_por: 'u', fecha: ts }] })
    const a2 = base({ id: 'a2', estado: 'preliquidacion_definida', preliquidacion: { valor_alcance: 1, valor_contratista: 1_500_000, anticipo_pct: 50, definida_por: 'u', fecha_definicion: ts } })
    const cancelada = base({ id: 'a3', estado: 'cancelada', preliquidacion: { valor_alcance: 1, valor_contratista: 9_999_999, anticipo_pct: 50, definida_por: 'u', fecha_definicion: ts } })
    expect(costoPresupuestadoAsignaciones([a1, a2, cancelada])).toBe(4_800_000 + 1_500_000)
    expect(costoContratistasDe([a1, a2, cancelada])).toBe(4_100_000 + 1_500_000)
  })
  it('transiciones: terminales duros y cancelada→liquidada como única reentrada', () => {
    expect(TRANSICIONES_ASIGNACION.liquidada).toEqual([])
    expect(TRANSICIONES_ASIGNACION.cancelada).toEqual(['liquidada'])
    for (const e of ESTADOS_ASIGNACION) expect(TRANSICIONES_ASIGNACION[e]).toBeDefined()
  })
  it('patchResolverSenal exige señal y motivo', () => {
    expect(patchResolverSenal(base(), 'x', 'u', ts)).toBeNull()
    const con = base({ alcance_desactualizado: { version: 5, fecha: ts, atomos_afectados: [] } })
    expect(patchResolverSenal(con, 'no toca este alcance', 'u', ts)!.entradaHistorial.motivo).toMatch(/CONFIRMADA/)
  })
  it('atomosTomados excluye canceladas', () => {
    expect(atomosTomados([base({ estado: 'cancelada' })]).size).toBe(0)
    expect(atomosTomados([base()]).size).toBe(1)
  })
})
