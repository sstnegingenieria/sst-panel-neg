// src/types/sigp/catalogo.ts
//
// Catálogo NEG de ítems propios (colección `catalogo_items`) — Fase 1.4-B.
// Acumula los ítems que NEG cotiza por fuera de las LPU de los clientes.
// Código CAT-NNNN: contador transaccional propio SIN año (el catálogo es
// acumulativo, no anual) — lo genera la Cloud Function `generarConsecutivo`
// (caso especial CAT, padding 4). Convención: campos snake_case en español.

import type { Timestamp } from 'firebase/firestore'
import type { APU } from './cotizacion'

export interface CatalogoItem {
  id: string
  codigo: string             // CAT-0001, CAT-0002…
  descripcion: string
  unidad: string

  // Análisis económico interno (opcional — jamás se pinta en PDFs):
  costo_directo?: number     // costo interno unitario
  margen?: number            // % utilidad sobre el precio, rango [0, 100)

  valor_unitario: number     // precio NEG vigente
  apu?: APU                  // snapshot embebido si el ítem nació de un APU

  creado_por: string         // uid
  fecha_creacion: Timestamp
  estado: 'activo' | 'inactivo'   // soft delete (cero borrado físico)
}

export const CATALOGO_ESTADOS = ['activo', 'inactivo'] as const
