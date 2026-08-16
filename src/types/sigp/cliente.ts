// src/types/sigp/cliente.ts
//
// Tipos del dominio Cliente (Fase 1 — Comercial).
// Convención: campos Firestore en snake_case español; tipos TS en PascalCase.

import type { Timestamp } from 'firebase/firestore'
import type { MapeoImportacion } from './importacion'

/** Persona de contacto del cliente. Todos opcionales salvo el nombre. */
export interface Contacto {
  nombre: string
  cargo?: string
  email?: string
  telefono?: string
}

/**
 * Esquema tributario con el que se cotiza a este cliente.
 * - iva_pleno: subtotal + IVA sobre el total.
 * - aiu: Administración + Imprevistos + Utilidad (típico obra civil/servicios);
 *   el IVA aplica solo sobre la U (o sobre A+U según config), no sobre el costo directo.
 */
export interface CondicionesComerciales {
  esquema_impuestos: 'iva_pleno' | 'aiu'
  /** Porcentajes por defecto para AIU (enteros: admin = 10 significa 10%). Solo si esquema = 'aiu'. */
  aiu_defaults?: {
    admin: number
    imprevistos: number
    utilidad: number
  }
}

/** Documento de la colección `clientes`. */
export interface Cliente {
  id: string                 // id del doc Firestore (no se almacena dentro)
  nombre: string
  nit: string
  contactos: Contacto[]
  estado: 'activo' | 'inactivo'   // soft-delete, coherente con contratistas SST
  /** Bloque 2 (22-jul-2026): el cliente clasifica sus contratos por tipo de
   *  inversión (OPEX/CAPEX — contratos tipo Claro). Solo con este flag el
   *  cotizador muestra el selector. Ausente = false. */
  usa_tipo_inversion?: boolean
  /** Ruta B (11-ago-2026, IHS→Vertis): el cliente opera PREVENTIVOS con
   *  precio de matriz (types/sigp/preventivos.ts). Reemplaza el viejo
   *  hardcode por nombre "ihs" del form de solicitudes. Ausente = false;
   *  la semántica es SINGULAR — un solo cliente flaggeado activo a la vez
   *  (la transición de metodología apaga el del antecesor). */
  usa_preventivos?: boolean
  /** Linaje informativo (p. ej. Vertis sucede a IHS tras la compra). Id del
   *  cliente antecesor. SIN UI de edición — se escribe por dato autorizado;
   *  el detalle del cliente lo muestra como chip de solo lectura. */
  sucede_a?: string
  /** C1.1 (14-ago): vocabulario controlado de CONTRATOS del cliente (texto
   *  libre, chips en el CRUD — nada hardcodeado). Vacío/ausente = el cliente
   *  no maneja la dimensión de contrato y ninguna UI cambia. Las LPUs y el
   *  cotizador lo usan como alcance (contrato + naturaleza OPEX/CAPEX). */
  contratos?: string[]
  condiciones_comerciales: CondicionesComerciales
  /** Mapeos de columnas guardados para reutilizar al importar futuras LPU de este cliente. */
  mapeos_lpu_guardados: MapeoImportacion[]
  fecha_creacion: Timestamp
  fecha_actualizacion?: Timestamp
}

/** Cliente que opera preventivos (Ruta B): el primero ACTIVO con el flag,
 *  en el orden del listado (alfabético). Null si ninguno — el form bloquea. */
export function clientePreventivosDe(clientes: Cliente[]): Cliente | null {
  return clientes.find(c => c.usa_preventivos === true && c.estado === 'activo') ?? null
}

export const CLIENTE_ESTADOS = ['activo', 'inactivo'] as const
export const ESQUEMAS_IMPUESTOS = ['iva_pleno', 'aiu'] as const
