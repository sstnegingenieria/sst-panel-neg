// src/types/sigp/asignacion.ts
//
// P2-2 — ASIGNACIONES MÚLTIPLES (SB1: motor). Un proyecto se ejecuta con
// VARIOS contratistas: cada asignación vive en la subcolección
// `proyectos/{pid}/asignaciones/{aid}` con su contratista (habilitación
// congelada), sus ÁTOMOS (grupos del alcance de la versión aprobada — cada
// uno en UNA sola asignación viva, invariante duro), su modalidad, su
// preliquidación y su liquidación. El ciclo económico baja del proyecto a la
// asignación; el proyecto describe la obra y el cliente.
//
// Principios fijados (decisiones de Giovanny, 03-sep):
//  - Átomo tomado → el builder LANZA, no advierte.
//  - Cobertura incompleta VISIBLE y excluida del indicador (el 95% de
//    Megacenter debe volverse "$45.427.976 sin costear").
//  - Reembolsos con dueño: viven en la asignación (se pagan en SU liquidación).
//  - Cancelación = caso general con valores en cero (incurrido registrado;
//    con plata afuera queda esperando su liquidación).
//  - Bandejas por RESUMEN denormalizado en el padre (patrón `activa` de
//    Tareas); la ficha lee la subcolección y DETECTA desincronización — un
//    resumen que miente sin avisar es peor que no tenerlo.
//  - `valor_alcance` es el CD de los átomos (base del margen) — BASE DISTINTA
//    del `valor_venta` viejo (AIU+IVA): el margen se ROTULA contra su base y
//    las legacy jamás muestran margen como si fuera la base nueva.
//
// Convención: campos Firestore en snake_case español; builders PUROS que
// devuelven el patch exacto (o null / lanzan) — la UI no improvisa writes.

import type { Timestamp } from 'firebase/firestore'
import type {
  AlcanceGrupo, CompraReembolso, RetencionLiquidacion, ModalidadContratista,
  Proyecto, EstadoProyecto, AnticipoGirado, ResumenAsignaciones,
} from './proyecto'
import { modalidadDe, totalComprasReembolsos, anticipoValorDe } from './proyecto'

// ── Máquina de la asignación ─────────────────────────────────────────────────

export const ESTADOS_ASIGNACION = [
  'asignada',
  'preliquidacion_definida',
  'preliquidacion_aprobada',
  'anticipo_girado',
  // P2-4: SOLO alcanzable por tipo 'administracion_directa' — costo propio
  // estimado y cargado (habilita la ejecución; entra al presupuesto).
  'estimada',
  'liquidada',
  'cancelada',
] as const
export type EstadoAsignacion = (typeof ESTADOS_ASIGNACION)[number]

export const ESTADO_ASIG_LABEL: Record<EstadoAsignacion, string> = {
  asignada: 'Asignada',
  preliquidacion_definida: 'Preliquidación definida',
  preliquidacion_aprobada: 'Preliquidación aprobada',
  anticipo_girado: 'Anticipo girado',
  estimada: 'Costo propio estimado',
  liquidada: 'Liquidada',
  cancelada: 'Cancelada',
}

// ── P2-4: ADMINISTRACIÓN DIRECTA (ejecución con personal propio) ─────────────
//
// El tipo marca la AUSENCIA DEL CICLO DE PAGO — sin aprobación de giro, sin
// anticipo, sin liquidación conciliada (no hay contraparte a quien pagarle).
// NO dice quién ejecuta: la identidad la lleva el CONTRATISTA REAL de la
// asignación — para el personal propio es el registro vivo de NEG
// (contratista_neg_001), la misma identidad con la que los colaboradores se
// habilitan en la app SST. El gate de habilitación APLICA sin excepción
// (decisión Giovanny 04-sep): si la documentación SST propia de NEG cae, que
// la asignación se bloquee es exactamente la señal que ISO 45001 quiere.
// El equivalente de pactado vs. liquidado es ESTIMADO vs. REAL — y ambos se
// conservan (la línea base no se mueve, filosofía Hotfix B).
export const TIPOS_ASIGNACION = ['contratista', 'administracion_directa'] as const
export type TipoAsignacion = (typeof TIPOS_ASIGNACION)[number]

/** Fuente de verdad del tipo — AUSENTE = contratista (42 migradas y las
 *  nuevas: cero backfill). Jamás decidir por el nombre del contratista. */
export const tipoDe = (a: Pick<AsignacionContratista, 'tipo'>): TipoAsignacion =>
  a.tipo ?? 'contratista'

export const ESTADO_ASIG_COLOR: Record<EstadoAsignacion, string> = {
  asignada: 'bg-gray-100 text-gray-600',
  preliquidacion_definida: 'bg-amber-100 text-amber-800',
  preliquidacion_aprobada: 'bg-emerald-100 text-emerald-800',
  anticipo_girado: 'bg-brand-100 text-brand-800',
  estimada: 'bg-brand-100 text-brand-800',
  liquidada: 'bg-gray-200 text-gray-700',
  cancelada: 'bg-rose-100 text-rose-800',
}

/** `cancelada → liquidada` SOLO con plata afuera (incurrido > 0): el cierre
 *  anticipado es el caso general con ceros — al cancelar se registra lo
 *  incurrido y, si hay saldo, se le cuelga el paso de liquidación después. */
export const TRANSICIONES_ASIGNACION: Record<EstadoAsignacion, EstadoAsignacion[]> = {
  // 'estimada' desde asignada: SOLO tipo administracion_directa (builder);
  // los builders de contratista jamás la producen y los de directa jamás
  // producen definida/aprobada/anticipo_girado — fijado por test.
  asignada: ['preliquidacion_definida', 'estimada', 'cancelada'],
  preliquidacion_definida: ['preliquidacion_aprobada', 'cancelada'],
  preliquidacion_aprobada: ['anticipo_girado', 'preliquidacion_definida', 'cancelada'],
  anticipo_girado: ['liquidada', 'preliquidacion_definida', 'cancelada'],
  estimada: ['liquidada', 'cancelada'],   // re-estimar no cambia de estado
  liquidada: [],
  cancelada: ['liquidada'],   // solo con incurrido > 0 (lo valida el builder)
}

// ── Sub-tipos ────────────────────────────────────────────────────────────────

/** Base contra la que se calcula el margen de la asignación — CONDICIÓN A de
 *  Giovanny: el `valor_alcance` (CD de los átomos) es una base DISTINTA del
 *  `valor_venta` viejo (AIU+IVA); el número de margen sobre una y otra no es
 *  comparable, así que se ROTULA siempre y las legacy no se disfrazan. */
export type BaseMargenAsignacion = 'cd_atomos' | 'venta_total_legacy'

export const ETIQUETA_BASE_MARGEN: Record<BaseMargenAsignacion, string> = {
  cd_atomos: 'sobre el CD de sus actividades (antes de impuestos)',
  venta_total_legacy: 'sobre la venta total del proyecto (base anterior, con impuestos)',
}

export interface PreliquidacionAsignacion {
  /** Base del margen. En asignaciones NUEVAS: Σ subtotales (CD) de los átomos,
   *  congelado al definir. En LEGACY migradas: el `valor_venta` viejo del
   *  proyecto (base anterior) — ver `baseMargenDe`. */
  valor_alcance: number
  /** Base EXPLÍCITA del margen cuando difiere de la que implica `legacy` —
   *  la fija `patchAjustarAtomos` al recalcular `valor_alcance` a CD de los
   *  átomos sobre una migrada (condición A: si la base cambió, el rótulo
   *  cambia con ella; `legacy` queda solo como PROCEDENCIA del badge). */
  base_margen?: BaseMargenAsignacion
  valor_contratista: number
  anticipo_pct: number
  observaciones?: Record<string, string>
  definida_por: string
  fecha_definicion: Timestamp
  aprobada_por?: string
  fecha_aprobacion?: Timestamp
  salvedad?: string
  anticipo?: AnticipoGirado
  costo_ejecutado?: number
  ajuste_pendiente_liquidacion?: boolean
}

