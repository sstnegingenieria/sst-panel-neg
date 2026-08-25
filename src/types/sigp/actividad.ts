// MÓDULO DE ACTIVIDADES (F1 de la operación in-house) — modelo y builders.
//
// Entidad GENÉRICA a propósito: describe el modelo de operación (actividades
// de mantenimiento con dos hitos independientes), no a un cliente — nada de
// nombres de cliente en colecciones, campos ni reglas.
//
// Los DOS HITOS son independientes y sin secuencia obligatoria:
//   - aprobacion  (la decisión del gestor del cliente; la EVIDENCIA es la
//     referencia — correo/FAD/número —, no quién la teclea)
//   - ejecucion   (el trabajo hecho en campo)
// El camino normal aprueba antes de ejecutar; la emergencia ejecuta antes de
// aprobar. Ambos caben en la misma tabla de estados, sin ramificar.
//
// `estado` es DERIVADO y PERSISTIDO, mantenido por los builders en cada
// write (mismo patrón y misma razón que `activa` en Tareas: auto-sanador,
// consultable por campo único, la UI no improvisa writes).
import { Timestamp, deleteField } from 'firebase/firestore'
import type { LPU } from './lpu'

// ── Estados ──────────────────────────────────────────────────────────────────
export type EstadoActividad =
  | 'registrada'   // sin hitos
  | 'aprobada'     // aprobada, pendiente de ejecutar (camino normal)
  | 'ejecutada'    // ejecutada SIN aprobar (emergencia — pendiente para el acta)
  | 'completa'     // ambos hitos
  | 'anulada'      // terminal, soft (sin delete — restricción 5.1)

export const ESTADO_ACTIVIDAD_LABEL: Record<EstadoActividad, string> = {
  registrada: 'Registrada',
  aprobada: 'Aprobada',
  ejecutada: 'Ejecutada sin aprobar',
  completa: 'Completa',
  anulada: 'Anulada',
}

/** Colores por estado — semánticos, sin azules. */
export const ESTADO_ACTIVIDAD_COLOR: Record<EstadoActividad, string> = {
  registrada: 'bg-gray-100 text-gray-700',
  aprobada: 'bg-emerald-100 text-emerald-800',
  ejecutada: 'bg-amber-100 text-amber-800',
  completa: 'bg-brand-100 text-brand-800',
  anulada: 'bg-red-100 text-red-700',
}

// ── Modelo ───────────────────────────────────────────────────────────────────
export interface LineaActividad {
  /** Trazabilidad al LPU del ALCANCE de la actividad (cliente+contrato+
   *  naturaleza). Las líneas nacen SIEMPRE del LPU — códigos canónicos ANP,
   *  sin líneas manuales (el trabajo no previsto entra por origen_cantidad
   *  'negociada': ítem del LPU + valor acordado → cantidad despejada). */
  lpu_id: string
  lpu_item_id: string
  // Snapshot al insertar (regla 7.1). CONGELADOS desde que existe aprobación.
  codigo: string
  descripcion: string
  unidad: string
  valor_unitario: number
  cantidad: number
  /** 'medida' = medida en campo · 'negociada' = valor acordado con el
   *  cliente, cantidad despejada (valor / valor_unitario). */
  origen_cantidad: 'medida' | 'negociada'
  total: number   // derivado: round(cantidad × valor_unitario)
}

export interface HitoAprobacion {
  fecha: Timestamp
  por: string          // quién REGISTRÓ (traza) — la decisión es del cliente
  referencia?: string  // correo / FAD / número — la EVIDENCIA de la aprobación
  /** 🧊 EVIDENCIA CONGELADA (F1.2 §6d, obligatoria por Giovanny): consecutivo
   *  y versión de la propuesta VIGENTES al marcar la aprobación — responde
   *  "¿qué documento aprobó el gestor?" sin depender de que nadie re-emita
   *  después (el conjunto de una propuesta cambia entre rondas). INMUTABLE
   *  como todo hito. Ausente si se aprobó sin propuesta (emergencia) —
   *  ausencia honesta, no un dato inventado. */
  propuesta_ref?: { consecutivo: string; version: number }
}

