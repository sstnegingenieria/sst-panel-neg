# Hooks SIGP

Hooks específicos del SIGP. Se van agregando fase a fase.

## Implementados

- **useConsecutivo (F0)** — genera consecutivos transaccionales vía la
  Cloud Function `generarConsecutivo`. Prefijos: SOL, OFR, PRY, ACT, LIQ,
  FAC, NC. Ver `functions/consecutivos.js`.

## Previstos

- useClientes, useLpu (F1)
- useCotizacion, useSolicitud (F1)
- useProyecto (F2)
- useAvance (F3)
- ... (más por fase)

Los hooks reutilizan el patrón de useFirestore.ts existente donde aplica.
