// §16 (ii) — el proyecto nace SERVER-SIDE (CF crearProyectoAlAprobar): tras
// aprobar/aceptar, el cliente queda a la espera de que la CF escriba el
// enlace inverso (proyecto_id/proyecto_consecutivo) en el doc disparador.
// Este hook lo escucha con onSnapshot para que el chip pase de "creándose…"
// a "Proyecto creado ✓" sin recargar, con un timeout SUAVE por si la CF
// tarda (no es error: el listener sigue vivo y el enlace aparece cuando
// llegue; solo se habilita la escotilla de reintento).
import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/config'

const TIMEOUT_SUAVE_MS = 20_000

export interface NacimientoProyecto {
  proyectoId?: string
  proyectoConsecutivo?: string
  /** true si pasó el timeout suave sin enlace (mostrar escotilla de reintento). */
  tardando: boolean
}

export function useNacimientoProyecto(
  coleccion: 'cotizaciones' | 'solicitudes',
  id: string,
  /** Activo solo mientras se espera el nacimiento (aprobada/aceptada con
   *  snapshot staged y sin proyecto_id). false → sin listener ni timer. */
  esperando: boolean,
): NacimientoProyecto {
  const [enlace, setEnlace] = useState<Pick<NacimientoProyecto, 'proyectoId' | 'proyectoConsecutivo'>>({})
  const [tardando, setTardando] = useState(false)

  useEffect(() => {
    if (!esperando) return
    setTardando(false)
    const timer = setTimeout(() => setTardando(true), TIMEOUT_SUAVE_MS)
    const unsub = onSnapshot(
      doc(db, coleccion, id),
      s => {
        const d = s.data()
        if (d?.proyecto_id) {
          setEnlace({
            proyectoId: d.proyecto_id as string,
            proyectoConsecutivo: (d.proyecto_consecutivo as string | undefined) ?? undefined,
          })
          setTardando(false)
          clearTimeout(timer)
        }
      },
      e => console.error('useNacimientoProyecto: listener falló', e),
    )
    return () => { clearTimeout(timer); unsub() }
  }, [coleccion, id, esperando])

  return { ...enlace, tardando }
}
