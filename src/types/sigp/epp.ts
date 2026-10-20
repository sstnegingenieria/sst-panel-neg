/**
 * Módulo Actas de entrega de EPP — formato SST-FT-AEP-18 (SG-SST).
 *
 * Dos colecciones:
 *  - `catalogo_epp`: el catálogo editable de elementos (casco, guantes…) del que
 *    se arma cada acta. Baja SOFT (`activo`), sin delete.
 *  - `actas_epp`: la entrega firmada. El colaborador y los ítems se COPIAN al acta
 *    (snapshot, restricción 5.3): si el catálogo o el maestro cambian después, el
 *    acta firmada no se mueve.
 *
 * Ciclo de vida: `borrador` (editable) → `firmada` (INMUTABLE: contenido, firma y
 * hash congelados) → `anulada` (marca + motivo, SIN tocar el contenido firmado; la
 * corrección es un acta NUEVA). Una borrador también se puede anular. Sin delete.
 *
 * Firma: es una firma electrónica SIMPLE — la dibuja el colaborador en el canvas
 * del equipo de Gestión Integral y queda como PNG (data URL) dentro del doc, con un
 * SHA-256 de (contenido + firma). Las reglas NO pueden probar que la dibujó el
 * colaborador: garantizan que solo GI/admin la registran y que, una vez firmada,
 * nadie la cambia. Si hiciera falta valor legal reforzado, lo confirma legal.
 *
 * Privacidad (Ley 1581): el acta lleva la cédula del colaborador — lectura SOLO
 * para quien gestiona (gestion_integral + admin, espejo de gestionaEpp()).
 */
import { Timestamp } from 'firebase/firestore'
import { fechaInputDeTimestamp, timestampDeFechaInput } from './accionMejora'

// ── Catálogo ─────────────────────────────────────────────────────────────────

export interface ItemCatalogoEpp {
  nombre: string
  /** Descripción técnica (marca/modelo/norma). Se copia a la fila del acta y es editable ahí. */
  especificacion: string
  /** "1", "1 par", "1 juego"… texto corto. */
  unidad: string
  cantidad_default: number
  activo: boolean
  creado_por: string
  fecha_creacion: Timestamp
  actualizado_por: string
  fecha_actualizacion: Timestamp
}
export type ItemCatalogoEppConId = ItemCatalogoEpp & { id: string }

export interface ItemCatalogoFormData {
  nombre: string
  especificacion: string
  unidad: string
  cantidad_default: string
}
export const FORM_CATALOGO_VACIO: ItemCatalogoFormData = {
  nombre: '', especificacion: '', unidad: '1', cantidad_default: '1',
}

export const MAX_NOMBRE_EPP = 120
export const MAX_ESPECIFICACION_EPP = 500
export const MAX_UNIDAD_EPP = 40
export const MAX_CANTIDAD_EPP = 99

/** Semilla del catálogo: los elementos del formato SST-FT-AEP-18. Ids determinísticos
 *  → cargar la semilla dos veces no duplica (idempotente). Las especificaciones son
 *  editables desde la pantalla del catálogo: la lista sembrada es el punto de partida. */
export const CATALOGO_EPP_BASE: ReadonlyArray<{
  id: string; nombre: string; especificacion: string; unidad: string; cantidad_default: number
}> = [
  { id: 'gafas-lente-oscuro', nombre: 'Gafas de seguridad — lente oscuro', especificacion: 'T-Rex T3001C', unidad: '1', cantidad_default: 1 },
  { id: 'gafas-lente-claro', nombre: 'Gafas de seguridad — lente claro', especificacion: 'T-Rex T3001C', unidad: '1', cantidad_default: 1 },
  { id: 'guantes-g40-poliuretano', nombre: 'Guantes G40 poliuretano', especificacion: 'G40 poliuretano', unidad: '1 par', cantidad_default: 1 },
  { id: 'guantes-latex-reforzado', nombre: 'Guantes de látex reforzado', especificacion: 'Látex reforzado', unidad: '1 par', cantidad_default: 1 },
  { id: 'protector-auditivo-insercion', nombre: 'Protector auditivo de inserción', especificacion: 'De inserción, con cordón', unidad: '1', cantidad_default: 1 },
  { id: 'casco-blanco-dielectrico', nombre: 'Casco blanco dieléctrico', especificacion: 'Dieléctrico Humanpack Acrux tipo II', unidad: '1', cantidad_default: 1 },
  { id: 'camisa-neg', nombre: 'Camisa NEG', especificacion: 'Blanca tipo ingeniero, con logos NEG-BIC', unidad: '1', cantidad_default: 1 },
  { id: 'chaqueta-neg', nombre: 'Chaqueta NEG', especificacion: 'Con logos NEG-BIC', unidad: '1', cantidad_default: 1 },
  { id: 'botas-seguridad-dielectricas', nombre: 'Botas de seguridad dieléctricas', especificacion: 'Dieléctricas', unidad: '1 par', cantidad_default: 1 },
]

