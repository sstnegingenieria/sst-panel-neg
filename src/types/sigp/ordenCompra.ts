// src/types/sigp/ordenCompra.ts
//
// Módulo Compras · C2 — Órdenes de compra. Documento de EJECUCIÓN (costo
// operativo: jamás venta/utilidad). La crea un operativo con la cotización
// del proveedor adjunta y la aprueba GP/GG (aprobador ≠ creador, con
// salvedad como escape). La compra de Marcela + auto-agregado es C3.
// Convención: campos Firestore en snake_case español.

import type { Timestamp } from 'firebase/firestore'

// ── Enums de dominio ──────────────────────────────────────────────────────────

export type EstadoOrdenCompra = 'borrador' | 'emitida' | 'aprobada' | 'anulada'

// ── Sub-tipos embebidos ───────────────────────────────────────────────────────

export interface LineaOrdenCompra {
  descripcion: string
  cantidad: number
  valor_unitario: number
  valor: number                      // = valorLineaDe(cantidad, valor_unitario)
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
 *  jamás se toca proveedores/{id}/privado desde aquí). */
export interface ProveedorSnapshotOC {
  identificacion: string
  razon_social: string
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
  valor_total: number                // = totalDe(lineas) — validado en UI y helper
  /** '' en borrador; REQUERIDA al emitir (UI + regla). Storage:
   *  ordenes_compra/{id}/cotizacion/{uuid} (patrón C1, H-008). */
  cotizacion_proveedor_url: string
  estado: EstadoOrdenCompra
  creada_por: string
  aprobada_por?: string
  /** Escape del blindaje aprobador ≠ creador: si quien aprueba es quien
   *  creó (p. ej. GG crea y GG aprueba), la salvedad es OBLIGATORIA. */
  salvedad_aprobacion?: string
  fecha_aprobacion?: Timestamp
  historial: CambioEstadoOC[]
  fecha_creacion: Timestamp
  fecha_actualizacion?: Timestamp
}

// ── Constantes ────────────────────────────────────────────────────────────────

export const ESTADOS_OC = ['borrador', 'emitida', 'aprobada', 'anulada'] as const

export const ESTADO_OC_LABEL: Record<EstadoOrdenCompra, string> = {
  borrador: 'Borrador',
  emitida: 'Emitida',
  aprobada: 'Aprobada',
  anulada: 'Anulada',
}

export const ESTADO_OC_COLOR: Record<EstadoOrdenCompra, string> = {
  borrador: 'bg-gray-100 text-gray-600',
  emitida:  'bg-amber-100 text-amber-800',
  aprobada: 'bg-emerald-100 text-emerald-800',
  anulada:  'bg-rose-100 text-rose-800',
}

/**
 * Máquina de estados. `aprobada` es INMUTABLE salvo anulación (y solo por
 * un rol aprobador — eso lo impone la regla, no esta tabla). `anulada` es
 * terminal (soft — sin delete, restricción 5.1).
 */
export const TRANSICIONES_OC: Record<EstadoOrdenCompra, EstadoOrdenCompra[]> = {
  borrador: ['emitida', 'anulada'],
  emitida:  ['aprobada', 'anulada'],
  aprobada: ['anulada'],
  anulada:  [],
}

// ── Helpers puros (testeables) ────────────────────────────────────────────────

/** Valor de una línea, redondeado a peso (consistente con calcularTotales). */
export const valorLineaDe = (cantidad: number, valorUnitario: number): number =>
  Math.round((cantidad || 0) * (valorUnitario || 0))

/** Total de la OC = Σ valor de las líneas. */
export const totalDe = (lineas: Pick<LineaOrdenCompra, 'valor'>[]): number =>
  lineas.reduce((s, l) => s + (l.valor || 0), 0)

/** Validación dura para EMITIR (la de borrador es laxa: se guarda a medias).
 *  Devuelve mapa de errores; vacío = lista para emitir. */
export function validarOcParaEmitir(oc: {
  lineas: LineaOrdenCompra[]
  valor_total: number
  cotizacion_proveedor_url: string
}): Record<string, string> {
  const e: Record<string, string> = {}
  if (!oc.lineas.length) e.lineas = 'La orden necesita al menos una línea'
  oc.lineas.forEach((l, i) => {
    if (!l.descripcion.trim()) e[`linea_${i}_descripcion`] = 'Descripción obligatoria'
    if (!(l.cantidad > 0)) e[`linea_${i}_cantidad`] = 'Cantidad > 0'
    if (!(l.valor_unitario > 0)) e[`linea_${i}_valor`] = 'Valor unitario > 0'
  })
  if (oc.lineas.length && oc.valor_total !== totalDe(oc.lineas))
    e.valor_total = 'El total no coincide con la suma de las líneas'
  if (!oc.cotizacion_proveedor_url)
    e.cotizacion = 'La cotización del proveedor es obligatoria para emitir'
  return e
}

/** ¿La aprobación exige salvedad? (aprobador == creador — escape con traza). */
export const requiereSalvedadAprobacion = (uidAprobador: string, creadaPor: string): boolean =>
  uidAprobador === creadaPor
