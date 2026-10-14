import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useEmpleadosDirectos } from './useEmpleadosDirectos'
import { puedeGestionarEmpleadosUI } from '../types/sigp/permisos'
import { SUGERENCIA_DENOMINADOR } from '../utils/indicadorSugerencias'

/**
 * Conteo sugerido para el denominador de un indicador manual (hoy solo
 * SST-IND-06). Devuelve null si el indicador no tiene sugerencia, si el rol no
 * puede leer el maestro (ej. sst) o si la lectura falla: en todos esos casos
 * el campo queda como entrada manual, sin romper nada.
 */
export function useSugerenciaDenominador(codigo: string, habilitado: boolean): number | null {
  const { user } = useAuth()
  const { contarActivos } = useEmpleadosDirectos()
  const [conteo, setConteo] = useState<number | null>(null)

  const aplica = habilitado && !!SUGERENCIA_DENOMINADOR[codigo] && puedeGestionarEmpleadosUI(user?.rol)

  useEffect(() => {
    let vivo = true
    if (!aplica) {
      setConteo(null)
      return
    }
    contarActivos()
      .then(n => { if (vivo) setConteo(n) })
      .catch(() => { if (vivo) setConteo(null) })
    return () => { vivo = false }
    // contarActivos es estable (useCallback sin deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aplica, codigo])

  return conteo
}
