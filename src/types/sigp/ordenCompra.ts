// src/types/sigp/ordenCompra.ts
//
// Módulo Compras · C2 — Órdenes de compra. Documento de EJECUCIÓN (costo
// operativo: jamás venta/utilidad). La crea un operativo con la cotización
// del proveedor adjunta y la aprueba GP/GG (aprobador ≠ creador, con
// salvedad como escape). La compra de Marcela + auto-agregado es C3.
// Convención: campos Firestore en snake_case español.

import type { Timestamp } from 'firebase/firestore'

// ── Enums de dominio ──────────────────────────────────────────────────────────

// OC2 (oct-2026) — cambio de régimen: la aprobación previa (GP/GG) se
// reemplaza por la REVISIÓN de Gestión Administrativa. `emitida` pasa a ser
// el estado de espera del gate nuevo; `revisada` es el gate pasado;
// `rechazada` es la devolución NO terminal al creador (eso la distingue de
// `anulada`). `aprobada` queda como estado LEGACY: el nombre dice bajo qué
// régimen pasó su control (colapsarla en `revisada` mentiría) — SIN
// transiciones de entrada nuevas, con sus salidas (→ comprada, → anulada)
// intactas. No se migra ningún documento (restricción 5.1: los emitidos
// bajo la regla vigente en su momento no se reescriben).
export type EstadoOrdenCompra =
  'borrador' | 'emitida' | 'revisada' | 'rechazada' | 'aprobada' | 'comprada' | 'anulada'

// ── Sub-tipos embebidos ───────────────────────────────────────────────────────

export interface LineaOrdenCompra {
  descripcion: string
  /** OC1 — unidad de medida (Und, m2, Glb…). Opcional en el TIPO por la
   *  OC legacy de prod (OC-2026-001, aprobada e inmutable — no se
   *  backfillea); OBLIGATORIA al emitir órdenes nuevas (validación). */
  unidad?: string
  /** OC1 — código/referencia del ítem (catálogo del proveedor). Opcional. */
  codigo?: string
  /** OC1 — tarifa de IVA de ESTA línea (19 default, admite 5 y 0).
   *  Ausente = línea legacy sin IVA discriminado (degradación honesta:
   *  ver discriminaIva). El IVA se calcula POR LÍNEA y se suma — jamás
   *  una tarifa sobre el subtotal (con tarifas mixtas dan distinto). */
  iva_pct?: number
  cantidad: number
  valor_unitario: number
  valor: number                      // = valorLineaDe(cantidad, valor_unitario) — SIN IVA
}

/** OC1 — bloque "ENTREGAR EN": dato de la ORDEN, no del proveedor (el
 *  formato real DC-FT-OC-19 pide dónde despachar ESTA compra; el papel
 *  trae impreso "00-19" — código corregido por GI, ver isoControl.ts). */
export interface DespachoOC {
  direccion: string
  contacto: string
  telefono: string
  /** Fecha pactada de despacho/entrega (texto libre del formato). */
  fecha_despacho?: string
}

/** OC1 — condiciones comerciales de la orden (variables por orden;
 *  lo constante de NEG vive en configuracion/empresa). */
export interface CondicionesOC {
  forma_pago: string
  tiempo_entrega?: string
  /** Fecha límite de radicación de la factura (variable por orden). */
  fecha_limite_radicacion?: string
}

/** OC2 — la revisión de Gestión Administrativa (el gate nuevo). El total
 *  tecleado de la cotización del proveedor es PARTE del control: obliga a
 *  mirar el documento que se está comparando; si difiere del total de la
 *  orden queda avisado en pantalla y trazado aquí — no bloquea (puede
 *  haber razón), pero no pasa desapercibido. */
export interface RevisionOC {
  por: string                        // uid
  fecha: Timestamp
  /** Total leído por quien revisa EN la cotización adjunta del proveedor. */
  total_cotizacion_proveedor: number
  /** Escape respaldo-revisa-lo-propio (GG/admin crean Y validan): salvedad
   *  obligatoria con traza — calco del control de aprobación del C2. */
  salvedad?: string
}