export interface LiquidacionAsignacion {
  liquidacion_anticipada?: boolean
  justificacion_anticipada?: string
  acuerdo_con?: string
  acuerdo_fecha?: Timestamp
  /** Liquidación de una asignación CANCELADA: concilia lo INCURRIDO, no el
   *  valor pactado completo (cierre anticipado). */
  es_cancelacion?: boolean
  mano_obra: number
  compras_reembolsos: CompraReembolso[]
  ajustes_reconocidos: string[]
  retenciones: RetencionLiquidacion[]
  total_final: number
  diferencia: number
  es_igual: boolean
  anticipo_girado: number
  saldo_final: number
  liquidada_por: string
  fecha: Timestamp
  observaciones?: string
}

export interface CancelacionAsignacion {
  fecha: Timestamp
  por: string
  motivo: string
  /** Lo ya incurrido al cancelar — el caso general con valores en cero. */
  incurrido: { anticipo: number; reembolsos: number; total: number }
}

export interface SenalAlcanceAsignacion {
  /** Versión de cotización que produjo el cambio; 0 = ajuste MANUAL de átomos. */
  version: number
  fecha: Timestamp
  atomos_afectados: string[]
}

export interface EntradaHistorialAsignacion {
  de: EstadoAsignacion | null
  a: EstadoAsignacion
  por: string
  fecha: Timestamp
  motivo?: string
}

/** Doc de `proyectos/{pid}/asignaciones/{aid}`. */
export interface AsignacionContratista {
  id: string
  /** P2-4: 'administracion_directa' = SIN ciclo de pago (ni aprobación, ni
   *  anticipo, ni liquidación conciliada). Ausente = 'contratista'. Leer
   *  SIEMPRE con tipoDe(). Se FIJA al nacer o con patchMarcarAdministracion-
   *  Directa (solo sin economía cargada); después es INMUTABLE (reglas). */
  tipo?: TipoAsignacion
  contratista_id: string
  contratista_nombre: string
  contratista_documento?: string
  habilitacion_snapshot: { estado: string; fuente: string; fecha_consulta: Timestamp }
  /** P2-4 · REGLA DURA DE DATOS (Giovanny, 04-sep): DÍAS TOTALES DEL EQUIPO,
   *  SIN NOMBRES NI DESGLOSE POR PERSONA — un colaborador del panel no tiene
   *  por qué poder deducir el salario de otro (dato personal protegido,
   *  Ley 1581/2012). El panel JAMÁS almacena tarifas: el costo se carga como
   *  TOTAL y quien estima hace la cuenta afuera. La composición del equipo,
   *  si hace falta, va en la NOTA LIBRE (acto deliberado, no campo
   *  estructurado que invite a hacerlo). ⚠ AVISO: nombrar a UNA sola persona
   *  junto a los días y el costo revela su tarifa por división. */
  dias_equipo?: number
  /** P2-4: cierre de la administración directa — los días que REALMENTE se
   *  ocuparon y su costo real. El estimado (preliquidacion.valor_contratista)
   *  queda intacto: presupuestado = estimado, ejecutado = real. El cierre NO
   *  consulta verificaciones_sst (no hay pago que bloquear) — y por decisión
   *  de Giovanny (04-sep) la proyección SST NO SE CREA para administración
   *  directa: el cambio en verificacionesSst.js es superficie de la sesión
   *  SST (avisada, decisión tomada). */
  cierre_directa?: {
    costo_real: number
    dias_reales?: number
    nota?: string
    cerrada_por: string
    fecha: Timestamp
  }
  evaluacion_snapshot?: { puntaje?: number; fecha?: Timestamp; detalle?: string }
  nota_criterio?: string
  /** Átomos = NOMBRES de grupo del alcance de la versión aprobada. Cada átomo
   *  vive en ≤1 asignación VIVA (invariante duro del builder). Un rename de
   *  actividad en una versión de cambio se lee como cancelación+adicional —
   *  consecuencia conocida. */
  atomos: string[]
  modalidad: ModalidadContratista
  valor_materiales?: number
  estado: EstadoAsignacion
  preliquidacion?: PreliquidacionAsignacion
  liquidacion?: LiquidacionAsignacion
  compras_reembolsos: CompraReembolso[]
  alcance_desactualizado?: SenalAlcanceAsignacion
  cancelacion?: CancelacionAsignacion
  /** REGISTRO HISTÓRICO retroactivo (decisión de Giovanny, 03-sep): el pago
   *  ocurrió POR FUERA del panel (la contabilidad lo tiene, el panel no —
   *  caso PRY-2026-024). Se registra con valores cargados y motivo
   *  OBLIGATORIO, en estado `liquidada` (económicamente cerrada), y JAMÁS
   *  simula el flujo de control: sin aprobada_por, sin anticipo, sin objeto
   *  liquidacion — esta marca dice cómo llegó el dato. El costo entra al
   *  indicador y al presupuesto (el objetivo), la honestidad queda escrita.
   *  Mismo principio que `costo_ejecutado` manual, un nivel arriba. */
  registro_historico?: { motivo: string; registrado_por: string; fecha: Timestamp }
  /** Migrada del modelo singular (su preliquidación trae la base ANTERIOR). */
  legacy?: boolean
  asignado_por: string
  fecha: Timestamp
  historial: EntradaHistorialAsignacion[]
  fecha_creacion: Timestamp
  fecha_actualizacion?: Timestamp
}

// El tipo ResumenAsignaciones vive en proyecto.ts (es un campo del proyecto);
// acá se CALCULA (resumenAsignacionesDe) y se AUDITA (detectarDesincronizacion).
export type { ResumenAsignaciones }

// ── Helpers puros ────────────────────────────────────────────────────────────

/** Vivas = no canceladas (las liquidadas SIGUEN cubriendo sus átomos: los
 *  ejecutaron). La cancelación libera los átomos. */
export const asignacionesVivas = (asigs: AsignacionContratista[]): AsignacionContratista[] =>
  asigs.filter(a => a.estado !== 'cancelada')

export const atomosTomados = (asigs: AsignacionContratista[]): Set<string> => {
  const s = new Set<string>()
  for (const a of asignacionesVivas(asigs)) for (const at of a.atomos) s.add(at)
  return s
}

/** CD de los átomos (Σ subtotales del alcance) — la base del margen nuevo. */
export const valorAlcanceDe = (atomos: string[], alcance: AlcanceGrupo[]): number => {
  const porGrupo = new Map(alcance.map(g => [g.grupo, g.subtotal || 0]))
  return atomos.reduce((s, at) => s + (porGrupo.get(at) ?? 0), 0)
}

/** CONDICIÓN A: contra qué base está calculado el margen de esta asignación.
 *  La preliquidación puede declarar la suya (`base_margen` — un ajuste de
 *  átomos sobre una migrada recalcula `valor_alcance` a CD y la fija);
 *  sin declaración, `legacy` implica la base anterior. */
export const baseMargenDe = (
  a: Pick<AsignacionContratista, 'legacy' | 'preliquidacion'>,
): BaseMargenAsignacion =>
  a.preliquidacion?.base_margen ?? (a.legacy ? 'venta_total_legacy' : 'cd_atomos')

export interface CoberturaProyecto {
  sin_asignar: { grupo: string; subtotal: number }[]
  valor_sin_costear: number
  completa: boolean
}

/** Decisión 3: la cobertura incompleta SE VE — cuántas actividades y cuánto
 *  valor están sin costear. */
export function coberturaDe(alcance: AlcanceGrupo[], asigs: AsignacionContratista[]): CoberturaProyecto {
  const tomados = atomosTomados(asigs)
  const sin = alcance.filter(g => !tomados.has(g.grupo))
    .map(g => ({ grupo: g.grupo, subtotal: g.subtotal || 0 }))
  return {
    sin_asignar: sin,
    valor_sin_costear: sin.reduce((s, g) => s + g.subtotal, 0),
    completa: sin.length === 0,
  }
}

/** Presupuesto del proyecto = Σ asignaciones vivas (contratista + materiales
 *  NEG en solo_mano_obra) — decisión 4: modalidad por asignación como dato de
 *  entrada, indicador único de salida. */
export const costoPresupuestadoAsignaciones = (asigs: AsignacionContratista[]): number =>
  asignacionesVivas(asigs).reduce((s, a) => {
    const pre = a.preliquidacion
    if (!pre) return s
    return s + pre.valor_contratista + (a.modalidad === 'solo_mano_obra' ? (a.valor_materiales ?? 0) : 0)
  }, 0)