export interface HitoEjecucion {
  fecha: Timestamp
  por: string
  nota?: string
}

export interface EntradaHistorialActividad {
  fecha: Timestamp
  por: string
  accion: string
}

export interface Actividad {
  id: string
  cliente_id: string            // eje de esResidenteDe
  sede_id?: string
  sede_nombre: string           // denormalizado (editar la sede no reescribe historia)
  zona?: string                 // denormalizada de la sede
  contrato: string              // del vocabulario Cliente.contratos
  naturaleza: 'opex' | 'capex'
  descripcion: string
  solicitante?: string          // de Cliente.contactos_solicitantes
  referencia_cliente?: string   // código/radicado del cliente (libre, buscable)
  fecha_solicitud?: Timestamp
  aprobacion?: HitoAprobacion | null
  ejecucion?: HitoEjecucion | null
  /** F1.2 — PUNTERO VIVO a la propuesta económica que la CUBRE HOY (doc de la
   *  versión VIGENTE; se re-apunta en el batch del swap al re-emitir; se
   *  limpia si la actividad sale del conjunto). Pregunta distinta de "qué me
   *  aprobó" — esa evidencia vive congelada en aprobacion.propuesta_ref. */
  propuesta_id?: string
  /** Consecutivo PEA de la serie — NO cambia dentro de la serie (mismo PEA
   *  por negociación), por eso apunta bien tras re-emitir por construcción. */
  propuesta_consecutivo?: string
  lineas: LineaActividad[]
  total: number                 // derivado persistido (Σ líneas)
  estado: EstadoActividad       // derivado persistido (builders)
  anulacion?: { fecha: Timestamp, por: string, motivo: string }
  historial: EntradaHistorialActividad[]
  creada_por: string
  fecha_creacion: Timestamp
  fecha_actualizacion?: Timestamp
}

// ── Derivaciones puras ───────────────────────────────────────────────────────
/** Tabla de los dos hitos → estado. `anulada` se maneja aparte (terminal). */
export function estadoDe(a: Pick<Actividad, 'aprobacion' | 'ejecucion' | 'anulacion'>): EstadoActividad {
  if (a.anulacion) return 'anulada'
  const apr = !!a.aprobacion
  const eje = !!a.ejecucion
  if (apr && eje) return 'completa'
  if (apr) return 'aprobada'
  if (eje) return 'ejecutada'
  return 'registrada'
}

export function totalLineas(lineas: LineaActividad[]): number {
  return lineas.reduce((s, l) => s + (l.total || 0), 0)
}

export function estaValorizada(a: Pick<Actividad, 'lineas' | 'total'>): boolean {
  return a.lineas.length > 0 && a.total > 0
}

/** LA LISTA DE ORO — "PENDIENTE PARA EL ACTA": tiene ejecución y le falta la
 *  aprobación O la valorización (una `completa` sin líneas tampoco entra al
 *  acta). ⚠ ENCUADRE (corrección de Giovanny, 18-ago-2026): estar aquí es
 *  NORMAL, no plata en riesgo — una actividad en ejecución o pendiente de
 *  socializar con el gestor simplemente pasa al acta del mes siguiente. Lo
 *  que sí se pierde es la que envejece sin resolverse: por eso lo que se
 *  vigila es la ANTIGÜEDAD (pendienteDesde/diasPendiente + umbral), no la
 *  pertenencia a la lista. Derivado de LECTURA (no persiste: `estado` ya se
 *  consulta por campo único y este predicado filtra client-side). */
export function pendienteParaActa(a: Pick<Actividad, 'aprobacion' | 'ejecucion' | 'anulacion' | 'lineas' | 'total'>): boolean {
  if (a.anulacion || !a.ejecucion) return false
  return !a.aprobacion || !estaValorizada(a)
}

/** Días pendiente que se consideran normales dentro del ciclo mensual del
 *  acta: pasado este umbral la actividad se destaca en la UI — "ejecutada
 *  hace cuatro días es normal; hace tres meses y sin aprobar es lo que hoy
 *  se pierde" (Giovanny). Un ciclo de acta es mensual; 30 días pendiente
 *  significa que ya dejó pasar un corte sin resolverse. */