/** OC2 — devolución vigente (NO terminal): la OC vuelve a quien la creó,
 *  con el motivo visible; se limpia al re-enviar (las vueltas anteriores
 *  quedan en historial — una OC rechazada dos veces lo cuenta sola). */
export interface RechazoOC {
  por: string
  fecha: Timestamp
  motivo: string
}

/** Entrada del historial de cambios de estado (evidencia ISO 8.2). */
export interface CambioEstadoOC {
  de: EstadoOrdenCompra | null       // null en la creación
  a: EstadoOrdenCompra
  por: string                        // uid
  fecha: Timestamp
  motivo?: string                    // obligatorio al anular
}

/** Identidad del proveedor COPIADA al crear (regla 5.3 — nunca FK viva;
 *  jamás se toca proveedores/{id}/privado desde aquí).
 *  OC1: engordado SOLO con el contacto del doc PÚBLICO del proveedor.
 *  REGLA DURA: los datos bancarios del sub-doc privado/datos_bancarios
 *  JAMÁS aparecen en la OC ni en este snapshot — construirSnapshotProveedor
 *  es whitelist por construcción (fijado por test). */
export interface ProveedorSnapshotOC {
  identificacion: string
  razon_social: string
  contacto_nombre?: string
  contacto_telefono?: string
  contacto_correo?: string
}

/** Whitelist explícita: copia identidad + contacto del doc PÚBLICO de
 *  proveedores. Cualquier otra clave del doc (o de sub-docs) se ignora
 *  por construcción — nunca un spread. */
export function construirSnapshotProveedor(p: {
  identificacion: string
  razon_social: string
  contacto?: { nombre?: string; telefono?: string; correo?: string }
}): ProveedorSnapshotOC {
  const s: ProveedorSnapshotOC = {
    identificacion: p.identificacion,
    razon_social: p.razon_social,
  }
  if (p.contacto?.nombre) s.contacto_nombre = p.contacto.nombre
  if (p.contacto?.telefono) s.contacto_telefono = p.contacto.telefono
  if (p.contacto?.correo) s.contacto_correo = p.contacto.correo
  return s
}

// ── Documento principal (colección `ordenes_compra`) ──────────────────────────

export interface OrdenCompra {
  id: string
  /** '' en borrador — el OC-YYYY-NNN se asigna al EMITIR (contigüidad ISO:
   *  los borradores no queman número; patrón pipeline). */
  consecutivo: string
  proyecto_id: string
  proyecto_consecutivo: string       // denormalizado para la bandeja
  proveedor_id: string
  proveedor_snapshot: ProveedorSnapshotOC
  lineas: LineaOrdenCompra[]
  /** OCs NUEVAS (líneas con iva_pct): TOTAL CON IVA = totalConIvaDe(lineas).
   *  OC legacy (sin iva_pct): Σ valor de líneas, sin IVA discriminado —
   *  se respeta tal cual (inmutable, evidencia ISO). */
  valor_total: number
  /** OC1 — bloque ENTREGAR EN. Opcional en el tipo (legacy); obligatorio
   *  al emitir órdenes nuevas. */
  despacho?: DespachoOC
  /** OC1 — condiciones de la orden. forma_pago obligatoria al emitir. */
  condiciones?: CondicionesOC
  /** OC1 — referencia de la cotización del proveedor (ej. CO52090). */
  cotizacion_referencia?: string
  /** '' en borrador; REQUERIDA al emitir (UI + regla). Storage:
   *  ordenes_compra/{id}/cotizacion/{uuid} (patrón C1, H-008). */
  cotizacion_proveedor_url: string
  estado: EstadoOrdenCompra
  creada_por: string
  /** OC2 — revisión vigente (estado `revisada` en adelante). */
  revision?: RevisionOC
  /** OC2 — devolución vigente (estado `rechazada`); null al re-enviar
   *  (el historial conserva cada vuelta). */
  rechazo?: RechazoOC | null
  /** LEGACY (régimen anterior a oct-2026): la aprobación de GP/GG. Se
   *  conserva en las OCs que la tienen; ninguna orden nueva la escribe. */
  aprobada_por?: string
  /** Escape del blindaje aprobador ≠ creador: si quien aprueba es quien
   *  creó (p. ej. GG crea y GG aprueba), la salvedad es OBLIGATORIA. */
  salvedad_aprobacion?: string
  fecha_aprobacion?: Timestamp
  /** C3 — la compra de Marcela (gestionaCompras): valor REAL pagado +
   *  soporte a Storage (ordenes_compra/{id}/soporte/{uuid}). Ambos
   *  obligatorios para marcar 'comprada' (UI + regla hasOnly). */
  valor_real?: number
  soporte_compra_url?: string
  comprada_por?: string
  fecha_compra?: Timestamp
  historial: CambioEstadoOC[]
  fecha_creacion: Timestamp
  fecha_actualizacion?: Timestamp
}