/** Mano de obra + reembolsos de las asignaciones (el componente de contratistas
 *  del costo ejecutado; OCs/menores siguen llegando por compras_proyecto).
 *  P2-4: en una administración directa CERRADA, el costo REAL reemplaza al
 *  estimado en el EJECUTADO (mientras corre, cuenta el estimado — misma
 *  convención del contratista, donde cuenta el pactado). El PRESUPUESTADO
 *  sigue siendo el estimado siempre (costoPresupuestadoAsignaciones). */
export const costoContratistasDe = (asigs: AsignacionContratista[]): number =>
  asignacionesVivas(asigs).reduce((s, a) =>
    s + (a.cierre_directa ? a.cierre_directa.costo_real : (a.preliquidacion?.valor_contratista ?? 0))
      + totalComprasReembolsos(a.compras_reembolsos), 0)

// ── Señal de IMPLAUSIBILIDAD (agregado de Giovanny al SB2) ───────────────────
//
// Post-migración las legacy llevan TODOS los átomos → cobertura "completa" y
// márgenes inflados invisibles. Esta señal DERIVADA los aflora: si el margen
// implícito de una asignación sobre el CD de sus átomos supera el umbral, el
// contratista probablemente NO cubre todo lo que se le atribuyó — el sistema
// dice CUÁLES mirar en vez de depender de que alguien se acuerde. NO excluye
// del indicador (un margen alto puede ser legítimo; decide un humano).
//
// UMBRAL calibrado CON EL DATO (03-sep, 40 preliquidaciones reales; corte
// natural de la distribución entre ~70% y ~64%): con 70 caen CINCO —
// Megacenter 94,1% · Triara 92,0% · PRY-001 86,5% · PRY-040 79,5% ·
// PRY-026 70,1% — y el bloque legítimo de 40–64% (preventivos IHS
// incluidos) queda fuera. Ajustable.
//
// ⚠ POR QUÉ 5 Y NO 7 (corrección 04-sep, dictada por Giovanny): la primera
// calibración listó 7 porque el script crudo de análisis NO restaba los
// materiales NEG en solo_mano_obra; este motor SÍ los resta (un margen alto
// ahí sería falso). Esa diferencia convierte dos falsos positivos en cero:
// PRY-024 (materiales $380M sobre CD $572M → margen real 12,6%) y
// PRY-015 (materiales $22M sobre CD $21,5M → margen real −10,9%).
//
// ⚠ PUNTO CIEGO CONOCIDO (lo más importante del hallazgo — no
// redescubrirlo): PRY-2026-024 salió de la lista con 12,6% y AUN ASÍ tiene
// un problema real — Giovanny confirmó que ahí hay varios contratistas cuya
// mano de obra no está registrada en ninguna parte (se registran como
// asignaciones de REGISTRO HISTÓRICO). Con materiales de $380M el
// presupuesto SE VE razonable aunque falte la mano de obra de dos o tres
// contratistas. Esta señal detecta contratistas que NO CUBREN su alcance;
// NO detecta contratistas que NO EXISTEN en el sistema. Herramienta útil
// con un límite conocido.

export const UMBRAL_MARGEN_IMPLICITO_REVISAR_PCT = 70

/** Margen implícito de la asignación sobre el CD de SUS átomos (recalculado
 *  del alcance VIVO — no de valor_alcance, que en legacy trae la base vieja):
 *  (CD − costo presupuestado de la asignación) / CD × 100. En solo_mano_obra
 *  el costo incluye los materiales NEG (un margen alto ahí sería falso).
 *  null sin preliquidación o sin CD. */
export function margenImplicitoDe(
  a: Pick<AsignacionContratista, 'atomos' | 'modalidad' | 'valor_materiales' | 'preliquidacion'>,
  alcance: AlcanceGrupo[],
): number | null {
  const pre = a.preliquidacion
  if (!pre) return null
  const cd = valorAlcanceDe(a.atomos, alcance)
  if (cd <= 0) return null
  const costo = pre.valor_contratista + (a.modalidad === 'solo_mano_obra' ? (a.valor_materiales ?? 0) : 0)
  return ((cd - costo) / cd) * 100
}

/** ¿Entra a la lista "revisar cobertura"? (viva, con margen implícito sobre
 *  el umbral). */
export function requiereRevisionCobertura(
  a: AsignacionContratista, alcance: AlcanceGrupo[],
): boolean {
  if (a.estado === 'cancelada') return false
  const m = margenImplicitoDe(a, alcance)
  return m != null && m >= UMBRAL_MARGEN_IMPLICITO_REVISAR_PCT
}

export function resumenAsignacionesDe(
  asigs: AsignacionContratista[], alcance: AlcanceGrupo[],
): ResumenAsignaciones {
  const cob = coberturaDe(alcance, asigs)
  const por_estado: Partial<Record<EstadoAsignacion, number>> = {}
  for (const a of asigs) por_estado[a.estado] = (por_estado[a.estado] ?? 0) + 1
  return {
    total: asigs.length,
    por_estado,
    items: asigs.map(a => ({
      aid: a.id, contratista_nombre: a.contratista_nombre, estado: a.estado,
      valor_contratista: a.preliquidacion?.valor_contratista ?? 0,
    })),
    cobertura_completa: cob.completa,
    atomos_sin_asignar: cob.sin_asignar.length,
    valor_sin_costear: cob.valor_sin_costear,
    alcance_desactualizado: asigs.filter(a => !!a.alcance_desactualizado && a.estado !== 'cancelada').length,
    anticipos_girados: asigs.filter(a => !!a.preliquidacion?.anticipo && a.estado !== 'cancelada').length,
    costo_presupuestado: costoPresupuestadoAsignaciones(asigs),
    costo_contratistas: costoContratistasDe(asigs),
    costo_ejecutado_manual: asignacionesVivas(asigs)
      .reduce((s, a) => s + (a.preliquidacion?.costo_ejecutado ?? 0), 0),
    revisar_cobertura: asigs.filter(a => requiereRevisionCobertura(a, alcance)).length,
    // P2-4: directas vivas SIN estimar (para la sub-etapa "costo propio por
    // estimar" — por_estado no distingue tipos)
    directas_por_estimar: asignacionesVivas(asigs)
      .filter(a => tipoDe(a) === 'administracion_directa' && a.estado === 'asignada').length,
  }
}

/** CONDICIÓN 1 del resumen (Giovanny): la ficha lee la subcolección — el
 *  detector natural. Si el resumen del padre discrepa, SE VE (banner), no se
 *  prefiere una fuente en silencio. Devuelve las discrepancias legibles. */
export function detectarDesincronizacion(
  resumen: ResumenAsignaciones | undefined, asigs: AsignacionContratista[], alcance: AlcanceGrupo[],
): string[] {
  if (!resumen) return asigs.length > 0 ? ['el padre no tiene resumen y la subcolección tiene asignaciones'] : []
  const real = resumenAsignacionesDe(asigs, alcance)
  const d: string[] = []
  if (resumen.total !== real.total) d.push(`total: resumen ${resumen.total} vs subcolección ${real.total}`)
  if (resumen.valor_sin_costear !== real.valor_sin_costear)
    d.push(`valor sin costear: resumen ${resumen.valor_sin_costear} vs real ${real.valor_sin_costear}`)
  if (resumen.anticipos_girados !== real.anticipos_girados)
    d.push(`anticipos: resumen ${resumen.anticipos_girados} vs real ${real.anticipos_girados}`)
  if (resumen.costo_presupuestado !== real.costo_presupuestado)
    d.push(`costo presupuestado: resumen ${resumen.costo_presupuestado} vs real ${real.costo_presupuestado}`)
  if (resumen.costo_contratistas !== real.costo_contratistas)
    d.push(`costo contratistas: resumen ${resumen.costo_contratistas} vs real ${real.costo_contratistas}`)
  for (const e of ESTADOS_ASIGNACION) {
    if ((resumen.por_estado[e] ?? 0) !== (real.por_estado[e] ?? 0))
      d.push(`${e}: resumen ${resumen.por_estado[e] ?? 0} vs real ${real.por_estado[e] ?? 0}`)
  }
  return d
}

