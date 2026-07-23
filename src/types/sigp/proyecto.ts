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

// Los estados desde 'facturado' pertenecen al MÓDULO FUTURO de Gerencia
// Administrativa (facturación, pago del cliente, saldo al contratista con su
// gate de pago-cliente-primero). Gerencia de Proyectos llega HASTA
// 'enviado_a_facturacion' (handoff).
export const ESTADOS_PROYECTO = [
  'creado',
  'contratista_asignado',
  'permisos_en_tramite',
  'preliquidacion_definida',
  'preliquidacion_aprobada',
  'anticipo_girado',
  'en_ejecucion',
  'ejecutado',
  'entregado_cliente',
  'soporte_recibido',
  'enviado_a_facturacion',
  'facturado',
  'pagado_cliente',
  'liquidado_contratista',
  'cerrado',
] as const

/** Primer estado del tramo de Gerencia Administrativa (módulo futuro). */
export const ESTADO_INICIO_ADMINISTRATIVA: (typeof ESTADOS_PROYECTO)[number] = 'facturado'

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
  entregado_cliente: 'Entregado al cliente',
  soporte_recibido: 'Soporte recibido',
  enviado_a_facturacion: 'Enviado a facturación',
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
  entregado_cliente: 'bg-emerald-50 text-emerald-700',
  soporte_recibido: 'bg-emerald-100 text-emerald-800',
  enviado_a_facturacion: 'bg-gray-200 text-gray-700',
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
  /** Respaldo controlado (23-jul): cuando aprueba alguien distinto de
   *  gerencia_administrativa (gerencia_general/gestion_integral/admin), la
   *  SALVEDAD es obligatoria — por qué no aprobó la titular. Ausente cuando
   *  aprueba la titular. La regla de Firestore la exige. */
  salvedad?: string
  anticipo?: AnticipoGirado
  /** Indicador ISO 3 (proyección presupuestal): costo EJECUTADO real del
   *  proyecto (el proyectado es el valor de la cotización/matriz). Se captura
   *  al cierre de la ejecución. Meta: ejecutado/proyectado en 90–110 %. */
  costo_ejecutado?: number
  /** Hotfix 23-jul — una corrección hecha durante la EJECUCIÓN (tramo
   *  en_ejecucion…enviado_a_facturacion) no exige re-aprobación ni frena el
   *  proyecto: queda marcada aquí y la RECONCILIA Gerencia Administrativa en
   *  la LIQUIDACIÓN (Bloque 3 del módulo administrativo), viendo la
   *  preliquidación + los ajustes con su justificación + el costo real. */
  ajuste_pendiente_liquidacion?: boolean
}

// ── Módulo Gerencia Administrativa · Bloque 1 (22-jul-2026) ──────────────────
//
// El SIGP REGISTRA y controla — NO ejecuta dinero ni genera factura
// electrónica (eso vive en los sistemas externos del área). La factura se
// registra como evidencia y dispara enviado_a_facturacion → facturado.

/** Registro de la factura emitida (en el sistema contable externo). */
export interface FacturacionProyecto {
  numero: string               // número de la factura (del sistema externo)
  fecha: Timestamp             // fecha de emisión
  valor: number                // valor facturado
  cufe?: string                // CUFE de la factura electrónica (opcional)
  adjunto_url?: string         // PDF de la factura (opcional, Storage)
  adjunto_nombre?: string
  registrado_por: string
  fecha_registro: Timestamp
}

// Administrativa · Bloque 2 (22-jul-2026) — pago del cliente.
// Supuesto ACTUAL (moldeable): UN pago total. Si el área confirma pagos
// parciales, un bloque futuro agrega `abonos[]` y este registro pasa a ser
// el consolidado — la forma de objeto único no estorba esa extensión.

export const MEDIOS_PAGO = ['transferencia', 'cheque', 'consignacion', 'otro'] as const
export type MedioPago = (typeof MEDIOS_PAGO)[number]
export const MEDIO_PAGO_LABEL: Record<MedioPago, string> = {
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  consignacion: 'Consignación',
  otro: 'Otro',
}

