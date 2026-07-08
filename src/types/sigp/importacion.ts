// src/types/sigp/importacion.ts
//
// Tipos del mapeo de importación de LPU — Fase 1 — Comercial.
// Se embeben en el Cliente (`mapeos_lpu_guardados`) para reutilizarlos en
// futuras importaciones, y son la config que construye/consume el wizard (1.1.c).

import type { Timestamp } from 'firebase/firestore'

/**
 * Mapeo de columnas de UNA hoja del Excel a los campos del ItemLPU.
 * Los valores son índices de columna (0-based). `null` = columna ausente.
 */
export interface MapeoColumnas {
  codigo: number | null
  descripcion: number        // obligatoria
  unidad: number | null
  valor_unitario: number     // obligatoria
  capitulo?: number | null   // solo si el capítulo viene en una columna propia
}

/** Configuración de importación de UNA hoja del libro de Excel. */
export interface MapeoHoja {
  nombre_hoja: string
  /** Si esta hoja es una lista de precios (las que no lo son se descartan). */
  es_lpu: boolean
  /** Índice (0-based) de la fila de encabezados detectada/confirmada. */
  fila_encabezado: number
  /** Etiqueta de categoría para los ítems de esta hoja (default = nombre_hoja). */
  categoria: string
  columnas: MapeoColumnas
  /**
   * Cómo se obtiene el `capitulo` del ítem:
   * - 'columna': viene en la columna indicada en `columnas.capitulo`.
   * - 'filas_sin_precio': las filas sin valor_unitario son títulos de capítulo
   *   y aplican a los ítems siguientes hasta el próximo título. (Caso Ingemec y Claro.)
   * - 'ninguno': la hoja no maneja capítulos.
   */
  origen_capitulo: 'columna' | 'filas_sin_precio' | 'ninguno'
}

/**
 * Mapeo completo de una importación. Se guarda embebido en el Cliente
 * (`mapeos_lpu_guardados`) para reutilizarlo en futuras importaciones del mismo
 * cliente, y es la config que el wizard (1.1.c) construye y consume.
 */
export interface MapeoImportacion {
  nombre: string             // etiqueta del mapeo, ej: "Formato Ingemec"
  hojas: MapeoHoja[]
  fecha_guardado: Timestamp
}