// ── Sub-etapas de en_preparacion (CONDICIÓN 1: filtrables, no decorativas) ───
//
// "¿Por qué este proyecto no arranca?" se responde FILTRANDO, como hoy.
// Derivación PURA sobre el doc padre solo (resumen + permisos) — la bandeja
// no consulta subcolecciones.

export const SUB_ETAPAS_PREPARACION = [
  'sin_contratista',
  'permisos_en_tramite',
  'preliquidacion_pendiente',
  'costo_propio_por_estimar',
  'por_aprobar',
  'por_girar_anticipo',
  'lista_para_ejecutar',
] as const
export type SubEtapaPreparacion = (typeof SUB_ETAPAS_PREPARACION)[number]

export const SUB_ETAPA_LABEL: Record<SubEtapaPreparacion, string> = {
  sin_contratista: 'Sin contratista',
  permisos_en_tramite: 'Permisos en trámite',
  preliquidacion_pendiente: 'Preliquidación pendiente',
  costo_propio_por_estimar: 'Costo propio por estimar',
  por_aprobar: 'Preliquidación por aprobar',
  por_girar_anticipo: 'Por girar anticipo',
  lista_para_ejecutar: 'Lista para ejecutar',
}

/** Sub-etapa operativa de un proyecto en preparación. Cobertura TOTAL por
 *  construcción (cadena de ifs excluyentes — fijada por test).
 *  P2-4: si TODO lo pendiente-de-economía son directas sin estimar, el chip
 *  dice la verdad ("Costo propio por estimar"); mixto → manda el contratista
 *  (lo más atrasado con acción de terceros). */
export function subEtapaDe(
  p: Pick<Proyecto, 'permisos'> & { resumen_asignaciones?: ResumenAsignaciones },
): SubEtapaPreparacion {
  const r = p.resumen_asignaciones
  if (!r || r.total === 0) return 'sin_contratista'
  if (p.permisos?.estado === 'solicitado') return 'permisos_en_tramite'
  const pe = r.por_estado
  if ((pe.asignada ?? 0) > 0) {
    return (r.directas_por_estimar ?? 0) >= (pe.asignada ?? 0)
      ? 'costo_propio_por_estimar'
      : 'preliquidacion_pendiente'
  }
  if ((pe.preliquidacion_definida ?? 0) > 0) return 'por_aprobar'
  if ((pe.preliquidacion_aprobada ?? 0) > 0) return 'por_girar_anticipo'
  return 'lista_para_ejecutar'
}

/** P2-4 — gate a EJECUCIÓN del proyecto (decisión 3 ampliada): ≥1 anticipo
 *  girado O ≥1 administración directa ESTIMADA. Sin la segunda vía, un
 *  proyecto 100% personal propio (caso Microlink) jamás podría arrancar. */
export const habilitaEjecucionDe = (r?: ResumenAsignaciones): boolean =>
  (r?.anticipos_girados ?? 0) >= 1 || ((r?.por_estado?.estimada ?? 0) >= 1)

/** Estados del PROYECTO que pertenecen a la etapa de preparación (v2 los
 *  colapsa en `en_preparacion`). */
export const ESTADOS_PREPARACION_PROYECTO = new Set([
  'creado', 'contratista_asignado', 'permisos_en_tramite',
  'preliquidacion_definida', 'preliquidacion_aprobada', 'anticipo_girado',
])

/** Sub-etapa de un proyecto EN PREPARACIÓN, unificada para ambos mundos —
 *  con resumen (migrado/multi) deriva de las asignaciones (subEtapaDe);
 *  legacy deriva del estado del padre. Un solo filtro responde "¿por qué no
 *  arranca?" sin importar si el proyecto migró. null fuera de preparación. */
export function subEtapaProyectoDe(
  p: Pick<Proyecto, 'permisos' | 'estado'> & { resumen_asignaciones?: ResumenAsignaciones },
): SubEtapaPreparacion | null {
  if (!ESTADOS_PREPARACION_PROYECTO.has(p.estado)) return null
  if (p.resumen_asignaciones) return subEtapaDe(p)
  switch (p.estado) {
    case 'creado': return 'sin_contratista'
    case 'contratista_asignado': return 'preliquidacion_pendiente'
    case 'permisos_en_tramite': return 'permisos_en_tramite'
    case 'preliquidacion_definida': return 'por_aprobar'
    case 'preliquidacion_aprobada': return 'por_girar_anticipo'
    default: return 'lista_para_ejecutar'   // anticipo_girado
  }
}

// ── Builders (todos puros: validan y devuelven el patch exacto, o lanzan/null) ─

const entrada = (
  de: EstadoAsignacion | null, a: EstadoAsignacion, por: string, fecha: Timestamp, motivo?: string,
): EntradaHistorialAsignacion => ({ de, a, por, fecha, ...(motivo ? { motivo } : {}) })

/**
 * Construye una asignación nueva. LANZA (no advierte) si:
 *  - el contratista no está habilitado (gate no-solo-UI, igual que siempre)
 *  - los átomos están vacíos, no existen en el alcance, o alguno YA está
 *    tomado por una asignación viva (invariante duro — decisión 2)
 *  - modalidad solo_mano_obra sin presupuesto de materiales.
 */
export function construirAsignacionMulti(
  contratista: { id: string; nombre: string; nit?: string; cedula?: string; estado: string },
  atomos: string[],
  modalidad: ModalidadContratista,
  valorMateriales: number | undefined,
  alcance: AlcanceGrupo[],
  existentes: AsignacionContratista[],
  uid: string,
  fecha: Timestamp,
  notaCriterio?: string,
  // P2-4: 'administracion_directa' = sin ciclo de pago. La identidad la
  // lleva el contratista REAL igual (para personal propio: el registro de
  // NEG) y el gate de habilitación aplica SIN excepción.
  tipo?: TipoAsignacion,
): Omit<AsignacionContratista, 'id'> {
  if (contratista.estado !== 'activo')
    throw new Error('Solo se pueden asignar contratistas habilitados (estado activo)')
  if (atomos.length === 0)
    throw new Error('La asignación necesita al menos una actividad del alcance')
  const enAlcance = new Set(alcance.map(g => g.grupo))
  for (const at of atomos) {
    if (!enAlcance.has(at)) throw new Error(`La actividad «${at}» no existe en el alcance vigente`)
  }
  const tomados = atomosTomados(existentes)
  for (const at of atomos) {
    if (tomados.has(at)) throw new Error(`La actividad «${at}» ya está asignada a otro contratista`)
  }
  if (modalidad === 'solo_mano_obra' && !(valorMateriales !== undefined && valorMateriales >= 0))
    throw new Error('La modalidad solo mano de obra exige el presupuesto de materiales de NEG')
  const documento = contratista.nit || contratista.cedula
  return {
    ...(tipo ? { tipo } : {}),
    contratista_id: contratista.id,
    contratista_nombre: contratista.nombre,
    ...(documento ? { contratista_documento: documento } : {}),
    habilitacion_snapshot: {
      estado: contratista.estado,
      fuente: 'contratistas.estado — habilitación administrada por Gestión Administrativa',
      fecha_consulta: fecha,
    },
    atomos: [...atomos],
    modalidad,
    ...(modalidad === 'solo_mano_obra' ? { valor_materiales: valorMateriales } : {}),
    estado: 'asignada',
    compras_reembolsos: [],
    asignado_por: uid,
    fecha,
    historial: [entrada(null, 'asignada', uid, fecha,
      (tipo === 'administracion_directa' ? 'ADMINISTRACIÓN DIRECTA (personal propio, sin ciclo de pago) — ' : '') +
      `Asignación de ${contratista.nombre} — ${atomos.length} actividad(es): ${atomos.join(' · ')}` +
      (notaCriterio?.trim() ? ` · Criterio: ${notaCriterio.trim()}` : ''))],
    ...(notaCriterio?.trim() ? { nota_criterio: notaCriterio.trim() } : {}),
    fecha_creacion: fecha,
  }
}

