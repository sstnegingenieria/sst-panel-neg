// hooks/sigp/useNombresUsuarios.ts
//
// Mapa uid → nombre para pintar el AUTOR de las entradas de historial
// (bloque "la línea de tiempo dice quién", 19-oct-2026). Lee `users` UNA vez
// por sesión de navegación (caché a nivel de módulo: varias fichas o
// componentes montados comparten el mismo fetch) — todo rol que ve proyectos
// es personal de panel y la regla de `users` le da get+list (esPersonalPanel,
// verificado en el módulo Tareas).
//
// BEST-EFFORT deliberado: si la lectura falla (permiso, red), el mapa queda
// vacío y los autores por uid caen a '—' — la ficha jamás se rompe por esto.
import { useState, useEffect } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../../firebase/config'
import type { MapaNombres } from '../../utils/sigp/autoria'

let cache: MapaNombres | null = null
let enVuelo: Promise<MapaNombres> | null = null

async function cargar(): Promise<MapaNombres> {
  if (cache) return cache
  if (!enVuelo) {
    enVuelo = getDocs(collection(db, 'users'))
      .then(snap => {
        const m: MapaNombres = {}
        snap.docs.forEach(d => {
          const nombre = (d.data().nombre as string | undefined)?.trim()
          if (nombre) m[d.id] = nombre
        })
        cache = m
        return m
      })
      .catch(() => {
        enVuelo = null // un fallo no envenena la sesión: el próximo mount reintenta
        return {}
      })
  }
  return enVuelo
}

export function useNombresUsuarios(): MapaNombres {
  const [nombres, setNombres] = useState<MapaNombres>(cache ?? {})
  useEffect(() => {
    let vivo = true
    cargar().then(m => { if (vivo) setNombres(m) })
    return () => { vivo = false }
  }, [])
  return nombres
}
