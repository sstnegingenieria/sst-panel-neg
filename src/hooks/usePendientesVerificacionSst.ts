// Badge VIVO de la cola de Verificación SST (07-sep — hallazgo Tesoro III:
// 7 proyectos esperaron 6 semanas sin que nadie se enterara; la cola del 3a
// nació sin señal y un módulo sin señal no se opera — lección de Compras).
// Patrón usePendientesSigp: onSnapshot acotado — SOLO suscribe cuando el
// caller pasa `activo` (veVerificacionSstUI), así quien no puede leer la
// proyección no genera NI UNA lectura (la regla además lo denegaría).
import { useState, useEffect } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../firebase/config'
import { pendientesVerificacionDe } from '../types/sigp/proyecto'
import type { EstadoProyecto, SstGateProyecto } from '../types/sigp/proyecto'

export function usePendientesVerificacionSst(activo: boolean) {
  const [pendientes, setPendientes] = useState(0)

  useEffect(() => {
    if (!activo) return
    // Colección chica (una por proyecto en tramo administrativo) — filtro
    // client-side con el helper puro, sin índices nuevos.
    const unsub = onSnapshot(
      collection(db, 'verificaciones_sst'),
      snap => setPendientes(pendientesVerificacionDe(
        snap.docs.map(d => d.data() as { estado: EstadoProyecto; sst_gate?: SstGateProyecto }))),
      () => setPendientes(0),
    )
    return () => unsub()
  }, [activo])

  return pendientes
}