/** Registro del pago recibido del cliente (el dinero se mueve en bancos —
 *  el SIGP solo REGISTRA la evidencia). */
export interface PagoClienteProyecto {
  fecha: Timestamp             // fecha del pago
  valor: number
  medio: MedioPago
  comprobante_url?: string     // comprobante (opcional, Storage)
  comprobante_nombre?: string
  registrado_por: string
  fecha_registro: Timestamp
}

// ── Liquidación del contratista (Administrativa · Bloque 3b, 23-jul-2026) ────
//
// Cierra el ciclo: tras el pago del cliente y con el gate SST en 'al_dia',
// Gerencia Administrativa concilia lo pactado con la realidad y liquida.
// MODELO NEG: la preliquidación (`valor_contratista`) es MANO DE OBRA (NEG
// compra los materiales); las compras que hace el contratista y NEG le
// reconoce van en LÍNEA PROPIA (`compras_reembolsos`), separada de la mano
// de obra. El SIGP registra/controla — no ejecuta dinero.

/** Compra/reembolso reconocido al contratista. La capturan los GESTORES
 *  durante el proyecto (con traza en historial); la reconoce la liquidación. */
export interface CompraReembolso {
  concepto: string
  valor: number
  soporte_url?: string         // factura/recibo (opcional, Storage)
  soporte_nombre?: string
  registrado_por: string
  fecha: Timestamp
}

/** Deducción de la liquidación. Estructura MOLDEABLE a propósito: los tipos
 *  de retención (garantía, ReteICA, etc.) se definen con el área — por ahora
 *  concepto libre + valor, lista normalmente vacía. NO cablear tipos aún. */
export interface RetencionLiquidacion {
  concepto: string
  valor: number
}

/** Registro de la liquidación (evidencia del cierre financiero con el
 *  contratista). `diferencia` = total_final − mano de obra VIGENTE: las
 *  correcciones de ejecución ya viven dentro de la mano de obra con su traza
 *  (se listan como `ajustes_reconocidos`); el delta restante son las
 *  compras/reembolsos. */
export interface LiquidacionProyecto {
  /** Mano de obra vigente al liquidar (= preliquidacion.valor_contratista). */
  mano_obra: number
  /** Snapshot de las compras/reembolsos reconocidos. */
  compras_reembolsos: CompraReembolso[]
  /** Motivos de los ajustes en ejecución reconciliados aquí (del historial). */
  ajustes_reconocidos: string[]
  retenciones: RetencionLiquidacion[]
  total_final: number          // mano_obra + Σ compras_reembolsos
  diferencia: number           // total_final − mano_obra (Σ compras)
  es_igual: boolean            // sin compras y sin ajustes → igual a la preliquidación
  anticipo_girado: number      // el giro REAL descontado
  saldo_final: number          // total_final − anticipo_girado − Σ retenciones
  liquidada_por: string
  fecha: Timestamp
  observaciones?: string
}

export const totalComprasReembolsos = (compras?: CompraReembolso[]): number =>
  (compras ?? []).reduce((s, c) => s + (c.valor || 0), 0)

export const totalRetenciones = (retenciones?: RetencionLiquidacion[]): number =>
  (retenciones ?? []).reduce((s, r) => s + (r.valor || 0), 0)

/** Total contratista final = mano de obra + Σ compras/reembolsos. */
export const totalContratistaFinal = (manoObra: number, compras?: CompraReembolso[]): number =>
  manoObra + totalComprasReembolsos(compras)

/** Saldo final = total final − anticipo GIRADO real − Σ retenciones.
 *  Puede ser negativo (sobre-giro) — jamás se recorta en silencio. */
export const saldoFinalLiquidacion = (
  totalFinal: number, anticipoGirado: number, retenciones?: RetencionLiquidacion[],
): number => totalFinal - anticipoGirado - totalRetenciones(retenciones)

/** ¿Liquidable en este estado? Solo tras el pago del cliente (el gate SST
 *  'al_dia' se exige aparte — regla viva en prod vía get(verificaciones_sst)). */