// ── Constantes ────────────────────────────────────────────────────────────────

export const ESTADOS_OC =
  ['borrador', 'emitida', 'revisada', 'rechazada', 'aprobada', 'comprada', 'anulada'] as const

export const ESTADO_OC_LABEL: Record<EstadoOrdenCompra, string> = {
  borrador: 'Borrador',
  emitida: 'Emitida · por revisar',
  revisada: 'Revisada',
  rechazada: 'Devuelta',
  aprobada: 'Aprobada',              // LEGACY — régimen anterior a oct-2026
  comprada: 'Comprada',
  anulada: 'Anulada',
}

export const ESTADO_OC_COLOR: Record<EstadoOrdenCompra, string> = {
  borrador: 'bg-gray-100 text-gray-600',
  emitida:  'bg-amber-100 text-amber-800',
  revisada: 'bg-emerald-100 text-emerald-800',
  rechazada: 'bg-orange-100 text-orange-800',
  aprobada: 'bg-emerald-100 text-emerald-800',
  comprada: 'bg-brand-100 text-brand-800',
  anulada:  'bg-rose-100 text-rose-800',
}

/**
 * Máquina de estados OC2. `emitida` = esperando la REVISIÓN de Gestión
 * Administrativa (el gate). `rechazada` = devuelta al creador, NO terminal:
 * se edita y se re-envía (rechazada → emitida, con el MISMO consecutivo —
 * la re-emisión es una vuelta del documento, no un documento nuevo).
 * `aprobada` es LEGACY: sin entradas nuevas, salidas intactas. `revisada` y
 * `aprobada` son inmutables salvo avanzar a comprada o anularse (reglas).
 * `anulada` es terminal (soft — sin delete, restricción 5.1).
 */
export const TRANSICIONES_OC: Record<EstadoOrdenCompra, EstadoOrdenCompra[]> = {
  borrador: ['emitida', 'anulada'],
  emitida:  ['revisada', 'rechazada', 'anulada'],
  revisada: ['comprada', 'anulada'],  // comprada = marcaCompraOC (Paula, OC2)
  rechazada: ['emitida', 'anulada'],  // re-envío por el CREADOR, sin quemar consecutivo
  aprobada: ['comprada', 'anulada'],  // LEGACY: sus salidas siguen vivas
  comprada: [],                       // terminal en C3 (recepción = v2)
  anulada:  [],
}

// ── Helpers puros (testeables) ────────────────────────────────────────────────

/** Valor de una línea, redondeado a peso (consistente con calcularTotales). */
export const valorLineaDe = (cantidad: number, valorUnitario: number): number =>
  Math.round((cantidad || 0) * (valorUnitario || 0))

