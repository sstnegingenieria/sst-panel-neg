# Hooks SIGP

Hooks específicos del SIGP. Se van agregando fase a fase.

Previstos:
- useConsecutivo (F0) - genera consecutivos vía Cloud Function
- useClientes, useLpu (F1)
- useCotizacion, useSolicitud (F1)
- useProyecto (F2)
- useAvance (F3)
- ... (más por fase)

Los hooks reutilizan el patrón de useFirestore.ts existente donde aplica.