export function validarItemCatalogo(f: ItemCatalogoFormData): Record<string, string> {
  const e: Record<string, string> = {}
  if (!f.nombre.trim()) e.nombre = 'Indica el nombre del elemento'
  else if (f.nombre.trim().length > MAX_NOMBRE_EPP) e.nombre = `Máximo ${MAX_NOMBRE_EPP} caracteres`
  if (f.especificacion.length > MAX_ESPECIFICACION_EPP) e.especificacion = `Máximo ${MAX_ESPECIFICACION_EPP} caracteres`
  if (!f.unidad.trim()) e.unidad = 'Indica la unidad (p. ej. 1, 1 par)'
  else if (f.unidad.trim().length > MAX_UNIDAD_EPP) e.unidad = `Máximo ${MAX_UNIDAD_EPP} caracteres`
  const c = Number(f.cantidad_default)
  if (!Number.isInteger(c) || c < 1 || c > MAX_CANTIDAD_EPP) e.cantidad_default = `Un entero entre 1 y ${MAX_CANTIDAD_EPP}`
  return e
}

export function construirAltaCatalogo(f: ItemCatalogoFormData, uid: string, ahora: Timestamp): ItemCatalogoEpp | null {
  if (Object.keys(validarItemCatalogo(f)).length > 0) return null
  return {
    nombre: f.nombre.trim(),
    especificacion: f.especificacion.trim(),
    unidad: f.unidad.trim(),
    cantidad_default: Number(f.cantidad_default),
    activo: true,
    creado_por: uid,
    fecha_creacion: ahora,
    actualizado_por: uid,
    fecha_actualizacion: ahora,
  }
}

/** Edición: solo los campos descriptivos; creado_por/fecha_creacion no se tocan. */
export function patchEditarCatalogo(f: ItemCatalogoFormData, uid: string, ahora: Timestamp) {
  if (Object.keys(validarItemCatalogo(f)).length > 0) return null
  return {
    nombre: f.nombre.trim(),
    especificacion: f.especificacion.trim(),
    unidad: f.unidad.trim(),
    cantidad_default: Number(f.cantidad_default),
    actualizado_por: uid,
    fecha_actualizacion: ahora,
  }
}

/** Baja/alta SOFT. */
export const patchActivoCatalogo = (activo: boolean, uid: string, ahora: Timestamp) => ({
  activo, actualizado_por: uid, fecha_actualizacion: ahora,
})

/** La semilla como documentos listos para crear (idempotencia por id). */
export function semillaCatalogo(uid: string, ahora: Timestamp): { id: string; data: ItemCatalogoEpp }[] {
  return CATALOGO_EPP_BASE.map(i => ({
    id: i.id,
    data: {
      nombre: i.nombre, especificacion: i.especificacion, unidad: i.unidad,
      cantidad_default: i.cantidad_default, activo: true,
      creado_por: uid, fecha_creacion: ahora, actualizado_por: uid, fecha_actualizacion: ahora,
    },
  }))
}

// ── Acta ─────────────────────────────────────────────────────────────────────

export const ESTADOS_ACTA_EPP = ['borrador', 'firmada', 'anulada'] as const
export type EstadoActaEpp = typeof ESTADOS_ACTA_EPP[number]

export const ESTADO_ACTA_EPP_LABEL: Record<EstadoActaEpp, string> = {
  borrador: 'Borrador', firmada: 'Firmada', anulada: 'Anulada',
}
// Sin azules (marca): borrador ámbar, firmada verde, anulada gris.
export const ESTADO_ACTA_EPP_COLOR: Record<EstadoActaEpp, string> = {
  borrador: 'bg-amber-100 text-amber-800',
  firmada: 'bg-emerald-100 text-emerald-800',
  anulada: 'bg-gray-200 text-gray-600',
}