/** Subtotal (sin IVA) de la OC = Σ valor de las líneas. */
export const totalDe = (lineas: Pick<LineaOrdenCompra, 'valor'>[]): number =>
  lineas.reduce((s, l) => s + (l.valor || 0), 0)

/** Alias semántico OC1: totalDe siempre fue el subtotal sin IVA. */
export const subtotalDe = totalDe

// ── OC1 — IVA por línea ───────────────────────────────────────────────────────

/** Tarifas admitidas (decisión de negocio: 19 general, 5 reducida, 0 exenta). */
export const IVA_PCT_OPCIONES = [19, 5, 0] as const
export const IVA_PCT_DEFAULT = 19

/** IVA de UNA línea, redondeado a peso. Línea sin iva_pct (legacy) → 0. */
export const ivaLineaDe = (l: Pick<LineaOrdenCompra, 'valor' | 'iva_pct'>): number =>
  Math.round((l.valor || 0) * ((l.iva_pct ?? 0) / 100))

/** IVA total = Σ IVA por línea. JAMÁS una tarifa sobre el subtotal:
 *  con tarifas mixtas los dos métodos dan resultados distintos (fijado
 *  por test con el caso mixto). */
export const ivaTotalDe = (lineas: Pick<LineaOrdenCompra, 'valor' | 'iva_pct'>[]): number =>
  lineas.reduce((s, l) => s + ivaLineaDe(l), 0)

/** Total con IVA = subtotal + Σ IVA por línea. Es el valor_total de las
 *  OCs nuevas. */
export const totalConIvaDe = (lineas: Pick<LineaOrdenCompra, 'valor' | 'iva_pct'>[]): number =>
  totalDe(lineas) + ivaTotalDe(lineas)

/** ¿La OC discrimina IVA? true si TODAS las líneas traen iva_pct.
 *  false = orden legacy (OC-2026-001): valor_total sin IVA discriminado —
 *  UI y PDF degradan honesto en vez de inventar un 19%. */
export const discriminaIva = (lineas: Pick<LineaOrdenCompra, 'iva_pct'>[]): boolean =>
  lineas.length > 0 && lineas.every((l) => typeof l.iva_pct === 'number')

/** Tarifa uniforme de la orden: el pct si TODAS las líneas comparten la
 *  misma tarifa (rótulo "IVA 19%"), null si son mixtas (rótulo "IVA"). */
export function tarifaIvaUniforme(
  lineas: Pick<LineaOrdenCompra, 'iva_pct'>[]
): number | null {
  if (!discriminaIva(lineas)) return null
  const primera = lineas[0].iva_pct as number
  return lineas.every((l) => l.iva_pct === primera) ? primera : null
}

/** Validación dura para EMITIR (la de borrador es laxa: se guarda a medias).
 *  Devuelve mapa de errores; vacío = lista para emitir.
 *  OC1: unidad e IVA por línea obligatorios, despacho y forma de pago
 *  obligatorios, valor_total = TOTAL CON IVA. */
export function validarOcParaEmitir(oc: {
  lineas: LineaOrdenCompra[]
  valor_total: number
  cotizacion_proveedor_url: string
  despacho?: DespachoOC
  condiciones?: CondicionesOC
}): Record<string, string> {
  const e: Record<string, string> = {}
  if (!oc.lineas.length) e.lineas = 'La orden necesita al menos una línea'
  oc.lineas.forEach((l, i) => {
    if (!l.descripcion.trim()) e[`linea_${i}_descripcion`] = 'Descripción obligatoria'
    if (!l.unidad?.trim()) e[`linea_${i}_unidad`] = 'Unidad obligatoria'
    if (!(l.cantidad > 0)) e[`linea_${i}_cantidad`] = 'Cantidad > 0'
    if (!(l.valor_unitario > 0)) e[`linea_${i}_valor`] = 'Valor unitario > 0'
    if (!(IVA_PCT_OPCIONES as readonly number[]).includes(l.iva_pct as number))
      e[`linea_${i}_iva`] = 'IVA de la línea inválido (19, 5 o 0)'
  })
  if (oc.lineas.length && oc.valor_total !== totalConIvaDe(oc.lineas))
    e.valor_total = 'El total no coincide con subtotal + IVA de las líneas'
  if (!oc.cotizacion_proveedor_url)
    e.cotizacion = 'La cotización del proveedor es obligatoria para emitir'
  if (!oc.despacho?.direccion?.trim()) e.despacho_direccion = 'Dirección de entrega obligatoria'
  if (!oc.despacho?.contacto?.trim()) e.despacho_contacto = 'Contacto de entrega obligatorio'
  if (!oc.despacho?.telefono?.trim()) e.despacho_telefono = 'Teléfono de entrega obligatorio'
  if (!oc.condiciones?.forma_pago?.trim()) e.forma_pago = 'La forma de pago es obligatoria'
  return e
}

