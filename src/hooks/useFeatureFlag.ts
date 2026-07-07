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
 * En desarrollo (`import.meta.env.DEV`) se puede forzar el valor de un flag sin
 * tocar Remote Config definiendo `VITE_FF_<nombre>` en `.env.local` (gitignored).
 * Ej: `VITE_FF_sigp_f1_enabled=true` habilita el módulo SIGP solo en local. En
 * build de producción `import.meta.env.DEV` es `false`, así que el override es
 * inerte y nunca afecta a los usuarios.
 *
 * @param nombre - Nombre del parámetro en Remote Config (ej: 'sigp_f1_enabled')
 * @param defaultValue - Valor por defecto si falla la lectura (default: false)
 * @returns El valor booleano del flag
 */
function overrideLocal(nombre: string): boolean | undefined {
  if (!import.meta.env.DEV) return undefined
  const raw = import.meta.env[`VITE_FF_${nombre}`]
  if (raw === undefined) return undefined
  return raw === 'true' || raw === '1'
}

export function useFeatureFlag(nombre: string, defaultValue = false): boolean {
  const [valor, setValor] = useState<boolean>(() => overrideLocal(nombre) ?? defaultValue)

  useEffect(() => {
    let cancelado = false

    // Override de desarrollo: cortocircuita Remote Config (ver doc del hook).
    const forzado = overrideLocal(nombre)
    if (forzado !== undefined) {
      setValor(forzado)
      return
    }

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