export const puedeLiquidarseEn = (estado: EstadoProyecto): boolean =>
  estado === 'pagado_cliente'

/** Entradas del historial que son ajustes de ejecución pendientes de
 *  reconocer (Hotfix 23-jul los marca con este texto en el motivo). */
export const esAjusteEnEjecucion = (motivo: string): boolean =>
  motivo.includes('AJUSTE en ejecución')

/** Atribución del ORIGEN de la diferencia para el sello del documento y la
 *  UI. La `diferencia` numérica son SOLO las compras (los ajustes de mano de
 *  obra ya viven dentro del valor vigente con su traza) — el sello no debe
 *  decir "por compras/reembolsos" cuando además (o solo) hubo un ajuste. */
export const origenDiferenciaLiquidacion = (
  diferenciaCompras: number, numAjustes: number,
): 'igual' | 'compras' | 'ajustes' | 'compras_y_ajustes' => {
  if (diferenciaCompras === 0 && numAjustes === 0) return 'igual'
  if (diferenciaCompras !== 0 && numAjustes > 0) return 'compras_y_ajustes'
  return diferenciaCompras !== 0 ? 'compras' : 'ajustes'
}

// ── Bandeja "Gestión Administrativa" (23-jul-2026) ───────────────────────────
//
// Gerencia ve TODO su ciclo en un solo lugar: los 7 momentos donde actúa (o
// consulta). Los estados intermedios de EJECUCIÓN (anticipo_girado …
// soporte_recibido) son del área de proyectos y NO aparecen en su bandeja.

export const SECCIONES_ADMINISTRATIVA = [
  { clave: 'por_aprobar', etiqueta: 'Por aprobar', estado: 'preliquidacion_definida' },
  { clave: 'por_anticipo', etiqueta: 'Por girar anticipo', estado: 'preliquidacion_aprobada' },
  { clave: 'por_facturar', etiqueta: 'Por facturar', estado: 'enviado_a_facturacion' },
  { clave: 'por_cobrar', etiqueta: 'Por cobrar', estado: 'facturado' },
  { clave: 'por_liquidar', etiqueta: 'Por liquidar', estado: 'pagado_cliente' },
  { clave: 'por_cerrar', etiqueta: 'Por cerrar', estado: 'liquidado_contratista' },
  { clave: 'cerrados', etiqueta: 'Cerrados / Histórico', estado: 'cerrado' },
] as const satisfies readonly { clave: string; etiqueta: string; estado: EstadoProyecto }[]

export const enBandejaAdministrativa = (estado: EstadoProyecto): boolean =>
  SECCIONES_ADMINISTRATIVA.some(s => s.estado === estado)

// ── Cierre del proyecto (Administrativa · Bloque final, 23-jul-2026) ─────────
//
// Último paso del ciclo: tras liquidar al contratista, gerencia formaliza el
// cierre. Un proyecto `cerrado` es SOLO LECTURA (UI y reglas: inmutable).

export interface CierreProyecto {
  fecha: Timestamp
  cerrado_por: string
  /** Notas de cierre / lecciones aprendidas (opcional — buen gesto ISO). */
  notas?: string
}

/** ¿Cerrable en este estado? Solo tras liquidar al contratista. */
export const puedeCerrarseEn = (estado: EstadoProyecto): boolean =>
  estado === 'liquidado_contratista'

/** Resumen de COMPLETITUD del cierre (informativo, no bloquea): qué evidencia
 *  del ciclo quedó capturada. La satisfacción del cliente pendiente se
 *  ofrece capturar — jamás bloquea el cierre. */
export const completitudCierre = (
  p: Pick<Proyecto, 'facturacion' | 'pago_cliente' | 'liquidacion' | 'evaluacion_contratista' | 'evaluacion_cliente'>,
): { clave: string; etiqueta: string; ok: boolean }[] => [
  { clave: 'facturacion', etiqueta: 'Factura registrada', ok: !!p.facturacion },
  { clave: 'pago_cliente', etiqueta: 'Pago del cliente registrado', ok: !!p.pago_cliente },
  { clave: 'liquidacion', etiqueta: 'Contratista liquidado', ok: !!p.liquidacion },
  { clave: 'evaluacion_contratista', etiqueta: 'Evaluación del contratista', ok: !!p.evaluacion_contratista },
  { clave: 'evaluacion_cliente', etiqueta: 'Satisfacción del cliente', ok: !!p.evaluacion_cliente },
]

