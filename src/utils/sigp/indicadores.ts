// Panel SIGP — indicadores de la Caracterización Integral del Área de
// Proyectos (evidencia ISO 9.1, seguimiento y medición).
//
// CAPA OFICIAL: 5 indicadores con fórmula, meta y semáforo según la
// caracterización (documento controlado). CAPA OPERATIVA: conteos de apoyo.
// Todo es cálculo PURO client-side sobre las colecciones existentes; los
// componentes solo pintan lo que sale de aquí.

import { costoPresupuestadoProyectoDe, costoEjecutadoDe } from '../../types/sigp/proyecto'
import type { Proyecto } from '../../types/sigp/proyecto'
import type { Solicitud } from '../../types/sigp/solicitud'

// ── Semáforo — colores de ESTADO v2 (reservados para desempeño; siempre
//    acompañados de texto "En meta"/"Bajo meta"/"Sobre meta", nunca color solo) ──

export type Semaforo = 'verde' | 'ambar' | 'rojo'

export const SEMAFORO_COLOR: Record<Semaforo, string> = {
  verde: '#3C8B2E',
  ambar: '#E0A100',
  rojo: '#D03B3B',
}

// Paleta CATEGÓRICA v2 (identidad de cada indicador — validada CVD).
// Regla: acento = identidad; estado = desempeño. Nunca mezclar roles.
export const ACENTOS = {
  verde: { base: '#628E3A', suave: '#eef4e7', tinta: '#4d712c' },
  violeta: { base: '#6E56CF', suave: '#efecfb', tinta: '#6E56CF' },
  ambar: { base: '#E0A100', suave: '#fbf3da', tinta: '#b47f00' },
  teal: { base: '#1BAF7A', suave: '#e2f6ee', tinta: '#12805a' },
  naranja: { base: '#EB6834', suave: '#fdeadf', tinta: '#c1521f' },
} as const

export interface ValorIndicador {
  /** Porcentaje 0–100+ o null si el periodo no tiene datos. */
  valor: number | null
  semaforo: Semaforo | null
  /** Números crudos para el subtítulo (p. ej. "12/15 actividades"). */
  numerador: number
  denominador: number
}

const sinDatos: ValorIndicador = { valor: null, semaforo: null, numerador: 0, denominador: 0 }

const pct = (num: number, den: number): number => (den > 0 ? (num / den) * 100 : 0)

// ── Semáforos por indicador (metas de la caracterización) ──
//
// 21-sep-2026: las METAS dejan de ser constantes — las fija el SGI
// (gestion_integral) en `configuracion/indicadores.metas_iso` (decisión
// Giovanny: las metas ISO son del SGI; la meta de MARGEN operativo sigue
// siendo de gerencia_general, decisión deliberada del PR #69). Los valores
// de la Caracterización quedan como DEFAULT — sin doc de config, el
// tablero se comporta byte-idéntico al histórico. El ANCHO del tramo
// ámbar es FIJO por indicador (el de siempre: 20/15/10/10 puntos bajo la
// meta) — el SGI fija la meta, no la geometría de la alerta; si algún día
// también se quiere configurable, es un campo más en el mismo doc.

export interface MetasIso {
  plan_min: number          // ind. 1 — cumplimiento del plan (verde ≥)
  calidad_min: number       // ind. 2 — calidad (verde ≥)
  presupuesto_min: number   // ind. 3 — banda verde inferior
  presupuesto_max: number   // ind. 3 — banda verde superior
  satisfaccion_min: number  // ind. 4 — satisfacción (verde ≥)
  sst_min: number           // ind. 5 — ambiental y SST (verde ≥)
}

/** Metas de la Caracterización Integral (documento controlado) — el default. */
export const METAS_ISO_DEFAULT: MetasIso = {
  plan_min: 80, calidad_min: 90,
  presupuesto_min: 90, presupuesto_max: 110,
  satisfaccion_min: 90, sst_min: 95,
}

const metaValida = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 200

/** Metas efectivas desde el doc `configuracion/indicadores` (campo
 *  `metas_iso`, parcial): campo a campo, un valor inválido cae al default
 *  — jamás un tablero con meta 0 o NaN. Si la banda del presupuesto queda
 *  invertida (min ≥ max), la banda COMPLETA vuelve al default. */
