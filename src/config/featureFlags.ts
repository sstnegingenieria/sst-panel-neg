/**
 * Feature flags del panel.
 *
 * Actualmente los flags son constantes hardcodeadas para F0. En la
 * Iteración 0.5 de F0 se reemplaza por un hook useFeatureFlag() que
 * lee de Firebase Remote Config, permitiendo activarlos sin desplegar.
 *
 * ⚠️ Al llegar a 0.5, buscar todos los usos de SIGP_ENABLED y
 * reemplazar por: const enabled = useFeatureFlag('sigp_f1_enabled')
 */

export const SIGP_ENABLED = false as const