export const FUENTES_COLABORADOR_EPP = ['directo', 'contratista'] as const
export type FuenteColaboradorEpp = typeof FUENTES_COLABORADOR_EPP[number]

export interface ColaboradorEpp {
  fuente: FuenteColaboradorEpp
  /** id del empleado directo, o la cédula normalizada del trabajador de la nómina. */
  ref_id: string
  nombre: string
  /** Solo dígitos cuando viene del maestro/nómina; editable si se corrige. SENSIBLE. */
  cedula: string
  cargo: string
  /** Solo si fuente = 'contratista'. */
  contratista_nombre?: string
}

export interface ItemActaEpp {
  nombre: string
  especificacion: string
  cantidad: number
  unidad: string
}

export interface FirmanteEmpresa { nombre: string; cargo: string }

/** Firmantes por defecto de la empresa (editables por acta, mientras sea borrador). */
export const FIRMANTES_EPP_DEFAULT: FirmanteEmpresa[] = [
  { nombre: 'Pedro Rodríguez', cargo: 'Director general' },
  { nombre: 'Ingrid Laverde', cargo: 'Dir. Gestión Humana y H.S.E.Q' },
]

export interface EventoActaEpp {
  fecha: Timestamp
  por: string
  por_nombre?: string
  de?: EstadoActaEpp
  a?: EstadoActaEpp
  nota?: string
}

export interface AnulacionActaEpp {
  fecha: Timestamp
  por: string
  por_nombre?: string
  motivo: string
}

export interface ActaEpp {
  colaborador: ColaboradorEpp
  items: ItemActaEpp[]
  firmantes_empresa: FirmanteEmpresa[]
  /** Fecha de la entrega. */
  fecha: Timestamp
  /** Versión del texto de las cláusulas que se mostró al colaborador al firmar. */
  clausulas_version: string
  estado: EstadoActaEpp
  firmado: boolean
  /** data URL `data:image/png;base64,…` — solo cuando firmado. */
  firma_colaborador?: string
  /** SHA-256 hex de (contenido + firma). Solo cuando firmado. */
  firma_hash?: string
  fecha_firma?: Timestamp
  anulacion?: AnulacionActaEpp
  /** Quien entrega = quien crea el acta (uid de GI/admin). */
  entregado_por: string
  entregado_por_nombre?: string
  creado_por: string
  creado_por_nombre?: string
  fecha_creacion: Timestamp
  fecha_actualizacion?: Timestamp
  historial: EventoActaEpp[]
}
export type ActaEppConId = ActaEpp & { id: string }

export const MAX_ITEMS_ACTA = 30
export const MAX_FIRMA_CHARS = 100_000
export const PREFIJO_FIRMA_PNG = 'data:image/png;base64,'
/** Los 8 primeros bytes de todo PNG (89 50 4E 47 0D 0A 1A 0A) codificados en base64. */
export const CABECERA_PNG_B64 = 'iVBORw0KGgo'
/** La fecha de entrega no puede ser más antigua que esto respecto a la creación del acta
 *  (la regla lo exige igual): registrar una entrega de hace meses es una decisión de GI, no
 *  un descuido. Valor por defecto a confirmar con Gestión Integral. */
export const DIAS_ATRAS_FECHA_ENTREGA = 30

export interface ActaFormData {
  colaborador: ColaboradorEpp | null
  items: ItemActaEpp[]
  /** yyyy-mm-dd (input date). */
  fecha: string
  firmantes_empresa: FirmanteEmpresa[]
}

export const FORM_ACTA_VACIO = (): ActaFormData => ({
  colaborador: null,
  items: [],
  fecha: fechaInputDeTimestamp(Timestamp.now()),
  firmantes_empresa: FIRMANTES_EPP_DEFAULT.map(f => ({ ...f })),
})