export function metasIsoDe(cfg: { metas_iso?: Partial<MetasIso> } | null | undefined): MetasIso {
  const m = cfg?.metas_iso
  const r: MetasIso = {
    plan_min: metaValida(m?.plan_min) ? m!.plan_min! : METAS_ISO_DEFAULT.plan_min,
    calidad_min: metaValida(m?.calidad_min) ? m!.calidad_min! : METAS_ISO_DEFAULT.calidad_min,
    presupuesto_min: metaValida(m?.presupuesto_min) ? m!.presupuesto_min! : METAS_ISO_DEFAULT.presupuesto_min,
    presupuesto_max: metaValida(m?.presupuesto_max) ? m!.presupuesto_max! : METAS_ISO_DEFAULT.presupuesto_max,
    satisfaccion_min: metaValida(m?.satisfaccion_min) ? m!.satisfaccion_min! : METAS_ISO_DEFAULT.satisfaccion_min,
    sst_min: metaValida(m?.sst_min) ? m!.sst_min! : METAS_ISO_DEFAULT.sst_min,
  }
  if (r.presupuesto_min >= r.presupuesto_max) {
    r.presupuesto_min = METAS_ISO_DEFAULT.presupuesto_min
    r.presupuesto_max = METAS_ISO_DEFAULT.presupuesto_max
  }
  return r
}

/** Ind. 1 — cumplimiento del plan: default 80–100 %; ámbar 20 puntos bajo la meta. */
export const semaforoPlan = (v: number, min = METAS_ISO_DEFAULT.plan_min): Semaforo =>
  (v >= min ? 'verde' : v >= min - 20 ? 'ambar' : 'rojo')
/** Ind. 2 y 4 — calidad / satisfacción (proyectos ≥4/5): default ≥90 %; ámbar 15 puntos bajo la meta. */
export const semaforoCalidad = (v: number, min = METAS_ISO_DEFAULT.calidad_min): Semaforo =>
  (v >= min ? 'verde' : v >= min - 15 ? 'ambar' : 'rojo')
/** Ind. 3 — proyección presupuestal: default 90–110 % (desviación en ambas
 *  direcciones); ámbar 10 puntos por fuera de la banda. */
export const semaforoPresupuesto = (
  v: number, min = METAS_ISO_DEFAULT.presupuesto_min, max = METAS_ISO_DEFAULT.presupuesto_max,
): Semaforo =>
  v >= min && v <= max ? 'verde' : (v >= min - 10 && v < min) || (v > max && v <= max + 10) ? 'ambar' : 'rojo'
/** Ind. 5 — ambiental y SST: default ≥95 %; ámbar 10 puntos bajo la meta. */
export const semaforoSst = (v: number, min = METAS_ISO_DEFAULT.sst_min): Semaforo =>
  (v >= min ? 'verde' : v >= min - 10 ? 'ambar' : 'rojo')

// ── Utilidades de periodo ──

export interface Periodo { anio: number; mes: number }  // mes 1–12

export const enPeriodo = (t: { toDate?: () => Date } | undefined, p: Periodo): boolean => {
  const d = t?.toDate?.()
  return !!d && d.getFullYear() === p.anio && d.getMonth() + 1 === p.mes
}

export const etiquetaPeriodo = (p: Periodo): string =>
  new Date(p.anio, p.mes - 1, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })

/** Últimos n periodos terminando en `p` (para la mini-tendencia). */
export const ultimosPeriodos = (p: Periodo, n: number): Periodo[] =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(p.anio, p.mes - 1 - (n - 1 - i), 1)
    return { anio: d.getFullYear(), mes: d.getMonth() + 1 }
  })

// El alcance de Gerencia de Proyectos llega hasta enviado_a_facturacion;
// para los indicadores, un proyecto está "activo/en gestión" si no pasó a
// manos de Administrativa ni está cerrado.
const GESTION_ACTIVA = new Set([
  'creado', 'contratista_asignado', 'permisos_en_tramite', 'preliquidacion_definida',
  'preliquidacion_aprobada', 'anticipo_girado', 'en_ejecucion', 'ejecutado',
  'entregado_cliente', 'soporte_recibido',
])

// ── CAPA OFICIAL — los 5 indicadores ──

/** Ind. 1 — Cumplimiento del plan de trabajo (corte actual sobre proyectos en
 *  gestión con plan sembrado): actividades ejecutadas / programadas × 100. */
export function indPlanTrabajo(proyectos: Proyecto[], metas: MetasIso = METAS_ISO_DEFAULT): ValorIndicador {
  const conPlan = proyectos.filter(p => GESTION_ACTIVA.has(p.estado) && (p.actividades_plan?.length ?? 0) > 0)
  const den = conPlan.reduce((s, p) => s + (p.actividades_plan?.length ?? 0), 0)
  if (den === 0) return sinDatos
  const num = conPlan.reduce((s, p) => s + (p.actividades_plan?.filter(a => a.ejecutada).length ?? 0), 0)
  const v = pct(num, den)
  return { valor: v, semaforo: semaforoPlan(v, metas.plan_min), numerador: num, denominador: den }
}