export const UMBRAL_PENDIENTE_ACTA_DIAS = 30

type ActividadParaAntiguedad = Pick<Actividad, 'aprobacion' | 'ejecucion' | 'anulacion' | 'lineas' | 'total' | 'fecha_creacion'>

/** Desde cuándo está pendiente para el acta: el hecho MÁS VIEJO que la dejó
 *  en la lista. Hoy ese hecho es siempre la ejecución (es lo que la mete);
 *  si mañana hubiera más hechos habilitantes se tomaría el mínimo entre
 *  ellos. Fallback defensivo a fecha_creacion si el hito no trae fecha. */
export function pendienteDesde(a: ActividadParaAntiguedad): Timestamp | null {
  if (!pendienteParaActa(a)) return null
  const fechas = [a.ejecucion?.fecha].filter((f): f is Timestamp => !!f)
  if (fechas.length === 0) return a.fecha_creacion ?? null
  return fechas.reduce((m, f) => (f.toMillis() < m.toMillis() ? f : m))
}

/** Días completos pendiente para el acta (0 = hoy). Null si no está pendiente. */
export function diasPendiente(a: ActividadParaAntiguedad, ahora: Date): number | null {
  const desde = pendienteDesde(a)
  if (!desde) return null
  return Math.max(0, Math.floor((ahora.getTime() - desde.toMillis()) / 86_400_000))
}

// ── REGLA DEL ACTA (decisión de Giovanny para el diseño de F2, 18-ago-2026) ──
// La actividad entra al acta del mes en que queda COMPLETA (aprobada Y
// ejecutada) — no del mes en que se ejecutó. Eso resuelve el arrastre entre
// meses: lo que no alcanza el corte simplemente cae en el acta siguiente,
// sin nada especial que hacer. F2 debe implementar el corte con esta regla.

/** Congelamiento: desde que existe aprobación, código/descripción/unidad/
 *  valor_unitario y el conjunto de líneas quedan inmutables — solo cantidad
 *  y origen_cantidad siguen editables (la emergencia ajusta al aprobar). */
export function lineasCongeladas(a: Pick<Actividad, 'aprobacion'>): boolean {
  return !!a.aprobacion
}

// ── Alcance ──────────────────────────────────────────────────────────────────
/** El sistema IMPIDE cruzar el alcance (no lo advierte): una línea solo puede
 *  provenir de la LPU vigente del alcance exacto de la actividad. */
export function lpuValidaParaActividad(
  lpu: Pick<LPU, 'cliente_id' | 'contrato' | 'naturaleza' | 'estado'>,
  act: Pick<Actividad, 'cliente_id' | 'contrato' | 'naturaleza'>,
): boolean {
  return lpu.estado === 'vigente'
    && lpu.cliente_id === act.cliente_id
    && (lpu.contrato ?? '') === act.contrato
    && (lpu.naturaleza ?? '') === act.naturaleza
}

// ── Builders de líneas ───────────────────────────────────────────────────────
export interface ItemLpuParaLinea {
  id: string
  codigo: string
  descripcion: string
  unidad: string
  valor_unitario: number
}

/** Línea con cantidad MEDIDA (o negociada por cantidad directa). */
export function construirLinea(
  lpu: Pick<LPU, 'id' | 'cliente_id' | 'contrato' | 'naturaleza' | 'estado'>,
  item: ItemLpuParaLinea,
  cantidad: number,
  origen: 'medida' | 'negociada',
  act: Pick<Actividad, 'cliente_id' | 'contrato' | 'naturaleza'>,
): LineaActividad | null {
  if (!lpuValidaParaActividad(lpu, act)) return null      // alcance cruzado: NO
  if (!(cantidad > 0) || !(item.valor_unitario > 0)) return null
  return {
    lpu_id: lpu.id, lpu_item_id: item.id,
    codigo: item.codigo, descripcion: item.descripcion, unidad: item.unidad,
    valor_unitario: item.valor_unitario,
    cantidad, origen_cantidad: origen,
    total: Math.round(cantidad * item.valor_unitario),
  }
}

