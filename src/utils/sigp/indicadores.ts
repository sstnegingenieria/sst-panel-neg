// Panel SIGP — indicadores de la Caracterización Integral del Área de
// Proyectos (evidencia ISO 9.1, seguimiento y medición).
//
// CAPA OFICIAL: 5 indicadores con fórmula, meta y semáforo según la
// caracterización (documento controlado). CAPA OPERATIVA: conteos de apoyo.
// Todo es cálculo PURO client-side sobre las colecciones existentes; los
// componentes solo pintan lo que sale de aquí.

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

/** Ind. 1 — cumplimiento del plan: meta 80–100 %. */
export const semaforoPlan = (v: number): Semaforo => (v >= 80 ? 'verde' : v >= 60 ? 'ambar' : 'rojo')
/** Ind. 2 y 4 — calidad / satisfacción (proyectos ≥4/5): meta ≥90 %. */
export const semaforoCalidad = (v: number): Semaforo => (v >= 90 ? 'verde' : v >= 75 ? 'ambar' : 'rojo')
/** Ind. 3 — proyección presupuestal: meta 90–110 % (desviación en ambas direcciones). */
export const semaforoPresupuesto = (v: number): Semaforo =>
  v >= 90 && v <= 110 ? 'verde' : (v >= 80 && v < 90) || (v > 110 && v <= 120) ? 'ambar' : 'rojo'
/** Ind. 5 — ambiental y SST: meta ≥95 %. */
export const semaforoSst = (v: number): Semaforo => (v >= 95 ? 'verde' : v >= 85 ? 'ambar' : 'rojo')

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
export function indPlanTrabajo(proyectos: Proyecto[]): ValorIndicador {
  const conPlan = proyectos.filter(p => GESTION_ACTIVA.has(p.estado) && (p.actividades_plan?.length ?? 0) > 0)
  const den = conPlan.reduce((s, p) => s + (p.actividades_plan?.length ?? 0), 0)
  if (den === 0) return sinDatos
  const num = conPlan.reduce((s, p) => s + (p.actividades_plan?.filter(a => a.ejecutada).length ?? 0), 0)
  const v = pct(num, den)
  return { valor: v, semaforo: semaforoPlan(v), numerador: num, denominador: den }
}

/** Ind. 2 — Calidad (calificación ≥4/5 en el acta de entrega), consolidado
 *  del periodo por fecha de entrega. */
export function indCalidad(proyectos: Proyecto[], p: Periodo): ValorIndicador {
  const entregados = proyectos.filter(x =>
    x.entrega?.calificacion_calidad != null && enPeriodo(x.entrega.fecha, p))
  if (entregados.length === 0) return sinDatos
  const ok = entregados.filter(x => (x.entrega!.calificacion_calidad ?? 0) >= 4).length
  const v = pct(ok, entregados.length)
  return { valor: v, semaforo: semaforoCalidad(v), numerador: ok, denominador: entregados.length }
}

/** Ind. 3 — Proyección presupuestal (corte actual sobre proyectos con costo
 *  ejecutado capturado): Σ ejecutado / Σ proyectado × 100. El proyectado es
 *  el valor de la cotización/matriz (snapshot.valor_venta). */
export function indPresupuesto(proyectos: Proyecto[]): ValorIndicador {
  const con = proyectos.filter(p => (p.preliquidacion?.costo_ejecutado ?? 0) > 0 && p.snapshot.valor_venta > 0)
  if (con.length === 0) return sinDatos
  const ejecutado = con.reduce((s, p) => s + (p.preliquidacion!.costo_ejecutado ?? 0), 0)
  const proyectado = con.reduce((s, p) => s + p.snapshot.valor_venta, 0)
  const v = pct(ejecutado, proyectado)
  return { valor: v, semaforo: semaforoPresupuesto(v), numerador: ejecutado, denominador: proyectado }
}

/** Ind. 4 — Satisfacción del cliente (encuestas ≥4/5), consolidado del
 *  periodo por fecha de la encuesta. */
export function indSatisfaccion(proyectos: Proyecto[], p: Periodo): ValorIndicador {
  const encuestas = proyectos.filter(x => x.evaluacion_cliente && enPeriodo(x.evaluacion_cliente.fecha, p))
  if (encuestas.length === 0) return sinDatos
  const ok = encuestas.filter(x => x.evaluacion_cliente!.satisfaccion >= 4).length
  const v = pct(ok, encuestas.length)
  return { valor: v, semaforo: semaforoCalidad(v), numerador: ok, denominador: encuestas.length }
}

/** Ind. 5 — Ambiental y SST: valor manual del periodo (proceso cruzado con el
 *  Panel SST; la integración automática es futura). */
export function indSst(valorManual: number | null): ValorIndicador {
  if (valorManual == null) return sinDatos
  return { valor: valorManual, semaforo: semaforoSst(valorManual), numerador: valorManual, denominador: 100 }
}

// ── CAPA OPERATIVA ──

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