/** Errores del formulario (vacío = válido). Espejo del tope de las reglas. */
export function validarActa(f: ActaFormData, referencia: Date = new Date()): Record<string, string> {
  const e: Record<string, string> = {}
  const c = f.colaborador
  if (!c) e.colaborador = 'Selecciona al colaborador'
  else {
    if (!c.nombre.trim()) e.colaborador = 'Falta el nombre del colaborador'
    else if (!c.cedula.trim()) e.colaborador = 'Falta la cédula del colaborador'
    else if (c.cedula.trim().length > 30) e.colaborador = 'Cédula demasiado larga'
    if (c.cargo.length > 200 || c.nombre.length > 200) e.colaborador = 'Nombre o cargo demasiado largo'
  }
  if (f.items.length === 0) e.items = 'Agrega al menos un elemento de EPP'
  else if (f.items.length > MAX_ITEMS_ACTA) e.items = `Máximo ${MAX_ITEMS_ACTA} elementos`
  else {
    const mala = f.items.findIndex(i =>
      !i.nombre.trim() || i.nombre.length > MAX_NOMBRE_EPP
      || i.especificacion.length > MAX_ESPECIFICACION_EPP
      || !i.unidad.trim() || i.unidad.length > MAX_UNIDAD_EPP
      || !Number.isInteger(i.cantidad) || i.cantidad < 1 || i.cantidad > MAX_CANTIDAD_EPP)
    if (mala >= 0) e.items = `Revisa la fila ${mala + 1}: nombre, cantidad (1–${MAX_CANTIDAD_EPP}) y unidad son obligatorios`
  }
  const fechaEntrega = timestampDeFechaInput(f.fecha)
  if (!fechaEntrega) e.fecha = 'Indica la fecha de entrega'
  else {
    const dia = 86_400_000
    const ms = fechaEntrega.toMillis()
    if (ms > referencia.getTime() + dia) e.fecha = 'La fecha de entrega no puede ser futura'
    else if (ms < referencia.getTime() - DIAS_ATRAS_FECHA_ENTREGA * dia) {
      e.fecha = `La fecha de entrega no puede ser anterior a ${DIAS_ATRAS_FECHA_ENTREGA} días`
    }
  }
  if (f.firmantes_empresa.length === 0 || f.firmantes_empresa.some(x => !x.nombre.trim())) {
    e.firmantes = 'Indica al menos un firmante de la empresa'
  }
  return e
}

export interface Actor { uid: string; nombre?: string }

const evento = (actor: Actor, ahora: Timestamp, e: Partial<EventoActaEpp>): EventoActaEpp => ({
  fecha: ahora,
  por: actor.uid,
  ...(actor.nombre ? { por_nombre: actor.nombre } : {}),
  ...e,
})

const limpiarColaborador = (c: ColaboradorEpp): ColaboradorEpp => ({
  fuente: c.fuente,
  ref_id: c.ref_id,
  nombre: c.nombre.trim(),
  cedula: c.cedula.trim(),
  cargo: c.cargo.trim(),
  ...(c.fuente === 'contratista' && c.contratista_nombre?.trim() ? { contratista_nombre: c.contratista_nombre.trim() } : {}),
})
const limpiarItems = (items: ItemActaEpp[]): ItemActaEpp[] => items.map(i => ({
  nombre: i.nombre.trim(), especificacion: i.especificacion.trim(), cantidad: i.cantidad, unidad: i.unidad.trim(),
}))
const limpiarFirmantes = (fs: FirmanteEmpresa[]): FirmanteEmpresa[] =>
  fs.filter(f => f.nombre.trim()).map(f => ({ nombre: f.nombre.trim(), cargo: f.cargo.trim() }))

/** Alta: nace SIEMPRE borrador, sin firma. null si el formulario no valida. */
export function construirAltaActa(
  f: ActaFormData, clausulasVersion: string, actor: Actor, ahora: Timestamp,
): ActaEpp | null {
  if (Object.keys(validarActa(f, ahora.toDate())).length > 0 || !f.colaborador) return null
  const fecha = timestampDeFechaInput(f.fecha)
  if (!fecha) return null
  return {
    colaborador: limpiarColaborador(f.colaborador),
    items: limpiarItems(f.items),
    firmantes_empresa: limpiarFirmantes(f.firmantes_empresa),
    fecha,
    clausulas_version: clausulasVersion,
    estado: 'borrador',
    firmado: false,
    entregado_por: actor.uid,
    ...(actor.nombre ? { entregado_por_nombre: actor.nombre } : {}),
    creado_por: actor.uid,
    ...(actor.nombre ? { creado_por_nombre: actor.nombre } : {}),
    fecha_creacion: ahora,
    historial: [evento(actor, ahora, { a: 'borrador', nota: 'Acta creada (borrador)' })],
  }
}