/** Ind. 2 — Calidad (calificación ≥4/5 en el acta de entrega), consolidado
 *  del periodo por fecha de entrega. */
export function indCalidad(proyectos: Proyecto[], p: Periodo, metas: MetasIso = METAS_ISO_DEFAULT): ValorIndicador {
  const entregados = proyectos.filter(x =>
    x.entrega?.calificacion_calidad != null && enPeriodo(x.entrega.fecha, p))
  if (entregados.length === 0) return sinDatos
  const ok = entregados.filter(x => (x.entrega!.calificacion_calidad ?? 0) >= 4).length
  const v = pct(ok, entregados.length)
  return { valor: v, semaforo: semaforoCalidad(v, metas.calidad_min), numerador: ok, denominador: entregados.length }
}

/** Ind. 3 — Cumplimiento presupuestal de costos (corte actual sobre proyectos
 *  con costo ejecutado capturado): Σ ejecutado / Σ costo PRESUPUESTADO total
 *  × 100 — misma canasta según la modalidad (mano de obra + materiales NEG en
 *  'solo_mano_obra'). 24-jul: antes se dividía por la VENTA, que incluye la
 *  utilidad y dejaba bajo meta a todo proyecto rentable. 02-ago (C3, decisión
 *  de Giovanny): el costo ejecutado ya NO es un campo manual libre — se
 *  deriva con `costoEjecutadoDe` (gate por `estado` ≥ 'ejecutado' + manual
 *  histórico gana siempre + compras REALES de `compras_proyecto` agregadas
 *  por la CF cuando no hay manual). 03-ago (C4): ese derivado suma además los
 *  reembolsos al contratista (`proyecto.compras_reembolsos`, línea disjunta
 *  de las OCs/menores — sin doble conteo); el cálculo de este indicador NO
 *  cambia de firma, el tercer componente lo agrega `costoEjecutadoDe` por sí
 *  solo. `comprasPorProyecto` es el mapa proyecto.id → compras_ejecutadas_total
 *  (vacío si el rol no puede verlas — el caller decide si calcula o no; nunca
 *  se calcula a medias). */
/** P2-2 (decisión 3): un proyecto con COBERTURA INCOMPLETA no aporta un
 *  número creíble — se EXCLUYE del agregado y el Panel muestra cuánto valor
 *  está sin costear. Solo aplica a proyectos migrados (con resumen); los
 *  legacy en lectura dual entran como siempre. */
export const excluidoPorCobertura = (p: Pick<Proyecto, 'resumen_asignaciones'>): boolean =>
  !!p.resumen_asignaciones && !p.resumen_asignaciones.cobertura_completa

export function indPresupuesto(
  proyectos: Proyecto[], comprasPorProyecto: Record<string, number>,
  metas: MetasIso = METAS_ISO_DEFAULT,
): ValorIndicador {
  const entradas = proyectos
    .filter(p => !excluidoPorCobertura(p))
    .map(p => ({ p, ce: costoEjecutadoDe(p, comprasPorProyecto[p.id] ?? 0) }))
    .filter((x): x is { p: Proyecto; ce: number } =>
      x.ce != null && costoPresupuestadoProyectoDe(x.p) > 0)
  if (entradas.length === 0) return sinDatos
  const ejecutado = entradas.reduce((s, x) => s + x.ce, 0)
  const proyectado = entradas.reduce((s, x) => s + costoPresupuestadoProyectoDe(x.p), 0)
  const v = pct(ejecutado, proyectado)
  return {
    valor: v, semaforo: semaforoPresupuesto(v, metas.presupuesto_min, metas.presupuesto_max),
    numerador: ejecutado, denominador: proyectado,
  }
}

/** P2-2 — el contexto de cobertura que acompaña a los indicadores en el
 *  Panel: cuántos proyectos quedaron fuera y cuánto valor está sin costear,
 *  más la lista de IMPLAUSIBILIDAD (revisar cobertura — el sistema dice
 *  cuáles mirar; NO excluye, decide un humano). */
