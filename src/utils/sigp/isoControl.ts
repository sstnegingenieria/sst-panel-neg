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
// PENDIENTE FUERA DEL REPO: ratificación de SGI-FT-PRL-26 por Ingrid (GI)
// y registro en el Listado Maestro (frente Trinorma).
export interface ControlDocumentalIso {
  area: string
  codigo: string
  version: string
  modificado: string
  nombre: string
}

export const PRELIQUIDACION: ControlDocumentalIso = {
  area: 'GESTIÓN DE PROYECTOS',
  codigo: 'SGI-FT-PRL-26',
  version: '01',
  modificado: 'AGO-2026',
  nombre: 'PRELIQUIDACIÓN DEL CONTRATISTA',
}

// PENDIENTE FUERA DEL REPO: ratificación de SGI-FT-LIQ-26 por Ingrid (GI)
// y registro en el Listado Maestro (frente Trinorma) — igual que el PRL.
export const LIQUIDACION: ControlDocumentalIso = {
  area: 'GESTIÓN ADMINISTRATIVA',
  codigo: 'SGI-FT-LIQ-26',
  version: '01',
  modificado: 'AGO-2026',
  nombre: 'LIQUIDACIÓN DEL CONTRATISTA',
}