/** Edición: solo un BORRADOR. null si no es legal. */
export function patchEditarActa(
  acta: Pick<ActaEpp, 'estado' | 'historial' | 'fecha_creacion'>, f: ActaFormData, actor: Actor, ahora: Timestamp,
): Partial<ActaEpp> | null {
  if (acta.estado !== 'borrador') return null
  if (Object.keys(validarActa(f, acta.fecha_creacion.toDate())).length > 0 || !f.colaborador) return null
  const fecha = timestampDeFechaInput(f.fecha)
  if (!fecha) return null
  return {
    colaborador: limpiarColaborador(f.colaborador),
    items: limpiarItems(f.items),
    firmantes_empresa: limpiarFirmantes(f.firmantes_empresa),
    fecha,
    fecha_actualizacion: ahora,
    historial: [...(acta.historial ?? []), evento(actor, ahora, { de: 'borrador', a: 'borrador', nota: 'Acta editada' })],
  }
}

/** ¿Es `s` un data URL PNG de firma legal (prefijo, base64, tope de tamaño)? Espejo de la regla. */
export function firmaPngValida(s: unknown): s is string {
  if (typeof s !== 'string' || s.length > MAX_FIRMA_CHARS || !s.startsWith(PREFIJO_FIRMA_PNG + CABECERA_PNG_B64)) return false
  const cuerpo = s.slice(PREFIJO_FIRMA_PNG.length)
  return /^[A-Za-z0-9+/]+={0,2}$/.test(cuerpo) && cuerpo.length % 4 === 0
}

export const hashHexValido = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s)

/** FIRMAR: borrador → firmada. Congela el contenido: este write toca SOLO
 *  estado/firmado/firma/hash/fecha_firma/historial/fecha_actualizacion. */
export function patchFirmarActa(
  acta: Pick<ActaEpp, 'estado' | 'historial'>, firma: string, hash: string, actor: Actor, ahora: Timestamp,
): Partial<ActaEpp> | null {
  if (acta.estado !== 'borrador') return null
  if (!firmaPngValida(firma) || !hashHexValido(hash)) return null
  return {
    estado: 'firmada',
    firmado: true,
    firma_colaborador: firma,
    firma_hash: hash,
    fecha_firma: ahora,
    fecha_actualizacion: ahora,
    historial: [...(acta.historial ?? []), evento(actor, ahora, { de: 'borrador', a: 'firmada', nota: 'Acta firmada por el colaborador' })],
  }
}

/** ANULAR: borrador o firmada → anulada, con motivo. NO toca el contenido ni la firma
 *  (queda como evidencia); la corrección es un acta nueva. */
export function patchAnularActa(
  acta: Pick<ActaEpp, 'estado' | 'historial'>, motivo: string, actor: Actor, ahora: Timestamp,
): Partial<ActaEpp> | null {
  const m = motivo.trim()
  if (acta.estado === 'anulada' || !m || m.length > 2000) return null
  return {
    estado: 'anulada',
    anulacion: { fecha: ahora, por: actor.uid, ...(actor.nombre ? { por_nombre: actor.nombre } : {}), motivo: m },
    fecha_actualizacion: ahora,
    historial: [...(acta.historial ?? []), evento(actor, ahora, { de: acta.estado, a: 'anulada', nota: m })],
  }
}

export const puedeEditarActaEpp = (estado: EstadoActaEpp): boolean => estado === 'borrador'
export const puedeFirmarActaEpp = (estado: EstadoActaEpp): boolean => estado === 'borrador'
export const puedeAnularActaEpp = (estado: EstadoActaEpp): boolean => estado !== 'anulada'

/** Formulario a partir de un acta existente (editar borrador). */
export function formDeActa(a: ActaEpp): ActaFormData {
  return {
    colaborador: { ...a.colaborador },
    items: a.items.map(i => ({ ...i })),
    fecha: fechaInputDeTimestamp(a.fecha),
    firmantes_empresa: a.firmantes_empresa.map(f => ({ ...f })),
  }
}

/** Fila nueva del acta desde un elemento del catálogo (autocompleta nombre/espec./unidad/cantidad). */
export const itemDeCatalogo = (c: ItemCatalogoEpp): ItemActaEpp => ({
  nombre: c.nombre, especificacion: c.especificacion, cantidad: c.cantidad_default, unidad: c.unidad,
})

export const ITEM_ACTA_VACIO = (): ItemActaEpp => ({ nombre: '', especificacion: '', cantidad: 1, unidad: '1' })
