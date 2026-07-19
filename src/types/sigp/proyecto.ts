// Modelo del Proyecto (SIGP F2.1.a) — columna vertebral de Ejecución.
//
// Un proyecto NACE automáticamente al aprobar una cotización (1 proyecto por
// cotización, idempotente: el id del doc ES el id de la cotización de origen).
// El snapshot es COPIA de la versión aprobada — nunca referencia: si la
// cotización evolucionara después, el proyecto conserva lo pactado.
//
// En F2.1.a solo existe el estado inicial 'creado'; las transiciones las
// agregan F2.1.b (asignación), F2.1.c (preliquidación) y F2.1.d (ejecución).

import type { Timestamp } from 'firebase/firestore'
import { subtotalesPorGrupo, modoAgrupacionDe, actividadesDe, GRUPO_OTROS_ID } from './cotizacion'
import type { Cotizacion, VersionCotizacion, EsquemaTributario, TipoInversion } from './cotizacion'

// ── Estados (enum completo del ciclo de vida; ver capítulo 6 del CLAUDE.md) ──

export const ESTADOS_PROYECTO = [
  'creado',
  'contratista_asignado',
  'permisos_en_tramite',
  'preliquidacion_definida',
  'preliquidacion_aprobada',
  'anticipo_girado',
  'en_ejecucion',
  'ejecutado',
  'informe_entregado',
  'facturado',
  'pagado_cliente',
  'liquidado_contratista',
  'cerrado',
] as const

export type EstadoProyecto = (typeof ESTADOS_PROYECTO)[number]

export const ESTADO_PRY_LABEL: Record<EstadoProyecto, string> = {
  creado: 'Creado',
  contratista_asignado: 'Contratista asignado',
  permisos_en_tramite: 'Permisos en trámite',
  preliquidacion_definida: 'Preliquidación definida',
  preliquidacion_aprobada: 'Preliquidación aprobada',
  anticipo_girado: 'Anticipo girado',
  en_ejecucion: 'En ejecución',
  ejecutado: 'Ejecutado',
  informe_entregado: 'Informe entregado',
  facturado: 'Facturado',
  pagado_cliente: 'Pagado por el cliente',
  liquidado_contratista: 'Liquidado al contratista',
  cerrado: 'Cerrado',
}

// Semánticos de progreso (sin azules — manual de marca): grises al inicio,
// ámbar/amarillo en trámites, lima/verde en ejecución, esmeralda al cierre.
export const ESTADO_PRY_COLOR: Record<EstadoProyecto, string> = {
  creado: 'bg-gray-100 text-gray-700',
  contratista_asignado: 'bg-stone-200 text-stone-700',
  permisos_en_tramite: 'bg-amber-100 text-amber-800',
  preliquidacion_definida: 'bg-yellow-100 text-yellow-800',
  preliquidacion_aprobada: 'bg-lime-100 text-lime-800',
  anticipo_girado: 'bg-emerald-50 text-emerald-700',
  en_ejecucion: 'bg-brand-50 text-brand-700',
  ejecutado: 'bg-green-100 text-green-800',
  informe_entregado: 'bg-emerald-100 text-emerald-800',
  facturado: 'bg-orange-100 text-orange-800',
  pagado_cliente: 'bg-emerald-200 text-emerald-900',
  liquidado_contratista: 'bg-lime-200 text-lime-900',
  cerrado: 'bg-gray-200 text-gray-800',
}

// ── Asignación de contratista (F2.1.b) ──
//
// Evidencia ISO (9001 §8.4 / 45001 §8.1.4): al asignar se CONGELA el estado
// de habilitación del contratista (y su evaluación si el registro la tuviera)
// → prueba de que era un proveedor calificado en ese momento. El registro
// actual de `contratistas` solo tiene `estado: activo|inactivo` (la
// habilitación la administra Gestión Administrativa sobre ese campo); la
// evaluación formal vive en el SGI (FT Selección y Reevaluación de
// Proveedores). `evaluacion_snapshot` queda previsto para cuando el registro
// incorpore esos datos.

export interface AsignacionProyecto {
  contratista_id: string
  contratista_nombre: string           // SNAPSHOT — no referencia viva
  contratista_documento?: string       // NIT o cédula al momento de asignar
  habilitacion_snapshot: {
    estado: string                     // 'activo' = habilitado al asignar
    fuente: string                     // de dónde se leyó (trazabilidad)
    fecha_consulta: Timestamp
  }
  evaluacion_snapshot?: {
    puntaje?: number
    fecha?: Timestamp
    detalle?: string
  }
  asignado_por: string
  fecha: Timestamp
  nota_criterio?: string
}

/** Gate de asignación: solo contratistas HABILITADOS (estado activo). */
export const contratistaAsignable = (c: { estado?: string }) => c.estado === 'activo'