/** Trabajo NO PREVISTO: ítem del LPU + valor acordado → cantidad DESPEJADA
 *  (lo que hoy hacen a mano con quince decimales). El total es el valor
 *  acordado redondeado a peso; la cantidad conserva la precisión completa. */
export function construirLineaNegociada(
  lpu: Pick<LPU, 'id' | 'cliente_id' | 'contrato' | 'naturaleza' | 'estado'>,
  item: ItemLpuParaLinea,
  valorAcordado: number,
  act: Pick<Actividad, 'cliente_id' | 'contrato' | 'naturaleza'>,
): LineaActividad | null {
  if (!lpuValidaParaActividad(lpu, act)) return null
  if (!(valorAcordado > 0) || !(item.valor_unitario > 0)) return null
  const cantidad = valorAcordado / item.valor_unitario
  return {
    lpu_id: lpu.id, lpu_item_id: item.id,
    codigo: item.codigo, descripcion: item.descripcion, unidad: item.unidad,
    valor_unitario: item.valor_unitario,
    cantidad, origen_cantidad: 'negociada',
    total: Math.round(valorAcordado),
  }
}

// ── Patch builders (validan y devuelven el write exacto, o null) ────────────
type PatchActividad = Record<string, unknown> | null

const conDerivados = (base: Record<string, unknown>, a: Actividad, lineas?: LineaActividad[]): Record<string, unknown> => {
  const ls = lineas ?? a.lineas
  const preview = { ...a, ...base, lineas: ls } as Actividad
  return {
    ...base,
    ...(lineas ? { lineas: ls, total: totalLineas(ls) } : {}),
    estado: estadoDe(preview),
  }
}

/** Marca el hito de APROBACIÓN. Congela las líneas de ahí en adelante.
 *  `propuestaRef` congela la evidencia documental (§6d): la vigente EN ESE
 *  MOMENTO — el caller la resuelve con propuestaVigenteDe(). */
export function patchAprobar(
  a: Actividad, por: string, fecha: Timestamp, referencia?: string,
  propuestaRef?: { consecutivo: string; version: number },
): PatchActividad {
  if (a.anulacion || a.aprobacion) return null
  const aprobacion: HitoAprobacion = {
    fecha, por,
    ...(referencia?.trim() ? { referencia: referencia.trim() } : {}),
    ...(propuestaRef ? { propuesta_ref: { consecutivo: propuestaRef.consecutivo, version: propuestaRef.version } } : {}),
  }
  return conDerivados({ aprobacion }, { ...a, aprobacion })
}

/** F1.2 — fija el puntero vivo a la propuesta que cubre la actividad (al
 *  emitir/re-emitir; va DENTRO del batch atómico del swap). */
export function patchVincularPropuesta(a: Pick<Actividad, 'anulacion'>, propuestaId: string, consecutivo: string): PatchActividad {
  if (a.anulacion || !propuestaId || !consecutivo) return null
  return { propuesta_id: propuestaId, propuesta_consecutivo: consecutivo }
}

/** F1.2 — limpia el puntero vivo (la actividad salió del conjunto en una
 *  re-emisión). La evidencia congelada del hito NO se toca — es inmutable. */
export function patchDesvincularPropuesta(a: Pick<Actividad, 'propuesta_id' | 'propuesta_consecutivo'>): PatchActividad {
  if (!a.propuesta_id && !a.propuesta_consecutivo) return null
  return { propuesta_id: deleteField(), propuesta_consecutivo: deleteField() }
}

/** Marca el hito de EJECUCIÓN (normal tras aprobar, o emergencia primero). */
export function patchEjecutar(a: Actividad, por: string, fecha: Timestamp, nota?: string): PatchActividad {
  if (a.anulacion || a.ejecucion) return null
  const ejecucion: HitoEjecucion = { fecha, por, ...(nota?.trim() ? { nota: nota.trim() } : {}) }
  return conDerivados({ ejecucion }, { ...a, ejecucion })
}

/** Reemplaza el conjunto de líneas. RECHAZADO si están congeladas y el patch
 *  toca algo más que cantidad/origen_cantidad de líneas existentes. */