/**
 * REGISTRO HISTÓRICO retroactivo — contratista al que YA se le pagó por fuera
 * del panel (caso PRY-2026-024: el pago ocurrió, la contabilidad lo tiene, el
 * panel no). Hacerlo pasar por definir → aprobar → girar → liquidar sería
 * FINGIR que un control ocurrió cuando no ocurrió; este builder registra el
 * hecho sin simular el flujo:
 *  - nace `liquidada` (económicamente cerrada — cubre sus átomos, entra a
 *    costo presupuestado/contratistas, cero pendientes en bandeja)
 *  - SIN aprobada_por, SIN anticipo, SIN objeto liquidacion — la marca
 *    `registro_historico` (con motivo OBLIGATORIO) dice cómo llegó el dato
 *  - solo para lo YA pagado y cerrado; un contratista aún activo/con saldo
 *    entra por el flujo normal de aquí en adelante
 *  - NO exige contratista habilitado: el gate controla decisiones futuras,
 *    no hechos pasados — el snapshot registra el estado ACTUAL, honesto
 *  - en solo_mano_obra los materiales NEG son opcionales (si no se conocen,
 *    0 y el motivo lo explica — jamás un número inventado)
 * Invariantes de átomos idénticos al builder normal (≤1 asignación viva).
 * Mismo principio que `costo_ejecutado` manual, un nivel arriba.
 */
export function construirAsignacionHistorica(
  contratista: { id: string; nombre: string; nit?: string; cedula?: string; estado: string },
  atomos: string[],
  modalidad: ModalidadContratista,
  valorMateriales: number | undefined,
  valorPagado: number,
  motivo: string,
  alcance: AlcanceGrupo[],
  existentes: AsignacionContratista[],
  uid: string,
  fecha: Timestamp,
): Omit<AsignacionContratista, 'id'> {
  if (!motivo.trim())
    throw new Error('El registro histórico exige un motivo (por qué el pago ocurrió por fuera del panel)')
  if (!(valorPagado > 0))
    throw new Error('El registro histórico exige el valor realmente pagado (> 0)')
  if (atomos.length === 0)
    throw new Error('La asignación necesita al menos una actividad del alcance')
  const enAlcance = new Set(alcance.map(g => g.grupo))
  for (const at of atomos) {
    if (!enAlcance.has(at)) throw new Error(`La actividad «${at}» no existe en el alcance vigente`)
  }
  const tomados = atomosTomados(existentes)
  for (const at of atomos) {
    if (tomados.has(at)) throw new Error(`La actividad «${at}» ya está asignada a otro contratista`)
  }
  const documento = contratista.nit || contratista.cedula
  return {
    contratista_id: contratista.id,
    contratista_nombre: contratista.nombre,
    ...(documento ? { contratista_documento: documento } : {}),
    habilitacion_snapshot: {
      estado: contratista.estado,
      fuente: 'contratistas.estado — estado ACTUAL al registrar (histórico: no aplica gate)',
      fecha_consulta: fecha,
    },
    atomos: [...atomos],
    modalidad,
    ...(modalidad === 'solo_mano_obra' ? { valor_materiales: valorMateriales ?? 0 } : {}),
    estado: 'liquidada',
    preliquidacion: {
      valor_alcance: valorAlcanceDe(atomos, alcance),
      base_margen: 'cd_atomos',
      valor_contratista: valorPagado,
      anticipo_pct: 0,
      definida_por: uid,
      fecha_definicion: fecha,
      // SIN aprobada_por / SIN anticipo — esos controles NO ocurrieron.
    },
    compras_reembolsos: [],
    registro_historico: { motivo: motivo.trim(), registrado_por: uid, fecha },
    asignado_por: uid,
    fecha,
    historial: [entrada(null, 'liquidada', uid, fecha,
      `REGISTRO HISTÓRICO retroactivo — pagado por fuera del panel (${atomos.join(' · ')}, ` +
      `valor pagado cargado a mano). Motivo: ${motivo.trim()}. ` +
      'No siguió el flujo definir → aprobar → girar → liquidar.')],
    fecha_creacion: fecha,
  }
}

// ── P2-4: builders de la ADMINISTRACIÓN DIRECTA ──────────────────────────────
//
// ⚠ SIN APROBACIÓN DE GERENCIA — POR DISEÑO, NO POR DESCUIDO (decisión de
// Giovanny, 04-sep): no hay giro a terceros ni orden de pago que derive de la
// estimación; pedir aprobación agregaría fricción a algo que no mueve plata
// (y ya sabemos qué le pasa a lo que tiene fricción de más — lección de
// Compras). EL CONTROL EN AUSENCIA DE APROBACIÓN ES: (1) la señal de
// implausibilidad, que actúa justo en la dirección peligrosa — "estimé tres
// días de mi gente para un alcance de $50 millones" dispara el margen
// implícito y cae en 'revisar' —; y (2) la traza completa del historial
// (quién estimó/cerró, cuándo, con qué números y por qué se re-estimó).

/** Marca como administración directa una asignación EXISTENTE (caso Microlink:
 *  el dato no está mal, está INCOMPLETO — el contratista es correcto, falta el
 *  tipo). Solo donde el tipo no estaba fijado y SIN economía cargada; después
 *  el tipo es inmutable (reglas). Jamás se cancela/recrea: el historial de la
 *  migración se conserva. */
export function patchMarcarAdministracionDirecta(
  a: AsignacionContratista, uid: string, fecha: Timestamp,
): { sub: Partial<AsignacionContratista>; entradaHistorial: EntradaHistorialAsignacion } | null {
  if (a.tipo !== undefined) return null
  if (a.preliquidacion || a.liquidacion || a.cierre_directa) return null
  if (a.estado !== 'asignada') return null
  return {
    sub: { tipo: 'administracion_directa', fecha_actualizacion: fecha },
    entradaHistorial: entrada('asignada', 'asignada', uid, fecha,
      'Marcada como ADMINISTRACIÓN DIRECTA (personal propio) — sin ciclo de pago: ' +
      'ni aprobación de giro, ni anticipo, ni liquidación conciliada. ' +
      'La identidad la lleva el contratista de la asignación.'),
  }
}

/** Estimar (o RE-estimar, con motivo) el costo del equipo propio. El costo se
 *  carga como TOTAL — el panel jamás almacena tarifas (regla dura del campo
 *  dias_equipo). Siembra la preliquidación con base cd_atomos y anticipo 0;
 *  SIN aprobada_por y SIN anticipo, jamás. Resuelve la señal de alcance si
 *  estaba puesta (estimar de nuevo ES revisar — patrón corregir). */
export function patchEstimarDirecta(
  a: AsignacionContratista,
  costoEstimado: number,
  diasEquipo: number | undefined,
  alcance: AlcanceGrupo[],
  uid: string,
  fecha: Timestamp,
  motivo?: string,
): { sub: Partial<AsignacionContratista>; entradaHistorial: EntradaHistorialAsignacion; resuelveSenal: boolean } | null {
  if (tipoDe(a) !== 'administracion_directa') return null
  if (a.estado !== 'asignada' && a.estado !== 'estimada') return null
  if (!(costoEstimado > 0)) return null
  const reEstima = a.estado === 'estimada'
  if (reEstima && !motivo?.trim()) return null   // re-estimar exige motivo
  const pre: PreliquidacionAsignacion = {
    valor_alcance: valorAlcanceDe(a.atomos, alcance),
    base_margen: 'cd_atomos',
    valor_contratista: costoEstimado,
    anticipo_pct: 0,
    definida_por: uid,
    fecha_definicion: fecha,
  }
  return {
    sub: {
      estado: 'estimada', preliquidacion: pre,
      ...(diasEquipo !== undefined && diasEquipo > 0 ? { dias_equipo: diasEquipo } : {}),
      fecha_actualizacion: fecha,
    },
    resuelveSenal: !!a.alcance_desactualizado,
    entradaHistorial: entrada(a.estado, 'estimada', uid, fecha,
      (reEstima
        ? `RE-estimación del costo propio — ${a.preliquidacion?.valor_contratista ?? '—'} → ${costoEstimado} · Motivo: ${motivo!.trim()}`
        : `Costo propio ESTIMADO: ${costoEstimado}`) +
      (diasEquipo ? ` · ${diasEquipo} días del equipo (referencia)` : '') +
      (a.alcance_desactualizado ? ' · resuelve la señal de alcance desactualizado' : '') +
      ' · sin aprobación por diseño: el control es la señal de implausibilidad + esta traza'),
  }
}