export interface ContextoCoberturaPanel {
  excluidos_cobertura: number
  valor_sin_costear: number
  revisar_cobertura: number
}
export function contextoCoberturaPanel(proyectos: Proyecto[]): ContextoCoberturaPanel {
  let excluidos = 0, valor = 0, revisar = 0
  for (const p of proyectos) {
    const r = p.resumen_asignaciones
    if (!r) continue
    if (!r.cobertura_completa) { excluidos++; valor += r.valor_sin_costear }
    revisar += r.revisar_cobertura
  }
  return { excluidos_cobertura: excluidos, valor_sin_costear: valor, revisar_cobertura: revisar }
}

/** Ind. 4 — Satisfacción del cliente (encuestas ≥4/5), consolidado del
 *  periodo por fecha de la encuesta. */
export function indSatisfaccion(proyectos: Proyecto[], p: Periodo, metas: MetasIso = METAS_ISO_DEFAULT): ValorIndicador {
  const encuestas = proyectos.filter(x => x.evaluacion_cliente && enPeriodo(x.evaluacion_cliente.fecha, p))
  if (encuestas.length === 0) return sinDatos
  const ok = encuestas.filter(x => x.evaluacion_cliente!.satisfaccion >= 4).length
  const v = pct(ok, encuestas.length)
  return { valor: v, semaforo: semaforoCalidad(v, metas.satisfaccion_min), numerador: ok, denominador: encuestas.length }
}

/** Ind. 5 — Ambiental y SST: valor manual del periodo (proceso cruzado con el
 *  Panel SST; la integración automática es futura). */
export function indSst(valorManual: number | null, metas: MetasIso = METAS_ISO_DEFAULT): ValorIndicador {
  if (valorManual == null) return sinDatos
  return {
    valor: valorManual, semaforo: semaforoSst(valorManual, metas.sst_min),
    numerador: valorManual, denominador: 100,
  }
}

// ── CAPA OPERATIVA ──

/** Utilidad REAL por proyecto (operativo): venta pactada − costo ejecutado
 *  derivado. Hereda de costoEjecutadoDe el gate desde 'ejecutado', el manual
 *  histórico y la canasta completa (mano de obra + OCs + menores + reembolsos).
 *  P2-1 (ajuste 1 de Giovanny): con `alcance_desactualizado` puesto,
 *  `preliquidacion.valor_venta` quedó VIEJA respecto del cambio aprobado —
 *  calcular utilidad con ella sería el mismo error que el bloque arregla, en
 *  chico → null (pendiente de revisar), nunca una cifra creíble con datos
 *  que sabemos desactualizados. */
/** Venta base del margen real: migrado → la VIGENTE del snapshot; legacy →
 *  la de su preliquidación (iguales salvo cambios de alcance sin revisar,
 *  que de todos modos anulan el número). */
export const ventaBaseDe = (p: Proyecto): number | null =>
  p.resumen_asignaciones ? p.snapshot.valor_venta : (p.preliquidacion?.valor_venta ?? null)

export function utilidadRealDe(p: Proyecto, comprasTotal: number): number | null {
  if (p.alcance_desactualizado) return null
  // P2-2: señal de alcance viva en alguna asignación, o cobertura incompleta
  // → sin número (mismo principio, ahora por-asignación).
  if ((p.resumen_asignaciones?.alcance_desactualizado ?? 0) > 0) return null
  if (excluidoPorCobertura(p)) return null
  const ce = costoEjecutadoDe(p, comprasTotal)
  if (ce == null) return null
  // Venta: migrado → la vigente del snapshot; legacy → la de su preliquidación.
  const venta = p.resumen_asignaciones ? p.snapshot.valor_venta : p.preliquidacion?.valor_venta
  if (venta == null || venta <= 0) return null
  return venta - ce
}

export interface ValorMargenReal {
  valor: number | null          // margen % agregado (Σ utilidad real / Σ venta)
  semaforo: Semaforo | null     // null si no hay meta configurada (sin pill)
  utilidad: number              // Σ utilidad real $
  venta: number                 // Σ venta $
  proyectos: number             // n proyectos que entran (ejecutado+)
}

/** Indicador OPERATIVO (no ISO oficial). Semáforo (decisión Giovanny: más
 *  alto es mejor): verde ≥ meta · ámbar [meta−5, meta) · rojo < meta−5 (o
 *  negativo). metaPct null → sin semáforo (el % se muestra sin pill). */