/**
 * Construye el snapshot de asignación (puro — testeable). Lanza si el
 * contratista no está habilitado: el gate no es solo de UI.
 */
export function construirAsignacion(
  contratista: { id: string; nombre: string; nit?: string; cedula?: string; estado: string },
  uid: string,
  fecha: Timestamp,
  notaCriterio?: string,
): AsignacionProyecto {
  if (!contratistaAsignable(contratista))
    throw new Error('Solo se pueden asignar contratistas habilitados (estado activo)')
  const documento = contratista.nit || contratista.cedula
  return {
    contratista_id: contratista.id,
    contratista_nombre: contratista.nombre,
    ...(documento ? { contratista_documento: documento } : {}),
    habilitacion_snapshot: {
      estado: contratista.estado,
      fuente: 'contratistas.estado — habilitación administrada por Gestión Administrativa',
      fecha_consulta: fecha,
    },
    asignado_por: uid,
    fecha,
    ...(notaCriterio?.trim() ? { nota_criterio: notaCriterio.trim() } : {}),
  }
}

// ── Permisos de ingreso (F2.1.b) ──

export const ESTADOS_PERMISOS = ['solicitado', 'aprobado', 'negado', 'no_requiere'] as const
export type EstadoPermisos = (typeof ESTADOS_PERMISOS)[number]

export const PERMISOS_LABEL: Record<EstadoPermisos, string> = {
  solicitado: 'Solicitado',
  aprobado: 'Aprobado',
  negado: 'Negado',
  no_requiere: 'No requiere',
}

export const PERMISOS_COLOR: Record<EstadoPermisos, string> = {
  solicitado: 'bg-amber-100 text-amber-800',
  aprobado: 'bg-emerald-100 text-emerald-800',
  negado: 'bg-red-100 text-red-700',
  no_requiere: 'bg-gray-100 text-gray-600',
}

export interface PermisosProyecto {
  estado: EstadoPermisos
  fecha_solicitud?: Timestamp
  fecha_respuesta?: Timestamp
  entidad_responsable?: string
  adjunto_url?: string
  adjunto_nombre?: string
  nota?: string
}

// ── Preliquidación (F2.1.c) ──
//
// Corazón financiero del proyecto: cuánto vale la venta (del snapshot, solo
// lectura), cuánto se le paga al contratista (tecleado) y qué utilidad queda.
// SEGREGACIÓN DE FUNCIONES: la define el área de proyectos; la APRUEBA y
// registra el anticipo SOLO gerencia_administrativa (quien define ≠ quien
// desembolsa). El pago del cliente y el saldo del contratista son F2.1.d.

export interface AnticipoGirado {
  fecha: Timestamp
  valor: number
  evidencia_url?: string
  evidencia_nombre?: string
  registrado_por: string
}

export interface PreliquidacionProyecto {
  /** Copiado del snapshot al definir (evidencia congelada, no editable). */
  valor_venta: number
  /** Total que NEG paga al contratista (acepta expresiones al teclear). */
  valor_contratista: number
  /** % de anticipo configurable por proyecto (default 50). */
  anticipo_pct: number
  /** Observación por ítem del alcance (keyed por claveItemAlcance). Opcional.
   *  Precisa de qué trata la actividad y dónde ejecutarla — SALE en el
   *  documento del contratista. */
  observaciones?: Record<string, string>
  definida_por: string
  fecha_definicion: Timestamp
  aprobada_por?: string
  fecha_aprobacion?: Timestamp
  anticipo?: AnticipoGirado
}

export const ANTICIPO_PCT_DEFAULT = 50

// Derivados (puros — precisión completa; el recorte a 2 decimales es solo de render)
export const utilidadDe = (p: Pick<PreliquidacionProyecto, 'valor_venta' | 'valor_contratista'>) =>
  p.valor_venta - p.valor_contratista
export const margenPctDe = (p: Pick<PreliquidacionProyecto, 'valor_venta' | 'valor_contratista'>) =>
  p.valor_venta > 0 ? (utilidadDe(p) / p.valor_venta) * 100 : 0
export const anticipoValorDe = (p: Pick<PreliquidacionProyecto, 'valor_contratista' | 'anticipo_pct'>) =>
  p.valor_contratista * (p.anticipo_pct / 100)
/** Palanca de margen tipo APU (misma convención del cotizador: margen = %
 *  de utilidad sobre el precio, aquí con el valor de venta como total):
 *  contratista = venta × (1 − margen/100). Inversa de margenPctDe. */
export const contratistaDesdeMargen = (valorVenta: number, margenPct: number) =>
  valorVenta * (1 - margenPct / 100)