// ── Gate SST (Administrativa · Bloque 3a, 23-jul-2026) ───────────────────────
//
// Antes de LIQUIDAR (pagar el saldo al contratista), SST confirma que el
// contratista está "al día en formatos" de esa obra. El criterio de "al día"
// es MANUAL de SST (no se cablea). Gate NO esquivable: la regla de Firestore
// (escrita para el Bloque 3b) impide pasar a `liquidado_contratista` sin
// `sst_gate.estado == 'al_dia'`.

export const ESTADOS_SST_GATE = ['pendiente', 'al_dia', 'con_novedad'] as const
export type EstadoSstGate = (typeof ESTADOS_SST_GATE)[number]

export const SST_GATE_LABEL: Record<EstadoSstGate, string> = {
  pendiente: 'Pendiente de SST',
  al_dia: 'Al día (SST)',
  con_novedad: 'Con novedad (SST)',
}
export const SST_GATE_COLOR: Record<EstadoSstGate, string> = {
  pendiente: 'bg-gray-100 text-gray-600',
  al_dia: 'bg-emerald-100 text-emerald-800',
  con_novedad: 'bg-red-100 text-red-700',
}

export interface SstGateProyecto {
  estado: EstadoSstGate
  verificado_por: string
  fecha: Timestamp
  observacion?: string         // obligatoria cuando hay novedad
}

/** Estado efectivo del gate (ausente = pendiente). Opera sobre cualquier
 *  portador del gate — hoy, la proyección `verificaciones_sst`. */
export const estadoSstGate = (p: { sst_gate?: SstGateProyecto }): EstadoSstGate =>
  p.sst_gate?.estado ?? 'pendiente'

/** ¿SST avaló? — condición para liquidar al contratista (Bloque 3b). */
export const sstGateAlDia = (p: { sst_gate?: SstGateProyecto }): boolean =>
  estadoSstGate(p) === 'al_dia'

/** Cola de verificación SST: proyectos ejecutados que ya están en el tramo
 *  administrativo previo a la liquidación. */
export const enColaVerificacionSst = (estado: EstadoProyecto): boolean =>
  estado === 'facturado' || estado === 'pagado_cliente'

/** ¿El proyecto pertenece a la bandeja de Facturación y Pagos? (desde el
 *  handoff en adelante — territorio del módulo administrativo). */
