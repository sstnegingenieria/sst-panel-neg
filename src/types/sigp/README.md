# Tipos TypeScript · SIGP

Un archivo por entidad principal del ERD del SIGP.

## Implementados

- `roles.ts` — tipos de roles del sistema: `RolSST` (heredados del panel SST),
  `RolSIGP` (los 8 nuevos del SIGP), su unión `Rol`, y el helper
  `ROLES_PANEL_WEB` (roles con acceso al panel web). Se agregó en F0 (Iteración 0.4).

## Previstos

Un archivo por entidad principal del ERD:

- Cliente.ts, LpuCliente.ts
- Solicitud.ts, VisitaTecnica.ts
- Cotizacion.ts (con ItemCotizacion)
- Proyecto.ts, Asignacion.ts, Preliquidacion.ts
- Contratista.ts (extiende el tipo SST)
- AjusteObra.ts, Avance.ts, DocumentoCierre.ts
- Factura.ts, Pago.ts
- NoConformidad.ts, Evaluacion.ts, Satisfaccion.ts

Cada tipo incluye validador Zod cuando aplique validación en formularios.
