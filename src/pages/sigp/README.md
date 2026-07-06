# Páginas SIGP

Páginas principales del módulo SIGP. Todas bajo la ruta /sigp/*.

## Implementadas (placeholders — F0)

- `PanelSigp.tsx` → /sigp/panel — dashboard general del SIGP (Fase 5)
- `ClientesSigp.tsx` → /sigp/clientes — CRUD clientes + LPU (Fase 1)
- `SolicitudesSigp.tsx` → /sigp/solicitudes — solicitudes de cotización (Fase 1)
- `CotizacionesSigp.tsx` → /sigp/cotizaciones — cotizaciones OFR (Fase 1)

Todas están protegidas por `ProtectedRoute` con los roles apropiados.
El feature flag `sigp_f1_enabled` (Firebase Remote Config, vía el hook
`useFeatureFlag`) controla la visibilidad de la sección SIGP en el Sidebar;
las rutas responden si se accede por URL directa (siempre que el rol lo permita).

## Previstas

Al llegar a cada fase, los placeholders se reemplazan por implementaciones
reales. Ver planes de fase en docs/sigp/.