/** ¿La aprobación exige salvedad? (aprobador == creador — escape con traza). */
export const requiereSalvedadAprobacion = (uidAprobador: string, creadaPor: string): boolean =>
  uidAprobador === creadaPor

/** Validación dura para marcar COMPRADA (C3 — la compra de Marcela):
 *  valor real pagado > 0 y soporte adjunto. Devuelve mapa de errores. */
export function validarOcParaComprar(d: { valorReal?: number; tieneSoporte: boolean }): Record<string, string> {
  const e: Record<string, string> = {}
  if (!((d.valorReal ?? 0) > 0)) e.valor_real = 'El valor real pagado es obligatorio (> 0)'
  if (!d.tieneSoporte) e.soporte = 'El soporte de la compra es obligatorio'
  return e
}

// ── OC2 — revisión de Gestión Administrativa (patch builders puros) ──────────
// La UI no improvisa writes: el MISMO builder valida el botón y ejecuta
// (patrón tarea.ts / patchCancelarProyecto). Devuelven el patch exacto o null.

/** ¿El PDF se puede descargar? Desde que existe con consecutivo (emitida) —
 *  consultable e imprimible SIEMPRE; lo que cambia es la tinta (marca). */
export const pdfDescargable = (estado: EstadoOrdenCompra): boolean =>
  ['emitida', 'rechazada', 'revisada', 'aprobada', 'comprada'].includes(estado)

/** ¿El PDF sale con la marca de agua "PENDIENTE DE REVISIÓN — NO ENTREGABLE
 *  AL PROVEEDOR"? El compromiso con el proveedor no puede existir antes de
 *  la revisión — y lo dice el documento mismo, no un permiso de UI.
 *  `aprobada` (legacy) sale limpia: pasó su gate bajo la regla vigente en
 *  su momento — marcarla retroactivamente reescribiría historia. */
export const pdfMarcado = (estado: EstadoOrdenCompra): boolean =>
  estado === 'emitida' || estado === 'rechazada'

/** ¿Quién puede editar las líneas/datos? Borrador: cualquier operativo.
 *  Rechazada: SOLO quien la creó (la devolución vuelve a su autor) — admin
 *  como escotilla. Los demás estados no se editan. */
export const puedeEditarOc = (
  oc: Pick<OrdenCompra, 'estado' | 'creada_por'>, uid: string, esAdmin = false
): boolean =>
  oc.estado === 'borrador' || (oc.estado === 'rechazada' && (uid === oc.creada_por || esAdmin))

/** VALIDAR (emitida → revisada). El total tecleado de la cotización del
 *  proveedor es obligatorio (>0): es el acto de mirar el documento. Si
 *  difiere del total de la orden NO bloquea — queda en la traza. Respaldo
 *  que revisa lo que creó → salvedad obligatoria. */