export const enBandejaFacturacion = (estado: EstadoProyecto): boolean => {
  const i = ESTADOS_PROYECTO.indexOf(estado)
  return i >= 0 && i >= ESTADOS_PROYECTO.indexOf('enviado_a_facturacion')
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

// ── Corrección de preliquidación (Bloque 4 — ISO 7.5, cambios controlados) ──

/** Diferencia entre la preliquidación vigente y la corrección propuesta. */
export interface CambioPreliquidacion {
  campo: 'valor_contratista' | 'anticipo_pct'
  antes: number
  despues: number
}

/** Solo los campos corregibles; vacío = sin cambios (no se persiste nada). */
export function cambiosPreliquidacion(
  antes: Pick<PreliquidacionProyecto, 'valor_contratista' | 'anticipo_pct'>,
  despues: { valor_contratista: number; anticipo_pct: number },
): CambioPreliquidacion[] {
  const out: CambioPreliquidacion[] = []
  if (antes.valor_contratista !== despues.valor_contratista)
    out.push({ campo: 'valor_contratista', antes: antes.valor_contratista, despues: despues.valor_contratista })
  if (antes.anticipo_pct !== despues.anticipo_pct)
    out.push({ campo: 'anticipo_pct', antes: antes.anticipo_pct, despues: despues.anticipo_pct })
  return out
}

/** ¿En este estado se puede corregir la preliquidación? Desde que existe
 *  (definida) hasta el handoff a facturación inclusive — el caso real del
 *  piloto: el error se descubre al digitar el costo REAL, que ocurre al
 *  cierre de la ejecución (Hotfix 23-jul). Desde `facturado` es territorio
 *  administrativo y la corrección del contratista se verá allí si el área
 *  la pide. */
export const puedeCorregirPreliquidacionEn = (estado: EstadoProyecto): boolean => {
  const i = ESTADOS_PROYECTO.indexOf(estado)
  return i >= ESTADOS_PROYECTO.indexOf('preliquidacion_definida') &&
         i <= ESTADOS_PROYECTO.indexOf('enviado_a_facturacion')
}

/** ¿Corregir desde este estado obliga a revertir el ESTADO a
 *  `preliquidacion_definida` y re-aprobar? Solo aprobada/anticipo_girado
 *  (aún no hay ejecución que perder) — comportamiento del Bloque 4. */
export const correccionRevierteAprobacion = (estado: EstadoProyecto): boolean =>
  estado === 'preliquidacion_aprobada' || estado === 'anticipo_girado'

/** ¿La corrección desde este estado es un AJUSTE EN EJECUCIÓN? (tramo
 *  en_ejecucion…enviado_a_facturacion): pura trazabilidad — actualiza valores
 *  con motivo, marca `ajuste_pendiente_liquidacion`, NO retira la aprobación
 *  original (siguió siendo válida para el anticipo), NO exige re-aprobación y
 *  NUNCA frena el avance del proyecto. La reconciliación es de Gerencia
 *  Administrativa en la LIQUIDACIÓN (Bloque 3 del módulo administrativo). */
export const correccionEsAjusteEnEjecucion = (estado: EstadoProyecto): boolean => {
  const i = ESTADOS_PROYECTO.indexOf(estado)
  return i >= ESTADOS_PROYECTO.indexOf('en_ejecucion') &&
         i <= ESTADOS_PROYECTO.indexOf('enviado_a_facturacion')
}


/** Saldo REAL contra entrega: si ya se giró anticipo, el saldo se calcula
 *  contra el valor GIRADO (hecho consumado) — una corrección del valor del
 *  contratista no descuadra el giro ya registrado. Sin giro, usa el %. */
export const saldoRealDe = (
  p: Pick<PreliquidacionProyecto, 'valor_contratista' | 'anticipo_pct' | 'anticipo'>,
): number => p.valor_contratista - (p.anticipo?.valor ?? anticipoValorDe(p))

// ── Ejecución / entrega / soporte del cliente / handoff (F2.1.d) ──
//
// Registro SIMPLE (MVP) de la ejecución con evidencia fotográfica; el avance
// por actividad y el informe fotográfico automático son futuros (F2.3).
// El flujo de Proyectos termina en 'enviado_a_facturacion': facturar, cobrar
// y pagar el saldo del contratista es del módulo futuro de Administrativa.

export interface FotoEvidencia {
  url: string
  nombre: string
}

export interface EjecucionProyecto {
  fecha_inicio: Timestamp
  iniciada_por: string
  fecha_ejecutado?: Timestamp
  ejecutado_por?: string
  nota?: string
  fotos?: FotoEvidencia[]        // evidencia fotográfica del "ejecutado"
}

export interface EntregaProyecto {
  fecha: Timestamp               // fecha de entrega al cliente
  nota?: string
  registrada_por: string
  /** Indicador ISO 2 (características técnicas y calidad): calificación
   *  1–5 del cumplimiento técnico del proyecto, capturada en el acta de
   *  entrega. Meta: ≥4 en ≥90 % de los proyectos. */
  calificacion_calidad?: number
}

// ── Panel SIGP (ISO 9.1 — seguimiento y medición) ──

/** Indicador ISO 1 (cumplimiento del plan): plan de actividades del proyecto
 *  con flag de ejecución. Se siembra desde snapshot.alcance al abrir la
 *  ejecución; el indicador = ejecutadas/programadas × 100. */
export interface ActividadPlan {
  nombre: string
  ejecutada: boolean
}

/** Indicador ISO 4 (satisfacción del cliente): encuesta simple al cierre. */
export interface EvaluacionCliente {
  satisfaccion: number           // entero 1–5; meta: ≥4 en ≥90 %
  fecha: Timestamp
  por: string                    // uid de quien registró la encuesta
  nota?: string
}

export const TIPOS_SOPORTE = ['orden_pago', 'orden_compra', 'liquidacion'] as const
export type TipoSoporte = (typeof TIPOS_SOPORTE)[number]

export const TIPO_SOPORTE_LABEL: Record<TipoSoporte, string> = {
  orden_pago: 'Orden de pago',
  orden_compra: 'Orden de compra',
  liquidacion: 'Liquidación',
}

/** Soporte que emite el CLIENTE tras la entrega — la base del handoff a
 *  facturación. `concuerda` = verificación de Proyectos de que el soporte
 *  coincide con lo ejecutado (obligatoria para avanzar). */
export interface SoporteCliente {
  tipo: TipoSoporte
  numero: string
  fecha: Timestamp
  adjunto_url?: string
  adjunto_nombre?: string
  concuerda: boolean
  nota?: string
  registrado_por: string
}

// ── Entregables IHS (F2.3 ligero) — solo proyectos preventivos ──
//
// Los 3 formatos IHS los diligencia el equipo en los ARCHIVOS DEL CLIENTE y
// se suben a la app de IHS. El panel solo TRAZA que se hicieron y guarda
// copia (adjunto a Storage) — sin capturar datos ni generar los Excel
// (evita saturar el panel y la doble digitación). Los 3 son requisito para
// registrar la ENTREGA del proyecto preventivo.

export const ENTREGABLES_IHS = [
  { key: 'inventario_antenas', label: 'Inventario de antenas' },
  { key: 'linea_vida', label: 'Estado de línea de vida' },
  { key: 'torque', label: 'Torque de torre' },
] as const

export type EntregableIhsKey = (typeof ENTREGABLES_IHS)[number]['key']

export interface EntregableIhs {
  estado: 'pendiente' | 'diligenciado'
  adjunto_url?: string
  adjunto_nombre?: string
  fecha?: Timestamp            // cuándo se diligenció
  nota?: string
  por?: string                 // uid
}

/** Entregables IHS que faltan (labels) — [] cuando está 3/3. */
export const entregablesIhsFaltantes = (
  p: Pick<Proyecto, 'origen' | 'entregables_ihs'>,
): string[] =>
  p.origen !== 'preventivo'
    ? []
    : ENTREGABLES_IHS
        .filter(e => p.entregables_ihs?.[e.key]?.estado !== 'diligenciado')
        .map(e => e.label)

export const entregablesIhsCompletos = (p: Pick<Proyecto, 'origen' | 'entregables_ihs'>) =>
  entregablesIhsFaltantes(p).length === 0

// ── Evaluación del contratista (F2.1.d — simple, ISO; extensible por GI) ──

export const CRITERIOS_EVALUACION = [
  { key: 'calidad', label: 'Calidad de los trabajos' },
  { key: 'cumplimiento', label: 'Cumplimiento de plazos' },
  { key: 'sst', label: 'SST / seguridad' },
  { key: 'documentacion', label: 'Documentación' },
] as const

export type CriterioEvaluacion = (typeof CRITERIOS_EVALUACION)[number]['key']

export interface EvaluacionContratista {
  criterios: Record<CriterioEvaluacion, number>   // puntaje 1–5 por criterio
  promedio: number                                // derivado, se guarda para reportes
  comentario?: string
  evaluado_por: string
  fecha: Timestamp
}

export const esPuntajeValido = (n: unknown): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 5

export const promedioEvaluacion = (criterios: Record<CriterioEvaluacion, number>): number =>
  CRITERIOS_EVALUACION.reduce((s, c) => s + (criterios[c.key] ?? 0), 0) / CRITERIOS_EVALUACION.length

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
  /** Bloque 1 — identificación del sitio (congelada al nacer, como todo el
   *  snapshot). Alimenta la obra-espejo: nombre_sitio limpio + código del
   *  cliente ('N/A' cuando no asigna). Ausentes en proyectos históricos. */
  nombre_sitio?: string
  codigo_sitio_cliente?: string
  valor_venta: number          // total de la versión aprobada (con impuestos)
  esquema_tributario: EsquemaTributario
  tipo_inversion?: TipoInversion
  alcance: AlcanceGrupo[]
  total_items: number
}

