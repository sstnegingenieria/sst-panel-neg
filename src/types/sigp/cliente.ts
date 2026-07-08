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
  condiciones_comerciales: CondicionesComerciales
  /** Mapeos de columnas guardados para reutilizar al importar futuras LPU de este cliente. */
  mapeos_lpu_guardados: MapeoImportacion[]
  fecha_creacion: Timestamp
  fecha_actualizacion?: Timestamp
}

export const CLIENTE_ESTADOS = ['activo', 'inactivo'] as const
export const ESQUEMAS_IMPUESTOS = ['iva_pleno', 'aiu'] as const
