import { httpsCallable } from 'firebase/functions'
import { functions } from '../../firebase/config'

/**
 * Prefijos válidos para consecutivos del SIGP.
 * Debe mantenerse en sincronía con PREFIJOS_VALIDOS en functions/consecutivos.js.
 */
export type PrefijoConsecutivo = 'SOL' | 'VIS' | 'COT' | 'OFR' | 'PRY' | 'ACT' | 'LIQ' | 'FAC' | 'NC'

interface GenerarConsecutivoRequest {
  prefijo: PrefijoConsecutivo
}

interface GenerarConsecutivoResponse {
  consecutivo: string
}

/**
 * Hook para generar consecutivos transaccionales del SIGP.
 *
 * Invoca la Cloud Function `generarConsecutivo` (2ª gen, us-central1) que
 * garantiza secuencialidad y evita duplicados bajo concurrencia mediante
 * una transacción de Firestore atómica.
 *
 * Formato retornado: PREFIJO-YYYY-NNN (ej: OFR-2026-001, PRY-2026-042).
 *
 * Requiere que el usuario esté autenticado — la función rechaza llamadas
 * sin auth.
 *
 * @example
 * const { obtener } = useConsecutivo()
 * const nuevoNumero = await obtener('OFR')  // "OFR-2026-001"
 */
export function useConsecutivo() {
  async function obtener(prefijo: PrefijoConsecutivo): Promise<string> {
    // El callable se crea aquí (no a nivel de módulo) para evitar efectos
    // secundarios al importar el hook (rompía tests que mockean firebase/config).
    const generarConsecutivoCallable = httpsCallable<
      GenerarConsecutivoRequest,
      GenerarConsecutivoResponse
    >(functions, 'generarConsecutivo')
    const resultado = await generarConsecutivoCallable({ prefijo })
    return resultado.data.consecutivo
  }

  return { obtener }
}