export interface Proyecto {
  /** = id del doc de origen (cotización o solicitud preventivo) — idempotencia 1:1 */
  id: string
  consecutivo: string          // PRY-YYYY-NNN (server-side, Cloud Function)
  origen: 'cotizacion' | 'preventivo'
  // origen 'cotizacion' (F2.1.a):
  cotizacion_id?: string
  cotizacion_consecutivo?: string
  cotizacion_version?: number  // versión APROBADA de la que se copió el snapshot
  // origen 'preventivo' (F2.2 — IHS):
  solicitud_id?: string
  solicitud_consecutivo?: string
  cliente_id?: string
  prospecto_nombre?: string
  snapshot: SnapshotProyecto
  estado: EstadoProyecto
  asignacion?: AsignacionProyecto      // F2.1.b — congela la evidencia del proveedor
  permisos?: PermisosProyecto          // F2.1.b — permisos de ingreso
  preliquidacion?: PreliquidacionProyecto  // F2.1.c — definir → aprobar → anticipo
  entregables_ihs?: Partial<Record<EntregableIhsKey, EntregableIhs>>  // F2.3 — solo preventivos
  actividades_plan?: ActividadPlan[]   // Panel ISO ind. 1 — plan con flag ejecutada
  evaluacion_cliente?: EvaluacionCliente  // Panel ISO ind. 4 — encuesta al cierre
  ejecucion?: EjecucionProyecto        // F2.1.d — inicio + ejecutado con evidencia
  entrega?: EntregaProyecto            // F2.1.d — entrega al cliente
  soporte_cliente?: SoporteCliente     // F2.1.d — soporte emitido por el cliente
  facturacion?: FacturacionProyecto    // Administrativa B1 — factura registrada
  pago_cliente?: PagoClienteProyecto   // Administrativa B2 — pago del cliente
  compras_reembolsos?: CompraReembolso[] // Administrativa B3b — línea propia, separada de la mano de obra
  liquidacion?: LiquidacionProyecto    // Administrativa B3b — cierre con el contratista
  cierre?: CierreProyecto              // Administrativa Bfinal — cierre formal del proyecto
  // El gate SST (Bloque 3a) NO vive aquí: vive en la proyección
  // `verificaciones_sst/{proyectoId}` (ver types/sigp/verificacionSst.ts) —
  // SST no tiene acceso a `proyectos` (confidencialidad financiera).
  evaluacion_contratista?: EvaluacionContratista  // F2.1.d — evaluación ISO simple
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
  cotizacion: Pick<Cotizacion, 'asunto' | 'contacto' | 'tipo_inversion' | 'prospecto_nombre' | 'nombre_sitio' | 'codigo_sitio_cliente'>,
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
    ...(cotizacion.nombre_sitio?.trim() ? { nombre_sitio: cotizacion.nombre_sitio.trim() } : {}),
    ...(cotizacion.codigo_sitio_cliente?.trim() ? { codigo_sitio_cliente: cotizacion.codigo_sitio_cliente.trim() } : {}),
    valor_venta: version.totales.total,
    esquema_tributario: version.esquema,
    ...(cotizacion.tipo_inversion ? { tipo_inversion: cotizacion.tipo_inversion } : {}),
    alcance: grupos
      .filter(g => (porGrupo.get(g.grupo_id) ?? 0) > 0)
      .map(g => ({ grupo: g.grupo_nombre, items: porGrupo.get(g.grupo_id) ?? 0, subtotal: g.subtotal })),
    total_items: version.items.length,
  }
}