/** Cerrar la administración directa con el costo REAL (los días que realmente
 *  se ocuparon — el equivalente del pactado vs. liquidado). El estimado queda
 *  intacto; el ejecutado pasa a usar el real (costoContratistasDe). SIN gate
 *  SST y SIN gate financiero: no sale dinero a terceros. */
export function patchCerrarDirecta(
  a: AsignacionContratista,
  costoReal: number,
  diasReales: number | undefined,
  nota: string | undefined,
  uid: string,
  fecha: Timestamp,
): { sub: Partial<AsignacionContratista>; entradaHistorial: EntradaHistorialAsignacion } | null {
  if (tipoDe(a) !== 'administracion_directa') return null
  if (a.estado !== 'estimada') return null
  if (!(costoReal >= 0)) return null
  const estimado = a.preliquidacion?.valor_contratista ?? 0
  return {
    sub: {
      estado: 'liquidada',
      cierre_directa: {
        costo_real: costoReal,
        ...(diasReales !== undefined && diasReales > 0 ? { dias_reales: diasReales } : {}),
        ...(nota?.trim() ? { nota: nota.trim() } : {}),
        cerrada_por: uid, fecha,
      },
      fecha_actualizacion: fecha,
    },
    entradaHistorial: entrada('estimada', 'liquidada', uid, fecha,
      `Administración directa CERRADA — estimado ${estimado} · real ${costoReal}` +
      (diasReales ? ` · ${diasReales} días reales` : '') +
      (nota?.trim() ? ` · ${nota.trim()}` : '')),
  }
}

/** Definir (o redefinir antes de aprobar) la preliquidación de la asignación.
 *  `valor_alcance` = CD de SUS átomos, congelado aquí (base del margen). */
export function patchDefinirPreliquidacion(
  a: AsignacionContratista,
  datos: { valor_contratista: number; anticipo_pct: number; observaciones?: Record<string, string> },
  alcance: AlcanceGrupo[],
  uid: string,
  fecha: Timestamp,
): { sub: Partial<AsignacionContratista>; entradaHistorial: EntradaHistorialAsignacion } | null {
  // P2-4: una administración directa no lleva el ciclo de pago — su economía
  // entra por patchEstimarDirecta (los builders de cada tipo no se cruzan).
  if (tipoDe(a) === 'administracion_directa') return null
  if (a.estado !== 'asignada' && a.estado !== 'preliquidacion_definida') return null
  if (!(datos.valor_contratista > 0)) return null
  const pre: PreliquidacionAsignacion = {
    valor_alcance: valorAlcanceDe(a.atomos, alcance),
    valor_contratista: datos.valor_contratista,
    anticipo_pct: datos.anticipo_pct,
    ...(datos.observaciones ? { observaciones: datos.observaciones } : {}),
    definida_por: uid,
    fecha_definicion: fecha,
    // conserva costo/ajuste si redefinen (no aplica antes de aprobar, defensivo)
    ...(a.preliquidacion?.costo_ejecutado ? { costo_ejecutado: a.preliquidacion.costo_ejecutado } : {}),
  }
  return {
    sub: { estado: 'preliquidacion_definida', preliquidacion: pre, fecha_actualizacion: fecha },
    entradaHistorial: entrada(a.estado, 'preliquidacion_definida', uid, fecha,
      `Preliquidación definida — contratista ${datos.valor_contratista} · alcance (CD) ${pre.valor_alcance}`),
  }
}

/** Aprobar (titular sin salvedad; respaldo GG/GI/admin CON salvedad — quién
 *  puede qué lo juzgan UI y regla, como siempre). */
export function patchAprobarPreliquidacion(
  a: AsignacionContratista, uid: string, fecha: Timestamp, salvedad?: string,
): { sub: Partial<AsignacionContratista>; entradaHistorial: EntradaHistorialAsignacion } | null {
  if (a.estado !== 'preliquidacion_definida' || !a.preliquidacion) return null
  const { salvedad: _vieja, ...base } = a.preliquidacion
  const pre: PreliquidacionAsignacion = {
    ...base, aprobada_por: uid, fecha_aprobacion: fecha,
    ...(salvedad?.trim() ? { salvedad: salvedad.trim() } : {}),
  }
  return {
    sub: { estado: 'preliquidacion_aprobada', preliquidacion: pre, fecha_actualizacion: fecha },
    entradaHistorial: entrada('preliquidacion_definida', 'preliquidacion_aprobada', uid, fecha,
      salvedad?.trim() ? `Aprobada por RESPALDO — SALVEDAD: ${salvedad.trim()}` : 'Preliquidación aprobada'),
  }
}

export function patchGirarAnticipo(
  a: AsignacionContratista,
  anticipo: AnticipoGirado,
  uid: string,
  fecha: Timestamp,
): { sub: Partial<AsignacionContratista>; entradaHistorial: EntradaHistorialAsignacion } | null {
  if (a.estado !== 'preliquidacion_aprobada' || !a.preliquidacion) return null
  if (!(anticipo.valor > 0)) return null
  return {
    sub: {
      estado: 'anticipo_girado',
      preliquidacion: { ...a.preliquidacion, anticipo },
      fecha_actualizacion: fecha,
    },
    entradaHistorial: entrada('preliquidacion_aprobada', 'anticipo_girado', uid, fecha,
      `Anticipo girado — ${anticipo.valor}`),
  }
}

/** Corrección (Bloque 4 / Hotfix B, POR asignación):
 *  - asignación aprobada/girada y proyecto AÚN NO en ejecución → REVIERTE a
 *    definida (retira la aprobación del dato vivo; con giro previo, la
 *    re-aprobación vuelve directo a girado — eso lo maneja aprobar+girar).
 *  - proyecto en tramo de ejecución → AJUSTE trazable (flag pendiente de
 *    liquidación, sin re-aprobación, sin frenar).
 *  También RESUELVE la señal de alcance si estaba puesta (corregir ES revisar). */
export function patchCorregirPreliquidacion(
  a: AsignacionContratista,
  proyectoEnEjecucion: boolean,
  datos: { valor_contratista: number; anticipo_pct: number },
  motivo: string,
  uid: string,
  fecha: Timestamp,
): { sub: Partial<AsignacionContratista>; entradaHistorial: EntradaHistorialAsignacion; revierte: boolean; ajuste: boolean; resuelveSenal: boolean } | null {
  const pre = a.preliquidacion
  if (!pre || !motivo.trim()) return null
  if (a.estado === 'liquidada' || a.estado === 'cancelada') return null
  const sinCambio = pre.valor_contratista === datos.valor_contratista && pre.anticipo_pct === datos.anticipo_pct
  if (sinCambio) return null
  const revierte = !proyectoEnEjecucion && (a.estado === 'preliquidacion_aprobada' || a.estado === 'anticipo_girado')
  const ajuste = proyectoEnEjecucion
  const { aprobada_por: _ap, fecha_aprobacion: _fa, ...base } = pre
  const nueva: PreliquidacionAsignacion = revierte
    ? { ...base, valor_contratista: datos.valor_contratista, anticipo_pct: datos.anticipo_pct }
    : {
        ...pre, valor_contratista: datos.valor_contratista, anticipo_pct: datos.anticipo_pct,
        ...(ajuste ? { ajuste_pendiente_liquidacion: true } : {}),
      }
  const estadoNuevo: EstadoAsignacion = revierte ? 'preliquidacion_definida' : a.estado
  const sub: Partial<AsignacionContratista> = {
    estado: estadoNuevo, preliquidacion: nueva, fecha_actualizacion: fecha,
  }
  return {
    sub, revierte, ajuste,
    // corregir ES revisar: si había señal de alcance, el caller la borra
    // (deleteField) en el mismo write — indicado por este flag.
    resuelveSenal: !!a.alcance_desactualizado,
    entradaHistorial: entrada(a.estado, estadoNuevo, uid, fecha,
      `Corrección de preliquidación — ${pre.valor_contratista} → ${datos.valor_contratista} · Motivo: ${motivo.trim()}` +
      (revierte ? ' · REVIERTE la aprobación: requiere re-aprobación' : '') +
      (ajuste ? ' · AJUSTE en ejecución — pendiente de reconocer en la liquidación' : '') +
      (a.alcance_desactualizado ? ' · resuelve la señal de alcance desactualizado' : '')),
  }
}

