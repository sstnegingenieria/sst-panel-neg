// src/types/sigp/catalogo.ts
//
// Catálogo NEG de ítems propios (colección `catalogo_items`) — Fase 1.4-B.
// Acumula los ítems que NEG cotiza por fuera de las LPU de los clientes.
// Código CAT-NNNN: contador transaccional propio SIN año (el catálogo es
// acumulativo, no anual) — lo genera la Cloud Function `generarConsecutivo`
// (caso especial CAT, padding 4). Convención: campos snake_case en español.

import type { Timestamp } from 'firebase/firestore'
import type { APU } from './cotizacion'

/** Mantenimiento de precios (#2b): entrada APPEND-ONLY del historial. Guarda
 *  SOLO el valor que quedó vigente (el anterior se infiere del elemento
 *  previo — sin redundancia que pueda divergir). El PRIMER elemento se
 *  siembra al crear el ítem desde el cotizador — todo precio con origen
 *  trazable (filosofía cap. 2). */
export interface EntradaHistorialPrecio {
  valor_unitario: number     // precio que quedó vigente desde esta fecha
  vigente_desde: Timestamp
  actualizado_por: string    // uid
  motivo: string             // obligatorio en correcciones/ajustes; el alta trae el COT de origen
}

export interface CatalogoItem {
  id: string
  codigo: string             // CAT-0001, CAT-0002…
  descripcion: string
  unidad: string

  // Análisis económico interno (opcional — jamás se pinta en PDFs):
  costo_directo?: number     // costo interno unitario
  margen?: number            // % utilidad sobre el precio, rango [0, 100)

  valor_unitario: number     // precio NEG vigente (lectura rápida; = último del historial)
  /** #2b — opcional: ítems creados antes del mantenimiento no lo traen
   *  ("ítem anterior a esta función"); su primera corrección lo inaugura. */
  historial_precios?: EntradaHistorialPrecio[]
  apu?: APU                  // snapshot embebido si el ítem nació de un APU

  creado_por: string         // uid
  fecha_creacion: Timestamp
  estado: 'activo' | 'inactivo'   // soft delete (cero borrado físico)
}

export const CATALOGO_ESTADOS = ['activo', 'inactivo'] as const
