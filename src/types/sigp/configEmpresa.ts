// src/types/sigp/configEmpresa.ts
//
// OC1 — Datos institucionales de NEG para documentos que salen a terceros
// (bloque RADICACIÓN y pie del PDF de orden de compra). Viven en Firestore
// —doc `configuracion/empresa`, precedente configuracion/indicadores— y se
// editan desde el panel: NO son constantes de código, porque cambian por
// decisión administrativa (contacto de radicación, dirección) sin deploy.
// Regla: match genérico configuracion/{docId} — read accesoSIGP(), write
// gerencia_general + admin (verificado: cabe SIN cambio de reglas).
// Convención: campos Firestore en snake_case español.

import type { Timestamp } from 'firebase/firestore'

export const CONFIG_EMPRESA_DOC = 'empresa' // en la colección `configuracion`

export interface ConfigEmpresa {
  /** Razón social para "Facturar a nombre de" (ej. NEG INGENIERÍA S.A.S., BIC). */
  razon_social: string
  nit: string
  /** Contacto de radicación de facturas (ej. MARCELA MONTOYA). */
  contacto_radicacion: string
  /** Móvil del contacto de radicación. */
  movil_radicacion: string
  /** Dirección de entrega de la factura (hoy: correo de facturación). */
  direccion_factura: string
  ciudad: string
  /** Pie institucional del documento (dirección física, correo, web, ciudad). */
  pie_direccion: string
  pie_correo: string
  pie_web: string
  pie_ciudad: string
  actualizado_por?: string
  fecha_actualizacion?: Timestamp
}

/** Campos obligatorios para que el PDF pinte el bloque RADICACIÓN completo.
 *  Devuelve la lista de claves faltantes; vacía = config completa. */
export function faltantesConfigEmpresa(c: Partial<ConfigEmpresa> | null | undefined): string[] {
  const requeridos: (keyof ConfigEmpresa)[] = [
    'razon_social', 'nit', 'contacto_radicacion', 'movil_radicacion',
    'direccion_factura', 'ciudad',
  ]
  if (!c) return requeridos as string[]
  return requeridos.filter((k) => !String(c[k] ?? '').trim())
}