/** Clave ESTABLE de un ítem del alcance para las observaciones: instancia_id
 *  (F1.5.2+); fallback a código o al índice dentro del snapshot congelado
 *  (versiones previas sin instancia_id). El snapshot es inmutable → el índice
 *  es estable. */
export const claveItemAlcance = (it: { instancia_id?: string; codigo?: string }, idx: number) =>
  it.instancia_id ?? (it.codigo?.trim() ? `cod:${it.codigo.trim()}:${idx}` : `idx:${idx}`)
export const saldoValorDe = (p: Pick<PreliquidacionProyecto, 'valor_contratista' | 'anticipo_pct'>) =>
  p.valor_contratista - anticipoValorDe(p)

// ── Documento ──

export interface EntradaHistorialProyecto {
  de?: EstadoProyecto          // ausente en la entrada de nacimiento
  a: EstadoProyecto
  por: string                  // uid
  fecha: Timestamp
  motivo?: string
}

/** Resumen del alcance por grupo (actividad o capítulo) de la versión aprobada. */
export interface AlcanceGrupo {
  grupo: string
  items: number
  subtotal: number             // antes de impuestos (Σ = costos directos)
}

/** COPIA de lo pactado en la versión aprobada — nunca referencia. */
export interface SnapshotProyecto {
  cliente: string              // nombre del cliente o prospecto
  cliente_nit?: string
  asunto: string
  contacto?: string
  valor_venta: number          // total de la versión aprobada (con impuestos)
  esquema_tributario: EsquemaTributario
  tipo_inversion?: TipoInversion
  alcance: AlcanceGrupo[]
  total_items: number
}

export interface Proyecto {
  id: string                   // = id de la cotización de origen (idempotencia 1:1)
  consecutivo: string          // PRY-YYYY-NNN (server-side, Cloud Function)
  origen: 'cotizacion'
  cotizacion_id: string
  cotizacion_consecutivo: string
  cotizacion_version: number   // versión APROBADA de la que se copió el snapshot
  cliente_id?: string
  prospecto_nombre?: string
  snapshot: SnapshotProyecto
  estado: EstadoProyecto
  asignacion?: AsignacionProyecto      // F2.1.b — congela la evidencia del proveedor
  permisos?: PermisosProyecto          // F2.1.b — permisos de ingreso
  preliquidacion?: PreliquidacionProyecto  // F2.1.c — definir → aprobar → anticipo
  historial: EntradaHistorialProyecto[]
  creado_por: string
  fecha_creacion: Timestamp
  fecha_actualizacion?: Timestamp
}

// ── Constructor del snapshot (puro — testeable sin Firestore) ──

/**
 * Construye el snapshot del proyecto a partir de la cotización y su versión
 * APROBADA. El alcance se resume por grupo con la MISMA fuente de agrupación
 * que el constructor y el PDF (`subtotalesPorGrupo`); los ítems huérfanos
 * caen en 'Otros' igual que allá.
 */
export function construirSnapshotProyecto(
  cotizacion: Pick<Cotizacion, 'asunto' | 'contacto' | 'tipo_inversion' | 'prospecto_nombre'>,
  version: Pick<VersionCotizacion, 'items' | 'totales' | 'esquema' | 'modo_agrupacion' | 'actividades' | 'agrupador'>,
  clienteNombre?: string,
  clienteNit?: string,
): SnapshotProyecto {
  const modo = modoAgrupacionDe(version)
  const actividades = actividadesDe(version)
  const grupos = subtotalesPorGrupo(version.items, modo, actividades)

  // Conteo de ítems por grupo con el MISMO mapeo de huérfanos que el PDF.
  const porGrupo = new Map<string, number>(grupos.map(g => [g.grupo_id, 0]))
  for (const it of version.items) {
    const id = modo === 'actividad'
      ? (it.actividad_id && porGrupo.has(it.actividad_id) ? it.actividad_id : GRUPO_OTROS_ID)
      : (it.capitulo?.trim() || GRUPO_OTROS_ID)
    porGrupo.set(id, (porGrupo.get(id) ?? 0) + 1)
  }

  return {
    cliente: clienteNombre ?? cotizacion.prospecto_nombre ?? '—',
    ...(clienteNit ? { cliente_nit: clienteNit } : {}),
    asunto: cotizacion.asunto ?? '',
    ...(cotizacion.contacto ? { contacto: cotizacion.contacto } : {}),
    valor_venta: version.totales.total,
    esquema_tributario: version.esquema,
    ...(cotizacion.tipo_inversion ? { tipo_inversion: cotizacion.tipo_inversion } : {}),
    alcance: grupos
      .filter(g => (porGrupo.get(g.grupo_id) ?? 0) > 0)
      .map(g => ({ grupo: g.grupo_nombre, items: porGrupo.get(g.grupo_id) ?? 0, subtotal: g.subtotal })),
    total_items: version.items.length,
  }
}