export function patchLineas(a: Actividad, nuevas: LineaActividad[]): PatchActividad {
  if (a.anulacion) return null
  if (lineasCongeladas(a)) {
    // Congeladas: mismo conjunto (por lpu_item_id y orden), snapshot intacto;
    // solo cantidad/origen_cantidad/total pueden diferir.
    if (nuevas.length !== a.lineas.length) return null
    for (let i = 0; i < nuevas.length; i++) {
      const v = a.lineas[i], n = nuevas[i]
      if (n.lpu_id !== v.lpu_id || n.lpu_item_id !== v.lpu_item_id
        || n.codigo !== v.codigo || n.descripcion !== v.descripcion
        || n.unidad !== v.unidad || n.valor_unitario !== v.valor_unitario) return null
      if (n.total !== Math.round(n.cantidad * n.valor_unitario)) return null
    }
  }
  return conDerivados({}, a, nuevas)
}

/** Anulación soft, terminal, con motivo. */
export function patchAnular(a: Actividad, por: string, fecha: Timestamp, motivo: string): PatchActividad {
  if (a.anulacion || !motivo.trim()) return null
  const anulacion = { fecha, por, motivo: motivo.trim() }
  return conDerivados({ anulacion }, { ...a, anulacion })
}

/** Edición de cabecera. GATE AFINADO (F1.4, decisión de Giovanny 19-ago):
 *  - Campos DESCRIPTIVOS (descripción/sede/zona/solicitante/referencia/fecha):
 *    editables incluso DESPUÉS de aprobar — corregir un dato mal escrito es
 *    legítimo y el historial deja el rastro. Solo la anulación los congela.
 *  - El ALCANCE (contrato/naturaleza) determina el PRECIO: congela con la
 *    aprobación (como las líneas) y NO se edita por aquí con líneas cargadas
 *    (pertenecen a la LPU del alcance) — para cambiarlo borrando las líneas
 *    está patchCambiarAlcance, con confirmación explícita en la UI. Defensa
 *    en profundidad: el builder no confía en que la UI oculte los campos. */
export function patchCabecera(
  a: Actividad,
  campos: Partial<Pick<Actividad, 'descripcion' | 'sede_id' | 'sede_nombre' | 'zona' | 'solicitante' | 'referencia_cliente' | 'fecha_solicitud' | 'contrato' | 'naturaleza'>>,
): PatchActividad {
  if (a.anulacion) return null
  const tocaAlcance = ('contrato' in campos && campos.contrato !== a.contrato)
    || ('naturaleza' in campos && campos.naturaleza !== a.naturaleza)
  if (tocaAlcance && (a.lineas.length > 0 || a.aprobacion)) return null
  return conDerivados({ ...campos }, a)
}

/** Resumen textual de líneas para el HISTORIAL (cero borrado físico, regla
 *  5.1): si un cambio de alcance las borra, su contenido — códigos,
 *  cantidades, valores — queda en la traza y se puede reconstruir sin
 *  memoria. Valores crudos a propósito (precisión completa, auditable). */
export function resumenLineas(lineas: LineaActividad[]): string {
  if (lineas.length === 0) return 'sin líneas'
  return lineas
    .map(l => `${l.codigo} "${l.descripcion}" ${l.cantidad} ${l.unidad} × $${l.valor_unitario} = $${l.total} (${l.origen_cantidad})`)
    .join(' · ')
}

/** Cambia el ALCANCE (contrato/naturaleza) BORRANDO las líneas cargadas —
 *  pertenecen a la lista de precios del alcance anterior. Solo mientras NO
 *  esté aprobada (el alcance determina el precio: congela con la aprobación,
 *  como las líneas) ni anulada; null si nada cambia. La UI DEBE confirmar
 *  explícitamente qué se pierde y guardar resumenLineas() de las borradas en
 *  el historial (cero borrado físico). */
export function patchCambiarAlcance(
  a: Actividad,
  alcance: { contrato: string; naturaleza: 'opex' | 'capex' },
): PatchActividad {
  if (a.anulacion || a.aprobacion) return null
  if (alcance.contrato === a.contrato && alcance.naturaleza === a.naturaleza) return null
  return conDerivados({ contrato: alcance.contrato, naturaleza: alcance.naturaleza }, a, [])
}