export function patchRevisarOc(
  oc: Pick<OrdenCompra, 'estado' | 'creada_por' | 'historial' | 'valor_total'>,
  uid: string,
  totalCotizacionProveedor: number,
  ahora: Timestamp,
  salvedad?: string,
): { estado: 'revisada'; revision: RevisionOC; historial: CambioEstadoOC[]; fecha_actualizacion: Timestamp } | null {
  if (oc.estado !== 'emitida') return null
  if (!(totalCotizacionProveedor > 0)) return null
  if (uid === oc.creada_por && !salvedad?.trim()) return null
  const difiere = totalCotizacionProveedor !== oc.valor_total
  const revision: RevisionOC = {
    por: uid, fecha: ahora, total_cotizacion_proveedor: totalCotizacionProveedor,
    ...(salvedad?.trim() ? { salvedad: salvedad.trim() } : {}),
  }
  return {
    estado: 'revisada',
    revision,
    historial: [...oc.historial, {
      de: 'emitida', a: 'revisada', por: uid, fecha: ahora,
      motivo: `Revisada contra la cotización del proveedor (total leído $${totalCotizacionProveedor.toLocaleString('es-CO')}${
        difiere ? ` — DIFIERE del total de la orden $${oc.valor_total.toLocaleString('es-CO')}` : ' — coincide'})${
        salvedad?.trim() ? ` — SALVEDAD: ${salvedad.trim()}` : ''}`,
    }],
    fecha_actualizacion: ahora,
  }
}

/** DEVOLVER (emitida → rechazada). Motivo obligatorio; NO terminal. */
export function patchRechazarOc(
  oc: Pick<OrdenCompra, 'estado' | 'historial'>,
  uid: string,
  motivo: string,
  ahora: Timestamp,
): { estado: 'rechazada'; rechazo: RechazoOC; historial: CambioEstadoOC[]; fecha_actualizacion: Timestamp } | null {
  if (oc.estado !== 'emitida' || !motivo.trim()) return null
  return {
    estado: 'rechazada',
    rechazo: { por: uid, fecha: ahora, motivo: motivo.trim() },
    historial: [...oc.historial, { de: 'emitida', a: 'rechazada', por: uid, fecha: ahora, motivo: `Devuelta al creador — ${motivo.trim()}` }],
    fecha_actualizacion: ahora,
  }
}

/** RE-ENVIAR (rechazada → emitida). Solo el creador (admin escotilla), con
 *  las MISMAS validaciones de emitir; el consecutivo se conserva (la vuelta
 *  no quema número) y el rechazo vigente se limpia — el historial lo cuenta. */
export function patchReenviarOc(
  oc: Pick<OrdenCompra, 'estado' | 'creada_por' | 'historial' | 'lineas' | 'valor_total' | 'cotizacion_proveedor_url' | 'despacho' | 'condiciones'>,
  uid: string,
  ahora: Timestamp,
  esAdmin = false,
): { estado: 'emitida'; rechazo: null; historial: CambioEstadoOC[]; fecha_actualizacion: Timestamp } | null {
  if (oc.estado !== 'rechazada') return null
  if (uid !== oc.creada_por && !esAdmin) return null
  if (Object.keys(validarOcParaEmitir(oc)).length > 0) return null
  return {
    estado: 'emitida',
    rechazo: null,
    historial: [...oc.historial, { de: 'rechazada', a: 'emitida', por: uid, fecha: ahora, motivo: 'Re-enviada a revisión tras la devolución' }],
    fecha_actualizacion: ahora,
  }
}

/** C3 — compra menor registrada directo en el proyecto (sin OC; subcolección
 *  proyectos/{id}/compras_menores). El agregado de la CF la suma igual. */
export interface CompraMenorProyecto {
  id: string
  descripcion: string
  valor: number                      // > 0 (regla + UI)
  proveedor_nombre?: string          // texto libre — sin exigir registro C1
  soporte_url?: string               // Storage proyectos/{id}/** (bloque existente)
  registrada_por: string
  fecha_compra: Timestamp
  fecha_creacion: Timestamp
  fecha_actualizacion?: Timestamp
}