export function indMargenReal(
  proyectos: Proyecto[], comprasPorProyecto: Record<string, number>, metaPct: number | null,
): ValorMargenReal {
  const entradas = proyectos
    .map(p => ({ p, ur: utilidadRealDe(p, comprasPorProyecto[p.id] ?? 0), vb: ventaBaseDe(p) }))
    .filter((x): x is { p: Proyecto; ur: number; vb: number } => x.ur != null && x.vb != null && x.vb > 0)
  if (entradas.length === 0) return { valor: null, semaforo: null, utilidad: 0, venta: 0, proyectos: 0 }
  const utilidad = entradas.reduce((s, x) => s + x.ur, 0)
  const venta = entradas.reduce((s, x) => s + x.vb, 0)
  const margen = (utilidad / venta) * 100
  const semaforo: Semaforo | null =
    metaPct == null ? null : margen >= metaPct ? 'verde' : margen >= metaPct - 5 ? 'ambar' : 'rojo'
  return { valor: margen, semaforo, utilidad, venta, proyectos: entradas.length }
}

export function proyectosPorEstado(proyectos: Proyecto[]): Record<string, number> {
  const r: Record<string, number> = {}
  for (const p of proyectos) r[p.estado] = (r[p.estado] ?? 0) + 1
  return r
}

export interface EmbudoMes {
  solicitudes: number
  visitas: number
  cotizaciones: number
  proyectos: number
}

export function embudoDelMes(
  solicitudes: { fecha_creacion?: { toDate?: () => Date } }[],
  visitas: { fecha_creacion?: { toDate?: () => Date } }[],
  cotizaciones: { fecha_creacion?: { toDate?: () => Date } }[],
  proyectos: Proyecto[],
  p: Periodo,
): EmbudoMes {
  return {
    solicitudes: solicitudes.filter(s => enPeriodo(s.fecha_creacion, p)).length,
    visitas: visitas.filter(v => enPeriodo(v.fecha_creacion, p)).length,
    cotizaciones: cotizaciones.filter(c => enPeriodo(c.fecha_creacion, p)).length,
    proyectos: proyectos.filter(x => enPeriodo(x.fecha_creacion, p)).length,
  }
}

export interface PreventivosMes {
  programados: number      // solicitudes preventivo del mes
  aceptados: number
  ejecutados: number       // proyectos preventivo que ya pasaron por ejecutado
  enEjecucion: number      // proyectos preventivo activos en ejecución
  entregablesOk: number    // proyectos preventivo con 3/3
  pendientes: number       // preventivos del mes sin decidir
}

const POST_EJECUTADO = new Set([
  'ejecutado', 'entregado_cliente', 'soporte_recibido', 'enviado_a_facturacion',
  'facturado', 'pagado_cliente', 'liquidado_contratista', 'cerrado',
])

export function preventivosDelMes(solicitudes: Solicitud[], proyectos: Proyecto[], p: Periodo): PreventivosMes {
  const prevMes = solicitudes.filter(s => s.tipo === 'preventivo' && enPeriodo(s.fecha_creacion, p))
  const proyPrev = proyectos.filter(x => x.origen === 'preventivo')
  return {
    programados: prevMes.length,
    aceptados: prevMes.filter(s => s.estado === 'aceptada').length,
    pendientes: prevMes.filter(s => !['aceptada', 'descartada'].includes(s.estado)).length,
    ejecutados: proyPrev.filter(x => POST_EJECUTADO.has(x.estado)).length,
    enEjecucion: proyPrev.filter(x => x.estado === 'en_ejecucion').length,
    entregablesOk: proyPrev.filter(x =>
      ['inventario_antenas', 'linea_vida', 'torque'].every(
        k => x.entregables_ihs?.[k as keyof typeof x.entregables_ihs]?.estado === 'diligenciado')).length,
  }
}

// ── Donut operativo: los 15 estados agrupados en 5 categorías (activos) ──

export interface GrupoDonut { key: string; label: string; count: number }

export function gruposDonut(proyectos: Proyecto[]): GrupoDonut[] {
  const en = (estados: string[]) => proyectos.filter(p => estados.includes(p.estado)).length
  return [
    { key: 'planeacion', label: 'Planeación', count: en(['creado', 'contratista_asignado', 'permisos_en_tramite', 'preliquidacion_definida', 'preliquidacion_aprobada', 'anticipo_girado']) },
    { key: 'ejecucion', label: 'En ejecución', count: en(['en_ejecucion', 'ejecutado']) },
    { key: 'entregado', label: 'Entregado', count: en(['entregado_cliente']) },
    { key: 'soporte', label: 'Soporte', count: en(['soporte_recibido']) },
    { key: 'facturacion', label: 'A facturación', count: en(['enviado_a_facturacion']) },
  ]
}
