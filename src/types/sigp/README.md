# Tipos TypeScript · SIGP

Un archivo por entidad principal del ERD del SIGP.

Archivos previstos:
- Cliente.ts, LpuCliente.ts
- Solicitud.ts, VisitaTecnica.ts
- Cotizacion.ts (con ItemCotizacion)
- Proyecto.ts, Asignacion.ts, Preliquidacion.ts
- Contratista.ts (extiende el tipo SST)
- AjusteObra.ts, Avance.ts, DocumentoCierre.ts
- Factura.ts, Pago.ts
- NoConformidad.ts, Evaluacion.ts, Satisfaccion.ts

Cada tipo incluye validador Zod cuando aplique validación en formularios.