/** LIQUIDAR la asignación (B3b por-asignación — el camino que NUNCA ha corrido
 *  en prod: 0 liquidaciones en 44 proyectos; este builder + su E2E son la
 *  única validación antes de mover dinero real).
 *  Gates duros:
 *   - gate SST al día (parámetro — validado además por la regla)
 *   - origen del PROYECTO: pagado_cliente (normal) o facturado (ANTICIPADA con
 *     justificación + constancia) — cualquier otro, null
 *   - estado de la asignación: anticipo_girado, o cancelada CON incurrido > 0
 *     (cierre anticipado → es_cancelacion, mano de obra = lo incurrido). */
export function patchLiquidarAsignacion(
  a: AsignacionContratista,
  proyectoEstado: EstadoProyecto | 'pagado_cliente' | 'facturado',
  datos: {
    retenciones: RetencionLiquidacion[]
    observaciones?: string
    justificacion_anticipada?: string
    acuerdo_con?: string
    acuerdo_fecha?: Timestamp
  },
  gateSstAlDia: boolean,
  uid: string,
  fecha: Timestamp,
): { sub: Partial<AsignacionContratista>; entradaHistorial: EntradaHistorialAsignacion; liquidacion: LiquidacionAsignacion } | null {
  if (!gateSstAlDia) return null
  const anticipada = proyectoEstado === 'facturado'
  if (proyectoEstado !== 'pagado_cliente' && proyectoEstado !== 'facturado') return null
  if (anticipada && !(datos.justificacion_anticipada?.trim() && datos.acuerdo_con?.trim() && datos.acuerdo_fecha)) return null
  const esCancelacion = a.estado === 'cancelada'
  if (esCancelacion && !((a.cancelacion?.incurrido.total ?? 0) > 0)) return null
  if (!esCancelacion && a.estado !== 'anticipo_girado') return null
  const pre = a.preliquidacion
  if (!pre) return null

  // Cierre anticipado: se concilia lo INCURRIDO, no el pactado completo.
  const manoObra = esCancelacion ? (a.cancelacion?.incurrido.anticipo ?? 0) : pre.valor_contratista
  const compras = a.compras_reembolsos ?? []
  const diferencia = totalComprasReembolsos(compras)
  const totalFinal = manoObra + diferencia
  const anticipoGirado = pre.anticipo?.valor ?? (esCancelacion ? 0 : anticipoValorDe(pre))
  const retenciones = datos.retenciones ?? []
  const totalRet = retenciones.reduce((s, r) => s + (r.valor || 0), 0)
  const saldoFinal = totalFinal - anticipoGirado - totalRet
  const ajustes = pre.ajuste_pendiente_liquidacion
    ? (a.historial ?? []).map(h => h.motivo ?? '').filter(m => m.includes('AJUSTE en ejecución'))
    : []
  const liquidacion: LiquidacionAsignacion = {
    ...(anticipada ? {
      liquidacion_anticipada: true,
      justificacion_anticipada: datos.justificacion_anticipada!.trim(),
      acuerdo_con: datos.acuerdo_con!.trim(),
      acuerdo_fecha: datos.acuerdo_fecha!,
    } : {}),
    ...(esCancelacion ? { es_cancelacion: true } : {}),
    mano_obra: manoObra,
    compras_reembolsos: compras,
    ajustes_reconocidos: ajustes,
    retenciones,
    total_final: totalFinal,
    diferencia,
    es_igual: diferencia === 0 && !pre.ajuste_pendiente_liquidacion && !esCancelacion,
    anticipo_girado: anticipoGirado,
    saldo_final: saldoFinal,
    liquidada_por: uid,
    fecha,
    ...(datos.observaciones?.trim() ? { observaciones: datos.observaciones.trim() } : {}),
  }
  const { ajuste_pendiente_liquidacion: _flag, ...preReconciliada } = pre
  return {
    sub: {
      estado: 'liquidada', liquidacion, preliquidacion: preReconciliada, fecha_actualizacion: fecha,
    },
    liquidacion,
    entradaHistorial: entrada(a.estado, 'liquidada', uid, fecha,
      (anticipada ? 'Liquidación ANTICIPADA — ' : esCancelacion ? 'Liquidación de asignación CANCELADA — ' : 'Liquidación — ') +
      `mano de obra ${manoObra} + reembolsos ${diferencia} = ${totalFinal} · anticipo ${anticipoGirado}` +
      (totalRet ? ` · retenciones ${totalRet}` : '') + ` · SALDO ${saldoFinal} · gate SST al día`),
  }
}

/** CANCELAR — el cierre anticipado como caso general con valores en cero:
 *  registra lo incurrido y libera los átomos. Con incurrido 0 → terminal;
 *  con incurrido > 0 → queda esperando su liquidación (cancelada→liquidada). */
export function patchCancelarAsignacion(
  a: AsignacionContratista, motivo: string, uid: string, fecha: Timestamp,
): { sub: Partial<AsignacionContratista>; entradaHistorial: EntradaHistorialAsignacion; incurrido: CancelacionAsignacion['incurrido'] } | null {
  if (!motivo.trim()) return null
  if (a.estado === 'liquidada' || a.estado === 'cancelada') return null
  const anticipo = a.preliquidacion?.anticipo?.valor ?? 0
  const reembolsos = totalComprasReembolsos(a.compras_reembolsos)
  const incurrido = { anticipo, reembolsos, total: anticipo + reembolsos }
  return {
    sub: {
      estado: 'cancelada',
      cancelacion: { fecha, por: uid, motivo: motivo.trim(), incurrido },
      fecha_actualizacion: fecha,
    },
    incurrido,
    entradaHistorial: entrada(a.estado, 'cancelada', uid, fecha,
      `Asignación cancelada — ${motivo.trim()} · incurrido: anticipo ${anticipo} + reembolsos ${reembolsos} = ${incurrido.total}` +
      (incurrido.total > 0 ? ' · QUEDA PENDIENTE DE LIQUIDAR lo incurrido' : ' · sin plata afuera (terminal)')),
  }
}

/** Ajustar los átomos de una asignación viva (caso Megacenter: recortar a
 *  Héctor a solo "Ensayos"). Valida el invariante contra las demás vivas; si
 *  la preliquidación ya existe, recalcula `valor_alcance` y PONE la señal
 *  (version 0 = ajuste manual) — el valor del contratista es decisión humana. */
export function patchAjustarAtomos(
  a: AsignacionContratista,
  atomosNuevos: string[],
  alcance: AlcanceGrupo[],
  demas: AsignacionContratista[],
  motivo: string,
  uid: string,
  fecha: Timestamp,
): { sub: Partial<AsignacionContratista>; entradaHistorial: EntradaHistorialAsignacion } | null {
  if (!motivo.trim()) return null
  if (a.estado === 'liquidada' || a.estado === 'cancelada') return null
  if (atomosNuevos.length === 0) return null
  const enAlcance = new Set(alcance.map(g => g.grupo))
  for (const at of atomosNuevos) {
    if (!enAlcance.has(at)) throw new Error(`La actividad «${at}» no existe en el alcance vigente`)
  }
  const tomadosPorOtras = atomosTomados(demas.filter(x => x.id !== a.id))
  for (const at of atomosNuevos) {
    if (tomadosPorOtras.has(at)) throw new Error(`La actividad «${at}» ya está asignada a otro contratista`)
  }
  const viejos = new Set(a.atomos)
  const nuevos = new Set(atomosNuevos)
  const afectados = [
    ...a.atomos.filter(at => !nuevos.has(at)),
    ...atomosNuevos.filter(at => !viejos.has(at)),
  ]
  if (afectados.length === 0) return null
  const sub: Partial<AsignacionContratista> = {
    atomos: [...atomosNuevos], fecha_actualizacion: fecha,
    ...(a.preliquidacion ? {
      // La base pasa a ser CD de los átomos — se DECLARA (condición A: el
      // rótulo viaja con la base, aunque la asignación siga siendo `legacy`).
      preliquidacion: {
        ...a.preliquidacion,
        valor_alcance: valorAlcanceDe(atomosNuevos, alcance),
        base_margen: 'cd_atomos' as BaseMargenAsignacion,
      },
      alcance_desactualizado: { version: 0, fecha, atomos_afectados: afectados },
    } : {}),
  }
  return {
    sub,
    entradaHistorial: entrada(a.estado, a.estado, uid, fecha,
      `Átomos ajustados — quedan: ${atomosNuevos.join(' · ')} · Motivo: ${motivo.trim()}` +
      (a.preliquidacion ? ' · la preliquidación queda PENDIENTE DE REVISAR (señal puesta)' : '')),
  }
}

