import { useEffect, useState } from 'react'
import { getRemoteConfig, fetchAndActivate, getValue } from 'firebase/remote-config'
import { app } from '../firebase/config'

/**
 * Hook para leer feature flags desde Firebase Remote Config.
 *
 * Los parámetros deben estar creados y publicados en la consola de
 * Firebase antes de ser leídos. En caso de error de red o parámetro
 * inexistente, retorna el defaultValue.
 *
 * @param nombre - Nombre del parámetro en Remote Config (ej: 'sigp_f1_enabled')
 * @param defaultValue - Valor por defecto si falla la lectura (default: false)
 * @returns El valor booleano del flag
 */
export function useFeatureFlag(nombre: string, defaultValue = false): boolean {
  const [valor, setValor] = useState<boolean>(defaultValue)

  useEffect(() => {
    let cancelado = false

    async function cargar() {
      try {
        const remoteConfig = getRemoteConfig(app)
        // En dev: refresca cada 60s. En prod: cada 12h (default de Firebase).
        remoteConfig.settings.minimumFetchIntervalMillis =
          import.meta.env.DEV ? 60_000 : 43_200_000
        await fetchAndActivate(remoteConfig)
        if (!cancelado) {
          setValor(getValue(remoteConfig, nombre).asBoolean())
        }
      } catch (err) {
        console.warn(`useFeatureFlag: no se pudo leer '${nombre}', usando default ${defaultValue}`, err)
        if (!cancelado) {
          setValor(defaultValue)
        }
      }
    }

    cargar()
    return () => { cancelado = true }
  }, [nombre, defaultValue])

  return valor
}
