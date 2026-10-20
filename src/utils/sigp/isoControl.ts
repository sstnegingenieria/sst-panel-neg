// Control documental ISO de los PDFs del SIGP (Listado Maestro del SGI).
// Cada formato registra área, código, versión, fecha de modificación y
// nombre oficial — lo que pinta el cuadro ISO de la página 1 y el
// encabezado corrido de páginas 2+.
// NOTA: el de cotización (CM-FT-CT-19) sigue como literal local en
// cotizacionPdf.ts — se migrará aquí en tarea aparte para no arriesgar
// ese PDF (decisión de Giovanny, 02-ago).
// PENDIENTE FUERA DEL REPO (frente Trinorma, anotado 18-ago SIN resolver —
// instrucción de Giovanny): la PROPUESTA ECONÓMICA de actividades (F1.2)
// sale con el código ISO CM-FT-CT-19 (formato de cotización del Listado
// Maestro) pero numerada PEA- en vez de COT-. Reutilizar el formato es
// defendible (la propuesta es una cotización en sustancia) y evita crear un
// formato nuevo, pero un documento con ese código y otra serie de numeración
// lo tiene que RATIFICAR la dueña de proceso (Ingrid, GI). No decidirlo acá.
//
// ═══ ESQUEMA DE CODIFICACIÓN DEL LISTADO MAESTRO (Ingrid Laverde, GI —
// ratificación del 18-ago-2026, incorporada 24-sep-2026) ═══
// El PREFIJO del código es el ÁREA DUEÑA del formato: CM comercial,
// DO proyectos, DC el de órdenes de compra. "SGI-" NO es un prefijo de
// área — los códigos SGI-FT-* que este archivo llevó entre ago y sep-2026
// eran inventados y no existen en el Listado Maestro. Cualquier código
// futuro LO ASIGNA Gestión Integral; no se inventa desde el panel.
// HECHO REGISTRADO (no corregible retroactivamente): los PDFs de
// preliquidación y liquidación emitidos entre ago-2026 y el 24-sep-2026
// llevan los códigos inexistentes — se generan y descargan, no se
// almacenan, así que no hay corrección posible sobre los ya emitidos.
// FUTURO — informe de visita técnica: NO crear código nuevo; ya existe
// como DO-FT-RV-23 versión 3 del 16/10/2024 (cuando se construya ese
// módulo, usa el formato existente).
export interface ControlDocumentalIso {
  /** Etiqueta del sistema de gestión sobre el cuadro (p. ej. "SG-SST"); opcional:
   *  los demás formatos no la llevan. */
  sistema?: string
  area: string
  codigo: string
  version: string
  modificado: string
  nombre: string
}

// Código RATIFICADO por Ingrid (GI) el 18-ago-2026: CM-FT-PL-26 · Versión 1
// · 18/08/2026 (reemplaza al inventado SGI-FT-PRL-26 — ver hecho registrado
// arriba). El `area` mostrada en el cuadro sigue siendo la validada
// visualmente en el PR #62; si el Listado Maestro registra otra, el ajuste
// es esta línea.
export const PRELIQUIDACION: ControlDocumentalIso = {
  area: 'GESTIÓN DE PROYECTOS',
  codigo: 'CM-FT-PL-26',
  version: '01',
  modificado: '18/08/2026',
  nombre: 'PRELIQUIDACIÓN DEL CONTRATISTA',
}

// Código RATIFICADO por Ingrid (GI) el 18-ago-2026: CM-FT-LQ-26 · Versión 1
// · 18/08/2026 (reemplaza al inventado SGI-FT-LIQ-26).
export const LIQUIDACION: ControlDocumentalIso = {
  area: 'GESTIÓN ADMINISTRATIVA',
  codigo: 'CM-FT-LQ-26',
  version: '01',
  modificado: '18/08/2026',
  nombre: 'LIQUIDACIÓN DEL CONTRATISTA',
}

// OC1 — orden de compra. Código CORREGIDO a DC-FT-OC-19 por ratificación
// VERBAL de Ingrid (GI, 24-sep-2026): el formato FÍSICO del SGI trae
// impreso "DC-FT-OC-00-19" y de ahí lo leímos — la discrepancia venía del
// papel, no del panel (si un PDF nuevo difiere de uno viejo en el código,
// esta es la razón). Versión y fecha siguen como PROPUESTA 05/AGO-2026,
// pendientes de que Ingrid las registre en el Listado Maestro (frente
// Trinorma; la 04-2025 NO se reutiliza). Parametrizado aquí para que el
// ajuste post-registro sea una línea.
export const ORDEN_COMPRA: ControlDocumentalIso = {
  area: 'GESTIÓN DE PROYECTOS',
  codigo: 'DC-FT-OC-19',
  version: '05',
  modificado: 'AGO-2026',
  nombre: 'ORDEN DE COMPRA Y/O SERVICIO',
}

// ── Acta de entrega de EPP (módulo Actas EPP) ──
// Código REAL del documento oficial, confirmado por Ingrid (GI, 19-oct-2026):
// SST-FT-AEP-18 · versión 02 · modificado 06 FEB 2024 · área de Gestión Humana
// y H.S.E.Q. Encabezado en PANTALLA/impresión del acta (EncabezadoIso).
export const ACTA_ENTREGA_EPP: ControlDocumentalIso = {
  sistema: 'SG-SST',
  area: 'ÁREA DE GESTIÓN HUMANA Y H.S.E.Q',
  codigo: 'SST-FT-AEP-18',
  version: '02',
  modificado: '06 FEB 2024',
  nombre: 'FORMATO DE ACTA DE ENTREGA DE EPP',
}

// ── Matriz de Acciones Correctivas y Preventivas (módulo AC/AP, F1) ──
// Código REAL de la matriz oficial del SGI (SGI-MT-ACP-26 — dato dado por
// Gestión Integral, no inventado desde el panel). Versión 01, modificada el
// 14 de abril de 2025. Es el encabezado en PANTALLA del detalle de la acción
// (componente EncabezadoIso); no hay PDF de este formato todavía.
export const ACCION_MEJORA: ControlDocumentalIso = {
  area: 'SISTEMA DE GESTIÓN INTEGRAL',
  codigo: 'SGI-MT-ACP-26',
  version: '01',
  modificado: '14/04/2025',
  nombre: 'MATRIZ DE ACCIONES CORRECTIVAS Y PREVENTIVAS',
}