/** Confirmar la preliquidación sin cambios tras una señal (limpia el flag). */
export function patchResolverSenal(
  a: AsignacionContratista, motivo: string, uid: string, fecha: Timestamp,
): { entradaHistorial: EntradaHistorialAsignacion } | null {
  if (!a.alcance_desactualizado || !motivo.trim()) return null
  return {
    entradaHistorial: entrada(a.estado, a.estado, uid, fecha,
      `Preliquidación CONFIRMADA sin cambios tras la señal de alcance (v${a.alcance_desactualizado.version}) — ${motivo.trim()}`),
  }
}

// ── Síntesis legacy (lectura dual + migración: UNA implementación) ───────────

/** Tabla de estado económico legacy POR PIEZAS (no por estado del proyecto —
 *  el censo mostró 33 anticipos repartidos por todos los estados avanzados). */
export function estadoAsignacionLegacyDe(p: Pick<Proyecto, 'preliquidacion' | 'liquidacion'>): EstadoAsignacion {
  if (p.liquidacion) return 'liquidada'
  const pre = p.preliquidacion
  if (!pre) return 'asignada'
  if (pre.anticipo) return 'anticipo_girado'
  if (pre.aprobada_por) return 'preliquidacion_aprobada'
  return 'preliquidacion_definida'
}

/**
 * Sintetiza la asignación legacy desde los campos del padre — la MISMA
 * implementación sirve a la lectura dual (en memoria), a la migración lazy y
 * a la masiva. Átomos = TODOS los grupos del alcance (era EL contratista del
 * proyecto); la preliquidación conserva su `valor_venta` viejo como
 * `valor_alcance` con `legacy: true` (base ANTERIOR — ver baseMargenDe).
 * null si el proyecto no tiene asignación singular.
 */
export function sintetizarAsignacionLegacy(
  p: Pick<Proyecto, 'asignacion' | 'preliquidacion' | 'liquidacion' | 'compras_reembolsos' | 'snapshot' | 'fecha_creacion'>,
): (Omit<AsignacionContratista, 'id'> & { legacy: true }) | null {
  const asig = p.asignacion
  if (!asig) return null
  const pre = p.preliquidacion
  const estado = estadoAsignacionLegacyDe(p)
  return {
    contratista_id: asig.contratista_id,
    contratista_nombre: asig.contratista_nombre,
    ...(asig.contratista_documento ? { contratista_documento: asig.contratista_documento } : {}),
    habilitacion_snapshot: asig.habilitacion_snapshot,
    ...(asig.evaluacion_snapshot ? { evaluacion_snapshot: asig.evaluacion_snapshot } : {}),
    ...(asig.nota_criterio ? { nota_criterio: asig.nota_criterio } : {}),
    atomos: (p.snapshot.alcance ?? []).map(g => g.grupo),
    modalidad: pre ? modalidadDe(pre) : 'todo_costo',
    ...(pre?.valor_materiales !== undefined ? { valor_materiales: pre.valor_materiales } : {}),
    estado,
    ...(pre ? {
      preliquidacion: {
        // Base ANTERIOR conservada tal cual (venta con impuestos) — jamás se
        // disfraza de CD (condición A; baseMargenDe la rotula).
        valor_alcance: pre.valor_venta,
        valor_contratista: pre.valor_contratista,
        anticipo_pct: pre.anticipo_pct,
        ...(pre.observaciones ? { observaciones: pre.observaciones } : {}),
        definida_por: pre.definida_por,
        fecha_definicion: pre.fecha_definicion,
        ...(pre.aprobada_por ? { aprobada_por: pre.aprobada_por } : {}),
        ...(pre.fecha_aprobacion ? { fecha_aprobacion: pre.fecha_aprobacion } : {}),
        ...(pre.salvedad ? { salvedad: pre.salvedad } : {}),
        ...(pre.anticipo ? { anticipo: pre.anticipo } : {}),
        ...(pre.costo_ejecutado ? { costo_ejecutado: pre.costo_ejecutado } : {}),
        ...(pre.ajuste_pendiente_liquidacion ? { ajuste_pendiente_liquidacion: true } : {}),
      },
    } : {}),
    ...(p.liquidacion ? { liquidacion: { ...p.liquidacion } as unknown as LiquidacionAsignacion } : {}),
    compras_reembolsos: p.compras_reembolsos ?? [],
    legacy: true,
    asignado_por: asig.asignado_por,
    fecha: asig.fecha,
    historial: [entrada(null, estado, 'sistema', asig.fecha,
      'Asignación sintetizada del modelo singular (migración P2-2) — economía copiada del proyecto')],
    fecha_creacion: p.fecha_creacion,
  }
}

/** LECTURA DUAL — el único punto de verdad para consumir asignaciones:
 *  subcolección no vacía → subdocs; vacía con `asignacion` legacy en el padre
 *  → síntesis en memoria (id 'legacy'). Si la síntesis tiene un hueco, lo
 *  tiene también la migración — y los tests lo cazan una sola vez. */
export function asignacionesDe(
  p: Proyecto, subdocs: AsignacionContratista[],
): AsignacionContratista[] {
  if (subdocs.length > 0) return subdocs
  const legacy = sintetizarAsignacionLegacy(p)
  return legacy ? [{ ...legacy, id: 'legacy' }] : []
}

// ── Máquina del proyecto v2 (el switch de consumidores es SB2+) ─────────────

export const ESTADOS_PROYECTO_V2 = [
  'creado', 'en_preparacion', 'en_ejecucion', 'ejecutado', 'entregado_cliente',
  'soporte_recibido', 'enviado_a_facturacion', 'facturado', 'pagado_cliente', 'cerrado',
] as const
export type EstadoProyectoV2 = (typeof ESTADOS_PROYECTO_V2)[number]

/** Re-mapeo de la máquina vieja (migración + lectura). Los estados económicos
 *  colapsan en `en_preparacion`; `liquidado_contratista` deja de ser estado
 *  (derivado: todas las vivas liquidadas) → puente a `pagado_cliente` si hubo
 *  pago, si no `facturado` (hoy 0 casos en prod — defensivo). */
export function mapearEstadoV2(
  estado: string, p?: Pick<Proyecto, 'pago_cliente'>,
): EstadoProyectoV2 {
  switch (estado) {
    case 'contratista_asignado':
    case 'permisos_en_tramite':
    case 'preliquidacion_definida':
    case 'preliquidacion_aprobada':
    case 'anticipo_girado':
      return 'en_preparacion'
    case 'liquidado_contratista':
      return p?.pago_cliente ? 'pagado_cliente' : 'facturado'
    default:
      return (ESTADOS_PROYECTO_V2 as readonly string[]).includes(estado)
        ? (estado as EstadoProyectoV2)
        : 'creado'
  }
}

/** ¿Todas las asignaciones vivas quedaron liquidadas (o canceladas sin
 *  saldo)? — el derivado que reemplaza al estado `liquidado_contratista`;
 *  requisito del cierre. Sin asignaciones → false (no hay a quién liquidar,
 *  pero tampoco evidencia de cierre económico). */
export function asignacionesLiquidadas(asigs: AsignacionContratista[]): boolean {
  if (asigs.length === 0) return false
  return asigs.every(a =>
    a.estado === 'liquidada' ||
    (a.estado === 'cancelada' && (a.cancelacion?.incurrido.total ?? 0) === 0))
}
